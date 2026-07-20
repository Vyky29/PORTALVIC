/**
 * Formatted timesheet PDF — same layout as working_ui/timesheet.html generatePdfBlob().
 * Used by admin distribute/backfill scripts (not plain-text minimal PDFs).
 */
import fs from "fs";
import path from "path";
import { jsPDF } from "jspdf";

function money(n) {
  return (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
}

function parseIsoDate(s) {
  const d = new Date(String(s || "").slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayOrdinal(n) {
  const v = Number(n || 0);
  if (v % 100 >= 11 && v % 100 <= 13) return `${v}th`;
  if (v % 10 === 1) return `${v}st`;
  if (v % 10 === 2) return `${v}nd`;
  if (v % 10 === 3) return `${v}rd`;
  return `${v}th`;
}

function displayDateFancy(iso) {
  const d = parseIsoDate(iso);
  if (!d) return String(iso || "");
  const dd = dayOrdinal(d.getDate());
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${dd}/${month}/${d.getFullYear()}`;
}

export function formatIsoDmy(iso) {
  const d = parseIsoDate(iso);
  if (!d) return String(iso || "");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function serviceFlatRate(service) {
  const s = String(service || "").toLowerCase();
  if (/shadow|training/.test(s)) return 13.5;
  return null;
}

function entryServiceLabel(entry) {
  return String((entry && (entry.serviceLabel || entry.service)) || "-").trim();
}

function entryRoleLabel(entry) {
  const r = String(
    (entry && (entry.displayRole || entry.roleLabel || entry.role)) || "",
  ).trim();
  if (!r) return "";
  const scale = String((entry && entry.roleScale) || "").trim();
  const m = scale.match(/Scale\s*(\d+)/i) || (scale && /^\d+$/.test(scale) ? [scale, scale] : null);
  return m ? `${r} ${m[1]}` : r;
}

function entryColorRole(entry) {
  return String(
    (entry && (entry.displayRole || entry.roleLabel || entry.role)) || "",
  ).trim();
}

/** Pay-role colours for the second line under Service (RGB 0–255 for jsPDF). */
export function timesheetRolePdfRgb(role) {
  const r = String(role || "").toLowerCase();
  if (/swim|aquatic/.test(r)) return [21, 101, 192];
  if (/climb/.test(r)) return [202, 138, 4];
  if (/\blead\b|service lead/.test(r)) return [124, 58, 237];
  if (/fitness|physical|gym|\bpt\b|personal\s*train/.test(r)) return [15, 118, 110];
  if (/support/.test(r)) return [17, 24, 39];
  return [17, 24, 39];
}

function pdfEntryRowHeightScale(entry) {
  return entryRoleLabel(entry) ? 1.38 : 1;
}

function drawPdfServiceCell(doc, entry, cx, y, cellBaseline, S, manual) {
  if (manual) {
    doc.text("-", cx, y + cellBaseline, { align: "center" });
    return;
  }
  const service = entryServiceLabel(entry).slice(0, 28);
  const role = entryRoleLabel(entry).slice(0, 24);
  if (role) {
    doc.setFontSize(8.5 * S);
    doc.setTextColor(16, 34, 56);
    doc.text(service, cx, y + cellBaseline - 1.4 * S, { align: "center" });
    doc.setFontSize(7.2 * S);
    doc.setFont("helvetica", "bold");
    const [rr, gg, bb] = timesheetRolePdfRgb(entryColorRole(entry));
    doc.setTextColor(rr, gg, bb);
    doc.text(role, cx, y + cellBaseline + 2 * S, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(16, 34, 56);
    doc.setFontSize(8.5 * S);
  } else {
    doc.text(service.slice(0, 30), cx, y + cellBaseline, { align: "center" });
  }
}

export function loadTimesheetLogoDataUrl(rootDir) {
  const candidates = [
    path.join(rootDir, "working_ui/portal/F-02-1.png"),
    path.join(rootDir, "working_ui/logoPDF.png"),
    path.join(rootDir, "working_ui/portal/assets/logoPDF.png"),
  ];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    const b64 = fs.readFileSync(filePath).toString("base64");
    return `data:${mime};base64,${b64}`;
  }
  return null;
}

/**
 * @param {object} opts
 * @param {string} opts.employeeName
 * @param {string} opts.roleLabel
 * @param {string} opts.periodStart ISO date
 * @param {string} opts.periodEnd ISO date
 * @param {string} [opts.submittedDate] display date
 * @param {string} [opts.statusLabel]
 * @param {Array} opts.entries
 * @param {number} opts.hourlyRate
 * @param {number} opts.totalHours
 * @param {number} [opts.totalCost]
 * @param {number} [opts.pendingCost]
 * @param {number} [opts.potentialCost]
 * @param {boolean} [opts.manual]
 * @param {string|null} [opts.logoDataUrl]
 */
export function buildFormattedTimesheetPdfBytes(opts) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = 184;
  const left = (pageW - tableW) / 2;
  const right = left + tableW;
  const topY = 12;
  const bottomMargin = 10;

  const entries = Array.isArray(opts.entries) ? opts.entries : [];
  const hourlyRate = Number(opts.hourlyRate || 0);
  const totalHours = Number(opts.totalHours || 0);
  const totalCost =
    opts.totalCost != null
      ? Number(opts.totalCost)
      : Number(entries.reduce((a, e) => a + Number(e.hours || 0) * Number(e.rate != null ? e.rate : hourlyRate), 0).toFixed(2));
  const potentialCost =
    opts.potentialCost != null
      ? Number(opts.potentialCost)
      : totalCost;
  const pendingCost =
    opts.pendingCost != null ? Number(opts.pendingCost) : Math.max(0, Number((potentialCost - totalCost).toFixed(2)));
  const effectiveRate =
    totalHours > 0 ? Number((totalCost / totalHours).toFixed(2)) : hourlyRate;
  const manual = !!opts.manual;
  const logoData = opts.logoDataUrl || null;

  const summaryRows = manual
    ? [
        { label: "Total hours", value: money(totalHours), tone: "neutral" },
        { label: "Rate", value: `£${money(effectiveRate)}/h`, tone: "neutral" },
        { label: "Total to pay", value: `£${money(totalCost)}`, tone: "okStrong" },
      ]
    : [
        { label: "Hours ready to pay now (green)", value: money(totalHours), tone: "ok" },
        { label: "Rate (avg)", value: `£${money(effectiveRate)}/h`, tone: "neutral" },
        { label: "Ready to pay now", value: `£${money(totalCost)}`, tone: "okStrong" },
        { label: "Pending until feedback is completed", value: `£${money(pendingCost)}`, tone: "warn" },
        { label: "Total if all feedback is completed", value: `£${money(potentialCost)}`, tone: "neutral" },
      ];

  const B = {
    logoH: 28,
    afterLogo: 5,
    afterTitle: 8,
    labelSize: 11,
    gapAfterLabels: 1,
    headerRowH: 7,
    rowH: 7,
    gapBeforeSummary: 10,
    panelPad: 4,
    summaryRowH: 10,
  };
  const labelGap = B.labelSize * 0.42 + 2;
  const entriesRowH = entries.reduce((sum, e) => sum + B.rowH * pdfEntryRowHeightScale(e), 0);
  const neededH =
    (logoData ? B.logoH + B.afterLogo : 0) +
    B.afterTitle +
    5 * labelGap +
    B.gapAfterLabels +
    B.headerRowH +
    entriesRowH +
    B.gapBeforeSummary +
    (B.panelPad * 2 + B.summaryRowH * summaryRows.length);
  const availH = pageH - topY - bottomMargin;
  const S = Math.max(0.4, Math.min(1, availH / neededH));

  let y = topY;

  function labeledLine(label, value) {
    const size = B.labelSize * S;
    const labelTxt = `${label}: `;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.text(labelTxt, left, y);
    const x = left + doc.getTextWidth(labelTxt);
    doc.setFont("helvetica", "normal");
    doc.text(String(value || "-"), x, y);
    y += labelGap * S;
  }

  if (logoData) {
    const logoW = B.logoH * S;
    const logoH = B.logoH * S;
    const logoX = (pageW - logoW) / 2;
    const logoFmt = /^data:image\/jpe?g/i.test(logoData) ? "JPEG" : "PNG";
    doc.addImage(logoData, logoFmt, logoX, y, logoW, logoH);
    y += logoH + B.afterLogo * S;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15 * S);
  doc.text("TIMESHEET", pageW / 2, y, { align: "center" });
  y += B.afterTitle * S;

  labeledLine("Employee", opts.employeeName || "-");
  labeledLine("Role", opts.roleLabel || "-");
  labeledLine("Period", `${formatIsoDmy(opts.periodStart)} to ${formatIsoDmy(opts.periodEnd)}`);
  labeledLine("Submitted on", opts.submittedDate || formatIsoDmy(new Date().toISOString().slice(0, 10)));
  labeledLine("Status", opts.statusLabel || "On time");

  y += B.gapAfterLabels * S;

  const colX = [left, left + 30, left + 58, left + 108, left + 132, left + 156, right];
  const rowH = B.rowH * S;
  const headerRowH = B.headerRowH * S;
  const cellBaseline = 4.8 * S;

  doc.setDrawColor(217, 227, 239);
  doc.setFillColor(248, 251, 255);
  doc.rect(colX[0], y, colX[6] - colX[0], headerRowH, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9 * S);
  doc.text("Date", (colX[0] + colX[1]) / 2, y + cellBaseline, { align: "center" });
  doc.text(manual ? "Description" : "Day", (colX[1] + colX[2]) / 2, y + cellBaseline, { align: "center" });
  doc.text("Service", (colX[2] + colX[3]) / 2, y + cellBaseline, { align: "center" });
  doc.text("Hours", (colX[3] + colX[4]) / 2, y + cellBaseline, { align: "center" });
  doc.text("Daily Total", (colX[4] + colX[5]) / 2, y + cellBaseline, { align: "center" });
  doc.text("Status", (colX[5] + colX[6]) / 2, y + cellBaseline, { align: "center" });
  y += headerRowH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5 * S);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const isDayOff = !!(e.dayOff || /day off/i.test(String(e.service || e.role || "")));
    const rate = isDayOff ? 0 : e.rate != null ? Number(e.rate) : hourlyRate;
    const daily = money(Number(e.hours || 0) * rate);
    const thisRowH = rowH * pdfEntryRowHeightScale(e);
    if (isDayOff) {
      doc.setFillColor(254, 226, 226);
      doc.rect(colX[0], y, colX[6] - colX[0], thisRowH, "FD");
    }
    doc.rect(colX[0], y, colX[6] - colX[0], thisRowH, "S");
    const isFlat = !isDayOff && serviceFlatRate(e.service || e.role) != null;
    const midCol = manual
      ? String(e.note || e.day || "").slice(0, 22)
      : isDayOff
        ? "Day off"
        : isFlat
          ? String(entryRoleLabel(e) || e.role || "Training").slice(0, 22)
          : String(e.day || "").slice(0, 22);
    const statusTxt = manual
      ? "Manual"
      : isDayOff
        ? "Day off"
        : isFlat
          ? "Completed"
          : e.completed === false
            ? "Pending feedback"
            : "Completed";
    if (isDayOff) doc.setTextColor(153, 27, 27);
    else doc.setTextColor(16, 34, 56);
    doc.text(displayDateFancy(e.date), (colX[0] + colX[1]) / 2, y + cellBaseline, { align: "center" });
    doc.text(midCol, (colX[1] + colX[2]) / 2, y + cellBaseline, { align: "center" });
    drawPdfServiceCell(doc, e, (colX[2] + colX[3]) / 2, y, cellBaseline, S, manual);
    doc.text(money(e.hours), (colX[3] + colX[4]) / 2, y + cellBaseline, { align: "center" });
    doc.text(daily, (colX[4] + colX[5]) / 2, y + cellBaseline, { align: "center" });
    doc.text(statusTxt, (colX[5] + colX[6]) / 2, y + cellBaseline, { align: "center" });
    doc.setTextColor(16, 34, 56);
    y += thisRowH;
  }

  y += B.gapBeforeSummary * S;
  const panelPad = B.panelPad * S;
  const summaryRowH = B.summaryRowH * S;
  const panelHeight = panelPad * 2 + summaryRowH * summaryRows.length;
  doc.setDrawColor(217, 227, 239);
  doc.setFillColor(252, 253, 255);
  doc.roundedRect(left, y, right - left, panelHeight, 2, 2, "FD");
  let sy = y + panelPad + 6.5 * S;
  for (let i = 0; i < summaryRows.length; i++) {
    const r = summaryRows[i];
    if (r.tone === "okStrong") doc.setTextColor(12, 72, 43);
    else if (r.tone === "warn") doc.setTextColor(153, 83, 0);
    else doc.setTextColor(16, 34, 56);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5 * S);
    doc.text(`${r.label}:`, right - 34, sy, { align: "right" });
    doc.text(r.value, right - 4, sy, { align: "right" });
    doc.setTextColor(16, 34, 56);
    sy += summaryRowH;
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
