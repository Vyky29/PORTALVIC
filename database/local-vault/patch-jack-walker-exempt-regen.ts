/**
 * Jack Walker (gap-jack-walker) INV-P-0110: force VAT exempt (Direct Payments)
 * and regenerate the tax PDF.
 *
 *   npx --yes deno run -A database/local-vault/patch-jack-walker-exempt-regen.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

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

const SHARE_ID = "6a9f2e5a-5241-444a-be3d-678d09a9ba39";

const admin = createClient(
  secret("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  secret("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: before, error: loadErr } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, contact_id, vat_mode, amount_gbp, line_description")
  .eq("id", SHARE_ID)
  .maybeSingle();
if (loadErr || !before) {
  console.error(loadErr || "share_not_found");
  Deno.exit(1);
}
console.log("before", before);

const fundedLead =
  "Structured activity support delivered within aquatic, climbing, physical activity and structured activity environments for a SEND participant as part of funded provision.";
let lineDescription = String(before.line_description || "");
if (!/funded provision/i.test(lineDescription)) {
  lineDescription = lineDescription.replace(
    /^Structured activity support delivered for a SEND participant\.?/i,
    fundedLead,
  );
  if (!/funded provision/i.test(lineDescription)) {
    lineDescription = `${fundedLead}\n\n${lineDescription}`.trim();
  }
}

const { error: upErr } = await admin
  .from("portal_parent_invoice_share")
  .update({
    vat_mode: "exempt",
    line_description: lineDescription,
    updated_at: new Date().toISOString(),
  })
  .eq("id", SHARE_ID);
if (upErr) {
  console.error(upErr);
  Deno.exit(1);
}

const regen = await regeneratePortalInvoiceSharePdf(admin, SHARE_ID);
console.log("regen", regen);

const { data: after } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, vat_mode, amount_gbp")
  .eq("id", SHARE_ID)
  .maybeSingle();
console.log("after", after);
