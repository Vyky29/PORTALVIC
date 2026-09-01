/**
 * Office: Aqsa Farooq (167) re-enrolment 2026/27 —
 * whole-year auto-continue, pay each term (term_3), EXEMPT Direct Payments.
 * Creates Autumn + Spring + Summer invoices; emails Autumn PDF to Farida.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-reenroll-aqsa-farooq-term3.ts
 * Apply + email:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-reenroll-aqsa-farooq-term3.ts
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
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import {
  buildReenrolmentInstalments,
} from "../../supabase/functions/_shared/reenrolment_auto_invoices.ts";
import { REENROL_ACADEMIC_YEAR, type ParsedSlot } from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import {
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";
import { writeFileSync, mkdirSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "167";
const PARENT_PERSON_ID = "5762887";

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

/** Current place: Thu 4.30–5.30 Aquatic · Acton · £100/session (workbook + rota). */
const WEEKLY_SLOTS: ParsedSlot[] = [
  {
    id: "pub-0",
    raw: "60' AQUATIC ACTIVITY (Thursday)",
    serviceType: "AQUATIC ACTIVITY",
    durationMin: 60,
    day: "Thursday",
    isWeekend: false,
    isDayCentre: false,
    pricePerSession: 100,
    sessions: { autumn: 14, spring: 11, summer: 13, annual: 38 },
    termTotals: { autumn: 1400, spring: 1100, summer: 1300, annual: 3800 },
    timeSlot: "4.30 to 5.30",
    venue: "Acton",
    instructor: "AURORA",
    displayLabel: "60' Aquatic Activity - 4.30 to 5.30 pm, Thursdays (Acton)",
  },
];

const weeklyChoices: Record<string, { choice: string; alternative: null }> = {
  "pub-0": { choice: "keep", alternative: null },
};

const annualTotal = 3800;
const termTotals = { autumn: 1400, spring: 1100, summer: 1300, annual: annualTotal };

const fundingChoices = {
  billing_mode: "direct_payments",
  funding_code: "la_direct_payments",
  funding_label: "Using funds from LA (Direct Payments from your EHCP care package)",
  auto_continue: true,
  admin_fee_total: 0,
  admin_fee_reason: null,
  billing_schedule: "term",
  admin_fee_applies: false,
  enrolment_cadence: "whole_year",
  invoice_type_code: "exempt",
  invoice_type_label: "EXEMPT VAT",
  advance_buffer_gbp: null,
  auto_continue_note:
    "We will treat this place as continuing each term with the same arrangement unless you tell us otherwise.",
  payment_method_code: "bank_transfer",
  payment_method_label: "Bank Transfer / Card / Apple Pay (fixed due dates)",
  payment_schedule_code: "term_3",
  payment_schedule_label: "Pay each term — one payment",
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
    "Created by office 22 Jul 2026 — Farida: auto re-enrol all year, one payment per term, EXEMPT (LA Direct Payments).",
  funding: {
    choices_2627: fundingChoices,
    current_2526: {
      funding: "Funded · Direct Payments",
      invoice_type: "Parent (Exempt invoice)",
      payment_method: "1 - Bank Transfer",
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
  participantName: "Aqsa Farooq",
  academicYear: REENROL_ACADEMIC_YEAR,
});

console.log("Aqsa Farooq (167) — Farida Farooq");
console.log("Slot kept: Thu 4.30–5.30 Aquatic · Acton · £100 × 38 = £3800/year");
console.log("Cadence: whole_year auto_continue · schedule term_3 · EXEMPT · bank");
console.log("Plan skip:", plan.skipReason);
console.log(
  "Term invoices:",
  plan.termInvoices.map((t) => `${t.label} £${t.amountGbp} due ${t.dueDateIso}`).join(" · "),
);

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write + email.");
  Deno.exit(0);
}

if (plan.skipReason || !plan.termInvoices.length) {
  throw new Error(`instalment plan failed: ${plan.skipReason || "empty"}`);
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
    participant_name: "Aqsa Farooq",
    parent_first_name: "Farida",
    parent_last_name: "Farooq",
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
    funding_label: "Using Funds from LA · Direct Payments",
    payment_method_label: "Bank Transfer",
    updated_at: new Date().toISOString(),
  })
  .eq("contact_id", CONTACT_ID);

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner");

const productMap = await loadProductMap(admin);
const createdRows: Array<{
  id: string;
  invoice_number: string;
  term: string | null;
  amount_gbp: number;
  due_date: string | null;
  pdf_path: string;
}> = [];

