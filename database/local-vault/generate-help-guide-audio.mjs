#!/usr/bin/env node
/**
 * Pre-generate help guide MP3s → working_ui/portal/help-audio/
 *
 * Usage:
 *   node database/local-vault/generate-help-guide-audio.mjs
 *   node database/local-vault/generate-help-guide-audio.mjs --section login
 *   node database/local-vault/generate-help-guide-audio.mjs --force
 *   node database/local-vault/generate-help-guide-audio.mjs --force --via-portal
 *
 * Uses ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID locally when set (unless --via-portal).
 * --via-portal uses portal-help-voice-speak + Supabase secrets (production club voice).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const guidePath = path.join(root, "working_ui/portal/portal_help_agent_guide.json");
const outDir = path.join(root, "working_ui/portal/help-audio");
const DEFAULT_VOICE = "3WqHLnw80rOZqJzW9YRB";

function readEnv(key) {
  const fromEnv = process.env[key];
  if (fromEnv) return fromEnv.trim();
  const p = path.join(root, "local-secrets/secrets.env");
  if (!fs.existsSync(p)) return "";
  const line = fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  return line ? line.slice(key.length + 1).trim() : "";
}

function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

async function ttsDirect(apiKey, voiceId, text) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: String(text).trim(),
        model_id: "eleven_multilingual_v2",
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs ${res.status}: ${errText.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function ttsViaPortal(text) {
  const url = readEnv("SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = readEnv("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) {
    throw new Error("Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY");
  }
  const base = url.replace(/\/$/, "");
  const admin = createClient(base, serviceKey, { auth: { persistSession: false } });
  const { data: staff, error: staffErr } = await admin
    .from("staff_profiles")
    .select("id,username")
    .in("app_role", ["admin", "ceo", "staff"])
    .limit(1)
    .maybeSingle();
  if (staffErr || !staff?.id) throw new Error("No staff profile for TTS session");

  const { data: userWrap, error: userErr } = await admin.auth.admin.getUserById(staff.id);
  const email = userWrap?.user?.email;
  if (userErr || !email) throw new Error("No auth email for staff " + staff.id);

  const { data: linkWrap, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = linkWrap?.properties?.hashed_token;
  if (linkErr || !tokenHash) throw new Error("generateLink failed: " + (linkErr?.message || "no hash"));

  const anon = createClient(base, anonKey, { auth: { persistSession: false } });
  const { data: verifyWrap, error: verifyErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  const token = verifyWrap?.session?.access_token;
  if (verifyErr || !token) throw new Error("verifyOtp failed: " + (verifyErr?.message || "no token"));

  const res = await fetch(`${base}/functions/v1/portal-help-voice-speak`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
      apikey: anonKey,
    },
    body: JSON.stringify({ text: String(text).trim() }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok || !j.audioBase64) {
    throw new Error("portal-help-voice-speak: " + (j?.error || res.statusText));
  }
  return Buffer.from(j.audioBase64, "base64");
}

function sectionFilter() {
  const idx = process.argv.indexOf("--section");
  return idx >= 0 ? String(process.argv[idx + 1] || "").trim() : "";
}

const apiKey = readEnv("ELEVENLABS_API_KEY");
const voiceId = readEnv("ELEVENLABS_VOICE_ID") || DEFAULT_VOICE;
const viaPortal = process.argv.includes("--via-portal");
const useDirect = Boolean(apiKey) && !viaPortal;

const guide = JSON.parse(fs.readFileSync(guidePath, "utf8"));
const onlySection = sectionFilter();
fs.mkdirSync(outDir, { recursive: true });

let generated = 0;
let skipped = 0;

async function synthesize(text) {
  if (useDirect) return ttsDirect(apiKey, voiceId, text);
  return ttsViaPortal(text);
}

async function ensureAudio({ fileName, text, target, key }) {
  const voice = String(text || "").trim();
  if (!voice) return;
  const rel = `/portal/help-audio/${fileName}`;
  const abs = path.join(outDir, fileName);

  if (fs.existsSync(abs) && !process.argv.includes("--force")) {
    target[key] = rel;
    skipped++;
    return;
  }

  process.stdout.write(`Generating ${fileName}… `);
  try {
    const buf = await synthesize(voice);
    fs.writeFileSync(abs, buf);
    target[key] = rel;
    generated++;
    console.log(`OK (${buf.length} bytes)`);
  } catch (e) {
    console.log("FAIL");
    console.error(e.message || e);
    process.exitCode = 1;
  }
}

for (const section of guide.sections || []) {
  const sid = String(section.id || "").trim();
  if (!sid) continue;
  if (onlySection && sid !== onlySection) continue;

  const steps = Array.isArray(section.steps) ? section.steps : [];
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const fileName = `${sid}-${String(i + 1).padStart(2, "0")}-${slug(st.focus || st.caption || "step")}.mp3`;
    await ensureAudio({
      fileName,
      text: st.voice,
      target: st,
      key: "audio",
    });
  }

  if (!steps.length) {
    const fileName = `${sid}-overview.mp3`;
    await ensureAudio({
      fileName,
      text: section.voice_script,
      target: section,
      key: "audio",
    });
  }
}

guide.version = "2026-06-help-guide-v12";
guide.description =
  "Staff help guide — visual demos + club voice (Eleven Labs via Supabase secrets, no device voice).";
fs.writeFileSync(guidePath, JSON.stringify(guide, null, 2) + "\n");
console.log(
  `Done (${useDirect ? "ElevenLabs direct, voice " + voiceId : "Portal edge / Supabase secrets"}). generated=${generated} skipped=${skipped}`
);
