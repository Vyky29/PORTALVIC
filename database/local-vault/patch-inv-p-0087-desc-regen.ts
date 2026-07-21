/**
 * INV-P-0087: prepend "Structured..." lead to line_description + regenerate PDF.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   deno run --allow-env --allow-net database/local-vault/patch-inv-p-0087-desc-regen.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

const LEAD = "Structured activity support delivered for a SEND participant.";
const INVOICE_NUMBER = "INV-P-0087";

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: share, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, line_description")
  .eq("invoice_number", INVOICE_NUMBER)
  .maybeSingle();

if (error || !share) {
  console.error("Invoice not found", error?.message);
  Deno.exit(1);
}

const desc = String(share.line_description || "").trim();
if (!desc.startsWith("Structured")) {
  const { error: upErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      line_description: `${LEAD}\n\n${desc}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);
  if (upErr) {
    console.error("Update failed", upErr.message);
    Deno.exit(1);
  }
  console.log("line_description updated with lead line.");
} else {
  console.log("line_description already has lead line.");
}

const r = await regeneratePortalInvoiceSharePdf(admin, String(share.id));
if (!r.ok) {
  console.error("PDF regen failed:", r.error);
  Deno.exit(1);
}
console.log("[pdf]", INVOICE_NUMBER, "→", r.pdfStoragePath);
