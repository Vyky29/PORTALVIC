/**
 * NHS tracker 15 Oct 2026 (Victor):
 *  - Joelle Atoui INV-P-0543 back to 3 sessions (Thu 10, 17, 24 Sept), £200 + cab £150, x 1.0203.
 *    NHS client id 474963 (PDF showed NWL406 = portal contact id).
 *  - Ibrahim Amir (contact 270): new NHS invoice, October block, Day Centre 11:00-13:00 2:1,
 *    1 session on Mon 5 Oct 2026, £350 x 1.0203. NHS client id 618898.
 *  Client IDs live on client_payments (sheet LA) keyed by the ready_by funder slug.
 *  No Xero push here.
 *
 *   npx -y deno run -A database/local-vault/office-nhs-joelle-3-ibrahim-oct5-20261015.ts
 *   APPLY=1 npx -y deno run -A database/local-vault/office-nhs-joelle-3-ibrahim-oct5-20261015.ts
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
const UPLIFT = 1.0203;
const PO = "XXPRASHERV1";

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

const SEEDS = [
  { key: "joelle-atoui", name: "Joelle Atoui", parent: "NHS/SBS · Afterschool (referral)", clientId: "474963" },
  { key: "ibrahim-amir", name: "Ibrahim Amir", parent: "NHS/SBS · Day Centre", clientId: "618898" },
];

/* ---------- Joelle ---------- */
const JOELLE_INV = "INV-P-0543";
const JOELLE_MARKER = "nhs_sep2026_joelle_3_sessions_15oct";
const joelleDates = "Calendar month · 1 Sep 2026 to 30 Sep 2026 · service from 10 Sep";
const joelleServiceUnit = round2(200 * UPLIFT);
const joelleCabUnit = round2(150 * UPLIFT);

/* ---------- Ibrahim ---------- */
const IBRAHIM_CONTACT = "270";
const IBRAHIM_READY_BY = "office_funder_2627_nhs_month_2026-10_ibrahim-amir";
const ibrahimUnit = round2(350 * UPLIFT);
const ibrahimLines: PortalInvoiceLineItem[] = [{
  service_key: "DAY_CENTRE_120",
  description: "Day Centre 2h (2:1)",
  detail: "Mon · SwimFarm · 11:00-13:00 · 2:1",
  dates: "5 Oct 2026 to 5 Oct 2026",
  quantity: 1,
  unit_price_gbp: ibrahimUnit,
  amount_gbp: ibrahimUnit,
  xero_item_code: null,
}];

console.log(`\nNHS Joelle 3 sessions + Ibrahim 5 Oct  (${APPLY ? "APPLY" : "DRY"})\n`);

const { data: existingSeeds, error: seedErr } = await admin
  .from("client_payments")
  .select("id, client_key, data")
  .eq("sheet", "LA")
  .in("client_key", SEEDS.map((s) => s.key));
if (seedErr) throw seedErr;
for (const s of SEEDS) {
  const row = (existingSeeds || []).find((r) => r.client_key === s.key);
  console.log(`seed ${s.key}: ${row ? "exists" : "insert"} · Client ID ${s.clientId} · PO ${PO}`);
}

const { data: joelle, error: jErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, notes, due_date, payment_status, amount_gbp, amount_paid_gbp, line_items")
  .eq("invoice_number", JOELLE_INV)
  .neq("payment_status", "void")
  .maybeSingle();
if (jErr) throw jErr;
if (!joelle?.id) throw new Error(`${JOELLE_INV} not found`);
const oldLines = (Array.isArray(joelle.line_items) ? joelle.line_items : []) as PortalInvoiceLineItem[];
const joelleLines: PortalInvoiceLineItem[] = oldLines.map((l) => {
  const cab = /CAB/i.test(String(l.service_key || ""));
  const unit = cab ? joelleCabUnit : joelleServiceUnit;
  return { ...l, dates: joelleDates, quantity: 3, unit_price_gbp: unit, amount_gbp: round2(3 * unit) };
});
const joelleTotal = round2(joelleLines.reduce((s, l) => s + l.amount_gbp, 0));
console.log(
  `${JOELLE_INV} Joelle: £${Number(joelle.amount_gbp).toFixed(2)} → £${joelleTotal.toFixed(2)} · ${joelle.payment_status}` +
    ` · paid £${Number(joelle.amount_paid_gbp || 0).toFixed(2)}`,
);
for (const l of joelleLines) console.log(`    ${l.service_key} ${l.quantity} x £${l.unit_price_gbp} = £${l.amount_gbp} · ${l.detail}`);
if (joelleLines.length !== 2 || Math.abs(joelleTotal - 1071.33) > 0.009) throw new Error("Joelle lines unexpected");

const { data: ibExisting, error: ibErr } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, amount_gbp, payment_status, ready_by")
  .eq("contact_id", IBRAHIM_CONTACT)
  .neq("payment_status", "void");
if (ibErr) throw ibErr;
const ibAlready = (ibExisting || []).find((r) => String(r.ready_by || "") === IBRAHIM_READY_BY);
console.log(`Ibrahim new: 1 x £${ibrahimUnit} = £${ibrahimUnit} · ${ibAlready ? `ALREADY ${ibAlready.invoice_number}` : "create"}`);

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1");
  Deno.exit(0);
}

