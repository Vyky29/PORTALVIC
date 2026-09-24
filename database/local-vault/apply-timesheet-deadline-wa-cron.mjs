/**
 * Schedule the 24th 23:00 London timesheet WhatsApp and deploy the function.
 *
 *   node database/local-vault/apply-timesheet-deadline-wa-cron.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { readPushWebhookSecret } from "./read_push_webhook_secret.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const tplCron = path.join(root, "database/local-vault/step-timesheet-deadline-wa-cron.template.sql");
const localCron = path.join(root, "database/local-vault/step-timesheet-deadline-wa-cron.local.sql");

function run(cmd, env = process.env) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env });
}

const secret = readPushWebhookSecret();
const tpl = fs.readFileSync(tplCron, "utf8");
if (!tpl.includes("__PORTAL_PUSH_WEBHOOK_SECRET__")) {
  throw new Error("cron template missing placeholder");
}
fs.writeFileSync(localCron, tpl.replaceAll("__PORTAL_PUSH_WEBHOOK_SECRET__", secret));
console.log("Wrote", localCron);

run(`npx supabase db query --linked -f "${localCron}"`);
run(
  `npx supabase functions deploy portal-timesheet-deadline-whatsapp --no-verify-jwt --project-ref ${projectRef}`,
);
console.log("Timesheet reminder cron: 23:00 London on the 24th.");
