// @ts-nocheck — Edge Function (Deno).
//
// portal-feedback-voice-transcribe
// --------------------------------
// Session feedback voice → English transcript (Whisper translations).
// Spanish, Italian, and English speech all come out in English. When the
// client name is sent, that spelling is kept and he/she replaces they.
// Staff edit by typing. Parent wording is a later admin or weekly-note step.
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

const HARD_BLOCK: Record<string, 1> = {
  about: 1, after: 1, again: 1, also: 1, back: 1, because: 1, been: 1, before: 1,
  being: 1, came: 1, come: 1, dad: 1, does: 1, doing: 1, down: 1, father: 1,
  first: 1, from: 1, good: 1, great: 1, handover: 1, happy: 1, have: 1, hello: 1,
  into: 1, just: 1, last: 1, like: 1, little: 1, made: 1, make: 1, mom: 1,
  mother: 1, mum: 1, name: 1, next: 1, only: 1, over: 1, parent: 1, parents: 1,
  play: 1, played: 1, please: 1, pool: 1, quite: 1, really: 1, reception: 1,
  sad: 1, same: 1, seed: 1, session: 1, side: 1, soda: 1, some: 1, staff: 1, still: 1, swim: 1, swimming: 1,
  take: 1, talk: 1, team: 1, tell: 1, thank: 1, thanks: 1, that: 1, their: 1,
  them: 1, then: 1, there: 1, these: 1, they: 1, this: 1, those: 1, time: 1,
  today: 1, told: 1, tomorrow: 1, took: 1, under: 1, very: 1, want: 1, wanted: 1,
  was: 1, water: 1, well: 1, went: 1, were: 1, what: 1, when: 1, where: 1,
  which: 1, while: 1, will: 1, with: 1,
};
const AMBIGUOUS_VERBS: Record<string, 1> = { said: 1, says: 1 };

function soundKey(s: string): string {
  let t = String(s || "").toLowerCase();
  try {
    t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch (_) {}
  t = t.replace(/[^a-z]/g, "");
  t = t.replace(/ph/g, "f").replace(/ee/g, "i").replace(/y/g, "i");
  t = t.replace(/z/g, "s").replace(/c/g, "k").replace(/q/g, "k");
  t = t.replace(/(.)\1+/g, "$1");
  return t;
}

function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

function voiceNameParts(fullName: string): string[] {
  return String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter((p) => p.replace(/[^A-Za-z]/g, "").length >= 3);
}

function namesClose(token: string, canon: string): boolean {
  const raw = String(token || "").toLowerCase();
  const c = String(canon || "").toLowerCase();
  if (!raw || !c) return false;
  if (raw === c) return true;
  if (raw.length < 3 || c.length < 3) return false;
  if (Math.abs(raw.length - c.length) > 2) return false;
  const a = soundKey(raw);
  const b = soundKey(c);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.charAt(0) !== b.charAt(0)) return false;
  const sa = a.replace(/[aeiou]/g, "");
  const sb = b.replace(/[aeiou]/g, "");
  if (sa && sa === sb && sa.length >= 2 && lev(a, b) <= 2) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  return lev(a, b) <= 1;
}

function sentenceStart(before: string): boolean {
  const s = String(before || "");
  if (!s.trim()) return true;
  return /[.!?]["']?\s*$/.test(s);
}

function tokenMayBeName(bare: string, atStart: boolean): boolean {
  const low = String(bare || "").toLowerCase();
  if (HARD_BLOCK[low]) return false;
  if (AMBIGUOUS_VERBS[low]) return !!(atStart && /^[A-Z]/.test(bare));
  return true;
}

function fixVoiceNames(text: string, fullName: string): string {
  const parts = voiceNameParts(fullName);
  if (!parts.length) return text;
  return String(text || "").replace(/\b[A-Za-z][A-Za-z'’\-]*\b/g, (word, offset, whole) => {
    let poss = "";
    let bare = word;
    const m = word.match(/^(.*?)(['’]s)$/i);
    if (m) {
      bare = m[1];
      poss = m[2];
    }
    if (bare.length < 3) return word;
    const atStart = sentenceStart(String(whole || "").slice(0, offset));
    if (!tokenMayBeName(bare, atStart)) return word;
    for (const canon of parts) {
      if (bare.toLowerCase() === canon.toLowerCase()) return word;
      if (namesClose(bare, canon)) return canon + poss;
    }
    return word;
  });
}

function applyVoiceCase(sample: string, repl: string): string {
  if (!sample || !repl) return repl;
  const first = sample.charAt(0);
  if (first && first === first.toUpperCase() && first !== first.toLowerCase()) {
    return repl.charAt(0).toUpperCase() + repl.slice(1);
  }
  return repl;
}

function voiceGenderCode(raw: string): "m" | "f" | "" {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "m" || v === "male" || v === "boy") return "m";
  if (v === "f" || v === "female" || v === "girl") return "f";
  return "";
}

function fixVoicePronouns(text: string, gender: string): string {
  const g = voiceGenderCode(gender);
  if (!g) return text;
  const male = g === "m";
  const pairs: Array<[RegExp, string | null]> = [
    [/\bthey were\b/gi, male ? "he was" : "she was"],
    [/\bthey are\b/gi, male ? "he is" : "she is"],
    [/\bthey have\b/gi, male ? "he has" : "she has"],
    [/\bthey don't\b/gi, male ? "he doesn't" : "she doesn't"],
    [/\bthey do not\b/gi, male ? "he does not" : "she does not"],
    [/\bthey're\b/gi, male ? "he's" : "she's"],
    [/\bthey’re\b/gi, male ? "he's" : "she's"],
    [/\bthemselves\b/gi, male ? "himself" : "herself"],
    [/\bthemself\b/gi, male ? "himself" : "herself"],
    [/\btheirs\b/gi, male ? "his" : "hers"],
    [/\btheir\b/gi, male ? "his" : "her"],
    [/\bthem\b/gi, male ? "him" : "her"],
    [/\bthey\b/gi, male ? "he" : "she"],
  ];
  let out = String(text || "");
  for (const [re, repl] of pairs) {
    out = out.replace(re, (match) => applyVoiceCase(match, repl || match));
  }
  return out;
}

function applyClientVoiceFixes(text: string, fullName: string, gender: string): string {
  return fixVoicePronouns(fixVoiceNames(text, fullName), gender);
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
  clientName: string,
): Promise<string> {
  const endpoint = "https://api.openai.com/v1/audio/translations";

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
  form.append("temperature", "0");
  form.append("response_format", "text");
  const nameHint = voiceNameParts(clientName)[0] || "";
  if (nameHint) form.append("prompt", nameHint);

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
  const participantName = String(form.get("participant_name") || "").trim().slice(0, 200);
  const participantGender = voiceGenderCode(String(form.get("participant_gender") || ""));
  const mime = String(file.type || "audio/webm").split(";")[0];
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const rawEnglish = await whisperToEnglish(apiKey, bytes, mime, participantName);
    const english = applyClientVoiceFixes(rawEnglish, participantName, participantGender);
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
