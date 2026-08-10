/**
 * Office 22 Jul 2026 — Mia Mesi (385) · Kelidon:
 * Change 60' Wed 5.30–6.30 → 30' Wed 6–6.30 Aquatic (Private).
 * Update client_payments so the reenrol form no longer offers 60',
 * then create unpaid yearly_1off reenrol invoice £1,900.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-reenroll-mia-mesi-30.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-reenroll-mia-mesi-30.ts
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
import {
  REENROL_ACADEMIC_YEAR,
  SESSION_COUNTS,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "385";
const PARENT_PERSON_ID = "7451607";
const DUE = "2026-08-15";
const READY_BY = "office_reenrol_mia_mesi_30_20260722";

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

const sessions = { ...SESSION_COUNTS.weekday };
const WEEKLY_SLOTS: ParsedSlot[] = [
  {
    id: "pub-0",
    raw: "30' AQUATIC ACTIVITY (Wednesday)",
    serviceType: "AQUATIC ACTIVITY",
    durationMin: 30,
    day: "Wednesday",
    isWeekend: false,
    isDayCentre: false,
    pricePerSession: 50,
    sessions,
    termTotals: {
      autumn: sessions.autumn * 50,
      spring: sessions.spring * 50,
      summer: sessions.summer * 50,
      annual: sessions.annual * 50,
    },
    timeSlot: "6 to 6.30",
    venue: "Acton",
    instructor: "",
    displayLabel: "30' Aquatic Activity - 6 to 6.30 pm, Wednesdays (Acton)",
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
    "Created by office 22 Jul 2026 — Kelidon: renew 30' only (Wed 6–6.30 Aquatic), not the previous 60' 5.30–6.30. Private 20% VAT, yearly one-off unpaid.",
  funding: {
    choices_2627: fundingChoices,
    current_2526: {
      funding: "Private",
      invoice_type: "Parent (20% included invoice)",
      payment_method: "Bank Transfer",
      invoice_type_code: "vat_20",
      previous_service: "60' Aquatic Activity, Wednesday - 5.30 to 6.30",
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
  declarations: { accurate: true, terms: true, office_proxy: true },
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

console.log("Mia Mesi (385) · Kelidon Mesi");
console.log("Was: 60' Wed 5.30–6.30 @ £100 → £3,800/yr");
console.log("Now: 30' Wed 6–6.30 Aquatic @ £50 → £1,900/yr");
console.log(`Lines £${lineSum} · due ${DUE} · unpaid ready`);
console.log("Lines:", yearLines.map((l) => `${l.description} ×${l.quantity}=£${l.amount_gbp}`).join(" · "));

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1.");
  Deno.exit(0);
}

/* 1) Patch workbook so parent form / catalog no longer shows 60'. */
const { data: pay, error: payErr } = await admin
  .from("client_payments")
  .select("id, data")
  .eq("client_key", "mia")
  .maybeSingle();
if (payErr || !pay?.id) throw new Error(`client_payments mia: ${payErr?.message || "not found"}`);
const data = { ...(pay.data as Record<string, unknown> || {}) };
const prevServices = String(data.Services || "");
data.Services = "30' Aquatic Activity, Wednesday - 6 to 6.30";
data.Cost = 50;
data.Sessions = 13;
data.Total = 650;
data["Mar/Apr"] = 650;
data.Notes = [
  String(data.Notes || data.Note || "").trim(),
  `REENROL 26/27: changed 60'→30' Wed 6–6.30 (was ${prevServices || "60' Wed 5.30–6.30"}) · office 22 Jul`,
]
  .filter(Boolean)
  .join(" · ");
data["Re-enrol 26/27"] = "30' Wed 6–6.30 Aquatic · Private · office renew unpaid";
const { error: upPayErr } = await admin.from("client_payments").update({ data }).eq("id", pay.id);
if (upPayErr) throw new Error(`patch payments: ${upPayErr.message}`);
console.log("Updated client_payments mia → 30' Wed 6–6.30");

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
    participant_name: "Mia Mesi",
    parent_first_name: "Kelidon",
    parent_last_name: "Mesi",
    parent_person_id: PARENT_PERSON_ID,
    source: "link",
    payload,
  })
  .select("id, submitted_at")
  .single();
if (insErr || !inserted) throw new Error(`submission: ${insErr?.message}`);
console.log("Submission", inserted.id);

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
  notes:
    "Office re-enrolment · 30' Wed 6–6.30 only (was 60') · auto-continue · yearly one-off · Private 20% VAT · unpaid.",
  title: "Invoice — Mia Mesi · Full academic year 26/27",
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
console.log("Invoice", created.invoiceNumber, `£${annualTotal}`, created.invoice?.id);

try {
  await xeroHydrateRefreshFromDb(admin);
  const pushed = await pushPortalInvoiceShareToXero(admin, String(created.invoice?.id || ""));
  console.log("Xero", pushed);
  await xeroPersistRefreshToDb(admin);
} catch (e) {
  console.log("Xero skip:", e instanceof Error ? e.message : e);
}

console.log("Done.");
