/**
 * Fix re-enrolment invoices that previously triggered a fake
 * "Invoice adjustment" / "Family credit applied" PDF row:
 *  - add missing GoCardless fee lines
 *  - add explicit CREDIT lines for applied family credits
 *  - absorb ±1p rounding into the largest service line
 * then regenerate PDFs.
 *
 * APPLY=1 to write.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import type { PortalInvoiceLineItem } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

function secret(name: string): string {
  const fromEnv = Deno.env.get(name);
  if (fromEnv) return fromEnv.trim();
  try {
    const text = Deno.readTextFileSync("local-secrets/secrets.env");
    const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
  } catch {
    return "";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id,invoice_number,amount_gbp,line_items,payment_method_hint")
  .eq("created_via", "reenrolment")
  .eq("share_status", "ready")
  .neq("payment_status", "void");
if (error) throw error;

const { data: credits } = await admin
  .from("portal_parent_family_credits")
  .select("amount_gbp,applied_invoice_share_id,status")
  .eq("status", "applied");
const creditByInvoice = new Map<string, number>();
for (const c of credits || []) {
  const id = String(c.applied_invoice_share_id || "");
  if (!id) continue;
  creditByInvoice.set(id, round2((creditByInvoice.get(id) || 0) + Number(c.amount_gbp || 0)));
}

let updated = 0;
for (const row of shares || []) {
  const amount = round2(Number(row.amount_gbp));
  let lines = (Array.isArray(row.line_items) ? row.line_items : [])
    .map((l) => ({ ...(l as PortalInvoiceLineItem) }))
    .filter((l) => l.service_key !== "CREDIT" && !/invoice adjustment|family credit/i.test(String(l.description || "")));

  const hasGc = lines.some((l) => l.service_key === "GC_FEE");
  const hint = String(row.payment_method_hint || "");
  if (!hasGc && hint === "gocardless") {
    const scheduleGuess = amount >= 1500 ? 4 : 3;
    // Prefer fee that matches remaining gap after services.
    const serviceSum = round2(lines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
    const gap = round2(amount - serviceSum);
    const fee = Math.abs(gap - 6) < 0.02 ? 6 : Math.abs(gap - 4.5) < 0.02 ? 4.5 : scheduleGuess * 1.5;
    const qty = round2(fee / 1.5);
    lines.push({
      service_key: "GC_FEE",
      description: "Direct Payment (GoCardless) fee",
      detail: null,
      dates: null,
      quantity: qty,
      unit_price_gbp: 1.5,
      amount_gbp: fee,
      xero_item_code: "GC1",
    });
  }

  const credit = creditByInvoice.get(String(row.id)) || 0;
  if (credit > 0) {
    lines.push({
      service_key: "CREDIT",
      description: "Credits",
      detail: null,
      dates: null,
      quantity: 1,
      unit_price_gbp: -credit,
      amount_gbp: -credit,
      xero_item_code: null,
    });
  }

  let sum = round2(lines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
  let diff = round2(amount - sum);
  if (Math.abs(diff) === 0.01 || Math.abs(diff) === 0.02) {
    const target = lines
      .filter((l) => l.service_key !== "GC_FEE" && l.service_key !== "CREDIT")
      .sort((a, b) => Number(b.amount_gbp) - Number(a.amount_gbp))[0];
    if (target) {
      target.amount_gbp = round2(Number(target.amount_gbp) + diff);
      target.unit_price_gbp = round2(Number(target.amount_gbp) / Number(target.quantity || 1));
      sum = round2(lines.reduce((s, l) => s + Number(l.amount_gbp || 0), 0));
      diff = round2(amount - sum);
    }
  }

  if (Math.abs(diff) >= 0.01) {
    console.log(`${row.invoice_number}: still off by ${diff} (amt ${amount} vs ${sum}) — skipped`);
    continue;
  }

  const changed = JSON.stringify(row.line_items) !== JSON.stringify(lines);
  if (!changed) continue;
  console.log(
    `${row.invoice_number}: fix lines →`,
    lines.map((l) => `${l.service_key} £${l.amount_gbp}`).join(" | "),
  );
  if (!APPLY) continue;
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({ line_items: lines, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  if (upErr) {
    console.log(`  update failed: ${upErr.message}`);
    continue;
  }
  const regen = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
  if (!regen.ok) console.log(`  PDF failed: ${regen.error}`);
  else {
    updated++;
    console.log("  PDF regenerated");
  }
}

console.log(APPLY ? `Done — ${updated} updated.` : "Dry run — set APPLY=1 to write.");
