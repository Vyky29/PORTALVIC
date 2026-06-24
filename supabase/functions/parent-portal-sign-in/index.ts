// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-sign-in
// ---------------------
// Sign in with parent/carer name + participant date of birth (DDMMYYYY, e.g. 29031988).
// No OTP — mints a short-lived session on successful match.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clientIp,
  newSessionToken,
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h — no OTP re-auth

function normalizeDobInput(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  let body: { parent_name?: unknown; participant_dob?: unknown };
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonInvalid(400);
  }

  const parentName = String(body.parent_name || "").trim();
  const dobDigits = normalizeDobInput(String(body.participant_dob || ""));
  if (!parentName || dobDigits.length !== 8) return parentPortalJsonInvalid(400);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    console.error("[parent-portal-sign-in] Missing SUPABASE env vars");
    return parentPortalJsonInvalid(500);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: matchedParentId, error: matchErr } = await supabase.rpc(
    "portal_parent_match_identity_dob",
    { p_parent_name: parentName, p_participant_dob: dobDigits },
  );
  if (matchErr) {
    console.error("[parent-portal-sign-in] match rpc error", matchErr);
    return parentPortalJsonInvalid();
  }
  if (!matchedParentId) return parentPortalJsonInvalid();

  const nowIso = new Date().toISOString();
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;

  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  await supabase
    .from("portal_parent_portal_sessions")
    .update({ revoked_at: nowIso })
    .eq("parent_person_id", matchedParentId)
    .is("revoked_at", null);

  const { error: insertErr } = await supabase.from("portal_parent_portal_sessions").insert({
    parent_person_id: matchedParentId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    ip_hash: ipHash,
    user_agent_hash: uaHash,
  });
  if (insertErr) {
    console.error("[parent-portal-sign-in] session insert failed", insertErr);
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
