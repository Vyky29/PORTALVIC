#!/usr/bin/env node
/** Apply Sevitha office portal + payslip RLS on Portal Supabase via CLI. */
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const sqlPath = path.join(__dirname, "step-sevitha-office-portal.sql");

execSync(`npx supabase db query --linked -f "${sqlPath}"`, {
  stdio: "inherit",
  cwd: root,
});
console.log("Sevitha office portal SQL applied.");
