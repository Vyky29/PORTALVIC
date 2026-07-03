// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-incident-reports-list
// Incident reports for admin Sessions hub (service role; admin JWT verify).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

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
    .from("incident_reports")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(400);

  if (error) {
    console.error("[portal-admin-incident-reports-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    rows: data || [],
    count: (data || []).length,
    since,
  });
});
