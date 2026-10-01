// portal-admin-parent-ghost-start
// Admin-only: open one family's parent portal in read-only ghost view.
// Does not revoke the family's own session and does not need their PIN.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  clientIp,
  newSessionToken,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";

const GHOST_TTL_MS = 30 * 60 * 1000;

type StartBody = {
  parentPersonId?: unknown;
  contactId?: unknown;
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

  const parentPersonId = str(body.parentPersonId, 120);
  const contactId = str(body.contactId, 80);
  if (!parentPersonId) {
    return portalAdminJson(400, { ok: false, error: "missing_parent" });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(503, { ok: false, error: "supabase_not_configured" });
  }

  const db = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error: lookupErr } = await db
    .from("portal_parent_contacts")
    .select("contact_id, parent_person_id, parent_display, child_display, email")
    .eq("parent_person_id", parentPersonId)
    .limit(20);

  if (lookupErr) {
    console.error("[portal-admin-parent-ghost-start] lookup", lookupErr);
    return portalAdminJson(500, { ok: false, error: "lookup_failed" });
  }
  if (!rows || !rows.length) {
    return portalAdminJson(404, { ok: false, error: "parent_not_found" });
  }

  const preferred =
    (contactId && rows.find((r) => String(r.contact_id) === contactId)) || rows[0];
  const displayName = str(preferred.parent_display || preferred.email || parentPersonId, 120);
  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + GHOST_TTL_MS).toISOString();
  const ip = clientIp(req);
  const ipHash = ip ? await sha256Hex(ip) : null;

  const { error: insertErr } = await db.from("portal_parent_portal_sessions").insert({
    parent_person_id: parentPersonId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_hash: ipHash,
    last_contact_id: str(preferred.contact_id, 80) || null,
    last_surface: "admin_ghost",
    client_device: "desktop",
  });

  if (insertErr) {
    console.error("[portal-admin-parent-ghost-start] session insert", insertErr);
    return portalAdminJson(500, { ok: false, error: "session_insert_failed" });
  }

  console.log(
    "[portal-admin-parent-ghost-start]",
    admin.email || admin.userId,
    "parent",
    parentPersonId,
  );

  return portalAdminJson(200, {
    ok: true,
    ghostToken: token,
    expiresAt,
    target: {
      parentPersonId,
      contactId: str(preferred.contact_id, 80),
      displayName,
    },
  });
});
