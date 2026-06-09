#!/usr/bin/env node
/** Apply DM permission fix on Portal via Supabase CLI. */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const sqlPath = path.join(__dirname, "step-dm-permission-fix.template.sql");

execSync(`npx supabase db query --linked -f "${sqlPath}"`, {
  stdio: "inherit",
  cwd: root,
});
console.log("DM permission fix applied.");
