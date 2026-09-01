// @ts-nocheck — Edge Function (Deno).
//
// portal-booking-lead-from-parent-session
// ----------------------------------------
// Mint a Booking Portal lead session from a valid Family Portal session
// (no OTP). Header: x-parent-portal-session
//
// Deploy:
//   supabase functions deploy portal-booking-lead-from-parent-session --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  BOOKING_LEAD_PRIVACY_NOTICE_VERSION,
  BOOKING_LEAD_SESSION_TTL_MS,
  bookingLeadCorsHeaders,
  bookingLeadJson,
  clientDeviceFromRequest,
  clientIp,
  isValidEmail,
  newSessionToken,
  normalizeEmail,
  normalizePhoneE164,
  sanitizeParentName,
  sha256Hex,
} from "../_shared/booking_lead_auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: bookingLeadCorsHeaders });
  }
  if (req.method !== "POST") {
    return bookingLeadJson({ ok: false, error: "method_not_allowed" }, 405);
  }

  const parentToken = String(req.headers.get("x-parent-portal-session") || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(parentToken)) {
    return bookingLeadJson({ ok: false, error: "invalid_session" }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    return bookingLeadJson({ ok: false, error: "server_misconfigured" }, 503);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(parentToken);
  const { data: sess, error: sessErr } = await supabase
    .from("portal_parent_portal_sessions")
    .select("id, parent_person_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (sessErr || !sess || sess.revoked_at) {
    return bookingLeadJson({ ok: false, error: "invalid_session" }, 401);
  }
  if (new Date(sess.expires_at).getTime() < Date.now()) {
    return bookingLeadJson({ ok: false, error: "invalid_session" }, 401);
  }

  const parentPersonId = String(sess.parent_person_id || "").trim();
  if (!parentPersonId) {
    return bookingLeadJson({ ok: false, error: "invalid_session" }, 401);
  }

  await supabase
    .from("portal_parent_portal_sessions")
    .update({
      last_used_at: new Date().toISOString(),
      client_device: clientDeviceFromRequest(req),
    })
    .eq("id", sess.id);

  const { data: contactRows } = await supabase
    .from("portal_parent_contacts")
    .select(
      "parent_display, parent_first_name, parent_last_name, email, mobile, email_norm",
    )
    .eq("parent_person_id", parentPersonId)
    .limit(20);

  const contacts = contactRows || [];
  const contact =
    contacts.find((r) => isValidEmail(String(r.email || r.email_norm || ""))) ||
    contacts[0] ||
    null;

  if (!contact) {
    return bookingLeadJson({ ok: false, error: "parent_not_found" }, 404);
  }

  const email = normalizeEmail(String(contact.email || contact.email_norm || ""));
  if (!isValidEmail(email)) {
    return bookingLeadJson({ ok: false, error: "email_missing" }, 400);
  }

  const parentName = sanitizeParentName(
    String(
      contact.parent_display ||
        [contact.parent_first_name, contact.parent_last_name].filter(Boolean).join(" ") ||
        "",
    ),
  );
  if (!parentName || parentName.length < 2) {
    return bookingLeadJson({ ok: false, error: "parent_name_required" }, 400);
  }

  const mobile =
    normalizePhoneE164(String(contact.mobile || "")) ||
    String(contact.mobile || "").replace(/\s+/g, "");
  if (!mobile || mobile.replace(/\D/g, "").length < 10) {
    return bookingLeadJson({ ok: false, error: "mobile_invalid" }, 400);
  }

  const nowIso = new Date().toISOString();
  const firstPage =
    String(body.first_page_visited || "").trim().slice(0, 200) || "/bookingportal";

  const { data: existingLead } = await supabase
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, marketing_consent, privacy_notice_version, booking_status, registration_status, client_status, email_verified_at, first_page_visited, source",
    )
    .eq("email_norm", email)
    .maybeSingle();

  let leadId = existingLead?.id as string | undefined;
  let bookingStatus = String(existingLead?.booking_status || "exploring_services");
  if (bookingStatus === "new_lead") bookingStatus = "exploring_services";

  if (leadId) {
    const patch: Record<string, unknown> = {
      parent_name: parentName,
      email,
      mobile,
      source: "Existing Client",
      client_status: "active_client",
      booking_status: bookingStatus,
      email_verified_at: existingLead?.email_verified_at || nowIso,
      privacy_notice_version:
        existingLead?.privacy_notice_version || BOOKING_LEAD_PRIVACY_NOTICE_VERSION,
      last_activity_at: nowIso,
      updated_at: nowIso,
    };
    if (!existingLead?.first_page_visited) patch.first_page_visited = firstPage;
    await supabase.from("portal_booking_leads").update(patch).eq("id", leadId);
  } else {
    const { data: inserted, error: insertLeadErr } = await supabase
      .from("portal_booking_leads")
      .insert({
        parent_name: parentName,
        email,
        mobile,
        marketing_consent: false,
        privacy_notice_version: BOOKING_LEAD_PRIVACY_NOTICE_VERSION,
        privacy_accepted_at: nowIso,
        email_verified_at: nowIso,
        source: "Existing Client",
        first_page_visited: firstPage,
        booking_status: "exploring_services",
        registration_status: "not_started",
        client_status: "active_client",
        last_activity_at: nowIso,
      })
      .select("id")
      .single();
    if (insertLeadErr || !inserted?.id) {
      console.error(
        "[portal-booking-lead-from-parent-session] lead insert failed",
        insertLeadErr,
      );
      return bookingLeadJson({ ok: false, error: "lead_create_failed" }, 500);
    }
    leadId = inserted.id;
    bookingStatus = "exploring_services";
  }

  await supabase
    .from("portal_booking_lead_sessions")
    .update({ revoked_at: nowIso })
    .eq("lead_id", leadId)
    .is("revoked_at", null);

  const token = newSessionToken();
  const leadTokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + BOOKING_LEAD_SESSION_TTL_MS).toISOString();
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";

  const { error: leadSessErr } = await supabase.from("portal_booking_lead_sessions").insert({
    lead_id: leadId,
    token_hash: leadTokenHash,
    expires_at: expiresAt,
    ip_hash: ip ? await sha256Hex(ip) : null,
    user_agent_hash: ua ? await sha256Hex(ua) : null,
    client_device: clientDeviceFromRequest(req),
  });
  if (leadSessErr) {
    console.error(
      "[portal-booking-lead-from-parent-session] session insert failed",
      leadSessErr,
    );
    return bookingLeadJson({ ok: false, error: "session_failed" }, 500);
  }

  const { data: lead } = await supabase
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, marketing_consent, privacy_notice_version, booking_status, registration_status, client_status",
    )
    .eq("id", leadId)
    .maybeSingle();

  return bookingLeadJson({
    ok: true,
    session_token: token,
    expires_at: expiresAt,
    lead: {
      id: lead?.id || leadId,
      parent_name: lead?.parent_name || parentName,
      first_name: lead?.parent_name || parentName,
      email: lead?.email || email,
      parent_email: lead?.email || email,
      mobile: lead?.mobile || mobile,
      parent_phone: lead?.mobile || mobile,
      marketing_consent: !!lead?.marketing_consent,
      privacy_notice_version: lead?.privacy_notice_version || BOOKING_LEAD_PRIVACY_NOTICE_VERSION,
      booking_status: lead?.booking_status || bookingStatus,
      registration_status: lead?.registration_status || "not_started",
      client_status: lead?.client_status || "active_client",
    },
  });
});
