#!/usr/bin/env node
/**
 * Portal live MADRE: migration + Edge Function deploy + Supabase seed.
 *
 * Usage (repo root):
 *   node database/local-vault/apply-madre-live-document.mjs
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readPushWebhookSecret } from "./read_push_webhook_secret.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const PROJECT_REF = "cklpnwhlqsulpmkipmqb";
const migrationSrc = path.join(
  root,
  "supabase/migrations/20260622150000_portal_madre_document.sql",
);
const sqlOut = path.join(__dirname, "step-madre-live-document.local.sql");
const secretsEnv = path.join(root, "local-secrets/secrets.env");

function run(cmd, opts = {}) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
}

function shellEscape(value) {
  return String(value || "").replace(/"/g, '\\"');
}

function loadSecretsEnv() {
  if (!fs.existsSync(secretsEnv)) {
    throw new Error("Missing local-secrets/secrets.env");
  }
  const out = {};
  for (const line of fs.readFileSync(secretsEnv, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const webhookSecret = readPushWebhookSecret();
const tpl = fs.readFileSync(migrationSrc, "utf8");
if (!tpl.includes("__PORTAL_MADRE_WEBHOOK_SECRET__")) {
  throw new Error("Migration placeholder __PORTAL_MADRE_WEBHOOK_SECRET__ missing");
}
fs.writeFileSync(
  sqlOut,
  tpl.replaceAll("__PORTAL_MADRE_WEBHOOK_SECRET__", webhookSecret),
);
console.log("Wrote", path.relative(root, sqlOut));

run(`npx supabase db query --linked -f "${sqlOut}"`);

run(
  `npx supabase functions deploy portal-madre-apply-fold --no-verify-jwt --project-ref ${PROJECT_REF}`,
);

run(
  `npx supabase secrets set PORTAL_MADRE_WEBHOOK_SECRET="${shellEscape(webhookSecret)}" --project-ref ${PROJECT_REF}`,
);

const env = loadSecretsEnv();
const url = env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!serviceKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in local-secrets/secrets.env");
}

run(
  `SUPABASE_URL="${shellEscape(url)}" SUPABASE_SERVICE_ROLE_KEY="${shellEscape(serviceKey)}" python3 database/roster_review/seed_portal_madre_document.py`,
);

run(
  `npx supabase db query --linked --output json "select term_key, revision, updated_at from public.portal_madre_document where term_key = 'summer-2026';"`,
);

console.log("\nDone. Live MADRE seeded; admin saves will fold back automatically.");
