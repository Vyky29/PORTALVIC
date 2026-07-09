#!/usr/bin/env node
/** READ-ONLY: inspect schedule_overrides for Sun 2026-07-05. */
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

const DATE = "2026-07-05";
const { data, error } = await admin
  .from("schedule_overrides")
  .select("*")
  .eq("session_date", DATE)
  .order("created_at", { ascending: true });

if (error) {
  console.error("query error:", error.message);
  process.exit(1);
}
console.log(`schedule_overrides for ${DATE}: ${data.length} rows\n`);
for (const r of data) {
  console.log(
    [
      `id=${r.id}`,
      `status=${r.status}`,
      `type=${r.override_type}`,
      `anchor_staff=${r.anchor_staff_id}`,
      `anchor_venue=${r.anchor_venue}`,
      `anchor_time=${r.anchor_time_slot || r.anchor_time || ""}`,
      `client=${r.anchor_client_id || ""}`,
      `covering=${(r.payload && (r.payload.covering_staff_id || r.payload.covering)) || ""}`,
      `created_by=${r.created_by}`,
      `created_at=${r.created_at}`,
    ].join("  "),
  );
  console.log("   payload=", JSON.stringify(r.payload));
}
