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
    hour12: false,
    timeZone: "Europe/London",
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

type SectionIconKind = "camera" | "pill" | "emergency" | "travel";
type RowIconKind = "check" | "cross" | "sign" | "contact" | "walk" | "bus" | "taxi" | "answer";

function drawSectionIcon(
  page: PDFPage,
  kind: SectionIconKind,
  x: number,
  yCenter: number,
  fill: RGB,
  radius = 11,
): void {
  const r = radius;
  page.drawCircle({
    x: x + r,
    y: yCenter,
    size: r,
    color: fill,
  });
  const white = rgb(1, 1, 1);
  if (kind === "camera") {
    page.drawRectangle({
      x: x + 5,
      y: yCenter - 4,
      width: 12,
      height: 8,
      borderColor: white,
      borderWidth: 1.2,
      color: fill,
    });
    page.drawCircle({
      x: x + r,
      y: yCenter - 0.2,
      size: 2.4,
      borderColor: white,
      borderWidth: 1.1,
      color: fill,
    });
  } else if (kind === "pill") {
    page.drawRectangle({
      x: x + 7,
      y: yCenter - 5.5,
      width: 8,
      height: 11,
      borderColor: white,
      borderWidth: 1.2,
      color: fill,
    });
  } else if (kind === "emergency") {
    page.drawRectangle({
      x: x + r - 1.3,
      y: yCenter - 5.5,
      width: 2.6,
      height: 11,
      color: white,
    });
    page.drawRectangle({
      x: x + 5.5,
      y: yCenter - 1.3,
      width: 11,
      height: 2.6,
      color: white,
    });
  } else {
    page.drawCircle({
      x: x + r,
      y: yCenter + 1.8,
      size: 3.4,
      borderColor: white,
      borderWidth: 1.2,
      color: fill,
    });
    page.drawRectangle({
      x: x + r - 1.1,
      y: yCenter - 6.5,
      width: 2.2,
      height: 5.5,
      color: white,
    });
  }
}

function drawRowIcon(
  page: PDFPage,
  kind: RowIconKind,
  x: number,
  yCenter: number,
  accent: RGB,
): void {
  const r = 6.5;
  const soft = rgb(
    Math.min(1, accent.red + 0.55),
    Math.min(1, accent.green + 0.55),
    Math.min(1, accent.blue + 0.55),
  );
  page.drawCircle({
    x: x + r,
    y: yCenter,
    size: r,
    color: soft,
  });
  const ink = accent;
  if (kind === "check") {
    page.drawRectangle({ x: x + 4, y: yCenter - 1, width: 3, height: 1.4, color: ink });
    page.drawRectangle({ x: x + 6.2, y: yCenter - 2.5, width: 1.4, height: 6, color: ink });
  } else if (kind === "cross") {
    page.drawRectangle({ x: x + r - 0.7, y: yCenter - 3.5, width: 1.4, height: 7, color: ink });
    page.drawRectangle({ x: x + 3.5, y: yCenter - 0.7, width: 7, height: 1.4, color: ink });
  } else if (kind === "sign") {
    page.drawRectangle({
      x: x + 4,
      y: yCenter - 3.5,
      width: 5.5,
      height: 7,
      borderColor: ink,
      borderWidth: 1,
      color: soft,
    });
    page.drawRectangle({ x: x + 5, y: yCenter + 1.5, width: 3.5, height: 1, color: ink });
    page.drawRectangle({ x: x + 5, y: yCenter - 0.5, width: 3.5, height: 1, color: ink });
  } else if (kind === "contact") {
    page.drawCircle({
      x: x + r,
      y: yCenter + 1.8,
      size: 2,
      color: ink,
    });
    page.drawRectangle({
      x: x + 4.2,
      y: yCenter - 4,
      width: 4.6,
      height: 3.2,
      color: ink,
    });
  } else if (kind === "walk") {
    page.drawCircle({ x: x + r, y: yCenter + 2.4, size: 1.6, color: ink });
    page.drawRectangle({ x: x + r - 0.7, y: yCenter - 2.5, width: 1.4, height: 4.2, color: ink });
    page.drawRectangle({ x: x + 3.8, y: yCenter - 0.2, width: 5.5, height: 1.2, color: ink });
  } else if (kind === "bus") {
    page.drawRectangle({
      x: x + 3.5,
      y: yCenter - 3.2,
      width: 6.5,
      height: 6.2,
      borderColor: ink,
      borderWidth: 1,
      color: soft,
    });
    page.drawRectangle({ x: x + 4.5, y: yCenter + 0.5, width: 1.8, height: 1.5, color: ink });
    page.drawRectangle({ x: x + 7, y: yCenter + 0.5, width: 1.8, height: 1.5, color: ink });
  } else if (kind === "taxi") {
    page.drawRectangle({
      x: x + 3.2,
      y: yCenter - 2.2,
      width: 7,
      height: 3.8,
      borderColor: ink,
      borderWidth: 1,
      color: soft,
    });
    page.drawRectangle({ x: x + 4.5, y: yCenter + 1.4, width: 4.4, height: 1.6, color: ink });
  } else {
    // answer / generic
    page.drawRectangle({
      x: x + 4,
      y: yCenter - 3,
      width: 5.5,
      height: 6,
      borderColor: ink,
      borderWidth: 1,
      color: soft,
    });
  }
}

type DetailRow = {
  icon: RowIconKind;
  label: string;
  value: string;
};