for (const s of SEEDS) {
  const row = (existingSeeds || []).find((r) => r.client_key === s.key);
  const data = { ...((row?.data as Record<string, unknown>) || {}) };
  data["Client Id"] = s.clientId;
  data["Client ID"] = s.clientId;
  data.PO = PO;
  data.po = PO;
  data.Funding = "NHS";
  data.VAT = "Exempt";
  const { error } = row
    ? await admin.from("client_payments").update({ data }).eq("id", row.id)
    : await admin.from("client_payments").insert({
      sheet: "LA",
      client_key: s.key,
      client_name: s.name,
      parent_name: s.parent,
      data,
      source_file: "office-nhs-joelle-3-ibrahim-oct5-20261015",
    });
  if (error) throw error;
  console.log("seeded", s.key, s.clientId);
}

async function writePdf(shareId: string, out: string, inv: string) {
  const stored = await regeneratePortalInvoiceSharePdf(admin, shareId);
  if (!stored.ok) throw new Error(`${inv} pdf ${stored.error}`);
  const bytes = await regeneratePortalInvoiceSharePdf(admin, shareId, { mode: "bytes" });
  if (!bytes.ok || !("pdfBytes" in bytes)) throw new Error(`${inv} bytes`);
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/${inv}.pdf`, bytes.pdfBytes);
  console.log("WROTE", `${out}/${inv}.pdf`);
}

if (String(joelle.payment_status) === "paid" || Number(joelle.amount_paid_gbp || 0) > 0) {
  console.log("SKIP Joelle has payment");
} else {
  const notes = String(joelle.notes || "")
    .replace(/\s· nhs_4week_[\s\S]*$/, "")
    .replace(/\s· nhs_sep2026_joelle_3_sessions[\s\S]*$/, "") +
    ` · ${JOELLE_MARKER} · NHS client id 474963 · total £${joelleTotal.toFixed(2)}`;
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: joelleTotal,
      amount_paid_gbp: 0,
      quantity: 3,
      unit_price_gbp: round2(joelleTotal / 3),
      line_items: joelleLines,
      line_description: lineItemsToDescription(joelleLines, { fundedProvision: true }),
      reference_text: "September 2026",
      payment_schedule: [{
        seq: 1,
        label: "September 2026 · NHS invoice",
        due_date: String(joelle.due_date || "2026-10-01").slice(0, 10),
        amount_gbp: joelleTotal,
        status: "pending",
        paid_at: null,
        paid_via: null,
      }],
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", String(joelle.id));
  if (error) throw error;
  await writePdf(String(joelle.id), "docs/finance/nhs-sep-2026-released", JOELLE_INV);
}

if (ibAlready) {
  console.log("SKIP Ibrahim already", ibAlready.invoice_number);
} else {
  const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
  if (!ownerId) throw new Error("no invoice owner user id");
  const created = await createPortalFamilyInvoice(admin, {
    contactId: IBRAHIM_CONTACT,
    amountGbp: ibrahimUnit,
    dueDateIso: "2026-11-01",
    invoiceDateIso: "2026-10-01",
    vatMode: "exempt",
    lineDescription: lineItemsToDescription(ibrahimLines, { fundedProvision: true }),
    reference: "October 2026",
    service: "Day Centre · NHS",
    notes:
      `${IBRAHIM_READY_BY} · October 2026 NHS · Ibrahim Amir · Day Centre Mon 5 Oct 11:00-13:00 2:1 · ` +
      `1 x £350 x ${UPLIFT} · NHS client id 618898 · nhs_service_uplift_2.03pct_from_sep2026`,
    title: "Invoice — Ibrahim Amir · October 2026",
    shareStatus: "hidden",
    paymentMethodHint: "la_funded",
    createdVia: "portal",
    ownerUserId: ownerId,
    readyBy: IBRAHIM_READY_BY,
    billingTerm: "autumn",
    quantity: 1,
    paymentSchedule: [{
      seq: 1,
      label: "October 2026 · NHS invoice",
      due_date: "2026-11-01",
      amount_gbp: ibrahimUnit,
      status: "pending",
      paid_at: null,
      paid_via: null,
    }],
    lineItems: ibrahimLines,
  });
  if (!created.ok) {
    console.error(created);
    Deno.exit(1);
  }
  const inv = String(created.invoiceNumber || "");
  console.log("CREATED", inv, "£" + ibrahimUnit.toFixed(2));
  await writePdf(String(created.invoice?.id || ""), "docs/finance/nhs-oct-2026-4week", inv);
}

console.log("\nDone. Not pushed to Xero.");
