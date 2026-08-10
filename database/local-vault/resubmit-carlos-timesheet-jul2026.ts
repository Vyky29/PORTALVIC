/**
 * Carlos July cycle (25 Jun–24 Jul): delete bad July submit/PDF, write corrected
 * staff_timesheets (admin payroll) + formatted PDF in Documents.
 *
 *   npx -y deno run --allow-env --allow-read --allow-net --allow-write --allow-run \
 *     database/local-vault/resubmit-carlos-timesheet-jul2026.ts
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

const CARLOS_ID = "b85cdca7-4c7d-48c3-9bb8-a48c95841a4e";
const NAME = "Carlos Herrero";
const PERIOD_START = "2026-06-25";
const PERIOD_END = "2026-07-24";
const PERIOD_MONTH = "2026-07-01";
const SUBMITTED_ON = "2026-07-24";
const ROLE_LABEL = "CL3 · SW3";

function readEnv(key: string) {
  for (const rel of [
    "local-secrets/secrets.env",
    "database/local-vault/private/parent-portal-secrets.env",
  ]) {
    const p = path.join(root, rel);
    try {
      const line = fs
        .readFileSync(p, "utf8")
        .split(/\r?\n/)
        .find((l) => l.startsWith(key + "="));
      if (!line) continue;
      let v = line.slice(key.length + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (v) return v;
    } catch {
      /* skip */
    }
  }
  throw new Error("missing " + key);
}

function money(n: number) {
  return (Math.round((Number(n) + Number.EPSILON) * 100) / 100).toFixed(2);
}

function formatIsoDmy(iso: string) {
  const d = new Date(String(iso || "").slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(iso || "");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

function weekdayName(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
  });
}

function dayOrdinal(n: number) {
  const v = Number(n || 0);
  if (v % 100 >= 11 && v % 100 <= 13) return `${v}th`;
  if (v % 10 === 1) return `${v}st`;
  if (v % 10 === 2) return `${v}nd`;
  if (v % 10 === 3) return `${v}rd`;
  return `${v}th`;
}

function displayDateFancy(iso: string) {
  const d = new Date(String(iso || "").slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return `${dayOrdinal(d.getDate())}\n${d.toLocaleDateString("en-GB", { month: "short" })}`;
}

function loadLogo(): string | null {
  for (const rel of [
    "working_ui/portal/F-02-1.png",
    "working_ui/logoPDF.png",
  ]) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
    return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  }
  return null;
}

function roleRgb(role: string): [number, number, number] {
  const r = String(role || "").toLowerCase();
  if (/swim|si\d|aquatic/.test(r)) return [21, 101, 192];
  if (/climb|cl\d/.test(r)) return [202, 138, 4];
  if (/lead/.test(r)) return [124, 58, 237];
  if (/fitness|fi\d/.test(r)) return [15, 118, 110];
  return [17, 24, 39];
}

type Entry = Record<string, unknown>;

const entries: Entry[] = [
  {
    day: weekdayName("2026-06-28"),
    date: "2026-06-28",
    note: "",
    rate: 30,
    role: "Climbing Instructor",
    hours: 5,
    venue: "Westway",
    dayOff: false,
    manual: false,
    service: "Climbing Activity",
    completed: true,
    late_hold: false,
    time_range: "10.00-3.00",
    service_name: "Climbing Activity",
    feedback_late: false,
    service_label: "10.00-3.00 Climbing Activity",
    displayRole: "CL3",
  },
  {
    day: weekdayName("2026-06-29"),
    date: "2026-06-29",
    note: "",
    rate: 23,
    role: "Support Worker",
    hours: 5,
    venue: "SwimFarm",
    dayOff: false,
    manual: false,
    service: "Day Centre",
    completed: true,
    late_hold: false,
    time_range: "11.00-4.00",
    service_name: "Day Centre",
    feedback_late: false,
    service_label: "11.00-4.00 Day Centre",
    displayRole: "SW3",
  },
  {
    day: weekdayName("2026-07-05"),
    date: "2026-07-05",
    note: "",
    rate: 0,
    role: "Day off",
    hours: 0,
    venue: "",
    dayOff: true,
    manual: false,
    service: "Day off",
    completed: true,
    late_hold: false,
    time_range: "",
    service_name: "Time off requested",
    feedback_late: false,
    service_label: "Time off requested",
  },
  {
    day: weekdayName("2026-07-12"),
    date: "2026-07-12",
    note: "",
    rate: 30,
    role: "Climbing Instructor",
    hours: 5,
    venue: "Westway",
    dayOff: false,
    manual: false,
    service: "Climbing Activity",
    completed: true,
    late_hold: false,
    time_range: "10.00-3.00",
    service_name: "Climbing Activity",
    feedback_late: false,
    service_label: "10.00-3.00 Climbing Activity",
    displayRole: "CL3",
  },
];

const totalHours = Number(
  entries
    .filter((e) => !e.dayOff)
    .reduce((a, e) => a + Number(e.hours || 0), 0)
    .toFixed(2),
);
const totalCost = Number(
  entries
    .filter((e) => !e.dayOff)
    .reduce((a, e) => a + Number(e.hours || 0) * Number(e.rate || 0), 0)
    .toFixed(2),
);

