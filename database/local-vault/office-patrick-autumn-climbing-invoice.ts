/**
 * Create missing Autumn INV-P for Patrick (Sunday Climbing 12–1 · Alex · Westway)
 * after Assign skipped billing because unpaid crash INV-P-CRASH was treated as existing.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-patrick-autumn-climbing-invoice.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-patrick-autumn-climbing-invoice.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync } from "node:fs";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { quoteNewClientMidTermInvoice } from "../../supabase/functions/_shared/booking_portal_term_invoices.ts";
import { loadProductMap } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const CONTACT_ID = "7559001";
const CLIENT_NAME = "Patrick Dhennin";
const DAY = "Sunday";
const TIME = "12.00 – 1.00";
const VENUE = "Westway";
const INSTRUCTORS = "Alex";
const SERVICE = "Climbing Activity";
const UNIT = 75;
const ANCHOR = "2026-08-11";
const PLAN = "flexi_bank" as const;

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  const text = readFileSync("local-secrets/secrets.env", "utf8");
  const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: existing } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, payment_status, billing_term, amount_gbp, notes")
  .eq("contact_id", CONTACT_ID)
  .order("created_at", { ascending: false });

console.log("existing invoices", existing);

const alreadyAutumn = (existing || []).find((r) => {
  const inv = String(r.invoice_number || "").toUpperCase();
  if (inv.includes("CRASH")) return false;
  const st = String(r.payment_status || "").toLowerCase();
  if (st === "void" || st === "cancelled") return false;
  return String(r.billing_term || "").toLowerCase() === "autumn";
});
if (alreadyAutumn) {
  console.log("ABORT: autumn invoice already exists", alreadyAutumn);
  Deno.exit(0);
}

let productMap = null;
try {
  productMap = await loadProductMap(admin);
} catch {
  productMap = null;
}

const detail = [DAY, TIME, VENUE, INSTRUCTORS].join(" · ");
const quote = quoteNewClientMidTermInvoice({
  term: "autumn",
  day: DAY,
  unitPriceGbp: UNIT,
  plan: PLAN,
  asOfIso: ANCHOR,
  serviceKey: "CLIMBING",
  serviceLabel: SERVICE,
  detail,
  vatMode: "vat_20",
  productMap,
});
if ("error" in quote) {
  console.error("quote error", quote.error);
  Deno.exit(1);
}

console.log({
  sessions: quote.remainingSessions,
  total: quote.invoiceTotalGbp,
  schedule: quote.paymentSchedule,
  plan: PLAN,
  apply: APPLY,
});

if (!APPLY) {
  console.log("Dry run only. Re-run with APPLY=1 to create.");
  Deno.exit(0);
}

const ownerId = await resolvePortalInvoiceOwnerUserId(admin);
if (!ownerId) throw new Error("no_invoice_owner");

const created = await createPortalFamilyInvoice(admin, {
  contactId: CONTACT_ID,
  amountGbp: quote.invoiceTotalGbp,
  dueDateIso: quote.paymentSchedule[0]?.due_date || ANCHOR,
  invoiceDateIso: ANCHOR,
  vatMode: "vat_20",
  lineDescription: quote.lineDescription,
  reference: quote.reference,
  service: SERVICE,
  notes:
    `Office Assign repair · Edit term slot · ${detail} · ${PLAN} · ${quote.remainingSessions} session(s) from ${ANCHOR} · crash INV excluded`,
  title: `Invoice — ${CLIENT_NAME} · autumn`,
  quantity: quote.remainingSessions,
  shareStatus: "ready",
  paymentMethodHint: quote.paymentMethodHint,
  createdVia: "portal",
  ownerUserId: ownerId,
  readyBy: "office_term_slot_assign_repair",
  clientIdLabel: CONTACT_ID,
  paymentSchedule: quote.paymentSchedule,
  billingTerm: quote.term,
  lineItems: quote.lineItems,
  descriptionComplete: false,
});

if (!created.ok) {
  console.error(created);
  Deno.exit(1);
}

console.log("CREATED", {
  invoice_number: created.invoiceNumber,
  id: created.invoice?.id,
  amount: quote.invoiceTotalGbp,
  sessions: quote.remainingSessions,
});
