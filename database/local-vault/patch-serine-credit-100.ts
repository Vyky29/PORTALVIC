/**
 * One-off: Serine Hodroje INV-P-0087 — change applied credit from £70 to £100.
 * Original term total £3425 → due £3325.
 *
 * Run: npx -y deno run --allow-env --allow-read --allow-net \
 *   database/local-vault/patch-serine-credit-100.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

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

const ORIGINAL_TOTAL = 3425;
const OLD_CREDIT = 70;
const NEW_CREDIT = 100;
const NEW_DUE = Math.round((ORIGINAL_TOTAL - NEW_CREDIT) * 100) / 100; // 3325

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const invoiceId = "8465d058-0eb1-475a-87b4-8352a63151e2";
const creditId = "e703c499-9880-4343-b16f-f859ddfcf587";
const now = new Date().toISOString();

const { data: inv, error: invErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, amount_gbp, payment_schedule, line_items")
  .eq("id", invoiceId)
  .maybeSingle();
if (invErr || !inv) throw new Error(invErr?.message || "invoice_not_found");

const current = Number(inv.amount_gbp);
const expectedCurrent = ORIGINAL_TOTAL - OLD_CREDIT;
if (Math.abs(current - expectedCurrent) > 0.01) {
  throw new Error(
    `Unexpected amount ${current}; expected ${expectedCurrent} (3425-70). Aborting.`,
  );
}

const lineSum = (Array.isArray(inv.line_items) ? inv.line_items : []).reduce(
  (s: number, l: { amount_gbp?: number }) => s + (Number(l.amount_gbp) || 0),
  0,
);
if (Math.abs(lineSum - ORIGINAL_TOTAL) > 0.01) {
  throw new Error(`Line items sum ${lineSum} != original ${ORIGINAL_TOTAL}. Aborting.`);
}

const schedule = [
  {
    seq: 1,
    label: "Autumn term · full payment",
    status: "pending",
    due_date: "2026-08-15",
    amount_gbp: NEW_DUE,
  },
];

const { error: upInv } = await admin
  .from("portal_parent_invoice_share")
  .update({
    amount_gbp: NEW_DUE,
    payment_status: "partial",
    payment_schedule: schedule,
    next_instalment_due: "2026-08-15",
    amount_paid_gbp: 0,
    updated_at: now,
  })
  .eq("id", invoiceId);
if (upInv) throw new Error(upInv.message);

const { error: upCred } = await admin
  .from("portal_parent_family_credits")
  .update({
    amount_gbp: NEW_CREDIT,
    status: "applied",
    applied_invoice_share_id: invoiceId,
    closed_at: now,
    close_notes: `Partial apply to invoice INV-P-0087 (£${NEW_CREDIT.toFixed(2)} of £${ORIGINAL_TOTAL.toFixed(2)}); £${NEW_DUE.toFixed(2)} still due (adjusted from £70 to £100)`,
    notes:
      "From client_services_review CREDITS (£) export 2026-07-16 — for Autumn 2026/27 (corrected to £100)",
    updated_at: now,
  })
  .eq("id", creditId);
if (upCred) throw new Error(upCred.message);

const regen = await regeneratePortalInvoiceSharePdf(admin, invoiceId);
console.log(
  JSON.stringify(
    {
      invoice: inv.invoice_number,
      was: current,
      now: NEW_DUE,
      credit: NEW_CREDIT,
      pdf: regen.ok ? "regenerated" : regen.error,
    },
    null,
    2,
  ),
);
