// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-makeup-offer
// Offer a concrete slot BY VENUE to an open grant. Withdraw pending offer (grant returns to open).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  applyAcceptedMakeupToRoster,
  normalizeStaffRosterKey,
  parseMakeupSessionTime,
} from "../_shared/parent_portal_makeup_roster.ts";
import { notifyMakeupConfirmed } from "../_shared/portal_makeup_confirmed_notify.ts";
import {
  normalizeParentPhoneE164,
  sendParentMobileMessage,
} from "../_shared/portal_parent_messaging.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isPgTime(s: string): boolean {
  return /^\d{2}:\d{2}(:\d{2})?$/.test(s);
}

function prettySessionDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const wd = names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] || "";
  return `${wd} ${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`.trim();
}

async function notifyParentMakeupToValidate(
  admin: ReturnType<typeof createClient>,
  grant: Record<string, unknown>,
  offer: Record<string, unknown>,
) {
  const parentPersonId = clean(grant.parent_person_id, 80);
  const contactId = clean(grant.contact_id, 80);
  let q = admin
    .from("portal_parent_contacts")
    .select("parent_display, parent_first_name, mobile");
  if (parentPersonId && contactId) {
    q = q.eq("parent_person_id", parentPersonId).eq("contact_id", contactId);
  } else if (parentPersonId) {
    q = q.eq("parent_person_id", parentPersonId);
  } else if (contactId) {
    q = q.eq("contact_id", contactId);
  } else {
    return { ok: false, skipped: true, reason: "no_parent" };
  }
  const { data: parent } = await q.limit(1).maybeSingle();
  const phone = normalizeParentPhoneE164(clean(parent?.mobile, 40));
  if (!phone) return { ok: false, skipped: true, reason: "no_phone" };
  const parentName =
    clean(parent?.parent_display || parent?.parent_first_name, 80) || "there";
  const child = clean(grant.participant_display, 80) || "your child";
  const when = [
    clean(offer.service_label, 80),
    clean(offer.venue, 40),
    prettySessionDate(clean(String(offer.session_date || ""), 12)),
    clean(offer.session_time, 40),
    clean(offer.instructor_name, 40) ? "with " + clean(offer.instructor_name, 40) : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const portal =
    clean(Deno.env.get("PORTAL_PARENT_PORTAL_URL"), 200) ||
    "https://www.clubsensational.org/parent";
  const bodyText =
    `Hi ${parentName},\n\n` +
    `A makeup is ready for ${child}: ${when}.\n\n` +
    `Please open the parent portal and Accept or Decline so we can confirm the place:\n` +
    `${portal}\n\n` +
    `— clubSENsational`;
  const sent = await sendParentMobileMessage(phone, bodyText, { kind: "makeup_offer" });
  return sent.ok
    ? { ok: true, id: sent.id }
    : { ok: false, error: sent.error || "send_failed" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: {
    action?: string;
    grant_id?: string;
    offer_id?: string;
    venue?: string;
    session_date?: string;
    session_time?: string;
    service_label?: string;
    instructor_name?: string;
    area?: string;
    offer_notes?: string;
    anchor_staff_id?: string;
    anchor_start?: string;
    anchor_end?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = clean(body.action, 20).toLowerCase() || "create";
  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();

  if (action === "withdraw") {
    const offerId = clean(body.offer_id, 60);
    if (!offerId) return portalAdminJson(400, { ok: false, error: "offer_id_required" });
    const { data: offer, error: loadErr } = await admin
      .from("portal_parent_makeup_offers")
      .select("id, grant_id, status")
      .eq("id", offerId)
      .maybeSingle();
    if (loadErr || !offer) return portalAdminJson(404, { ok: false, error: "not_found" });
    if (offer.status !== "pending") {
      return portalAdminJson(409, { ok: false, error: "not_pending" });
    }
    await admin
      .from("portal_parent_makeup_offers")
      .update({ status: "withdrawn", updated_at: now, responded_at: now })
      .eq("id", offerId);
    await admin
      .from("portal_parent_makeup_grants")
      .update({ status: "open", updated_at: now })
      .eq("id", offer.grant_id)
      .eq("status", "offered");
    return portalAdminJson(200, { ok: true, withdrawn: true });
  }

  const grantId = clean(body.grant_id, 60);
  const venue = clean(body.venue, 80);
  const sessionDate = clean(body.session_date, 12);
  const sessionTime = clean(body.session_time, 40);
  const serviceLabel = clean(body.service_label, 160);
  const instructorName = clean(body.instructor_name, 120);
  const area = clean(body.area, 80);
  const offerNotes = clean(body.offer_notes, 800);
  const staffFromBody = normalizeStaffRosterKey(clean(body.anchor_staff_id, 80));
  const staffFromName = normalizeStaffRosterKey(instructorName);
  const anchorStaffId = staffFromBody || staffFromName;
  const parsedTime = parseMakeupSessionTime(sessionTime, sessionDate);
  let anchorStart = clean(body.anchor_start, 12);
  let anchorEnd = clean(body.anchor_end, 12);
  if (anchorStart && !isPgTime(anchorStart)) anchorStart = "";
  if (anchorEnd && !isPgTime(anchorEnd)) anchorEnd = "";
  if (!anchorStart && parsedTime) anchorStart = parsedTime.start;
  if (!anchorEnd && parsedTime) anchorEnd = parsedTime.end;

  if (!grantId) return portalAdminJson(400, { ok: false, error: "grant_id_required" });
  if (!venue) return portalAdminJson(400, { ok: false, error: "venue_required" });
  if (!isIsoDate(sessionDate)) {
    return portalAdminJson(400, { ok: false, error: "session_date_required" });
  }
  if (!anchorStaffId) {
    return portalAdminJson(400, {
      ok: false,
      error: "instructor_required",
      message: "Instructor is required so Accept can place the makeup on the roster.",
    });
  }
  if (!sessionTime) {
    return portalAdminJson(400, {
      ok: false,
      error: "session_time_required",
      message: "Time slot is required (e.g. 5 to 5.30).",
    });
  }

  const { data: grant, error: gErr } = await admin
    .from("portal_parent_makeup_grants")
    .select("*")
    .eq("id", grantId)
    .maybeSingle();
  if (gErr || !grant) return portalAdminJson(404, { ok: false, error: "grant_not_found" });
  if (grant.status !== "open") {
    return portalAdminJson(409, {
      ok: false,
      error: "grant_not_open",
      status: grant.status,
      message:
        grant.status === "offered"
          ? "This grant already has a pending offer. Withdraw it first or wait for the family."
          : "Grant is closed.",
    });
  }

  // Venue must match preferred (policy: offer by venue so families are not asked to travel).
  const preferred = clean(grant.preferred_venue, 80).toLowerCase();
  if (preferred && preferred !== venue.toLowerCase()) {
    return portalAdminJson(400, {
      ok: false,
      error: "venue_mismatch",
      message: `Offer venue must match preferred venue (${grant.preferred_venue}).`,
    });
  }

  const { data: offer, error: oErr } = await admin
    .from("portal_parent_makeup_offers")
    .insert({
      grant_id: grantId,
      parent_person_id: grant.parent_person_id,
      contact_id: grant.contact_id,
      venue,
      session_date: sessionDate,
      session_time: sessionTime,
      service_label: serviceLabel || grant.service_label || "",
      instructor_name: instructorName,
      area,
      offer_notes: offerNotes || null,
      anchor_staff_id: anchorStaffId,
      anchor_start: anchorStart || null,
      anchor_end: anchorEnd || null,
      status: "pending",
      offered_by: verified.userId || null,
      offered_at: now,
      updated_at: now,
    })
    .select("*")
    .maybeSingle();

  if (oErr) {
    console.error("[portal-admin-makeup-offer]", oErr.message);
    return portalAdminJson(500, { ok: false, error: "save_failed" });
  }

  await admin
    .from("portal_parent_makeup_grants")
    .update({ status: "offered", updated_at: now })
    .eq("id", grantId);

  if (body.await_parent === true) {
    const parent_notify = await notifyParentMakeupToValidate(admin, grant, offer);
    return portalAdminJson(200, {
      ok: true,
      offer,
      grant_id: grantId,
      pending_parent_accept: true,
      parent_notify,
    });
  }

  const roster = await applyAcceptedMakeupToRoster(
    admin,
    offer,
    grant,
    verified.userId || null,
  );

  if (!roster.override_id) {
    console.error("[portal-admin-makeup-offer] roster", roster.error);
    return portalAdminJson(200, {
      ok: true,
      offer,
      grant_id: grantId,
      roster_override_id: null,
      pending_parent_accept: true,
      message:
        "Offer saved but the seat could not be placed on the roster yet. Parent can still Accept, or pick the seat again.",
    });
  }

  await admin
    .from("portal_parent_makeup_offers")
    .update({
      status: "accepted",
      responded_at: now,
      updated_at: now,
      roster_override_id: roster.override_id,
      roster_applied_at: now,
    })
    .eq("id", offer.id);
  await admin
    .from("portal_parent_makeup_grants")
    .update({ status: "consumed", closed_at: now, updated_at: now })
    .eq("id", grantId);

  let makeup_notify = null;
  try {
    makeup_notify = await notifyMakeupConfirmed(admin, {
      parentPersonId: grant.parent_person_id,
      contactId: grant.contact_id || offer.contact_id || null,
      participantDisplay: grant.participant_display || null,
      venue: offer.venue || grant.preferred_venue || null,
      sessionDate: offer.session_date || null,
      sessionTime: offer.session_time || null,
      serviceLabel: offer.service_label || grant.service_label || null,
      instructorName: offer.instructor_name || null,
      instructorStaffKey: offer.anchor_staff_id || offer.instructor_name || null,
      source: "office_makeup_place",
      overrideId: roster.override_id,
      offerId: offer.id,
      grantId: grantId,
      actorEmail: "portal-admin-makeup-offer",
    });
  } catch (e) {
    console.error("[portal-admin-makeup-offer] makeup_notify", e);
    makeup_notify = { ok: false, error: "notify_failed" };
  }

  return portalAdminJson(200, {
    ok: true,
    offer: { ...offer, status: "accepted", roster_override_id: roster.override_id },
    grant_id: grantId,
    roster_override_id: roster.override_id,
    makeup_notify,
    placed_on_roster: true,
  });
});
