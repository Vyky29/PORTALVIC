// portal-help-voice-speak
// ------------------------
// ElevenLabs TTS for Portal help spoken answers (staff JWT).
//
// GET  → { ok: true, elevenlabs: boolean, voiceId: string }
// POST JSON: { text: string, voiceId?: string }
//   → { ok: true, audioBase64: string, mime: "audio/mpeg" }
//
// Env: ELEVENLABS_API_KEY, optional ELEVENLABS_VOICE_ID (club default below)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
} from "../_shared/portal_admin_auth.ts";
import { verifyPortalStaff } from "../_shared/portal_staff_auth.ts";

const DEFAULT_VOICE_ID = "3WqHLnw80rOZqJzW9YRB";
const MAX_SPEAK_CHARS = 1200;

function str(v: unknown, max = 4000): string {
  return String(v ?? "").trim().slice(0, max);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY") || "";
  const defaultVoice = str(Deno.env.get("ELEVENLABS_VOICE_ID"), 64) || DEFAULT_VOICE_ID;

  if (req.method === "GET") {
    return portalAdminJson(200, {
      ok: true,
      elevenlabs: Boolean(apiKey),
      voiceId: defaultVoice,
    });
  }

  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  if (!apiKey) {
    return portalAdminJson(503, { ok: false, error: "no_elevenlabs" });
  }

  const staff = await verifyPortalStaff(req);
  if (!staff.ok) {
    return portalAdminJson(staff.status, { ok: false, error: staff.error });
  }

  let payload: { text?: unknown; voiceId?: unknown };
  try {
    payload = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "invalid_json" });
  }

  const text = str(payload.text, MAX_SPEAK_CHARS);
  if (!text) {
    return portalAdminJson(400, { ok: false, error: "missing_text" });
  }

  const voiceId = str(payload.voiceId, 64) || defaultVoice;
  const modelId = str(Deno.env.get("ELEVENLABS_MODEL_ID"), 64) || "eleven_multilingual_v2";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.78,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[portal-help-voice-speak] ElevenLabs error", res.status, errText.slice(0, 400));
    return portalAdminJson(502, { ok: false, error: "elevenlabs_failed" });
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (!buf.length) {
    return portalAdminJson(502, { ok: false, error: "empty_audio" });
  }

  return portalAdminJson(200, {
    ok: true,
    audioBase64: bytesToBase64(buf),
    mime: "audio/mpeg",
  });
});
