#!/usr/bin/env node
/**
 * Build step-comunicaciones-push.local.sql from the migration + PORTAL_PUSH_WEBHOOK_SECRET.
 * Never commit the .local.sql file.
 *
 * Usage (repo root):
 *   node database/local-vault/apply-comunicaciones-push.mjs
 *   node database/local-vault/apply-comunicaciones-push.mjs --apply
 *   node database/local-vault/apply-comunicaciones-push.mjs --apply --deploy
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readPushWebhookSecret } from "./read_push_webhook_secret.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const src = path.join(
  root,
  "database/migrations/20260904010000_portal_comunicaciones_push_calls_presence.sql",
);
const outPath = path.join(__dirname, "step-comunicaciones-push.local.sql");
const args = new Set(process.argv.slice(2));

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root });
}

const secret = readPushWebhookSecret();
const tpl = fs.readFileSync(src, "utf8");
if (!tpl.includes("__PORTAL_PUSH_WEBHOOK_SECRET__")) {
  throw new Error("Template placeholder __PORTAL_PUSH_WEBHOOK_SECRET__ missing");
}
fs.writeFileSync(outPath, tpl.replaceAll("__PORTAL_PUSH_WEBHOOK_SECRET__", secret));
console.log("Wrote", path.relative(root, outPath));

if (args.has("--apply")) {
  run("npx supabase db query --linked -f database/local-vault/step-comunicaciones-push.local.sql");
  run(
    'npx supabase db query --linked "select tgname, tgrelid::regclass as on_table from pg_trigger where not tgisinternal and tgname in (\'portal-comms-message-push\',\'portal-comms-call-push\',\'portal-comms-group-member-push\') order by 1;"',
  );
}

if (args.has("--deploy")) {
  run(
    "npx supabase functions deploy portal-push-dispatch-communications --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb",
  );
}

console.log("\nDone.");
