#!/usr/bin/env node
/**
 * Re-sync DB push triggers when Edge returns 403 (webhook secret drift).
 * Reads PORTAL_PUSH_WEBHOOK_SECRET from local-secrets/secrets.env or env var.
 *
 * Usage (repo root):
 *   node database/local-vault/repair-push-triggers.mjs
 *   node database/local-vault/repair-push-triggers.mjs --deploy
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const args = new Set(process.argv.slice(2));

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

function readWebhookSecret() {
  if (process.env.PORTAL_PUSH_WEBHOOK_SECRET?.trim()) {
    return process.env.PORTAL_PUSH_WEBHOOK_SECRET.trim();
  }
  const candidates = [
    path.join(root, "local-secrets/secrets.env"),
    path.join(__dirname, "secrets.template.env"),
  ];
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const line = fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith("PORTAL_PUSH_WEBHOOK_SECRET="));
    if (line) return line.slice("PORTAL_PUSH_WEBHOOK_SECRET=".length).trim();
  }
  throw new Error(
    "Set PORTAL_PUSH_WEBHOOK_SECRET or add it to local-secrets/secrets.env",
  );
}

process.env.PORTAL_PUSH_WEBHOOK_SECRET = readWebhookSecret();

run("node database/local-vault/apply-chat-admin-push.mjs");
run("node database/local-vault/apply-incoming-call-push.mjs");
run("node database/local-vault/apply-staff-dm-push.mjs");
run("npx supabase db query --linked -f database/local-vault/step-chat-admin-push.local.sql");
run("npx supabase db query --linked -f database/local-vault/step-incoming-call-push.local.sql");
run("npx supabase db query --linked -f database/local-vault/step-staff-dm-push.local.sql");

if (args.has("--deploy")) {
  run(
    "npx supabase functions deploy portal-push-dispatch-admin-alert --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb",
  );
  run(
    "npx supabase functions deploy portal-push-dispatch-incoming-call --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb",
  );
  run(
    "npx supabase functions deploy portal-push-dispatch-staff-dm --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb",
  );
}

console.log("\nDone. Re-test push with app closed; net._http_response should show status_code 200.");
