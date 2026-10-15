/**
 * Amar-Rai Ealing year INV-P-0330: regenerate PDF so Client ID shows Ealing 626186 (was portal contact 130).
 * Approved by Victor 15 Oct 2026. Dry run by default.
 *
 *   npx -y deno run -A database/local-vault/office-amar-rai-invp-0330-client-id-regen-20261015.ts [--apply]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  funderClientKeyFromReadyBy,
  resolveParticipantInvoiceFunding,
} from "../../supabase/functions/_shared/portal_invoice_funding.ts";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";

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

const APPLY = Deno.args.includes("--apply");
const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: r, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, contact_id, ready_by, payment_status, amount_paid_gbp, xero_invoice_id")
  .eq("invoice_number", "INV-P-0330")
  .single();
if (error) throw error;
const funding = await resolveParticipantInvoiceFunding(admin, {
  contactId: r.contact_id,
  displayName: "Amar-Rai Singh",
  funderClientKey: funderClientKeyFromReadyBy(r.ready_by),
});
console.log(`${r.invoice_number} | ${r.payment_status} | paid £${r.amount_paid_gbp} | xero ${r.xero_invoice_id || "-"} | client ID now ${funding.clientId}`);
if (funding.clientId !== "626186") {
  console.log("unexpected client ID - abort");
  Deno.exit(1);
}
if (!APPLY) {
  console.log("dry run. Re-run with --apply.");
  Deno.exit(0);
}
const res = await regeneratePortalInvoiceSharePdf(admin, r.id);
console.log(`regen ${JSON.stringify(res)}`);
