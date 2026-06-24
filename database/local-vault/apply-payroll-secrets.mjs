#!/usr/bin/env node
/**
 * Push payroll Edge Function secrets to Supabase Portal.
 * Reads PAYROLL_CRON_SECRET (+ optional RESEND / PAYROLL_REPORT_*) from local-secrets/secrets.env.
 * Generates PAYROLL_CRON_SECRET if missing.
 *
 * Usage: npm run apply:payroll-secrets
 */
import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const projectRef = "cklpnwhlqsulpmkipmqb";
const secretsPath = path.join(root, "local-secrets/secrets.env");

const PAYROLL_KEYS = [
  "PAYROLL_CRON_SECRET",
  "RESEND_API_KEY",
  "PAYROLL_REPORT_FROM",
  "PAYROLL_REPORT_TO",
];

function run(cmd) {
  console.log("\n$", cmd);
  execSync(cmd, { stdio: "inherit", cwd: root, env: process.env });
}

function parseEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function ensureSecretsFile() {
  if (!fs.existsSync(secretsPath)) {
    fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
    fs.writeFileSync(secretsPath, "# Portal local secrets\n", "utf8");
  }
}

function ensurePayrollCronSecret() {
  ensureSecretsFile();
  let raw = fs.readFileSync(secretsPath, "utf8");
  const hasLine = raw.split(/\r?\n/).some((l) => l.startsWith("PAYROLL_CRON_SECRET="));
  if (!hasLine) {
    const secret = crypto.randomBytes(32).toString("hex");
    raw = raw.trimEnd() + `\nPAYROLL_CRON_SECRET=${secret}\n`;
    fs.writeFileSync(secretsPath, raw, "utf8");
    console.log("Generated PAYROLL_CRON_SECRET in local-secrets/secrets.env");
  }
}

function shellEscape(value) {
  return String(value || "").replace(/"/g, '\\"');
}

ensurePayrollCronSecret();
const env = parseEnvFile(secretsPath);

const toSet = PAYROLL_KEYS.filter((k) => String(process.env[k] || env[k] || "").trim());
if (!toSet.includes("PAYROLL_CRON_SECRET")) {
  throw new Error("PAYROLL_CRON_SECRET is required");
}

console.log("Syncing payroll secrets to Supabase Portal:", toSet.join(", "));
for (const key of toSet) {
  const val = String(process.env[key] || env[key] || "").trim();
  run(`npx supabase secrets set ${key}="${shellEscape(val)}" --project-ref ${projectRef}`);
}
console.log("\nOK: payroll secrets synced.");
