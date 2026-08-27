/**
 * Linda Kaheh (338) · Catherine Rastgoow —
 * Switch bank flexi Autumn INV-P-0121 → whole-year auto re-enrol + GoCardless monthly_10.
 *
 * Correct invoice shape (GC rule): **one INV-P per term** with monthly rows in
 * `payment_schedule` (4/3/3). Extra monthly share rows are **hidden trackers**
 * so each GoCardless payment has its own share id; webhook rolls them into the
 * term keeper via "Consolidated payment tracker: <keeper_id>".
 *
 * If this was already applied as 10 visible monthly INV-Ps, fix with:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-linda-consolidate-gc-terms.ts
 *
 * Dry run:
 *   npx -y deno run -A database/local-vault/office-linda-gc-monthly-whole-year.ts
 * Apply:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-linda-gc-monthly-whole-year.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { buildReenrolmentInstalments } from "../../supabase/functions/_shared/reenrolment_auto_invoices.ts";
import {
  REENROL_ACADEMIC_YEAR,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import {
  gocardlessChargeDate,
  gocardlessCreatePayment,
  gocardlessConfigured,
} from "../../supabase/functions/_shared/gocardless.ts";
import { upsertMandateRow } from "../../supabase/functions/_shared/gocardless_portal.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "338";
const PARENT_PERSON_ID = "6986408";
const SUBMISSION_ID = "ee096d84-345d-433b-be3f-60781fac4f66";
const OLD_INVOICE = "INV-P-0121";
const MANDATE_ID = "MD0040WYTJ3CXM";
const CUSTOMER_ID = "CU005GYGPAD019";
const READY_BY = "office_linda_gc_monthly_whole_year_20260814";

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
loadEnv("local-secrets/edge-secrets.env");

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const WEEKLY_SLOTS: ParsedSlot[] = [
  {
    id: "pub-0",
    raw: "30' AQUATIC ACTIVITY (Tuesday)",
    serviceType: "AQUATIC ACTIVITY",
    durationMin: 30,
    day: "Tuesday",
    isWeekend: false,
    isDayCentre: false,
    pricePerSession: 50,
    sessions: { autumn: 14, spring: 11, summer: 13, annual: 38 },
    termTotals: { autumn: 700, spring: 550, summer: 650, annual: 1900 },
    timeSlot: "5 to 5.30",
    venue: null,
    instructor: null,
    displayLabel: "30' Aquatic Activity - 5 to 5.30 pm, Tuesdays",
  },
];

const weeklyChoices: Record<string, { choice: string; alternative: null }> = {
  "pub-0": { choice: "keep", alternative: null },
};

const termTotals = {
  autumn: 700,
  spring: 550,
  summer: 650,
  annual: 1900,
};

const fundingChoices = {
  billing_mode: "private",
  funding_code: "privately_funded",
  funding_label: "Privately",
  auto_continue: true,
  admin_fee_total: 0,
  admin_fee_reason: null,
  billing_schedule: "monthly",
  admin_fee_applies: false,
  enrolment_cadence: "whole_year",
  invoice_type_code: "vat_included",
  invoice_type_label: "Includes 20% VAT (in price)",
  advance_buffer_gbp: null,
  auto_continue_note:
    "We will treat this place as continuing each term with the same arrangement unless you tell us otherwise.",
  payment_method_code: "gocardless",
  payment_method_label: "GoCardless Direct Debit",
  payment_schedule_code: "monthly_10",
  payment_schedule_label: "Regular monthly — 10 payments (Sep–Jun)",
  estimated_annual_total: termTotals.annual,
  enrolment_cadence_label: "Whole year — confirm once; continue each term automatically",
  estimated_total_with_admin_fee: null,
  advance_buffer_note: null,
  advance_buffer_lines: null,
  advance_buffer_sessions_per_service: null,
};

const payload = {
  source: "office",
  office_note:
    "Office 14 Aug 2026: Catherine asked to switch to GoCardless monthly like summer; whole-year auto re-enrol. Voided bank flexi INV-P-0121.",
  funding: {
    choices_2627: fundingChoices,
    current_2526: {
      funding: "Private",
      invoice_type: "Parent (20% included invoice)",
      payment_method: "Go Cardless",
      invoice_type_code: "vat_included",
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

const plan = buildReenrolmentInstalments({
  funding: payload.funding,
  termTotals,
  participantName: "Linda Kaheh",
  academicYear: REENROL_ACADEMIC_YEAR,
});

console.log(APPLY ? "APPLY" : "DRY RUN");
console.log("Linda Kaheh (338) · Catherine Rastgoow");
console.log("Tue 5–5.30 Aquatic · £50 · annual £1900 → GC monthly_10 + whole_year auto");
console.log("Plan skip:", plan.skipReason, "· hint:", plan.paymentMethodHint, "· vat:", plan.vatMode);
console.log("Phrase:", plan.schedulePlanPhrase);
for (const inv of plan.termInvoices) {
  console.log(
    `  ${inv.label}: £${inv.amountGbp} due ${inv.dueDateIso} · ${inv.paymentSchedule.length} months`,
  );
  for (const row of inv.paymentSchedule) {
    console.log(`    - ${row.label} £${row.amount_gbp} (${row.due_date})`);
  }
}

const monthlyCharges = plan.termInvoices.flatMap((inv) =>
  inv.paymentSchedule.map((row) => ({
    term: inv.term,
    termLabel: inv.label,
    label: row.label,
    due_date: row.due_date!,
    amount_gbp: row.amount_gbp,
  })),
);
console.log("\nMonthly GC charges:", monthlyCharges.length);
console.log(
  "Total billed (incl £1.50/charge):",
  round2(monthlyCharges.reduce((s, c) => s + c.amount_gbp, 0)),
);

if (!APPLY) {
  console.log("\nRe-run with APPLY=1 to void bank INV, rewrite submission, mint monthly INV-Ps + GC.");
  Deno.exit(0);
}

if (plan.skipReason || !plan.termInvoices.length) {
  throw new Error(`plan failed: ${plan.skipReason || "empty"}`);
}
if (!gocardlessConfigured()) throw new Error("GOCARDLESS_ACCESS_TOKEN missing");

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");
const productMap = await loadProductMap(admin);

/* 1) Void old bank flexi */
{
  const { data: old, error } = await admin
    .from("portal_parent_invoice_share")
    .select("id, payment_status, amount_paid_gbp")
    .eq("invoice_number", OLD_INVOICE)
    .eq("contact_id", CONTACT_ID)
    .maybeSingle();
  if (error) throw error;
  if (!old) console.warn("old invoice missing", OLD_INVOICE);
  else if (Number(old.amount_paid_gbp) > 0) {
    throw new Error(`${OLD_INVOICE} has payments — refuse void`);
  } else if (String(old.payment_status).toLowerCase() !== "void") {
    const { error: vErr } = await admin
      .from("portal_parent_invoice_share")
      .update({
        payment_status: "void",
        share_status: "hidden",
        updated_at: new Date().toISOString(),
        notes:
          "Office 14 Aug 2026: voided — Catherine switched to GoCardless monthly whole-year (replaces bank flexi).",
      })
      .eq("id", old.id);
    if (vErr) throw vErr;
    console.log("VOIDED", OLD_INVOICE);
  }
}

