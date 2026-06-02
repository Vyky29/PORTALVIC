// @ts-nocheck — Edge Function (Deno).
//
// staff-profile-portal-bridge
// ---------------------------
// Fallback when staff_profile_update.html is opened from the Staff/Lead hub
// (PIN session + display name) without a usable Supabase Auth JWT path.
//
// POST JSON: { full_name?: string, staff_id?: string, portal_bridge_secret: string }
// 200 { ok: true, session_token, expires_at, staff: { id, full_name, username, staff_role } }
// 401 { ok: false, error: "invalid_bridge_secret" | "unknown" | "ambiguous" | ... }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SESSION_TTL_MS = 30 * 60 * 1000;

function jsonError(error: string, status = 401) {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function newSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim() || "";
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "";
}

function normalizeFullName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let body: { full_name?: unknown; staff_id?: unknown; portal_bridge_secret?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("invalid", 400);
  }

  const fullName = String(body.full_name || "").trim();
  const staffIdRaw = String(body.staff_id || "").trim();
  const submittedSecret = String(body.portal_bridge_secret || "").trim();
  if (!staffIdRaw && (!fullName || fullName.length < 2)) return jsonError("invalid", 400);

  const configuredSecret = String(Deno.env.get("STAFF_PROFILE_PORTAL_BRIDGE_SECRET") || "").trim();
  if (!configuredSecret || configuredSecret.length < 16) {
    console.error("[staff-profile-portal-bridge] STAFF_PROFILE_PORTAL_BRIDGE_SECRET missing");
    return jsonError("bridge_not_configured", 503);
  }
  if (!submittedSecret || !constantTimeEquals(submittedSecret, configuredSecret)) {
    return jsonError("invalid_bridge_secret");
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[staff-profile-portal-bridge] Missing SUPABASE env vars");
    return jsonError("invalid", 500);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let profile: {
    id: string;
    full_name: string | null;
    username: string | null;
    staff_role: string | null;
    is_active: boolean | null;
  } | null = null;

  if (staffIdRaw && /^[0-9a-f-]{36}$/i.test(staffIdRaw)) {
    const { data: row, error: idErr } = await supabase
      .from("staff_profiles")
      .select("id, full_name, username, staff_role, is_active")
      .eq("id", staffIdRaw)
      .maybeSingle();
    if (idErr) {
      console.error("[staff-profile-portal-bridge] profile by id", idErr);
      return jsonError("invalid", 500);
    }
    if (!row || row.is_active === false) return jsonError("unknown");
    profile = row;
  } else {
    const want = normalizeFullName(fullName);
    if (!want) return jsonError("unknown");

    const { data: profiles, error: profErr } = await supabase
      .from("staff_profiles")
      .select("id, full_name, username, staff_role, is_active")
      .eq("is_active", true);
    if (profErr) {
      console.error("[staff-profile-portal-bridge] profile list", profErr);
      return jsonError("invalid", 500);
    }

    const hits = (profiles || []).filter((p) => {
      const fn = normalizeFullName(String(p.full_name || ""));
      const un = normalizeFullName(String(p.username || ""));
      return fn === want || un === want;
    });

    if (hits.length === 0) return jsonError("unknown");
    if (hits.length > 1) return jsonError("ambiguous");
    profile = hits[0];
  }

  const userId = profile.id;
  const nowIso = new Date().toISOString();
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;

  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await supabase
    .from("staff_profile_update_sessions")
    .update({ revoked_at: nowIso })
    .eq("staff_id", userId)
    .is("revoked_at", null);

  const { error: insertErr } = await supabase.from("staff_profile_update_sessions").insert({
    staff_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
  });
  if (insertErr) {
    console.error("[staff-profile-portal-bridge] session insert failed", insertErr);
    return jsonError("invalid", 500);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      session_token: token,
      expires_at: expiresAt,
      staff: {
        id: profile.id,
        full_name: profile.full_name ?? null,
        username: profile.username ?? null,
        staff_role: profile.staff_role ?? null,
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
