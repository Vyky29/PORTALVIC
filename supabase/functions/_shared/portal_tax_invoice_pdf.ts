/**
 * Portal-generated family TAX INVOICE PDFs (Xero-like layout).
 * Templates mirror INV-0270 (Exempt) and INV-0353 (VAT 20%).
 */
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { CLUBSENSATIONAL_LOGO_PNG_B64 } from "./clubsensational_logo_b64.ts";

export type PortalInvoiceVatMode = "exempt" | "vat_20";

export type PortalInvoicePdfInput = {
  invoiceNumber: string;
  invoiceDateIso: string; // YYYY-MM-DD
  dueDateIso: string | null;
  reference: string | null;
  /** Portal programme / activity (e.g. Aquatic Activity, Climbing Activity). */
  service?: string | null;
  vatMode: PortalInvoiceVatMode;
  /** Gross amount the parent owes (incl. VAT when vat_20). */
  totalGbp: number;
  quantity: number;
  descriptionLines: string[];
  billToName: string;
  billToLines: string[];
  participantName: string;
  paid?: boolean;
  amountPaidGbp?: number | null;
  creditAppliedGbp?: number | null;
};

const VAT_NUMBER = "450697474";
const REG_OFFICE =
  "Registered Office: 71-75 Shelton Street Covent Garden, London, London, WC2H 9JQ, United Kingdom.";
const COMPANY_LINES = [
  "ClubSENsational",
  "71-75 Shelton Street",
  "Covent Garden",
  "London",
  "WC2H 9JQ",
  "UNITED KINGDOM",
];
const BANK_LINES = [
  "Account Name: ClubSENsational LTD",
  "Acc: 16987295",
  "Sort Code: 04-06-05",
];

function money(n: number): string {
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatUkDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Helvetica / WinAnsi cannot render £ and many punctuation chars cleanly. */
function pdfSafeText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\u00a3/g, "GBP ") // £
    .replace(/[\u2013\u2014\u2212]/g, "-") // en/em/minus dashes
    .replace(/[\u00b7\u2022\u2219]/g, "-") // middle dots / bullets
    .replace(/\u00d7/g, "x") // ×
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

