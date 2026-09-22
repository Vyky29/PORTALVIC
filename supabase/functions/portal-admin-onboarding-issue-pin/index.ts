import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  countApplicantRequiredDocs,
  matchStaffPinRow,
  mintUniqueStaffPin,
  missingOnboardingPinChecks,
  ONBOARDING_PIN_UUID_RE,
  onboardingPayloadSubmitted,
  staffAppOrigin,
  staffRolePinLabel,
  ensureStaffProfilePhoto,
  ensureStaffPhoneFromJob,
  sendStaffOnboardingWhatsapp,
  staffOnboardingPinWhatsappBody,
} from "../_shared/portal_onboarding_pin.ts";
import {
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
} from "../_shared/portal_parent_messaging.ts";

const DEFAULT_BUCKETS = ["club-files", "club-onboarding"];

async function resolveOnboardingBucket(
  obAdmin: ReturnType<typeof createClient>,
): Promise<{ bucket: string; errors: string[] }> {
  const errors: string[] = [];
  const envBucket = (Deno.env.get("ONBOARDING_STORAGE_BUCKET") ?? "").trim();
  const candidates = [envBucket, ...DEFAULT_BUCKETS].filter(Boolean);
  const seen = new Set<string>();
  for (const name of candidates) {
    if (seen.has(name)) continue;
    seen.add(name);
    const { error } = await obAdmin.storage.from(name).list("", { limit: 1 });
    if (!error) return { bucket: name, errors };
    errors.push(`${name}: ${error.message}`);
  }
  return { bucket: envBucket || DEFAULT_BUCKETS[0], errors };
}

