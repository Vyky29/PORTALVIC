/**
 * Fadi DC Cancelled (like Joelle) through Sun 20 Sep — return Mon 21.
 * Paint named Fadi seats + slot_clear cancelled_by_admin (not Absent / not No participant).
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-fadi-cancelled-through-20-20260910.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const REV = "office:fadi-cancelled-through-20-20260910";
const UNTIL = "2026-09-21";
const ACTOR = "a0d439df-3a8f-439d-b427-b3459552eae1";

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

/** Standing Autumn DC Fadi seats (weekday → staff + time). */
const FADI_SEATS: Record<number, Array<{ staff: string; time: string; start: string; end: string; label: string }>> = {
  1: [
    { staff: "roberto", time: "1 to 3", start: "13:00:00", end: "15:00:00", label: "1 to 3" },
    { staff: "youssef", time: "12.30 to 3", start: "12:30:00", end: "15:00:00", label: "12.30 to 3" },
  ],
  3: [
    { staff: "roberto", time: "12.30 to 3", start: "12:30:00", end: "15:00:00", label: "12.30 to 3" },
    { staff: "raul", time: "12.30 to 3", start: "12:30:00", end: "15:00:00", label: "12.30 to 3" },
  ],
  4: [
    { staff: "roberto", time: "12.30 to 3", start: "12:30:00", end: "15:00:00", label: "12.30 to 3" },
    { staff: "youssef", time: "12.30 to 3", start: "12:30:00", end: "15:00:00", label: "12.30 to 3" },
  ],
  5: [
    { staff: "roberto", time: "1 to 3", start: "13:00:00", end: "15:00:00", label: "1 to 3" },
    { staff: "youssef", time: "12.30 to 3", start: "12:30:00", end: "15:00:00", label: "12.30 to 3" },
  ],
};

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function datesInWindow() {
  const out: string[] = [];
  const cur = new Date("2026-09-10T12:00:00");
  const end = new Date(UNTIL + "T12:00:00");
  while (cur < end) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5 && FADI_SEATS[dow]) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, "0");
      const d = String(cur.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${d}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const dates = datesInWindow();
console.log("dates", dates);
console.log("APPLY", APPLY);

if (!APPLY) {
  console.log("Dry-run. Re-run with APPLY=1");
  Deno.exit(0);
}

const now = new Date().toISOString();

/* Soft-cancel prior Fadi absence / clear overrides in window (we replace with Cancelled clears). */
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
    .eq("anchor_client_id", "fadi")
    .eq("status", "active")
    .gte("session_date", "2026-09-10")
    .lt("session_date", UNTIL)
    .in("override_type", ["client_absence_announced", "slot_clear_client"]);
  if (error) console.log("supersede warn", error.message);
}

for (const iso of dates) {
  const dow = new Date(iso + "T12:00:00").getDay();
  const seats = FADI_SEATS[dow] || [];
  const dayTitle = DOW[dow];

  for (const seat of seats) {
    const { data: ov, error: oErr } = await admin
      .from("schedule_overrides")
      .insert({
        session_date: iso,
        anchor_staff_id: seat.staff,
        anchor_start: seat.start,
        anchor_end: seat.end,
        anchor_venue: "SwimFarm",
        anchor_client_id: "fadi",
        anchor_time_slot_label: seat.label,
        override_type: "slot_clear_client",
        payload: {
          cancelled_by_admin: true,
          feedback_resolution: "cancelled",
          service: "Day Centre",
          activity: "Day Centre",
          portal_session_key: `${iso}|${seat.start.slice(0, 5)}|fadi|${seat.staff}`,
          area: "Hub Room",
        },
        reason: `Fadi Cancelled DC · ${dayTitle} ${iso} · return Mon 21`,
        status: "active",
        spreadsheet_revision: REV,
        created_by: ACTOR,
        updated_by: ACTOR,
      })
      .select("id,anchor_staff_id,session_date")
      .maybeSingle();
    if (oErr) throw new Error(oErr.message);
    console.log("cancel", ov);

    const staffUpper = seat.staff.toUpperCase();
    const { data: existing } = await admin
      .from("portal_roster_rows")
      .select("id")
      .eq("session_date", iso)
      .eq("client_name", "Fadi")
      .ilike("instructors", staffUpper)
      .eq("time_slot", seat.time)
      .eq("venue", "SwimFarm")
      .maybeSingle();

    const payload = {
      client_name: "Fadi",
      day: dayTitle,
      time_slot: seat.time,
      instructors: staffUpper,
      service: "Day Centre",
      area: "Hub Room",
      venue: "SwimFarm",
      session_date: iso,
      status: "active",
      updated_by: ACTOR,
      updated_at: now,
    };

    if (existing?.id) {
      const { error } = await admin.from("portal_roster_rows").update(payload).eq("id", existing.id);
      if (error) throw new Error(error.message);
      console.log("roster upd", iso, staffUpper, seat.time);
    } else {
      const { error } = await admin.from("portal_roster_rows").insert({
        ...payload,
        created_by: ACTOR,
        created_at: now,
      });
      if (error) throw new Error(error.message);
      console.log("roster ins", iso, staffUpper, seat.time);
    }
  }

  /* Drop No participant placeholders on Fadi bands for this date */
  const { data: opens } = await admin
    .from("portal_roster_rows")
    .select("id,instructors,time_slot")
    .eq("session_date", iso)
    .eq("client_name", "No participant")
    .eq("venue", "SwimFarm")
    .ilike("service", "%day%");
  for (const row of opens || []) {
    const t = String(row.time_slot || "").replace(/\s+/g, " ").toLowerCase();
    if (!(t.includes("12.30 to 3") || t.includes("1 to 3"))) continue;
    const { error } = await admin
      .from("portal_roster_rows")
      .update({ status: "cancelled", updated_by: ACTOR, updated_at: now })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    console.log("open cancelled", iso, row.instructors, row.time_slot);
  }
}

console.log("DONE", REV);
