/**
 * Office: Agata · Erik Ndregjoni (176) — keep Multi SwimFarm Sun 12.30–2.
 *
 * Context: office reset 11 Aug voided INV-P-0014/0015 + deleted submission;
 * soft hold to 31 Aug. Agata keeps the place (option A) — recreate re-enrol
 * + Autumn flexi bank invoice (2 × £780). MADRE already has Erik.
 *
 * Dry:  npx -y deno run -A database/local-vault/office-reenroll-erik-agata-flexi.ts
 * Apply: APPLY=1 npx -y deno run -A database/local-vault/office-reenroll-erik-agata-flexi.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import { clearPaymentHoldForContact } from "../../supabase/functions/_shared/portal_payment_holds.ts";
import { buildReenrolmentInstalments } from "../../supabase/functions/_shared/reenrolment_auto_invoices.ts";
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
const CONTACT_ID = "176";
const PARENT_PERSON_ID = "5797478";
const READY_BY = "office_reenrol_erik_agata_flexi_20260831";
/** First flexi half overdue vs Aug-15 template — due end of hold day. */
const DUE1 = "2026-08-31";
const DUE2 = "2026-10-26";
const OFFICE_USER = "a0d439df-3a8f-439d-b427-b3459552eae1";

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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const sessions = { ...SESSION_COUNTS.weekend };
const PRICE = 120;
const WEEKLY_SLOTS: ParsedSlot[] = [
  {
    id: "pub-0",
    raw: "90' MULTI-ACTIVITY (Sunday)",
    serviceType: "MULTI-ACTIVITY",
    durationMin: 90,
    day: "Sunday",
    isWeekend: true,
    isDayCentre: false,
    pricePerSession: PRICE,
    sessions,
    termTotals: {
      autumn: round2(sessions.autumn * PRICE),
      spring: round2(sessions.spring * PRICE),
      summer: round2(sessions.summer * PRICE),
      annual: round2(sessions.annual * PRICE),
    },
    timeSlot: "12.30 to 2",
    venue: "SwimFarm",
    instructor: "JOHN / DAN",
    displayLabel: "90' Multi-Activity - 12.30 to 2 pm, Sundays (SwimFarm)",
  },
];

const weeklyChoices: Record<string, { choice: string; alternative: null }> = {
  "pub-0": { choice: "keep", alternative: null },
};

const termTotals = {
  autumn: WEEKLY_SLOTS[0].termTotals.autumn,
  spring: WEEKLY_SLOTS[0].termTotals.spring,
  summer: WEEKLY_SLOTS[0].termTotals.summer,
  annual: WEEKLY_SLOTS[0].termTotals.annual,
};

const fundingChoices = {
  billing_mode: "direct_payments",
  funding_code: "la_direct_payments",
  funding_label: "Using funds from LA (Direct Payments from your EHCP care package)",
  auto_continue: false,
  admin_fee_total: 0,
  admin_fee_reason: null,
  billing_schedule: "term_flexi",
  admin_fee_applies: false,
  enrolment_cadence: "term_by_term",
  invoice_type_code: "exempt",
  invoice_type_label: "EXEMPT VAT",
  advance_buffer_gbp: null,
  auto_continue_note:
    "We will ask you to confirm before each term. Invoices are created for the current term only.",
  payment_method_code: "bank_transfer",
  payment_method_label: "Bank Transfer / Card / Apple Pay (fixed due dates)",
  payment_schedule_code: "term_flexi",
  payment_schedule_label: "Per term — two instalments (flexi)",
  estimated_annual_total: termTotals.annual,
  enrolment_cadence_label: "Term by term — confirm before each term",
  estimated_total_with_admin_fee: null,
  advance_buffer_note: null,
  advance_buffer_lines: null,
  advance_buffer_sessions_per_service: null,
};

