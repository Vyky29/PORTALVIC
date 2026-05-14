// @ts-nocheck — Edge Function (Deno).
//
// staff-profile-otp-verify
// ------------------------
// Second step of the staff self-service profile update flow.
//
// Input (POST JSON): { full_name: string, phone_number: string, code: string }
// Output:
//   200 { ok: true, session_token: string, expires_at: string, staff: {...} }
//   400/401 { ok: false, error: "invalid" }   — generic, never says which field failed
//
// Behaviour:
//   - Re-runs identity match (so the verify step is also resistant to a code
//     being reused for the wrong staff member).
//   - Looks up the most recent unconsumed OTP for that staff_id, checks expiry
//     and a maximum of 5 attempts.
//   - Compares SHA-256 hashes in constant time.
//   - On success: marks the OTP consumed, mints a new session token (random
//     32-byte), stores its hash in `staff_profile_update_sessions` with a
//     30-minute expiry, returns the plaintext token plus a small staff snapshot.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SESSION_TTL_MS = 30 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let body: { full_name?: unknown; phone_number?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonInvalid(400);
  }
  const fullName = String(body.full_name || "").trim();
  const phoneInput = String(body.phone_number || "").trim();
  const code = String(body.code || "").trim();
  if (!fullName || !phoneInput || !/^\d{4,8}$/.test(code)) return jsonInvalid(400);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[staff-profile-otp-verify] Missing SUPABASE env vars");
    return jsonInvalid(500);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: matchedId, error: matchErr } = await supabase.rpc(
    "staff_profile_match_identity",
    { p_full_name: fullName, p_phone: phoneInput },
  );
  if (matchErr) {
    console.error("[staff-profile-otp-verify] match rpc error", matchErr);
    return jsonInvalid();
  }
  if (!matchedId) return jsonInvalid();

  const nowIso = new Date().toISOString();

  const { data: otpRow, error: otpErr } = await supabase
    .from("staff_profile_update_otps")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("staff_id", matchedId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (otpErr) {
    console.error("[staff-profile-otp-verify] otp lookup error", otpErr);
    return jsonInvalid();
  }
  if (!otpRow) return jsonInvalid();
  if (otpRow.attempts >= OTP_MAX_ATTEMPTS) return jsonInvalid();
  if (new Date(otpRow.expires_at).getTime() < Date.now()) return jsonInvalid();

  const submittedHash = await sha256Hex(code);
  const matched = constantTimeEquals(submittedHash, String(otpRow.code_hash || ""));
  if (!matched) {
    await supabase
      .from("staff_profile_update_otps")
      .update({ attempts: (otpRow.attempts ?? 0) + 1 })
      .eq("id", otpRow.id);
    return jsonInvalid();
  }

  await supabase
    .from("staff_profile_update_otps")
    .update({ consumed_at: nowIso, attempts: (otpRow.attempts ?? 0) + 1 })
    .eq("id", otpRow.id);

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;

  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  // Revoke any older active sessions for this staff (single-flight).
  await supabase
    .from("staff_profile_update_sessions")
    .update({ revoked_at: nowIso })
    .eq("staff_id", matchedId)
    .is("revoked_at", null);

  const { error: insertErr } = await supabase.from("staff_profile_update_sessions").insert({
    staff_id: matchedId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
  });
  if (insertErr) {
    console.error("[staff-profile-otp-verify] session insert failed", insertErr);
    return jsonInvalid(500);
  }

  const { data: snap } = await supabase
    .from("staff_profiles")
    .select("id, full_name, username, staff_role")
    .eq("id", matchedId)
    .maybeSingle();

  return new Response(
    JSON.stringify({
      ok: true,
      session_token: token,
      expires_at: expiresAt,
      staff: {
        id: snap?.id ?? matchedId,
        full_name: snap?.full_name ?? null,
        username: snap?.username ?? null,
        staff_role: snap?.staff_role ?? null,
      },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
