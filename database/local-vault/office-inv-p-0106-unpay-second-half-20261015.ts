/**
 * INV-P-0106: 2nd Autumn half (£350, due 26 Oct) was marked paid by admin on 14 Aug, but only the
 * 1st half arrived (Stripe 14 Aug). Set the 2nd half back to pending -> invoice partial £350 paid.
 * No parent message. Xero has no payment on this invoice, so nothing to undo there.
 *
 *   npx -y deno run -A database/local-vault/office-inv-p-0106-unpay-second-half-20261015.ts [--apply]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

for (const line of Deno.readTextFileSync("local-secrets/secrets.env").split(/\r?\n/)) {
  const i = line.indexOf("=");
  if (i > 0 && !line.startsWith("#")) {
    Deno.env.set(line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, ""));
  }
}
const apply = Deno.args.includes("--apply");
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: row, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, amount_gbp, amount_paid_gbp, payment_status, payment_schedule, notes, xero_payment_id")
  .eq("invoice_number", "INV-P-0106")
  .single();
if (error || !row) throw new Error(error?.message || "not found");

const schedule = (row.payment_schedule || []).map((s: any) =>
  s.seq === 2 ? { ...s, status: "pending", paid_at: null, paid_via: null } : s
);
const paid = schedule.filter((s: any) => s.status === "paid").reduce((t: number, s: any) => t + Number(s.amount_gbp || 0), 0);
const note = "Office 15 Oct 2026: only 1st half £350 received (Stripe 14 Aug). 2nd half had been marked paid by mistake on 14 Aug - back to pending, due 26 Oct.";
const patch = {
  payment_status: "partial",
  amount_paid_gbp: paid,
  paid_at: null,
  paid_via: null,
  next_instalment_due: "2026-10-26",
  payment_schedule: schedule,
  notes: row.notes ? `${row.notes}\n${note}` : note,
  updated_at: new Date().toISOString(),
};
console.log("before:", row.payment_status, row.amount_paid_gbp, "xero_payment_id", row.xero_payment_id);
console.log("after :", patch.payment_status, patch.amount_paid_gbp, JSON.stringify(schedule));
if (!apply) {
  console.log("dry run - add --apply");
  Deno.exit(0);
}
const { error: upErr } = await admin.from("portal_parent_invoice_share").update(patch).eq("id", row.id);
if (upErr) throw new Error(upErr.message);
console.log("updated");
