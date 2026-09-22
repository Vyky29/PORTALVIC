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

/** Photo for PIN/admin: profile row, else auth metadata / staff-avatars (late hub upload).
 * Returns the public URL when a photo is on file (empty string if missing). */
export async function ensureStaffProfilePhoto(
  portalAdmin: SupabaseClient,
  userId: string,
  currentUrl?: string | null,
): Promise<string> {
  const id = String(userId || "").trim();
  const existing = String(currentUrl || "").trim();
  if (!id) return "";
  if (existing) return existing;
  let url = "";
  try {
    const { data } = await portalAdmin.auth.admin.getUserById(id);
    url = String(data?.user?.user_metadata?.avatar_url || "").trim();
  } catch {
    url = "";
  }
  if (!url) {
    try {
      const { data: files } = await portalAdmin.storage.from("staff-avatars").list(id, {
        limit: 12,
      });
      const file = (files || []).find((f) => f && f.name && !String(f.name).startsWith("."));
      if (file && file.name) {
        const { data: pub } = portalAdmin.storage
          .from("staff-avatars")
          .getPublicUrl(`${id}/${file.name}`);
        url = String(pub?.publicUrl || "").trim();
      }
    } catch {
      url = "";
    }
  }
  if (!url) return "";
  try {
    await portalAdmin.from("staff_profiles").update({ avatar_url: url }).eq("id", id);
  } catch {
    /* PIN/admin can still treat photo as present */
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
    base.includes("passport") ||
    /\bdbs\b/.test(base) ||
    base.includes("right_to_work") ||
    base.includes("rtw")
  ) {
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
