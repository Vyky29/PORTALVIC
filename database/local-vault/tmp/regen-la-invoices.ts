import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../../supabase/functions/_shared/portal_create_family_invoice.ts";

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

const { data: invs, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number")
  .eq("payment_method_hint", "la_funded");
if (error) throw error;

for (const inv of invs || []) {
  const r = await regeneratePortalInvoiceSharePdf(admin, String(inv.id));
  console.log(inv.invoice_number, r.ok ? "regenerated" : `failed: ${r.error}`);
}
