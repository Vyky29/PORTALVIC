// @ts-nocheck — Edge Function (Deno).
//
// portal-booking-lead-otp-verify
// -------------------------------
// Verify email OTP and mint a Booking Portal lead session.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  BOOKING_LEAD_OTP_MAX_ATTEMPTS,
  BOOKING_LEAD_SESSION_TTL_MS,
  bookingLeadCorsHeaders,
  bookingLeadJson,
  clientDeviceFromRequest,
  clientIp,
  constantTimeEquals,
  isValidEmail,
  newSessionToken,
  normalizeEmail,
  sha256Hex,
} from "../_shared/booking_lead_auth.ts";
import { notifyOfficeNewBookingLead } from "../_shared/portal_booking_lead_office_notify.ts";

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

  const email = normalizeEmail(String(body.email || ""));
  const code = String(body.code || "").trim();
  if (!isValidEmail(email) || !/^\d{4,8}$/.test(code)) {
    return bookingLeadJson({ ok: false, error: "invalid" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    return bookingLeadJson({ ok: false, error: "server_misconfigured" }, 503);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: lead } = await supabase
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, marketing_consent, privacy_notice_version, booking_status, registration_status, client_status, email_verified_at, source",
    )
    .eq("email_norm", email)
    .maybeSingle();

  if (!lead?.id) return bookingLeadJson({ ok: false, error: "invalid" }, 401);

  const { data: otpRow } = await supabase
    .from("portal_booking_lead_otps")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("lead_id", lead.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!otpRow) return bookingLeadJson({ ok: false, error: "invalid" }, 401);
  if ((otpRow.attempts ?? 0) >= BOOKING_LEAD_OTP_MAX_ATTEMPTS) {
    return bookingLeadJson({ ok: false, error: "too_many_attempts" }, 401);
  }
  if (new Date(otpRow.expires_at).getTime() < Date.now()) {
    return bookingLeadJson({ ok: false, error: "expired" }, 401);
  }

  const submittedHash = await sha256Hex(code);
  if (!constantTimeEquals(submittedHash, String(otpRow.code_hash || ""))) {
    await supabase
      .from("portal_booking_lead_otps")
      .update({ attempts: (otpRow.attempts ?? 0) + 1 })
      .eq("id", otpRow.id);
    return bookingLeadJson({ ok: false, error: "invalid" }, 401);
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from("portal_booking_lead_otps")
    .update({ consumed_at: nowIso, attempts: (otpRow.attempts ?? 0) + 1 })
    .eq("id", otpRow.id);

  await supabase
    .from("portal_booking_lead_sessions")
    .update({ revoked_at: nowIso })
    .eq("lead_id", lead.id)
    .is("revoked_at", null);

  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + BOOKING_LEAD_SESSION_TTL_MS).toISOString();
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";

  const { error: sessErr } = await supabase.from("portal_booking_lead_sessions").insert({
    lead_id: lead.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_hash: ip ? await sha256Hex(ip) : null,
    user_agent_hash: ua ? await sha256Hex(ua) : null,
    client_device: clientDeviceFromRequest(req),
  });
  if (sessErr) {
    console.error("[portal-booking-lead-otp-verify] session insert failed", sessErr);
    return bookingLeadJson({ ok: false, error: "session_failed" }, 500);
  }

  const nextStatus =
    lead.booking_status === "new_lead" ? "exploring_services" : lead.booking_status;

  const firstVerify = !lead.email_verified_at;

  await supabase
    .from("portal_booking_leads")
    .update({
      email_verified_at: nowIso,
      booking_status: nextStatus,
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", lead.id);

  if (firstVerify) {
    void notifyOfficeNewBookingLead({
      leadId: String(lead.id),
      parentName: String(lead.parent_name || ""),
      email: String(lead.email || email),
      mobile: String(lead.mobile || ""),
      source: String(lead.source || "Booking Page"),
      clientStatus: String(lead.client_status || "prospective"),
      event: "verified",
    }).catch((e) =>
      console.warn("[portal-booking-lead-otp-verify] office notify failed", e)
    );
  }

  return bookingLeadJson({
    ok: true,
    session_token: token,
    expires_at: expiresAt,
    lead: {
      id: lead.id,
      parent_name: lead.parent_name,
      // Compatibility aliases for older clients
      first_name: lead.parent_name,
      email: lead.email,
      parent_email: lead.email,
      mobile: lead.mobile,
      parent_phone: lead.mobile,
      marketing_consent: !!lead.marketing_consent,
      privacy_notice_version: lead.privacy_notice_version,
      booking_status: nextStatus,
      registration_status: lead.registration_status,
      client_status: lead.client_status,
    },
  });
});
