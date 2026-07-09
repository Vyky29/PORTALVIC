// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-makeup-respond
// Parent Accept → grant consumed + schedule_overrides MakeUp on open slot.
// Decline → grant FORFEITED (slot goes to next family).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { applyAcceptedMakeupToRoster } from "../_shared/parent_portal_makeup_roster.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";

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

    // Soft notify parent inbox that makeup is on the roster.
    try {
      const { data: parentMeta } = await supabase
        .from("portal_parent_contacts")
        .select("parent_display, mobile")
        .eq("parent_person_id", session.parent_person_id)
        .limit(1)
        .maybeSingle();
      const phone = normalizeParentPhoneE164(String(parentMeta?.mobile || "").trim());
      if (phone) {
        const who = clean(grant?.participant_display, 120) || "participant";
        const bodyText =
          `Makeup confirmed for ${who}` +
          `\n${clean(offer.venue, 80)} · ${clean(offer.session_date, 12)}` +
          (offer.session_time ? ` · ${clean(offer.session_time, 40)}` : "") +
          (offer.instructor_name ? `\nInstructor: ${clean(offer.instructor_name, 120)}` : "") +
          `\n\nThis session is now on the club roster.`;
        await supabase.from("portal_parent_whatsapp_inbound").insert({
          wa_message_id: `app:makeup-accepted:${offerId}`,
          from_phone: phone,
          contact_name: clean(parentMeta?.parent_display, 120) || "Parent",
          message_type: "text",
          body_text: bodyText,
          context_wa_id: null,
          created_at: now,
          meta: {
            source: "parent_portal_makeup_accepted",
            parent_person_id: session.parent_person_id,
            contact_id: offer.contact_id,
            offer_id: offerId,
            roster_override_id: roster.override_id,
            direction_hint: "club_to_parent",
          },
        });
      }
    } catch (e) {
      console.error("[parent-portal-makeup-respond] notify", e);
    }

    return json(200, {
      ok: true,
      offer: updated,
      roster_override_id: roster.override_id,
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
