// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-makeup-respond
// Parent Accept → grant consumed + schedule_overrides MakeUp on open slot.
// Decline → grant FORFEITED (slot goes to next family).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { applyAcceptedMakeupToRoster } from "../_shared/parent_portal_makeup_roster.ts";
import { notifyMakeupConfirmed } from "../_shared/portal_makeup_confirmed_notify.ts";

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: { offer_id?: string; action?: string; decline_reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const offerId = clean(body.offer_id, 60);
  const action = clean(body.action, 20).toLowerCase();
  const declineReason = clean(body.decline_reason, 400);

  if (!offerId) return json(400, { ok: false, error: "offer_id_required" });
  if (action !== "accept" && action !== "decline") {
    return json(400, { ok: false, error: "action_required" });
  }

  const { data: offer, error: loadErr } = await supabase
    .from("portal_parent_makeup_offers")
    .select("*")
    .eq("id", offerId)
    .eq("parent_person_id", session.parent_person_id)
    .maybeSingle();

  if (loadErr || !offer) return json(404, { ok: false, error: "not_found" });
  if (offer.status !== "pending") {
    return json(409, { ok: false, error: "not_pending", status: offer.status });
  }

  const now = new Date().toISOString();

  if (action === "accept") {
    const { data: grant } = await supabase
      .from("portal_parent_makeup_grants")
      .select("id, participant_display, contact_id, preferred_venue, service_label, status")
      .eq("id", offer.grant_id)
      .maybeSingle();

    const roster = await applyAcceptedMakeupToRoster(
      supabase,
      offer,
      grant || {
        participant_display: "",
        contact_id: offer.contact_id,
        preferred_venue: offer.venue,
        service_label: offer.service_label,
      },
      null,
    );

    if (!roster.override_id) {
      return json(500, {
        ok: false,
        error: "roster_apply_failed",
        detail: roster.error || "unknown",
        message:
          roster.error === "staff_required" || roster.error === "time_required"
            ? "This offer is missing instructor or time — ask the office to re-offer the slot."
            : "Could not place this makeup on the roster. Please contact the office.",
      });
    }

    const { data: updated, error } = await supabase
      .from("portal_parent_makeup_offers")
      .update({ status: "accepted", responded_at: now, updated_at: now })
      .eq("id", offerId)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (error || !updated) {
      return json(500, { ok: false, error: "update_failed" });
    }
    await supabase
      .from("portal_parent_makeup_grants")
      .update({ status: "consumed", closed_at: now, updated_at: now })
      .eq("id", offer.grant_id);

    // Confirmed makeup: notify parent + instructor (real WA/email, not soft inbox only).
    let makeup_notify = null;
    try {
      makeup_notify = await notifyMakeupConfirmed(supabase, {
        parentPersonId: session.parent_person_id,
        contactId: offer.contact_id || grant?.contact_id || null,
        participantDisplay: grant?.participant_display || null,
        venue: offer.venue || grant?.preferred_venue || null,
        sessionDate: offer.session_date || null,
        sessionTime: offer.session_time || null,
        serviceLabel: offer.service_label || grant?.service_label || null,
        instructorName: offer.instructor_name || null,
        instructorStaffKey: offer.anchor_staff_id || offer.instructor_name || null,
        source: "parent_portal_makeup_accept",
        overrideId: roster.override_id,
        offerId: offerId,
        grantId: offer.grant_id,
        actorEmail: "parent-portal-makeup-respond",
      });
    } catch (e) {
      console.error("[parent-portal-makeup-respond] makeup_notify", e);
      makeup_notify = { ok: false, error: "notify_failed" };
    }

    return json(200, {
      ok: true,
      offer: updated,
      roster_override_id: roster.override_id,
      makeup_notify,
      message: "Accepted. This makeup is now on the club roster.",
    });
  }

  // decline → forfeit grant (waiting-list: slot offered to next family)
  const { data: updated, error } = await supabase
    .from("portal_parent_makeup_offers")
    .update({
      status: "declined",
      decline_reason: declineReason || null,
      responded_at: now,
      updated_at: now,
    })
    .eq("id", offerId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error || !updated) {
    return json(500, { ok: false, error: "update_failed" });
  }
  await supabase
    .from("portal_parent_makeup_grants")
    .update({ status: "forfeited", closed_at: now, updated_at: now })
    .eq("id", offer.grant_id);

  return json(200, {
    ok: true,
    offer: updated,
    message:
      "Declined. This makeup grant is forfeited — the slot may be offered to another family.",
    forfeited: true,
  });
});
