/**
 * Annual parent consents PDF (logo + signed answers) for parent hub / admin docs.
 */
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, RGB } from "https://esm.sh/pdf-lib@1.17.1";
import { CLUBSENSATIONAL_LOGO_PNG_B64 } from "./clubsensational_logo_b64.ts";

export type PortalConsentsPdfInput = {
  participantName: string;
  participantDob?: string | null;
  parentName?: string | null;
  signedAtIso: string;
  validUntilIso?: string | null;
  photoConsent: "yes" | "no";
  photoSigner: string;
  medicationNeeded: "yes" | "no";
  medicationDetails: string;
  medicationSigner: string;
  emergencyConsent: "yes" | "no";
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencySigner: string;
  communityWalk: "yes" | "no";
  publicTransport: "yes" | "no";
  taxiHome: "yes" | "no";
  offsiteSigner: string;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function formatUkDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUkDate(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  return formatUkDateTime(iso).split(",")[0] || "";
}

function yn(v: "yes" | "no"): string {
  return v === "yes" ? "YES" : "NO";
}

function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

type IconKind = "camera" | "pill" | "emergency" | "travel";

function drawSectionIcon(
  page: PDFPage,
  kind: IconKind,
  x: number,
  yCenter: number,
  fill: RGB,
): void {
  const r = 10;
  page.drawCircle({
    x: x + r,
    y: yCenter,
    size: r,
    color: fill,
  });
  const white = rgb(1, 1, 1);
  // Simple white glyphs inside the circle (paths relative to icon centre).
  if (kind === "camera") {
    page.drawRectangle({
      x: x + 5,
      y: yCenter - 4,
      width: 10,
      height: 7,
      borderColor: white,
      borderWidth: 1.2,
      color: fill,
    });
    page.drawCircle({
      x: x + r,
      y: yCenter - 0.5,
      size: 2.2,
      borderColor: white,
      borderWidth: 1.1,
      color: fill,
    });
  } else if (kind === "pill") {
    page.drawRectangle({
      x: x + 6,
      y: yCenter - 5,
      width: 8,
      height: 10,
      borderColor: white,
      borderWidth: 1.2,
      color: fill,
    });
  } else if (kind === "emergency") {
    page.drawRectangle({
      x: x + r - 1.2,
      y: yCenter - 5,
      width: 2.4,
      height: 10,
      color: white,
    });
    page.drawRectangle({
      x: x + 5,
      y: yCenter - 1.2,
      width: 10,
      height: 2.4,
      color: white,
    });
  } else {
    // travel / map pin-ish
    page.drawCircle({
      x: x + r,
      y: yCenter + 1.5,
      size: 3.2,
      borderColor: white,
      borderWidth: 1.2,
      color: fill,
    });
    page.drawRectangle({
      x: x + r - 1,
      y: yCenter - 6,
      width: 2,
      height: 5,
      color: white,
    });
  }
}

export async function buildPortalConsentsPdf(
  input: PortalConsentsPdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.4, 0.42, 0.46);
  const accent = rgb(0.45, 0.25, 0.85);
  const ok = rgb(0.08, 0.45, 0.28);
  const { width, height } = page.getSize();
  const left = 48;
  const right = width - 48;

  // Header: logo centred above the title (no side overlap).
  const logoBox = 56;
  let y = height - 36;
  try {
    const logo = await pdf.embedPng(b64ToBytes(CLUBSENSATIONAL_LOGO_PNG_B64));
    const natW = logo.width || 1;
    const natH = logo.height || 1;
    const scale = Math.min(logoBox / natW, logoBox / natH);
    const drawW = natW * scale;
    const drawH = natH * scale;
    const logoX = left + (right - left - drawW) / 2;
    const logoY = y - drawH;
    page.drawImage(logo, {
      x: logoX,
      y: logoY,
      width: drawW,
      height: drawH,
    });
    y = logoY - 14;
  } catch {
    /* logo optional */
  }

  const titleSize = 16;
  page.drawText("ClubSENsational", {
    x: left,
    y,
    size: titleSize,
    font: fontBold,
    color: ink,
    maxWidth: right - left,
  });
  y -= 18;
  page.drawText("Annual consents form", {
    x: left,
    y,
    size: 11,
    font: fontBold,
    color: accent,
    maxWidth: right - left,
  });
  y -= 14;
  page.drawText("Parent / carer permissions — valid for one year from signing.", {
    x: left,
    y,
    size: 8,
    font,
    color: muted,
    maxWidth: right - left,
  });
  y -= 16;

  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1,
    color: rgb(0.85, 0.86, 0.88),
  });
  y -= 16;

  const meta: Array<[string, string]> = [
    ["Participant", input.participantName || "—"],
    ["Date of birth", formatUkDate(input.participantDob) || "—"],
    ["Signed at", formatUkDateTime(input.signedAtIso) || "—"],
    ["Valid until", formatUkDate(input.validUntilIso) || "—"],
  ];
  if (input.parentName) meta.splice(2, 0, ["Parent / carer", input.parentName]);
  // Meta values must stay smaller than the document title (titleSize).
  const metaLabelSize = 8;
  const metaValueSize = 9;
  for (const [label, value] of meta) {
    page.drawText(label, { x: left, y, size: metaLabelSize, font, color: muted });
    page.drawText(value, {
      x: left + 92,
      y,
      size: metaValueSize,
      font,
      color: ink,
      maxWidth: right - left - 92,
    });
    y -= 13;
  }
  y -= 10;

  type Block = {
    icon: IconKind;
    iconColor: RGB;
    title: string;
    lines: string[];
  };

  const photoLine =
    input.photoConsent === "yes"
      ? "YES — allow wider use (website, marketing, staff training, research / resources)."
      : "NO — progress & family portal only (no wider marketing use).";
  const medLine =
    input.medicationNeeded === "yes"
      ? `YES — medication left at the centre. Details: ${input.medicationDetails || "—"}`
      : "NO — no medication left at the centre.";
  const emergencyLine =
    input.emergencyConsent === "yes"
      ? "YES — emergency treatment may be arranged if needed."
      : "NO — do not arrange emergency treatment without further contact.";

  const blocks: Block[] = [
    {
      icon: "camera",
      iconColor: rgb(0.49, 0.23, 0.93),
      title: "Photo & media for marketing",
      lines: [photoLine, `Signed by: ${input.photoSigner || "—"}`],
    },
    {
      icon: "pill",
      iconColor: rgb(0.06, 0.46, 0.43),
      title: "Medication at the centre",
      lines: [medLine, `Signed by: ${input.medicationSigner || "—"}`],
    },
    {
      icon: "emergency",
      iconColor: rgb(0.73, 0.11, 0.11),
      title: "Emergency treatment",
      lines: [
        emergencyLine,
        `Emergency contact: ${input.emergencyContactName || "—"} · ${input.emergencyContactPhone || "—"}`,
        `Signed by: ${input.emergencySigner || "—"}`,
      ],
    },
    {
      icon: "travel",
      iconColor: rgb(0.11, 0.39, 0.85),
      title: "Off-site & transport",
      lines: [
        `Community walk: ${yn(input.communityWalk)}`,
        `Public transport: ${yn(input.publicTransport)}`,
        `Taxi home with PA: ${yn(input.taxiHome)}`,
        `Signed by: ${input.offsiteSigner || "—"}`,
      ],
    },
  ];

  const contentWidth = right - left - 12;
  for (const block of blocks) {
    const wrapped: string[] = [];
    for (const line of block.lines) {
      wrapped.push(...wrapLines(line, font, 9, contentWidth - 8));
    }
    const bodyH = wrapped.length * 12;
    const boxH = 28 + bodyH + 12;
    if (y - boxH < 48) break;

    const boxBottom = y - boxH;
    page.drawRectangle({
      x: left - 2,
      y: boxBottom,
      width: right - left + 4,
      height: boxH,
      borderColor: rgb(0.88, 0.89, 0.92),
      borderWidth: 1,
      color: rgb(0.985, 0.985, 0.99),
    });

    const titleY = y - 18;
    drawSectionIcon(page, block.icon, left + 6, titleY + 3, block.iconColor);
    page.drawText(block.title, {
      x: left + 32,
      y: titleY,
      size: 11,
      font: fontBold,
      color: ink,
      maxWidth: contentWidth - 28,
    });

    let ly = titleY - 16;
    for (const line of wrapped) {
      page.drawText(line, {
        x: left + 8,
        y: ly,
        size: 9,
        font,
        color: ink,
        maxWidth: contentWidth,
      });
      ly -= 12;
    }
    y = boxBottom - 10;
  }

  page.drawText("Record generated by ClubSENsational Parent Portal.", {
    x: left,
    y: Math.max(36, y),
    size: 8,
    font,
    color: muted,
  });
  page.drawText("Keep this PDF with the participant file. Renew annually.", {
    x: left,
    y: Math.max(24, y - 12),
    size: 8,
    font,
    color: ok,
  });

  return pdf.save();
}
