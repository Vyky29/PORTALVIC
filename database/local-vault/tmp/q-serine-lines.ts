import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Serine reference rows + one Hazem row for comparison
const { data } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "invoice_number, contact_id, amount_gbp, billing_term, vat_mode, line_items, line_description, payment_schedule, xero_invoice_id, stripe_checkout_session_id, payment_status, amount_paid_gbp",
  )
  .in("invoice_number", ["INV-P-0087", "INV-P-0079", "INV-P-0018", "INV-P-0060", "INV-P-0072"]);
console.log(JSON.stringify(data, null, 2));

// Which old reenrolment invoices are already in Xero or have Stripe sessions?
const { data: flags } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, xero_invoice_id, stripe_checkout_session_id, payment_status, amount_paid_gbp")
  .eq("created_via", "reenrolment")
  .order("invoice_number");
for (const f of flags || []) {
  console.log(
    f.invoice_number,
    "| xero:", f.xero_invoice_id ? "YES" : "-",
    "| stripe:", f.stripe_checkout_session_id ? "YES" : "-",
    "| status:", f.payment_status,
    "| paid:", f.amount_paid_gbp,
  );
}
