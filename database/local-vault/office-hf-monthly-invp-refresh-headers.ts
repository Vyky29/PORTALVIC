/**
 * Refresh existing H&F monthly INV-Ps (office_funder_2627_hf_month_*) with PDF header
 * markers (Service / Slot / Venue) and improved line descriptions — amounts unchanged.
 *
 * Year DRAFT shares (hf_year_draft) are not touched.
 *
 * Dry-run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-hf-monthly-invp-refresh-headers.ts
 *
 * Apply + regenerate PDFs:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-hf-monthly-invp-refresh-headers.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  formatHfPdfHeaderMarker,
  regeneratePortalInvoiceSharePdf,
} from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  buildReenrolMonthlyLineItems,
  lineItemsToDescription,
  loadProductMap,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";
import {
  buildHfLaHeader,
  mergeHfPdfHeaderMarker,
  toHfLaLineLayout,
} from "../../supabase/functions/_shared/hf_invoice_pdf_layout.ts";
import {
  paymentRowToContext,
  type ParsedSlot,
} from "../../supabase/functions/_shared/reenrolment_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const ONLY = (Deno.env.get("ONLY") || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const READY_ROOT = "office_funder_2627";

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
loadEnvFile("database/local-vault/secrets.env");

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("PORTAL_SUPABASE_SERVICE_ROLE_KEY") ||
    "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function clean(v: unknown, max = 160): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

type Pack = {
  clientKey: string;
  weekly: ParsedSlot[];
  dayCentre: ParsedSlot[];
};

function parseHfMonthMarker(readyBy: string): { ym: string; clientKey: string } | null {
  const m = clean(readyBy, 160).match(
    /^office_funder_2627_hf_month_(\d{4}-\d{2})_(.+)$/i,
  );
  if (!m) return null;
  return { ym: m[1], clientKey: m[2] };
}

const productMap = await loadProductMap(admin);

const { data: laRows, error: laErr } = await admin
  .from("client_payments")
  .select("id, client_key, client_name, data, sheet")
  .eq("sheet", "LA");
if (laErr) throw new Error(laErr.message);

const packByKey = new Map<string, Pack>();
for (const row of laRows || []) {
  const clientKey = clean(row.client_key, 80);
  if (!clientKey || packByKey.has(clientKey)) continue;
  const data = (row.data || {}) as Record<string, unknown>;
  const funder = clean(data.Funder || data.Funding || data.Paid, 80);
  if (!/h\s*&\s*f|hammersmith|fulham|\blbhf\b/i.test(funder)) continue;
  const ctx = paymentRowToContext(row as Record<string, unknown>);
  packByKey.set(clientKey, {
    clientKey,
    weekly: (ctx.weeklySlots || []) as ParsedSlot[],
    dayCentre: (ctx.dayCentreSlots || []) as ParsedSlot[],
  });
}

const { data: shares, error: shErr } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, ready_by, notes, line_items, line_description, amount_gbp, payment_status",
  )
  .like("ready_by", `${READY_ROOT}_hf_month_%`)
  .neq("payment_status", "void")
  .order("ready_by", { ascending: true });
if (shErr) throw new Error(shErr.message);

console.log(`H&F monthly shares: ${(shares || []).length}`);
console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);

let updated = 0;
let skipped = 0;
let failed = 0;

for (const share of shares || []) {
  const readyBy = clean(share.ready_by, 160);
  const parsed = parseHfMonthMarker(readyBy);
  if (!parsed) {
    skipped += 1;
    continue;
  }
  if (ONLY.length && !ONLY.includes(parsed.clientKey)) {
    skipped += 1;
    continue;
  }
  const pack = packByKey.get(parsed.clientKey);
  if (!pack) {
    console.log("SKIP no pack", share.invoice_number, parsed.clientKey);
    skipped += 1;
    continue;
  }

  const allSlots = [...pack.weekly, ...pack.dayCentre];
  const weeklyChoices: Record<string, { choice: string }> = {};
  for (const slot of allSlots) {
    if (slot?.id) weeklyChoices[slot.id] = { choice: "keep" };
  }

  const header = buildHfLaHeader(allSlots, parsed.clientKey);
  const hdrMarker = formatHfPdfHeaderMarker(header);
  const notes = mergeHfPdfHeaderMarker(String(share.notes || ""), hdrMarker);

  const amountGbp = round2(num(share.amount_gbp));
  let lineItems = buildReenrolMonthlyLineItems({
    slots: allSlots,
    weeklyChoices,
    monthYm: parsed.ym,
    monthAmountGbp: amountGbp,
    vatMode: "exempt",
    productMap,
  });
  lineItems = toHfLaLineLayout(lineItems);
  const lineSum = round2(lineItems.reduce((s, li) => s + num(li.amount_gbp), 0));
  if (!lineItems.length || Math.abs(lineSum - amountGbp) > 0.05) {
    lineItems = (share.line_items as PortalInvoiceLineItem[]) || [];
    lineItems = toHfLaLineLayout(lineItems);
  }
  const lineDescription = lineItemsToDescription(lineItems, { fundedProvision: true });
  const qty =
    lineItems.reduce((s, li) => s + (num(li.quantity) || 1), 0) || 1;

  const alreadyHasHdr = /\[\[hf:/i.test(String(share.notes || ""));
  const notesChanged = notes !== clean(share.notes, 800);
  const linesChanged =
    JSON.stringify(lineItems) !== JSON.stringify(share.line_items || []);

  console.log(
    [
      clean(share.invoice_number, 20) || share.id,
      parsed.clientKey,
      parsed.ym,
      `£${amountGbp}`,
      `hdr=${alreadyHasHdr ? "had" : "new"}`,
      `Service=${header.service.slice(0, 40)}`,
      `Slot=${header.slot.slice(0, 50)}`,
    ].join(" | "),
  );

  if (!notesChanged && !linesChanged) {
    skipped += 1;
    continue;
  }

  if (!APPLY) {
    updated += 1;
    continue;
  }

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      notes,
      line_items: lineItems,
      line_description: lineDescription,
      quantity: qty,
      unit_price_gbp: qty > 0 ? round2(amountGbp / qty) : amountGbp,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (upErr) {
    console.error("UPDATE FAIL", share.invoice_number, upErr.message);
    failed += 1;
    continue;
  }

  const regen = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  if (!regen.ok) {
    console.error("PDF FAIL", share.invoice_number, regen.error);
    failed += 1;
    continue;
  }

  updated += 1;
  console.log("OK", share.invoice_number);
}

console.log(`\nDone: updated=${updated} skipped=${skipped} failed=${failed}`);
if (!APPLY && updated > 0) {
  console.log("Re-run with APPLY=1 to write changes and regenerate PDFs.");
}
