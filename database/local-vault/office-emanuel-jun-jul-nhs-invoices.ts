/**
 * Emanuel Dodson (gap-emanuel-dodson) · NHS/SBS Day Centre
 * Start: Fri 12 Jun 2026 · Mon/Wed/Fri 11:00–16:00 · 1:1 @ £500/session
 *
 * Pro-rata from start date (not full June):
 *   June 2026: 8 × £500 = £4,000
 *   July 2026: 14 × £500 = £7,000
 *   Total due: £11,000
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-emanuel-jun-jul-nhs-invoices.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-emanuel-jun-jul-nhs-invoices.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "gap-emanuel-dodson";
const CHILD = "Emanuel Dodson";
const RATE = 500;
const READY_BY = "office_emanuel_jun_jul_nhs_20260722";
const NHS_NUMBER = "6015644125";

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

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Mon / Wed / Fri session dates inclusive (UTC noon to avoid DST edge). */
function mwfDates(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  for (
    let d = new Date(`${startIso}T12:00:00Z`);
    d <= new Date(`${endIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const wd = d.getUTCDay();
    if (wd === 1 || wd === 3 || wd === 5) out.push(ymd(d));
  }
  return out;
}

function fmtList(dates: string[]): string {
  return dates
    .map((iso) => {
      const d = new Date(`${iso}T12:00:00Z`);
      return d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    })
    .join("; ");
}

const juneDates = mwfDates("2026-06-12", "2026-06-30");
const julyDates = mwfDates("2026-07-01", "2026-07-31");
const juneAmt = juneDates.length * RATE;
const julyAmt = julyDates.length * RATE;
const totalAmt = juneAmt + julyAmt;

type MonthPlan = {
  key: "june" | "july";
  label: string;
  dates: string[];
  amount: number;
  invoiceDate: string;
  dueDate: string;
  marker: string;
};

const months: MonthPlan[] = [
  {
    key: "june",
    label: "June 2026",
    dates: juneDates,
    amount: juneAmt,
    invoiceDate: "2026-06-30",
    dueDate: "2026-07-14",
    marker: `${READY_BY}_june`,
  },
  {
    key: "july",
    label: "July 2026",
    dates: julyDates,
    amount: julyAmt,
    invoiceDate: "2026-07-31",
    dueDate: "2026-08-14",
    marker: `${READY_BY}_july`,
  },
];

console.log(`\n${CHILD} (${CONTACT_ID}) · NHS/SBS Day Centre 1:1`);
console.log(`Start 12 Jun 2026 · Mon/Wed/Fri 11:00–16:00 · £${RATE}/session`);
console.log(
  `June: ${juneDates.length} sess × £${RATE} = £${juneAmt.toLocaleString("en-GB")}`,
);
console.log(`  ${fmtList(juneDates)}`);
console.log(
  `July: ${julyDates.length} sess × £${RATE} = £${julyAmt.toLocaleString("en-GB")}`,
);
console.log(`  ${fmtList(julyDates)}`);
console.log(`TOTAL DUE: £${totalAmt.toLocaleString("en-GB")}`);
console.log(
  `(Ledger was £13,500 = full Jun 13 + Jul 14; correct from 12 Jun is £11,000)`,
);

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to create invoices + update ledger.");
  Deno.exit(0);
}

/* Ensure funding label so bill-to resolves to NHS · SBS (not parent). */
await admin
  .from("portal_parent_contacts")
  .update({ funding_label: "NHS · SBS", updated_at: new Date().toISOString() })
  .eq("contact_id", CONTACT_ID);

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner user id");

await xeroHydrateRefreshFromDb(admin);

const createdNums: Record<string, string> = {};

for (const m of months) {
  const { data: existing } = await admin
    .from("portal_parent_invoice_share")
    .select("id, invoice_number, amount_gbp, payment_status")
    .eq("contact_id", CONTACT_ID)
    .eq("ready_by", m.marker)
    .neq("payment_status", "void");
  if (existing?.length) {
    const inv = String(existing[0].invoice_number);
    createdNums[m.key] = inv;
    console.log(`\nSKIP ${m.label}: already ${inv} £${existing[0].amount_gbp}`);
    continue;
  }

  const lineItems: PortalInvoiceLineItem[] = [
    {
      service_key: "DAY_CENTRE_300",
      description: "Day Centre 5h (1:1) · Mon/Wed/Fri 11:00–16:00",
      detail: `${m.label} — from service start 12 Jun 2026 · SwimFarm Hub`,
      dates: fmtList(m.dates),
      quantity: m.dates.length,
      unit_price_gbp: RATE,
      amount_gbp: m.amount,
      xero_item_code: null,
    },
  ];
  const description = lineItemsToDescription(lineItems, { fundedProvision: true });

  const created = await createPortalFamilyInvoice(admin, {
    contactId: CONTACT_ID,
    amountGbp: m.amount,
    dueDateIso: m.dueDate,
    invoiceDateIso: m.invoiceDate,
    vatMode: "exempt",
    lineDescription: description,
    reference: `Day Centre · ${m.label}`,
    service: "Day Centre · NHS/SBS",
    notes:
      `Office NHS invoice · Emanuel Dodson · ${m.label} · ` +
      `${m.dates.length}× Day Centre 5h @ £${RATE} = £${m.amount} · ` +
      `Start 12 Jun 2026 · M/W/F 11–4 · NHS no. ${NHS_NUMBER} · ${m.marker}`,
    title: `Invoice — ${CHILD} · Day Centre · ${m.label}`,
    shareStatus: "ready",
    paymentMethodHint: "la_funded",
    createdVia: "portal",
    ownerUserId: ownerId,
    readyBy: m.marker,
    billingTerm: null,
    clientIdLabel: NHS_NUMBER,
    poLabel: "—",
    quantity: m.dates.length,
    paymentSchedule: [
      {
        seq: 1,
        label: `${m.label} · NHS invoice`,
        due_date: m.dueDate,
        amount_gbp: m.amount,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ],
    lineItems,
  });
  if (!created.ok) throw new Error(`${m.label}: ${created.error}`);
  const shareId = String(created.invoice?.id || "");
  createdNums[m.key] = created.invoiceNumber;
  console.log(
    `\nCREATED ${created.invoiceNumber} · ${m.label} · £${m.amount.toFixed(2)} · ${shareId}`,
  );

  if (shareId) {
    const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
    console.log("  Xero push", pushed);
  }
}

const invJune = createdNums.june || "—";
const invJuly = createdNums.july || "—";
const invoiceLabel = `${invJune} (Jun) · ${invJuly} (Jul)`;

const { data: payRow, error: payErr } = await admin
  .from("client_payments")
  .select("id, amount, data")
  .eq("client_key", "emanuel")
  .ilike("data->>Term", "%summer%")
  .maybeSingle();
if (payErr) throw payErr;
if (!payRow?.id) throw new Error("client_payments row for emanuel summer not found");

const prev = (payRow.data && typeof payRow.data === "object"
  ? payRow.data
  : {}) as Record<string, unknown>;

const data = {
  ...prev,
  Services:
    "300' Day Centre, Monday - 11 am to 4 pm\n300' Day Centre, Wednesday - 11 am to 4 pm\n300' Day Centre, Friday - 11 am to 4 pm",
  Paid: "Funded by NHS",
  "Invoice type": "NHS (Exempt invoice)",
  Funding: "NHS · SBS",
  Funder: "NHS · SBS",
  "Funding origin": "NHS-funded",
  Payer: "Local authority / NHS (pays direct)",
  "Payment method": "NHS invoice (PO)",
  Term: "Summer term 2026",
  Cost: "£500 / session (1:1)",
  Sessions: `Mon/Wed/Fri · 11–4 · 8 sess Jun (from 12 Jun) + 14 sess Jul = 22`,
  Weekly: "£1,500 (3 × £500)",
  VAT: "Exempt",
  Invoice: invoiceLabel,
  "Payment status": "Outstanding",
  "June invoice (25/26)": juneAmt,
  "July invoice (25/26)": julyAmt,
  "June invoice no": invJune,
  "July invoice no": invJuly,
  "Summer basis": `Jun £${juneAmt.toLocaleString("en-GB")} (${juneDates.length}×£${RATE} from 12 Jun) + Jul £${julyAmt.toLocaleString("en-GB")} (${julyDates.length}×£${RATE}) = £${totalAmt.toLocaleString("en-GB")}`,
  "NHS due months": `Jun £${juneAmt.toLocaleString("en-GB")} + Jul £${julyAmt.toLocaleString("en-GB")} (from 12 Jun start)`,
  "Year billed (25/26)": `£${totalAmt.toLocaleString("en-GB")}`,
  "Year received (25/26)": "£0",
  "Year outstanding": `£${totalAmt.toLocaleString("en-GB")}`,
  Next:
    `Summer 25/26 NHS: £${totalAmt.toLocaleString("en-GB")} · ${invoiceLabel} · start 12 Jun · M/W/F 11–4 @ £500`,
  "Client Id": NHS_NUMBER,
};

const { error: upErr } = await admin
  .from("client_payments")
  .update({
    amount: totalAmt,
    client_name: "Emanuel Dodson",
    parent_name: "NHS/SBS · Day Centre",
    payment_status: "Outstanding",
    data,
  })
  .eq("id", payRow.id);
if (upErr) throw upErr;

console.log(`\nLedger updated: £${totalAmt} · Invoice ${invoiceLabel}`);

await xeroPersistRefreshToDb(admin);
console.log("\nDone.");
