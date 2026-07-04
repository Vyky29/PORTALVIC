#!/usr/bin/env node
/**
 * ElevenLabs MP3 for session-feedback-narrative-demo.html
 *
 *   node database/local-vault/generate-session-narrative-demo-audio.mjs
 *   node database/local-vault/generate-session-narrative-demo-audio.mjs --lang es
 *   node database/local-vault/generate-session-narrative-demo-audio.mjs --lang it
 *   node database/local-vault/generate-session-narrative-demo-audio.mjs --all
 *
 * Audio may be ES / IT / EN — on-screen transcript in the demo is always English.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "working_ui/portal/demo");
const DEFAULT_VOICE = "3WqHLnw80rOZqJzW9YRB";

const SCRIPTS = {
  en:
    "Reception. The participant arrived at the pool happy, relaxed and eager to begin the session. " +
    "The handover with both the participant and their mother was positive, with no concerns raised before entering the water. " +
    "Session. At the beginning, the participant was not yet engaged with the planned activities. " +
    "He did not respond to initial instructions or motivators and focused on freely exploring the pool. " +
    "I used Intensive Interaction for about five minutes, then introduced First–Then with Seahorse and a break. " +
    "He completed Seahorse and later Front Kicking with a noodle, with movement breaks between activities. " +
    "Handover. About ten minutes before the end he wanted to finish early for the sauna and asked for food. " +
    "I accompanied him to the sauna, then explained the session to his mother, including the snack request and finishing slightly early.",
  es:
    "Recepción. El participante llegó contento, tranquilo y con ganas de entrar a la piscina. " +
    "La recepción con él y con su madre fue positiva y no hubo ninguna incidencia antes de comenzar la sesión. " +
    "Sesión. Al inicio no mostró interés por las actividades planificadas. No seguía instrucciones ni motivadores. " +
    "Usé Intensive Interaction unos cinco minutos, luego First–Then con Seahorse y descanso. " +
    "Completó Seahorse y Front Kicking con noodle, con descansos entre actividades. " +
    "Handover. Diez minutos antes pidió ir a la sauna y comida. Acompañé a la sauna y expliqué todo a su madre.",
  it:
    "Accoglienza. Il partecipante è arrivato contento e tranquillo, pronto per la piscina. " +
    "Il passaggio con la mamma è stato positivo, senza problemi prima di entrare in acqua. " +
    "Sessione. All'inizio non era coinvolto nelle attività pianificate. Non seguiva istruzioni né motivatori. " +
    "Ho usato Intensive Interaction per circa cinque minuti, poi First–Then con Seahorse e pausa. " +
    "Ha completato Seahorse e Front Kicking con il noodle, con pause tra le attività. " +
    "Consegna. Dieci minuti prima ha chiesto la sauna e da mangiare. L'ho accompagnato e ho spiegato tutto alla mamma.",
};

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

function parseLangArg() {
  if (process.argv.includes("--all")) return ["en", "es", "it"];
  const idx = process.argv.indexOf("--lang");
  if (idx >= 0) {
    const v = String(process.argv[idx + 1] || "en").trim().toLowerCase();
    if (SCRIPTS[v]) return [v];
  }
  return ["en"];
}

async function synthesize(apiKey, voiceId, text) {
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
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.78,
          style: 0.1,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const apiKey = readEnv("ELEVENLABS_API_KEY");
  const voiceId = readEnv("ELEVENLABS_VOICE_ID") || DEFAULT_VOICE;
  if (!apiKey) {
    console.error("Missing ELEVENLABS_API_KEY");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const langs = parseLangArg();

  for (const lang of langs) {
    const outFile = path.join(outDir, `session-narrative-demo-${lang}.mp3`);
    process.stdout.write(`Generating ${lang}… `);
    const buf = await synthesize(apiKey, voiceId, SCRIPTS[lang]);
    fs.writeFileSync(outFile, buf);
    console.log(`OK ${outFile} (${buf.length} bytes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
