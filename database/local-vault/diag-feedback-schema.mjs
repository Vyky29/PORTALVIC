#!/usr/bin/env node
/** READ-ONLY: sample rows to learn columns of feedback + quick marks tables. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
function readEnv(key) {
  const p = path.join(root, "local-secrets/secrets.env");
  const line = fs.readFileSync(p, "utf8").split(/\r?\n/).find((l) => l.startsWith(key + "="));
  if (!line) throw new Error("missing " + key);
  return line.slice(key.length + 1).trim();
}
const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"));

for (const tbl of ["session_feedback", "portal_staff_session_quick_marks"]) {
  const { data, error } = await admin.from(tbl).select("*").limit(2);
  console.log("\n==== " + tbl + " ====");
  if (error) { console.log("  error:", error.message); continue; }
  if (!data.length) { console.log("  (no rows)"); continue; }
  console.log("  columns:", Object.keys(data[0]).join(", "));
  console.log("  sample:", JSON.stringify(data[0]));
}
