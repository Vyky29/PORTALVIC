// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-activity-alerts-list
// Recent incidents, cancellations, absent marks, pending late approvals for admin bell.

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

  let body: { since?: string; days?: number } = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const days = Math.min(14, Math.max(1, Number(body.days) || 3));
  const since = String(body.since || "").trim();
  const sinceIso = since && /^\d{4}-\d{2}-\d{2}/.test(since)
    ? since.slice(0, 10) + "T00:00:00Z"
    : new Date(Date.now() - days * 86400000).toISOString();

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [inc, can, absent, late] = await Promise.all([
    admin
      .from("incident_reports")
      .select("id,created_at,client_name,session_date,submitted_by_name,incident_category")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("cancellation_reports")
      .select("id,created_at,client_name,session_date,submitted_by_name")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("portal_staff_session_quick_marks")
      .select("id,created_at,session_date,portal_session_key,staff_user_id,mark_type")
      .eq("mark_type", "absent")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("portal_late_submission_requests")
      .select("id,created_at,client_name,session_date,submission_type,service_label,status")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  if (inc.error || can.error || absent.error || late.error) {
    console.error("[portal-admin-activity-alerts-list]", {
      inc: inc.error?.message,
      can: can.error?.message,
      absent: absent.error?.message,
      late: late.error?.message,
    });
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    since: sinceIso,
    incidents: inc.data || [],
    cancellations: can.data || [],
    absents: absent.data || [],
    late_requests: late.data || [],
  });
});
