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

const { data: invoices, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id,invoice_number,contact_id,amount_gbp,amount_paid_gbp,due_date,payment_status,paid_at,paid_via,payment_method_hint,payment_schedule,billing_term,reference_text,line_items,xero_invoice_id,stripe_checkout_session_id,stripe_payment_intent_id,gocardless_payment_id,gocardless_mandate_id,parent_reported_paid_at,share_status",
  )
  .eq("created_via", "reenrolment")
  .neq("payment_status", "void")
  .order("invoice_number");
if (error) throw error;

console.log("INVOICES");
for (const r of invoices || []) {
  console.log(JSON.stringify({
    n: r.invoice_number, id: r.id, c: r.contact_id, amount: r.amount_gbp,
    amount_paid: r.amount_paid_gbp, due: r.due_date, status: r.payment_status,
    paid_at: r.paid_at, paid_via: r.paid_via, hint: r.payment_method_hint,
    schedule: r.payment_schedule, term: r.billing_term, ref: r.reference_text,
    lines: Array.isArray(r.line_items) ? r.line_items.length : 0,
    xero: r.xero_invoice_id, stripe_session: r.stripe_checkout_session_id,
    stripe_pi: r.stripe_payment_intent_id, gc_payment: r.gocardless_payment_id,
    gc_mandate: r.gocardless_mandate_id, parent_paid: r.parent_reported_paid_at,
    share: r.share_status,
  }));
}

const ids = (invoices || []).map((r) => String(r.id));
const { data: credits, error: creditErr } = await admin
  .from("portal_parent_family_credits")
  .select("id,contact_id,amount_gbp,status,applied_invoice_share_id,applied_at,notes")
  .in("applied_invoice_share_id", ids);
if (creditErr) console.log("credit error", creditErr.message);
console.log("CREDITS", JSON.stringify(credits || [], null, 2));

const { data: matches, error: matchErr } = await admin
  .from("portal_tide_transaction_matches")
  .select("id,suggested_invoice_share_id,status,confirmed_at")
  .in("suggested_invoice_share_id", ids);
if (matchErr) console.log("matches error", matchErr.message);
console.log("TIDE", JSON.stringify(matches || [], null, 2));