type Block = {
  icon: SectionIconKind;
  iconColor: RGB;
  title: string;
  rows: DetailRow[];
};

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
  const metaLabelSize = 10;
  const metaValueSize = 11;
  const metaLabelCol = 118;
  for (const [label, value] of meta) {
    page.drawText(label, {
      x: left,
      y,
      size: metaLabelSize,
      font: fontBold,
      color: ink,
    });
    page.drawText(value, {
      x: left + metaLabelCol,
      y,
      size: metaValueSize,
      font,
      color: ink,
      maxWidth: right - left - metaLabelCol,
    });
    y -= 15;
  }
  y -= 14;

  const photoValue =
    input.photoConsent === "yes"
      ? "YES — allow wider use (website, marketing, staff training, research / resources)."
      : "NO — progress & family portal only (no wider marketing use).";
  const medValue =
    input.medicationNeeded === "yes"
      ? `YES — medication left at the centre. Details: ${input.medicationDetails || "—"}`
      : "NO — no medication left at the centre.";
  const emergencyValue =
    input.emergencyConsent === "yes"
      ? "YES — emergency treatment may be arranged if needed."
      : "NO — do not arrange emergency treatment without further contact.";

  const blocks: Block[] = [
    {
      icon: "camera",
      iconColor: rgb(0.49, 0.23, 0.93),
      title: "Photo & media for marketing",
      rows: [
        {
          icon: input.photoConsent === "yes" ? "check" : "cross",
          label: "Consent:",
          value: photoValue,
        },
        { icon: "sign", label: "Signed by:", value: input.photoSigner || "—" },
      ],
    },
    {
      icon: "pill",
      iconColor: rgb(0.06, 0.46, 0.43),
      title: "Medication at the centre",
      rows: [
        {
          icon: input.medicationNeeded === "yes" ? "check" : "cross",
          label: "Medication:",
          value: medValue,
        },
        { icon: "sign", label: "Signed by:", value: input.medicationSigner || "—" },
      ],
    },
    {
      icon: "emergency",
      iconColor: rgb(0.73, 0.11, 0.11),
      title: "Emergency treatment",
      rows: [
        {
          icon: input.emergencyConsent === "yes" ? "check" : "cross",
          label: "Consent:",
          value: emergencyValue,
        },
        {
          icon: "contact",
          label: "Emergency contact:",
          value: `${input.emergencyContactName || "—"} · ${input.emergencyContactPhone || "—"}`,
        },
        { icon: "sign", label: "Signed by:", value: input.emergencySigner || "—" },
      ],
    },
    {
      icon: "travel",
      iconColor: rgb(0.11, 0.39, 0.85),
      title: "Off-site & transport",
      rows: [
        { icon: "walk", label: "Community walk:", value: yn(input.communityWalk) },
        { icon: "bus", label: "Public transport:", value: yn(input.publicTransport) },
        { icon: "taxi", label: "Taxi home with PA:", value: yn(input.taxiHome) },
        { icon: "sign", label: "Signed by:", value: input.offsiteSigner || "—" },
      ],
    },
  ];

  const boxPadX = 14;
  const boxInnerLeft = left + boxPadX;
  const rowIconW = 18;
  const labelGap = 6;
  const valueSize = 9;
  const labelSize = 9;
  const titleSizeBlock = 11;
  const sectionIconR = 11;
  const gapBetweenBoxes = 18;
  // Fixed label column so values line up under each other.
  const labelColW = 118;

  for (const block of blocks) {
    const measured: Array<{
      row: DetailRow;
      valueLines: string[];
    }> = [];
    let rowsH = 0;
    const valueMax =
      right - boxInnerLeft - rowIconW - labelGap - labelColW - labelGap - boxPadX;
    for (const row of block.rows) {
      const valueLines = wrapLines(row.value, font, valueSize, Math.max(40, valueMax));
      measured.push({ row, valueLines });
      rowsH += Math.max(14, valueLines.length * 12) + 5;
    }

    const headerH = sectionIconR * 2 + 6 + titleSizeBlock + 12;
    const boxH = 14 + headerH + rowsH + 12;
    if (y - boxH < 52) break;

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

    // Section icon above title — left-aligned with the detail rows.
    let cy = y - 14 - sectionIconR;
    drawSectionIcon(page, block.icon, boxInnerLeft, cy, block.iconColor, sectionIconR);
    cy -= sectionIconR + 7;

    page.drawText(block.title, {
      x: boxInnerLeft,
      y: cy - 2,
      size: titleSizeBlock,
      font: fontBold,
      color: ink,
      maxWidth: right - boxInnerLeft - boxPadX,
    });
    cy -= titleSizeBlock + 12;

    for (const m of measured) {
      const rowH = Math.max(14, m.valueLines.length * 12);
      const rowMid = cy - 3;
      drawRowIcon(page, m.row.icon, boxInnerLeft, rowMid, block.iconColor);

      const labelX = boxInnerLeft + rowIconW;
      page.drawText(m.row.label, {
        x: labelX,
        y: cy - 2,
        size: labelSize,
        font: fontBold,
        color: ink,
      });

      const valueX = labelX + labelColW;
      let vy = cy - 2;
      for (let i = 0; i < m.valueLines.length; i++) {
        page.drawText(m.valueLines[i], {
          x: valueX,
          y: vy,
          size: valueSize,
          font,
          color: ink,
          maxWidth: right - valueX - boxPadX,
        });
        vy -= 12;
      }
      cy -= rowH + 5;
    }

    y = boxBottom - gapBetweenBoxes;
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
