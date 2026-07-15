/**
 * One-off: generate sample crash-course tax invoice PDFs (private + exempt).
 * Run: npx --yes deno run -A scripts/gen-crash-invoice-preview.ts
 */
import { buildPortalTaxInvoicePdf } from "../supabase/functions/_shared/portal_tax_invoice_pdf.ts";
import { buildCrashSummerInvoiceDescription } from "../supabase/functions/_shared/crash_summer_2026.ts";

const today = new Date().toISOString().slice(0, 10);

const privateDesc = buildCrashSummerInvoiceDescription({
  vatMode: "vat_20",
  weekId: "w1",
  mode: "weekly_pack",
  activities: ["climbing"],
  lines: [
    { activity: "climbing", session_date: "2026-07-21", slot_id: "c1", slot_label: "11:00–12:00" },
    { activity: "climbing", session_date: "2026-07-22", slot_id: "c1", slot_label: "11:00–12:00" },
    { activity: "climbing", session_date: "2026-07-23", slot_id: "c1", slot_label: "11:00–12:00" },
    { activity: "climbing", session_date: "2026-07-24", slot_id: "c1", slot_label: "11:00–12:00" },
  ],
  participantName: "Elia",
  clientId: "elia-matilla-demo",
  po: "",
});

const exemptDesc = buildCrashSummerInvoiceDescription({
  vatMode: "exempt",
  weekId: "w1",
  mode: "weekly_pack",
  activities: ["climbing"],
  lines: [
    { activity: "climbing", session_date: "2026-07-21", slot_id: "c1", slot_label: "11:00–12:00" },
    { activity: "climbing", session_date: "2026-07-22", slot_id: "c1", slot_label: "11:00–12:00" },
    { activity: "climbing", session_date: "2026-07-23", slot_id: "c1", slot_label: "11:00–12:00" },
    { activity: "climbing", session_date: "2026-07-24", slot_id: "c1", slot_label: "11:00–12:00" },
  ],
  participantName: "Elia",
  clientId: "",
  po: "",
});

async function writeSample(
  name: string,
  vatMode: "vat_20" | "exempt",
  description: string,
  totalGbp: number,
) {
  const bytes = await buildPortalTaxInvoicePdf({
    invoiceNumber: vatMode === "exempt" ? "INV-P-SAMPLE-EX" : "INV-P-SAMPLE",
    invoiceDateIso: today,
    dueDateIso: today,
    reference: "Summer term 25/26",
    service: "Climbing Activity",
    vatMode,
    totalGbp,
    quantity: 1,
    descriptionLines: description.split("\n"),
    billToName: "Parent / carer (sample)",
    billToLines: ["12 Example Street", "London", "SW1A 1AA", "UNITED KINGDOM"],
    participantName: "Elia",
    paid: false,
  });
  const out = new URL(`../docs/${name}`, import.meta.url);
  await Deno.writeFile(out, bytes);
  console.log("Wrote", out.pathname, bytes.length, "bytes");
  console.log("--- description ---");
  console.log(description);
}

await writeSample("sample-crash-invoice-preview.pdf", "vat_20", privateDesc, 300);
await writeSample("sample-crash-invoice-exempt-preview.pdf", "exempt", exemptDesc, 300);
