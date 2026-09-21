/**
 * Mia Mesi / Kelidon · INV-P-0365
 * Paid 1st half £350 (admin Mark paid → partial) on 17 Aug but finish-booking
 * never ran (upsert only completed booking when status === "paid"). Seat expired;
 * in_class stayed false; Northolt Wed 6–6.30 stayed open.
 *
 * Restore: reservation + finish-booking + MADRE standing Dan Wed 6–6.30.
 *
 *   npx -y deno run -A database/local-vault/office-mia-restore-northolt-wed-630.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-mia-restore-northolt-wed-630.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { tryCompleteBookingAfterInvoicePayment } from "../../supabase/functions/_shared/portal_booking_finish.ts";
import { foldValidatedReservationOntoMadre } from "../../supabase/functions/_shared/portal_booking_fold_madre.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "385";
const INVOICE_NUMBER = "INV-P-0365";
const RESERVATION_ID = "7aae3c64-2f03-47f0-98e3-e06909ccb845";
/** Wednesday of MADRE standing week 2026-07-13. */
const DATE_ISO = "2026-07-15";

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

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, payment_status, amount_paid_gbp, amount_gbp, contact_id")
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
if (invErr || !inv) throw new Error(invErr?.message || "invoice missing");

const { data: contactBefore } = await admin
  .from("portal_parent_contacts")
  .select("contact_id, child_display, parent_display, in_class")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

const { data: resBefore } = await admin
  .from("portal_booking_slot_reservations")
  .select(
    "id, status, date_iso, day_label, time_label, venue, participant_name, notes, validated_at",
  )
  .eq("id", RESERVATION_ID)
  .maybeSingle();

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("BEFORE", { inv, contact: contactBefore, reservation: resBefore });

if (!APPLY) {
  console.log("Re-run with APPLY=1 to restore seat + in_class + MADRE.");
  Deno.exit(0);
}

const now = new Date().toISOString();
const noteLine =
  "Office 2 Sep 2026: restore after admin partial Mark paid skipped finish-booking. " +
  "Seat Northolt Wed 6–6.30 Dan. instructor=Dan";

const { error: resErr } = await admin
  .from("portal_booking_slot_reservations")
  .update({
    status: "validated",
    date_iso: DATE_ISO,
    day_label: "Wednesday",
    time_label: "6.00 – 6.30",
    venue: "Northolt",
    service_name: "Aquatic Activity",
    participant_name: "Mia Mesi",
    validated_at: now,
    hold_expires_at: new Date(Date.now() + 120 * 86400000).toISOString(),
    released_at: null,
    notes: [String(resBefore?.notes || "").replace(/expired_unpaid_pay_hold_30m/gi, ""), noteLine]
      .filter(Boolean)
      .join("|")
      .slice(0, 500),
    updated_at: now,
  })
  .eq("id", RESERVATION_ID);
if (resErr) throw new Error(resErr.message);

const booking = await tryCompleteBookingAfterInvoicePayment(admin, String(inv.id));
console.log("finish-booking", booking);

await admin
  .from("portal_parent_contacts")
  .update({
    in_class: true,
    on_waiting_list: false,
    payment_method_label: "Bank transfer · Flexi (2 per term)",
    updated_at: now,
  })
  .eq("contact_id", CONTACT_ID);
await admin
  .from("portal_participants")
  .update({ in_class: true, on_waiting_list: false, updated_at: now })
  .eq("contact_id", CONTACT_ID);

const fold = await foldValidatedReservationOntoMadre(admin, RESERVATION_ID);
console.log("fold", fold);

// Belt: if fold missed standing open seat, patch MADRE Dan Wed 6–6.30 directly.
const { data: madreRow } = await admin
  .from("portal_madre_document")
  .select("document, revision")
  .eq("term_key", "summer-2026")
  .single();
const doc = madreRow!.document as {
  meta?: Record<string, unknown>;
  weeks?: Array<{
    start?: string;
    staff?: Array<{
      staffName?: string;
      staffKey?: string;
      days?: Array<{ slots?: Array<Record<string, unknown>> } | null> | null;
    } | null>;
  }>;
};
const standing = (doc.weeks || []).find((w) => w.start === "2026-07-13");
let patched = false;
for (const st of standing?.staff || []) {
  if (!st) continue;
  const sk = String(st.staffName || st.staffKey || "");
  if (sk !== "Dan") continue;
  // Standing week days: index 1 = Wednesday (Mon=0) for Dan Northolt band.
  const wed = st.days?.[1];
  if (!wed?.slots) continue;
  for (const sl of wed.slots) {
    const t = String(sl.time || sl.time_slot || "");
    const v = String(sl.venue || "");
    if (!/northolt/i.test(v) || !/^6(\.00)?\s*to\s*6\.30$/i.test(t)) continue;
    const cur = String(sl.client_name || "");
    if (/^mia/i.test(cur)) {
      patched = true;
      break;
    }
    if (/^no participant$/i.test(cur)) {
      sl.client_name = "Mia";
      sl.service = sl.service || "Aquatic Activity";
      patched = true;
      break;
    }
  }
}
if (patched && fold && !fold.ok) {
  doc.meta = doc.meta || {};
  doc.meta.lastLiveFoldAt = now;
  doc.meta.lastLiveFoldNote = "office_restore:Mia:2026-07-15:Dan:Northolt:6-6.30";
  const { error: mErr } = await admin
    .from("portal_madre_document")
    .update({
      document: doc,
      revision: (Number(madreRow!.revision) || 0) + 1,
      updated_at: now,
    })
    .eq("term_key", "summer-2026");
  if (mErr) throw new Error(mErr.message);
  console.log("MADRE direct patch ok");
}

const { data: afterContact } = await admin
  .from("portal_parent_contacts")
  .select("in_class, on_waiting_list")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
const { data: afterTok } = await admin
  .from("portal_booking_completion_tokens")
  .select("status")
  .eq("invoice_share_id", inv.id)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();
const { data: afterRes } = await admin
  .from("portal_booking_slot_reservations")
  .select("status, date_iso, day_label, time_label, venue")
  .eq("id", RESERVATION_ID)
  .maybeSingle();
console.log("AFTER", { contact: afterContact, token: afterTok, reservation: afterRes, fold });
