/**
 * Fri 18 Sep 2026: Youssef day-off requested. Ikram 11-3 stays COVER NEEDED
 * (Michelle already on Ikram — do not reassign her onto this seat).
 * Adam P aquatic already cancelled separately.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-fri18-youssef-ikram-cover-needed-20260918.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ISO = "2026-09-18";
const REV = "office:fri18-youssef-ikram-cover-needed-20260918";

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
loadEnv("local-secrets/edge-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const ACTOR = "a0d439df-3a8f-439d-b427-b3459552eae1";

console.log("PLAN COVER NEEDED Youssef Ikram 11-3 Fri 18 APPLY", APPLY);
if (!APPLY) {
  console.log("Dry-run. Re-run with APPLY=1");
  Deno.exit(0);
}

const now = new Date().toISOString();

{
  const { error } = await admin
    .from("schedule_overrides")
    .update({
      status: "cancelled",
      reason: "Superseded — " + REV,
      spreadsheet_revision: REV,
      updated_by: ACTOR,
      updated_at: now,
    })
    .eq("session_date", ISO)
    .eq("status", "active")
    .eq("override_type", "instructor_cover_needed")
    .eq("anchor_staff_id", "youssef")
    .eq("anchor_client_id", "ikram");
  if (error) throw new Error(error.message);
}

const { data, error } = await admin
  .from("schedule_overrides")
  .insert({
    session_date: ISO,
    anchor_staff_id: "youssef",
    anchor_start: "11:00:00",
    anchor_end: "15:00:00",
    anchor_venue: "SwimFarm",
    anchor_client_id: "ikram",
    anchor_time_slot_label: "11 to 3",
    override_type: "instructor_cover_needed",
    payload: {
      cover_needed: true,
      covering_staff_id: "cover_needed",
      covering_staff_name: "COVER NEEDED",
      source: "day_off_requested",
      service: "Day Centre",
      area: "Hub Room",
    },
    reason: "Youssef day off requested Fri 18 — Ikram 11-3 COVER NEEDED (do not reassign Michelle onto this seat)",
    status: "active",
    spreadsheet_revision: REV,
    created_by: ACTOR,
    updated_by: ACTOR,
  })
  .select("id,anchor_client_id,anchor_time_slot_label")
  .maybeSingle();
if (error) throw new Error(error.message);
console.log("cover needed", data);
console.log("done", REV);
