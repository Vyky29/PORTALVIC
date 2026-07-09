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
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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

  if (!grantId) return portalAdminJson(400, { ok: false, error: "grant_id_required" });
  if (!venue) return portalAdminJson(400, { ok: false, error: "venue_required" });
  if (!isIsoDate(sessionDate)) {
    return portalAdminJson(400, { ok: false, error: "session_date_required" });
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

  // Soft notify parent inbox.
  try {
    const { data: parentMeta } = await admin
      .from("portal_parent_contacts")
      .select("parent_display, mobile")
      .eq("parent_person_id", grant.parent_person_id)
      .limit(1)
      .maybeSingle();
    const phone = normalizeParentPhoneE164(String(parentMeta?.mobile || "").trim());
    if (phone) {
      const parentName = clean(parentMeta?.parent_display, 120) || "Parent";
      const bodyText =
        `Makeup offer for ${grant.participant_display || "participant"}` +
        `\nVenue: ${venue}` +
        `\nDate: ${sessionDate}` +
        (sessionTime ? ` · ${sessionTime}` : "") +
        (serviceLabel || grant.service_label
          ? ` · ${serviceLabel || grant.service_label}`
          : "") +
        (instructorName ? `\nInstructor: ${instructorName}` : "") +
        `\n\nPlease Accept or Decline in the parent portal. If you decline, this makeup grant is forfeited and the slot may be offered to another family.` +
        (offerNotes ? `\n\nNote: ${offerNotes}` : "");
      await admin.from("portal_parent_whatsapp_inbound").insert({
        wa_message_id: `app:makeup-offer:${offer?.id || crypto.randomUUID()}`,
        from_phone: phone,
        contact_name: parentName,
        message_type: "text",
        body_text: bodyText,
        context_wa_id: null,
        created_at: now,
        meta: {
          source: "parent_portal_makeup_offer",
          parent_person_id: grant.parent_person_id,
          contact_id: grant.contact_id,
          grant_id: grantId,
          offer_id: offer?.id || null,
          direction_hint: "club_to_parent",
        },
      });
    }
  } catch (e) {
    console.error("[portal-admin-makeup-offer] notify", e);
  }

  return portalAdminJson(200, { ok: true, offer, grant_id: grantId });
});
