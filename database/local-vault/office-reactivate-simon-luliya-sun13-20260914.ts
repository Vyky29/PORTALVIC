/**
 * Sun 13 Sep: re-activate Luliya cover for Simon Aquatic 9-9.30.
 * Was cancelled when the mistaken Javier reassign was voided; the other 8
 * Aurora→Luliya covers stayed active, so Luliya's day board lost Simon only.
 *
 * Apply: npx -y deno run -A database/local-vault/office-reactivate-simon-luliya-sun13-20260914.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const OV_ID = "daf64540-295c-410a-a121-a5e27ab1e324";
const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";
const REV = "office:reactivate-simon-luliya-sun13-20260914";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");
loadEnv("local-secrets/edge-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: before, error: e0 } = await admin
  .from("schedule_overrides")
  .select(
    "id, status, reason, session_date, anchor_start, anchor_end, anchor_client_id, payload, spreadsheet_revision",
  )
  .eq("id", OV_ID)
  .maybeSingle();
if (e0) throw new Error(e0.message);
console.log("=== before ===");
console.log(JSON.stringify(before, null, 2));
if (!before) {
  console.log("Override missing — abort.");
  Deno.exit(1);
}
if (String(before.status || "") === "active") {
  console.log("Already active.");
  Deno.exit(0);
}

const { data: after, error: e1 } = await admin
  .from("schedule_overrides")
  .update({
    status: "active",
    reason: "Luliya covers Aurora — Simon Aquatic 9–9.30 2026-09-13",
    spreadsheet_revision: REV,
    updated_by: OFFICE_USER,
    updated_at: new Date().toISOString(),
  })
  .eq("id", OV_ID)
  .select(
    "id, status, reason, session_date, anchor_start, anchor_end, anchor_client_id, spreadsheet_revision",
  )
  .maybeSingle();
if (e1) throw new Error(e1.message);
console.log("=== after ===");
console.log(JSON.stringify(after, null, 2));
console.log("rev", REV);
