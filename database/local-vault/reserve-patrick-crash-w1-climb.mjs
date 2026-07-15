/**
 * Admin inject: Patrick Dhennin · Crash climbing Week 1 · 11:00–12:00 (Mon 20–Thu 23 Jul).
 * Status awaiting_payment + unpaid invoice so Orla can pay from the family portal.
 *
 *   node database/local-vault/reserve-patrick-crash-w1-climb.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTACT_ID = "7559001";
const PARENT_PERSON_ID = "7559002";
const PARTICIPANT = "Patrick Dhennin";
const PARENT = "Orla O'Sullivan";
const WEEK_ID = "w1";
const DATES = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"];
const SLOT = { id: "c1", label: "11:00–12:00 · 1 instructor" };
const AMOUNT = 300; // weekly climb pack
const UNIT_PRICE = Math.round((AMOUNT / DATES.length) * 100) / 100;

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
const dueDate = now.slice(0, 10);
const holdExpires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

const { data: clash } = await admin
  .from("portal_crash_summer_booking_lines")
  .select("id, booking_id, session_date, status")
  .eq("activity", "climbing")
  .eq("slot_id", SLOT.id)
  .in("session_date", DATES)
  .in("status", ["awaiting_payment", "confirmed"]);

if (clash?.length) {
  console.error("Slot c1 already taken on some dates:", clash);
  process.exit(1);
}

const { data: existing } = await admin
  .from("portal_crash_summer_bookings")
  .select("id, status, amount_gbp, invoice_share_id")
  .eq("contact_id", CONTACT_ID)
  .eq("week_id", WEEK_ID)
  .contains("activities", ["climbing"])
  .in("status", ["awaiting_payment", "confirmed"])
  .limit(5);

if (existing?.length) {
  console.log("Existing Patrick climb booking(s):", existing);
  console.log("Aborting to avoid duplicate — cancel old hold first if needed.");
  process.exit(1);
}

const { data: booking, error: bookErr } = await admin
  .from("portal_crash_summer_bookings")
  .insert({
    contact_id: CONTACT_ID,
    parent_person_id: PARENT_PERSON_ID,
    week_id: WEEK_ID,
    booking_mode: "weekly_pack",
    activities: ["climbing"],
    amount_gbp: AMOUNT,
    status: "awaiting_payment",
    hold_expires_at: holdExpires,
    notes:
      "Admin inject · Patrick Dhennin · Climb crash Week 1 · 11:00–12:00 · Mon 20–Thu 23 Jul 2026 · pay via family portal",
    updated_at: now,
  })
  .select("id")
  .maybeSingle();

if (bookErr || !booking?.id) {
  console.error("booking insert failed", bookErr);
  process.exit(1);
}

const lineRows = DATES.map((date) => ({
  booking_id: booking.id,
  activity: "climbing",
  session_date: date,
  slot_id: SLOT.id,
  slot_label: SLOT.label,
  unit_price_gbp: UNIT_PRICE,
  status: "awaiting_payment",
  hold_expires_at: holdExpires,
}));

const { error: lineErr } = await admin
  .from("portal_crash_summer_booking_lines")
  .insert(lineRows);

if (lineErr) {
  console.error("lines insert failed", lineErr);
  await admin.from("portal_crash_summer_bookings").delete().eq("id", booking.id);
  process.exit(1);
}

const { data: ownerRow } = await admin
  .from("staff_profiles")
  .select("id")
  .eq("email", "victor@clubsensational.org")
  .maybeSingle();
let ownerId = ownerRow?.id || null;
if (!ownerId) {
  const { data: anyAdmin } = await admin
    .from("staff_profiles")
    .select("id")
    .eq("app_role", "admin")
    .limit(1)
    .maybeSingle();
  ownerId = anyAdmin?.id || null;
}
if (!ownerId) {
  console.error("No invoice owner staff id");
  process.exit(1);
}

const ref = `CRASH-SUM26-${String(booking.id).slice(0, 8).toUpperCase()}`;
const desc =
  "Climbing Activity - Summer crash course Jul 2026 - Week 1 · Mon 20 – Thu 23 July 2026 weekly pack (11:00–12:00 · 1 instructor)\nPay in full to confirm place.";

const { data: alloc, error: allocErr } = await admin.rpc(
  "portal_allocate_family_invoice_number",
);
let invoiceNumber = alloc && typeof alloc === "string" ? alloc : null;
if (allocErr || !invoiceNumber) {
  invoiceNumber = `INV-P-CRASH-${Date.now().toString(36).toUpperCase()}`;
  console.warn("allocate rpc failed, using", invoiceNumber, allocErr?.message || "");
}

const pdf = Buffer.from(
  `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 140 >>stream
BT /F1 12 Tf 40 240 Td (${invoiceNumber}) Tj 0 -20 Td (Patrick Dhennin crash climb W1) Tj 0 -20 Td (11:00-12:00 Mon-Thu 20-23 Jul) Tj 0 -20 Td (Amount GBP ${AMOUNT}) Tj ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000460 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
537
%%EOF
`,
);

const stamp = Date.now();
const storagePath = `${ownerId}/billing/client_invoice_${CONTACT_ID}_${stamp}.pdf`;
const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
  contentType: "application/pdf",
  upsert: false,
});
if (upErr) {
  console.error("pdf upload failed", upErr);
  process.exit(1);
}

const { data: doc, error: docErr } = await admin
  .from("documents")
  .insert({
    user_id: ownerId,
    document_type: "client_invoice",
    category: "billing",
    title: `Summer crash course — ${PARTICIPANT}`,
    related_date: dueDate,
    related_client: PARTICIPANT,
    file_url: storagePath,
    source_page: "admin_crash_reserve",
  })
  .select("id")
  .maybeSingle();

if (docErr || !doc?.id) {
  console.error("documents insert failed", docErr);
  process.exit(1);
}

const { data: share, error: shareErr } = await admin
  .from("portal_parent_invoice_share")
  .insert({
    contact_id: CONTACT_ID,
    document_id: doc.id,
    invoice_number: invoiceNumber,
    amount_gbp: AMOUNT,
    due_date: dueDate,
    payment_status: "unpaid",
    share_status: "ready",
    ready_at: now,
    ready_by: "admin_crash_reserve_patrick",
    notes: `Summer crash course Jul 2026 · booking ${booking.id} · Patrick climb c1 · ${ref}`,
    payment_method_hint: "payment_link",
    created_via: "portal",
    vat_mode: "vat_20",
    line_description: desc,
    quantity: 1,
    unit_price_gbp: AMOUNT,
    reference_text: "Patrick Dhennin",
    updated_at: now,
  })
  .select("id, invoice_number, amount_gbp")
  .maybeSingle();

if (shareErr || !share?.id) {
  console.error("invoice share insert failed", shareErr);
  process.exit(1);
}

await admin
  .from("portal_crash_summer_bookings")
  .update({ invoice_share_id: share.id, updated_at: new Date().toISOString() })
  .eq("id", booking.id);

console.log(
  JSON.stringify(
    {
      ok: true,
      booking_id: booking.id,
      status: "awaiting_payment",
      contact_id: CONTACT_ID,
      participant: PARTICIPANT,
      parent: PARENT,
      week: "Week 1 · Mon 20 – Thu 23 July 2026",
      activity: "climbing",
      time: "11:00–12:00",
      slot: SLOT.id,
      amount_gbp: AMOUNT,
      invoice_id: share.id,
      invoice_number: share.invoice_number,
      pay: "Family portal → Invoices (or /parent/crash-summer pay screen)",
      lines: lineRows.length,
    },
    null,
    2,
  ),
);
