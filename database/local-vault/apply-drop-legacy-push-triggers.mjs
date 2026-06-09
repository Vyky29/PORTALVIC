#!/usr/bin/env node
/** Drop legacy Dashboard push triggers that duplicate SQL triggers (wrong secret → 403). */
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const template = path.join(__dirname, "step-drop-legacy-push-triggers.template.sql");
const local = path.join(__dirname, "step-drop-legacy-push-triggers.local.sql");

fs.copyFileSync(template, local);
console.log("Applying", path.basename(local));
execSync(`npx supabase db query --linked -f ${local}`, {
  stdio: "inherit",
  cwd: root,
});
console.log("Done.");
