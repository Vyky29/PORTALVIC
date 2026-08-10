/**
 * Office: Belhadj + Alfadhl bank receipts (Jul 2026).
 *
 * - Hazem INV-P-0079: confirm Aug-15 half £1,267.50 (Tide 31 Jul) → re-enrol payment OK
 * - Eiji INV-P-0083: £633.75 received 31 Jul (half of Aug half); clear I've-paid pending
 *   so Léa can pay the remaining £633.75 and press the green button again
 * - Zaid INV-P-0094: £1,150.40 in bank 30 Jul — DO NOT confirm; note only (needs £117.10 more)
 *
 *   APPLY=1 npx -y deno run -A database/local-vault/office-belhadj-alfadhl-bank-receipts.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { readFileSync, existsSync } from "node:fs";
import { recordInvoiceInstalmentPayment } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  normalizePaymentSchedule,
  amountPaidFromSchedule,
  nextInstalmentDueDate,
  round2,
} from "../../supabase/functions/_shared/portal_invoice_payment_schedule.ts";

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

async function loadInv(num: string) {
  const { data, error } = await admin
    .from("portal_parent_invoice_share")
    .select("*")
    .eq("invoice_number", num)
    .maybeSingle();
  if (error || !data) throw new Error(`${num}: ${error?.message || "missing"}`);
  return data;
}

const hazem = await loadInv("INV-P-0079");
const eiji = await loadInv("INV-P-0083");
const zaid = await loadInv("INV-P-0094");

console.log("Plan:");
console.log("  Hazem", hazem.invoice_number, hazem.payment_status, "→ mark Aug half £1267.50 paid (31 Jul bank)");
console.log(
  "  Eiji",
  eiji.invoice_number,
  eiji.payment_status,
  "parent_reported",
  eiji.parent_reported_paid_at,
  "→ partial £633.75 received; clear pending; due now £633.75; keep I've paid button",
);
console.log(
  "  Zaid",
  zaid.invoice_number,
  zaid.payment_status,
  "→ NOTE ONLY £1150.40 bank 30 Jul; remaining £117.10 — do NOT confirm",
);

if (!APPLY) {
  console.log("\nDry run. Re-run with APPLY=1.");
  Deno.exit(0);
}

/* ---- Hazem: confirm first flexi half ---- */
{
  const r = await recordInvoiceInstalmentPayment(admin, String(hazem.id), {
    amountGbp: 1267.5,
    paidVia: "admin",
  });
  if (!r.ok) throw new Error(`Hazem record failed: ${r.error}`);
  const paidAt = "2026-07-31T12:00:00.000Z";
  const { data: after } = await admin
    .from("portal_parent_invoice_share")
    .select("payment_schedule, payment_status, amount_paid_gbp, notes")
    .eq("id", hazem.id)
    .maybeSingle();
  const sched = normalizePaymentSchedule(after?.payment_schedule).map((row) => {
    if (row.seq === 1 && row.status === "paid") {
      return { ...row, paid_at: paidAt, paid_via: "admin" };
    }
    return row;
  });
  const note =
    `${String(after?.notes || hazem.notes || "").trim()} · office: Tide £1267.50 Hazem Aug-half confirmed 2026-07-31 (Léa)`.trim();
  await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_schedule: sched,
      notes: note.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", hazem.id);
  await regeneratePortalInvoiceSharePdf(admin, String(hazem.id));
  console.log("OK Hazem", r.payment_status, "paid", r.amount_paid_gbp);
}

/* ---- Eiji: partial bank, reopen I've paid ---- */
{
  const received = 633.75;
  const half = 1267.5;
  const remaining = round2(half - received);
  const sched = normalizePaymentSchedule(eiji.payment_schedule).map((row) => {
    if (row.seq === 1) {
      return {
        ...row,
        amount_gbp: remaining,
        status: "pending" as const,
        paid_at: null,
        paid_via: null,
        label: "Autumn term · 1st half · balance after £633.75 (31 Jul)",
      };
    }
    return row;
  });
  const note =
    `${String(eiji.notes || "").trim()} · office: Tide £633.75 toward Eiji Aug-half on 2026-07-31 — NOT confirmed; remaining £${remaining.toFixed(2)} due before 15 Aug; parent must pay difference then press I've paid`.trim();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "partial",
      amount_paid_gbp: received,
      payment_schedule: sched,
      next_instalment_due: nextInstalmentDueDate(sched),
      parent_reported_paid_at: null,
      parent_reported_ref: null,
      parent_reported_method: null,
      parent_reported_notes: null,
      paid_at: null,
      paid_via: null,
      notes: note.slice(0, 2000),
      updated_at: now,
    })
    .eq("id", eiji.id);
  if (error) throw new Error(`Eiji update: ${error.message}`);
  await regeneratePortalInvoiceSharePdf(admin, String(eiji.id));
  console.log("OK Eiji partial", received, "due_now", remaining, "I've paid button restored");
}

/* ---- Zaid: note only ---- */
{
  const received = 1150.4;
  const half = 1267.5;
  const remaining = round2(half - received);
  const note =
    `${String(zaid.notes || "").trim()} · office: Tide £1150.40 on 2026-07-30 toward Aug-half — NOT validated; needs £${remaining.toFixed(2)} more then parent presses I've paid (Zaynab)`.trim();
  const { error } = await admin
    .from("portal_parent_invoice_share")
    .update({
      notes: note.slice(0, 2000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", zaid.id);
  if (error) throw new Error(`Zaid update: ${error.message}`);
  console.log("OK Zaid note only; still unpaid; remaining", remaining);
}

const check = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, payment_status, amount_paid_gbp, parent_reported_paid_at, next_instalment_due, payment_schedule, notes",
  )
  .in("invoice_number", ["INV-P-0079", "INV-P-0083", "INV-P-0094"]);
console.log(JSON.stringify(check.data, null, 2));
