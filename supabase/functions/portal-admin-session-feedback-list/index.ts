// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-session-feedback-list
// Returns session_feedback rows for admin Sessions hub (service role bypasses RLS).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const SELECT_COLS =
  "id,client_name,session_date,service,attendance,engagement_rating,engagement_patterns,client_emotions,positive_feedback,relevant_information,completed_by_name,portal_session_key,session_time,created_at";

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
        d.setDate(d.getDate() - 150);
        return d.toISOString().slice(0, 10);
      })();

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("session_feedback")
    .select(SELECT_COLS)
    .gte("session_date", since)
    .order("session_date", { ascending: false })
    .limit(2500);

  if (error) {
    console.error("[portal-admin-session-feedback-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    rows: data || [],
    count: (data || []).length,
    since,
  });
});
