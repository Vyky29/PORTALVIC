#!/usr/bin/env node
/**
 * Re-sync DB push triggers + Edge secrets after PORTAL_PUSH_WEBHOOK_SECRET rotation.
 * Fixes 403 on net._http_response when app-closed chat/call push stops working.
 *
 * Usage (repo root):
 *   node database/local-vault/repair-push-triggers.mjs
 *   node database/local-vault/repair-push-triggers.mjs --deploy
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readPushWebhookSecret } from "./read_push_webhook_secret.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const args = new Set(process.argv.slice(2));

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root });
}

function shellEscape(value) {
  return String(value || "").replace(/"/g, '\\"');
}

const webhookSecret = readPushWebhookSecret();

run("node database/local-vault/sync-vapid-public-js.mjs");
run("node database/local-vault/apply-chat-admin-push.mjs");
run("node database/local-vault/apply-incoming-call-push.mjs");
run("node database/local-vault/apply-staff-dm-push.mjs");
run("npx supabase db query --linked -f database/local-vault/step-chat-admin-push.local.sql");
run("npx supabase db query --linked -f database/local-vault/step-incoming-call-push.local.sql");
run("npx supabase db query --linked -f database/local-vault/step-staff-dm-push.local.sql");

const edgeEnv = path.join(root, "local-secrets/edge-secrets.env");
if (fs.existsSync(edgeEnv)) {
  run(`npx supabase secrets set --env-file ${edgeEnv}`);
}
// Canonical webhook secret must match SQL triggers (same source as apply-*.mjs).
run(`npx supabase secrets set PORTAL_PUSH_WEBHOOK_SECRET="${shellEscape(webhookSecret)}"`);

if (args.has("--deploy")) {
  const ref = "cklpnwhlqsulpmkipmqb";
  run(`npx supabase functions deploy portal-push-dispatch-staff-dm --no-verify-jwt --project-ref ${ref}`);
  run(`npx supabase functions deploy portal-push-dispatch-admin-alert --no-verify-jwt --project-ref ${ref}`);
  run(`npx supabase functions deploy portal-push-dispatch-incoming-call --no-verify-jwt --project-ref ${ref}`);
}

console.log("\nDone. Triggers + Edge PORTAL_PUSH_WEBHOOK_SECRET synced from local-secrets/secrets.env.");
console.log("Test: Victor → Teflon with Teflon portal closed; expect OS notification + sound.");
