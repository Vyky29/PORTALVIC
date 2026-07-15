// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-otp-verify
// ------------------------
// Step 2: verify OTP and mint a short-lived parent portal session token.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  PARENT_PORTAL_OTP_MAX_ATTEMPTS,
  PARENT_PORTAL_SESSION_TTL_MS,
  clientDeviceFromRequest,
  clientIp,
  constantTimeEquals,
  newSessionToken,
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";
import { resolveParentGeo, parentGeoToDbFields } from "../_shared/parent_geo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  let body: { full_name?: unknown; phone_number?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonInvalid(400);
  }

  const fullName = String(body.full_name || "").trim();
  const phoneInput = String(body.phone_number || "").trim();
  const code = String(body.code || "").trim();
  if (!fullName || !phoneInput || !/^\d{4,8}$/.test(code)) return parentPortalJsonInvalid(400);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[parent-portal-otp-verify] Missing SUPABASE env vars");
    return parentPortalJsonInvalid(500);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: matchedParentId, error: matchErr } = await supabase.rpc(
    "portal_parent_match_identity",
    { p_full_name: fullName, p_phone: phoneInput },
  );
  if (matchErr || !matchedParentId) return parentPortalJsonInvalid();

  const nowIso = new Date().toISOString();
  const { data: otpRow, error: otpErr } = await supabase
    .from("portal_parent_portal_otps")
    .select("id, code_hash, expires_at, attempts, consumed_at")
    .eq("parent_person_id", matchedParentId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (otpErr || !otpRow) return parentPortalJsonInvalid();
  if (otpRow.attempts >= PARENT_PORTAL_OTP_MAX_ATTEMPTS) return parentPortalJsonInvalid();
  if (new Date(otpRow.expires_at).getTime() < Date.now()) return parentPortalJsonInvalid();

  const submittedHash = await sha256Hex(code);
  if (!constantTimeEquals(submittedHash, String(otpRow.code_hash || ""))) {
    await supabase
      .from("portal_parent_portal_otps")
      .update({ attempts: (otpRow.attempts ?? 0) + 1 })
      .eq("id", otpRow.id);
    return parentPortalJsonInvalid();
  }

  await supabase
    .from("portal_parent_portal_otps")
    .update({ consumed_at: nowIso, attempts: (otpRow.attempts ?? 0) + 1 })
    .eq("id", otpRow.id);

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;

  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + PARENT_PORTAL_SESSION_TTL_MS).toISOString();

  await supabase
    .from("portal_parent_portal_sessions")
    .update({ revoked_at: nowIso })
    .eq("parent_person_id", matchedParentId)
    .is("revoked_at", null);

  const geo = await resolveParentGeo(req, ip, (body as { geo_hint?: unknown }).geo_hint);
  const geoFields = geo ? parentGeoToDbFields(geo) : {};

  const { error: insertErr } = await supabase.from("portal_parent_portal_sessions").insert({
    parent_person_id: matchedParentId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
    client_device: clientDeviceFromRequest(req),
    ...geoFields,
  });
  if (insertErr) {
    console.error("[parent-portal-otp-verify] session insert failed", insertErr);
    return parentPortalJsonInvalid(500);
  }

  const { data: parentRow } = await supabase
    .from("portal_parent_contacts")
    .select("parent_display, email, mobile")
    .eq("parent_person_id", matchedParentId)
    .limit(1)
    .maybeSingle();

  return new Response(
    JSON.stringify({
      ok: true,
      session_token: token,
      expires_at: expiresAt,
      parent: {
        parent_person_id: matchedParentId,
        display_name: parentRow?.parent_display ?? null,
        email: parentRow?.email ?? null,
        mobile: parentRow?.mobile ?? null,
      },
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
