/**
 * One-off: generate a sample crash-course tax invoice PDF for layout review.
 * Run: npx --yes deno run -A scripts/gen-crash-invoice-preview.ts
 */
import { buildPortalTaxInvoicePdf } from "../supabase/functions/_shared/portal_tax_invoice_pdf.ts";

const today = new Date().toISOString().slice(0, 10);
const bytes = await buildPortalTaxInvoicePdf({
  invoiceNumber: "INV-P-SAMPLE",
  invoiceDateIso: today,
  dueDateIso: today,
  reference: "Elia Climbing",
  vatMode: "vat_20",
  totalGbp: 300,
  quantity: 1,
  descriptionLines: [
    "Climbing Activity - Summer crash course Jul 2026 - Week 1 weekly pack (11:00-12:00)",
    "Pay in full to confirm place.",
    "",
    "Client's Name: Elia",
    "- Reference: Elia Climbing",
    "- Mode: Bank transfer / Card (parent portal)",
    "- VAT: 20% (private funding)",
  ],
  billToName: "Parent / carer (sample)",
  billToLines: ["12 Example Street", "London", "SW1A 1AA", "UNITED KINGDOM"],
  participantName: "Elia",
  paid: false,
});

const out = new URL("../docs/sample-crash-invoice-preview.pdf", import.meta.url);
await Deno.writeFile(out, bytes);
console.log("Wrote", out.pathname, bytes.length, "bytes");
