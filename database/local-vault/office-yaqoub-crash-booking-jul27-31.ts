/**
 * Link Yaqoub's office crash invoice (INV-P-0118) to portal crash booking lines
 * so the parent hub shows Mon 27 / Tue 28 / Wed 29 Jul 2026 (Next session + chips).
 * (Updated: was Mon/Wed/Fri 12–1; now Mon/Tue/Wed 1–2.)
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-yaqoub-crash-booking-jul27-31.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "169";
const PARENT_PERSON_ID = "5762893";
const INVOICE_SHARE_ID = "852a2e56-ba2a-4911-af40-d49a64fa72dc";
const DATES = ["2026-07-27", "2026-07-28", "2026-07-29"];
const SLOT_LABEL = "13:00–14:00 · SwimFarm · 1 instructor";
const UNIT = 125;
const AMOUNT = 375;
const NOTES =
  "Office inject · Yaqoub Ismail · SwimFarm aquatic 60' · Mon 27 / Tue 28 / Wed 29 Jul 2026 · 13:00–14:00 · bill Obah Yusuf INV-P-0118";

function loadEnvFile(path: string) {
  try {
    for (const line of Deno.readTextFileSync(path).split(/\r?\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && !Deno.env.get(k)) Deno.env.set(k, v);
    }
  } catch {
    /* optional */
  }
}
loadEnvFile("local-secrets/secrets.env");
loadEnvFile("database/local-vault/private/parent-portal-secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: existing } = await admin
  .from("portal_crash_summer_bookings")
  .select("id, status, invoice_share_id, amount_gbp")
  .eq("contact_id", CONTACT_ID)
  .limit(5);
console.log("existing bookings", existing);

if (!APPLY) {
  console.log("Dry run — would upsert crash booking + 3 swim lines for", DATES.join(", "));
  Deno.exit(0);
}

let bookingId = existing?.[0]?.id as string | undefined;
if (!bookingId) {
  const { data: inserted, error } = await admin
    .from("portal_crash_summer_bookings")
    .insert({
      contact_id: CONTACT_ID,
      parent_person_id: PARENT_PERSON_ID,
      week_id: "w2",
      booking_mode: "individual_days",
      activities: ["swimming"],
      amount_gbp: AMOUNT,
      status: "awaiting_payment",
      invoice_share_id: INVOICE_SHARE_ID,
      hold_expires_at: "2026-08-05T17:00:00.000Z",
      notes: NOTES,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new Error(error?.message || "insert booking failed");
  bookingId = inserted.id;
  console.log("booking", bookingId);
} else {
  await admin
    .from("portal_crash_summer_bookings")
    .update({
      status: "awaiting_payment",
      invoice_share_id: INVOICE_SHARE_ID,
      amount_gbp: AMOUNT,
      activities: ["swimming"],
      week_id: "w2",
      notes: NOTES,
    })
    .eq("id", bookingId);
  console.log("booking updated", bookingId);
}

const { data: lines } = await admin
  .from("portal_crash_summer_booking_lines")
  .select("id, session_date")
  .eq("booking_id", bookingId);
const have = new Set((lines || []).map((l) => String(l.session_date).slice(0, 10)));

for (const iso of DATES) {
  if (have.has(iso)) {
    console.log("line exists", iso);
    continue;
  }
  const { error } = await admin.from("portal_crash_summer_booking_lines").insert({
    booking_id: bookingId,
    activity: "swimming",
    session_date: iso,
    slot_id: "office_yaqoub_sf_1300",
    slot_label: SLOT_LABEL,
    unit_price_gbp: UNIT,
    status: "awaiting_payment",
    hold_expires_at: "2026-08-05T17:00:00.000Z",
  });
  if (error) throw new Error(`${iso}: ${error.message}`);
  console.log("line inserted", iso);
}

console.log("Done — refresh parent hub for Yaqoub.");
