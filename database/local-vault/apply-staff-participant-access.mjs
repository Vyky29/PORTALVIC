#!/usr/bin/env node
/** Apply staff_participant_access table + v1 seed on Portal Supabase via CLI. */
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const sqlPath = path.join(
  root,
  "database/migrations/20260617120000_staff_participant_access.sql",
);

execSync(`npx supabase db query --linked -f "${sqlPath}"`, {
  stdio: "inherit",
  cwd: root,
});
console.log("staff_participant_access migration applied.");
