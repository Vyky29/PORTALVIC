/**
 * INV-P-0556 (Tinashe NHS September top-up): the NHS PDF block drops text after "·", so the
 * rate-correction wording vanished. Rewrites the line description with " - " and regenerates.
 *
 *   npx -y deno run -A database/local-vault/office-tinashe-invp-0556-description-20261015.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { writeFileSync } from "node:fs";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "../../supabase/functions/_shared/portal_xero_product_catalog.ts";

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

const { data: r, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, line_items, xero_invoice_id")
  .eq("invoice_number", "INV-P-0556")
  .maybeSingle();
if (error) throw error;
if (!r?.id || r.xero_invoice_id) throw new Error("INV-P-0556 missing or already in Xero");
const lines = (r.line_items as PortalInvoiceLineItem[]).map((l) => ({
  ...l,
  description:
    "Rate correction - 90' Bespoke Programme, Fridays - agreed GBP 364.68 per session (357.42 + 2.03%), INV-P-0179 billed GBP 187.50",
}));
const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    line_items: lines,
    line_description: lineItemsToDescription(lines, { fundedProvision: true }),
    updated_at: new Date().toISOString(),
  })
  .eq("id", r.id);
if (upErr) throw upErr;
const stored = await regeneratePortalInvoiceSharePdf(admin, r.id);
if (!stored.ok) throw new Error(`pdf ${stored.error}`);
const bytes = await regeneratePortalInvoiceSharePdf(admin, r.id, { mode: "bytes" });
if (!bytes.ok || !("pdfBytes" in bytes)) throw new Error("bytes");
writeFileSync("docs/finance/tinashe-nhs-2026-27/INV-P-0556.pdf", bytes.pdfBytes);
console.log("WROTE docs/finance/tinashe-nhs-2026-27/INV-P-0556.pdf");