for (const inv of plan.termInvoices) {
  const lineItems =
    inv.term && !inv.isAdminFee
      ? buildReenrolTermLineItems({
        slots: WEEKLY_SLOTS,
        weeklyChoices,
        term: inv.term,
        vatMode: plan.vatMode,
        productMap,
      })
      : [];
  const lineDescription = lineItems.length
    ? lineItemsToDescription(lineItems, { fundedProvision: true })
    : inv.lineDescription || inv.label;

  const created = await createPortalFamilyInvoice(admin, {
    contactId: CONTACT_ID,
    amountGbp: inv.amountGbp,
    dueDateIso: inv.dueDateIso,
    vatMode: plan.vatMode,
    lineDescription,
    reference: inv.reference || inv.label,
    notes: "Office re-enrolment · auto-continue whole year · pay each term · EXEMPT DP.",
    title: `Invoice — Aqsa Farooq · ${inv.label}`,
    shareStatus: "ready",
    paymentMethodHint: plan.paymentMethodHint,
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: "office_reenrol_aqsa_farooq",
    paymentSchedule: inv.paymentSchedule,
    billingTerm: inv.term,
    lineItems,
  });
  if (!created.ok) throw new Error(`invoice ${inv.label}: ${created.error}`);
  const shareId = String(created.invoice?.id || "");
  createdRows.push({
    id: shareId,
    invoice_number: created.invoiceNumber,
    term: inv.term,
    amount_gbp: inv.amountGbp,
    due_date: inv.dueDateIso,
    pdf_path: created.pdfStoragePath,
  });
  console.log(
    "Invoice",
    created.invoiceNumber,
    inv.label,
    `£${inv.amountGbp}`,
    "due",
    inv.dueDateIso,
  );
}

await xeroHydrateRefreshFromDb(admin);
for (const row of createdRows) {
  if (!row.id) continue;
  const pushed = await pushPortalInvoiceShareToXero(admin, row.id);
  console.log("Xero", row.invoice_number, pushed.ok ? "ok" : pushed.error);
}
await xeroPersistRefreshToDb(admin);

const autumn = createdRows.find((r) => r.term === "autumn") || createdRows[0];
let emailResult: { ok: boolean; error?: string; to?: string } = { ok: false, error: "not_attempted" };

const smtp = readParentNotifySmtpConfig();
const { data: parentRow } = await admin
  .from("portal_parent_contacts")
  .select("email, parent_display, parent_first_name")
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();
const toEmail = String(parentRow?.email || "").trim();

if (!smtp) {
  emailResult = { ok: false, error: "smtp_not_configured" };
} else if (!toEmail) {
  emailResult = { ok: false, error: "no_email" };
} else if (!autumn?.pdf_path) {
  emailResult = { ok: false, error: "no_pdf" };
} else {
  const { data: pdfBlob, error: dlErr } = await admin.storage
    .from("documents")
    .download(autumn.pdf_path);
  if (dlErr || !pdfBlob) {
    emailResult = { ok: false, error: `pdf_download:${dlErr?.message || "empty"}` };
  } else {
    const buf = new Uint8Array(await pdfBlob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const contentBase64 = btoa(binary);
    const parentLabel =
      String(parentRow?.parent_first_name || "").trim() ||
      String(parentRow?.parent_display || "").trim() ||
      "there";
    const others = createdRows
      .filter((r) => r.invoice_number !== autumn.invoice_number)
      .map((r) => `${r.invoice_number} · ${r.term} · £${r.amount_gbp} (due ${r.due_date})`)
      .join("<br>");
    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(autumn.pdf_path, 60 * 60 * 24 * 14);
    const html = [
      `<p>Hi ${parentLabel},</p>`,
      `<p>Aqsa is re-enrolled for the full academic year 2026/27 (auto-continue each term) on her Thursday Aquatic place at Acton (4.30–5.30).</p>`,
      `<p>Billing is <strong>one payment per term</strong>, <strong>EXEMPT VAT</strong> (LA Direct Payments).</p>`,
      `<p>Attached is <strong>${autumn.invoice_number}</strong> for <strong>Autumn term — £${Number(autumn.amount_gbp).toFixed(2)}</strong> (due ${autumn.due_date}).</p>`,
      others
        ? `<p>Later term invoices (also in your Family Portal):<br>${others}</p>`
        : "",
      signed?.signedUrl
        ? `<p><a href="${signed.signedUrl}">View Autumn invoice PDF</a></p>`
        : "",
      `<p>Please use bank reference: <strong>Aqsa Farooq</strong></p>`,
      `<p>Thanks,<br>clubSENsational</p>`,
    ]
      .filter(Boolean)
      .join("\n");

    const mail = await sendEmailWithAttachmentViaSmtp({
      config: smtp,
      to: [toEmail],
      subject: `Invoice ${autumn.invoice_number} — Aqsa Farooq · Autumn term 26/27`,
      html,
      attachment: {
        filename: `${autumn.invoice_number}.pdf`,
        contentBase64,
        mimeType: "application/pdf",
      },
    });
    emailResult = { ok: !!mail.ok, error: mail.ok ? undefined : mail.error, to: toEmail };
  }
}

console.log("Email", emailResult);

mkdirSync("database/local-vault/tmp", { recursive: true });
writeFileSync(
  "database/local-vault/tmp/office-reenroll-aqsa-farooq-report.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      submission_id: inserted.id,
      invoices: createdRows,
      email: emailResult,
    },
    null,
    2,
  ),
);

console.log("Done.");
