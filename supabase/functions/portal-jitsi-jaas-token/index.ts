// @ts-nocheck — Edge Function (Deno). Mint JaaS JWT for in-portal staff video/voice calls.
//
// meet.jit.si now requires OAuth for the first moderator — embedded iframe cannot do that.
// JaaS (8x8.vc) with a signed JWT grants moderator and skips the lobby.
//
// Secrets:
//   JAAS_APP_ID          e.g. vpaas-magic-cookie-xxxxxxxx
//   JAAS_KEY_ID          API key id suffix (after the slash in the JaaS dashboard)
//   JAAS_PRIVATE_KEY     PEM private key (use \n for newlines in dashboard secret)
//
// Deploy:
//   supabase functions deploy portal-jitsi-jaas-token --no-verify-jwt
//   (invoke uses user JWT from portal; function validates auth.getUser)
//
// POST JSON: { room, displayName?, moderator? }
// 200: { ok: true, domain, appId, roomName, jwt, expiresAt }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SignJWT, importPKCS8 } from "npm:jose@5";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerUserJwt(req: Request): string {
  const raw = String(req.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : "";
}

function normalizePem(pem: string): string {
  return String(pem || "").replace(/\\n/g, "\n").trim();
}

function sanitizeRoom(room: string): string {
  return String(room || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const appId = String(Deno.env.get("JAAS_APP_ID") || "").trim();
  const keyId = String(Deno.env.get("JAAS_KEY_ID") || "").trim();
  const privateKeyPem = normalizePem(Deno.env.get("JAAS_PRIVATE_KEY") || "");

  if (!appId || !keyId || !privateKeyPem) {
    return json({ ok: false, error: "jaas_not_configured" }, 503);
  }

  const jwt = bearerUserJwt(req);
  if (!jwt) return json({ ok: false, error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    return json({ ok: false, error: "server_misconfigured" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_e) {
    body = {};
  }

  const room = sanitizeRoom(String(body.room || ""));
  if (!room) return json({ ok: false, error: "room_required" }, 400);

  const displayName = String(body.displayName || "Staff").trim().slice(0, 120) || "Staff";
  const asModerator = body.moderator !== false;

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const userId = userData.user.id;
  const email = String(userData.user.email || "").trim();

  const { data: profile, error: profErr } = await supabase
    .from("staff_profiles")
    .select("id, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    console.error("[portal-jitsi-jaas-token] profile lookup", profErr);
    return json({ ok: false, error: "profile_lookup_failed" }, 500);
  }
  if (!profile || profile.is_active === false) {
    return json({ ok: false, error: "forbidden" }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 60 * 60 * 3;
  const kid = `${appId}/${keyId}`;
  const roomName = `${appId}/${room}`;

  try {
    const privateKey = await importPKCS8(privateKeyPem, "RS256");
    const token = await new SignJWT({
      aud: "jitsi",
      iss: "chat",
      sub: appId,
      room,
      exp,
      nbf: now - 10,
      context: {
        user: {
          id: userId,
          name: displayName,
          email: email || undefined,
          moderator: asModerator ? "true" : "false",
        },
        features: {
          livestreaming: false,
          recording: false,
          transcription: false,
          "outbound-call": false,
        },
      },
    })
      .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
      .sign(privateKey);

    return json({
      ok: true,
      domain: "8x8.vc",
      appId,
      roomName,
      jwt: token,
      expiresAt: new Date(exp * 1000).toISOString(),
    });
  } catch (e) {
    console.error("[portal-jitsi-jaas-token] sign failed", e);
    return json({ ok: false, error: "jwt_sign_failed" }, 500);
  }
});
