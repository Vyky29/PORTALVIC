#!/usr/bin/env node
/** Read PAYROLL_CRON_SECRET from env, local-secrets/secrets.env, or secrets.template.env. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

export function readPayrollCronSecret() {
  if (process.env.PAYROLL_CRON_SECRET?.trim()) {
    return process.env.PAYROLL_CRON_SECRET.trim();
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
      .find((l) => l.startsWith("PAYROLL_CRON_SECRET="));
    const val = line ? line.slice("PAYROLL_CRON_SECRET=".length).trim() : "";
    if (val) return val;
  }
  throw new Error(
    "PAYROLL_CRON_SECRET missing — export it or add to local-secrets/secrets.env",
  );
}
