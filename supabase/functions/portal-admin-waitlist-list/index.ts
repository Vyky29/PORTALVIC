// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-waitlist-list
// -------------------------
// Admin: live Booking Portal waitlist entries for CFK Waiting list view.
//
// Deploy:
//   npx supabase functions deploy portal-admin-waitlist-list --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(
    req.headers.get("Authorization"),
  );
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: { include_offered?: boolean; limit?: number; status?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);
  const includeOffered = body.include_offered !== false;
  const statusFilter = String(body.status || "").trim().toLowerCase();

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = admin
    .from("portal_waitlist_entries")
    .select(
      "id, lead_id, participant_name, parent_name, email, mobile, service_key, service_label, venue, day_name, time_label, slot_id, note, source, status, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  } else if (includeOffered) {
    query = query.in("status", ["active", "offered"]);
  } else {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) {
    console.error("[portal-admin-waitlist-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  const entries = data || [];
  const activeN = entries.filter((r) => r.status === "active").length;
  const offeredN = entries.filter((r) => r.status === "offered").length;

  return portalAdminJson(200, {
    ok: true,
    entries,
    meta: {
      total: entries.length,
      active: activeN,
      offered: offeredN,
    },
  });
});
