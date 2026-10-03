import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  flattenWhatsappTemplateBody,
  maskPhoneForLog,
  normalizeParentPhoneE164,
  sendParentMobileMessage,
} from "./portal_parent_messaging.ts";

export const ONBOARDING_PIN_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WEAK_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "4321",
  "0123",
  "2580",
  "0852",
  "1212",
  "1122",
]);

const STAFF_ROLE_CHECK_TO_DISPLAY: Record<string, string> = {
  support: "Support Worker",
  swimming: "Swimming Instructor",
  fitness: "Fitness Instructor",
  climbing: "Climbing Instructor",
  manager: "Manager",
  admin: "Administrator",
};

export type OnboardingPinChecks = {
  job_submitted: boolean;
  health_submitted: boolean;
  photo: boolean;
  passport: boolean;
  checklist: boolean;
};

export type OnboardingDocCounts = {
  passport: number;
  checklist: number;
};

export function staffAppOrigin(): string {
  const fromEnv = (
    Deno.env.get("PORTAL_STAFF_ONBOARDING_ORIGIN") ||
    Deno.env.get("CLUBSENSATIONAL_STAFF_ORIGIN") ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return "https://clubsensational-staff.vercel.app";
}

export function staffRolePinLabel(raw: string): string {
  const slug = String(raw || "").trim().toLowerCase();
  return STAFF_ROLE_CHECK_TO_DISPLAY[slug] || String(raw || "").trim() || "Support Worker";
}

export function missingOnboardingPinChecks(c: OnboardingPinChecks): string[] {
  const missing: string[] = [];
  if (!c.job_submitted) missing.push("Job application not submitted");
  if (!c.health_submitted) missing.push("Health questionnaire not submitted");
  if (!c.photo) missing.push("Portal photo missing");
  if (!c.passport) missing.push("Passport / ID not uploaded");
  if (!c.checklist) missing.push("Starter checklist not uploaded");
  return missing;
}

/** Short labels for WhatsApp chase copy. */
export function missingOnboardingItemsForStaff(c: OnboardingPinChecks): string[] {
  const missing: string[] = [];
  if (!c.job_submitted) missing.push("job application");
  if (!c.health_submitted) missing.push("health questionnaire");
  if (!c.photo) missing.push("portal photo");
  if (!c.passport) missing.push("passport / ID");
  if (!c.checklist) missing.push("starter checklist");
  return missing;
}

export function onboardingHubUrl(): string {
  return `${staffAppOrigin()}/onboarding_portal.html`;
}

export function phoneFromOnboardingJobPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  const nested =
    rec.personal && typeof rec.personal === "object"
      ? (rec.personal as Record<string, unknown>)
      : null;
  const raw =
    rec.phone ??
    rec.mobile ??
    rec.telephone ??
    rec.tel ??
    rec.phone_number ??
    nested?.phone ??
    nested?.mobile ??
    nested?.telephone;
  return normalizeParentPhoneE164(String(raw || ""));
}

/** Copy job-application mobile onto staff_profiles.phone_e164 (Comms / Staff messages). */
export async function ensureStaffPhoneFromJob(
  portalAdmin: SupabaseClient,
  userId: string,
  opts?: { payload?: unknown; currentPhone?: string | null },
): Promise<string | null> {
  const id = String(userId || "").trim();
  if (!id) return null;
  const existing = normalizeParentPhoneE164(String(opts?.currentPhone || ""));
  let fromJob = phoneFromOnboardingJobPayload(opts?.payload);
  if (!fromJob) {
    try {
      const { data } = await portalAdmin
        .from("onboarding_applicant_drafts")
        .select("payload")
        .eq("applicant_session_id", id)
        .eq("form_type", "job")
        .maybeSingle();
      fromJob = phoneFromOnboardingJobPayload(data?.payload);
    } catch {
      fromJob = null;
    }
  }
  const next = fromJob || existing;
  if (!next) return existing;
  const currentRaw = String(opts?.currentPhone || "").trim();
  if (existing === next && currentRaw.startsWith("+")) return existing;
  const { error } = await portalAdmin
    .from("staff_profiles")
    .update({ phone_e164: next })
    .eq("id", id);
  if (error) {
    console.error("[ensureStaffPhoneFromJob]", id, error.message);
  }
  return next;
}

