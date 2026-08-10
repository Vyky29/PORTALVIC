/**
 * Office: Yoan Bekele (46) · Hanna Belete — re-enrol Autumn 26/27 only.
 * Keep Sun 2.30–3.30 Aquatic · SwimFarm · £50/session EXEMPT (LA Direct Payments).
 * GoCardless · monthly_term (4 instalments Sep–Dec).
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-reenroll-yoan-autumn-gc-monthly.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net --allow-write \
 *     database/local-vault/office-reenroll-yoan-autumn-gc-monthly.ts
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
import { buildReenrolmentInstalments } from "../../supabase/functions/_shared/reenrolment_auto_invoices.ts";
import {
  REENROL_ACADEMIC_YEAR,
  SESSION_COUNTS,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";
import {
  readParentNotifySmtpConfig,
  sendEmailWithAttachmentViaSmtp,
} from "../../supabase/functions/_shared/portal_parent_messaging.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";
import { mkdirSync, writeFileSync } from "node:fs";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "46";
const PARENT_PERSON_ID = "5599567";
const READY_BY = "office_reenrol_yoan_autumn_gc_monthly_20260723";

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

const sessions = { ...SESSION_COUNTS.weekend };
const PRICE = 50;
const WEEKLY_SLOTS: ParsedSlot[] = [
  {
    id: "pub-0",
    raw: "60' AQUATIC ACTIVITY (Sunday)",
    serviceType: "AQUATIC ACTIVITY",
    durationMin: 60,
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
    timeSlot: "2.30 to 3.30",
    venue: "SwimFarm",
    instructor: "ROBERTO",
    displayLabel: "60' Aquatic Activity - 2.30 to 3.30 pm, Sundays (SwimFarm)",
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
  billing_schedule: "monthly",
  admin_fee_applies: false,
  enrolment_cadence: "term_by_term",
  invoice_type_code: "exempt",
  invoice_type_label: "EXEMPT VAT",
  advance_buffer_gbp: null,
  auto_continue_note: null,
  payment_method_code: "gocardless",
  payment_method_label: "GoCardless Direct Debit",
  payment_schedule_code: "monthly_term",
  payment_schedule_label: "Monthly during the term",
  estimated_annual_total: termTotals.annual,
  enrolment_cadence_label: "Term by term — confirm Autumn 26/27 now",
  estimated_total_with_admin_fee: null,
  advance_buffer_note: null,
  advance_buffer_lines: null,
  advance_buffer_sessions_per_service: null,
};

const payload = {
  source: "office",
  office_note:
    "Created by office 23 Jul 2026 — Hanna: Autumn term only, GoCardless monthly, EXEMPT (LA Direct Payments). Keep Sun 2.30–3.30 Aquatic SwimFarm.",
  funding: {
    choices_2627: fundingChoices,
    current_2526: {
      funding: "Funded · Direct Payments",
      invoice_type: "Parent (Exempt invoice)",
      payment_method: "4 - Go Cardless",
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
  participantName: "Yoan Bekele",
  academicYear: REENROL_ACADEMIC_YEAR,
});

console.log("Yoan Bekele (46) — Hanna Belete");
console.log(
  `Slot kept: Sun 2.30–3.30 Aquatic · SwimFarm · £${PRICE} × ${sessions.autumn} autumn = £${termTotals.autumn}`,
);
console.log("Cadence: term_by_term · monthly_term · GoCardless · EXEMPT DP");
console.log("Plan skip:", plan.skipReason);
console.log("Hint:", plan.paymentMethodHint, "· vat:", plan.vatMode);
for (const inv of plan.termInvoices) {
  console.log(
    `Invoice ${inv.label}: £${inv.amountGbp} due ${inv.dueDateIso}`,
    inv.paymentSchedule
      .map((r) => `${r.label} £${r.amount_gbp} (${r.due_date})`)
      .join(" · "),
  );
}

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to write + email.");
  Deno.exit(0);
}

if (plan.skipReason || !plan.termInvoices.length) {
  throw new Error(`instalment plan failed: ${plan.skipReason || "empty"}`);
}

const autumnOnly = plan.termInvoices.filter((t) => t.term === "autumn");
if (!autumnOnly.length) {
  throw new Error("expected autumn invoice only");
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
    participant_name: "Yoan Bekele",
    parent_first_name: "Hanna",
    parent_last_name: "Belete",
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
    payment_method_label: "GoCardless",
    updated_at: new Date().toISOString(),
  })
  .eq("contact_id", CONTACT_ID);

await admin
  .from("client_payments")
  .update({
    payment_status: "Re-enrolled · Autumn GC monthly",
    updated_at: new Date().toISOString(),
  })
  .eq("client_key", "yoan");

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

for (const inv of autumnOnly) {
  const lineItems = buildReenrolTermLineItems({
    slots: WEEKLY_SLOTS,
    weeklyChoices,
    term: "autumn",
    vatMode: plan.vatMode,
    productMap,
  });
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
    notes:
      "Office re-enrolment · Autumn term only · GoCardless monthly · EXEMPT DP · Sun Aquatic SwimFarm.",
    title: `Invoice — Yoan Bekele · ${inv.label}`,
    shareStatus: "ready",
    paymentMethodHint: plan.paymentMethodHint,
    createdVia: "reenrolment",
    ownerUserId: ownerId,
    readyBy: READY_BY,
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

const autumn = createdRows[0];
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
    const scheduleHtml = (autumnOnly[0]?.paymentSchedule || [])
      .map((r) => `${r.label}: £${Number(r.amount_gbp).toFixed(2)} (due ${r.due_date})`)
      .join("<br>");
    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(autumn.pdf_path, 60 * 60 * 24 * 14);
    const html = [
      `<p>Hi ${parentLabel},</p>`,
      `<p>Yoan is re-enrolled for <strong>Autumn term 2026/27</strong> on his Sunday Aquatic place at SwimFarm (2.30–3.30).</p>`,
      `<p>Billing is <strong>GoCardless monthly</strong>, <strong>EXEMPT VAT</strong> (LA Direct Payments).</p>`,
      `<p>Attached is <strong>${autumn.invoice_number}</strong> for <strong>£${Number(autumn.amount_gbp).toFixed(2)}</strong> (first due ${autumn.due_date}).</p>`,
      scheduleHtml ? `<p>Monthly schedule:<br>${scheduleHtml}</p>` : "",
      signed?.signedUrl ? `<p><a href="${signed.signedUrl}">View invoice PDF</a></p>` : "",
      `<p>Thanks,<br>clubSENsational</p>`,
    ]
      .filter(Boolean)
      .join("\n");

    const mail = await sendEmailWithAttachmentViaSmtp({
      config: smtp,
      to: [toEmail],
      subject: `Invoice ${autumn.invoice_number} — Yoan Bekele · Autumn term 26/27`,
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
  "database/local-vault/tmp/office-reenroll-yoan-report.json",
  JSON.stringify(
    {
      at: new Date().toISOString(),
      submission_id: inserted.id,
      invoices: createdRows,
      email: emailResult,
      schedule: autumnOnly[0]?.paymentSchedule || [],
    },
    null,
    2,
  ),
);

console.log("Done.");
