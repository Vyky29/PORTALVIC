/**
 * Office: Thomas (Tom) Eriksson (89) re-enrolment 2026/27 —
 * whole-year auto-continue + one-off payment (Private · Parent 20% VAT).
 * Slot kept: Thu 4–4.30 Aquatic · Acton · £50 × 38 = £1,900/year.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-reenroll-tom-eriksson-1off.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-reenroll-tom-eriksson-1off.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import { REENROL_ACADEMIC_YEAR, type ParsedSlot } from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "89";
const PARENT_PERSON_ID = "1795640";
const DUE = "2026-08-15";
const READY_BY = "office_reenrol_tom_eriksson_1off";

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const WEEKLY_SLOTS: ParsedSlot[] = [
  {
    id: "pub-0",
    raw: "30' AQUATIC ACTIVITY (Thursday)",
    serviceType: "AQUATIC ACTIVITY",
    durationMin: 30,
    day: "Thursday",
    isWeekend: false,
    isDayCentre: false,
    pricePerSession: 50,
    sessions: { autumn: 14, spring: 11, summer: 13, annual: 38 },
    termTotals: { autumn: 700, spring: 550, summer: 650, annual: 1900 },
    timeSlot: "4 to 4.30",
    venue: "Acton",
    instructor: "ROBERTO",
    displayLabel: "30' Aquatic Activity - 4 to 4.30 pm, Thursdays (Acton)",
  },
];

const weeklyChoices: Record<string, { choice: string; alternative: null }> = {
  "pub-0": { choice: "keep", alternative: null },
};

const annualTotal = 1900;
const termTotals = { autumn: 700, spring: 550, summer: 650, annual: annualTotal };

const fundingChoices = {
  billing_mode: "private",
  funding_code: "private",
  funding_label: "Using Private Funds",
  auto_continue: true,
  admin_fee_total: 0,
  admin_fee_reason: null,
  billing_schedule: "yearly_1off",
  admin_fee_applies: false,
  enrolment_cadence: "whole_year",
  invoice_type_code: "vat_20",
  invoice_type_label: "Parent (20% included invoice)",
  advance_buffer_gbp: null,
  auto_continue_note:
    "We will treat this place as continuing each term with the same arrangement unless you tell us otherwise.",
  payment_method_code: "bank_transfer",
  payment_method_label: "Bank Transfer / Card / Apple Pay (fixed due dates)",
  payment_schedule_code: "yearly_1off",
  payment_schedule_label: "All year — one payment",
  estimated_annual_total: annualTotal,
  enrolment_cadence_label: "Whole year — confirm once; continue each term automatically",
  estimated_total_with_admin_fee: null,
  advance_buffer_note: null,
  advance_buffer_lines: null,
  advance_buffer_sessions_per_service: null,
};

const payload = {
  source: "office",
  office_note:
    "Created by office 22 Jul 2026 — Kirstin: auto re-enrol all year, one-off payment, Private 20% VAT.",
  funding: {
    choices_2627: fundingChoices,
    current_2526: {
      funding: "Private",
      invoice_type: "Parent (20% included invoice)",
      payment_method: "1 - Bank Transfer",
      invoice_type_code: "vat_20",
    },
  },
  choices: {
    weekly: weeklyChoices,
    day_centre: null,
    enrolment_cadence: "whole_year",
    enrolment_cadence_label: fundingChoices.enrolment_cadence_label,
  },
  weekly_slots_snapshot: WEEKLY_SLOTS,
  term_totals: termTotals,
  declarations: {
    accurate: true,
    terms: true,
    office_proxy: true,
  },
};

const productMap = await loadProductMap(admin);
const yearLines: PortalInvoiceLineItem[] = [];
for (const term of ["autumn", "spring", "summer"] as const) {
  const termLines = buildReenrolTermLineItems({
    slots: WEEKLY_SLOTS,
    weeklyChoices,
    term,
    vatMode: "vat_20",
    productMap,
  });
  for (const line of termLines) {
    const key = `${line.service_key}\u0000${line.detail || ""}`;
    const prev = yearLines.find((l) => `${l.service_key}\u0000${l.detail || ""}` === key);
    if (prev) {
      prev.quantity = round2(Number(prev.quantity) + Number(line.quantity));
      prev.amount_gbp = round2(Number(prev.amount_gbp) + Number(line.amount_gbp));
      prev.unit_price_gbp = prev.quantity
        ? Math.round((prev.amount_gbp / prev.quantity) * 10000) / 10000
        : prev.unit_price_gbp;
      const dates = [prev.dates, line.dates].filter(Boolean).join(" · ");
      prev.dates = dates || prev.dates;
    } else {
      yearLines.push({ ...line });
    }
  }
}

const lineSum = round2(yearLines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
const description = lineItemsToDescription(yearLines, { fundedProvision: false });

console.log("Thomas (Tom) Eriksson (89) — Kirstin Eriksson");
console.log("Slot kept: Thu 4–4.30 Aquatic · Acton · £50 × 38 = £1,900/year");
console.log("Cadence: whole_year auto_continue · yearly_1off · Private 20% · bank");
console.log(`Annual total: £${annualTotal} (line sum £${lineSum}) · due ${DUE}`);
console.log("Lines:", yearLines.map((l) => `${l.description} ×${l.quantity}=£${l.amount_gbp}`).join(" · "));

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write submission + invoice.");
  Deno.exit(0);
}

const { data: existingSubs } = await admin
  .from("portal_re_enrolment_submissions")
  .select("id, submitted_at")
  .eq("participant_contact_id", CONTACT_ID)
  .eq("academic_year", REENROL_ACADEMIC_YEAR);
if (existingSubs?.length) {
  throw new Error(`Already has submission(s): ${JSON.stringify(existingSubs)}`);
}

const { data: existingInv } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number")
  .eq("contact_id", CONTACT_ID)
  .eq("created_via", "reenrolment")
  .neq("payment_status", "void");
if (existingInv?.length) {
  throw new Error(
    `Already has reenrol invoices: ${existingInv.map((r) => r.invoice_number).join(", ")}`,
  );
}

const { data: inserted, error: insErr } = await admin
  .from("portal_re_enrolment_submissions")
  .insert({
    academic_year: REENROL_ACADEMIC_YEAR,
    participant_contact_id: CONTACT_ID,
    participant_name: "Thomas (Tom) Eriksson",
    parent_first_name: "Kirstin",
    parent_last_name: "Eriksson",
    parent_person_id: PARENT_PERSON_ID,
    source: "link",
    payload,
  })
  .select("id, submitted_at")
  .single();
if (insErr || !inserted) throw new Error(`submission insert: ${insErr?.message}`);
console.log("Submission", inserted.id, inserted.submitted_at);

await admin
  .from("portal_parent_contacts")
  .update({
    funding_label: "Using Private Funds",
    payment_method_label: "Bank Transfer",
    updated_at: new Date().toISOString(),
  })
  .eq("contact_id", CONTACT_ID);

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

const created = await createPortalFamilyInvoice(admin, {
  contactId: CONTACT_ID,
  amountGbp: annualTotal,
  dueDateIso: DUE,
  vatMode: "vat_20",
  lineDescription: description,
  reference: "Full academic year 26/27",
  notes: "Office re-enrolment · auto-continue · one-off bank / Apple Pay (Private 20% VAT).",
  title: "Invoice — Thomas (Tom) Eriksson · Full academic year 26/27",
  shareStatus: "ready",
  paymentMethodHint: "bank_transfer",
  createdVia: "reenrolment",
  ownerUserId: ownerId,
  readyBy: READY_BY,
  billingTerm: null,
  paymentSchedule: [
    {
      seq: 1,
      label: "Full academic year · one payment",
      due_date: DUE,
      amount_gbp: annualTotal,
      status: "pending",
      paid_at: null,
      paid_via: null,
    },
  ],
  lineItems: yearLines,
});
if (!created.ok) throw new Error(`invoice: ${created.error}`);
const shareId = String(created.invoice?.id || "");
if (!shareId) throw new Error("invoice created but missing share id");
console.log("Invoice", created.invoiceNumber, `£${annualTotal}`, shareId);

await xeroHydrateRefreshFromDb(admin);
const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
console.log("Xero push", pushed);
await xeroPersistRefreshToDb(admin);

console.log("Done.");
