// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-makeup-list
// Admin waiting list of makeup grants + pending offers (filter by venue / status).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

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

  let body: { status?: string; venue?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const statusFilter = String(body.status || "open").trim().toLowerCase();
  const venueFilter = String(body.venue || "").trim();
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 300);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let gq = admin
    .from("portal_parent_makeup_grants")
    .select(
      "id, parent_person_id, contact_id, participant_display, absence_report_id, preferred_venue, service_label, status, source, notes, created_at, updated_at, closed_at",
    )
    .order("created_at", { ascending: true })
    .limit(limit);

  if (statusFilter && statusFilter !== "all") {
    gq = gq.eq("status", statusFilter);
  }
  if (venueFilter) {
    gq = gq.ilike("preferred_venue", venueFilter);
  }

  const { data: grants, error: gErr } = await gq;
  if (gErr) {
    console.error("[portal-admin-makeup-list] grants", gErr.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  const grantIds = (grants || []).map((g) => g.id);
  let offers: Record<string, unknown>[] = [];
  if (grantIds.length) {
    const { data: offerRows, error: oErr } = await admin
      .from("portal_parent_makeup_offers")
      .select(
        "id, grant_id, venue, session_date, session_time, service_label, instructor_name, area, offer_notes, status, decline_reason, offered_at, responded_at",
      )
      .in("grant_id", grantIds)
      .order("offered_at", { ascending: false });
    if (oErr) {
      console.error("[portal-admin-makeup-list] offers", oErr.message);
    } else {
      offers = offerRows || [];
    }
  }

  const offersByGrant: Record<string, Record<string, unknown>[]> = {};
  for (const o of offers) {
    const gid = String(o.grant_id || "");
    if (!offersByGrant[gid]) offersByGrant[gid] = [];
    offersByGrant[gid].push(o);
  }

  const rows = (grants || []).map((g) => {
    const list = offersByGrant[g.id] || [];
    const pending = list.find((o) => o.status === "pending") || null;
    return { ...g, pending_offer: pending, offers: list };
  });

  const openCount = rows.filter((r) => r.status === "open").length;
  const offeredCount = rows.filter((r) => r.status === "offered").length;

  return portalAdminJson(200, {
    ok: true,
    grants: rows,
    meta: { open: openCount, offered: offeredCount },
  });
});
