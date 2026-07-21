import { buildPortalTaxInvoicePdf } from "../../../supabase/functions/_shared/portal_tax_invoice_pdf.ts";

const bytes = await buildPortalTaxInvoicePdf({
  invoiceNumber: "INV-P-PREVIEW",
  invoiceDateIso: "2026-07-16",
  dueDateIso: "2026-08-15",
  reference: "Autumn term 26/27",
  vatMode: "exempt",
  totalGbp: 3425,
  quantity: 1,
  descriptionLines: [
    "Structured activity support delivered within aquatic, climbing and physical activity environments for a SEND participant as part of funded provision. (EHCP or local authority care package).",
    "",
    "Client ID: 58",
    "PO: TEST-PO-123",
    "- Reference: Autumn term 26/27",
    "- Mode: LA funded (VAT exempt)",
    "- VAT: Exempt",
  ],
  lineItems: [
    {
      description: "Aquatic Activity 60'",
      detail: "Sunday 2 pm to 3 pm · SwimFarm",
      quantity: 14,
      unit_price_gbp: 100,
      amount_gbp: 1400,
    },
    {
      description: "Climbing Activity 60'",
      detail: "Saturday 10 am to 11 am · The Castle Climbing Centre",
      quantity: 13,
      unit_price_gbp: 75,
      amount_gbp: 975,
    },
    {
      description: "Physical Activity 60'",
      detail: "Wednesday 5 pm to 6 pm · Better Gym Islington",
      quantity: 14,
      unit_price_gbp: 75,
      amount_gbp: 1050,
    },
  ],
  billToName: "Local Authority",
  billToLines: ["SEND Finance Team", "London", "UNITED KINGDOM"],
  participantName: "Serine Hodroje",
  paymentSchedule: [],
});

await Deno.writeFile("database/local-vault/tmp/preview-multiline-invoice.pdf", bytes);
console.log("wrote preview PDF");
