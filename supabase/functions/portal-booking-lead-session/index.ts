// @ts-nocheck — Edge Function (Deno).
//
// portal-booking-lead-session
// ---------------------------
// Validate lead session, return profile for prefill, optionally record activity.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  bookingLeadCorsHeaders,
  bookingLeadJson,
  clientDeviceFromRequest,
  clientIp,
  sha256Hex,
} from "../_shared/booking_lead_auth.ts";

const STATUS_RANK: Record<string, number> = {
  new_lead: 0,
  exploring_services: 1,
  waiting_list: 2,
  registration_started: 3,
  booking_started: 3,
  registration_submitted: 4,
  booking_completed: 5,
  no_booking: 1,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: bookingLeadCorsHeaders });
  }
  if (req.method !== "POST") {
    return bookingLeadJson({ ok: false, error: "method_not_allowed" }, 405);
  }

  const token = String(req.headers.get("x-booking-lead-session") || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return bookingLeadJson({ ok: false, error: "unauthorized" }, 401);
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

  const tokenHash = await sha256Hex(token);
  const { data: sess } = await supabase
    .from("portal_booking_lead_sessions")
    .select("id, lead_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!sess || sess.revoked_at || new Date(String(sess.expires_at)).getTime() < Date.now()) {
    return bookingLeadJson({ ok: false, error: "unauthorized" }, 401);
  }

  const { data: lead } = await supabase
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, marketing_consent, privacy_notice_version, booking_status, registration_status, client_status, services_viewed, first_page_visited",
    )
    .eq("id", sess.lead_id)
    .maybeSingle();

  if (!lead) return bookingLeadJson({ ok: false, error: "unauthorized" }, 401);

  const nowIso = new Date().toISOString();
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";

  await supabase
    .from("portal_booking_lead_sessions")
    .update({
      last_used_at: nowIso,
      client_device: clientDeviceFromRequest(req),
      ip_hash: ip ? await sha256Hex(ip) : null,
      user_agent_hash: ua ? await sha256Hex(ua) : null,
    })
    .eq("id", sess.id);

  const patch: Record<string, unknown> = {
    last_activity_at: nowIso,
    updated_at: nowIso,
  };

  const serviceViewed = String(body.service_viewed || "").trim().slice(0, 80);
  if (serviceViewed) {
    const current = Array.isArray(lead.services_viewed) ? lead.services_viewed : [];
    if (!current.includes(serviceViewed)) {
      patch.services_viewed = [...current, serviceViewed].slice(0, 40);
    }
  }

  const wantedStatus = String(body.booking_status || "").trim();
  if (wantedStatus && Object.prototype.hasOwnProperty.call(STATUS_RANK, wantedStatus)) {
    const cur = STATUS_RANK[String(lead.booking_status)] ?? 0;
    const next = STATUS_RANK[wantedStatus] ?? 0;
    if (next >= cur) patch.booking_status = wantedStatus;
  }

  const wantedReg = String(body.registration_status || "").trim();
  if (wantedReg === "started" || wantedReg === "submitted") {
    const order = { not_started: 0, started: 1, submitted: 2 };
    const cur = order[String(lead.registration_status) as keyof typeof order] ?? 0;
    const next = order[wantedReg as keyof typeof order] ?? 0;
    if (next >= cur) patch.registration_status = wantedReg;
  }

  if (Object.keys(patch).length > 2 || serviceViewed || wantedStatus || wantedReg) {
    await supabase.from("portal_booking_leads").update(patch).eq("id", lead.id);
  }

  const { data: refreshed } = await supabase
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, marketing_consent, privacy_notice_version, booking_status, registration_status, client_status, services_viewed",
    )
    .eq("id", lead.id)
    .maybeSingle();

  const row = refreshed || lead;

  return bookingLeadJson({
    ok: true,
    expires_at: sess.expires_at,
    lead: {
      id: row.id,
      parent_name: row.parent_name,
      first_name: row.parent_name,
      email: row.email,
      parent_email: row.email,
      mobile: row.mobile,
      parent_phone: row.mobile,
      marketing_consent: !!row.marketing_consent,
      privacy_notice_version: row.privacy_notice_version,
      booking_status: row.booking_status,
      registration_status: row.registration_status,
      client_status: row.client_status,
      services_viewed: row.services_viewed || [],
    },
  });
});
