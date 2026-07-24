// @ts-nocheck — Edge Function (Deno).
//
// portal-booking-lead-otp-request
// --------------------------------
// Create / refresh a booking lead and email a 6-digit access code.
// Flows:
//   - new (default): full parent details — prospective visitors
//   - returning: email (+ optional phone) for existing club clients or
//     already-registered booking leads — no full “request access” form

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
  sanitizeParentName,
  sha256Hex,
} from "../_shared/booking_lead_auth.ts";
import {
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
} from "../_shared/portal_parent_messaging.ts";

function phoneLast10(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

type ContactHit = {
  parent_display: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
  email: string | null;
  mobile: string | null;
};

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

  const flowRaw = String(body.flow || body.mode || "new").trim().toLowerCase();
  const isReturning = flowRaw === "returning" || flowRaw === "existing";

  const email = normalizeEmail(String(body.parent_email || body.email || ""));
  const mobileRaw = String(body.parent_phone || body.mobile || body.phone || "").trim();
  const mobileNorm = normalizePhoneE164(mobileRaw) || mobileRaw.replace(/\s+/g, "");
  const phone10 = phoneLast10(mobileNorm || mobileRaw);
  const privacyAccepted = body.privacy_accepted === true || body.privacy_accepted === "true";
  const marketingConsent =
    body.marketing_consent === true || body.marketing_consent === "true";
  const firstPage = String(body.first_page_visited || "/bookingportal").trim().slice(0, 300);
  const privacyVersion = String(body.privacy_notice_version || BOOKING_LEAD_PRIVACY_NOTICE_VERSION)
    .trim()
    .slice(0, 64);

  if (!isValidEmail(email)) {
    return bookingLeadJson({ ok: false, error: "email_invalid" }, 400);
  }
  // New visitors must accept privacy; returning / existing clients already did at enrolment.
  if (!isReturning && !privacyAccepted) {
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

  const { data: existingLead } = await supabase
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, booking_status, client_status, email_verified_at, first_page_visited",
    )
    .eq("email_norm", email)
    .maybeSingle();

  let contact: ContactHit | null = null;
  {
    const { data: byEmail } = await supabase
      .from("portal_parent_contacts")
      .select("parent_display, parent_first_name, parent_last_name, email, mobile")
      .eq("email_norm", email)
      .limit(1)
      .maybeSingle();
    if (byEmail) contact = byEmail as ContactHit;
  }
  if (!contact && phone10.length >= 10) {
    const { data: byPhone } = await supabase
      .from("portal_parent_contacts")
      .select("parent_display, parent_first_name, parent_last_name, email, mobile")
      .eq("phone_lookup", phone10)
      .limit(1)
      .maybeSingle();
    if (byPhone) contact = byPhone as ContactHit;
  }

  const contactName = sanitizeParentName(
    String(
      contact?.parent_display ||
        [contact?.parent_first_name, contact?.parent_last_name].filter(Boolean).join(" ") ||
        "",
    ),
  );
  const contactMobile =
    normalizePhoneE164(String(contact?.mobile || "")) ||
    String(contact?.mobile || "").replace(/\s+/g, "");

  let parentName = sanitizeParentName(
    String(body.parent_name || body.first_name || body.name || ""),
  );
  let mobile = mobileNorm;
  let recognition: "new" | "returning_lead" | "existing_client" = "new";
  let clientStatus = "prospective";

  if (isReturning) {
    if (!existingLead && !contact) {
      return bookingLeadJson({ ok: false, error: "not_recognised" }, 404);
    }
    if (contact) {
      recognition = "existing_client";
      clientStatus = "active_client";
      if (!parentName) parentName = contactName;
      if (!mobile || mobile.replace(/\D/g, "").length < 10) mobile = contactMobile;
    } else {
      recognition = "returning_lead";
      const st = String(existingLead?.client_status || "prospective");
      clientStatus =
        st === "active_client" || st === "registered" ? st : "registered";
      parentName = sanitizeParentName(String(existingLead?.parent_name || "")) || parentName;
      mobile =
        normalizePhoneE164(String(existingLead?.mobile || "")) ||
        String(existingLead?.mobile || "").replace(/\s+/g, "") ||
        mobile;
    }
    if (!parentName || parentName.length < 2) {
      return bookingLeadJson({ ok: false, error: "parent_name_required" }, 400);
    }
    if (!mobile || mobile.replace(/\D/g, "").length < 10) {
      return bookingLeadJson({ ok: false, error: "mobile_invalid" }, 400);
    }
  } else {
    if (!parentName || parentName.length < 2) {
      return bookingLeadJson({ ok: false, error: "parent_name_required" }, 400);
    }
    if (!mobile || mobile.replace(/\D/g, "").length < 10) {
      return bookingLeadJson({ ok: false, error: "mobile_invalid" }, 400);
    }
    if (contact) {
      recognition = "existing_client";
      clientStatus = "active_client";
    } else if (existingLead?.email_verified_at || existingLead?.client_status === "registered") {
      recognition = "returning_lead";
      clientStatus = "registered";
    } else if (existingLead?.client_status === "active_client") {
      recognition = "existing_client";
      clientStatus = "active_client";
    }
  }

  let leadId = existingLead?.id as string | undefined;

  if (leadId) {
    const patch: Record<string, unknown> = {
      parent_name: parentName,
      email,
      mobile,
      marketing_consent: marketingConsent,
      privacy_notice_version: privacyVersion,
      privacy_accepted_at: nowIso,
      last_activity_at: nowIso,
      updated_at: nowIso,
      client_status: clientStatus,
    };
    if (!existingLead?.first_page_visited && firstPage) patch.first_page_visited = firstPage;
    await supabase.from("portal_booking_leads").update(patch).eq("id", leadId);
  } else {
    const { data: inserted, error: insertLeadErr } = await supabase
      .from("portal_booking_leads")
      .insert({
        parent_name: parentName,
        email,
        mobile,
        marketing_consent: marketingConsent,
        privacy_notice_version: privacyVersion,
        privacy_accepted_at: nowIso,
        source: recognition === "existing_client" ? "Existing Client" : "Booking Page",
        first_page_visited: firstPage || "/bookingportal",
        booking_status: "new_lead",
        registration_status: "not_started",
        client_status: clientStatus,
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
      recognition,
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
  const greeting = parentName || "there";
  if (smtp) {
    const mail = await sendParentEmailViaSmtp({
      config: smtp,
      to: email,
      subject: "Your clubSENsational booking access code",
      bodyText:
        `Hello ${greeting},\n\n` +
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
    recognition,
  });
});
