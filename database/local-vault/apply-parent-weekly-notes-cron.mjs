/**
 * Apply weekly-notes notified_at column, deploy generate+notify, schedule crons.
 *
 *   node database/local-vault/apply-parent-weekly-notes-cron.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { readPushWebhookSecret } from "./read_push_webhook_secret.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const sqlNotified = path.join(
  root,
  "supabase/migrations/20260714130000_portal_parent_weekly_notes_notified.sql",
);
const tplCron = path.join(
  root,
  "database/local-vault/step-parent-weekly-notes-cron.template.sql",
);
const localCron = path.join(
  root,
  "database/local-vault/step-parent-weekly-notes-cron.local.sql",
);

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

console.log("[weekly-notes-cron] 1/4 SQL notified_at…");
run(`npx supabase db query --linked -f "${sqlNotified}"`, env);

console.log("[weekly-notes-cron] 2/4 write cron SQL…");
const tpl = fs.readFileSync(tplCron, "utf8");
if (!tpl.includes("__PORTAL_PUSH_WEBHOOK_SECRET__")) {
  throw new Error("cron template missing placeholder");
}
fs.writeFileSync(localCron, tpl.replaceAll("__PORTAL_PUSH_WEBHOOK_SECRET__", secret));
console.log("Wrote", localCron);

console.log("[weekly-notes-cron] 3/4 schedule crons…");
run(`npx supabase db query --linked -f "${localCron}"`, env);

console.log("[weekly-notes-cron] 4/4 deploy function…");
run(
  `npx supabase functions deploy portal-parent-weekly-notes-generate --no-verify-jwt --project-ref ${projectRef}`,
  env,
);

console.log("[weekly-notes-cron] done.");
console.log(
  "Jobs: Tuesday eve (Sat/Sun/Mon-only), Saturday morn (Tue–Fri + mixed). Portal only — no WhatsApp.",
);
