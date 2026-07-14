/**
 * Apply weekly notes table + deploy generate + participant-detail, then backfill Day Centre.
 *
 *   node database/local-vault/apply-parent-weekly-notes.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import fs from "node:fs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlPath = path.join(
  root,
  "supabase/migrations/20260714120000_portal_parent_weekly_notes.sql",
);

const DAY_CENTRE_CONTACTS = [
  "101", // Fadi
  "gap-ikram-omar",
  "gap-emanuel-dodson",
  "gap-timi-dairo",
];

function loadEnv() {
  const p = path.join(root, "local-secrets/secrets.env");
  const raw = fs.readFileSync(p, "utf8");
  const env = { ...process.env };
  for (const line of raw.split(/\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

function run(cmd, env = process.env) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env });
}

async function readWebhookSecret(env) {
  if (env.PORTAL_PUSH_WEBHOOK_SECRET?.trim()) return env.PORTAL_PUSH_WEBHOOK_SECRET.trim();
  try {
    const { readPushWebhookSecret } = await import("./read_push_webhook_secret.mjs");
    return readPushWebhookSecret();
  } catch {
    return "";
  }
}

async function backfill(env) {
  const secret = await readWebhookSecret(env);
  if (!secret) {
    console.warn("[apply-parent-weekly-notes] skip backfill — no PORTAL_PUSH_WEBHOOK_SECRET");
    return;
  }
  const url = `${env.SUPABASE_URL}/functions/v1/portal-parent-weekly-notes-generate`;
  const body = {
    mode: "backfill",
    from_date: "2026-06-01",
    through_date: "2026-07-10",
    contact_ids: DAY_CENTRE_CONTACTS,
    force: true,
  };
  console.log("\n[backfill] POST", url, body);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY}`,
      "x-portal-webhook-secret": secret,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  console.log("[backfill]", res.status, JSON.stringify(json, null, 2).slice(0, 4000));
  if (!res.ok || !json.ok) process.exitCode = 1;
}

const env = loadEnv();
console.log("[apply-parent-weekly-notes] 1/3 apply SQL…");
run(`npx supabase db query --linked -f "${sqlPath}"`, env);

console.log("[apply-parent-weekly-notes] 2/3 deploy functions…");
run(
  `npx supabase functions deploy portal-parent-weekly-notes-generate --no-verify-jwt --project-ref ${projectRef}`,
  env,
);
run(
  `npx supabase functions deploy parent-portal-participant-detail --no-verify-jwt --project-ref ${projectRef}`,
  env,
);

console.log("[apply-parent-weekly-notes] 3/3 backfill Day Centre Jun 1 – Jul 10…");
await backfill(env);

console.log("[apply-parent-weekly-notes] done.");