function buildPdf(opts: {
  entries: Entry[];
  totalHours: number;
  totalCost: number;
  logo: string | null;
}): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const tableW = 184;
  const left = (pageW - tableW) / 2;
  const right = left + tableW;
  const ents = opts.entries;
  const summaryRows = [
    { label: "Hours ready to pay now (green)", value: money(opts.totalHours), tone: "ok" },
    {
      label: "Rate (avg)",
      value: `£${money(opts.totalHours > 0 ? opts.totalCost / opts.totalHours : 0)}/h`,
      tone: "neutral",
    },
    { label: "Ready to pay now", value: `£${money(opts.totalCost)}`, tone: "okStrong" },
    { label: "Pending until feedback is completed", value: "£0.00", tone: "warn" },
    { label: "Total if all feedback is completed", value: `£${money(opts.totalCost)}`, tone: "neutral" },
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
  const rowScale = (e: Entry) => (e.dayOff ? 1.38 : 1.9);
  const entriesRowH = ents.reduce((s, e) => s + B.rowH * rowScale(e), 0);
  const neededH =
    (opts.logo ? B.logoH + B.afterLogo : 0) +
    B.afterTitle +
    5 * labelGap +
    B.gapAfterLabels +
    B.headerRowH +
    entriesRowH +
    B.gapBeforeSummary +
    (B.panelPad * 2 + B.summaryRowH * summaryRows.length);
  const S = Math.max(0.4, Math.min(1, (pageH - 12 - 10) / neededH));
  let y = 12;

  function labeledLine(label: string, value: string) {
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

  if (opts.logo) {
    const logoW = B.logoH * S;
    doc.addImage(opts.logo, "PNG", (pageW - logoW) / 2, y, logoW, logoW);
    y += logoW + B.afterLogo * S;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15 * S);
  doc.text("TIMESHEET", pageW / 2, y, { align: "center" });
  y += B.afterTitle * S;
  labeledLine("Employee", NAME);
  labeledLine("Role", ROLE_LABEL);
  labeledLine("Period", `${formatIsoDmy(PERIOD_START)} to ${formatIsoDmy(PERIOD_END)}`);
  labeledLine("Submitted on", formatIsoDmy(SUBMITTED_ON));
  labeledLine("Status", "On time - July");
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
  ["Date", "Day", "Service", "Hours", "Daily Total", "Status"].forEach((h, i) => {
    doc.text(h, (colX[i] + colX[i + 1]) / 2, y + cellBaseline, { align: "center" });
  });
  y += headerRowH;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5 * S);
  for (const e of ents) {
    const isOff = !!e.dayOff;
    const rate = isOff ? 0 : Number(e.rate || 0);
    const daily = money(Number(e.hours || 0) * rate);
    const thisRowH = rowH * rowScale(e);
    const midY = y + thisRowH / 2 + 1.2 * S;
    if (isOff) {
      doc.setFillColor(254, 226, 226);
      doc.rect(colX[0], y, colX[6] - colX[0], thisRowH, "FD");
    }
    doc.rect(colX[0], y, colX[6] - colX[0], thisRowH, "S");
    if (isOff) doc.setTextColor(153, 27, 27);
    else doc.setTextColor(16, 34, 56);

    const dateParts = displayDateFancy(String(e.date)).split("\n");
    const dateCx = (colX[0] + colX[1]) / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8 * S);
    doc.text(dateParts[0] || "—", dateCx, midY - 1.6 * S, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5 * S);
    doc.text(dateParts[1] || "", dateCx, midY + 1.8 * S, { align: "center" });
    doc.setFontSize(8.5 * S);
    doc.text(isOff ? "Day off" : String(e.day || ""), (colX[1] + colX[2]) / 2, midY, {
      align: "center",
    });

    const svcCx = (colX[2] + colX[3]) / 2;
    if (isOff) {
      doc.setFontSize(8 * S);
      doc.text("Time off requested", svcCx, midY - 1.2 * S, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.text("DAY OFF", svcCx, midY + 2.2 * S, { align: "center" });
      doc.setFont("helvetica", "normal");
    } else {
      const lines = [
        String(e.time_range || ""),
        String(e.service_name || e.service || ""),
        String(e.venue || ""),
        String(e.displayRole || e.role || ""),
      ].filter(Boolean);
      const step = 2.35 * S;
      let ly = midY - ((lines.length - 1) * step) / 2;
      for (let i = 0; i < lines.length; i++) {
        const text = lines[i];
        const isRole = text === String(e.displayRole || e.role || "");
        const isTime = text === String(e.time_range || "");
        if (isRole) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.2 * S);
          const [rr, gg, bb] = roleRgb(text);
          doc.setTextColor(rr, gg, bb);
        } else if (isTime) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.6 * S);
          doc.setTextColor(16, 34, 56);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7 * S);
          doc.setTextColor(51, 65, 85);
        }
        doc.text(text, svcCx, ly, { align: "center" });
        ly += step;
      }
      doc.setFont("helvetica", "normal");
      doc.setTextColor(16, 34, 56);
      doc.setFontSize(8.5 * S);
    }

    doc.text(money(Number(e.hours || 0)), (colX[3] + colX[4]) / 2, midY, { align: "center" });
    doc.text(daily, (colX[4] + colX[5]) / 2, midY, { align: "center" });
    doc.text(isOff ? "Day off" : "Completed", (colX[5] + colX[6]) / 2, midY, {
      align: "center",
    });
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
  for (const r of summaryRows) {
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

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log({ totalHours, totalCost });

const { data: oldTs } = await admin
  .from("staff_timesheets")
  .select("id,total_hours,net_cost")
  .eq("submitted_by_user_id", CARLOS_ID)
  .eq("period_month", PERIOD_MONTH);
for (const t of oldTs || []) {
  const { error } = await admin.from("staff_timesheets").delete().eq("id", t.id);
  if (error) throw new Error("delete timesheet: " + error.message);
  console.log("deleted timesheet", t.id, t.total_hours, t.net_cost);
}

const { data: julyDocs } = await admin
  .from("documents")
  .select("id, title, file_url, related_date")
  .eq("user_id", CARLOS_ID)
  .eq("document_type", "timesheet");
for (const d of julyDocs || []) {
  const t = String(d.title || "");
  const rd = String(d.related_date || "");
  if (/May's Timesheet|June's Timesheet/i.test(t) && !/25th June|24th July/i.test(t)) continue;
  if (
    /25th June|24th July|Carlos.?s? Timesheet/i.test(t) ||
    rd === PERIOD_END ||
    (rd.startsWith("2026-07") && /Timesheet/i.test(t))
  ) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
    console.log("deleted doc", d.id, d.title);
  }
}

