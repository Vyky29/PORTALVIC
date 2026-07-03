// @ts-nocheck — Edge Function (Deno).
//
// portal-feedback-voice-transcribe
// --------------------------------
// Session feedback voice → English text (Whisper). ES/IT use translations endpoint.
//
// GET  → { ok: true, whisper: boolean }
// POST multipart/form-data:
//   file     — audio (webm/ogg/mp4/m4a/wav), max ~6 MB
//   language — es | it | en  (hint for Whisper)
//
// Headers: apikey + Authorization: Bearer <user JWT>
//
// Env: OPENAI_API_KEY (optional — when missing, POST returns 503 + fallback webspeech)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logSessionFeedbackNarrativeAudit } from "../_shared/session_feedback_narrative_audit.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MAX_BYTES = 6 * 1024 * 1024;

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

async function verifyPortalStaff(req: Request) {
  const jwt = bearerUserJwt(req);
  if (!jwt) return null;

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return null;

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) return null;

  const uid = String(userData.user.id);
  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("id, full_name, username, is_active")
    .eq("id", uid)
    .maybeSingle();

  if (!profile || profile.is_active === false) return null;
  return { userId: uid, profile };
}

function normalizeLang(raw: string): string {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "es" || v.startsWith("es-")) return "es";
  if (v === "it" || v.startsWith("it-")) return "it";
  return "en";
}

async function whisperToEnglish(
  apiKey: string,
  bytes: Uint8Array,
  mime: string,
  language: string,
): Promise<string> {
  const isEn = language === "en";
  const endpoint = isEn
    ? "https://api.openai.com/v1/audio/transcriptions"
    : "https://api.openai.com/v1/audio/translations";

  const ext =
    mime.indexOf("ogg") >= 0
      ? "ogg"
      : mime.indexOf("mp4") >= 0 || mime.indexOf("m4a") >= 0
        ? "m4a"
        : mime.indexOf("mpeg") >= 0 || mime.indexOf("mp3") >= 0
          ? "mp3"
          : mime.indexOf("wav") >= 0
            ? "wav"
            : "webm";

  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: mime || "audio/webm" }),
    `feedback.${ext}`,
  );
  form.append("model", "whisper-1");
  if (isEn) form.append("language", "en");
  form.append("response_format", "text");

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[portal-feedback-voice-transcribe] OpenAI error", res.status, errText);
    throw new Error("openai_failed");
  }

  const text = String(await res.text()).trim();
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method === "GET") {
    return json({
      ok: true,
      whisper: Boolean(Deno.env.get("OPENAI_API_KEY")),
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const staff = await verifyPortalStaff(req);
  if (!staff) return json({ ok: false, error: "unauthorized" }, 401);

  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  if (!apiKey) {
    return json(
      { ok: false, error: "no_openai", fallback: "webspeech" },
      503,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (_) {
    return json({ ok: false, error: "bad_form" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    return json({ ok: false, error: "missing_file" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ ok: false, error: "file_too_large" }, 413);
  }

  const language = normalizeLang(String(form.get("language") || "en"));
  const mime = String(file.type || "audio/webm").split(";")[0];
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const english = await whisperToEnglish(apiKey, bytes, mime, language);
    if (!english) {
      return json({ ok: false, error: "empty_transcript", fallback: "webspeech" }, 422);
    }
    await logSessionFeedbackNarrativeAudit({
      source: "voice_transcribe",
      staffUserId: staff.userId,
      staffDisplayName: String(staff.profile.full_name || staff.profile.username || "").trim(),
      narrativeEn: english,
      voiceLanguage: language,
      filterStatus: "ok",
    });
    return json({ ok: true, english, language });
  } catch (_) {
    return json({ ok: false, error: "transcribe_failed", fallback: "webspeech" }, 502);
  }
});
