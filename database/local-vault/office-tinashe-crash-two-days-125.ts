/**
 * Office — Tinashe Nekati summer crash course: 2 days, not 3.
 *
 * The family crash invoice (INV-P-0119) was raised for 3 days at GBP 62.50 =
 * GBP 187.50. Only 2 days were taken, so the total is GBP 125.00.
 *
 * Tinashe's term place is LA (Ealing Mon/Wed) + NHS (Fri), invoiced by the office to
 * the funder. This crash course is the one thing the family pays, so it is the row
 * behind the red Invoices shortcut in the parent hub.
 *
 * Dry run (prints the share, its line items and the dates line):
 *   npx -y deno run -A database/local-vault/office-tinashe-crash-two-days-125.ts
 *
 * Apply (the two attended days are already the default):
 *   APPLY=1 npx -y deno run -A database/local-vault/office-tinashe-crash-two-days-125.ts
 *
 * Overrides: INVOICE (default INV-P-0119), QUANTITY (2), TARGET_TOTAL (125),
 * KEEP_DATES (default 2026-07-27,2026-07-29).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, readFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { formatGroupedSessionDates } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE = (Deno.env.get("INVOICE") || "INV-P-0119").trim();
const QUANTITY = Number(Deno.env.get("QUANTITY") || "2");
const TARGET_TOTAL = Number(Deno.env.get("TARGET_TOTAL") || "125");
/** Days actually attended, confirmed by the office: Mon 27 + Wed 29 July 2026. */
const KEEP_DATES = (Deno.env.get("KEEP_DATES") || "2026-07-27,2026-07-29").trim();

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

const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!serviceKey) {
  console.error(
    "No SUPABASE_SERVICE_ROLE_KEY. Run this where local-secrets/secrets.env exists.",
  );
  Deno.exit(1);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  serviceKey,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type LineItem = {
  service_key?: string;
  description?: string;
  detail?: string | null;
  dates?: string | null;
  quantity?: number;
  unit_price_gbp?: number;
  amount_gbp?: number;
  xero_item_code?: string | null;
};

console.log(APPLY ? "APPLY" : "DRY RUN");

const { data: share, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, document_id, contact_id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_method_hint, payment_schedule, line_items, line_description, reference_text, due_date, notes",
  )
  .eq("invoice_number", INVOICE)
  .maybeSingle();
if (error) throw new Error(error.message);
if (!share) throw new Error(`${INVOICE} not found`);

const lineItems: LineItem[] = Array.isArray(share.line_items)
  ? (share.line_items as LineItem[])
  : [];

console.log("\nBEFORE", {
  id: share.id,
  contact_id: share.contact_id,
  invoice_number: share.invoice_number,
  payment_status: share.payment_status,
  amount_gbp: share.amount_gbp,
  amount_paid_gbp: share.amount_paid_gbp,
  due_date: share.due_date,
});
console.log("line_items", JSON.stringify(lineItems, null, 2));
console.log("line_description", share.line_description);
console.log("payment_schedule", JSON.stringify(share.payment_schedule));

if (Number(share.amount_paid_gbp) > 0) {
  throw new Error(
    `${INVOICE} already has GBP ${share.amount_paid_gbp} paid — reprice by hand so the ` +
      `payment is not lost.`,
  );
}

if (!lineItems.length) {
  console.error(
    "\nNo line_items on this share. The PDF falls back to line_description, so the " +
      "day count has to be edited there by hand. Nothing written.",
  );
  Deno.exit(1);
}
if (lineItems.length > 1) {
  console.error(
    `\n${lineItems.length} line items found. This script only repricess a single crash ` +
      "line. Nothing written.",
  );
  Deno.exit(1);
}

const item = lineItems[0];
const unit = Number(item.unit_price_gbp) || 0;
if (!unit) throw new Error("line item has no unit_price_gbp — cannot reprice safely");

const newAmount = round2(unit * QUANTITY);
if (Math.abs(newAmount - TARGET_TOTAL) > 0.005) {
  throw new Error(
    `${QUANTITY} x GBP ${unit} = GBP ${newAmount}, but the office total is GBP ` +
      `${TARGET_TOTAL}. Check the day rate before writing.`,
  );
}

/*
 * The dates line is built by formatGroupedSessionDates ("Dates: 22, 23 Jul"), so it is
 * rebuilt from the days that were actually taken rather than edited as text — trimming
 * the last entry would drop the month with it.
 */
const keptDates = KEEP_DATES.split(/[,\s]+/)
  .map((s) => s.trim())
  .filter(Boolean);
for (const iso of keptDates) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`KEEP_DATES: ${iso} is not YYYY-MM-DD`);
}
if (keptDates.length && keptDates.length !== QUANTITY) {
  throw new Error(
    `KEEP_DATES has ${keptDates.length} dates but the invoice is for ${QUANTITY} days.`,
  );
}
const nextDates = keptDates.length
  ? formatGroupedSessionDates(keptDates.map((iso) => new Date(`${iso}T00:00:00Z`)))
  : (String(item.dates || "").trim() || null);

const nextItem: LineItem = {
  ...item,
  quantity: QUANTITY,
  amount_gbp: newAmount,
  dates: nextDates,
};

const schedule = Array.isArray(share.payment_schedule) ? share.payment_schedule : [];
const nextSchedule = schedule.length === 1
  ? [{ ...(schedule[0] as Record<string, unknown>), amount_gbp: newAmount }]
  : schedule;
if (schedule.length > 1) {
  console.warn(
    `\nWARNING: ${schedule.length} instalments on a crash invoice — left untouched, ` +
      "check they still add up to the new total.",
  );
}

const noteLine =
  `Office 14 Aug 2026: crash course was ${QUANTITY} days, not 3 — repriced GBP ` +
  `${share.amount_gbp} -> GBP ${newAmount} (${QUANTITY} x GBP ${unit})` +
  (keptDates.length ? ` for ${keptDates.join(", ")}.` : ".");

const patch = {
  amount_gbp: newAmount,
  line_items: [nextItem],
  payment_schedule: nextSchedule,
  notes: [String(share.notes || "").trim(), noteLine].filter(Boolean).join("\n").slice(0, 2000),
  updated_at: new Date().toISOString(),
};

console.log("\nAFTER plan", {
  amount_gbp: newAmount,
  quantity: QUANTITY,
  unit_price_gbp: unit,
  dates_before: item.dates || null,
  dates_after: nextItem.dates,
});

if (!keptDates.length && String(item.dates || "").trim()) {
  console.warn(
    "\nWARNING: KEEP_DATES not set, so the dates line still lists 3 days while the total " +
      `is for ${QUANTITY}. Re-run with KEEP_DATES=<iso>,<iso> (from the dates above).`,
  );
}

if (!APPLY) {
  console.log("\nRe-run with APPLY=1 to write + regen PDF.");
  Deno.exit(0);
}

const { data: updated, error: updErr } = await admin
  .from("portal_parent_invoice_share")
  .update(patch)
  .eq("id", share.id)
  .select("invoice_number, amount_gbp, payment_status, line_items")
  .maybeSingle();
if (updErr) throw new Error(updErr.message);
console.log("UPDATED", JSON.stringify(updated, null, 2));

const regen = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
console.log(
  "PDF:",
  regen.ok ? regen.pdfStoragePath : "FAIL " + (regen as { error: string }).error,
);
