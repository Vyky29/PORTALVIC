// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-credits-list
// Admin queue: open credits / refunds + recent closed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

function clean(v: unknown, max = 200): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

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

  let body: { status?: string; kind?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const status = clean(body.status, 20).toLowerCase() || "open";
  const kind = clean(body.kind, 20).toLowerCase();
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 200);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let q = admin
    .from("portal_parent_family_credits")
    .select(
      "id, parent_person_id, contact_id, participant_display, absence_report_id, kind, status, amount_gbp, currency, service_label, session_date, notes, source, created_at, closed_at, close_notes, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status !== "all") q = q.eq("status", status);
  if (kind === "credit" || kind === "refund") q = q.eq("kind", kind);

  const { data, error } = await q;
  if (error) {
    console.error("[portal-admin-parent-credits-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "list_failed" });
  }

  const { count: openCredits } = await admin
    .from("portal_parent_family_credits")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("kind", "credit");
  const { count: openRefunds } = await admin
    .from("portal_parent_family_credits")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("kind", "refund");

  return portalAdminJson(200, {
    ok: true,
    entries: data || [],
    meta: {
      open_credits: openCredits || 0,
      open_refunds: openRefunds || 0,
    },
  });
});
