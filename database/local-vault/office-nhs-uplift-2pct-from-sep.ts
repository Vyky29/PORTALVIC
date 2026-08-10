/**
 * NHS funder INV-Ps: bake +2.03% into service unit prices from September 2026.
 * Targets ready (non-void) shares whose notes mark office_funder_2627_nhs_month_*
 * with calendar month >= 2026-09.
 *
 * Dry run:
 *   npx -y deno run -A database/local-vault/office-nhs-uplift-2pct-from-sep.ts
 * Apply + regen PDFs:
 *   APPLY=1 npx -y deno run -A database/local-vault/office-nhs-uplift-2pct-from-sep.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { lineItemsToDescription } from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const UPLIFT = 1.0203; // +2.03%
const FROM_YM = "2026-09";
const MARKER = "nhs_service_uplift_2.03pct_from_sep2026";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

type Line = Record<string, unknown>;

function upliftLines(lines: Line[]): { lines: Line[]; total: number } {
  const next: Line[] = [];
  let total = 0;
  for (const line of lines) {
    const qty = Number(line.quantity ?? 0);
    const unit = Number(line.unit_price_gbp ?? 0);
    const amt = Number(line.amount_gbp ?? 0);
    const newUnit = round4(unit * UPLIFT);
    // Prefer qty×unit so pennies stay consistent; fall back to amount×rate.
    let newAmt =
      Number.isFinite(qty) && qty > 0 && Number.isFinite(newUnit)
        ? round2(qty * newUnit)
        : round2(amt * UPLIFT);
    // Keep last-line residual friendly: if original had amount, scale if qty*unit drifts >1p from scaled amount
    const scaledAmt = round2(amt * UPLIFT);
    if (Math.abs(newAmt - scaledAmt) > 0.02 && amt > 0) newAmt = scaledAmt;
    total = round2(total + newAmt);
    next.push({
      ...line,
      unit_price_gbp: newUnit,
      amount_gbp: newAmt,
    });
  }
  return { lines: next, total };
}

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, amount_gbp, unit_price_gbp, quantity, line_items, line_description, payment_schedule, notes, reference_text, due_date, payment_status, share_status",
  )
  .eq("payment_method_hint", "la_funded")
  .neq("payment_status", "void")
  .ilike("notes", "%office_funder_2627_nhs_month_%")
  .order("invoice_number");
if (error) throw error;

const plan: Array<Record<string, unknown>> = [];
for (const share of shares || []) {
  const notes = String(share.notes || "");
  const ym = notes.match(/nhs_month_(\d{4}-\d{2})/)?.[1] || "";
  if (!ym || ym < FROM_YM) continue;
  if (notes.includes(MARKER)) {
    plan.push({
      inv: share.invoice_number,
      ym,
      skip: "already_uplifted",
      amount: share.amount_gbp,
    });
    continue;
  }
  const lines = Array.isArray(share.line_items) ? (share.line_items as Line[]) : [];
  if (!lines.length) {
    plan.push({ inv: share.invoice_number, ym, skip: "no_line_items" });
    continue;
  }
  const { lines: nextLines, total } = upliftLines(lines);
  const qty = Number(share.quantity || 0);
  const unit =
    qty > 0 ? round4(total / qty) : round4(Number(share.unit_price_gbp || 0) * UPLIFT);
  const desc = lineItemsToDescription(nextLines as never);
  const sched = Array.isArray(share.payment_schedule)
    ? (share.payment_schedule as Line[]).map((row) => ({
      ...row,
      amount_gbp: round2(Number(row.amount_gbp || share.amount_gbp || 0) * UPLIFT),
    }))
    : [];

  plan.push({
    inv: share.invoice_number,
    id: share.id,
    ym,
    from: share.amount_gbp,
    to: total,
    delta: round2(total - Number(share.amount_gbp || 0)),
    unit_from: share.unit_price_gbp,
    unit_to: unit,
    lines: nextLines.length,
    due: share.due_date,
  });

  if (!APPLY) continue;

  const now = new Date().toISOString();
  const nextNotes = notes.includes(MARKER)
    ? notes
    : `${notes} · ${MARKER}`.slice(0, 2000);
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: total,
      unit_price_gbp: unit,
      line_items: nextLines,
      line_description: desc,
      payment_schedule: sched,
      notes: nextNotes,
      updated_at: now,
    })
    .eq("id", share.id);
  if (upErr) {
    console.error("UPDATE FAIL", share.invoice_number, upErr.message);
    continue;
  }
  const regen = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  console.log(
    regen.ok ? "OK" : "PDF FAIL",
    share.invoice_number,
    `£${share.amount_gbp} → £${total}`,
    regen.ok ? regen.pdfStoragePath : regen.error,
  );
}

const actionable = plan.filter((p) => !p.skip);
const skipped = plan.filter((p) => p.skip);
const deltaSum = round2(
  actionable.reduce((s, p) => s + Number(p.delta || 0), 0),
);
console.log(
  JSON.stringify(
    {
      uplift: "+2.03%",
      from_ym: FROM_YM,
      apply: APPLY,
      n: actionable.length,
      skipped: skipped.length,
      delta_total: deltaSum,
      sample: actionable.slice(0, 8),
      skipped_sample: skipped.slice(0, 5),
    },
    null,
    2,
  ),
);

await Deno.writeTextFile(
  "database/local-vault/tmp/nhs-uplift-2pct-from-sep-report.json",
  JSON.stringify({ plan, generated_at: new Date().toISOString() }, null, 2),
);

if (!APPLY) {
  console.log("\nDry run OK. Re-run with APPLY=1 to write + regen PDFs.");
}
