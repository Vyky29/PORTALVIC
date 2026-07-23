#!/usr/bin/env node
/**
 * Sync Meta WhatsApp secrets to Supabase Portal + deploy Edge Functions.
 *
 * Two-number setup (recommended):
 *   1. Buy a new UK mobile SIM for API-only (portal OTP + parent notify).
 *   2. Meta Business Suite → WhatsApp → Add phone number → verify SMS → Cloud API.
 *   3. Put META_WHATSAPP_PHONE_NUMBER_ID + META_WHATSAPP_TOKEN in local-secrets/secrets.env
 *      (Phone number ID is for the NEW API number, not the company mobile).
 *   4. npm run apply:whatsapp
 *   5. Admin → Settings → Send test WhatsApp
 *   6. Company number: remove from Cloud API if needed, re-register in WhatsApp Business app.
 *   7. API replies: Meta Business Suite inbox (Admin → Settings → Open Meta inbox).
 *
 * Reads META_WHATSAPP_* from local-secrets/secrets.env (paste token there first).
 *
 * Usage (repo root):
 *   node database/local-vault/apply-whatsapp.mjs
 *   node database/local-vault/apply-whatsapp.mjs --secrets-only
 */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const secretsPath = path.join(root, "local-secrets/secrets.env");
const args = new Set(process.argv.slice(2));

const WHATSAPP_KEYS = [
  "META_WHATSAPP_PHONE_NUMBER_ID",
  "META_WHATSAPP_TOKEN",
  "META_WHATSAPP_TEMPLATE_LANG",
  "META_WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "META_WHATSAPP_APP_SECRET",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_URGENT",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_PAYMENT",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_INSTRUCTOR",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_ABSENCE",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_MAKEUP",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_TRIAL",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_CANCELLED",
  "PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE_BOOKING",
  "PORTAL_STAFF_WHATSAPP_TEMPLATE",
  "META_WHATSAPP_TEMPLATE_NAME",
];

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath} — add META_WHATSAPP_TOKEN there first.`);
  }
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function shellEscape(value) {
  return String(value || "").replace(/"/g, '\\"');
}

const env = parseEnvFile(secretsPath);
const required = ["META_WHATSAPP_PHONE_NUMBER_ID", "META_WHATSAPP_TOKEN"];
for (const key of required) {
  if (!String(env[key] || "").trim()) {
    throw new Error(
      `${key} is empty in local-secrets/secrets.env — paste your Meta token and Phone Number ID first.`,
    );
  }
}

const toSet = WHATSAPP_KEYS.filter((k) => String(env[k] || "").trim());
if (!toSet.length) {
  throw new Error("No META_WHATSAPP_* values found in local-secrets/secrets.env");
}

console.log("Syncing WhatsApp secrets to Supabase Portal:", toSet.join(", "));
for (const key of toSet) {
  run(
    `npx supabase secrets set ${key}="${shellEscape(env[key])}" --project-ref ${projectRef}`,
  );
}

if (args.has("--secrets-only")) {
  console.log("\nDone (secrets only).");
  process.exit(0);
}

const functions = [
  "portal-parent-notify-send",
  "portal-staff-notify-send",
  "portal-whatsapp-webhook",
  "staff-profile-otp-request",
];

for (const slug of functions) {
  run(
    `npx supabase functions deploy ${slug} --no-verify-jwt --project-ref ${projectRef}`,
  );
}

console.log("\nDone. WhatsApp secrets synced + functions deployed.");
console.log("Test: admin dashboard → Settings → Send test WhatsApp");
console.log("API inbox (replies): Family messages in admin + Meta Business Suite inbox");
console.log("Company chats: WhatsApp Business app on phone (separate number — not this API ID).");