/* 2) Update submission + contact + mandate link */
{
  const { error } = await admin
    .from("portal_re_enrolment_submissions")
    .update({ payload })
    .eq("id", SUBMISSION_ID);
  if (error) throw new Error(`submission: ${error.message}`);
  console.log("Submission updated", SUBMISSION_ID);
}

{
  const { error } = await admin
    .from("portal_parent_contacts")
    .update({
      funding_label: "Private",
      payment_method_label: "GoCardless · monthly (whole year auto)",
      updated_at: new Date().toISOString(),
    })
    .eq("contact_id", CONTACT_ID);
  if (error) throw new Error(`contact: ${error.message}`);
}

await upsertMandateRow(admin, {
  contact_id: CONTACT_ID,
  parent_person_id: PARENT_PERSON_ID,
  gocardless_customer_id: CUSTOMER_ID,
  gocardless_mandate_id: MANDATE_ID,
  mandate_status: "active",
});
console.log("Mandate linked", MANDATE_ID);

/* Guard: already consolidated / already has ready GC term invoices */
{
  const { data: existing } = await admin
    .from("portal_parent_invoice_share")
    .select("invoice_number, share_status, payment_status, billing_term")
    .eq("contact_id", CONTACT_ID)
    .eq("created_via", "reenrolment")
    .eq("payment_method_hint", "gocardless")
    .neq("payment_status", "void")
    .eq("share_status", "ready");
  if ((existing || []).length) {
    console.log(
      "Already has ready GC reenrol invoices — abort create. Use consolidate script if needed:",
      existing.map((r) => r.invoice_number).join(", "),
    );
    Deno.exit(0);
  }
}

const MARKER_PREFIX = "Consolidated payment tracker:";
function appendMarker(notes: unknown, targetId: string): string {
  const clean = String(notes || "")
    .replace(
      new RegExp(
        `\\n?${MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[0-9a-f-]+`,
        "ig",
      ),
      "",
    )
    .trim();
  return [clean, `${MARKER_PREFIX} ${targetId}`].filter(Boolean).join("\n\n").slice(0, 800);
}

/* 3) One visible INV-P per term + hidden monthly trackers for GC PMs */
type CreatedRow = {
  id: string;
  invoice_number: string;
  amount_gbp: number;
  due_date: string;
  term: string | null;
  label: string;
  role: "keeper" | "tracker";
  keeper_id?: string;
  gocardless_payment_id?: string;
};
const created: CreatedRow[] = [];

