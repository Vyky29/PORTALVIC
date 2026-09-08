/**
 * Tue 8 Sep 2026: Aurora OFF — redistribute Acton Aquatic so Javi Palankas is free.
 *   Adam Mahmmoud → Roberto 4.30–5
 *   Aydaan Ah → Luliya 5.30–6
 *   Anas → Javier 6–6.30
 *   Junaid → Roberto 5.30–6 (was 5–5.30; +30')
 *
 * Dry-run (default):
 *   node database/local-vault/office-tue8-acton-redistribute-free-javi-20260908.mjs
 * Apply:
 *   APPLY=1 node database/local-vault/office-tue8-acton-redistribute-free-javi-20260908.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.env.APPLY === "1";
const DATE = "2026-09-08";
const REVISION = "office:tue8-acton-redistribute-free-javi-20260908";

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !process.env[k]) process.env[k] = v;
  }
}
loadEnv(resolve("local-secrets/secrets.env"));

const url = process.env.SUPABASE_URL || process.env.PORTAL_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PORTAL_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const sb = createClient(url, key, { auth: { persistSession: false } });

function portalSessionKey(iso, startHHMM, clientSlug) {
  return `${iso}|${startHHMM}|${clientSlug}`;
}

async function main() {
  const { data: actorRows, error: actorErr } = await sb
    .from("staff_profiles")
    .select("id, username, app_role")
    .in("app_role", ["ceo", "admin", "lead"])
    .limit(20);
  if (actorErr) throw actorErr;
  const roleRank = { ceo: 0, admin: 1, lead: 2 };
  const actor = (actorRows || [])
    .slice()
    .sort((a, b) => (roleRank[a.app_role] ?? 9) - (roleRank[b.app_role] ?? 9))[0];
  if (!actor?.id) throw new Error("No ceo/admin/lead actor for created_by");

  console.log("Actor:", actor.username, actor.app_role, actor.id);
  console.log(APPLY ? "APPLY=1 — writing" : "Dry-run — set APPLY=1 to write");

  const sameTimeCovers = [
    {
      client: "adam_mahmmoud",
      label: "16.30 to 17",
      start: "16:30:00",
      end: "17:00:00",
      coverId: "roberto",
      coverName: "Roberto",
    },
    {
      client: "aydaan_ah",
      label: "17.30 to 18",
      start: "17:30:00",
      end: "18:00:00",
      coverId: "luliya",
      coverName: "Luliya",
    },
    {
      client: "anas",
      label: "18 to 18.30",
      start: "18:00:00",
      end: "18:30:00",
      coverId: "javier",
      coverName: "Javier",
    },
  ];

  const { data: existing, error: exErr } = await sb
    .from("schedule_overrides")
    .select("id, anchor_client_id, anchor_start, override_type, payload, status, reason")
    .eq("session_date", DATE)
    .eq("status", "active")
    .eq("override_type", "instructor_reassign")
    .eq("anchor_staff_id", "aurora");
  if (exErr) throw exErr;

  console.log("\nExisting Aurora instructor_reassign on", DATE + ":");
  for (const r of existing || []) {
    console.log(
      `  ${r.anchor_client_id} ${r.anchor_start} → ${r.payload?.covering_staff_id} (${r.id})`
    );
  }

  if (!APPLY) {
    console.log("\nWould update adam/aydaan/anas covers; cancel closed+junaid→javi;");
    console.log("Would slot_clear junaid 17:00; client_replace Roberto 17:30 with Junaid;");
    console.log("Would upsert dated portal_roster_rows for redistributed Acton seats.");
    console.log("\nDone (dry-run).");
    return;
  }

  const now = new Date().toISOString();

  for (const slot of sameTimeCovers) {
    const row = (existing || []).find(
      (r) => String(r.anchor_client_id || "").toLowerCase() === slot.client
    );
    const payload = {
      covering_staff_id: slot.coverId,
      covering_staff_name: slot.coverName,
      portal_session_key: portalSessionKey(DATE, slot.start.slice(0, 5), slot.client),
      service: "Aquatic Activity",
      activity: "Aquatic Activity",
      absent_staff_id: "aurora",
    };
    const reason = `${slot.coverName} covers Aurora — ${slot.client} ${slot.label} ${DATE} (Javi free)`;
    if (row?.id) {
      const { error } = await sb
        .from("schedule_overrides")
        .update({
          payload,
          reason,
          anchor_start: slot.start,
          anchor_end: slot.end,
          anchor_venue: "Acton",
          anchor_time_slot_label: slot.label,
          spreadsheet_revision: REVISION,
          updated_by: actor.id,
          updated_at: now,
        })
        .eq("id", row.id);
      if (error) throw error;
      console.log("Updated", slot.client, "→", slot.coverId, row.id);
    } else {
      const { data: ins, error } = await sb
        .from("schedule_overrides")
        .insert([
          {
            session_date: DATE,
            anchor_staff_id: "aurora",
            anchor_start: slot.start,
            anchor_end: slot.end,
            anchor_venue: "Acton",
            anchor_client_id: slot.client,
            anchor_time_slot_label: slot.label,
            override_type: "instructor_reassign",
            payload,
            reason,
            status: "active",
            superseded_by: null,
            spreadsheet_revision: REVISION,
            created_by: actor.id,
            updated_by: actor.id,
          },
        ])
        .select("id");
      if (error) throw error;
      console.log("Inserted", slot.client, "→", slot.coverId, ins?.[0]?.id);
    }
  }

  for (const cancelClient of ["closed", "junaid_f"]) {
    const rows = (existing || []).filter(
      (r) => String(r.anchor_client_id || "").toLowerCase() === cancelClient
    );
    for (const row of rows) {
      const { error } = await sb
        .from("schedule_overrides")
        .update({
          status: "cancelled",
          reason: `Cancelled — Tue 8 Acton redistribute (Javi free); was Javi cover`,
          spreadsheet_revision: REVISION,
          updated_by: actor.id,
          updated_at: now,
        })
        .eq("id", row.id);
      if (error) throw error;
      console.log("Cancelled", cancelClient, row.id);
    }
  }

  const clearJunaid = {
    session_date: DATE,
    anchor_staff_id: "aurora",
    anchor_start: "17:00:00",
    anchor_end: "17:30:00",
    anchor_venue: "Acton",
    anchor_client_id: "junaid_f",
    anchor_time_slot_label: "17 to 17.30",
    override_type: "slot_clear_client",
    payload: {
      note: "Junaid moved +30' to Roberto 5.30–6 (Aurora OFF redistribute)",
      client_name: "Junaid",
      cancelled_by_admin: true,
    },
    reason: "Junaid Aurora 5–5.30 cleared — moves to Roberto 5.30–6",
    status: "active",
    superseded_by: null,
    spreadsheet_revision: REVISION,
    created_by: actor.id,
    updated_by: actor.id,
  };

  const { data: existingClear } = await sb
    .from("schedule_overrides")
    .select("id")
    .eq("session_date", DATE)
    .eq("override_type", "slot_clear_client")
    .eq("anchor_client_id", "junaid_f")
    .eq("status", "active");
  if (existingClear?.length) {
    const { error } = await sb
      .from("schedule_overrides")
      .update({
        payload: clearJunaid.payload,
        reason: clearJunaid.reason,
        spreadsheet_revision: REVISION,
        updated_by: actor.id,
        updated_at: now,
      })
      .eq("id", existingClear[0].id);
    if (error) throw error;
    console.log("Updated slot_clear junaid", existingClear[0].id);
  } else {
    const { data: ins, error } = await sb
      .from("schedule_overrides")
      .insert([clearJunaid])
      .select("id");
    if (error) throw error;
    console.log("Inserted slot_clear junaid", ins?.[0]?.id);
  }

  const replaceJunaid = {
    session_date: DATE,
    anchor_staff_id: "roberto",
    anchor_start: "17:30:00",
    anchor_end: "18:00:00",
    anchor_venue: "Acton",
    anchor_client_id: "available",
    anchor_time_slot_label: "17.30 to 18",
    override_type: "client_replace_in_slot",
    payload: {
      to_client_id: "junaid_f",
      to_client_name: "Junaid",
      replacement_client_id: "junaid_f",
      replacement_client_name: "Junaid",
      portal_session_key: portalSessionKey(DATE, "17:30", "junaid_f"),
      service: "Aquatic Activity",
      roster_service: "Aquatic Activity",
    },
    reason: "Junaid onto Roberto open 5.30–6 (Aurora OFF redistribute)",
    status: "active",
    superseded_by: null,
    spreadsheet_revision: REVISION,
    created_by: actor.id,
    updated_by: actor.id,
  };

  const { data: existingReplace } = await sb
    .from("schedule_overrides")
    .select("id")
    .eq("session_date", DATE)
    .eq("override_type", "client_replace_in_slot")
    .eq("anchor_staff_id", "roberto")
    .eq("anchor_start", "17:30:00")
    .eq("status", "active");
  if (existingReplace?.length) {
    const { error } = await sb
      .from("schedule_overrides")
      .update({
        payload: replaceJunaid.payload,
        reason: replaceJunaid.reason,
        spreadsheet_revision: REVISION,
        updated_by: actor.id,
        updated_at: now,
      })
      .eq("id", existingReplace[0].id);
    if (error) throw error;
    console.log("Updated client_replace junaid→roberto", existingReplace[0].id);
  } else {
    const { data: ins, error } = await sb
      .from("schedule_overrides")
      .insert([replaceJunaid])
      .select("id");
    if (error) throw error;
    console.log("Inserted client_replace junaid→roberto", ins?.[0]?.id);
  }

  const datedRows = [
    {
      client_name: "Adam Mahmmoud",
      instructors: "ROBERTO",
      time_slot: "4.30 to 5",
    },
    {
      client_name: "Junaid",
      instructors: "ROBERTO",
      time_slot: "5.30 to 6",
    },
    {
      client_name: "Aydaan Ah",
      instructors: "LULIYA",
      time_slot: "5.30 to 6",
    },
    {
      client_name: "Anas",
      instructors: "JAVIER",
      time_slot: "6 to 6.30",
    },
  ].map((r) => ({
    ...r,
    day: "Tuesday",
    service: "Aquatic Activity",
    area: "Teaching Pool",
    venue: "Acton",
    session_date: DATE,
    status: "active",
  }));

  const { data: oldDated, error: oldErr } = await sb
    .from("portal_roster_rows")
    .select("id, client_name, instructors, time_slot")
    .eq("session_date", DATE)
    .ilike("venue", "%Acton%")
    .eq("status", "active");
  if (oldErr) throw oldErr;

  for (const old of oldDated || []) {
    const { error } = await sb
      .from("portal_roster_rows")
      .update({ status: "inactive" })
      .eq("id", old.id);
    if (error) throw error;
    console.log("Inactivated dated", old.client_name, old.instructors, old.time_slot, old.id);
  }

  const { data: inserted, error: insRowsErr } = await sb
    .from("portal_roster_rows")
    .insert(datedRows)
    .select("id, client_name, instructors, time_slot");
  if (insRowsErr) throw insRowsErr;
  console.log("\nInserted dated portal_roster_rows:");
  for (const r of inserted || []) {
    console.log(`  ${r.client_name} ${r.instructors} ${r.time_slot} (${r.id})`);
  }

  const { data: verify } = await sb
    .from("schedule_overrides")
    .select("override_type, anchor_staff_id, anchor_client_id, anchor_start, payload, status")
    .eq("session_date", DATE)
    .eq("status", "active")
    .order("anchor_start");
  console.log("\nActive overrides on", DATE + ":");
  for (const r of verify || []) {
    const cover =
      r.payload?.covering_staff_id ||
      r.payload?.to_client_name ||
      r.payload?.replacement_client_name ||
      "";
    console.log(
      `  ${r.override_type} ${r.anchor_staff_id} ${r.anchor_client_id} ${r.anchor_start} → ${cover}`
    );
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
