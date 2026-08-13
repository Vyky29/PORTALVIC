// @ts-nocheck — Edge Function (Deno).
//
// portal-booking-waitlist-join
// ---------------------------
// Booking Portal: join waiting list for a capacity-full bookable slot.
// Auth: x-booking-lead-session (same as portal-booking-lead-session).
//
// Deploy:
//   npx supabase functions deploy portal-booking-waitlist-join --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  bookingLeadCorsHeaders,
  bookingLeadJson,
  normalizeEmail,
  sanitizeParentName,
  sha256Hex,
} from "../_shared/booking_lead_auth.ts";
import { notifyOfficeWaitlistJoin } from "../_shared/portal_booking_lead_office_notify.ts";

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

function sanitizeText(raw: unknown, max: number): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

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

  const slotId = sanitizeText(body.slot_id, 120);
  const participantName = sanitizeParentName(String(body.participant_name || ""));
  const note = sanitizeText(body.note, 500) || null;
  const serviceKey = sanitizeText(body.service_key || body.service_id, 80);
  const serviceLabel = sanitizeText(body.service_label || body.service_name, 160);
  const venue = sanitizeText(body.venue, 120);
  const dayName = sanitizeText(body.day_name || body.day, 40);
  const timeLabel = sanitizeText(body.time_label, 80);

  if (!slotId) {
    return bookingLeadJson({ ok: false, error: "slot_required" }, 400);
  }
  if (!participantName || participantName.length < 2) {
    return bookingLeadJson({ ok: false, error: "participant_name_required" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKeyEnv = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKeyEnv) {
    return bookingLeadJson({ ok: false, error: "server_misconfigured" }, 503);
  }

  const supabase = createClient(url, serviceKeyEnv, {
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
    .select("id, parent_name, email, mobile, booking_status")
    .eq("id", sess.lead_id)
    .maybeSingle();

  if (!lead) {
    return bookingLeadJson({ ok: false, error: "unauthorized" }, 401);
  }

  const parentName = sanitizeParentName(String(lead.parent_name || "")) || "Parent / carer";
  const email = normalizeEmail(String(lead.email || ""));
  const mobile = sanitizeText(lead.mobile, 40);
  const nowIso = new Date().toISOString();

  if (email) {
    const { data: existing } = await supabase
      .from("portal_waitlist_entries")
      .select(
        "id, participant_name, parent_name, email, mobile, service_key, service_label, venue, day_name, time_label, slot_id, note, status, created_at",
      )
      .eq("slot_id", slotId)
      .eq("status", "active")
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      void notifyOfficeWaitlistJoin({
        entryId: String(existing.id),
        leadId: String(lead.id),
        participantName: String(existing.participant_name || participantName),
        parentName: String(existing.parent_name || parentName),
        email,
        mobile: String(existing.mobile || mobile),
        serviceLabel: String(existing.service_label || serviceLabel),
        dayName: String(existing.day_name || dayName),
        timeLabel: String(existing.time_label || timeLabel),
        venue: String(existing.venue || venue),
        slotId,
        note: existing.note || note,
        alreadyJoined: true,
      }).catch(() => {});

      return bookingLeadJson({
        ok: true,
        already_joined: true,
        entry: existing,
        message: "already_joined",
      });
    }
  }

  const insertRow = {
    lead_id: lead.id,
    participant_name: participantName,
    parent_name: parentName,
    email: email || "",
    mobile: mobile || "",
    service_key: serviceKey,
    service_label: serviceLabel,
    venue,
    day_name: dayName,
    time_label: timeLabel,
    slot_id: slotId,
    note,
    source: "booking_portal",
    status: "active",
    updated_at: nowIso,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("portal_waitlist_entries")
    .insert(insertRow)
    .select(
      "id, participant_name, parent_name, email, mobile, service_key, service_label, venue, day_name, time_label, slot_id, note, status, created_at",
    )
    .maybeSingle();

  if (insErr) {
    // Race on unique index → treat as already joined.
    if (String(insErr.code || "") === "23505" || /duplicate|unique/i.test(String(insErr.message || ""))) {
      const { data: raced } = await supabase
        .from("portal_waitlist_entries")
        .select(
          "id, participant_name, parent_name, email, mobile, service_key, service_label, venue, day_name, time_label, slot_id, note, status, created_at",
        )
        .eq("slot_id", slotId)
        .eq("status", "active")
        .ilike("email", email || "__none__")
        .maybeSingle();
      return bookingLeadJson({
        ok: true,
        already_joined: true,
        entry: raced || null,
        message: "already_joined",
      });
    }
    console.error("[portal-booking-waitlist-join] insert", insErr.message);
    return bookingLeadJson({ ok: false, error: "insert_failed" }, 500);
  }

  const curRank = STATUS_RANK[String(lead.booking_status)] ?? 0;
  const nextRank = STATUS_RANK.waiting_list ?? 2;
  if (nextRank >= curRank) {
    await supabase
      .from("portal_booking_leads")
      .update({
        booking_status: "waiting_list",
        last_activity_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", lead.id);
  } else {
    await supabase
      .from("portal_booking_leads")
      .update({ last_activity_at: nowIso, updated_at: nowIso })
      .eq("id", lead.id);
  }

  await supabase
    .from("portal_booking_lead_sessions")
    .update({ last_used_at: nowIso })
    .eq("id", sess.id);

  if (inserted) {
    void notifyOfficeWaitlistJoin({
      entryId: String(inserted.id),
      leadId: String(lead.id),
      participantName,
      parentName,
      email,
      mobile,
      serviceLabel,
      dayName,
      timeLabel,
      venue,
      slotId,
      note,
      alreadyJoined: false,
    }).catch(() => {});
  }

  return bookingLeadJson({
    ok: true,
    already_joined: false,
    entry: inserted,
  });
});
