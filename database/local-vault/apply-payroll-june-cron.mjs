#!/usr/bin/env node
/**
 * Build step-payroll-june-cron.local.sql from migration template + PAYROLL_CRON_SECRET.
 * Run: node database/local-vault/apply-payroll-june-cron.mjs
 * Then: npx supabase db query --linked -f database/local-vault/step-payroll-june-cron.local.sql
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readPayrollCronSecret } from "./read_payroll_cron_secret.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(
  __dirname,
  "../../supabase/migrations/20260625130100_portal_payroll_june26_9am_cron.sql",
);
const outPath = path.join(__dirname, "step-payroll-june-cron.local.sql");

const secret = readPayrollCronSecret();
const tpl = fs.readFileSync(templatePath, "utf8");
if (!tpl.includes("__PAYROLL_CRON_SECRET__")) {
  throw new Error("Template placeholder __PAYROLL_CRON_SECRET__ missing");
}
fs.writeFileSync(outPath, tpl.replaceAll("__PAYROLL_CRON_SECRET__", secret));
console.log("Wrote", path.relative(process.cwd(), outPath));