export async function syncStaffPhonesFromJobDrafts(
  portalAdmin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = userIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (!ids.length) return out;
  const { data: profiles } = await portalAdmin
    .from("staff_profiles")
    .select("id, phone_e164")
    .in("id", ids);
  const currentById = new Map<string, string>();
  for (const row of profiles ?? []) {
    const id = String(row.id || "");
    if (!id) continue;
    currentById.set(id, String(row.phone_e164 || ""));
  }
  const needJob = ids.filter((id) => !normalizeParentPhoneE164(currentById.get(id) || ""));
  const payloadById = new Map<string, unknown>();
  if (needJob.length) {
    const { data: drafts } = await portalAdmin
      .from("onboarding_applicant_drafts")
      .select("applicant_session_id, payload")
      .eq("form_type", "job")
      .in("applicant_session_id", needJob);
    for (const row of drafts ?? []) {
      payloadById.set(String(row.applicant_session_id || ""), row.payload);
    }
  }
  for (const id of ids) {
    const phone = await ensureStaffPhoneFromJob(portalAdmin, id, {
      payload: payloadById.has(id) ? payloadById.get(id) : undefined,
      currentPhone: currentById.get(id) || "",
    });
    if (phone) out.set(id, phone);
  }
  return out;
}

function isDisplayStaffPhotoUrl(url: string): boolean {
  return /\/display\./i.test(String(url || ""));
}

/** Original hire photo for the office. Does not replace a published display photo. */
export async function ensureStaffProfilePhoto(
  portalAdmin: SupabaseClient,
  userId: string,
  currentUrl?: string | null,
): Promise<string> {
  const id = String(userId || "").trim();
  const existing = String(currentUrl || "").trim();
  if (!id) return "";
  if (existing && !isDisplayStaffPhotoUrl(existing)) return existing;
  let url = "";
  try {
    const { data } = await portalAdmin.auth.admin.getUserById(id);
    const meta = data?.user?.user_metadata || {};
    url = String(meta.avatar_original_url || "").trim();
    if (!url) url = String(meta.avatar_url || "").trim();
    if (isDisplayStaffPhotoUrl(url)) url = "";
  } catch {
    url = "";
  }
  if (!url) {
    try {
      const { data: files } = await portalAdmin.storage.from("staff-avatars").list(id, {
        limit: 20,
      });
      const names = (files || [])
        .map((f) => String(f?.name || ""))
        .filter((name) => name && !name.startsWith(".") && !/^display\./i.test(name));
      const pick = names.find((name) => /^original\./i.test(name)) ||
        names.find((name) => /^avatar\./i.test(name)) ||
        names[0] ||
        "";
      if (pick) {
        const { data: pub } = portalAdmin.storage
          .from("staff-avatars")
          .getPublicUrl(`${id}/${pick}`);
        url = String(pub?.publicUrl || "").trim();
      }
    } catch {
      url = "";
    }
  }
  if (!url || isDisplayStaffPhotoUrl(url)) return "";
  try {
    await portalAdmin.from("staff_profiles").update({ avatar_original_url: url }).eq("id", id);
  } catch {
    /* PIN/admin can still treat the original as present */
  }
  return url;
}

export type StaffOnboardingWhatsappReason =
  | "onboarding_pin_issued"
  | "onboarding_chase";

export async function recentlySentStaffOnboardingWhatsapp(
  portalAdmin: SupabaseClient,
  staffProfileId: string,
  reason: StaffOnboardingWhatsappReason,
  hours = 48,
): Promise<boolean> {
  const id = String(staffProfileId || "").trim();
  if (!id) return false;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data } = await portalAdmin
    .from("portal_staff_notify_log")
    .select("id, meta, created_at")
    .eq("staff_profile_id", id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const row of data ?? []) {
    const meta =
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {};
    if (String(meta.reason || "") === reason) return true;
  }
  return false;
}

