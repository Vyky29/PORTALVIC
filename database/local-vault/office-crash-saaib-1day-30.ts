/**
 * Office: Saaib Abdullah crash income · 1 day · 2× Aquatic 30' @ £50 = £100.
 * Afterschool & Weekends · Summer 25/26.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-crash-saaib-1day-30.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-crash-saaib-1day-30.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  loadProductMap,
  xeroItemCodeForService,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import { pushPortalInvoiceShareToXero } from "../../supabase/functions/_shared/portal_xero_invoice_push.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "../../supabase/functions/_shared/xero_oauth_store.ts";
import type { PortalInvoiceVatMode } from "../../supabase/functions/_shared/portal_tax_invoice_pdf.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const DUE = "2026-07-24";
const READY_BY = "office_crash_saaib_1day_30";
const CONTACT_ID = "gap-saaib-abdullah";

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

const job = {
  contactId: CONTACT_ID,
  child: "Saaib Abdullah",
  parent: "Ahmed Begum",
  vatMode: "exempt" as PortalInvoiceVatMode,
  paymentMethodHint: "la_funded" as const,
  fundedProvision: true,
  notes:
    "Office crash course · Aquatic 30' · 1 day · 2× sessions @ £50 · Summer crash Jul 2026 · Afterschool & Weekends.",
  lines: [
    {
      service_key: "AQUATIC_30",
      description: "Aquatic Activity 30' (1to1)",
      detail: "Summer crash course Jul 2026 — 1 day (2× 30')",
      dates: "Aquatic · 30 minutes ×2",
      quantity: 2,
      unit_price_gbp: 50,
    },
  ],
};

const productMap = await loadProductMap(admin);

const lineItems: PortalInvoiceLineItem[] = job.lines.map((l) => {
  const amount = round2(l.quantity * l.unit_price_gbp);
  const mapRow = productMap.get(l.service_key);
  return {
    service_key: l.service_key,
    description: l.description,
    detail: l.detail,
    dates: l.dates,
    quantity: l.quantity,
    unit_price_gbp: l.unit_price_gbp,
    amount_gbp: amount,
    xero_item_code: xeroItemCodeForService(mapRow, job.vatMode),
  };
});

const amount = round2(lineItems.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
const description = lineItemsToDescription(lineItems, {
  fundedProvision: job.fundedProvision,
});

console.log(`\n${job.parent} → ${job.child} (${job.contactId})`);
console.log(`  Total £${amount.toFixed(2)} · ${job.vatMode} · due ${DUE}`);
for (const l of lineItems) {
  console.log(
    `  · ${l.description} ×${l.quantity} @ £${l.unit_price_gbp} = £${l.amount_gbp} (${l.dates})`,
  );
}

if (!APPLY) {
  console.log("\nDry run only — re-run with APPLY=1 to create invoice + Xero push.");
  Deno.exit(0);
}

const { data: existing } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, amount_gbp, payment_status")
  .eq("contact_id", CONTACT_ID)
  .eq("ready_by", READY_BY)
  .neq("payment_status", "void");
if (existing?.length) {
  console.log(
    "\nSKIP already created:",
    existing.map((r) => `${r.invoice_number} £${r.amount_gbp}`).join(", "),
  );
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no invoice owner user id");

await xeroHydrateRefreshFromDb(admin);

const created = await createPortalFamilyInvoice(admin, {
  contactId: job.contactId,
  amountGbp: amount,
  dueDateIso: DUE,
  vatMode: job.vatMode,
  lineDescription: description,
  reference: "Summer crash course Jul 2026",
  service: "Crash course · Aquatic 30'",
  notes: job.notes,
  title: `Invoice — ${job.child} · Summer crash course Jul 2026`,
  shareStatus: "ready",
  paymentMethodHint: job.paymentMethodHint,
  createdVia: "portal",
  ownerUserId: ownerId,
  readyBy: READY_BY,
  billingTerm: null,
  paymentSchedule: [
    {
      seq: 1,
      label: "Crash course · one payment",
      due_date: DUE,
      amount_gbp: amount,
      status: "pending",
      paid_at: null,
      paid_via: null,
    },
  ],
  lineItems,
});
if (!created.ok) throw new Error(created.error);
const shareId = String(created.invoice?.id || "");
console.log(`\nCREATED ${created.invoiceNumber} · ${job.child} · £${amount.toFixed(2)} · ${shareId}`);

if (shareId) {
  const pushed = await pushPortalInvoiceShareToXero(admin, shareId);
  console.log("  Xero push", pushed);
}

await xeroPersistRefreshToDb(admin);
console.log("\nDone.");
