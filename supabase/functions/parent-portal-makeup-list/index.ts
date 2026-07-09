// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-makeup-list
// Parent sees open grants + pending offers for a participant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
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

  let body: { contact_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!participant) {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
  }

  const { data: grants, error } = await supabase
    .from("portal_parent_makeup_grants")
    .select(
      "id, contact_id, participant_display, preferred_venue, service_label, status, source, notes, created_at, closed_at",
    )
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[parent-portal-makeup-list]", error.message);
    return parentPortalJsonInvalid(500);
  }

  const grantIds = (grants || []).map((g) => g.id);
  let offers: Record<string, unknown>[] = [];
  if (grantIds.length) {
    const { data: offerRows } = await supabase
      .from("portal_parent_makeup_offers")
      .select(
        "id, grant_id, venue, session_date, session_time, service_label, instructor_name, area, offer_notes, status, decline_reason, offered_at, responded_at, roster_override_id, roster_applied_at",
      )
      .in("grant_id", grantIds)
      .order("offered_at", { ascending: false });
    offers = offerRows || [];
  }

  const byGrant: Record<string, Record<string, unknown>[]> = {};
  for (const o of offers) {
    const gid = String(o.grant_id || "");
    if (!byGrant[gid]) byGrant[gid] = [];
    byGrant[gid].push(o);
  }

  const rows = (grants || []).map((g) => {
    const list = byGrant[g.id] || [];
    return {
      ...g,
      pending_offer: list.find((o) => o.status === "pending") || null,
      offers: list,
    };
  });

  return json(200, {
    ok: true,
    grants: rows,
    pending_count: rows.filter((r) => r.pending_offer).length,
  });
});
