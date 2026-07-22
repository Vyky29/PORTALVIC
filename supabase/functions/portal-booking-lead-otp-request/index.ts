// @ts-nocheck — Edge Function (Deno).
//
// portal-booking-lead-otp-request
// --------------------------------
// Create / refresh a Prospective Client lead and email a 6-digit access code.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  BOOKING_LEAD_OTP_MAX_PER_HOUR_PER_EMAIL,
  BOOKING_LEAD_OTP_MAX_PER_HOUR_PER_IP,
  BOOKING_LEAD_OTP_TTL_MS,
  BOOKING_LEAD_PRIVACY_NOTICE_VERSION,
  bookingLeadCorsHeaders,
  bookingLeadJson,
  clientIp,
  isValidEmail,
  maskEmail,
  newOtpCode,
  normalizeEmail,
  normalizePhoneE164,
  sanitizeFirstName,
  sha256Hex,
} from "../_shared/booking_lead_auth.ts";
import {
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
} from "../_shared/portal_parent_messaging.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: bookingLeadCorsHeaders });
  }
  if (req.method !== "POST") {
    return bookingLeadJson({ ok: false, error: "method_not_allowed" }, 405);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return bookingLeadJson({ ok: false, error: "invalid_json" }, 400);
  }

  const firstName = sanitizeFirstName(String(body.first_name || ""));
  const email = normalizeEmail(String(body.email || ""));
  const mobileRaw = String(body.mobile || body.phone || "").trim();
  const mobile = normalizePhoneE164(mobileRaw) || mobileRaw.replace(/\s+/g, "");
  const privacyAccepted = body.privacy_accepted === true || body.privacy_accepted === "true";
  const marketingConsent =
    body.marketing_consent === true || body.marketing_consent === "true";
  const firstPage = String(body.first_page_visited || "/bookingportal").trim().slice(0, 300);
  const privacyVersion = String(body.privacy_notice_version || BOOKING_LEAD_PRIVACY_NOTICE_VERSION)
    .trim()
    .slice(0, 64);

  if (!firstName || firstName.length < 2) {
    return bookingLeadJson({ ok: false, error: "first_name_required" }, 400);
  }
  if (!isValidEmail(email)) {
    return bookingLeadJson({ ok: false, error: "email_invalid" }, 400);
  }
  if (!mobile || mobile.replace(/\D/g, "").length < 10) {
    return bookingLeadJson({ ok: false, error: "mobile_invalid" }, 400);
  }
  if (!privacyAccepted) {
    return bookingLeadJson({ ok: false, error: "privacy_required" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[portal-booking-lead-otp-request] Missing SUPABASE env vars");
    return bookingLeadJson({ ok: false, error: "server_misconfigured" }, 503);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  if (ipHash) {
    const { count } = await supabase
      .from("portal_booking_lead_otps")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .eq("ip_hash", ipHash);
    if ((count ?? 0) >= BOOKING_LEAD_OTP_MAX_PER_HOUR_PER_IP) {
      return bookingLeadJson({
        ok: true,
        message: "If that email is valid, a code has been sent.",
        email_hint: maskEmail(email),
      });
    }
  }

  const nowIso = new Date().toISOString();
  const { data: existing } = await supabase
    .from("portal_booking_leads")
    .select("id, booking_status, email_verified_at, first_page_visited")
    .eq("email_norm", email)
    .maybeSingle();

  let leadId = existing?.id as string | undefined;

  if (leadId) {
    const patch: Record<string, unknown> = {
      first_name: firstName,
      email,
      mobile,
      marketing_consent: marketingConsent,
      privacy_notice_version: privacyVersion,
      privacy_accepted_at: nowIso,
      last_activity_at: nowIso,
      updated_at: nowIso,
    };
    if (!existing?.first_page_visited && firstPage) patch.first_page_visited = firstPage;
    await supabase.from("portal_booking_leads").update(patch).eq("id", leadId);
  } else {
    const { data: inserted, error: insertLeadErr } = await supabase
      .from("portal_booking_leads")
      .insert({
        first_name: firstName,
        email,
        mobile,
        marketing_consent: marketingConsent,
        privacy_notice_version: privacyVersion,
        privacy_accepted_at: nowIso,
        source: "Booking Page",
        first_page_visited: firstPage || "/bookingportal",
        booking_status: "new_lead",
        registration_status: "not_started",
        client_status: "prospective",
        last_activity_at: nowIso,
      })
      .select("id")
      .single();
    if (insertLeadErr || !inserted?.id) {
      console.error("[portal-booking-lead-otp-request] lead insert failed", insertLeadErr);
      return bookingLeadJson({ ok: false, error: "lead_create_failed" }, 500);
    }
    leadId = inserted.id;
  }

  const { count: emailCount } = await supabase
    .from("portal_booking_lead_otps")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .gte("created_at", since);
  if ((emailCount ?? 0) >= BOOKING_LEAD_OTP_MAX_PER_HOUR_PER_EMAIL) {
    return bookingLeadJson({
      ok: true,
      message: "If that email is valid, a code has been sent.",
      email_hint: maskEmail(email),
    });
  }

  const code = newOtpCode();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + BOOKING_LEAD_OTP_TTL_MS).toISOString();

  await supabase
    .from("portal_booking_lead_otps")
    .update({ consumed_at: nowIso })
    .eq("lead_id", leadId)
    .is("consumed_at", null);

  let channel: "email" | "log" = "log";
  const smtp = readParentNotifySmtpConfig();
  if (smtp) {
    const mail = await sendParentEmailViaSmtp({
      config: smtp,
      to: email,
      subject: "Your clubSENsational booking access code",
      bodyText:
        `Hello ${firstName},\n\n` +
        `Your access code for the clubSENsational Booking Portal is:\n\n` +
        `${code}\n\n` +
        `It expires in 10 minutes. Enter this code on the booking page to explore availability.\n\n` +
        `If you did not request this, you can ignore this email.\n\n` +
        `— clubSENsational`,
    });
    if (mail.ok) channel = "email";
    else {
      console.warn("[portal-booking-lead-otp-request] SMTP send failed", mail.error);
    }
  }
  if (channel === "log") {
    console.log(
      `[portal-booking-lead-otp-request] No SMTP configured. lead_id=${leadId} destination=${maskEmail(email)} code=${code}`,
    );
  }

  const { error: otpErr } = await supabase.from("portal_booking_lead_otps").insert({
    lead_id: leadId,
    code_hash: codeHash,
    channel,
    destination: email,
    expires_at: expiresAt,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
  });
  if (otpErr) {
    console.error("[portal-booking-lead-otp-request] otp insert failed", otpErr);
    return bookingLeadJson({ ok: false, error: "otp_create_failed" }, 500);
  }

  return bookingLeadJson({
    ok: true,
    message: "We’ve sent a code to your email.",
    email_hint: maskEmail(email),
    channel,
  });
});