function wrapPdfLines(text: string, maxChars = 68): string[] {
  const clean = pdfSafeText(text);
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    if (w.length <= maxChars) {
      cur = w;
    } else {
      // Hard-split very long tokens (never mid-cut a price after GBP).
      let rest = w;
      while (rest.length > maxChars) {
        lines.push(rest.slice(0, maxChars));
        rest = rest.slice(maxChars);
      }
      cur = rest;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Split total (incl VAT) into net + vat for 20% mode. */
export function splitVat20(totalIncl: number): { net: number; vat: number; total: number } {
  const total = Math.round(totalIncl * 100) / 100;
  const net = Math.round((total / 1.2) * 100) / 100;
  const vat = Math.round((total - net) * 100) / 100;
  return { net, vat, total };
}

export async function buildPortalTaxInvoicePdf(
  input: PortalInvoicePdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0, 0, 0);
  const muted = rgb(0.33, 0.33, 0.33);
  const { width, height } = page.getSize();
  const left = 50;
  const right = width - 50;

  let logoH = 0;
  try {
    const logo = await pdf.embedPng(b64ToBytes(CLUBSENSATIONAL_LOGO_PNG_B64));
    const logoW = 88;
    logoH = (logo.height / logo.width) * logoW;
    page.drawImage(logo, {
      x: right - logoW,
      y: height - 48 - logoH,
      width: logoW,
      height: logoH,
    });
  } catch {
    /* logo optional */
  }

  // Registered office (top)
  page.drawText(REG_OFFICE, {
    x: 70,
    y: height - 28,
    size: 7,
    font,
    color: muted,
  });

  // Invoice title
  page.drawText("INVOICE", {
    x: left,
    y: height - 70,
    size: 22,
    font: fontBold,
    color: ink,
  });

  // Bill to (left)
  let y = height - 110;
  page.drawText(pdfSafeText(input.billToName || "Parent"), {
    x: left,
    y,
    size: 10,
    font,
    color: ink,
  });
  y -= 13;
  for (const line of input.billToLines.filter(Boolean).slice(0, 6)) {
    page.drawText(pdfSafeText(line).slice(0, 60), {
      x: left,
      y,
      size: 9,
      font,
      color: ink,
    });
    y -= 12;
  }

  // Company address (right under logo) + VAT under UNITED KINGDOM
  let addrY = height - 48 - logoH - 14;
  for (const line of COMPANY_LINES) {
    const tw = font.widthOfTextAtSize(line, 8);
    page.drawText(line, {
      x: right - tw,
      y: addrY,
      size: 8,
      font,
      color: ink,
    });
    addrY -= 11;
  }
  {
    const vatLine = `VAT Number ${VAT_NUMBER}`;
    const tw = font.widthOfTextAtSize(vatLine, 8);
    page.drawText(vatLine, {
      x: right - tw,
      y: addrY,
      size: 8,
      font,
      color: ink,
    });
    addrY -= 11;
  }

  // Meta (Invoice Date / Number / Reference / Service) — under bill-to, above Description table
  y = Math.min(y, addrY) - 18;
  const meta = [
    ["Invoice Date", formatUkDate(input.invoiceDateIso)],
    ["Invoice Number", pdfSafeText(input.invoiceNumber)],
    ["Reference", pdfSafeText(input.reference || "").slice(0, 40) || "-"],
    ["Service", pdfSafeText(input.service || "").slice(0, 48) || "-"],
  ];
  for (const [label, val] of meta) {
    page.drawText(label, { x: left, y, size: 8, font, color: muted });
    page.drawText(val, {
      x: left + 100,
      y,
      size: 9,
      font: label === "Invoice Number" ? fontBold : font,
      color: ink,
    });
    y -= 14;
  }

  // Table header — labels centred in their columns
  y -= 16;
  page.drawLine({
    start: { x: left, y: y + 14 },
    end: { x: right, y: y + 14 },
    thickness: 0.6,
    color: rgb(0.8, 0.8, 0.8),
  });
  const colDescX = left;
  const colQtyX = left + 278;
  const colUnitX = left + 338;
  const colVatX = left + 408;
  const colAmtX = left + 458;
  const colQtyW = 58;
  const colUnitW = 68;
  const colVatW = 48;
  const colAmtW = right - colAmtX;

  function drawCentered(text: string, x: number, w: number, atY: number, size: number, f: typeof font) {
    const tw = f.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: x + Math.max(0, (w - tw) / 2),
      y: atY,
      size,
      font: f,
      color: ink,
    });
  }

  page.drawText("Description", { x: colDescX, y, size: 8, font: fontBold, color: ink });
  drawCentered("Quantity", colQtyX, colQtyW, y, 8, fontBold);
  drawCentered("Unit Price", colUnitX, colUnitW, y, 8, fontBold);
  drawCentered("VAT", colVatX, colVatW, y, 8, fontBold);
  drawCentered("Amount GBP", colAmtX, colAmtW, y, 8, fontBold);
  page.drawLine({
    start: { x: left, y: y - 8 },
    end: { x: right, y: y - 8 },
    thickness: 0.6,
    color: rgb(0.8, 0.8, 0.8),
  });

  const qty = Number(input.quantity) > 0 ? Number(input.quantity) : 1;
  const total = Math.round(Number(input.totalGbp) * 100) / 100;
  const isExempt = input.vatMode === "exempt";
  const split = isExempt
    ? { net: total, vat: 0, total }
    : splitVat20(total);
  const unitNet = Math.round((split.net / qty) * 10000) / 10000;

  // Air under header line before description body
  y -= 28;
  const descStartY = y;
  const wrappedDesc: string[] = [];
  for (const raw of input.descriptionLines.slice(0, 28)) {
    const t = String(raw ?? "");
    if (!t.trim()) {
      wrappedDesc.push("");
      continue;
    }
    wrappedDesc.push(...wrapPdfLines(t.trim(), 72));
  }
  const descLinesDraw = wrappedDesc.slice(0, 26);
  for (const line of descLinesDraw) {
    if (line) {
      page.drawText(line, {
        x: left,
        y,
        size: 9,
        font,
        color: ink,
      });
    }
    y -= 12;
  }
  const descEndY = y;
  const descBlockH = descStartY - descEndY;
  // Vertically centre qty / unit / vat / amount in the description cell
  const midY = descStartY - Math.max(0, descBlockH) / 2 - 3;

  const vatLabel = isExempt ? "Exempt" : "20%";
  drawCentered(money(qty), colQtyX, colQtyW, midY, 9, font);
  drawCentered(money(unitNet), colUnitX, colUnitW, midY, 9, font);
  drawCentered(vatLabel, colVatX, colVatW, midY, 9, font);
  drawCentered(money(split.net), colAmtX, colAmtW, midY, 9, font);

  // Air above totals rule + space before Subtotal
  y = Math.min(y, midY - 14) - 16;
  page.drawLine({
    start: { x: left, y: y + 10 },
    end: { x: right, y: y + 10 },
    thickness: 0.6,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 8;

  const drawTot = (label: string, val: string, bold = false) => {
    const f = bold ? fontBold : font;
    const size = bold ? 11 : 9;
    page.drawText(label, { x: right - 160, y, size, font: f, color: ink });
    page.drawText(val, {
      x: right - f.widthOfTextAtSize(val, size),
      y,
      size,
      font: f,
      color: ink,
    });
    y -= bold ? 16 : 14;
  };

  drawTot("Subtotal", money(split.net));
  if (isExempt) {
    drawTot("TOTAL  EXEMPT", money(0));
  } else {
    drawTot("TOTAL  VAT  20%", money(split.vat));
  }
  drawTot("TOTAL GBP", money(split.total), true);

  const credit = input.creditAppliedGbp != null ? Number(input.creditAppliedGbp) : 0;
  const paidAmt = input.amountPaidGbp != null ? Number(input.amountPaidGbp) : 0;
  if (credit > 0) drawTot("Less Family Credit", money(credit));
  if (paidAmt > 0 || input.paid) drawTot("Less Amount Paid", money(paidAmt || split.total - credit));
  const due = Math.max(0, Math.round((split.total - credit - (paidAmt || (input.paid ? split.total - credit : 0))) * 100) / 100);
  if (input.paid || credit > 0 || paidAmt > 0) {
    drawTot("AMOUNT DUE GBP", money(input.paid ? 0 : due), true);
  }

  y -= 8;
  if (input.dueDateIso) {
    page.drawText(`Due Date: ${formatUkDate(input.dueDateIso)}`, {
      x: left,
      y,
      size: 10,
      font: fontBold,
      color: ink,
    });
    y -= 16;
  }

  page.drawText("Manual Payment Details", {
    x: left,
    y,
    size: 10,
    font: fontBold,
    color: ink,
  });
  y -= 14;
  page.drawText("Bank details:", { x: left, y, size: 9, font, color: ink });
  y -= 12;
  for (const line of BANK_LINES) {
    page.drawText(line, { x: left, y, size: 9, font, color: ink });
    y -= 12;
  }

  page.drawText(REG_OFFICE, {
    x: 70,
    y: 28,
    size: 7,
    font,
    color: muted,
  });

  // Payment advice page
  const page2 = pdf.addPage([595.28, 841.89]);
  page2.drawText("PAYMENT ADVICE", {
    x: left,
    y: height - 80,
    size: 16,
    font: fontBold,
    color: ink,
  });
  let y2 = height - 120;
  page2.drawText("To: ClubSENsational", { x: left, y: y2, size: 9, font, color: ink });
  y2 -= 12;
  for (const line of [
    "71-75 Shelton Street Covent Garden",
    "London",
    "WC2H 9JQ",
    "UNITED KINGDOM",
    `VAT Number ${VAT_NUMBER}`,
  ]) {
    page2.drawText(line, { x: left, y: y2, size: 9, font, color: ink });
    y2 -= 12;
  }
  y2 -= 20;
  const advice = [
    ["Customer", pdfSafeText(input.billToName)],
    ["Invoice Number", pdfSafeText(input.invoiceNumber)],
    ["Amount Due", input.paid ? "0.00" : money(due)],
    ["Due Date", formatUkDate(input.dueDateIso) || "-"],
    ["Amount Enclosed", ""],
  ];
  for (const [label, val] of advice) {
    page2.drawText(label, { x: left, y: y2, size: 9, font, color: muted });
    page2.drawText(String(val), { x: left + 120, y: y2, size: 9, font, color: ink });
    y2 -= 16;
  }
  page2.drawText("Enter the amount you are paying above", {
    x: left,
    y: y2 - 8,
    size: 8,
    font,
    color: muted,
  });
  page2.drawText(REG_OFFICE, {
    x: 70,
    y: 28,
    size: 7,
    font,
    color: muted,
  });

  return pdf.save();
}
