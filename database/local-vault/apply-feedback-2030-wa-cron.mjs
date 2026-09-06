/**
 * Create 20:30 feedback WhatsApp table, schedule cron, deploy Edge Function.
 *
 *   node database/local-vault/apply-feedback-2030-wa-cron.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { readPushWebhookSecret } from "./read_push_webhook_secret.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlTable = path.join(
  root,
  "supabase/migrations/20260906203000_portal_feedback_2030_whatsapp.sql",
);
const tplCron = path.join(root, "database/local-vault/step-feedback-2030-wa-cron.template.sql");
const localCron = path.join(root, "database/local-vault/step-feedback-2030-wa-cron.local.sql");

function loadEnv() {
  const p = path.join(root, "local-secrets/secrets.env");
  const env = { ...process.env };
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, "utf8").split(/\n/)) {
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

const env = loadEnv();
const secret = readPushWebhookSecret();

console.log("[feedback-2030-wa] 1/4 table…");
run(`npx supabase db query --linked -f "${sqlTable}"`, env);

console.log("[feedback-2030-wa] 2/4 write cron SQL…");
const tpl = fs.readFileSync(tplCron, "utf8");
if (!tpl.includes("__PORTAL_PUSH_WEBHOOK_SECRET__")) {
  throw new Error("cron template missing placeholder");
}
fs.writeFileSync(localCron, tpl.replaceAll("__PORTAL_PUSH_WEBHOOK_SECRET__", secret));
console.log("Wrote", localCron);

console.log("[feedback-2030-wa] 3/4 schedule cron…");
run(`npx supabase db query --linked -f "${localCron}"`, env);

console.log("[feedback-2030-wa] 4/4 deploy function…");
run(
  `npx supabase functions deploy portal-feedback-2030-whatsapp --no-verify-jwt --project-ref ${projectRef}`,
  env,
);

console.log("[feedback-2030-wa] done. Cron at 19:30 and 20:30 UTC; send only at 20:30 London.");
console.log(
  "Dry run: POST { force:true, dryRun:true } with x-portal-webhook-secret to portal-feedback-2030-whatsapp",
);
