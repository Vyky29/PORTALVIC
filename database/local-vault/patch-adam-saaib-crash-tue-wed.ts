/**
 * Adam Pilcher + Saaib crash W2: Tue/Thu → Tue/Wed.
 *  - Saaib 4.30–5 Acton
 *  - Adam 5–6.30 Acton
 * Updates invoices (regen PDF), crash bookings, MADRE.
 *
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-adam-saaib-crash-tue-wed.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  loadProductMap,
  xeroItemCodeForService,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const DATES = ["2026-07-28", "2026-07-29"]; // Tue Wed
const DROP = "2026-07-30"; // Thu
const WEEK_START = "2026-07-27";
const WD: Record<string, string> = {
  "2026-07-27": "Monday",
  "2026-07-28": "Tuesday",
  "2026-07-29": "Wednesday",
  "2026-07-30": "Thursday",
  "2026-07-31": "Friday",
};

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

function sortSlots(day: { slots?: Array<{ time_slot?: string }> }) {
  const rank = (t: string) => {
    const m = String(t || "")
      .toLowerCase()
      .match(/(\d{1,2})(?:[.:](\d{2}))?/);
    if (!m) return 9999;
    let h = +m[1];
    const mi = m[2] ? +m[2] : 0;
    if (h >= 1 && h <= 7) h += 12;
    return h * 60 + mi;
  };
  day.slots = Array.isArray(day.slots) ? day.slots : [];
  day.slots.sort((a, b) => rank(String(a.time_slot)) - rank(String(b.time_slot)));
}

function ensureDay(
  st: { days?: Array<Record<string, unknown>> },
  iso: string,
) {
  st.days = Array.isArray(st.days) ? st.days : [];
  let d = st.days.find(
    (x) => String(x.sessionDate || "").slice(0, 10) === iso,
  );
  if (d) return d;
  d = { weekday: WD[iso], sessionDate: iso, slots: [] };
  st.days.push(d);
  return d;
}

const productMap = await loadProductMap(admin);
const now = new Date().toISOString();

/* ─── Invoices ─── */
const adamLines: PortalInvoiceLineItem[] = [
  {
    service_key: "AQUATIC_90",
    description: "Aquatic Activity 90' (1to1)",
    detail: "Summer crash course Jul 2026 — Tue 28th & Wed 29th",
    dates: "5pm to 6.30pm · Acton",
    quantity: 2,
    unit_price_gbp: 150,
    amount_gbp: 300,
    xero_item_code: xeroItemCodeForService(productMap.get("AQUATIC_90"), "exempt"),
  },
];
const saaibLines: PortalInvoiceLineItem[] = [
  {
    service_key: "AQUATIC_30",
    description: "Aquatic Activity 30' (1to1)",
    detail: "Summer crash course Jul 2026 — Tue 28th & Wed 29th",
    dates: "4.30pm to 5pm · Acton",
    quantity: 2,
    unit_price_gbp: 50,
    amount_gbp: 100,
    xero_item_code: xeroItemCodeForService(productMap.get("AQUATIC_30"), "exempt"),
  },
];

const { data: adamInv } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, notes, payment_status")
  .eq("invoice_number", "INV-P-0001")
  .eq("contact_id", "354")
  .maybeSingle();
const { data: saaibInv } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, notes, payment_status")
  .eq("invoice_number", "INV-P-0127")
  .eq("contact_id", "gap-saaib-abdullah")
  .maybeSingle();
if (!adamInv || !saaibInv) {
  console.error("missing invoice", { adamInv, saaibInv });
  Deno.exit(1);
}

const adamNotesBase = String(adamInv.notes || "");
const saaibNotesBase = String(saaibInv.notes || "");
const adamBillTo = adamNotesBase.includes("Bill-to:")
  ? adamNotesBase.slice(adamNotesBase.indexOf("Bill-to:"))
  : "Bill-to: H&F Adult ASC (Adam 18+).";
const saaibBillTo = saaibNotesBase.includes("Bill-to:")
  ? saaibNotesBase.slice(saaibNotesBase.indexOf("Bill-to:"))
  : "Bill-to: H&F Children's Services.";

const adamNotes =
  `Office crash course · Aquatic 90' · Tue 28 / Wed 29 Jul 2026 · 5pm–6.30pm Acton · 2× £150 = £300 · Afterschool & Weekends. · ${adamBillTo}`;
