// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-feedback-shares-list
// Returns cached family-portal summaries for admin Sessions hub.

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

  let body: { since?: string; feedback_ids?: string[] } = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let q = admin
    .from("portal_parent_feedback_share")
    .select(
      "session_feedback_id, parent_message, share_status, review_model, reviewed_at, admin_edited_at, admin_edited_by_user_id",
    )
    .order("reviewed_at", { ascending: false })
    .limit(3000);

  const ids = Array.isArray(body.feedback_ids)
    ? body.feedback_ids.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 800)
    : [];
  if (ids.length) {
    q = q.in("session_feedback_id", ids);
  } else {
    const since = String(body.since || "").trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(since)) {
      q = q.gte("reviewed_at", `${since}T00:00:00Z`);
    }
  }

  const { data, error } = await q;
  if (error) {
    console.error("[portal-admin-parent-feedback-shares-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    shares: data || [],
    count: (data || []).length,
  });
});
