/**
 * Tinashe Friday Bespoke monthly INV-P-0180..0189 (NHS ILA, Oct 2026 - Jul 2027):
 * bill-to NHS (not Ealing BST), Client's ID 594072, Reference PO 910006639.
 * Uses the funder key on ready_by (..._tinashe-nhs). Dry run shows the resolved funder; --apply regenerates PDFs.
 * Approved by Victor 15 Oct 2026 ("dejalas al nombre de NHS").
 *
 *   npx -y deno run -A database/local-vault/office-tinashe-nhs-invp-0180-0189-regen-20261015.ts [--apply]
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  funderClientKeyFromReadyBy,
  resolveLaFunderBillTo,
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
const NUMS = Array.from({ length: 10 }, (_, i) => `INV-P-0${180 + i}`);

const admin = createClient(
  Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data: rows, error } = await admin
  .from("portal_parent_invoice_share")
  .select("id, invoice_number, contact_id, ready_by, payment_status, share_status, xero_invoice_id, reference_text, amount_gbp")
  .in("invoice_number", NUMS)
  .order("invoice_number");
if (error) throw error;

for (const r of rows || []) {
  const key = funderClientKeyFromReadyBy(r.ready_by);
  if (key !== "tinashe-nhs") {
    console.log(`${r.invoice_number}: ready_by ${r.ready_by} is not tinashe-nhs - skip`);
    continue;
  }
  if (r.xero_invoice_id) {
    console.log(`${r.invoice_number}: already in Xero - skip`);
    continue;
  }
  const billTo = await resolveLaFunderBillTo(admin, { contactId: r.contact_id, displayName: "Tinashe Nekati", funderClientKey: key });
  const funding = await resolveParticipantInvoiceFunding(admin, { contactId: r.contact_id, displayName: "Tinashe Nekati", funderClientKey: key });
  console.log(
    `${r.invoice_number} | ${r.reference_text} | £${r.amount_gbp} | ${r.payment_status}/${r.share_status} | bill-to ${billTo.name} | client ${funding.clientId} | PO ${funding.po}`,
  );
  if (!/^NHS /.test(billTo.name) || funding.clientId !== "594072" || funding.po !== "910006639") {
    console.log("   unexpected funder - abort");
    Deno.exit(1);
  }
  if (APPLY) {
    const res = await regeneratePortalInvoiceSharePdf(admin, r.id);
    console.log(`   regen ${JSON.stringify(res)}`);
    if (!res.ok) Deno.exit(1);
  }
}
if (!APPLY) console.log("dry run. Re-run with --apply.");
