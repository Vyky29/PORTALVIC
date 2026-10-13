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

function normPerson(v: unknown): string {
  return clean(v, 160)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstToken(v: unknown): string {
  return normPerson(v).split(" ")[0] || "";
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

  // Same child can exist twice (in-class hub vs an older contact). The hub
  // opens the in-class row. Makeups saved on the other row still belong here
  // when the parent name, first name and date of birth match.
  const contactIds = new Set<string>([contactId]);
  const { data: selfContact } = await supabase
    .from("portal_parent_contacts")
    .select("parent_display, child_display, child_first_name, dob_iso")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();
  const { data: selfPax } = await supabase
    .from("portal_participants")
    .select("display_name, first_name, dob_iso")
    .eq("contact_id", contactId)
    .maybeSingle();
  const dob = clean(selfContact?.dob_iso || selfPax?.dob_iso, 10);
  const childFirst = firstToken(
    selfContact?.child_first_name || selfPax?.first_name || selfContact?.child_display || selfPax?.display_name,
  );
  const parentName = normPerson(selfContact?.parent_display);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dob) && childFirst && parentName) {
    const { data: sameDob } = await supabase
      .from("portal_participants")
      .select("contact_id, display_name, first_name")
      .eq("dob_iso", dob)
      .limit(30);
    const twinIds = (sameDob || [])
      .filter((row) => firstToken(row.first_name || row.display_name) === childFirst)
      .map((row) => clean(row.contact_id, 120))
      .filter(Boolean);
    if (twinIds.length) {
      const { data: twinContacts } = await supabase
        .from("portal_parent_contacts")
        .select("contact_id, parent_display")
        .in("contact_id", twinIds);
      for (const row of twinContacts || []) {
        if (normPerson(row.parent_display) !== parentName) continue;
        const id = clean(row.contact_id, 120);
        if (id) contactIds.add(id);
      }
    }
  }

  const { data: grants, error } = await supabase
    .from("portal_parent_makeup_grants")
    .select(
      "id, contact_id, parent_person_id, participant_display, preferred_venue, service_label, status, source, notes, created_at, closed_at",
    )
    .in("contact_id", [...contactIds])
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

  const visible = (grants || []).filter((g) => {
    const cid = String(g.contact_id || "");
    if (cid === contactId) return String(g.parent_person_id || "") === session.parent_person_id;
    return contactIds.has(cid);
  });

  const rows = visible.map((g) => {
    const list = byGrant[g.id] || [];
    const { parent_person_id: _parentPersonId, ...rest } = g;
    return {
      ...rest,
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
