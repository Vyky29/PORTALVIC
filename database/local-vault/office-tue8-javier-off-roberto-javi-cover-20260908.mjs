/**
 * Tue 8 Sep 2026: Javier Marquez OFF — cover his Acton Aquatic book.
 *   Ayman 4–4.30 → Roberto (was Javier 4–5)
 *   Linda 5–5.30 → Javi Palankas
 *   Rayan Ta 5.30–6 → Javi Palankas
 *   Anas 6–6.30 → Javi Palankas (was on Javier after Aurora redistribute)
 *
 * Also upserts dated portal_roster_rows for the full Tue 8 Acton redistribute board.
 *
 * Dry-run:
 *   node database/local-vault/office-tue8-javier-off-roberto-javi-cover-20260908.mjs
 * Apply:
 *   APPLY=1 node database/local-vault/office-tue8-javier-off-roberto-javi-cover-20260908.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPLY = process.env.APPLY === "1";
const DATE = "2026-09-08";
const REVISION = "office:tue8-javier-off-roberto-javi-cover-20260908";

function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
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

const COVERS = [
  {
    client: "ayman",
    label: "4 to 4.30",
    start: "16:00:00",
    end: "16:30:00",
    coverId: "roberto",
    coverName: "Roberto",
    area: "Lane (DE)",
  },
  {
    client: "linda",
    label: "5 to 5.30",
    start: "17:00:00",
    end: "17:30:00",
    coverId: "javi",
    coverName: "Javi Palankas",
    area: "Lane (SE)",
  },
  {
    client: "rayan_ta",
    label: "5.30 to 6",
    start: "17:30:00",
    end: "18:00:00",
    coverId: "javi",
    coverName: "Javi Palankas",
    area: "Lane (DE)",
  },
  {
    client: "anas",
    label: "6 to 6.30",
    start: "18:00:00",
    end: "18:30:00",
    coverId: "javi",
    coverName: "Javi Palankas",
    area: "Lane (DE)",
  },
];

const DATED_ROWS = [
  {
    client_name: "Ayman",
    instructors: "ROBERTO",
    time_slot: "4 to 4.30",
    area: "Lane (DE)",
  },
  {
    client_name: "Adam Mahmmoud",
    instructors: "ROBERTO",
    time_slot: "4.30 to 5",
    area: "Teaching Pool",
  },
  {
    client_name: "Logan",
    instructors: "ROBERTO",
    time_slot: "5 to 5.30",
    area: "Lane (DE)",
  },
  {
    client_name: "Junaid",
    instructors: "ROBERTO",
    time_slot: "5.30 to 6",
    area: "Lane (SE)",
  },
  {
    client_name: "Richard",
    instructors: "ROBERTO",
    time_slot: "6 to 6.30",
    area: "Lane (DE)",
  },
  {
    client_name: "No participant",
    instructors: "LULIYA",
    time_slot: "4 to 4.30",
    area: "Lane (DE)",
  },
  {
    client_name: "Serine",
    instructors: "LULIYA",
    time_slot: "4.30 to 5.30",
    area: "Lane (DE)",
  },
  {
    client_name: "Aydaan Ah",
    instructors: "LULIYA",
    time_slot: "5.30 to 6",
    area: "Lane (SE)",
  },
  {
    client_name: "No participant",
    instructors: "LULIYA",
    time_slot: "6 to 6.30",
    area: "Lane (DE)",
  },
  {
    client_name: "Linda",
    instructors: "JAVI",
    time_slot: "5 to 5.30",
    area: "Lane (SE)",
  },
  {
    client_name: "Rayan Ta",
    instructors: "JAVI",
    time_slot: "5.30 to 6",
    area: "Lane (DE)",
  },
  {
    client_name: "Anas",
    instructors: "JAVI",
    time_slot: "6 to 6.30",
    area: "Lane (DE)",
  },
].map((r) => ({
  ...r,
  day: "Tuesday",
  service: "Aquatic Activity",
  venue: "Acton",
  session_date: DATE,
  status: "active",
}));

async function datedRowsWithActor(actorId) {
  return DATED_ROWS.map((r) => ({
    ...r,
    created_by: actorId,
    updated_by: actorId,
  }));
}

async function upsertReassign(actorId, now, slot) {
  const payload = {
    covering_staff_id: slot.coverId,
    covering_staff_name: slot.coverName,
    portal_session_key: portalSessionKey(DATE, slot.start.slice(0, 5), slot.client),
    service: "Aquatic Activity",
    activity: "Aquatic Activity",
    area: slot.area,
    absent_staff_id: "javier",
  };
  const reason = `${slot.coverName} covers Javier Marquez — ${slot.client} ${slot.label} ${DATE}`;
  const base = {
    session_date: DATE,
    anchor_staff_id: "javier",
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
    updated_by: actorId,
    updated_at: now,
  };

  const { data: existing, error: exErr } = await sb
    .from("schedule_overrides")
    .select("id")
    .eq("session_date", DATE)
    .eq("override_type", "instructor_reassign")
    .eq("anchor_staff_id", "javier")
    .eq("anchor_client_id", slot.client)
    .eq("status", "active");
  if (exErr) throw exErr;

  if (existing?.length) {
    const { error } = await sb.from("schedule_overrides").update(base).eq("id", existing[0].id);
    if (error) throw error;
    console.log("Updated reassign", slot.client, "→", slot.coverId, existing[0].id);
    return;
  }

  const { data: ins, error } = await sb
    .from("schedule_overrides")
    .insert([{ ...base, created_by: actorId }])
    .select("id");
  if (error) throw error;
  console.log("Inserted reassign", slot.client, "→", slot.coverId, ins?.[0]?.id);
}

async function main() {
  /* Prefer Victor UUID — schedule_overrides.updated_by / created_by are NOT NULL. */
  const VICTOR_ID = "a0d439df-3a8f-439d-b427-b3459552eae1";
  let actor = { id: VICTOR_ID, username: "victor", app_role: "ceo" };
  const { data: actorRows, error: actorErr } = await sb
    .from("staff_profiles")
    .select("id, username, app_role")
    .eq("id", VICTOR_ID)
    .maybeSingle();
  if (!actorErr && actorRows?.id) {
    actor = actorRows;
  } else {
    const { data: fallbackRows, error: fbErr } = await sb
      .from("staff_profiles")
      .select("id, username, app_role")
      .in("app_role", ["ceo", "admin", "lead"])
      .limit(20);
    if (fbErr) throw fbErr;
    const roleRank = { ceo: 0, admin: 1, lead: 2 };
    const picked = (fallbackRows || [])
      .slice()
      .sort((a, b) => (roleRank[a.app_role] ?? 9) - (roleRank[b.app_role] ?? 9))[0];
    if (!picked?.id) throw new Error("No ceo/admin/lead actor for created_by");
    actor = picked;
  }

  console.log("Actor:", actor.username, actor.app_role, actor.id);
  console.log(APPLY ? "APPLY=1 — writing" : "Dry-run — set APPLY=1 to write");
  console.log("\nPlanned Javier → cover:");
  for (const s of COVERS) {
    console.log(`  ${s.client} ${s.label} → ${s.coverId} (${s.coverName})`);
  }

  if (!APPLY) {
    console.log("\nWould also cancel Aurora→Javier Anas reassign if still active;");
    console.log("Would cancel instructor_cover_needed on Javier for these clients;");
    console.log("Would refresh dated portal_roster_rows for Acton", DATE);
    console.log("\nDone (dry-run).");
    return;
  }

  const now = new Date().toISOString();

  /* Anas previously Aurora → Javier; point that cover at Javi Palankas or cancel. */
  const { data: anasAurora, error: anasErr } = await sb
    .from("schedule_overrides")
    .select("id, payload")
    .eq("session_date", DATE)
    .eq("override_type", "instructor_reassign")
    .eq("anchor_staff_id", "aurora")
    .eq("anchor_client_id", "anas")
    .eq("status", "active");
  if (anasErr) throw anasErr;
  for (const row of anasAurora || []) {
    const { error } = await sb
      .from("schedule_overrides")
      .update({
        status: "cancelled",
        reason: "Cancelled — Anas now covered from Javier OFF → Javi Palankas",
        spreadsheet_revision: REVISION,
        updated_by: actor.id,
        updated_at: now,
      })
      .eq("id", row.id);
    if (error) throw error;
    console.log("Cancelled Aurora→Anas reassign", row.id);
  }

  const { data: coverNeeded, error: cnErr } = await sb
    .from("schedule_overrides")
    .select("id, anchor_client_id")
    .eq("session_date", DATE)
    .eq("override_type", "instructor_cover_needed")
    .eq("anchor_staff_id", "javier")
    .eq("status", "active");
  if (cnErr) throw cnErr;
  for (const row of coverNeeded || []) {
    const { error } = await sb
      .from("schedule_overrides")
      .update({
        status: "cancelled",
        reason: "Cancelled — real cover assigned (Roberto / Javi Palankas)",
        spreadsheet_revision: REVISION,
        updated_by: actor.id,
        updated_at: now,
      })
      .eq("id", row.id);
    if (error) throw error;
    console.log("Cancelled COVER NEEDED", row.anchor_client_id, row.id);
  }

  for (const slot of COVERS) {
    await upsertReassign(actor.id, now, slot);
  }

  const { data: oldDated, error: oldErr } = await sb
    .from("portal_roster_rows")
    .select("id, client_name, instructors, time_slot")
    .eq("session_date", DATE)
    .ilike("venue", "%Acton%");
  if (oldErr) throw oldErr;

  if (oldDated?.length) {
    const { error } = await sb
      .from("portal_roster_rows")
      .delete()
      .in(
        "id",
        oldDated.map((r) => r.id)
      );
    if (error) throw error;
    for (const old of oldDated) {
      console.log("Deleted dated", old.client_name, old.instructors, old.time_slot);
    }
  }

  const { data: inserted, error: insErr } = await sb
    .from("portal_roster_rows")
    .insert(await datedRowsWithActor(actor.id))
    .select("id, client_name, instructors, time_slot");
  if (insErr) throw insErr;
  console.log("\nInserted dated portal_roster_rows:");
  for (const r of inserted || []) {
    console.log(`  ${r.client_name} ${r.instructors} ${r.time_slot}`);
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
