/**
 * One-shot admin reserve: Adam Pilcher · Crash swim Week 1 (21–24 Jul) · 16:30–18:00.
 *
 *   node database/local-vault/reserve-adam-pilcher-crash-w1-swim.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTACT_ID = "354";
const PARENT_PERSON_ID = "7166746";
const WEEK_ID = "w1";
const DATES = ["2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"];
/** 16:30–18:00 = three consecutive 30′ bands (Instructor A). */
const SLOTS = [
  { id: "s1", label: "16:30–17:00 · Instructor A" },
  { id: "s3", label: "17:00–17:30 · Instructor A" },
  { id: "s5", label: "17:30–18:00 · Instructor A" },
];
const WEEKLY_PACK_UNIT = 200; // £200 per 30′ band for 4-day pack
const AMOUNT = WEEKLY_PACK_UNIT * SLOTS.length; // £600
const UNIT_PRICE = Math.round((AMOUNT / (DATES.length * SLOTS.length)) * 100) / 100;

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

const { data: existing } = await admin
  .from("portal_crash_summer_bookings")
  .select("id, status, amount_gbp, invoice_share_id, notes")
  .eq("contact_id", CONTACT_ID)
  .eq("week_id", WEEK_ID)
  .contains("activities", ["swimming"])
  .in("status", ["awaiting_payment", "confirmed"])
  .order("created_at", { ascending: false })
  .limit(5);

if (existing?.length) {
  console.log("Existing active crash booking(s) for Adam Pilcher w1:", existing);
}

const { data: booking, error: bookErr } = await admin
  .from("portal_crash_summer_bookings")
  .insert({
    contact_id: CONTACT_ID,
    parent_person_id: PARENT_PERSON_ID,
    week_id: WEEK_ID,
    booking_mode: "weekly_pack",
    activities: ["swimming"],
    amount_gbp: AMOUNT,
    status: "confirmed",
    hold_expires_at: null,
    notes:
      "Admin reserved · Adam Pilcher · Swim crash Week 1 · 16:30–18:00 (Instructor A) · Tue 21–Fri 24 Jul 2026",
    updated_at: now,
  })
  .select("id")
  .maybeSingle();

if (bookErr || !booking?.id) {
  console.error("booking insert failed", bookErr);
  process.exit(1);
}

const lineRows = [];
for (const date of DATES) {
  for (const slot of SLOTS) {
    lineRows.push({
      booking_id: booking.id,
      activity: "swimming",
      session_date: date,
      slot_id: slot.id,
      slot_label: slot.label,
      unit_price_gbp: UNIT_PRICE,
      status: "confirmed",
      hold_expires_at: null,
    });
  }
}

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
  "Summer crash course Jul 2026 — Swimming weekly pack (Week 1 · Tue 21 – Fri 24 July 2026) · 16:30–18:00 · 90′ · Instructor A. Admin reserved place for Adam Pilcher.";

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
4 0 obj<< /Length 120 >>stream
BT /F1 12 Tf 40 240 Td (${invoiceNumber}) Tj 0 -20 Td (Adam Pilcher crash swim W1) Tj 0 -20 Td (16:30-18:00 Tue-Fri 21-24 Jul) Tj 0 -20 Td (Amount GBP ${AMOUNT}) Tj ET
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
    title: `Summer crash course — Adam Pilcher`,
    related_date: dueDate,
    related_client: "Adam Pilcher",
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
    ready_by: "admin_crash_reserve",
    notes: `Summer crash course Jul 2026 · booking ${booking.id} · admin reserved · ${ref}`,
    payment_method_hint: "la_funded",
    created_via: "portal",
    vat_mode: "exempt",
    line_description: desc,
    quantity: 1,
    unit_price_gbp: AMOUNT,
    reference_text: ref,
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
      status: "confirmed",
      contact_id: CONTACT_ID,
      participant: "Adam Pilcher",
      parent: "Juliette Fenton",
      week: "Week 1 · Tue 21 – Fri 24 July 2026",
      activity: "swimming",
      time: "16:30–18:00 Instructor A",
      slots: SLOTS.map((s) => s.id),
      amount_gbp: AMOUNT,
      invoice_id: share.id,
      invoice_number: share.invoice_number,
      lines: lineRows.length,
    },
    null,
    2,
  ),
);
