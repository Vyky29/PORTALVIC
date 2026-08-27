/**
 * Reprice LA/NHS monthly funder INV-Ps that were equal-split across 11 months.
 * Correct rule: each month = sessions that month × unit fee (e.g. Aboodi £100).
 *
 * Unit fees taken from voided term INV-Ps for the same contact + service_key.
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-reprice-monthly-by-sessions.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { lineItemsToDescription } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type Line = {
  service_key?: string;
  description?: string;
  detail?: string | null;
  dates?: string | null;
  quantity?: number;
  unit_price_gbp?: number;
  amount_gbp?: number;
  xero_item_code?: string | null;
};

const { data: voided, error: voidErr } = await admin
  .from("portal_parent_invoice_share")
  .select("contact_id, line_items, payment_status, notes")
  .eq("payment_status", "void")
  .eq("payment_method_hint", "la_funded");
if (voidErr) throw new Error(voidErr.message);

/** contactId\0service_key → unit fee (prefer clean whole/half pounds from voided terms). */
const unitByContactService = new Map<string, number>();
for (const row of voided || []) {
  const cid = String(row.contact_id || "");
  const lines = Array.isArray(row.line_items) ? (row.line_items as Line[]) : [];
  for (const li of lines) {
    const key = String(li.service_key || "").trim();
    const qty = num(li.quantity);
    const unit = num(li.unit_price_gbp);
    const amt = num(li.amount_gbp);
    if (!cid || !key || qty <= 0 || unit <= 0) continue;
    if (Math.abs(qty * unit - amt) > 0.05) continue;
    // Prefer nicer catalogue fees (whole pounds / .50).
    const mapKey = `${cid}\0${key}`;
    const prev = unitByContactService.get(mapKey);
    const nice = Math.abs(unit * 2 - Math.round(unit * 2)) < 1e-9;
    if (!prev || (nice && Math.abs(prev * 2 - Math.round(prev * 2)) >= 1e-9)) {
      unitByContactService.set(mapKey, round4(unit));
    }
  }
}

const { data: monthly, error: monErr } = await admin
  .from("portal_parent_invoice_share")
  .select("*")
  .eq("payment_method_hint", "la_funded")
  .neq("payment_status", "void")
  .or(
    "notes.ilike.%hf_month_%,notes.ilike.%nhs_month_%,notes.ilike.%schedule:monthly_11%,ready_by.ilike.%_month_%",
  );
if (monErr) throw new Error(monErr.message);

console.log("Unit map entries", unitByContactService.size);
console.log("Monthly candidates", (monthly || []).length);

let changed = 0;
let skipped = 0;
const report: Array<Record<string, unknown>> = [];

for (const inv of monthly || []) {
  const cid = String(inv.contact_id || "");
  const lines = Array.isArray(inv.line_items) ? (inv.line_items as Line[]).map((l) => ({ ...l })) : [];
  if (!lines.length) {
    skipped += 1;
    continue;
  }

  let anyChange = false;
  const nextLines: Line[] = [];
  for (const li of lines) {
    const key = String(li.service_key || "").trim();
    const qty = Math.max(1, num(li.quantity));
    const mapKey = `${cid}\0${key}`;
    let unit = unitByContactService.get(mapKey);
    if (unit == null) {
      // Fallbacks for aquatic packs when voided map missed.
      const desc = `${li.description || ""} ${li.detail || ""}`.toLowerCase();
      if (/aquatic|swim/.test(desc) && /60'|60\b|1h/.test(desc)) unit = 100;
      else if (/aquatic|swim/.test(desc) && /90'|90\b/.test(desc)) unit = 150;
      else if (/aquatic|swim/.test(desc) && /30'|30\b/.test(desc)) unit = 50;
      else unit = num(li.unit_price_gbp);
    }
    const newAmt = round2(unit * qty);
    const oldAmt = round2(num(li.amount_gbp));
    if (Math.abs(newAmt - oldAmt) > 0.02) anyChange = true;
    nextLines.push({
      ...li,
      quantity: qty,
      unit_price_gbp: round4(unit),
      amount_gbp: newAmt,
    });
  }

  const newTotal = round2(nextLines.reduce((s, li) => s + num(li.amount_gbp), 0));
  const oldTotal = round2(num(inv.amount_gbp));
  if (!anyChange && Math.abs(newTotal - oldTotal) <= 0.02) {
    skipped += 1;
    continue;
  }

  const schedule = Array.isArray(inv.payment_schedule)
    ? inv.payment_schedule.map((row: Record<string, unknown>, i: number) => ({
        ...row,
        amount_gbp: i === 0 ? newTotal : num(row.amount_gbp),
        status: String(row.status || "pending") === "paid" ? "paid" : "pending",
      }))
    : [
        {
          seq: 1,
          label: String(inv.reference_text || inv.due_date || "Monthly funder"),
          due_date: inv.due_date,
          amount_gbp: newTotal,
          status: "pending",
          paid_at: null,
          paid_via: null,
        },
      ];

  const desc = lineItemsToDescription(nextLines as never, { fundedProvision: true });
  const noteLine =
    `Office 13 Aug 2026: reprice monthly by sessions×unit (was equal-split £${oldTotal.toFixed(2)} → £${newTotal.toFixed(2)}).`;

  report.push({
    invoice: inv.invoice_number,
    contact: cid,
    due: inv.due_date,
    old: oldTotal,
    new: newTotal,
    lines: nextLines.map((l) => `${l.quantity}×£${l.unit_price_gbp}=£${l.amount_gbp}`),
  });

  if (!APPLY) continue;

  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: newTotal,
      line_items: nextLines,
      line_description: desc,
      payment_schedule: schedule,
      next_instalment_due: inv.due_date,
      notes: [String(inv.notes || "").trim(), noteLine].filter(Boolean).join("\n").slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inv.id);
  if (upErr) throw new Error(`${inv.invoice_number}: ${upErr.message}`);

  const regen = await regeneratePortalInvoiceSharePdf(admin, String(inv.id));
  console.log(
    "OK",
    inv.invoice_number,
    `£${oldTotal}→£${newTotal}`,
    regen.ok ? "pdf" : "pdf-fail",
  );
  changed += 1;
}

console.log(JSON.stringify(report, null, 2));
console.log(APPLY ? `Applied ${changed}, skipped ${skipped}` : `Dry run ${report.length} to change, skipped ${skipped}`);
if (!APPLY) console.log("Re-run with APPLY=1");
