#!/usr/bin/env node
/**
 * Distribute May + June 2026 timesheet PDFs to every payroll worker's My Documents.
 *
 * Default: dry-run (prints plan only). Pass --execute to delete/re-upload.
 *
 * Scope: active payroll workers (staff_pay_rates or staff_role_rates), excluding
 * contract/invoice staff, demo/test, and staff_payroll_start in the future.
 *
 * No push/email: documents table has no notification triggers (verified).
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { buildFormattedTimesheetPdfBytes, formatIsoDmy, loadTimesheetLogoDataUrl } from "./timesheet-pdf-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const EXECUTE = process.argv.includes("--execute");

const MONTHS = [
  {
    key: "may",
    periodMonth: "2026-05-01",
    periodStart: "2026-04-25",
    periodEnd: "2026-05-24",
    relatedDate: "2026-05-24",
    title: "May's Timesheet",
    label: "May 2026",
  },
  {
    key: "june",
    periodMonth: "2026-06-01",
    periodStart: "2026-05-25",
    periodEnd: "2026-06-24",
    relatedDate: "2026-06-24",
    title: "June's Timesheet",
    label: "June 2026",
  },
];

const FIXED_SALARY_KEYS = new Set(["roberto"]);
const EXCLUDE_USERNAMES = new Set(["demo", "teflon", "andres"]);

function readEnv(key) {
  const p = path.join(root, "local-secrets/secrets.env");
  const line = fs
    .readFileSync(p, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(key + "="));
  if (!line) throw new Error("missing " + key);
  return line.slice(key.length + 1).trim();
}

function loadRosterWindow() {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "database/staff_dashboard_spreadsheet_bundle.js"), "utf8"),
    sandbox,
  );
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "database/staff_dashboard_spreadsheet_adapter.js"), "utf8"),
    sandbox,
  );
  return sandbox;
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function eachDateInclusive(start, end) {
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(new Date(d));
  }
  return out;
}

function hmToMinutes(hm) {
  const t = String(hm || "").trim();
  if (!t) return 0;
  const [h, m] = t.split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function normStaff(v) {
  const x = String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  if (x === "yousef" || x === "youssef") return "youssef";
  return x;
}

function rosterKeyForProfile(p) {
  const uname = normStaff(p.username);
  const first = String(p.full_name || "")
    .trim()
    .split(/\s+/)[0];
  return normStaff(first) || uname;
}

function sessionsForCalendarDate(sessions, dateObj) {
  const dateKey = isoDate(dateObj);
  const dayName = WEEKDAY[dateObj.getDay()];
  const list = sessions || [];
  const dated = list.filter((s) => String(s.session_date || "").trim().slice(0, 10) === dateKey);
  if (dated.length) return dated;
  const rosterUsesDates = list.some((s) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(s.session_date || "").trim().slice(0, 10)),
  );
  if (rosterUsesDates) return [];
  return list.filter((s) => String(s.day || "").trim() === dayName);
}

function dayRosterHours(rows, dateObj) {
  if (!rows.length) return 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const s of rows) {
    const a = hmToMinutes(s.start);
    let b = hmToMinutes(s.end);
    if (b < a) b += 24 * 60;
    if (a < minStart) minStart = a;
    if (b > maxEnd) maxEnd = b;
  }
  const bufferMin = 15;
  const dayName = WEEKDAY[dateObj.getDay()];
  if (maxEnd - minStart < 120 && dayName !== "Sunday") {
    minStart -= bufferMin;
    maxEnd += bufferMin;
  }
  return Number((Math.max(0, maxEnd - minStart) / 60).toFixed(2));
}

function computeRosterEntries(rosterWin, rosterKey, periodStart, periodEnd) {
  const boot = rosterWin.StaffDashboardSpreadsheetAdapter.bootstrap({
    staffId: rosterKey,
    source: rosterWin.STAFF_DASHBOARD_SOURCE,
  });
  const sessions = boot.sessionsModel || [];
  const entries = [];
  for (const dateObj of eachDateInclusive(parseIso(periodStart), parseIso(periodEnd))) {
    const dayRows = sessionsForCalendarDate(sessions, dateObj).filter((s) => {
      const st = String(s.status || "").toLowerCase();
      if (st === "closed" || st === "available") return false;
      return normStaff(s.staffId) === normStaff(rosterKey);
    });
    if (!dayRows.length) continue;
    const hours = dayRosterHours(dayRows, dateObj);
    if (hours <= 0) continue;
    const summary = dayRows
      .map((s) => {
        const client = s.clientId || s.client || "";
        const area = s.area || s.venue || "";
        return `${s.start || ""}-${s.end || ""} ${client}${area ? " @" + area : ""}`.trim();
      })
      .join("; ");
    const svc =
      String(
        dayRows[0]?.rosterService || dayRows[0]?.service || dayRows[0]?.activity || "Shift",
      ).trim() || "Shift";
    entries.push({
      date: isoDate(dateObj),
      day: WEEKDAY[dateObj.getDay()],
      hours,
      summary,
      service: svc,
      serviceLabel: svc,
      completed: true,
    });
  }
  const totalHours = Number(entries.reduce((a, e) => a + e.hours, 0).toFixed(2));
  return { entries, totalHours, staffName: boot.staffName || rosterKey };
}

async function loadPayrollWorkers(admin) {
  const [{ data: profs }, { data: rates }, { data: roleRates }, { data: starts }, { data: contracts }] =
    await Promise.all([
      admin.from("staff_profiles").select("id, username, full_name"),
      admin.from("staff_pay_rates").select("user_id, hourly_rate, role_label"),
      admin.from("staff_role_rates").select("user_id, role, hourly_rate, is_primary"),
      admin.from("staff_payroll_start").select("user_id, start_month"),
      admin.from("staff_timesheet_imports").select("user_id").eq("pay_type", "contract"),
    ]);

  const contractIds = new Set((contracts || []).map((r) => String(r.user_id)));
  const rateByUser = new Map((rates || []).map((r) => [String(r.user_id), r]));
  const roleByUser = new Map();
  for (const rr of roleRates || []) {
    const id = String(rr.user_id);
    if (!roleByUser.has(id)) roleByUser.set(id, rr);
    if (rr.is_primary) roleByUser.set(id, rr);
  }
  const startByUser = new Map(
    (starts || []).map((r) => [String(r.user_id), String(r.start_month || "").slice(0, 10)]),
  );

  const workers = [];
  for (const p of profs || []) {
    const id = String(p.id);
    const uname = String(p.username || "").toLowerCase();
    const first = String(p.full_name || "").toLowerCase().split(/\s+/)[0];
    if (EXCLUDE_USERNAMES.has(uname) || EXCLUDE_USERNAMES.has(first)) continue;
    if (contractIds.has(id) || FIXED_SALARY_KEYS.has(uname) || FIXED_SALARY_KEYS.has(first)) continue;
    const rate = rateByUser.get(id);
    const role = roleByUser.get(id);
    if (!rate && !role) continue;
    workers.push({
      id,
      username: p.username,
      full_name: p.full_name,
      rosterKey: rosterKeyForProfile(p),
      hourly_rate: rate ? Number(rate.hourly_rate) : role && role.hourly_rate != null ? Number(role.hourly_rate) : null,
      role_label: (rate && rate.role_label) || (role && role.role) || "",
      payroll_start: startByUser.get(id) || null,
    });
  }
  workers.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  return workers;
}

function monthActiveForWorker(worker, periodMonth) {
  const start = worker.payroll_start;
  return !start || start <= periodMonth;
}

async function resolveMonthFigures(admin, worker, month, rosterWin) {
  const [{ data: imp }, { data: ts }] = await Promise.all([
    admin
      .from("staff_timesheet_imports")
      .select("total_hours, gross, note")
      .eq("user_id", worker.id)
      .eq("period_month", month.periodMonth)
      .maybeSingle(),
    admin
      .from("staff_timesheets")
      .select("total_hours, total_cost, hourly_rate_used")
      .eq("submitted_by_user_id", worker.id)
      .eq("period_month", month.periodMonth)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const roster = computeRosterEntries(
    rosterWin,
    worker.rosterKey,
    month.periodStart,
    month.periodEnd,
  );

  let totalHours = roster.totalHours;
  let gross = worker.hourly_rate != null ? Number((totalHours * worker.hourly_rate).toFixed(2)) : null;

  if (ts && ts.total_hours != null && Number(ts.total_hours) > 0) {
    totalHours = Number(ts.total_hours);
    gross = ts.total_cost != null ? Number(ts.total_cost) : gross;
  }
  if (imp) {
    if (imp.total_hours != null && Number(imp.total_hours) > 0) totalHours = Number(imp.total_hours);
    if (imp.gross != null) gross = Number(imp.gross);
    if (
      (imp.total_hours == null || Number(imp.total_hours) <= 0) &&
      gross != null &&
      worker.hourly_rate
    ) {
      totalHours = Number((gross / worker.hourly_rate).toFixed(2));
    }
  }

  return {
    entries: roster.entries,
    totalHours,
    gross,
    hourlyRate: ts?.hourly_rate_used != null ? Number(ts.hourly_rate_used) : worker.hourly_rate,
    staffName: roster.staffName || worker.full_name,
    source: imp ? "import" : ts ? "timesheet" : "roster",
  };
}

async function deleteExistingMonthDocs(admin, workerId, month) {
  const { data: docs } = await admin
    .from("documents")
    .select("id, file_url, title, related_date")
    .eq("user_id", workerId)
    .eq("document_type", "timesheet")
    .or(
      `related_date.eq.${month.relatedDate},title.ilike.%${month.key}%timesheet%,title.eq.${month.title}`,
    );

  const removed = [];
  for (const doc of docs || []) {
    const pathKey = String(doc.file_url || "").trim();
    if (pathKey) {
      await admin.storage.from("documents").remove([pathKey]);
    }
    await admin.from("documents").delete().eq("id", doc.id);
    removed.push(doc.title || doc.id);
  }
  return removed;
}

async function uploadMonthDoc(admin, worker, month, figures, logoDataUrl) {
  const pdf = buildFormattedTimesheetPdfBytes({
    employeeName: worker.full_name || figures.staffName,
    roleLabel: worker.role_label || "",
    periodStart: month.periodStart,
    periodEnd: month.periodEnd,
    submittedDate: formatIsoDmy(new Date().toISOString().slice(0, 10)),
    statusLabel: "On time",
    entries: (figures.entries || []).map((e) =>
      Object.assign({}, e, { rate: figures.hourlyRate, completed: true }),
    ),
    hourlyRate: figures.hourlyRate,
    totalHours: figures.totalHours,
    totalCost: figures.gross,
    pendingCost: 0,
    potentialCost: figures.gross,
    logoDataUrl,
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = `${worker.id}/timesheet/${stamp}_${month.key}_timesheet.pdf`;
  const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upErr) throw new Error(`upload ${worker.username} ${month.key}: ${upErr.message}`);

  const { error: docErr } = await admin.from("documents").insert({
    user_id: worker.id,
    document_type: "timesheet",
    category: "finance",
    title: month.title,
    related_date: month.relatedDate,
    file_url: storagePath,
    source_page: "timesheet",
  });
  if (docErr) throw new Error(`document ${worker.username} ${month.key}: ${docErr.message}`);
}

async function main() {
  const url = readEnv("SUPABASE_URL");
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const rosterWin = loadRosterWindow();
  const workers = await loadPayrollWorkers(admin);
  const logoDataUrl = loadTimesheetLogoDataUrl(root);

  console.log(`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY-RUN"}`);
  console.log(`Payroll workers: ${workers.length}`);
  console.log("No push/email on documents insert (no DB triggers on documents).");
  console.log("");

  let planned = 0;
  let skipped = 0;

  for (const worker of workers) {
    for (const month of MONTHS) {
      if (!monthActiveForWorker(worker, month.periodMonth)) {
        console.log(`  skip ${worker.full_name} ${month.key}: before payroll_start`);
        skipped++;
        continue;
      }
      const figures = await resolveMonthFigures(admin, worker, month, rosterWin);
      planned++;
      const pay =
        figures.gross != null ? `£${figures.gross.toFixed(2)}` : figures.hourlyRate != null ? `~£${(figures.totalHours * figures.hourlyRate).toFixed(2)}` : "?";
      console.log(
        `  ${EXECUTE ? "upload" : "plan"} ${worker.full_name} · ${month.label}: ${figures.totalHours}h ${pay} (${figures.entries.length} roster days, source=${figures.source})`,
      );
      if (!EXECUTE) continue;

      const removed = await deleteExistingMonthDocs(admin, worker.id, month);
      if (removed.length) console.log(`    deleted ${removed.length} old doc(s)`);
      await uploadMonthDoc(admin, worker, month, figures, logoDataUrl);
    }
  }

  console.log("");
  console.log(`Done. planned=${planned} skipped=${skipped}`);
  if (!EXECUTE) console.log("Re-run with --execute to apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
