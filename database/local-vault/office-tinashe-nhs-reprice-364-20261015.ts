/**
 * Tinashe NHS ILA Friday Bespoke 3:1 90' (INV-P-0180..0189, Oct 2026 - Jul 2027).
 * The 29 Jul autumn/year scripts priced these from the catalogue (Bespoke £125/h = £187.50 per 90')
 * instead of the agreed sheet rate £357.42 / session (invoices 1721/1723 in 2025/26).
 * Victor 15 Oct 2026: £357.42 x 1.0203 uplift = £364.68 per session. Quantities unchanged.
 * Skips anything paid or already in Xero.
 *
 *   npx -y deno run -A database/local-vault/office-tinashe-nhs-reprice-364-20261015.ts [--apply]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { mkdirSync, writeFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

function loadEnv(path: string) {
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
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");

const APPLY = Deno.args.includes("--apply");
const NUMS = Array.from({ length: 10 }, (_, i) => `INV-P-0${180 + i}`);
const OLD_UNIT = 187.5;
const NEW_UNIT = 364.68;
const MARKER = "tinashe_nhs_rate_357.42x1.0203_15oct";
const OUT = "docs/finance/tinashe-nhs-2026-27";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100 + 1e-6) / 100;
}

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, ready_by, payment_status, amount_gbp, amount_paid_gbp, xero_invoice_id, reference_text, due_date, line_items, payment_schedule, notes")
  .in("invoice_number", NUMS)
  .order("invoice_number");
if (error) throw error;

console.log(`\nTinashe NHS reprice £${OLD_UNIT} → £${NEW_UNIT}  (${APPLY ? "APPLY" : "DRY"})\n`);
let before = 0;
let after = 0;
const plan: { row: Record<string, any>; lines: PortalInvoiceLineItem[]; total: number }[] = [];
for (const r of rows || []) {
  if (!/_tinashe-nhs$/.test(String(r.ready_by || ""))) {
    console.log(`${r.invoice_number}: not tinashe-nhs (${r.ready_by}) - skip`);
    continue;
  }
  if (r.xero_invoice_id || Number(r.amount_paid_gbp || 0) > 0 || r.payment_status === "paid" || r.payment_status === "void") {
    console.log(`${r.invoice_number}: paid/void/in Xero - skip`);
    continue;
  }
  const old = (Array.isArray(r.line_items) ? r.line_items : []) as PortalInvoiceLineItem[];
  if (!old.length) throw new Error(`${r.invoice_number} has no line_items`);
  const lines = old.map((l) => {
    if (Math.abs(Number(l.unit_price_gbp) - OLD_UNIT) > 0.009) {
      throw new Error(`${r.invoice_number} unexpected unit ${l.unit_price_gbp}`);
    }
    return { ...l, unit_price_gbp: NEW_UNIT, amount_gbp: round2(Number(l.quantity) * NEW_UNIT) };
  });
  const total = round2(lines.reduce((s, l) => s + l.amount_gbp, 0));
  const qty = lines.reduce((s, l) => s + Number(l.quantity), 0);
  before += Number(r.amount_gbp);
  after += total;
  console.log(`${r.invoice_number} ${r.reference_text}: ${qty} x £${NEW_UNIT} · £${Number(r.amount_gbp).toFixed(2)} → £${total.toFixed(2)} · ${lines[0].dates || ""}`);
  plan.push({ row: r, lines, total });
}
console.log(`\nTotal £${before.toFixed(2)} → £${after.toFixed(2)} (+£${(after - before).toFixed(2)})`);

if (!APPLY) {
  console.log("Dry run. Re-run with --apply");
  Deno.exit(0);
}

mkdirSync(OUT, { recursive: true });
for (const { row: r, lines, total } of plan) {
  const qty = lines.reduce((s, l) => s + Number(l.quantity), 0);
  const sched = (Array.isArray(r.payment_schedule) && r.payment_schedule.length ? r.payment_schedule : [{ seq: 1 }])
    .slice(0, 1)
    .map((s: Record<string, unknown>) => ({
      ...s,
      seq: 1,
      label: s.label || `${r.reference_text} · NHS invoice`,
      due_date: s.due_date || r.due_date,
      amount_gbp: total,
      status: "pending",
      paid_at: null,
      paid_via: null,
    }));
  const notes = String(r.notes || "").replace(/\s· tinashe_nhs_rate_[\s\S]*$/, "") +
    ` · ${MARKER} · ${qty} x £${NEW_UNIT} = £${total.toFixed(2)} (was £${OLD_UNIT}/session catalogue)`;
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: total,
      unit_price_gbp: NEW_UNIT,
      line_items: lines,
      line_description: lineItemsToDescription(lines, { fundedProvision: true }),
      payment_schedule: sched,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", r.id);
  if (upErr) throw upErr;
  const stored = await regeneratePortalInvoiceSharePdf(admin, r.id);
  if (!stored.ok) throw new Error(`${r.invoice_number} pdf ${stored.error}`);
  const bytes = await regeneratePortalInvoiceSharePdf(admin, r.id, { mode: "bytes" });
  if (!bytes.ok || !("pdfBytes" in bytes)) throw new Error(`${r.invoice_number} bytes`);
  writeFileSync(`${OUT}/${r.invoice_number}.pdf`, bytes.pdfBytes);
  console.log("WROTE", `${OUT}/${r.invoice_number}.pdf`, `£${total.toFixed(2)}`);
}
console.log("\nDone. Not pushed to Xero.");