Deno.serve(async (req) => {
  const cors = portalAdminCorsHeaders();
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(
    req.headers.get("Authorization"),
  );
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const portalUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const portalService = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const obUrl = (Deno.env.get("ONBOARDING_SUPABASE_URL") ?? "").trim();
  const obService = (Deno.env.get("ONBOARDING_SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

  if (!portalUrl || !portalService) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }
  if (!obUrl || !obService) {
    return portalAdminJson(503, {
      ok: false,
      error: "onboarding_storage_not_configured",
    });
  }

  let body: { applicant_session_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "bad_json" });
  }

  const applicantId = String(body.applicant_session_id || "").trim();
  if (!ONBOARDING_PIN_UUID_RE.test(applicantId)) {
    return portalAdminJson(400, { ok: false, error: "invalid_applicant" });
  }

  const portalAdmin = createClient(portalUrl, portalService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const obAdmin = createClient(obUrl, obService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileErr } = await portalAdmin
    .from("staff_profiles")
    .select("id, username, full_name, avatar_url, email_personal, staff_role, phone_e164")
    .eq("id", applicantId)
    .maybeSingle();
  if (profileErr) {
    console.error("[portal-admin-onboarding-issue-pin] profile", profileErr);
    return portalAdminJson(500, { ok: false, error: "profile_failed" });
  }
  if (!profile?.id) {
    return portalAdminJson(404, { ok: false, error: "staff_not_found" });
  }

  const username = String(profile.username || "").trim();
  const fullName = String(profile.full_name || username || "Staff").trim();
  const loginEmail = String(profile.email_personal || "").trim().toLowerCase();
  const { data: authUser } = await portalAdmin.auth.admin.getUserById(applicantId);
  const email = loginEmail || String(authUser?.user?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return portalAdminJson(409, {
      ok: false,
      error: "email_missing",
      missing: ["Staff email missing on profile"],
    });
  }

  const { data: drafts } = await portalAdmin
    .from("onboarding_applicant_drafts")
    .select("form_type, payload")
    .eq("applicant_session_id", applicantId);

  let jobSubmitted = false;
  let healthSubmitted = false;
  let jobPayload: unknown = null;
  for (const row of drafts ?? []) {
    const ft = String(row.form_type ?? "").toLowerCase();
    if (ft === "job") {
      jobPayload = row.payload;
      if (onboardingPayloadSubmitted(row.payload)) jobSubmitted = true;
    }
    if (ft === "health" && onboardingPayloadSubmitted(row.payload)) {
      healthSubmitted = true;
    }
  }
  const phone = await ensureStaffPhoneFromJob(portalAdmin, applicantId, {
    payload: jobPayload,
    currentPhone: profile.phone_e164 != null ? String(profile.phone_e164) : "",
  });

  const { data: healthRow } = await portalAdmin
    .from("staff_health_questionnaire_drafts")
    .select("submitted_at")
    .eq("staff_session_id", applicantId)
    .maybeSingle();
  if (healthRow?.submitted_at) healthSubmitted = true;

  const { bucket } = await resolveOnboardingBucket(obAdmin);
  const docs = await countApplicantRequiredDocs(obAdmin, bucket, applicantId);
  const photoUrl = await ensureStaffProfilePhoto(
    portalAdmin,
    applicantId,
    profile.avatar_url,
  );
  const missing = missingOnboardingPinChecks({
    job_submitted: jobSubmitted,
    health_submitted: healthSubmitted,
    photo: !!photoUrl,
    passport: docs.passport > 0,
    checklist: docs.checklist > 0,
  });
  if (missing.length) {
    return portalAdminJson(409, {
      ok: false,
      error: "onboarding_incomplete",
      missing,
    });
  }

  const { data: pinRows, error: pinListErr } = await portalAdmin
    .from("portal_login_pins")
    .select("name, pin, portal, display_order")
    .eq("portal", "staff");
  if (pinListErr) {
    console.error("[portal-admin-onboarding-issue-pin] pins", pinListErr);
    return portalAdminJson(500, { ok: false, error: "pins_failed" });
  }

  const existing = matchStaffPinRow(pinRows || [], username, fullName);
  const pinName = username || fullName.split(/\s+/)[0] || fullName;
  const roles = staffRolePinLabel(String(profile.staff_role || "support"));
  const origin = staffAppOrigin();
  const loginUrl = `${origin}/login.html`;

  let pin = existing?.pin || "";
  let created = false;
  if (!pin) {
    try {
      pin = mintUniqueStaffPin((pinRows || []).map((r) => String(r.pin || "")));
    } catch {
      return portalAdminJson(500, { ok: false, error: "pin_exhausted" });
    }
    const maxOrder = (pinRows || []).reduce((m, r) => {
      const n = Number(r.display_order);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const { error: insertErr } = await portalAdmin.from("portal_login_pins").insert({
      portal: "staff",
      display_order: maxOrder + 1,
      name: pinName,
      roles,
      pin,
    });
    if (insertErr) {
      console.error("[portal-admin-onboarding-issue-pin] insert", insertErr);
      return portalAdminJson(500, {
        ok: false,
        error: "pin_insert_failed",
        detail: insertErr.message,
      });
    }
    created = true;
  }

  const { error: pwErr } = await portalAdmin.auth.admin.updateUserById(applicantId, {
    password: pin,
    email_confirm: true,
  });
  if (pwErr) {
    console.error("[portal-admin-onboarding-issue-pin] password", pwErr);
    return portalAdminJson(500, { ok: false, error: "password_failed" });
  }

  const first = fullName.split(/\s+/)[0] || fullName;
  const subject = "clubSENsational — your staff app PIN";
  const text =
    `Hi ${first},\n\n` +
    `The office has checked your onboarding and your staff account is now open.\n\n` +
    `Staff app: ${loginUrl}\n` +
    `Name: ${pinName}\n` +
    `Email: ${email}\n` +
    `PIN: ${pin}\n\n` +
    `Sign in with your first name (or email) and this PIN.\n` +
    `The communication channel is Comms in the staff app — use that for office messages.\n` +
    `Then complete General Induction and Safeguarding in the staff app.\n\n` +
    `Office | clubSENsational\n`;

  const smtp = readParentNotifySmtpConfig();
  let emailOk = false;
  let emailError: string | null = null;
  if (smtp) {
    try {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to: email,
        subject,
        bodyText: text,
      });
      emailOk = !!mail.ok;
      emailError = mail.ok ? null : String(mail.error || "send_failed");
    } catch (e) {
      emailError = String(e);
      console.error("[portal-admin-onboarding-issue-pin] smtp", e);
    }
  } else {
    emailError = "smtp_not_configured";
  }

  const waPhone = phone;
  let whatsappOk = false;
  let whatsappError: string | null = null;
  if (waPhone) {
    const waBody = staffOnboardingPinWhatsappBody({
      firstName: first,
      loginUrl,
      pinName,
      email,
      pin,
    });
    const wa = await sendStaffOnboardingWhatsapp(portalAdmin, {
      staffProfileId: applicantId,
      username,
      fullName,
      phone: waPhone,
      body: waBody,
      reason: "onboarding_pin_issued",
      sentByUserId: verified.userId || null,
      sentByEmail: verified.email || null,
    });
    whatsappOk = !!wa.ok;
    whatsappError = wa.ok ? null : String(wa.error || "send_failed");
  } else {
    whatsappError = "missing_staff_phone";
  }

  return portalAdminJson(200, {
    ok: true,
    created,
    already_had_pin: !created,
    applicant_session_id: applicantId,
    name: pinName,
    full_name: fullName,
    email,
    pin,
    roles,
    login_url: loginUrl,
    email_ok: emailOk,
    email_error: emailError,
    whatsapp_ok: whatsappOk,
    whatsapp_error: whatsappError,
    has_phone: !!waPhone,
    photo_url: photoUrl || null,
  });
});
