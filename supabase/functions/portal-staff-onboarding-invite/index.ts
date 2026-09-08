import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
} from "../_shared/portal_parent_messaging.ts";

function portalOrigin(): string {
  return (
    (Deno.env.get("PORTAL_PUBLIC_ORIGIN") ?? "").trim().replace(/\/$/, "") ||
    "https://portalvic.vercel.app"
  );
}

function randomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let out = "Ob";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function usernameFromName(fullName: string): string {
  const first = String(fullName || "")
    .trim()
    .split(/\s+/)[0] || "Staff";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase().replace(/[^a-z]/gi, "");
}

function normalizeStaffKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Admins / CEOs, or interview-capable staff (Michelle + programme leads). */
async function verifyInviteCaller(
  authHeader: string | null,
): Promise<{ ok: true; email: string; userId: string } | { ok: false; error: string; status: number }> {
  const admin = await verifyPortalAdminAccessToken(authHeader);
  if (admin.ok) return admin;

  const portalUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const portalService = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  if (!portalUrl || !portalService || !anon) {
    return { ok: false, error: "misconfigured", status: 503 };
  }
  if (!authHeader || !/^Bearer\s+\S+/i.test(authHeader)) {
    return { ok: false, error: "missing_authorization", status: 401 };
  }

  const res = await fetch(`${portalUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anon },
  });
  if (!res.ok) {
    return { ok: false, error: "invalid_or_expired_session", status: 401 };
  }
  let body: { email?: string; id?: string };
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "bad_auth_response", status: 502 };
  }
  const email = String(body?.email ?? "").trim().toLowerCase();
  const userId = String(body?.id ?? "").trim();
  if (!email || !userId) {
    return { ok: false, error: "no_user", status: 403 };
  }

  const client = createClient(portalUrl, portalService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await client
    .from("staff_profiles")
    .select("username, full_name, app_role, staff_role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.is_active === false) {
    return { ok: false, error: admin.error || "not_allowed", status: admin.status || 403 };
  }

  const app = String(profile.app_role || "").toLowerCase();
  const staff = String(profile.staff_role || "").toLowerCase();
  if (app === "admin" || app === "ceo" || staff === "manager" || staff === "admin") {
    return { ok: true, email, userId };
  }

  const key = normalizeStaffKey(String(profile.username || ""));
  const first = normalizeStaffKey(String(profile.full_name || "").split(/\s+/)[0] || "");
  const interviewKeys = new Set(["michelle", "berta", "john", "victor", "raul", "javi", "javier"]);
  if (interviewKeys.has(key) || interviewKeys.has(first)) {
    return { ok: true, email, userId };
  }

  return { ok: false, error: admin.error || "email_not_in_allowlist", status: admin.status || 403 };
}

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const list = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const users = list.data?.users || [];
    const hit = users.find((u) => String(u.email || "").trim().toLowerCase() === target);
    if (hit?.id) return hit.id;
    if (users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = portalAdminCorsHeaders();
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method" });
  }

  const auth = await verifyInviteCaller(req.headers.get("authorization"));
  if (!auth.ok) {
    return portalAdminJson(auth.status, { ok: false, error: auth.error });
  }

  const portalUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const portalService = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!portalUrl || !portalService) {
    return portalAdminJson(500, { ok: false, error: "misconfigured" });
  }

  let body: {
    candidate_id?: string;
    email?: string;
    phone?: string;
    full_name?: string;
    role?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "bad_json" });
  }

  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const fullName = String(body.full_name || "").trim();
  const role = String(body.role || "Support Worker").trim() || "Support Worker";
  const candidateId = String(body.candidate_id || "").trim();

  if (!email || !email.includes("@")) {
    return portalAdminJson(400, { ok: false, error: "email_required" });
  }
  if (!fullName) {
    return portalAdminJson(400, { ok: false, error: "name_required" });
  }

  const admin = createClient(portalUrl, portalService, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tempPassword = randomPassword();
  let userId = "";
  let created = false;

  const existingId = await findAuthUserIdByEmail(admin, email);
  if (existingId) {
    userId = existingId;
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        onboarding_applicant: true,
        candidate_id: candidateId || null,
      },
    });
    if (pwErr) {
      console.error("[portal-staff-onboarding-invite] updateUser", pwErr);
      return portalAdminJson(500, { ok: false, error: "update_user_failed" });
    }
  } else {
    const { data: createdUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        onboarding_applicant: true,
        candidate_id: candidateId || null,
      },
    });
    if (createErr || !createdUser?.user?.id) {
      // Race: another request created the user after our list scan.
      const raced = await findAuthUserIdByEmail(admin, email);
      if (raced) {
        userId = raced;
        await admin.auth.admin.updateUserById(userId, {
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            onboarding_applicant: true,
            candidate_id: candidateId || null,
          },
        });
      } else {
        console.error("[portal-staff-onboarding-invite] createUser", createErr);
        return portalAdminJson(500, {
          ok: false,
          error: "create_user_failed",
          detail: createErr?.message || null,
        });
      }
    } else {
      userId = createdUser.user.id;
      created = true;
    }
  }

  let username = usernameFromName(fullName) || "Staff";
  const { data: clash } = await admin
    .from("staff_profiles")
    .select("id")
    .eq("username", username)
    .neq("id", userId)
    .maybeSingle();
  if (clash?.id) {
    username = `${username}${String(Date.now()).slice(-4)}`;
  }

  const now = new Date().toISOString();
  const phoneDigits = phone.replace(/\D/g, "");
  const { error: profileErr } = await admin.from("staff_profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      username,
      app_role: "staff",
      staff_role: role || "onboarding",
      dashboard_route: "staff_dashboard.html",
      is_active: true,
      onboarding_applicant: true,
      phone_e164: phone || null,
      phone_lookup: phoneDigits.slice(-10) || null,
      email_personal: email,
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (profileErr) {
    console.error("[portal-staff-onboarding-invite] profile", profileErr);
    return portalAdminJson(500, {
      ok: false,
      error: "profile_failed",
      detail: profileErr.message,
    });
  }

  const origin = portalOrigin();
  const loginUrl = `${origin}/login.html`;
  const hubUrl = `${origin}/onboarding_portal.html`;
  const subject = "clubSENsational — your onboarding portal login";
  const text =
    `Hi ${fullName.split(/\s+/)[0] || fullName},\n\n` +
    `You are ready for onboarding as ${role}.\n\n` +
    `1) Sign in: ${loginUrl}\n` +
    `   Email: ${email}\n` +
    `   Temporary password: ${tempPassword}\n\n` +
    `2) Complete your onboarding hub (photo, documents, job application, health form):\n` +
    `${hubUrl}\n\n` +
    `Please change your password after first login if prompted.\n\n` +
    `Office | clubSENsational\n`;

  const smtp = readParentNotifySmtpConfig();
  let emailOk = false;
  let emailError: string | null = null;
  if (smtp) {
    const mail = await sendParentEmailViaSmtp({
      to: email,
      subject,
      text,
      smtp,
    });
    emailOk = !!mail.ok;
    emailError = mail.ok ? null : String(mail.error || "send_failed");
  } else {
    emailError = "smtp_not_configured";
    console.warn("[portal-staff-onboarding-invite] SMTP not configured; password logged for ops");
    console.log("[portal-staff-onboarding-invite] temp_password", email, tempPassword);
  }

  try {
    await admin.from("portal_parent_notify_log").insert({
      sent_by_email: auth.email || "system@clubsensational.org",
      kind: "staff_onboarding_invite",
      channel: "email",
      parent_email: email,
      parent_phone: phone || null,
      parent_name: fullName,
      subject,
      body_text: text.replace(tempPassword, "[redacted]"),
      whatsapp_status: null,
      error_detail: emailError,
      meta: {
        candidate_id: candidateId || null,
        user_id: userId,
        created,
        hub_url: hubUrl,
        email_ok: emailOk,
      },
    });
  } catch (e) {
    console.warn("[portal-staff-onboarding-invite] notify_log", e);
  }

  return portalAdminJson(200, {
    ok: true,
    user_id: userId,
    created,
    email,
    email_sent: emailOk,
    email_error: emailError,
    hub_url: hubUrl,
    login_url: loginUrl,
    /* Only returned to admin UI so they can share if SMTP failed */
    temporary_password: emailOk ? null : tempPassword,
  });
});
