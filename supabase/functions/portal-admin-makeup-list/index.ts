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
        "id, grant_id, venue, session_date, session_time, service_label, instructor_name, area, offer_notes, status, decline_reason, offered_at, responded_at, roster_override_id, roster_applied_at, anchor_staff_id",
      )
      .in("grant_id", grantIds)
      .order("offered_at", { ascending: false });
    if (oErr) {
      console.error("[portal-admin-makeup-list] offers", oErr.message);
    } else {
      offers = offerRows || [];
    }
  }

  const absenceIds = Array.from(
    new Set(
      (grants || [])
        .map((g) => String(g.absence_report_id || "").trim())
        .filter(Boolean),
    ),
  );
  const absenceById: Record<string, Record<string, unknown>> = {};
  if (absenceIds.length) {
    const { data: absRows, error: aErr } = await admin
      .from("portal_parent_absence_reports")
      .select("id, session_date, session_time, service_label, status, outcome")
      .in("id", absenceIds);
    if (aErr) {
      console.error("[portal-admin-makeup-list] absences", aErr.message);
    } else {
      for (const a of absRows || []) {
        absenceById[String(a.id)] = a;
      }
    }
  }

  const offersByGrant: Record<string, Record<string, unknown>[]> = {};
  for (const o of offers) {
    const gid = String(o.grant_id || "");
    if (!offersByGrant[gid]) offersByGrant[gid] = [];
    offersByGrant[gid].push(o);
  }

  function makeupDayFromNotes(notes: unknown): string {
    const raw = String(notes || "");
    const iso = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) return iso[1];
    const m = raw.match(
      /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i,
    );
    if (!m) return "";
    const months: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      sept: "09",
      oct: "10",
      nov: "11",
      dec: "12",
    };
    const mon = months[String(m[2] || "").toLowerCase()] || "";
    if (!mon) return "";
    return m[3] + "-" + mon + "-" + String(m[1]).padStart(2, "0");
  }

  const rows = (grants || []).map((g) => {
    const list = offersByGrant[g.id] || [];
    const pending = list.find((o) => o.status === "pending") || null;
    const accepted = list.find((o) => o.status === "accepted") || null;
    const abs = g.absence_report_id ? absenceById[String(g.absence_report_id)] : null;
    const makeupDay =
      String((accepted && accepted.session_date) || (pending && pending.session_date) || "")
        .slice(0, 10) || makeupDayFromNotes(g.notes);
    const makeupTime = String(
      (accepted && accepted.session_time) || (pending && pending.session_time) || "",
    ).trim();
    return {
      ...g,
      pending_offer: pending,
      offers: list,
      absence_session_date: abs ? String(abs.session_date || "").slice(0, 10) : "",
      absence_session_time: abs ? String(abs.session_time || "").trim() : "",
      makeup_day: makeupDay,
      makeup_time: makeupTime,
      makeup_offer: accepted || pending || null,
    };
  });

  const openCount = rows.filter((r) => r.status === "open").length;
  const offeredCount = rows.filter((r) => r.status === "offered").length;

  return portalAdminJson(200, {
    ok: true,
    grants: rows,
    meta: { open: openCount, offered: offeredCount },
  });
});
