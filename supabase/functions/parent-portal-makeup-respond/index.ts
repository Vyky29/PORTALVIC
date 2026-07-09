// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-makeup-respond
// Parent Accept → grant consumed. Decline → grant FORFEITED (slot goes to next family).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

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
    return json(200, {
      ok: true,
      offer: updated,
      message:
        "Accepted. The office will confirm this makeup on the roster. Thank you.",
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
