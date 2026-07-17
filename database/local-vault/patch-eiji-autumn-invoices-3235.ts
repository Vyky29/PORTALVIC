/**
 * One-off: correct Kacem Eiji BELHADJ's Autumn 2026 re-enrolment invoices.
 *
 * Eiji kept the same services as Hazem:
 *   Aquatic Tuesday £700 + Climbing Sunday £975 + Multi-Activity Sunday £1560
 *   = £3235, paid as four invoices of £808.75.
 *
 * Run:
 *   npx -y deno run --allow-env --allow-read --allow-net \
 *     database/local-vault/patch-eiji-autumn-invoices-3235.ts
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

const CONTACT_ID = "39";
const INVOICE_NUMBERS = ["INV-P-0083", "INV-P-0084", "INV-P-0085", "INV-P-0086"];
const OLD_INSTALMENT = 678.75;
const NEW_INSTALMENT = 808.75;

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: rows, error: readError } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id,invoice_number,contact_id,amount_gbp,unit_price_gbp,quantity,payment_status,amount_paid_gbp,xero_invoice_id,stripe_checkout_session_id",
  )
  .in("invoice_number", INVOICE_NUMBERS)
  .order("invoice_number");

if (readError) throw new Error(readError.message);
if (!rows || rows.length !== INVOICE_NUMBERS.length) {
  throw new Error(`Expected ${INVOICE_NUMBERS.length} invoices; found ${rows?.length || 0}`);
}

for (const row of rows) {
  const number = String(row.invoice_number);
  if (String(row.contact_id) !== CONTACT_ID) throw new Error(`${number}: unexpected contact`);
  if (String(row.payment_status) !== "unpaid") throw new Error(`${number}: invoice is not unpaid`);
  if (Number(row.amount_paid_gbp || 0) !== 0) throw new Error(`${number}: invoice has payments`);
  if (row.xero_invoice_id) throw new Error(`${number}: already pushed to Xero`);
  if (row.stripe_checkout_session_id) throw new Error(`${number}: Stripe checkout already exists`);

  const current = Number(row.amount_gbp);
  if (
    Math.abs(current - OLD_INSTALMENT) > 0.001 &&
    Math.abs(current - NEW_INSTALMENT) > 0.001
  ) {
    throw new Error(`${number}: unexpected amount £${current}`);
  }
}

for (const row of rows) {
  const number = String(row.invoice_number);
  const { error: updateError } = await admin
    .from("portal_parent_invoice_share")
    .update({
      amount_gbp: NEW_INSTALMENT,
      unit_price_gbp: NEW_INSTALMENT,
      quantity: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  if (updateError) throw new Error(`${number}: ${updateError.message}`);

  const regenerated = await regeneratePortalInvoiceSharePdf(admin, String(row.id));
  if (!regenerated.ok) {
    throw new Error(`${number}: PDF regeneration failed (${regenerated.error})`);
  }
  console.log(`${number}: £${NEW_INSTALMENT.toFixed(2)} + PDF regenerated`);
}

console.log(`Eiji Autumn total: £${(NEW_INSTALMENT * INVOICE_NUMBERS.length).toFixed(2)}`);
