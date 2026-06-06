// portal-admin-ghost-verify
// --------------------------
// Admin-only: verify ghost token and return target roster + online presence snapshot.
//
// POST JSON: { ghostToken: string }
// 200: { ok: true, target, online }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { clientIp, sha256Hex } from "../_shared/portal_ghost_session.ts";

type VerifyBody = {
  ghostToken?: unknown;
};

function str(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

function londonTodayIso(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* ignore */
  }
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: portalAdminCorsHeaders() });
  }

  const admin = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!admin.ok) {
    return portalAdminJson(admin.status, { ok: false, error: admin.error });
  }

  let body: VerifyBody;
  try {
    body = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "invalid_json" });
  }

  const ghostToken = str(body.ghostToken, 128);
  if (!ghostToken) {
    return portalAdminJson(400, { ok: false, error: "missing_ghost_token" });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(503, { ok: false, error: "supabase_not_configured" });
  }

  const db = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(ghostToken);
  const nowIso = new Date().toISOString();

  const { data: sessionRow, error: sessionErr } = await db
    .from("portal_admin_ghost_sessions")
    .select(
      "id, admin_user_id, target_staff_user_id, target_roster_key, target_display_name, surface, expires_at, revoked_at",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (sessionErr) {
    console.error("[portal-admin-ghost-verify] session lookup", sessionErr);
    return portalAdminJson(500, { ok: false, error: "session_lookup_failed" });
  }
  if (!sessionRow || sessionRow.revoked_at) {
    return portalAdminJson(401, { ok: false, error: "invalid_token" });
  }
  if (sessionRow.expires_at <= nowIso) {
    return portalAdminJson(401, { ok: false, error: "token_expired" });
  }
  if (sessionRow.admin_user_id !== admin.userId) {
    return portalAdminJson(403, { ok: false, error: "token_admin_mismatch" });
  }

  const staleCutoff = new Date(Date.now() - 90 * 1000).toISOString();
  const today = londonTodayIso();

  const { data: visitRow } = await db
    .from("portal_staff_visit_sessions")
    .select("last_seen_at, last_page_label, staff_surface, still_open, pages")
    .eq("staff_user_id", sessionRow.target_staff_user_id)
    .eq("session_date", today)
    .eq("still_open", true)
    .gte("last_seen_at", staleCutoff)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isOnline = !!visitRow;
  const pages = Array.isArray(visitRow?.pages) ? visitRow.pages : [];
  const lastTrailPage = pages.length
    ? String((pages[pages.length - 1] as { label?: string })?.label || "")
    : "";

  const ip = clientIp(req);
  const { error: logErr } = await db.from("portal_admin_ghost_view_log").insert({
    admin_user_id: admin.userId,
    admin_email: admin.email,
    target_staff_user_id: sessionRow.target_staff_user_id,
    target_roster_key: sessionRow.target_roster_key,
    target_display_name: sessionRow.target_display_name,
    surface: sessionRow.surface,
    action: "verify",
    client_ip: ip,
  });
  if (logErr) console.error("[portal-admin-ghost-verify] audit log", logErr);

  return portalAdminJson(200, {
    ok: true,
    target: {
      staffUserId: sessionRow.target_staff_user_id,
      rosterKey: sessionRow.target_roster_key,
      displayName: sessionRow.target_display_name,
      surface: sessionRow.surface,
    },
    online: {
      isOnline,
      lastSeenAt: visitRow?.last_seen_at || null,
      lastPage: str(visitRow?.last_page_label || lastTrailPage, 200) || null,
      staffSurface: visitRow?.staff_surface || null,
    },
    expiresAt: sessionRow.expires_at,
  });
});
