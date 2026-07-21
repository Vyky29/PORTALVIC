import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const contactId = "elia-matilla-demo";
const invoiceNumbers = ["INV-P-0991", "INV-P-0992", "INV-P-0993"];

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number")
  .eq("contact_id", contactId)
  .in("invoice_number", invoiceNumbers);

if (error || !shares?.length) {
  console.error("No shares found", error?.message);
  Deno.exit(1);
}

for (const share of shares) {
  const r = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
  if (!r.ok) {
    console.error("regen failed", share.invoice_number, r.error);
    Deno.exit(1);
  }
  console.log("[pdf]", share.invoice_number, "→", r.pdfStoragePath);
}
