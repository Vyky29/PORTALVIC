#!/usr/bin/env node
/** Apply Scheduling & Cover RLS write permissions on Portal via Supabase CLI. */
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const sqlPath = path.join(__dirname, "step-schedule-overrides-permissions.template.sql");

execSync(`npx supabase db query --linked -f "${sqlPath}"`, {
  stdio: "inherit",
  cwd: root,
});
console.log("Schedule overrides permissions applied.");
