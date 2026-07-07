// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-session-disruption-list
// Session Disruption reports (POL-048) for the admin panel. Service role read,
// admin/CEO JWT verified. Returns pending + validated so admin can review both.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const SELECT_COLS =
  "id,created_at,submitted_by_user_id,submitted_by_name,role_label,disruption_type," +
  "session_date,venue,reason_category,reason_description,expected_return,return_date," +
  "could_prevent,prevention_details,additional_comments,origin,day_off_recorded," +
  "validated_at,validated_by,validated_by_name";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") return portalAdminJson(405, { ok: false, error: "method_not_allowed" });

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) return portalAdminJson(verified.status, { ok: false, error: verified.error });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return portalAdminJson(500, { ok: false, error: "server_misconfigured" });

  let body: { since?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const sinceRaw = String(body.since || "").trim().slice(0, 10);
  const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw)
    ? sinceRaw
    : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 120);
        return d.toISOString().slice(0, 10);
      })();

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("session_disruption_reports")
    .select(SELECT_COLS)
    .gte("session_date", since)
    .order("created_at", { ascending: false })
    .limit(600);

  if (error) {
    console.error("[portal-admin-session-disruption-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    rows: data || [],
    count: (data || []).length,
    since,
  });
});