for (const inv of plan.termInvoices) {
  const termKey = inv.term as "autumn" | "spring" | "summer";
  const lineItems = buildReenrolTermLineItems({
    slots: WEEKLY_SLOTS,
    weeklyChoices,
    term: termKey,
    vatMode: plan.vatMode,
    productMap,
  });
  const lineDescription =
    lineItemsToDescription(lineItems, { fundedProvision: false }) +
    `\n\nDirect Payment (GoCardless) · ${inv.paymentSchedule.length} monthly instalments · £1.50 collection fee per charge.`;

  const keeperInv = await createPortalFamilyInvoice(admin, {
    contactId: CONTACT_ID,
    amountGbp: inv.amountGbp,
    dueDateIso: inv.dueDateIso,
    vatMode: plan.vatMode,
    lineDescription,
    reference: `${inv.label} 26/27`,
    notes:
      `Office 14 Aug 2026 · Linda GC monthly_10 whole-year auto · ${inv.label} · mandate ${MANDATE_ID}`,
    title: `Invoice — Linda Kaheh · ${inv.label}`,
    shareStatus: "ready",
    paymentMethodHint: "gocardless",
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: READY_BY,
    paymentSchedule: inv.paymentSchedule,
    billingTerm: inv.term,
    lineItems,
  });
  if (!keeperInv.ok) throw new Error(`keeper ${inv.label}: ${keeperInv.error}`);
  const keeperId = String(keeperInv.invoice?.id || "");
  const keeperNo = String(keeperInv.invoiceNumber || "");
  await admin
    .from("portal_parent_invoice_share")
    .update({ notes: appendMarker(keeperInv.invoice?.notes, keeperId) })
    .eq("id", keeperId);
  console.log("KEEPER", keeperNo, inv.label, `£${inv.amountGbp}`);

  for (let i = 0; i < inv.paymentSchedule.length; i++) {
    const row = inv.paymentSchedule[i];
    const isFirst = i === 0;
    if (isFirst) {
      created.push({
        id: keeperId,
        invoice_number: keeperNo,
        amount_gbp: row.amount_gbp,
        due_date: row.due_date!,
        term: inv.term,
        label: row.label,
        role: "keeper",
        keeper_id: keeperId,
      });
      continue;
    }
    const trackerInv = await createPortalFamilyInvoice(admin, {
      contactId: CONTACT_ID,
      amountGbp: row.amount_gbp,
      dueDateIso: row.due_date,
      vatMode: plan.vatMode,
      lineDescription: `${inv.label} · ${row.label} · GC tracker`,
      reference: `${inv.label} · ${row.label}`,
      notes: appendMarker(
        `Office 14 Aug 2026 · Linda GC monthly tracker · ${row.label}`,
        keeperId,
      ),
      title: `Tracker — Linda Kaheh · ${row.label}`,
      shareStatus: "hidden",
      paymentMethodHint: "gocardless",
      createdVia: "reenrolment",
      ownerUserId: ownerId,
      readyBy: READY_BY,
      paymentSchedule: [
        {
          seq: 1,
          label: row.label,
          due_date: row.due_date,
          amount_gbp: row.amount_gbp,
          status: "pending",
        },
      ],
      billingTerm: inv.term,
      lineItems: [],
    });
    if (!trackerInv.ok) throw new Error(`tracker ${row.label}: ${trackerInv.error}`);
    const tid = String(trackerInv.invoice?.id || "");
    created.push({
      id: tid,
      invoice_number: String(trackerInv.invoiceNumber || ""),
      amount_gbp: row.amount_gbp,
      due_date: row.due_date!,
      term: inv.term,
      label: row.label,
      role: "tracker",
      keeper_id: keeperId,
    });
    console.log("TRACKER", trackerInv.invoiceNumber, row.label, `£${row.amount_gbp}`);
  }
}

/* 4) Schedule GoCardless payments (1 PM per instalment row / tracker) */
for (const row of created) {
  const amountPence = Math.round(row.amount_gbp * 100);
  const pay = await gocardlessCreatePayment({
    mandateId: MANDATE_ID,
    amountPence,
    description: `clubSENsational ${row.invoice_number}`.slice(0, 100),
    chargeDate: gocardlessChargeDate(row.due_date),
    invoiceShareId: row.id,
    contactId: CONTACT_ID,
    invoiceNumber: row.invoice_number,
    idempotencyKey: `linda-gc-${row.id}`,
  });
  if (!pay.ok) {
    console.error("GC FAIL", row.invoice_number, pay.error, pay.detail);
    continue;
  }
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      gocardless_payment_id: pay.data.id,
      gocardless_mandate_id: MANDATE_ID,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (error) console.error("store PM", row.invoice_number, error.message);
  else {
    row.gocardless_payment_id = pay.data.id;
    console.log(
      "GC",
      row.role,
      row.invoice_number,
      pay.data.id,
      row.due_date,
      `£${row.amount_gbp}`,
    );
  }
}

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/linda-gc-monthly-whole-year.json",
  JSON.stringify(
    {
      contact_id: CONTACT_ID,
      voided: OLD_INVOICE,
      mandate: MANDATE_ID,
      cadence: "whole_year",
      schedule: "monthly_10",
      created,
    },
    null,
    2,
  ),
);
console.log("\nDone. Report → database/local-vault/tmp/linda-gc-monthly-whole-year.json");
