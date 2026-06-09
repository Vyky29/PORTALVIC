#!/usr/bin/env node
/**
 * Build step-chat-admin-push.local.sql from template + PORTAL_PUSH_WEBHOOK_SECRET.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "step-chat-admin-push.template.sql");
const outPath = path.join(__dirname, "step-chat-admin-push.local.sql");
const envPath = path.join(__dirname, "secrets.template.env");

function readSecret() {
  if (process.env.PORTAL_PUSH_WEBHOOK_SECRET?.trim()) {
    return process.env.PORTAL_PUSH_WEBHOOK_SECRET.trim();
  }
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "Set PORTAL_PUSH_WEBHOOK_SECRET or add it to database/local-vault/secrets.template.env",
    );
  }
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("PORTAL_PUSH_WEBHOOK_SECRET="));
  if (!line) throw new Error("PORTAL_PUSH_WEBHOOK_SECRET not found in secrets.template.env");
  return line.slice("PORTAL_PUSH_WEBHOOK_SECRET=".length).trim();
}

const secret = readSecret();
const tpl = fs.readFileSync(templatePath, "utf8");
if (!tpl.includes("__PORTAL_PUSH_WEBHOOK_SECRET__")) {
  throw new Error("Template placeholder __PORTAL_PUSH_WEBHOOK_SECRET__ missing");
}
fs.writeFileSync(outPath, tpl.replaceAll("__PORTAL_PUSH_WEBHOOK_SECRET__", secret));
console.log("Wrote", path.relative(process.cwd(), outPath));
