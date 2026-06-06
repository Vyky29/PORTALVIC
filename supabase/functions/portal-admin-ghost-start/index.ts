// portal-admin-ghost-start
// ------------------------
// Admin-only: mint a short-lived ghost token to open a worker dashboard read-only.
//
// POST JSON: { targetStaffUserId: string, surface?: "staff" | "lead" }
// 200: { ok: true, ghostToken, expiresAt, target: { staffUserId, rosterKey, displayName, surface } }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  GHOST_SESSION_TTL_MS,
  clientIp,
  newGhostToken,
  parseGhostSurface,
  resolveRosterKeyFromProfile,
  sha256Hex,
} from "../_shared/portal_ghost_session.ts";

type StartBody = {
  targetStaffUserId?: unknown;
  surface?: unknown;
};

function str(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
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

  let body: StartBody;
  try {
    body = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "invalid_json" });
  }

  const targetStaffUserId = str(body.targetStaffUserId, 64);
  if (!targetStaffUserId) {
    return portalAdminJson(400, { ok: false, error: "missing_target_staff_user_id" });
  }

  const surface = parseGhostSurface(body.surface);
  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(503, { ok: false, error: "supabase_not_configured" });
  }

  const db = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: targetProfile, error: profileErr } = await db
    .from("staff_profiles")
    .select("id, username, full_name, app_role, staff_role, dashboard_route, is_active")
    .eq("id", targetStaffUserId)
    .maybeSingle();

  if (profileErr) {
    console.error("[portal-admin-ghost-start] profile lookup", profileErr);
    return portalAdminJson(500, { ok: false, error: "profile_lookup_failed" });
  }
  if (!targetProfile || targetProfile.is_active === false) {
    return portalAdminJson(404, { ok: false, error: "target_not_found" });
  }

  const { data: authUser, error: authErr } = await db.auth.admin.getUserById(targetStaffUserId);
  if (authErr) {
    console.error("[portal-admin-ghost-start] auth user lookup", authErr);
    return portalAdminJson(500, { ok: false, error: "auth_lookup_failed" });
  }

  const authEmail = String(authUser?.user?.email || "");
  const rosterKey = resolveRosterKeyFromProfile(targetProfile, authEmail);
  if (!rosterKey) {
    return portalAdminJson(422, { ok: false, error: "roster_key_unresolved" });
  }

  const displayName = str(targetProfile.full_name || targetProfile.username || rosterKey, 120);
  const ghostToken = newGhostToken();
  const tokenHash = await sha256Hex(ghostToken);
  const expiresAt = new Date(Date.now() + GHOST_SESSION_TTL_MS).toISOString();
  const ip = clientIp(req);

  const { error: insertErr } = await db.from("portal_admin_ghost_sessions").insert({
    admin_user_id: admin.userId,
    target_staff_user_id: targetStaffUserId,
    target_roster_key: rosterKey,
    target_display_name: displayName,
    surface,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  if (insertErr) {
    console.error("[portal-admin-ghost-start] session insert", insertErr);
    return portalAdminJson(500, { ok: false, error: "session_insert_failed" });
  }

  const { error: logErr } = await db.from("portal_admin_ghost_view_log").insert({
    admin_user_id: admin.userId,
    admin_email: admin.email,
    target_staff_user_id: targetStaffUserId,
    target_roster_key: rosterKey,
    target_display_name: displayName,
    surface,
    action: "start",
    client_ip: ip,
  });
  if (logErr) console.error("[portal-admin-ghost-start] audit log", logErr);

  return portalAdminJson(200, {
    ok: true,
    ghostToken,
    expiresAt,
    target: {
      staffUserId: targetStaffUserId,
      rosterKey,
      displayName,
      surface,
    },
  });
});