const payload = {
  submitted_by_user_id: CARLOS_ID,
  submitted_by_name: NAME,
  period_month: PERIOD_MONTH,
  role_label: ROLE_LABEL,
  total_hours: totalHours,
  entries,
  hourly_rate_used: Number((totalCost / totalHours).toFixed(2)),
  total_cost: totalCost,
  net_cost: totalCost,
  expected_hours: totalHours,
  is_late: false,
  penalty_amount: 0,
  status: "submitted",
  submitted_on: SUBMITTED_ON,
};

const { data: inserted, error: insErr } = await admin
  .from("staff_timesheets")
  .insert([payload])
  .select("id,total_hours,total_cost,net_cost,hourly_rate_used,role_label")
  .single();
if (insErr) throw new Error("insert: " + insErr.message);
console.log("inserted", inserted);

if (
  Number(inserted.total_hours) !== totalHours ||
  Number(inserted.total_cost) !== totalCost ||
  Number(inserted.net_cost) !== totalCost
) {
  const sql = `
    alter table public.staff_timesheets disable trigger user;
    update public.staff_timesheets set
      total_hours = ${totalHours},
      hourly_rate_used = ${Number((totalCost / totalHours).toFixed(2))},
      total_cost = ${totalCost},
      net_cost = ${totalCost},
      expected_hours = ${totalHours},
      is_late = false,
      penalty_amount = 0,
      role_label = '${ROLE_LABEL}',
      status = 'submitted',
      submitted_on = '${SUBMITTED_ON}',
      period_month = '${PERIOD_MONTH}'
    where id = '${inserted.id}';
    alter table public.staff_timesheets enable trigger user;
  `;
  const tmpSql = path.join(root, "database/local-vault/tmp/carlos-ts-force.sql");
  fs.mkdirSync(path.dirname(tmpSql), { recursive: true });
  fs.writeFileSync(tmpSql, sql);
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", tmpSql], {
    cwd: root,
    encoding: "utf8",
  });
  console.log("force sql", r.status, (r.stdout || "").slice(0, 200));
}

const pdf = buildPdf({ entries, totalHours, totalCost, logo: loadLogo() });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const storagePath = `${CARLOS_ID}/timesheet/${stamp}_Carlos_Timesheet_25th_June_to_24th_July.pdf`;
const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
  contentType: "application/pdf",
  upsert: true,
});
if (upErr) throw new Error("upload: " + upErr.message);

const title = "Carlos' Timesheet (25th June to 24th July)";
const { error: docErr } = await admin.from("documents").insert({
  user_id: CARLOS_ID,
  document_type: "timesheet",
  category: "finance",
  title,
  related_date: PERIOD_END,
  file_url: storagePath,
  source_page: "timesheet",
});
if (docErr) throw new Error("document: " + docErr.message);

const { data: verify } = await admin
  .from("staff_timesheets")
  .select("id,total_hours,total_cost,net_cost,role_label,period_month,entries")
  .eq("id", inserted.id)
  .single();

console.log("OK", {
  timesheetId: inserted.id,
  hours: verify?.total_hours,
  net: verify?.net_cost,
  role: verify?.role_label,
  days: (verify?.entries || []).map((e: Entry) => ({
    d: e.date,
    h: e.hours,
    hold: e.late_hold,
    off: e.dayOff,
    tr: e.time_range,
    role: e.displayRole || e.role,
  })),
  storagePath,
  title,
});
