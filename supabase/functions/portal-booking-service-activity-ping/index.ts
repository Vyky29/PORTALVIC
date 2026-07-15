// portal-booking-service-activity-ping
// Anonymous Booking Service visitor surface pings.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clientDeviceFromRequest,
  clientIp,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";
import { lookupParentGeoFromRequest, parentGeoToDbFields } from "../_shared/parent_geo.ts";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-booking-service-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED = new Set([
  "offer",
  "filter",
  "service",
  "intensive",
  "book_cta",
  "enquire",
  "registration",
  "registration_submit",
]);

const DEDUPE_MS = 45_000;

function clean(v: unknown, max = 160): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const token = String(req.headers.get("x-booking-service-session") || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return json(401, { ok: false, error: "session_required" });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return json(503, { ok: false, error: "server_misconfigured" });
  }

  const supabase = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(token);
  const { data: sess } = await supabase
    .from("portal_booking_service_sessions")
    .select("id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!sess || sess.revoked_at || new Date(String(sess.expires_at)).getTime() < Date.now()) {
    return json(401, { ok: false, error: "session_expired" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const surface = clean(body.surface || body.view || body.event_type, 40).toLowerCase();
  if (!surface || !ALLOWED.has(surface)) {
    return json(400, { ok: false, error: "invalid_surface" });
  }
  const detail = clean(body.detail, 160) || null;
  const nowIso = new Date().toISOString();

  const sessionPatch: Record<string, unknown> = {
    last_used_at: nowIso,
    last_surface: surface,
    last_detail: detail,
    client_device: clientDeviceFromRequest(req),
  };
  try {
    const geo = await lookupParentGeoFromRequest(req, clientIp(req));
    if (geo) Object.assign(sessionPatch, parentGeoToDbFields(geo));
  } catch {
    /* ignore */
  }

  await supabase.from("portal_booking_service_sessions").update(sessionPatch).eq("id", sess.id);

  const since = new Date(Date.now() - DEDUPE_MS).toISOString();
  const { data: recent } = await supabase
    .from("portal_booking_service_activity")
    .select("id")
    .eq("session_id", sess.id)
    .eq("event_type", surface)
    .gte("created_at", since)
    .limit(1);

  let logged = false;
  if (!recent?.length) {
    const { error } = await supabase.from("portal_booking_service_activity").insert({
      session_id: sess.id,
      event_type: surface,
      detail,
      created_at: nowIso,
    });
    if (error) {
      console.error("[portal-booking-service-activity-ping]", error.message);
    } else {
      logged = true;
    }
  }

  return json(200, { ok: true, logged, surface });
});
