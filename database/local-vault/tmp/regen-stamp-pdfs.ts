/**
 * Regen Zakariya (paid stamp) + Rodin INV-P-0075 (draft stamp).
 *   npx -y deno run -A database/local-vault/tmp/regen-stamp-pdfs.ts
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

const NUMBERS = ["INV-P-CRASH-MRMCPDUG", "INV-P-0075"];

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, payment_status, share_status")
  .in("invoice_number", NUMBERS);
if (error) throw error;
for (const row of data || []) {
  console.log("regen", row.invoice_number, row.payment_status);
  console.log(await regeneratePortalInvoiceSharePdf(admin, row.id));
}
