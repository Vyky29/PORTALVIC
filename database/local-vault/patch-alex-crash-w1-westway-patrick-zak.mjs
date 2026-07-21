/**
 * Alex Stone (instructor) on Westway crash W1 calendar + retimes Zakariya:
 *   Climb Patrick 11:00–12:00 · Zakariya 12:00–13:00 · Mon 20 – Thu 23 Jul 2026
 *   Zakariya SwimFarm special moved 12:00–13:00 → 13:00–14:00 (Tue–Fri)
 *
 *   node database/local-vault/patch-alex-crash-w1-westway-patrick-zak.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ZAK_BOOKING_ID = "28451e94-deee-4283-b5b1-1115f8a7c069";
const CLIMB_DATES = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"];
const DAY_NAME = {
  "2026-07-20": "Monday",
  "2026-07-21": "Tuesday",
  "2026-07-22": "Wednesday",
  "2026-07-23": "Thursday",
};

function readEnv(key) {
  if (process.env[key]) return String(process.env[key]).trim();
  for (const f of [
    path.join(root, "local-secrets/secrets.env"),
    path.join(root, "database/local-vault/.env"),
  ]) {
    if (!existsSync(f)) continue;
    const line = readFileSync(f, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(key + "="));
    if (line) return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

const url = readEnv("SUPABASE_URL");
const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const now = new Date().toISOString();

/* 1) Zakariya climb → c2 (12:00–13:00) — skip if already moved */
{
  const { data: already } = await admin
    .from("portal_crash_summer_booking_lines")
    .select("id")
    .eq("booking_id", ZAK_BOOKING_ID)
    .eq("activity", "climbing")
    .eq("slot_id", "c2")
    .in("session_date", CLIMB_DATES);
  if (already?.length >= CLIMB_DATES.length) {
    console.log("Zakariya climb already on c2 — skip");
  } else {
    const { data: c2clash } = await admin
      .from("portal_crash_summer_booking_lines")
      .select("id, session_date, status")
      .eq("activity", "climbing")
      .eq("slot_id", "c2")
      .in("session_date", CLIMB_DATES)
      .in("status", ["awaiting_payment", "confirmed"])
      .neq("booking_id", ZAK_BOOKING_ID);
    if (c2clash?.length) {
      console.error("c2 already taken:", c2clash);
      process.exit(1);
    }

    const { data: climbLines, error: climbErr } = await admin
      .from("portal_crash_summer_booking_lines")
      .update({
        slot_id: "c2",
        slot_label: "12:00–13:00 · Westway · 1 instructor",
      })
      .eq("booking_id", ZAK_BOOKING_ID)
      .eq("activity", "climbing")
      .in("slot_id", ["c_zak_1300", "c2"])
      .select("id, session_date, slot_id");

    if (climbErr) {
      console.error("climb move failed", climbErr);
      process.exit(1);
    }
    console.log("Moved Zakariya climb → c2:", climbLines?.length || 0, climbLines);
  }
}

/* 2) Zakariya SwimFarm → 13:00–14:00 */
{
  const swimMap = [
    {
      from: "sf_zak_1200",
      to: "sf_zak_1300",
      label: "13:00–13:30 · SwimFarm (special PM)",
    },
    {
      from: "sf_zak_1230",
      to: "sf_zak_1330",
      label: "13:30–14:00 · SwimFarm (special PM)",
    },
  ];
  for (const s of swimMap) {
    const { data: already } = await admin
      .from("portal_crash_summer_booking_lines")
      .select("id")
      .eq("booking_id", ZAK_BOOKING_ID)
      .eq("activity", "swimming")
      .eq("slot_id", s.to);
    if (already?.length) {
      console.log(`Swim already on ${s.to} — skip`);
      continue;
    }
    const { data, error } = await admin
      .from("portal_crash_summer_booking_lines")
      .update({ slot_id: s.to, slot_label: s.label })
      .eq("booking_id", ZAK_BOOKING_ID)
      .eq("activity", "swimming")
      .eq("slot_id", s.from)
      .select("id, session_date, slot_id");
    if (error) {
      console.error("swim move failed", s.from, error);
      process.exit(1);
    }
    console.log(`Moved swim ${s.from} → ${s.to}:`, data?.length || 0);
  }
}

/* 3) Booking notes */
{
  const notes =
    "Admin special · Zakariya Warsame / Catarina Smith · Climb 12:00–13:00 Westway (Mon 20–Thu 23 Jul · instructor Alex) + Swim 13:00–14:00 SwimFarm (Mon 20–Thu 23 Jul · back-to-back) · W1 Jul 2026 · pay via family portal";
  const { error } = await admin
    .from("portal_crash_summer_bookings")
    .update({ notes, updated_at: now })
    .eq("id", ZAK_BOOKING_ID);
  if (error) {
    console.error("notes update failed", error);
    process.exit(1);
  }
  console.log("Updated Zakariya booking notes");
}

/* 4) Staff roster: ALEX · Patrick 11–12 + Zakariya 12–1 · Westway */
{
  const sessions = [
    { client_name: "Patrick", time_slot: "11 to 12" },
    { client_name: "Zakariya", time_slot: "12 to 1" },
  ];

  /* Idempotent: drop prior crash-week Alex rows for these kids/slots */
  await admin
    .from("portal_roster_rows")
    .delete()
    .in("session_date", CLIMB_DATES)
    .eq("venue", "Westway")
    .eq("instructors", "ALEX")
    .in("client_name", ["Patrick", "Zakariya"])
    .in("time_slot", ["11 to 12", "12 to 1"]);

  const ADMIN_BY = "a0d439df-3a8f-439d-b427-b3459552eae1"; // prior roster ops user
  const rows = [];
  for (const date of CLIMB_DATES) {
    for (const s of sessions) {
      rows.push({
        client_name: s.client_name,
        day: DAY_NAME[date],
        time_slot: s.time_slot,
        instructors: "ALEX",
        service: "Climbing Activity",
        area: "Wall",
        venue: "Westway",
        session_date: date,
        status: "active",
        created_by: ADMIN_BY,
        updated_by: ADMIN_BY,
      });
    }
  }

  const { data: inserted, error: insErr } = await admin
    .from("portal_roster_rows")
    .insert(rows)
    .select("id, client_name, session_date, time_slot, instructors");

  if (insErr) {
    console.error("roster insert failed", insErr);
    process.exit(1);
  }
  console.log("Inserted Alex roster rows:", inserted?.length || 0);
  console.log(inserted);
}

console.log("Done.");
