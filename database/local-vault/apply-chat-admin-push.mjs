#!/usr/bin/env node
/**
 * Build step-chat-admin-push.local.sql from template + PORTAL_PUSH_WEBHOOK_SECRET.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readPushWebhookSecret } from "./read_push_webhook_secret.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "step-chat-admin-push.template.sql");
const outPath = path.join(__dirname, "step-chat-admin-push.local.sql");

const secret = readPushWebhookSecret();
const tpl = fs.readFileSync(templatePath, "utf8");
if (!tpl.includes("__PORTAL_PUSH_WEBHOOK_SECRET__")) {
  throw new Error("Template placeholder __PORTAL_PUSH_WEBHOOK_SECRET__ missing");
}
fs.writeFileSync(outPath, tpl.replaceAll("__PORTAL_PUSH_WEBHOOK_SECRET__", secret));
console.log("Wrote", path.relative(process.cwd(), outPath));
