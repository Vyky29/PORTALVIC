/**
 * Tinashe NHS ILA (594072 / PO 910006639), Victor 15 Oct 2026:
 *  1. September 2026 top-up: INV-P-0179 was billed at the catalogue £187.50 x 3 = £562.50 (paid 9 Oct).
 *     Agreed rate £357.42 x 1.0203 = £364.68 -> 3 x £364.68 = £1,094.04. Top-up £531.54.
 *  2. Backdated 2026/27 Inflationary Uplift 2.03% from 1 Apr 2026 on her Friday invoices
 *     INV-0337 (Apr), INV-0374 (May), INV-0375 (Jun), INV-0376 (Jul). Same model as INV-0391 / INV-0392.
 *  New INV-Ps for NHS (hidden from the parent hub). No Xero push here.
 *
 *   npx -y deno run -A database/local-vault/office-tinashe-nhs-sep-topup-uplift-20261015.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-tinashe-nhs-sep-topup-uplift-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createPortalFamilyInvoice,
  regeneratePortalInvoiceSharePdf,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "gap-tinashe-icloud";
const OUT = "docs/finance/tinashe-nhs-2026-27";
const RATE = 357.42;
const UPLIFT = 0.0203;
const NEW_UNIT = 364.68;

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
  return Math.round(n * 100 + 1e-6) / 100;
}

const { data: ref, error: refErr } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, line_items, amount_gbp, amount_paid_gbp, payment_status")
  .eq("invoice_number", "INV-P-0179")
  .maybeSingle();
if (refErr) throw refErr;
const refLine = ((ref?.line_items || []) as PortalInvoiceLineItem[])[0];
if (!refLine) throw new Error("INV-P-0179 line missing");
console.log(`INV-P-0179: £${ref?.amount_gbp} paid £${ref?.amount_paid_gbp} ${ref?.payment_status} · key ${refLine.service_key} · ${refLine.description} · ${refLine.detail} · ${refLine.dates}`);

const topupDiff = round2(NEW_UNIT - Number(refLine.unit_price_gbp));
const topupLines: PortalInvoiceLineItem[] = [{
  ...refLine,
  description: `${refLine.description} · rate correction to £${NEW_UNIT} per session (INV-P-0179 billed £${Number(refLine.unit_price_gbp).toFixed(2)})`,
  quantity: 3,
  unit_price_gbp: topupDiff,
  amount_gbp: round2(3 * topupDiff),
}];
const topupTotal = topupLines[0].amount_gbp;

const ORIGINALS = [
  { inv: "INV-0337", dates: "17, 24 Apr 2026", sessions: 2 },
  { inv: "INV-0374", dates: "1, 8, 15, 22 May 2026", sessions: 4 },
  { inv: "INV-0375", dates: "5, 12, 19, 26 Jun 2026", sessions: 4 },
  { inv: "INV-0376", dates: "3, 10, 17 Jul 2026", sessions: 3 },
];
const upliftLines: PortalInvoiceLineItem[] = ORIGINALS.map((o) => {
  const original = round2(o.sessions * RATE);
  const amount = round2(original * UPLIFT);
  return {
    service_key: refLine.service_key,
    description: `Backdated 2026/27 Inflationary Uplift 2.03% on ${o.inv} (original GBP ${original.toFixed(2)}, ${o.sessions} x ${RATE})`,
    detail: refLine.detail,
    dates: `Dates: ${o.dates}`,
    quantity: 1,
    unit_price_gbp: amount,
    amount_gbp: amount,
    xero_item_code: null,
  };
});
const upliftTotal = round2(upliftLines.reduce((s, l) => s + l.amount_gbp, 0));

console.log(`\nTop-up September: 3 x £${topupDiff} = £${topupTotal}  (3 x £${NEW_UNIT} = £${round2(3 * NEW_UNIT)} less £${ref?.amount_gbp})`);
console.log(`Uplift Apr-Jul 2026: £${upliftTotal}`);
for (const l of upliftLines) console.log(`    £${l.amount_gbp}  ${l.description} · ${l.dates}`);

const { data: existing } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, notes")
  .eq("contact_id", CONTACT_ID)
  .neq("payment_status", "void");
const has = (marker: string) => (existing || []).find((r) => String(r.notes || "").includes(marker));

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner user id");
mkdirSync(OUT, { recursive: true });

async function make(opts: {
  marker: string;
  readyBy: string;
  reference: string;
  title: string;
  label: string;
  notes: string;
  lines: PortalInvoiceLineItem[];
  total: number;
}) {
  const prior = has(opts.marker);
  if (prior) {
    console.log("SKIP already", prior.invoice_number, opts.marker);
    return;
  }
  const created = await createPortalFamilyInvoice(admin, {
    contactId: CONTACT_ID,
    amountGbp: opts.total,
    dueDateIso: "2026-11-01",
    invoiceDateIso: "2026-10-15",
    vatMode: "exempt",
    lineDescription: lineItemsToDescription(opts.lines, { fundedProvision: true }),
    reference: opts.reference,
    service: "Bespoke · NHS ILA",
    notes: `${opts.readyBy} · ${opts.marker} · ${opts.notes}`,
    title: opts.title,
    shareStatus: "hidden",
    paymentMethodHint: "la_funded",
    createdVia: "portal",
    ownerUserId: ownerId,
    readyBy: opts.readyBy,
    billingTerm: "autumn",
    quantity: opts.lines.reduce((s, l) => s + Number(l.quantity), 0),
    paymentSchedule: [{
      seq: 1,
      label: opts.label,
      due_date: "2026-11-01",
      amount_gbp: opts.total,
      status: "pending",
      paid_at: null,
      paid_via: null,
    }],
    lineItems: opts.lines,
  });
  if (!created.ok) {
    console.error(created);
    Deno.exit(1);
  }
  const inv = String(created.invoiceNumber || "");
  const id = String(created.invoice?.id || "");
  const bytes = await regeneratePortalInvoiceSharePdf(admin, id, { mode: "bytes" });
  if (!bytes.ok || !("pdfBytes" in bytes)) throw new Error(`${inv} bytes`);
  writeFileSync(`${OUT}/${inv}.pdf`, bytes.pdfBytes);
  console.log("CREATED", inv, `£${opts.total.toFixed(2)}`, `${OUT}/${inv}.pdf`);
}

await make({
  marker: "tinashe_nhs_sep2026_rate_topup",
  readyBy: "office_funder_2627_nhs_month_2026-09_tinashe-nhs",
  reference: "September 2026",
  title: "Invoice — Tinashe Nekati · September 2026 rate correction",
  label: "September 2026 · NHS rate correction",
  notes: `INV-P-0179 billed 3 x £187.50 = £562.50 (catalogue). Agreed 3 x £${NEW_UNIT} (£${RATE} x 1.0203) = £${round2(3 * NEW_UNIT)}. Top-up £${topupTotal.toFixed(2)}.`,
  lines: topupLines,
  total: topupTotal,
});

await make({
  marker: "tinashe_nhs_uplift_2627_backdated_apr_jul",
  readyBy: "office_funder_2627_nhs_month_2026-10_tinashe-nhs",
  reference: "Backdated 2026/27 Inflationary Uplift 2.03%",
  title: "Invoice — Tinashe Nekati · 2026/27 uplift Apr-Jul 2026",
  label: "Backdated 2026/27 uplift · NHS invoice",
  notes: `2.03% from 1 Apr 2026 on INV-0337/0374/0375/0376 (£${RATE}/session). Total £${upliftTotal.toFixed(2)}.`,
  lines: upliftLines,
  total: upliftTotal,
});

console.log("\nDone. Not pushed to Xero.");