export async function sendStaffOnboardingWhatsapp(
  portalAdmin: SupabaseClient,
  opts: {
    staffProfileId: string;
    username: string;
    fullName: string;
    phone: string;
    body: string;
    reason: StaffOnboardingWhatsappReason;
    sentByUserId?: string | null;
    sentByEmail?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const phone = normalizeParentPhoneE164(String(opts.phone || ""));
  const body = String(opts.body || "").trim();
  if (!phone) return { ok: false, error: "missing_staff_phone" };
  if (!body) return { ok: false, error: "empty_body" };
  const templateBody = flattenWhatsappTemplateBody(body);
  const sent = await sendParentMobileMessage(phone, templateBody, {
    kind: "staff_contact_update",
  });
  const logBody = body;
  try {
    await portalAdmin.from("portal_staff_notify_log").insert({
      sent_by_user_id: opts.sentByUserId || null,
      sent_by_email: opts.sentByEmail || null,
      kind: "staff_contact_update",
      channel: "whatsapp",
      staff_profile_id: opts.staffProfileId,
      staff_username: String(opts.username || "").trim().toLowerCase(),
      staff_display_name: opts.fullName || opts.username,
      staff_phone: phone,
      subject: null,
      body_text: logBody,
      message_type: "text",
      whatsapp_status: sent.ok ? (sent.channel === "sms" ? "sent_sms" : "sent") : "failed",
      whatsapp_message_id: sent.ok ? sent.id : null,
      error_detail: sent.ok ? null : sent.error || "send_failed",
      meta: {
        reason: opts.reason,
        staff_phone_masked: maskPhoneForLog(phone),
        used_template: true,
        wa_client_body: `Hello,\n${templateBody}\nThank you.`,
      },
    });
  } catch (e) {
    console.error("[sendStaffOnboardingWhatsapp] log", e);
  }
  return sent.ok ? { ok: true } : { ok: false, error: sent.error || "send_failed" };
}

export function staffOnboardingPinWhatsappBody(opts: {
  firstName: string;
  loginUrl: string;
  pinName: string;
  email: string;
  pin: string;
}): string {
  const first = String(opts.firstName || "there").trim() || "there";
  return (
    `Hi ${first}, the office has checked your onboarding and your staff account is now open. ` +
    `Staff app: ${opts.loginUrl} — sign in with ${opts.pinName} (or ${opts.email}) and PIN ${opts.pin}. ` +
    `The communication channel is Comms in the staff app. ` +
    `Then complete General Induction and Safeguarding.`
  );
}

export function staffOnboardingChaseWhatsappBody(opts: {
  firstName: string;
  missing: string[];
  hubUrl: string;
}): string {
  const first = String(opts.firstName || "there").trim() || "there";
  const items = (opts.missing || []).filter(Boolean);
  const list = items.length ? items.join("; ") : "the remaining onboarding items";
  return (
    `Hi ${first}, thank you for your job application. ` +
    `Please still complete in the onboarding hub: ${list}. ` +
    `Hub: ${opts.hubUrl} ` +
    `When the office validates everything, your staff account opens and Comms in the staff app is the communication channel.`
  );
}

export function onboardingPayloadSubmitted(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const portal = (payload as { _portal?: unknown })._portal;
  if (!portal || typeof portal !== "object") return false;
  const submittedAt = (portal as { submitted_at?: unknown }).submitted_at;
  return typeof submittedAt === "string" && submittedAt.trim().length > 0;
}

function classifyRequiredDoc(folder: "passport" | "checklist", nameOrPath: string): "passport" | "checklist" | "other" {
  const base = String(nameOrPath || "").toLowerCase();
  if (base.includes("checklist") || base.includes("starter")) return "checklist";
  if (
    base.includes("righttowork") ||
    base.includes("right_to_work") ||
    base.includes("right-to-work") ||
    base.includes("right to work") ||
    base.includes("screenshot_20260911_070957") ||
    /(^|[^a-z])rtw([^a-z]|$)/.test(base)
  ) {
    return "other";
  }
  if (base.includes("passport") || /\bdbs\b/.test(base)) {
    return "passport";
  }
  return folder;
}

export async function countApplicantRequiredDocs(
  obAdmin: SupabaseClient,
  bucket: string,
  applicantId: string,
): Promise<OnboardingDocCounts> {
  const counts: OnboardingDocCounts = { passport: 0, checklist: 0 };
  const folders: Array<"passport" | "checklist"> = ["passport", "checklist"];
  for (const folder of folders) {
    const prefixes = [`${folder}/${applicantId}`, `${applicantId}/${folder}`];
    for (const prefix of prefixes) {
      const { data, error } = await obAdmin.storage.from(bucket).list(prefix, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error || !data) continue;
      for (const f of data) {
        if (!f?.name || String(f.name).startsWith(".") || String(f.name).endsWith("/")) continue;
        if (!f.id && !(f.metadata && f.metadata.size != null)) continue;
        const kind = classifyRequiredDoc(folder, `${prefix}/${f.name}`);
        if (kind === "passport") counts.passport += 1;
        if (kind === "checklist") counts.checklist += 1;
      }
    }
  }
  return counts;
}

export function pinNameCandidates(username: string, fullName: string): string[] {
  const out: string[] = [];
  const add = (v: string) => {
    const t = String(v || "").trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  add(username);
  add(fullName);
  const first = fullName.trim().split(/\s+/)[0] || "";
  add(first);
  return out;
}

export function matchStaffPinRow(
  rows: Array<{ name?: string | null; pin?: string | null; portal?: string | null }>,
  username: string,
  fullName: string,
): { name: string; pin: string } | null {
  const want = pinNameCandidates(username, fullName).map((s) => s.toLowerCase());
  for (const row of rows) {
    if (String(row.portal || "staff").toLowerCase() !== "staff") continue;
    const name = String(row.name || "").trim();
    const pin = String(row.pin || "").trim();
    if (!name || !pin) continue;
    if (want.includes(name.toLowerCase())) return { name, pin };
  }
  return null;
}

/** GoTrue rejects new passwords shorter than 6 characters. Staff still type the 4-digit PIN. */
export const STAFF_PIN_AUTH_SUFFIX = "Cs";

export function staffPinAuthPassword(pin: string): string {
  const p = String(pin || "").trim();
  if (/^\d{4}$/.test(p)) return p + STAFF_PIN_AUTH_SUFFIX;
  return p;
}

function randomFourDigitPin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 9000;
  return String(1000 + n);
}

function hrNameKey(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function onboardingGivenName(name: string, surname: string): string {
  const n = name.trim();
  const s = surname.trim();
  if (s && n.toLowerCase().endsWith(s.toLowerCase()) && n.length > s.length) {
    return n.slice(0, n.length - s.length).trim();
  }
  const first = n.split(/\s+/)[0] || "";
  return first || n;
}

function onboardingText(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function onboardingYesNo(v: unknown): string {
  const s = onboardingText(v).toLowerCase();
  if (s === "yes") return "Yes";
  if (s === "no") return "No";
  return onboardingText(v);
}

/** Labels match the job application form, in the same order. */
export function jobApplicationHrData(job: Record<string, unknown>): Record<string, string> {
  const pairs: Array<[string, string]> = [
    ["Name", onboardingText(job.name)],
    ["Surname", onboardingText(job.surname)],
    ["Address", onboardingText(job.address)],
    ["Date of birth", onboardingText(job.dob)],
    ["Phone", onboardingText(job.phone)],
    ["Nationality", onboardingText(job.nationality)],
    ["Right to work", onboardingText(job.rtwork)],
    ["Right to work code", onboardingText(job.rtwork_code)],
    ["Role", onboardingText(job.role)],
    ["Status", onboardingText(job.status)],
    ["Location", onboardingText(job.location)],
    ["Availability", onboardingText(job.availability)],
    ["Education", onboardingText(job.education)],
    ["Qualifications", onboardingText(job.qualifications)],
    ["Qualifications date", onboardingText(job.date)],
    ["Additional certifications", onboardingText(job.additional_certifications)],
    ["Employment history", onboardingText(job.employment_history)],
    ["Gaps in employment", onboardingText(job.gaps)],
    ["Additional skills", onboardingText(job.additional_skills)],
    ["Criminal record", onboardingYesNo(job.criminal_record)],
    ["Criminal record details", onboardingText(job.criminal_record_info)],
  ];
  const out: Record<string, string> = {};
  for (const [label, value] of pairs) {
    if (value) out[label] = value;
  }
  return out;
}

/** Bank details stay off the job application and live in their own card section. */
export function bankAccountHrData(job: Record<string, unknown>): Record<string, string> {
  const pairs: Array<[string, string]> = [
    ["Bank account", onboardingText(job.bank_account)],
    ["Sort code", onboardingText(job.sort_code)],
    ["Account number", onboardingText(job.account_number)],
  ];
  const out: Record<string, string> = {};
  for (const [label, value] of pairs) {
    if (value) out[label] = value;
  }
  return out;
}

/** Labels match the health questionnaire, in the same order. */
export function healthQuestionnaireHrData(health: Record<string, unknown>): Record<string, string> {
  const legacy = [
    ["Medical conditions", "q1", "q1_detail"],
    ["Medication", "q2", "q2_detail"],
    ["Allergies", "q3", "q3_detail"],
    ["Mental health", "q4", "q4_detail"],
    ["Musculoskeletal", "q5", "q5_detail"],
    ["Respiratory", "q6", "q6_detail"],
    ["Hearing impairments", "q7", "q7_detail"],
    ["Communicable diseases", "q8", "q8_detail"],
    ["Hospital admissions", "q9", "q9_detail"],
    ["Workplace adjustments", "q10", "q10_detail"],
  ] as const;
  const current = [
    ["Medical conditions", "medical_conditions", "medical_condition_info"],
    ["Medication", "medication", "medication_info"],
    ["Allergies", "allergies", "allergies_info"],
    ["Mental health", "mental_health", "mental_health_info"],
    ["Musculoskeletal", "musculoskeletal", "musculoskeletal_info"],
    ["Respiratory", "respiratory", "respiratory_info"],
    ["Hearing impairments", "hearing_impairments", "hearing_impairments_info"],
    ["Communicable diseases", "communicable_diseases", "communicable_diseases_info"],
    ["Hospital admissions", "surgeries_or_hospital_admissions", "hospital_admissions_info"],
    ["Workplace adjustments", "require_workplace_adjustments", "adjustments_info"],
  ] as const;
  const useLegacy = health.q1 != null && health.medical_conditions == null;
  const pairs: Array<[string, unknown, unknown]> = (useLegacy ? legacy : current).map(
    ([label, answerKey, infoKey]) => [label, health[answerKey], health[infoKey]],
  );
  const out: Record<string, string> = {};
  const name = [
    onboardingText(health.name) || onboardingText(health.firstName),
    onboardingText(health.surname) || onboardingText(health.lastName),
  ].filter(Boolean).join(" ");
  if (name) out.Name = name;
  if (onboardingText(health.dob)) out["Date of birth"] = onboardingText(health.dob);
  const role = onboardingText(health.role) || onboardingText(health.positionLabel) ||
    onboardingText(health.position);
  if (role) out.Role = role;
  for (const [label, answer, info] of pairs) {
    const yn = onboardingYesNo(answer);
    if (yn) out[label] = yn;
    const detail = onboardingText(info);
    if (detail) out[label + " details"] = detail;
  }
  const confirmed = ["confirmation_1", "confirmation_2", "confirmation_3"].every((k) => {
    const v = health[k];
    return v === true || v === "true" || v === "on" || v === "yes";
  }) || ["confirm_accurate", "confirm_impact", "consent_health"].every((k) => {
    const v = onboardingText(health[k]).toLowerCase();
    return v === "true" || v === "yes" || v === "on";
  });
  if (confirmed) out.Declarations = "Confirmed";
  if (onboardingText(health.declarationDate)) out["Declaration date"] = onboardingText(health.declarationDate);
  return out;
}

async function hrAnchorForStaff(
  portalAdmin: SupabaseClient,
  userId: string,
  fallbackName: string,
): Promise<{ nameKey: string; employeeName: string; staffId: string | null; active: boolean } | null> {
  const id = String(userId || "").trim();
  if (id) {
    const { data } = await portalAdmin
      .from("hr_records")
      .select("name_key, employee_name, staff_id, active")
      .eq("sheet", "Employees info")
      .eq("staff_id", id)
      .limit(1);
    const row = data && data[0];
    if (row?.name_key) {
      return {
        nameKey: String(row.name_key),
        employeeName: String(row.employee_name || fallbackName || ""),
        staffId: row.staff_id ? String(row.staff_id) : id,
        active: row.active !== false,
      };
    }
  }
  const want = fallbackName.trim().toLowerCase();
  if (want) {
    const { data: named } = await portalAdmin
      .from("hr_records")
      .select("name_key, employee_name, staff_id, active")
      .eq("sheet", "Employees info")
      .ilike("employee_name", fallbackName.trim())
      .limit(1);
    const row = named && named[0];
    if (row?.name_key) {
      return {
        nameKey: String(row.name_key),
        employeeName: String(row.employee_name || fallbackName),
        staffId: row.staff_id ? String(row.staff_id) : (id || null),
        active: row.active !== false,
      };
    }
  }
  const nameKey = hrNameKey(fallbackName);
  if (!nameKey) return null;
  return { nameKey, employeeName: fallbackName.trim(), staffId: id || null, active: true };
}

async function upsertHrFormSheet(
  portalAdmin: SupabaseClient,
  anchor: { nameKey: string; employeeName: string; staffId: string | null; active: boolean },
  sheet: string,
  data: Record<string, string>,
  sourceFile: string,
): Promise<void> {
  if (!Object.keys(data).length) return;
  const { data: existing } = await portalAdmin
    .from("hr_records")
    .select("id")
    .eq("sheet", sheet)
    .eq("name_key", anchor.nameKey)
    .limit(1);
  const row = {
    sheet,
    row_index: 1,
    name_key: anchor.nameKey,
    employee_name: anchor.employeeName,
    staff_id: anchor.staffId,
    data,
    source_file: sourceFile,
    active: anchor.active,
  };
  if (existing && existing[0]?.id) {
    const { error } = await portalAdmin.from("hr_records").update({
      data,
      employee_name: anchor.employeeName,
      staff_id: anchor.staffId,
      source_file: sourceFile,
      active: anchor.active,
    }).eq("id", existing[0].id);
    if (error) console.warn("[upsertHrFormSheet]", sheet, error.message);
    return;
  }
  const { error } = await portalAdmin.from("hr_records").insert(row);
  if (error) console.warn("[upsertHrFormSheet]", sheet, error.message);
}

/**
 * Submitted job applications were staying in onboarding drafts only, so Staff & HR
 * opened an empty rota card. Copy the same Employee info shape the matrix uses.
 * Bank details go in their own Bank account section.
 */
export async function foldSubmittedJobIntoHrRecords(
  portalAdmin: SupabaseClient,
  userId: string,
  payload: unknown,
): Promise<void> {
  const id = String(userId || "").trim();
  if (!id || !payload || typeof payload !== "object") return;
  const job = payload as Record<string, unknown>;
  const portalMeta = job._portal && typeof job._portal === "object"
    ? (job._portal as Record<string, unknown>)
    : null;
  const submittedAt = String(portalMeta?.submitted_at || "").trim();
  if (!submittedAt) return;

  const { data: prof, error: profErr } = await portalAdmin
    .from("staff_profiles")
    .select(
      "id, username, full_name, phone_e164, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship",
    )
    .eq("id", id)
    .maybeSingle();
  if (profErr || !prof?.id) {
    if (profErr) console.warn("[foldSubmittedJobIntoHrRecords] profile", profErr.message);
    return;
  }

  const nameKey = hrNameKey(String(prof.username || prof.full_name || ""));
  if (!nameKey) return;

  const surname = onboardingText(job.surname);
  const given = onboardingGivenName(onboardingText(job.name), surname);
  const display = onboardingText(prof.full_name) || [given, surname].filter(Boolean).join(" ");
  const anchorEarly = await hrAnchorForStaff(portalAdmin, id, display);
  if (anchorEarly) {
    await upsertHrFormSheet(
      portalAdmin,
      anchorEarly,
      "Job application",
      jobApplicationHrData(job),
      "onboarding_job_application",
    );
    await upsertHrFormSheet(
      portalAdmin,
      anchorEarly,
      "Bank account",
      bankAccountHrData(job),
      "onboarding_job_application",
    );
  }

  const { data: existing } = await portalAdmin
    .from("hr_records")
    .select("id")
    .eq("sheet", "Employees info")
    .or(`staff_id.eq.${id},name_key.eq.${nameKey}`)
    .limit(1);
  if (existing && existing.length) return;

  const employeeInfo: Record<string, string> = {
    Name: given,
    Surname: surname,
    Address: onboardingText(job.address),
    DOB: onboardingText(job.dob),
    Nationality: onboardingText(job.nationality),
    RTWork: onboardingText(job.rtwork),
    "RTWork code": onboardingText(job.rtwork_code),
    "RTWork checked": "",
    Phone: onboardingText(job.phone) || onboardingText(prof.phone_e164),
    Role: onboardingText(job.role),
    "Reference 1": onboardingText(job.reference_1),
    "Reference 2": onboardingText(job.reference_2),
    "End Contract": "",
    Shifts: onboardingText(job.availability),
  };

  const rows: Array<Record<string, unknown>> = [
    {
      sheet: "Employees info",
      row_index: 1,
      name_key: nameKey,
      employee_name: display,
      staff_id: id,
      data: employeeInfo,
      source_file: "onboarding_job_application",
      active: true,
    },
  ];

  const emergencyName = onboardingText(prof.emergency_contact_name);
  if (emergencyName) {
    rows.push({
      sheet: "Emergency Contact Info",
      row_index: 1,
      name_key: nameKey,
      employee_name: display,
      staff_id: id,
      data: {
        Employee: display,
        "Emergency Contact Name": emergencyName,
        Number: onboardingText(prof.emergency_contact_phone),
        Relation: onboardingText(prof.emergency_contact_relationship),
      },
      source_file: "onboarding_job_application",
      active: true,
    });
  }

  const { error } = await portalAdmin.from("hr_records").insert(rows);
  if (error) console.warn("[foldSubmittedJobIntoHrRecords]", error.message);
}

/** Copy a submitted health questionnaire onto the Staff & HR person card. */
export async function foldSubmittedHealthIntoHrRecords(
  portalAdmin: SupabaseClient,
  userId: string,
  staffName: string,
  payload: unknown,
): Promise<void> {
  if (!payload || typeof payload !== "object") return;
  const health = payload as Record<string, unknown>;
  const portalMeta = health._portal && typeof health._portal === "object"
    ? (health._portal as Record<string, unknown>)
    : null;
  const submittedAt = String(portalMeta?.submitted_at || "").trim();
  if (!submittedAt) return;
  const display = onboardingText(staffName) ||
    [onboardingText(health.name), onboardingText(health.surname)].filter(Boolean).join(" ");
  const anchor = await hrAnchorForStaff(portalAdmin, userId, display);
  if (!anchor) return;
  await upsertHrFormSheet(
    portalAdmin,
    anchor,
    "Health Questionaire",
    healthQuestionnaireHrData(health),
    "onboarding_health_questionnaire",
  );
}

export function mintUniqueStaffPin(existing: Iterable<string>): string {
  const used = new Set(
    Array.from(existing).map((p) => String(p || "").trim()),
  );
  for (let i = 0; i < 80; i++) {
    const pin = randomFourDigitPin();
    if (WEAK_PINS.has(pin) || used.has(pin)) continue;
    return pin;
  }
  throw new Error("pin_exhausted");
}
