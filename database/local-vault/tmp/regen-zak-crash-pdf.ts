/**
 * Regen Zakariya crash PDF after stamp + line layout fix.
 *   npx -y deno run -A database/local-vault/tmp/regen-zak-crash-pdf.ts
 */
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

const { data, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, share_status")
  .eq("invoice_number", "INV-P-CRASH-MRMCPDUG")
  .maybeSingle();
if (error || !data) throw new Error(error?.message || "missing");
console.log(data);
const r = await regeneratePortalInvoiceSharePdf(admin, data.id);
console.log(r);
