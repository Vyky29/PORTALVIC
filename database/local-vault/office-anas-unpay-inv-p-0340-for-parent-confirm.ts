/**
 * Revert INV-P-0340 (Anas / Heba) to unpaid so the parent can tap
 * the green "I've paid by bank transfer" button in the family portal.
 *
 * Context: share was marked paid via Stripe webhook; office wants parent
 * self-report (green button) before the hub turns settled/green.
 *
 * Does NOT refund Stripe. If cs_live / PI is a real card capture, handle
 * refund in Stripe Dashboard separately.
 *
 * Dry run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-anas-unpay-inv-p-0340-for-parent-confirm.ts
 * Apply:
 *   APPLY=1 npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/office-anas-unpay-inv-p-0340-for-parent-confirm.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const APPLY = (Deno.env.get("APPLY") || "") === "1";
const INVOICE_NUMBER = "INV-P-0340";
const CONTACT_ID = "7560101";

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

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: row, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, payment_status, amount_gbp, amount_paid_gbp, paid_at, paid_via, stripe_checkout_session_id, stripe_payment_intent_id, payment_schedule, parent_reported_paid_at, notes",
  )
  .eq("invoice_number", INVOICE_NUMBER)
  .eq("contact_id", CONTACT_ID)
  .maybeSingle();

if (error) throw new Error(error.message);
if (!row) throw new Error("INV-P-0340 not found for 7560101");

console.log("BEFORE:", JSON.stringify(row, null, 2));

const schedule = Array.isArray(row.payment_schedule)
  ? row.payment_schedule.map((s: Record<string, unknown>) => ({
      ...s,
      status: "unpaid",
      paid_at: null,
      paid_via: null,
    }))
  : row.payment_schedule;

const patch = {
  payment_status: "unpaid",
  amount_paid_gbp: 0,
  paid_at: null,
  paid_via: null,
  stripe_checkout_session_id: null,
  stripe_payment_intent_id: null,
  parent_reported_paid_at: null,
  payment_schedule: schedule,
  notes: [
    String(row.notes || "").trim(),
    "Office 11 Aug 2026: reverted machine/Stripe paid → unpaid so Heba can confirm with green I've paid in the parent portal.",
  ]
    .filter(Boolean)
    .join("\n"),
};

console.log("\nPATCH:", JSON.stringify(patch, null, 2));

if (!APPLY) {
  console.log("\nDry run only. Re-run with APPLY=1 to unpay.");
  Deno.exit(0);
}

const { data: updated, error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update(patch)
  .eq("id", row.id)
  .select(
    "id, invoice_number, payment_status, amount_paid_gbp, paid_at, paid_via, stripe_checkout_session_id",
  )
  .single();

if (upErr || !updated) throw new Error(upErr?.message || "update failed");
console.log("\nUPDATED:", JSON.stringify(updated, null, 2));
