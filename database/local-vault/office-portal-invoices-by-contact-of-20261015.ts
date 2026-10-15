/**
 * Read only. All portal INV-Ps for the contact that owns a given invoice number (arg), with schedule.
 *
 *   npx -y deno run -A database/local-vault/office-portal-invoices-by-contact-of-20261015.ts INV-P-0095
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

function loadEnv(path: string) {
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
loadEnv("local-secrets/secrets.env");
loadEnv("database/local-vault/private/parent-portal-secrets.env");
const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: one } = await admin.from("portal_parent_invoice_share").select("contact_id").eq("invoice_number", Deno.args[0]).single();
const { data } = await admin
  .from("portal_parent_invoice_share")
  .select("invoice_number, reference_text, amount_gbp, amount_paid_gbp, payment_status, share_status, xero_invoice_id, payment_schedule")
  .eq("contact_id", one!.contact_id)
  .order("invoice_number");
for (const r of data || []) {
  const sched = (Array.isArray(r.payment_schedule) ? r.payment_schedule : [])
    .map((x: any) => `${x.amount_gbp}@${x.due_date}:${x.status}${x.paid_at ? "(" + String(x.paid_at).slice(0, 10) + " " + (x.paid_via || "") + ")" : ""}`)
    .join(" ; ");
  console.log(`${r.invoice_number} | ${r.reference_text} | £${r.amount_gbp} paid £${r.amount_paid_gbp} | ${r.payment_status}/${r.share_status} | xero ${r.xero_invoice_id ? "yes" : "-"} | ${sched}`);
}
