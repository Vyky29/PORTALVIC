/**
 * Regenerate PDF for specific INV-P numbers after vat_mode fix.
 *   deno run -A database/local-vault/tmp/regen-exempt-vat-pdfs.ts
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

const NUMBERS = (Deno.env.get("INVOICES") ||
  "INV-P-0014,INV-P-0015,INV-P-0016,INV-P-0017,INV-P-0083,INV-P-0084,INV-P-0085,INV-P-0086,INV-P-0094,INV-P-0095,INV-P-0096")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, vat_mode, share_status")
  .in("invoice_number", NUMBERS);
if (error) throw error;

for (const row of data || []) {
  console.log("regen", row.invoice_number, "vat=", row.vat_mode);
  const r = await regeneratePortalInvoiceSharePdf(admin, row.id);
  console.log(" ", r);
}
