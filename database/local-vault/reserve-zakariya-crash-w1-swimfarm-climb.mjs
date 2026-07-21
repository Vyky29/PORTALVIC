/**
 * Admin reserve: Zakariya Warsame (Catarina Smith) · Crash Week 1 July 2026
 * - Climbing 12:00–13:00 Westway (Mon–Thu) · instructor Alex
 * - Aquatic 13:00–14:00 SwimFarm back-to-back same Mon–Thu (after climb)
 *
 *   node database/local-vault/reserve-zakariya-crash-w1-swimfarm-climb.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTACT_ID = "42";
const PARENT_PERSON_ID = "5596624";
const PARTICIPANT = "Zakariya Warsame";
const PARENT = "Catarina Smith";
const WEEK_ID = "w1";

const CLIMB_DATES = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"];
/** Same Mon–Thu as climb — back-to-back swim 13:00–14:00 after climb. */
const SWIM_DATES = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"];

/** Custom slot — not in public Acton evening grid (special SwimFarm AM). */
const SWIM_SLOTS = [
  { id: "sf_zak_1200", label: "12:00–12:30 · SwimFarm (special AM)" },
  { id: "sf_zak_1230", label: "12:30–13:00 · SwimFarm (special AM)" },
];
/** Custom slot — between lunch & 14:00 WL; not on standard Westway 10–13 grid. */
const CLIMB_SLOT = {
  id: "c_zak_1300",
  label: "13:00–14:00 · Westway · 1 instructor",
};

const CLIMB_AMOUNT = 300; // weekly climb pack
const SWIM_AMOUNT = 200 * SWIM_SLOTS.length; // £200 per 30′ band × 2 = £400
const AMOUNT = CLIMB_AMOUNT + SWIM_AMOUNT; // £700
const CLIMB_UNIT = Math.round((CLIMB_AMOUNT / CLIMB_DATES.length) * 100) / 100;
const SWIM_UNIT =
  Math.round((SWIM_AMOUNT / (SWIM_DATES.length * SWIM_SLOTS.length)) * 100) / 100;

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

const { data: existing } = await admin
  .from("portal_crash_summer_bookings")
  .select("id, status, amount_gbp, invoice_share_id, notes")
  .eq("contact_id", CONTACT_ID)
  .eq("week_id", WEEK_ID)
  .in("status", ["awaiting_payment", "confirmed"])
  .limit(10);

if (existing?.length) {
  console.log("Existing Zakariya crash booking(s):", existing);
  console.log("Aborting to avoid duplicate — cancel old hold first if needed.");
  process.exit(1);
}

const { data: climbClash } = await admin
  .from("portal_crash_summer_booking_lines")
  .select("id, session_date, slot_id, status")
  .eq("activity", "climbing")
  .eq("slot_id", CLIMB_SLOT.id)
  .in("session_date", CLIMB_DATES)
  .in("status", ["awaiting_payment", "confirmed"]);

if (climbClash?.length) {
  console.error("Climb slot clash:", climbClash);
  process.exit(1);
}

const { data: swimClash } = await admin
  .from("portal_crash_summer_booking_lines")
  .select("id, session_date, slot_id, status")
  .eq("activity", "swimming")
  .in("slot_id", SWIM_SLOTS.map((s) => s.id))
  .in("session_date", SWIM_DATES)
  .in("status", ["awaiting_payment", "confirmed"]);

if (swimClash?.length) {
  console.error("Swim slot clash:", swimClash);
  process.exit(1);
}

const { data: booking, error: bookErr } = await admin
  .from("portal_crash_summer_bookings")
  .insert({
    contact_id: CONTACT_ID,
    parent_person_id: PARENT_PERSON_ID,
    week_id: WEEK_ID,
    booking_mode: "weekly_pack",
    activities: ["swimming", "climbing"],
    amount_gbp: AMOUNT,
    status: "awaiting_payment",
    hold_expires_at: holdExpires,
    notes:
      "Admin special · Zakariya Warsame / Catarina Smith · Swim 12:00–13:00 SwimFarm AM (exception; standard crash swim is Acton evenings Tue–Fri) + Climb 13:00–14:00 Westway · W1 Jul 2026 · pay via family portal",
    updated_at: now,
  })
  .select("id")
  .maybeSingle();

if (bookErr || !booking?.id) {
  console.error("booking insert failed", bookErr);
  process.exit(1);
}

const lineRows = [];
for (const date of CLIMB_DATES) {
  lineRows.push({
    booking_id: booking.id,
    activity: "climbing",
    session_date: date,
    slot_id: CLIMB_SLOT.id,
    slot_label: CLIMB_SLOT.label,
    unit_price_gbp: CLIMB_UNIT,
    status: "awaiting_payment",
    hold_expires_at: holdExpires,
  });
}
for (const date of SWIM_DATES) {
  for (const slot of SWIM_SLOTS) {
    lineRows.push({
      booking_id: booking.id,
      activity: "swimming",
      session_date: date,
      slot_id: slot.id,
      slot_label: slot.label,
      unit_price_gbp: SWIM_UNIT,
      status: "awaiting_payment",
      hold_expires_at: holdExpires,
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
  "Summer crash course Jul 2026 — Zakariya Warsame · Climbing 12:00–13:00 Westway + Aquatic 13:00–14:00 SwimFarm back-to-back (Mon 20–Thu 23 July).";

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
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 320] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 160 >>stream
BT /F1 12 Tf 40 260 Td (${invoiceNumber}) Tj 0 -18 Td (Zakariya Warsame crash W1) Tj 0 -18 Td (SwimFarm 12:00-13:00 Tue-Fri) Tj 0 -18 Td (Westway climb 13:00-14:00 Mon-Thu) Tj 0 -18 Td (Amount GBP ${AMOUNT}) Tj ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000278 00000 n 
0000000504 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
581
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
    ready_by: "admin_crash_reserve",
    notes: `Summer crash course Jul 2026 · booking ${booking.id} · SwimFarm AM + Westway climb · ${ref}`,
    payment_method_hint: "payment_link",
    created_via: "portal",
    vat_mode: "vat_20",
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

// Replace the stub PDF with the Portal TAX INVOICE layout (same as crash book / Xero INV-P).
try {
  const { execSync } = await import("node:child_process");
  execSync(
    `npx --yes deno run -A scripts/regen-crash-share-tax-pdf.ts ${share.invoice_number}`,
    { cwd: root, stdio: "inherit", env: process.env },
  );
} catch (regenErr) {
  console.warn(
    "TAX INVOICE regenerate failed — run: npx deno run -A scripts/regen-crash-share-tax-pdf.ts",
    share.invoice_number,
    regenErr?.message || regenErr,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      booking_id: booking.id,
      status: "awaiting_payment",
      contact_id: CONTACT_ID,
      participant: PARTICIPANT,
      parent: PARENT,
      week: "Week 1 July 2026",
      swimming: {
        venue: "SwimFarm (special AM exception)",
        time: "12:00–13:00",
        dates: SWIM_DATES,
        slots: SWIM_SLOTS.map((s) => s.id),
        amount_gbp: SWIM_AMOUNT,
      },
      climbing: {
        venue: "Westway",
        time: "13:00–14:00",
        dates: CLIMB_DATES,
        slot: CLIMB_SLOT.id,
        amount_gbp: CLIMB_AMOUNT,
      },
      amount_gbp: AMOUNT,
      invoice_id: share.id,
      invoice_number: share.invoice_number,
      lines: lineRows.length,
      note: "TAX INVOICE PDF regenerated; use Admin → Push to Xero if still unsynced.",
    },
    null,
    2,
  ),
);
