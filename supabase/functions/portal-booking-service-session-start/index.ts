// portal-booking-service-session-start
// Mint anonymous visitor session for public Booking Service (new clients).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clientDeviceFromRequest,
  clientIp,
  newSessionToken,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";
import { resolveParentGeo, parentGeoToDbFields } from "../_shared/parent_geo.ts";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-booking-service-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return new Response(JSON.stringify({ ok: false, error: "server_misconfigured" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let bodyHint: unknown = null;
  try {
    const body = await req.json();
    if (body && typeof body === "object") bodyHint = (body as Record<string, unknown>).geo_hint;
  } catch {
    bodyHint = null;
  }

  // Resume existing valid token if the client already has one.
  const existing = String(req.headers.get("x-booking-service-session") || "").trim();
  if (/^[a-f0-9]{32,128}$/i.test(existing)) {
    const tokenHash = await sha256Hex(existing);
    const { data: sess } = await supabase
      .from("portal_booking_service_sessions")
      .select("id, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (sess && !sess.revoked_at && new Date(String(sess.expires_at)).getTime() > Date.now()) {
      const patch: Record<string, unknown> = {
        last_used_at: new Date().toISOString(),
        client_device: clientDeviceFromRequest(req),
      };
      try {
        const geo = await resolveParentGeo(req, clientIp(req), bodyHint);
        if (geo) Object.assign(patch, parentGeoToDbFields(geo));
      } catch {
        /* ignore */
      }
      await supabase.from("portal_booking_service_sessions").update(patch).eq("id", sess.id);
      return new Response(
        JSON.stringify({ ok: true, session_token: existing, resumed: true, expires_at: sess.expires_at }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
  }

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const row: Record<string, unknown> = {
    token_hash: tokenHash,
    expires_at: expiresAt,
    client_device: clientDeviceFromRequest(req),
    ip_hash: ip ? await sha256Hex(ip) : null,
    user_agent_hash: ua ? await sha256Hex(ua) : null,
    last_surface: "offer",
  };
  try {
    const geo = await resolveParentGeo(req, ip, bodyHint);
    if (geo) Object.assign(row, parentGeoToDbFields(geo));
  } catch {
    /* ignore */
  }

  const { error } = await supabase.from("portal_booking_service_sessions").insert(row);
  if (error) {
    console.error("[portal-booking-service-session-start]", error.message);
    return new Response(JSON.stringify({ ok: false, error: "session_create_failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true, session_token: token, resumed: false, expires_at: expiresAt }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
