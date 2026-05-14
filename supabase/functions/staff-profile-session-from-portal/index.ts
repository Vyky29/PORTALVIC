// @ts-nocheck — Edge Function (Deno).
//
// staff-profile-session-from-portal
// -----------------------------------
// For staff who already signed in via the portal (Supabase Auth): mints the same
// short-lived `staff_profile_update_sessions` token used after OTP verify, so
// staff_profile_update.html can skip name/phone + OTP when the browser has a session.
//
// POST (JSON body ignored)
// Headers:
//   apikey: <anon key>
//   Authorization: Bearer <user access_token from Supabase Auth>
//
// 200 { ok: true, session_token, expires_at, staff: { id, full_name, username, staff_role } }
// 401 { ok: false, error: "invalid" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SESSION_TTL_MS = 30 * 60 * 1000;

function jsonInvalid(status = 401) {
  return new Response(JSON.stringify({ ok: false, error: "invalid" }), {
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

function bearerUserJwt(req: Request): string {
  const raw = String(req.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const jwt = bearerUserJwt(req);
  if (!jwt) return jsonInvalid(400);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[staff-profile-session-from-portal] Missing SUPABASE env vars");
    return jsonInvalid(500);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    console.warn("[staff-profile-session-from-portal] getUser failed", userErr?.message);
    return jsonInvalid();
  }

  const userId = userData.user.id;

  const { data: profile, error: profErr } = await supabase
    .from("staff_profiles")
    .select("id, full_name, username, staff_role, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    console.error("[staff-profile-session-from-portal] profile lookup", profErr);
    return jsonInvalid(500);
  }
  if (!profile || profile.is_active === false) return jsonInvalid();

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
    console.error("[staff-profile-session-from-portal] session insert failed", insertErr);
    return jsonInvalid(500);
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
