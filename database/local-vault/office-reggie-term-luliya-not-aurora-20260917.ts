/**
 * Reggie term seat: Luliya Acton Tue 4.30 (trial instructor), NOT Aurora (Adam Ma).
 * Finish-booking preferredInstructor hardcoded Aurora + ghost Aurora open → double book.
 *
 * Dry:   npx -y deno run -A database/local-vault/office-reggie-term-luliya-not-aurora-20260917.ts
 * Apply: npx -y deno run -A database/local-vault/office-reggie-term-luliya-not-aurora-20260917.ts --apply
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = Deno.args.includes("--apply");
const REV = "office:reggie-term-luliya-20260917";
const ACTOR = "a0d439df-3a8f-439d-b427-b3459552eae1";
const FIRST_TERM_ISO = "2026-09-22";
const SOFT_HOLD = "7df6111a-7d83-4f7b-89fd-ff4e84be3254";

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
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false } },
);

const now = new Date().toISOString();

const { data: roster } = await admin
  .from("portal_roster_rows")
  .select("id,client_name,instructors,time_slot,venue,session_date,day,status,service,area")
  .eq("status", "active")
  .or("client_name.ilike.%Reggie%,client_name.ilike.%Adam Ma%");

console.log("roster before", roster);

const { data: ovs } = await admin
  .from("schedule_overrides")
  .select("id,session_date,override_type,status,anchor_staff_id,anchor_client_id,anchor_start,reason,payload,spreadsheet_revision")
  .eq("status", "active")
  .gte("session_date", "2026-09-20")
  .ilike("reason", "%Reggie%");

console.log("reggie OVs from 20 Sep", ovs);

if (!APPLY) {
  console.log("dry-run — pass --apply to move Reggie term onto Luliya");
  Deno.exit(0);
}

/* 1) Delete wrong Aurora term OVs (PATCH trigger nulls updated_by under service role) */
for (const ov of ovs || []) {
  if (String(ov.anchor_staff_id || "").toLowerCase() !== "aurora") continue;
  const { error } = await admin.from("schedule_overrides").delete().eq("id", ov.id);
  if (error) throw error;
  console.log("deleted aurora ov", ov.id, ov.session_date);
}

/* 2) Move dated Reggie roster rows Aurora → Luliya */
const { data: reggieRows } = await admin
  .from("portal_roster_rows")
  .select("id,client_name,instructors,session_date,time_slot")
  .eq("status", "active")
  .ilike("client_name", "%Reggie%")
  .neq("session_date", "2026-09-15"); /* keep trial dated on Luliya */

for (const row of reggieRows || []) {
  if (/luliya/i.test(String(row.instructors || ""))) {
    console.log("already Luliya", row.id);
    continue;
  }
  const { error } = await admin
    .from("portal_roster_rows")
    .update({
      instructors: "LULIYA",
      area: "Lane (DE)",
      updated_at: now,
    })
    .eq("id", row.id);
  if (error) throw error;
  console.log("roster → Luliya", row.id, row.session_date, row.client_name);
}

