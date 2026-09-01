/**
 * 1) Fix vat_mode on ready shares that should be Direct Payments / LA exempt
 * 2) Regenerate ALL ready (non-void) invoice PDFs with current stamps + VAT
 *
 *   npx --yes deno run -A database/local-vault/regen-all-invoice-pdfs.ts
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { regeneratePortalInvoiceSharePdf } from "../../supabase/functions/_shared/portal_create_family_invoice.ts";
import { resolveParticipantInvoiceFunding } from "../../supabase/functions/_shared/portal_invoice_funding.ts";

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

const { data: shares, error } = await admin
  .from("portal_parent_invoice_share")
  .select(
    "id, invoice_number, contact_id, vat_mode, payment_status, share_status, line_description",
  )
  .eq("share_status", "ready")
  .neq("payment_status", "void")
  .order("invoice_number");
if (error) throw error;

const rows = shares || [];
console.log(`ready non-void shares: ${rows.length}`);

const vatFixes: Array<{ inv: string; from: string; to: string }> = [];
for (const share of rows) {
  const { data: pax } = await admin
    .from("portal_participants")
    .select("display_name, first_name, last_name")
    .eq("contact_id", share.contact_id)
    .maybeSingle();
  const displayName =
    String(pax?.display_name || "").trim() ||
    [pax?.first_name, pax?.last_name].filter(Boolean).join(" ").trim() ||
    String(share.contact_id);
  const funding = await resolveParticipantInvoiceFunding(admin, {
    contactId: String(share.contact_id),
    displayName,
  });
  const stored = String(share.vat_mode || "").toLowerCase();
  if (funding.vatMode === "exempt" && stored !== "exempt") {
    let lineDescription = String(share.line_description || "");
    const fundedLead =
      "Structured activity support delivered within aquatic, climbing, physical activity and structured activity environments for a SEND participant as part of funded provision.";
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
      .eq("id", share.id);
    if (upErr) {
      console.error("vat fix failed", share.invoice_number, upErr.message);
    } else {
      vatFixes.push({
        inv: String(share.invoice_number),
        from: stored || "(null)",
        to: "exempt",
      });
    }
  }
}
console.log("vat fixes", vatFixes);

const report: Array<{ inv: string; ok: boolean; detail: string }> = [];
for (const share of rows) {
  const inv = String(share.invoice_number || share.id);
  try {
    const r = await regeneratePortalInvoiceSharePdf(admin, share.id);
    if (r.ok) {
      report.push({ inv, ok: true, detail: r.pdfStoragePath });
      console.log("OK", inv);
    } else {
      report.push({ inv, ok: false, detail: r.error });
      console.error("FAIL", inv, r.error);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    report.push({ inv, ok: false, detail: msg });
    console.error("FAIL", inv, msg);
  }
}

const okN = report.filter((r) => r.ok).length;
const failN = report.filter((r) => !r.ok).length;
console.log(JSON.stringify({ okN, failN, vatFixes, fails: report.filter((r) => !r.ok) }, null, 2));
