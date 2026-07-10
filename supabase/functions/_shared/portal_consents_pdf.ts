/**
 * Annual parent consents PDF (logo + signed answers) for parent hub / admin docs.
 */
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
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
  let y = height - 42;

  try {
    const logo = await pdf.embedPng(b64ToBytes(CLUBSENSATIONAL_LOGO_PNG_B64));
    const logoW = 72;
    const logoH = (logo.height / logo.width) * logoW;
    page.drawImage(logo, {
      x: right - logoW,
      y: y - logoH + 8,
      width: logoW,
      height: logoH,
    });
  } catch {
    /* logo optional */
  }

  page.drawText("ClubSENsational", {
    x: left,
    y,
    size: 16,
    font: fontBold,
    color: ink,
  });
  y -= 18;
  page.drawText("Annual consents form", {
    x: left,
    y,
    size: 12,
    font: fontBold,
    color: accent,
  });
  y -= 14;
  page.drawText("Parent / carer permissions — valid for one year from signing.", {
    x: left,
    y,
    size: 9,
    font,
    color: muted,
  });
  y -= 22;

  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 1,
    color: rgb(0.85, 0.86, 0.88),
  });
  y -= 20;

  const meta: Array<[string, string]> = [
    ["Participant", input.participantName || "—"],
    ["Date of birth", formatUkDate(input.participantDob) || "—"],
    ["Signed at", formatUkDateTime(input.signedAtIso) || "—"],
    ["Valid until", formatUkDate(input.validUntilIso) || "—"],
  ];
  for (const [label, value] of meta) {
    page.drawText(label, { x: left, y, size: 8, font, color: muted });
    page.drawText(value, {
      x: left + 88,
      y,
      size: 10,
      font: fontBold,
      color: ink,
      maxWidth: right - left - 88,
    });
    y -= 16;
  }
  y -= 8;

  type Block = { title: string; lines: string[] };
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
      title: "1. Photo & media for marketing",
      lines: [
        photoLine,
        `Signed by: ${input.photoSigner || "—"}`,
      ],
    },
    {
      title: "2. Medication at the centre",
      lines: [
        medLine,
        `Signed by: ${input.medicationSigner || "—"}`,
      ],
    },
    {
      title: "3. Emergency treatment",
      lines: [
        emergencyLine,
        `Emergency contact: ${input.emergencyContactName || "—"} · ${input.emergencyContactPhone || "—"}`,
        `Signed by: ${input.emergencySigner || "—"}`,
      ],
    },
    {
      title: "4. Off-site / transport",
      lines: [
        `Community walk: ${yn(input.communityWalk)}`,
        `Public transport: ${yn(input.publicTransport)}`,
        `Taxi home with PA: ${yn(input.taxiHome)}`,
        `Signed by: ${input.offsiteSigner || "—"}`,
      ],
    },
  ];

  for (const block of blocks) {
    if (y < 120) break;
    page.drawRectangle({
      x: left - 4,
      y: y - 6 - block.lines.length * 13 - 10,
      width: right - left + 8,
      height: 18 + block.lines.length * 13 + 12,
      borderColor: rgb(0.88, 0.89, 0.92),
      borderWidth: 1,
      color: rgb(0.98, 0.98, 0.99),
    });
    page.drawText(block.title, {
      x: left,
      y,
      size: 11,
      font: fontBold,
      color: ink,
    });
    y -= 16;
    for (const line of block.lines) {
      const text = line.length > 95 ? line.slice(0, 92) + "…" : line;
      page.drawText(text, {
        x: left,
        y,
        size: 9,
        font,
        color: ink,
        maxWidth: right - left,
      });
      y -= 13;
    }
    y -= 14;
  }

  y -= 6;
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
