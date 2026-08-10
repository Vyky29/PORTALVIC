/**
 * Office: create Jack Stratton (170) re-enrolment 2026/27 for both weekly
 * slots, one-off bank transfer / Card / Apple Pay (exempt Direct Payments).
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-reenroll-jack-stratton-1off.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-reenroll-jack-stratton-1off.ts
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
const CONTACT_ID = "170";
const DUE = "2026-08-15";

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
    raw: "60' AQUATIC ACTIVITY (Monday)",
    serviceType: "AQUATIC ACTIVITY",
    durationMin: 60,
    day: "Monday",
    isWeekend: false,
    isDayCentre: false,
    pricePerSession: 50,
    sessions: { autumn: 14, spring: 11, summer: 13, annual: 38 },
    termTotals: { autumn: 700, spring: 550, summer: 650, annual: 1900 },
    timeSlot: "11 to 12",
    venue: "SwimFarm",
    instructor: "ROBERTO",
  },
  {
    id: "pub-1",
    raw: "90' MULTI-ACTIVITY (Sunday)",
    serviceType: "MULTI-ACTIVITY",
    durationMin: 90,
    day: "Sunday",
    isWeekend: true,
    isDayCentre: false,
    pricePerSession: 120,
    sessions: { autumn: 13, spring: 9, summer: 11, annual: 33 },
    termTotals: { autumn: 1560, spring: 1080, summer: 1320, annual: 3960 },
    timeSlot: "9.30 to 11",
    venue: "SwimFarm",
    instructor: "JAVIER",
  },
];

const weeklyChoices: Record<string, { choice: string; alternative: null }> = {
  "pub-0": { choice: "keep", alternative: null },
  "pub-1": { choice: "keep", alternative: null },
};

const annualTotal = round2(
  WEEKLY_SLOTS.reduce((s, slot) => s + Number(slot.termTotals?.annual || 0), 0),
);

const fundingChoices = {
  billing_mode: "direct_payments",
  funding_code: "la_direct_payments",
  funding_label: "Using funds from LA (Direct Payments from your EHCP care package)",
  auto_continue: true,
  admin_fee_total: 0,
  admin_fee_reason: null,
  billing_schedule: "yearly_1off",
  admin_fee_applies: false,
  enrolment_cadence: "whole_year",
  invoice_type_code: "exempt",
  invoice_type_label: "EXEMPT VAT",
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
  office_note: "Created by office 21 Jul 2026 — Veronica: one-off bank / Apple Pay for both slots.",
  funding: {
    choices_2627: fundingChoices,
    current_2526: {
      funding: "Local authority (Direct Payments)",
      invoice_type: "EXEMPT VAT",
      payment_method: "Own Way (upfront)",
      invoice_type_code: "exempt",
    },
  },
  choices: {
    weekly: weeklyChoices,
    day_centre: null,
    enrolment_cadence: "whole_year",
    enrolment_cadence_label: fundingChoices.enrolment_cadence_label,
  },
  weekly_slots_snapshot: WEEKLY_SLOTS,
  term_totals: {
    autumn: round2(WEEKLY_SLOTS.reduce((s, x) => s + Number(x.termTotals?.autumn || 0), 0)),
    spring: round2(WEEKLY_SLOTS.reduce((s, x) => s + Number(x.termTotals?.spring || 0), 0)),
    summer: round2(WEEKLY_SLOTS.reduce((s, x) => s + Number(x.termTotals?.summer || 0), 0)),
    annual: annualTotal,
  },
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
    vatMode: "exempt",
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
const description = lineItemsToDescription(yearLines, { fundedProvision: true });

console.log("Jack Stratton (170) — Veronica Grace");
console.log("Slots kept:");
for (const s of WEEKLY_SLOTS) {
  console.log(
    `  ${s.serviceType} · ${s.day} ${s.timeSlot} @ ${s.venue} — £${s.termTotals?.annual}/year`,
  );
}
console.log(`Annual total: £${annualTotal} (line sum £${lineSum})`);
console.log("Pay: one-off bank transfer / Card / Apple Pay · EXEMPT · due", DUE);
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
  throw new Error(`Already has reenrol invoices: ${existingInv.map((r) => r.invoice_number).join(", ")}`);
}

const { data: inserted, error: insErr } = await admin
  .from("portal_re_enrolment_submissions")
  .insert({
    academic_year: REENROL_ACADEMIC_YEAR,
    participant_contact_id: CONTACT_ID,
    participant_name: "Jack Stratton",
    parent_first_name: "Veronica",
    parent_last_name: "Grace",
    parent_person_id: "5517161",
    source: "link",
    payload,
  })
  .select("id, submitted_at")
  .single();
if (insErr || !inserted) throw new Error(`submission insert: ${insErr?.message}`);
console.log("Submission", inserted.id, inserted.submitted_at);

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

const created = await createPortalFamilyInvoice(admin, {
  contactId: CONTACT_ID,
  amountGbp: annualTotal,
  dueDateIso: DUE,
  vatMode: "exempt",
  lineDescription: description,
  reference: "Full academic year 26/27",
  notes: "Office re-enrolment · one-off bank / Apple Pay (Direct Payments exempt).",
  title: "Invoice — Jack Stratton · Full academic year 26/27",
  shareStatus: "ready",
  paymentMethodHint: "bank_transfer",
  createdVia: "reenrolment",
  ownerUserId: ownerId,
  readyBy: "office_reenrol_jack_stratton",
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
