/**
 * Zakariya crash W1: swim back-to-back with climb Mon–Thu 20–23 Jul
 * (move Fri 24 → Mon 20). Idempotent.
 *
 *   node database/local-vault/patch-zakariya-crash-swim-back-to-back-20-23.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ZAK_BOOKING_ID = "28451e94-deee-4283-b5b1-1115f8a7c069";
const FROM_DATE = "2026-07-24";
const TO_DATE = "2026-07-20";
const SWIM_DATES = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"];

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

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: fri } = await admin
  .from("portal_crash_summer_booking_lines")
  .select("id, slot_id")
  .eq("booking_id", ZAK_BOOKING_ID)
  .eq("activity", "swimming")
  .eq("session_date", FROM_DATE);

if (!fri?.length) {
  const { data: ok } = await admin
    .from("portal_crash_summer_booking_lines")
    .select("session_date")
    .eq("booking_id", ZAK_BOOKING_ID)
    .eq("activity", "swimming");
  const dates = [...new Set((ok || []).map((r) => r.session_date))].sort();
  console.log("noop — no Fri 24 swim; current swim dates:", dates);
} else {
  for (const row of fri) {
    const { error } = await admin
      .from("portal_crash_summer_booking_lines")
      .update({ session_date: TO_DATE })
      .eq("id", row.id);
    if (error) {
      console.error(error);
      process.exit(1);
    }
    console.log("moved", row.id, FROM_DATE, "→", TO_DATE, row.slot_id);
  }
}

const notes =
  "Admin special · Zakariya Warsame / Catarina Smith · Climb 12:00–13:00 Westway then Swim 13:00–14:00 SwimFarm back-to-back (Mon 20–Thu 23 Jul · climb instructor Alex) · W1 Jul 2026 · pay via family portal";
await admin
  .from("portal_crash_summer_bookings")
  .update({ notes, updated_at: new Date().toISOString() })
  .eq("id", ZAK_BOOKING_ID);

const { data: verify } = await admin
  .from("portal_crash_summer_booking_lines")
  .select("session_date, activity, slot_id")
  .eq("booking_id", ZAK_BOOKING_ID)
  .eq("activity", "swimming")
  .order("session_date");
const swimDates = [...new Set((verify || []).map((r) => r.session_date))].sort();
const match =
  swimDates.length === SWIM_DATES.length &&
  swimDates.every((d, i) => d === SWIM_DATES[i]);
console.log({ swimDates, ok: match });
if (!match) process.exit(1);
