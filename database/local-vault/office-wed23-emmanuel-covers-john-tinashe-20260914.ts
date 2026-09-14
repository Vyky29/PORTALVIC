/**
 * Wed 23 Sep: Emmanuel covers John — Tinashe Hub Bespoke 4.30–6
 * (this week Wed 16 already has the override; next Wed needs this one).
 *
 * Dry:  npx -y deno run -A database/local-vault/office-wed23-emmanuel-covers-john-tinashe-20260914.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-wed23-emmanuel-covers-john-tinashe-20260914.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}
loadEnv("local-secrets/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } },
);

const row = {
  session_date: "2026-09-23",
  override_type: "instructor_reassign",
  status: "active",
  anchor_staff_id: "john",
  anchor_client_id: "tinashe",
  anchor_start: "16:30:00",
  anchor_end: "18:00:00",
  anchor_venue: "SwimFarm",
  reason: "Emmanuel covers John — Tinashe Hub Bespoke 4.30–6 2026-09-23",
  payload: {
    area: "Hub Room",
    service: "Bespoke Programme",
    activity: "Bespoke Programme",
    absent_staff_id: "john",
    absent_staff_name: "John",
    covering_staff_id: "emmanuel",
    covering_staff_name: "Emmanuel",
    portal_session_key: "2026-09-23|16:30|tinashe|john",
  },
  spreadsheet_revision: "office:wed23-emmanuel-covers-john-20260914",
};

const { data: existing, error: exErr } = await admin
  .from("schedule_overrides")
  .select("id,status,reason")
  .eq("session_date", "2026-09-23")
  .eq("override_type", "instructor_reassign")
  .eq("anchor_staff_id", "john")
  .eq("anchor_client_id", "tinashe")
  .eq("status", "active");
if (exErr) throw exErr;
console.log("existing", existing);
if (existing && existing.length) {
  console.log("already active — noop");
  Deno.exit(0);
}
if (!APPLY) {
  console.log("dry — would insert", row);
  Deno.exit(0);
}
const { data, error } = await admin.from("schedule_overrides").insert(row).select("id");
if (error) throw error;
console.log("inserted", data);
