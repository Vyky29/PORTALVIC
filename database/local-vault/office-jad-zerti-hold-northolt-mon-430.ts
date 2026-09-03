/**
 * Office hold: Jad (Salem Zerti) · Monday Northolt 4.30-5 Luliya
 * until Friday 4 Sep 2026 18:00 BST. If they have not booked by then, hold expires
 * and the seat goes live again (pending + hold_expires_at).
 *
 *   npx -y deno run -A database/local-vault/office-jad-zerti-hold-northolt-mon-430.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-jad-zerti-hold-northolt-mon-430.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const SLOT_ID = "live-aquatic-northolt-monday-16-30-4-30-5-00";
/** Friday 4 Sep 2026 18:00 Europe/London (BST). */
const HOLD_EXPIRES_AT = "2026-09-04T17:00:00.000Z";
const DATE_ISO = "2026-09-07";

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
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: contact } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, parent_display, email, mobile")
  .or("child_display.ilike.Jad%,parent_display.ilike.%Zerti%,email.ilike.salem@zerti.co.uk")
  .limit(8);

const { data: existing } = await admin
  .from("portal_booking_slot_reservations")
  .select(
    "id, status, participant_name, parent_name, parent_email, slot_id, hold_expires_at, notes, day_label, time_label, venue",
  )
  .or(
    "slot_id.eq." +
      SLOT_ID +
      ",participant_name.ilike.Jad%,parent_email.ilike.salem@zerti.co.uk,parent_name.ilike.%Zerti%",
  )
  .in("status", ["pending", "validated", "awaiting_payment"])
  .order("updated_at", { ascending: false })
  .limit(12);

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("contacts", contact);
console.log("active reservations", existing);

const already = (existing || []).find(
  (r) =>
    String(r.slot_id) === SLOT_ID &&
    /jad/i.test(String(r.participant_name || "")) &&
    ["pending", "validated", "awaiting_payment"].includes(String(r.status)),
);

if (!APPLY) {
  console.log("Re-run with APPLY=1 to hold until Fri 4 Sep 18:00 BST.");
  Deno.exit(0);
}

const now = new Date().toISOString();
const note =
  "office_hold|instructor=Luliya|until=2026-09-04T18:00+01:00|if_not_booked_release";

if (already?.id) {
  const { error } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      status: "pending",
      hold_expires_at: HOLD_EXPIRES_AT,
      released_at: null,
      date_iso: DATE_ISO,
      day_label: "Monday",
      time_label: "4.30 – 5.00",
      venue: "Northolt",
      service_id: "aquatic",
      service_name: "Aquatic Activity",
      activity: "Aquatic Activity",
      booking_mode: "term",
      participant_name: "Jad",
      parent_name: "Salem Zerti",
      parent_email: "salem@zerti.co.uk",
      parent_phone: "07789584222",
      notes: note,
      updated_at: now,
    })
    .eq("id", already.id);
  if (error) throw new Error(error.message);
  console.log("UPDATED hold", already.id, "until", HOLD_EXPIRES_AT);
} else {
  const { data: row, error } = await admin
    .from("portal_booking_slot_reservations")
    .insert({
      slot_id: SLOT_ID,
      service_id: "aquatic",
      service_name: "Aquatic Activity",
      venue: "Northolt",
      day_label: "Monday",
      time_label: "4.30 – 5.00",
      activity: "Aquatic Activity",
      booking_mode: "term",
      date_iso: DATE_ISO,
      participant_name: "Jad",
      parent_name: "Salem Zerti",
      parent_email: "salem@zerti.co.uk",
      parent_phone: "07789584222",
      status: "pending",
      hold_expires_at: HOLD_EXPIRES_AT,
      notes: note,
    })
    .select("id, status, hold_expires_at, slot_id")
    .single();
  if (error) throw new Error(error.message);
  console.log("INSERTED hold", row);
}

const { data: after } = await admin
  .from("portal_booking_slot_reservations")
  .select("id, status, participant_name, slot_id, hold_expires_at, notes")
  .eq("slot_id", SLOT_ID)
  .in("status", ["pending", "validated", "awaiting_payment"]);
console.log("AFTER slot holds", after);