const saaibNotes =
  `Office crash course · Aquatic 30' · Tue 28 / Wed 29 Jul 2026 · 4.30pm–5pm Acton · 2× £50 = £100 · Afterschool & Weekends. · ${saaibBillTo}`;

console.log("Adam INV-P-0001 →", adamLines[0].detail, adamLines[0].dates);
console.log("Saaib INV-P-0127 →", saaibLines[0].detail, saaibLines[0].dates);

if (!APPLY) {
  console.log("Dry run — re-run with APPLY=1");
  Deno.exit(0);
}

await admin
  .from("portal_parent_invoice_share")
  .update({
    line_items: adamLines,
    line_description: lineItemsToDescription(adamLines, { fundedProvision: true }),
    notes: adamNotes,
    amount_gbp: 300,
    updated_at: now,
  })
  .eq("id", adamInv.id);

await admin
  .from("portal_parent_invoice_share")
  .update({
    line_items: saaibLines,
    line_description: lineItemsToDescription(saaibLines, { fundedProvision: true }),
    notes: saaibNotes,
    amount_gbp: 100,
    updated_at: now,
  })
  .eq("id", saaibInv.id);

/* ─── Bookings ─── */
async function upsertCrashBooking(opts: {
  contactId: string;
  parentPersonId: string;
  invoiceShareId: string;
  amount: number;
  notes: string;
  slotId: string;
  slotLabel: string;
  unit: number;
}) {
  const { data: existing } = await admin
    .from("portal_crash_summer_bookings")
    .select("id, week_id, status")
    .eq("contact_id", opts.contactId)
    .order("created_at", { ascending: false })
    .limit(5);

  // Prefer an existing w2 row; else reuse latest; else insert.
  let bookingId = (existing || []).find((b) => b.week_id === "w2")?.id as
    | string
    | undefined;
  if (!bookingId) bookingId = existing?.[0]?.id as string | undefined;

  if (!bookingId) {
    const { data: inserted, error } = await admin
      .from("portal_crash_summer_bookings")
      .insert({
        contact_id: opts.contactId,
        parent_person_id: opts.parentPersonId,
        week_id: "w2",
        booking_mode: "individual_days",
        activities: ["swimming"],
        amount_gbp: opts.amount,
        status: "awaiting_payment",
        invoice_share_id: opts.invoiceShareId,
        hold_expires_at: "2026-08-05T17:00:00.000Z",
        notes: opts.notes,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(error?.message || "booking insert");
    bookingId = inserted.id;
    console.log("booking created", opts.contactId, bookingId);
  } else {
    await admin
      .from("portal_crash_summer_bookings")
      .update({
        week_id: "w2",
        amount_gbp: opts.amount,
        status: "awaiting_payment",
        invoice_share_id: opts.invoiceShareId,
        activities: ["swimming"],
        notes: opts.notes,
        updated_at: now,
      })
      .eq("id", bookingId);
    console.log("booking updated", opts.contactId, bookingId);
  }

  await admin
    .from("portal_crash_summer_booking_lines")
    .delete()
    .eq("booking_id", bookingId);

  for (const iso of DATES) {
    const { error } = await admin.from("portal_crash_summer_booking_lines").insert({
      booking_id: bookingId,
      activity: "swimming",
      session_date: iso,
      slot_id: opts.slotId,
      slot_label: opts.slotLabel,
      unit_price_gbp: opts.unit,
      status: "awaiting_payment",
      hold_expires_at: "2026-08-05T17:00:00.000Z",
    });
    if (error) throw new Error(`${opts.contactId} ${iso}: ${error.message}`);
    console.log("  line", iso, opts.slotLabel);
  }
}

await upsertCrashBooking({
  contactId: "354",
  parentPersonId: "7166746",
  invoiceShareId: adamInv.id,
  amount: 300,
  notes:
    "Office inject · Adam Pilcher · Acton aquatic 90' · Tue 28 / Wed 29 Jul 2026 · 17:00–18:30 · INV-P-0001",
  slotId: "office_adam_acton_1700",
  slotLabel: "17:00–18:30 · Acton · 1 instructor",
  unit: 150,
});

await upsertCrashBooking({
  contactId: "gap-saaib-abdullah",
  parentPersonId: "gap-shahanara-begum",
  invoiceShareId: saaibInv.id,
  amount: 100,
  notes:
    "Office inject · Saaib Abdullah · Acton aquatic 30' · Tue 28 / Wed 29 Jul 2026 · 16:30–17:00 · INV-P-0127",
  slotId: "office_saaib_acton_1630",
  slotLabel: "16:30–17:00 · Acton · 1 instructor",
  unit: 50,
});

/* ─── MADRE ─── */
const { data: madreRow } = await admin
  .from("portal_madre_document")
  .select("revision, document")
  .eq("term_key", "summer-2026")
  .maybeSingle();
if (!madreRow?.document) throw new Error("madre missing");
const doc = madreRow.document as {
  weeks?: Array<Record<string, unknown>>;
  revisionNotes?: string[];
};
const week = (doc.weeks || []).find(
  (w) => String(w.start || "").slice(0, 10) === WEEK_START,
) as
  | {
      staff?: Array<{
        staffKey?: string;
        days?: Array<Record<string, unknown>>;
      }>;
    }
  | undefined;
if (!week) throw new Error("week missing");

let saaibInfo = "";
let adamInfo = "";
for (const st of week.staff || []) {
  for (const day of st.days || []) {
    for (const s of (day.slots as Array<Record<string, unknown>>) || []) {
      const n = String(s.client_name || "").toLowerCase();
      if (n === "saaib" && s.participant_info) saaibInfo = String(s.participant_info);
      if (/^adam\s*p/i.test(String(s.client_name || "")) && s.participant_info) {
        adamInfo = String(s.participant_info);
      }
    }
  }
}

const roberto = (week.staff || []).find(
  (s) => String(s.staffKey || "").toLowerCase() === "roberto",
);
if (!roberto) throw new Error("roberto missing");

// Strip Saaib / Adam P from all days that week, then place Tue+Wed.
for (const st of week.staff || []) {
  for (const day of st.days || []) {
    const iso = String(day.sessionDate || "").slice(0, 10);
    if (iso < "2026-07-27" || iso > "2026-07-31") continue;
    day.slots = ((day.slots as Array<Record<string, unknown>>) || []).filter(
      (s) => {
        const n = String(s.client_name || "").trim().toLowerCase();
        if (n === "saaib") return false;
        if (/^adam\s*p/.test(n) || n === "adam pi" || n === "adam pilcher") {
          return false;
        }
        return true;
      },
    );
  }
}

for (const iso of DATES) {
  const d = ensureDay(roberto, iso);
  const slots = (d.slots as Array<Record<string, unknown>>) || [];
  slots.push(
    {
      area: "Teaching Pool",
      venue: "Acton",
      service: "Aquatic Activity",
      pool_note: "Teaching Pool",
      time_slot: "4.30 to 5",
      client_name: "Saaib",
      instructors: "ROBERTO",
      participant_info: saaibInfo,
    },
    {
      area: "Teaching Pool",
      venue: "Acton",
      service: "Aquatic Activity",
      pool_note: "Teaching Pool",
      time_slot: "5 to 6.30",
      client_name: "Adam P",
      instructors: "ROBERTO",
      participant_info: adamInfo,
    },
  );
  d.slots = slots;
  sortSlots(d as { slots?: Array<{ time_slot?: string }> });
}

const prevRev = Number(madreRow.revision) || 0;
const revNote =
  `rev ${prevRev + 1}: Adam+Saaib crash → Tue/Wed Acton (Saaib 4.30–5, Adam 5–6.30); was Tue/Thu`;
doc.revisionNotes = Array.isArray(doc.revisionNotes)
  ? [...doc.revisionNotes, revNote]
  : [revNote];

const { error: madreErr } = await admin
  .from("portal_madre_document")
  .update({
    document: doc,
    revision: prevRev + 1,
    updated_at: now,
  })
  .eq("term_key", "summer-2026");
if (madreErr) throw madreErr;
console.log("MADRE", revNote);

const pdfAdam = await regeneratePortalInvoiceSharePdf(admin, adamInv.id);
const pdfSaaib = await regeneratePortalInvoiceSharePdf(admin, saaibInv.id);
console.log("PDF Adam", pdfAdam);
console.log("PDF Saaib", pdfSaaib);
console.log("Done. (dropped", DROP, ")");