/* 3) Ensure standing undated Luliya Reggie 4.30 (term) */
{
  const { data: standing } = await admin
    .from("portal_roster_rows")
    .select("id,client_name,instructors,time_slot,session_date")
    .eq("status", "active")
    .is("session_date", null)
    .eq("day", "Tuesday")
    .ilike("venue", "%Acton%")
    .ilike("instructors", "%Luliya%")
    .or("time_slot.ilike.%4.30%,time_slot.ilike.%4:30%");

  const openOrReggie = (standing || []).find((r) =>
    /reggie|no participant|available|noclient/i.test(String(r.client_name || "")),
  );
  if (openOrReggie && /reggie/i.test(String(openOrReggie.client_name || ""))) {
    console.log("standing Reggie already", openOrReggie.id);
  } else if (openOrReggie) {
    const { error } = await admin
      .from("portal_roster_rows")
      .update({
        client_name: "Reggie Conlon",
        instructors: "LULIYA",
        area: "Lane (DE)",
        service: "Aquatic Activity",
        updated_at: now,
      })
      .eq("id", openOrReggie.id);
    if (error) throw error;
    console.log("standing open → Reggie", openOrReggie.id);
  } else {
    const { error } = await admin.from("portal_roster_rows").insert({
      client_name: "Reggie Conlon",
      instructors: "LULIYA",
      day: "Tuesday",
      time_slot: "4.30 to 5",
      venue: "Acton",
      service: "Aquatic Activity",
      area: "Lane (DE)",
      status: "active",
      session_date: null,
      created_by: ACTOR,
      updated_by: ACTOR,
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;
    console.log("inserted standing Luliya Reggie 4.30");
  }
}

/* 4) Soft-delete Aurora ghost NO PARTICIPANT at 4.30 (Adam already books that band) */
{
  const { data: auroraOpens } = await admin
    .from("portal_roster_rows")
    .select("id,client_name,instructors,time_slot")
    .eq("status", "active")
    .is("session_date", null)
    .eq("day", "Tuesday")
    .ilike("venue", "%Acton%")
    .ilike("instructors", "%Aurora%")
    .or("time_slot.ilike.%4.30%,time_slot.ilike.%4:30%");

  for (const row of auroraOpens || []) {
    if (!/no participant|available|noclient/i.test(String(row.client_name || ""))) continue;
    const { error } = await admin.from("portal_roster_rows").delete().eq("id", row.id);
    if (error) throw error;
    console.log("deleted aurora ghost open", row.id);
  }
}

/* 5) Luliya term OV for first session Tue 22 (and ensure paint) */
{
  const { data: existing } = await admin
    .from("schedule_overrides")
    .select("id")
    .eq("status", "active")
    .eq("session_date", FIRST_TERM_ISO)
    .eq("anchor_staff_id", "luliya")
    .eq("override_type", "client_replace_in_slot")
    .ilike("reason", "%Reggie%")
    .maybeSingle();

  if (existing?.id) {
    console.log("Luliya OV already", existing.id);
  } else {
    const { error } = await admin.from("schedule_overrides").insert({
      session_date: FIRST_TERM_ISO,
      override_type: "client_replace_in_slot",
      status: "active",
      anchor_staff_id: "luliya",
      anchor_client_id: "available",
      anchor_start: "16:30:00",
      anchor_end: "17:00:00",
      anchor_time_slot_label: "4.30 to 5",
      anchor_venue: "Acton",
      payload: {
        to_client_name: "Reggie Conlon",
        replacement_client_name: "Reggie Conlon",
        replacement_client_id: "reggie_conlon",
        new_client: true,
        booking_kind: "term",
        term_new_participant: true,
      },
      reason: "Term — Reggie Conlon with Luliya Acton 4.30–5 (trial instructor; not Aurora/Adam)",
      spreadsheet_revision: REV,
      created_by: ACTOR,
      updated_by: ACTOR,
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;
    console.log("inserted Luliya Reggie term OV", FIRST_TERM_ISO);
  }
}

/* 6) Stamp soft hold instructor=Luliya */
{
  const { data: hold } = await admin
    .from("portal_booking_slot_reservations")
    .select("id,notes")
    .eq("id", SOFT_HOLD)
    .maybeSingle();
  if (hold?.id) {
    let notes = String(hold.notes || "");
    notes = notes.replace(/\binstructor\s*=\s*[^|]+/gi, "").replace(/\|\|+/g, "|").replace(/^\||\|$/g, "");
    notes = [notes, "instructor=Luliya", "office_reggie_luliya_term_20260917"].filter(Boolean).join("|");
    const { error } = await admin
      .from("portal_booking_slot_reservations")
      .update({ notes, updated_at: now })
      .eq("id", hold.id);
    if (error) throw error;
    console.log("hold notes → instructor=Luliya");
  }
}

console.log("APPLY DONE", REV);