const payload = {
  source: "office",
  office_note:
    "Office 31 Aug 2026 — Agata keeps Erik Multi SwimFarm Sun 12.30–2 (option A). Recreate re-enrol after 11 Aug reset; Autumn flexi bank 2×£780. Soft hold cleared; place stays (settled via live invoice).",
  funding: {
    choices_2627: fundingChoices,
    current_2526: {
      funding: "Funded · Direct Payments",
      invoice_type: "Parent (Exempt invoice)",
      payment_method: "Bank Transfer",
      invoice_type_code: "exempt",
    },
  },
  choices: {
    weekly: weeklyChoices,
    day_centre: null,
    enrolment_cadence: "term_by_term",
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

const plan = buildReenrolmentInstalments({
  funding: payload.funding,
  termTotals,
  participantName: "Erik Ndregjoni",
  academicYear: REENROL_ACADEMIC_YEAR,
});

const productMap = await loadProductMap(admin);
const autumnLines = buildReenrolTermLineItems({
  slots: WEEKLY_SLOTS,
  weeklyChoices,
  term: "autumn",
  vatMode: "exempt",
  productMap,
});
const lineSum = round2(autumnLines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
const description = lineItemsToDescription(autumnLines, { fundedProvision: true });

console.log("Agata Ndregjoni · Erik Ndregjoni (176)");
console.log(
  `Keep: Sun 12.30–2 Multi SwimFarm · £${PRICE} × ${sessions.autumn} = £${termTotals.autumn}`,
);
console.log("Cadence: term_by_term · bank flexi · EXEMPT DP");
console.log("Plan skip:", plan.skipReason);
console.log("Hint:", plan.paymentMethodHint, "· vat:", plan.vatMode);
console.log("Lines £", lineSum, description.slice(0, 120) + "…");

const autumnOnly = (plan.termInvoices || []).filter((t) => t.term === "autumn");
if (!autumnOnly.length && !plan.skipReason) {
  console.log("No autumn invoice in plan");
}
for (const inv of autumnOnly) {
  const sched = (inv.paymentSchedule || []).map((r, i) => {
    const due = i === 0 ? DUE1 : r.due_date || DUE2;
    return { ...r, due_date: due };
  });
  if (sched[1] && !sched[1].due_date) sched[1].due_date = DUE2;
  console.log(
    `Invoice ${inv.label}: £${inv.amountGbp} due ${sched[0]?.due_date}`,
    sched.map((r) => `${r.label} £${r.amount_gbp} (${r.due_date})`).join(" · "),
  );
}

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write submission + invoice.");
  Deno.exit(0);
}

if (plan.skipReason || !autumnOnly.length) {
  throw new Error(`instalment plan failed: ${plan.skipReason || "empty autumn"}`);
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
  .select("invoice_number, payment_status")
  .eq("contact_id", CONTACT_ID)
  .eq("created_via", "reenrolment")
  .neq("payment_status", "void");
if (existingInv?.length) {
  throw new Error(
    `Already has reenrol invoices: ${existingInv.map((r) => r.invoice_number).join(", ")}`,
  );
}

const now = new Date().toISOString();
const { data: inserted, error: insErr } = await admin
  .from("portal_re_enrolment_submissions")
  .insert({
    academic_year: REENROL_ACADEMIC_YEAR,
    participant_contact_id: CONTACT_ID,
    participant_name: "Erik Ndregjoni",
    parent_first_name: "Agata",
    parent_last_name: "Ndregjoni",
    parent_person_id: PARENT_PERSON_ID,
    source: "link",
    payload,
    outstanding_amount: termTotals.autumn,
  })
  .select("id, submitted_at")
  .single();
if (insErr || !inserted) throw new Error(`submission insert: ${insErr?.message}`);
console.log("Submission", inserted.id, inserted.submitted_at);

await admin
  .from("portal_parent_contacts")
  .update({
    in_class: true,
    funding_label: fundingChoices.funding_label,
    payment_method_label: "Bank Transfer",
    updated_at: now,
  })
  .eq("contact_id", CONTACT_ID);
await admin
  .from("portal_participants")
  .update({ in_class: true, updated_at: now })
  .eq("contact_id", CONTACT_ID);

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

const autumn = autumnOnly[0];
const half1 = round2(Number(autumn.paymentSchedule?.[0]?.amount_gbp) || termTotals.autumn / 2);
const half2 = round2(termTotals.autumn - half1);
const paymentSchedule = [
  {
    seq: 1,
    label: "Autumn term · 1st half",
    status: "pending",
    paid_at: null,
    due_date: DUE1,
    paid_via: null,
    amount_gbp: half1,
  },
  {
    seq: 2,
    label: "Autumn term · 2nd half",
    status: "pending",
    paid_at: null,
    due_date: DUE2,
    paid_via: null,
    amount_gbp: half2,
  },
];

const created = await createPortalFamilyInvoice(admin, {
  contactId: CONTACT_ID,
  amountGbp: termTotals.autumn,
  dueDateIso: DUE1,
  vatMode: "exempt",
  lineDescription: description,
  reference: "Autumn term 26/27",
  notes:
    "Office re-enrolment 31 Aug 2026 · Agata keeps Erik Multi Sun 12.30–2 SwimFarm · bank flexi 2×£780 (EXEMPT DP).",
  title: "Invoice — Erik Ndregjoni · Autumn term 26/27",
  shareStatus: "ready",
  paymentMethodHint: "bank_transfer",
  createdVia: "reenrolment",
  ownerUserId: ownerId,
  readyBy: READY_BY,
  billingTerm: "autumn",
  paymentSchedule,
  lineItems: autumnLines,
});
if (!created.ok) throw new Error(`invoice: ${created.error}`);
const shareId = String(created.invoice?.id || "");
if (!shareId) throw new Error("invoice created but missing share id");
console.log("Invoice", created.invoiceNumber, `£${termTotals.autumn}`, shareId);

const holdClear = await clearPaymentHoldForContact(
  admin,
  CONTACT_ID,
  "office_reenrol_settled",
  OFFICE_USER,
);
console.log("Soft hold cleared", holdClear);

try {
  await xeroHydrateRefreshFromDb(admin);
  const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
  console.log("Xero push", pushed);
  await xeroPersistRefreshToDb(admin);
} catch (e) {
  console.warn("Xero push skipped/failed", e);
}

mkdirSync("database/local-vault/tmp", { recursive: true });
const report = {
  ok: true,
  contact_id: CONTACT_ID,
  submission_id: inserted.id,
  invoice_number: created.invoiceNumber,
  amount_gbp: termTotals.autumn,
  payment_schedule: paymentSchedule,
  hold_cleared: holdClear,
};
writeFileSync(
  "database/local-vault/tmp/office-reenroll-erik-agata-report.json",
  JSON.stringify(report, null, 2),
);
console.log("Report → database/local-vault/tmp/office-reenroll-erik-agata-report.json");
console.log("Done.");
