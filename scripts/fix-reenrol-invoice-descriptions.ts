/**
 * Fix tailored re-enrol invoice lead descriptions + rebuild TAX INVOICE PDFs.
 *
 * Targets rows whose line_description still embeds the participant name
 * ("Structured activity support for …").
 *
 *   npx --yes deno run -A scripts/fix-reenrol-invoice-descriptions.ts
 *   npx --yes deno run -A scripts/fix-reenrol-invoice-descriptions.ts --contact=114
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildReenrolmentInvoiceLeadDescription } from "../supabase/functions/_shared/reenrolment_auto_invoices.ts";
import { buildPortalTaxInvoicePdf } from "../supabase/functions/_shared/portal_tax_invoice_pdf.ts";

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = Deno.readTextFileSync(path);
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    /* optional */
  }
  return out;
}

const rootEnv = {
  ...loadEnv(new URL("../local-secrets/secrets.env", import.meta.url).pathname),
  ...loadEnv(new URL("../database/local-vault/.env", import.meta.url).pathname),
};
const url = Deno.env.get("SUPABASE_URL") || rootEnv.SUPABASE_URL || "";
const service =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || rootEnv.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !service) {
  console.error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const contactFilter = (() => {
  const arg = Deno.args.find((a) => a.startsWith("--contact="));
  return arg ? arg.slice("--contact=".length).trim() : "";
})();

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let q = admin
  .from("portal_parent_invoice_share")
  .select(
    "id, contact_id, document_id, invoice_number, amount_gbp, due_date, vat_mode, quantity, created_at, payment_status, payment_method_hint, line_description, reference_text, created_via",
  )
  .eq("created_via", "reenrolment")
  .ilike("line_description", "%Structured activity support for%")
  .order("invoice_number", { ascending: true })
  .limit(200);
if (contactFilter) q = q.eq("contact_id", contactFilter);

const { data: shares, error } = await q;
if (error) {
  console.error(error.message);
  Deno.exit(1);
}
if (!(shares || []).length) {
  console.log("No tailored re-enrol descriptions found.");
  Deno.exit(0);
}

function extractLabel(lineDescription: string, academicYear: string): string {
  const raw = String(lineDescription || "");
  const year = academicYear || "2026-27";
  const re = new RegExp(
    `Re-enrolment\\s+${year.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[—\\-]\\s*(.+?)\\.\\s*Structured`,
    "i",
  );
  const m = raw.match(re);
  if (m && m[1]) return m[1].trim();
  const m2 = raw.match(/Re-enrolment\s+[^\s—\-]+\s*[—\-]\s*(.+?)\.\s*Structured/i);
  return m2 && m2[1] ? m2[1].trim() : "Payment";
}

for (const share of shares || []) {
  const contactId = String(share.contact_id);
  const academicYear = "2026-27";
  const label = extractLabel(String(share.line_description || ""), academicYear);
  const newLead = buildReenrolmentInvoiceLeadDescription(academicYear, label);

  const { data: participant } = await admin
    .from("portal_participants")
    .select("display_name, first_name, last_name")
    .eq("contact_id", contactId)
    .maybeSingle();
  const displayName =
    String(participant?.display_name || "").trim() ||
    [participant?.first_name, participant?.last_name].filter(Boolean).join(" ").trim() ||
    contactId;

  const { data: parentContact } = await admin
    .from("portal_parent_contacts")
    .select(
      "parent_display, parent_first_name, parent_last_name, address_line1, address_line2, city, postcode",
    )
    .eq("contact_id", contactId)
    .maybeSingle();

  const billToName =
    String(parentContact?.parent_display || "").trim() ||
    [parentContact?.parent_first_name, parentContact?.parent_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Parent / carer";
  const billToLines = [
    parentContact?.address_line1,
    parentContact?.address_line2,
    parentContact?.city,
    parentContact?.postcode,
    "UNITED KINGDOM",
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  const vatMode = share.vat_mode === "exempt" ? "exempt" : "vat_20";
  const hint = String(share.payment_method_hint || "bank_transfer");
  const modeLabel =
    hint === "gocardless"
      ? "Direct Payment (GoCardless)"
      : hint === "payment_link"
        ? "Card / Apple Pay"
        : "Bank transfer / Card (parent portal)";
  const reference =
    String(share.reference_text || "").trim() ||
    `${label} ${academicYear.replace("2026-27", "26/27")}`;
  const quantity = Number(share.quantity) || 1;
  const descriptionLines = [
    ...newLead.split("\n"),
    "",
    `Client's Name: ${displayName}`,
    reference ? `- Reference: ${reference}` : null,
    `- Mode: ${modeLabel}`,
    vatMode === "exempt" ? "- VAT: Exempt" : "- VAT: 20% (private funding)",
  ].filter((x): x is string => !!x);

  const dueDate = share.due_date
    ? String(share.due_date).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const invoiceDate = String(share.created_at || "").slice(0, 10) || dueDate;

  const pdfBytes = await buildPortalTaxInvoicePdf({
    invoiceNumber: String(share.invoice_number),
    invoiceDateIso: invoiceDate,
    dueDateIso: dueDate,
    reference,
    service: null,
    vatMode,
    totalGbp: Number(share.amount_gbp),
    quantity,
    descriptionLines,
    billToName,
    billToLines,
    participantName: displayName,
    paid: String(share.payment_status) === "paid",
  });

  const { data: doc } = await admin
    .from("documents")
    .select("id, user_id, file_url")
    .eq("id", share.document_id)
    .maybeSingle();
  if (!doc?.id || !doc.user_id) {
    console.error("skip", share.invoice_number, "missing document");
    continue;
  }

  const stamp = Date.now();
  const storagePath = `${doc.user_id}/billing/client_invoice_${contactId}_${stamp}.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) {
    console.error("upload failed", share.invoice_number, upErr.message);
    continue;
  }

  const oldPath = String(doc.file_url || "").trim();
  await admin
    .from("documents")
    .update({
      file_url: storagePath,
      title: `Invoice ${share.invoice_number} — ${displayName}`,
      source_page: "reenrolment_desc_fix",
    })
    .eq("id", doc.id);

  await admin
    .from("portal_parent_invoice_share")
    .update({
      line_description: newLead,
      updated_at: new Date().toISOString(),
    })
    .eq("id", share.id);

  if (oldPath && oldPath !== storagePath) {
    await admin.storage.from("documents").remove([oldPath]).catch(() => null);
  }

  console.log("fixed", share.invoice_number, "→", label, `(${pdfBytes.length} bytes)`);
}

console.log("done", (shares || []).length, "invoice(s)");
