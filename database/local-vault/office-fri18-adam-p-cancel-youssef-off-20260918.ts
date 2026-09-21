/**
 * Fri 18 Sep 2026: Youssef day-off requested (illness). Office called Adam P's
 * mother and cancelled Acton Aquatic (standing 4-5.30 = three 30' seats).
 *
 *   npx -y deno run -A database/local-vault/office-fri18-adam-p-cancel-youssef-off-20260918.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-fri18-adam-p-cancel-youssef-off-20260918.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ISO = "2026-09-18";
const REV = "office:fri18-adam-p-cancel-youssef-off-20260918";

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

const halves = [
  { start: "16:00:00", end: "16:30:00", label: "4 to 4.30" },
  { start: "16:30:00", end: "17:00:00", label: "4.30 to 5" },
  { start: "17:00:00", end: "17:30:00", label: "5 to 5.30" },
];

console.log("PLAN cancel Adam Pi aquatic Fri 18", halves.length, "halves APPLY", APPLY);

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
    .eq("override_type", "slot_clear_client")
    .eq("anchor_staff_id", "youssef")
    .eq("anchor_client_id", "adam_pi");
  if (error) throw new Error(error.message);
}

for (const h of halves) {
  const { data, error } = await admin
    .from("schedule_overrides")
    .insert({
      session_date: ISO,
      anchor_staff_id: "youssef",
      anchor_start: h.start,
      anchor_end: h.end,
      anchor_venue: "Acton",
      anchor_client_id: "adam_pi",
      anchor_time_slot_label: h.label,
      override_type: "slot_clear_client",
      payload: {
        cancelled_by_admin: true,
        feedback_resolution: "cancelled",
        service: "Aquatic Activity",
        activity: "Aquatic Activity",
        portal_session_key: `${ISO}|${h.start.slice(0, 5)}|adam_pi|youssef`,
        area: "Teaching Pool",
        office_note: "Office called mum — Youssef day off requested (illness)",
      },
      reason: "Adam P cancelled Fri 18 Acton Aquatic " + h.label + " — office called mum (Youssef day off)",
      status: "active",
      spreadsheet_revision: REV,
      created_by: ACTOR,
      updated_by: ACTOR,
    })
    .select("id,anchor_start,anchor_time_slot_label")
    .maybeSingle();
  if (error) throw new Error(error.message);
  console.log("cancel", data);
}

console.log("done", REV);
