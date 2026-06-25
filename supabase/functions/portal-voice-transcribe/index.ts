// portal-voice-transcribe
// -----------------------
// Speech-to-text for the Portal chat bot using OpenAI Whisper (staff JWT).
// Works on iOS/Android/desktop because the browser records audio with
// MediaRecorder and uploads it here (the browser SpeechRecognition API is
// unsupported on iOS Safari).
//
// GET  → { ok: true, whisper: boolean }
// POST JSON: { audioBase64: string, mime?: string }
//   → { ok: true, text: string }
//
// Env: OPENAI_API_KEY, optional PORTAL_WHISPER_MODEL (default whisper-1)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
} from "../_shared/portal_admin_auth.ts";
import { verifyPortalStaff } from "../_shared/portal_staff_auth.ts";

const DEFAULT_MODEL = "whisper-1";
const MAX_AUDIO_BYTES = 12 * 1024 * 1024; // ~12 MB safety cap

function str(v: unknown, max = 4000): string {
  return String(v ?? "").trim().slice(0, max);
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "webm";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";

  if (req.method === "GET") {
    return portalAdminJson(200, { ok: true, whisper: Boolean(apiKey) });
  }

  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  if (!apiKey) {
    return portalAdminJson(503, { ok: false, error: "no_openai" });
  }

  const staff = await verifyPortalStaff(req);
  if (!staff.ok) {
    return portalAdminJson(staff.status, { ok: false, error: staff.error });
  }

  let payload: { audioBase64?: unknown; mime?: unknown };
  try {
    payload = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "invalid_json" });
  }

  const audioBase64 = str(payload.audioBase64, 20 * 1024 * 1024);
  if (!audioBase64) {
    return portalAdminJson(400, { ok: false, error: "missing_audio" });
  }

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(audioBase64);
  } catch {
    return portalAdminJson(400, { ok: false, error: "bad_audio" });
  }
  if (!bytes.length) {
    return portalAdminJson(400, { ok: false, error: "empty_audio" });
  }
  if (bytes.length > MAX_AUDIO_BYTES) {
    return portalAdminJson(413, { ok: false, error: "audio_too_large" });
  }

  const mime = str(payload.mime, 64) || "audio/webm";
  const model = str(Deno.env.get("PORTAL_WHISPER_MODEL"), 64) || DEFAULT_MODEL;

  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: mime }),
    `speech.${extForMime(mime)}`,
  );
  form.append("model", model);
  form.append("response_format", "json");

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (err) {
    console.error("[portal-voice-transcribe] fetch error", String(err).slice(0, 300));
    return portalAdminJson(502, { ok: false, error: "transcribe_failed" });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[portal-voice-transcribe] OpenAI error", res.status, errText.slice(0, 400));
    return portalAdminJson(502, { ok: false, error: "transcribe_failed" });
  }

  let parsed: { text?: string };
  try {
    parsed = await res.json();
  } catch {
    return portalAdminJson(502, { ok: false, error: "bad_response" });
  }

  const text = str(parsed?.text, 4000);
  return portalAdminJson(200, { ok: true, text });
});
