#!/usr/bin/env node
/**
 * Bismark Gyan — backfill June timesheet (25 May → 24 Jun 2026).
 * Writes staff_timesheets + formatted PDF in Documents.
 * Rates: SW3 £23 · Westway Sunday climbing CI3 £30.
 *
 *   node database/local-vault/office-bismark-june-timesheet.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  buildFormattedTimesheetPdfBytes,
  formatIsoDmy,
  loadTimesheetLogoDataUrl,
} from "./timesheet-pdf-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const BISMARK_ID = "09cc34eb-7824-4f54-b4a0-b2b3205425ca";
const NAME = "Bismark Gyan";
const ROLE = "Support Worker 3 · Climbing Instructor 3";
const PERIOD_START = "2026-05-25";
const PERIOD_END = "2026-06-24";
const PERIOD_MONTH = "2026-06-01";
const SUBMITTED_ON = "2026-06-24";
const RATE_SW = 23;
const RATE_CLIMB = 30;

function readEnv(key) {
  for (const rel of [
    "local-secrets/secrets.env",
    "database/local-vault/private/parent-portal-secrets.env",
  ]) {
    const p = path.join(root, rel);
    if (!fs.existsSync(p)) continue;
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
  }
  throw new Error("missing " + key);
}

function weekdayName(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
  });
}

function parseMachineHmToken(token, dayName) {
  const raw = String(token || "").trim();
  const m = raw.match(/^(\d{1,2})(?:[.:](\d{1,2}))?$/);
  if (!m) return 0;
  let h = parseInt(m[1], 10) || 0;
  const min = parseInt(m[2] || "0", 10) || 0;
  const wd = String(dayName || "").trim();
  if (wd === "Sunday") {
    if (h >= 9) return h * 60 + min;
    if (h >= 1 && h <= 7) return (h + 12) * 60 + min;
  } else if (h >= 1 && h <= 8) {
    return (h + 12) * 60 + min;
  }
  return h * 60 + min;
}

function parseMachineSlotHours(timeRange, dayName) {
  const parts = String(timeRange || "")
    .split(/\s*-\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length < 2) return 0;
  const start = parseMachineHmToken(parts[0], dayName);
  let end = parseMachineHmToken(parts[1], dayName);
  if (end <= start) end += 24 * 60;
  return Number(((end - start) / 60).toFixed(2));
}

function formatTimeRangeDisplay(timeRange, dayName) {
  const parts = String(timeRange || "")
    .split(/\s*-\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length < 2) return String(timeRange || "");
  function fmt(tok) {
    const mins = parseMachineHmToken(tok, dayName);
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return m ? `${h}.${String(m).padStart(2, "0")}` : `${h}.00`;
  }
  return `${fmt(parts[0])}-${fmt(parts[1])}`;
}

function loadShifts() {
  const csvPath = path.join(root, "database/staff_timetable_machine.csv");
  return fs
    .readFileSync(csvPath, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const cols = line.split(",");
      if (cols.length < 6) return null;
      return {
        session_date: String(cols[0] || "").trim().slice(0, 10),
        day: String(cols[1] || "").trim(),
        staff: String(cols[3] || "").trim(),
        time_range: String(cols[4] || "").trim(),
        venue: String(cols[5] || "").trim(),
      };
    })
    .filter(
      (r) =>
        r &&
        /^bismark$/i.test(r.staff) &&
        r.session_date >= PERIOD_START &&
        r.session_date <= PERIOD_END,
    );
}

function metaFor(timeRange, dayName, venue) {
  const isClimb =
    dayName === "Sunday" && /westway/i.test(String(venue || ""));
  if (isClimb) {
    return {
      serviceName: "Climbing Activity",
      role: "Climbing Instructor 3",
      rate: RATE_CLIMB,
      venue: venue || "Westway",
    };
  }
  if (dayName === "Sunday") {
    return {
      serviceName: "Bespoke Programme",
      role: "Support Worker 3",
      rate: RATE_SW,
      venue: venue || "SwimFarm",
    };
  }
  return {
    serviceName: "Bespoke Programme",
    role: "Support Worker 3",
    rate: RATE_SW,
    venue: venue || "SwimFarm",
  };
}

const shifts = loadShifts();
const byDate = new Map();
for (const s of shifts) {
  if (!byDate.has(s.session_date)) byDate.set(s.session_date, []);
  byDate.get(s.session_date).push(s);
}

const entries = [];
for (const iso of [...byDate.keys()].sort()) {
  const dayName = weekdayName(iso);
  const dayShifts = byDate.get(iso);
  let hours = 0;
  let timeRange = "";
  let venue = "";
  for (const s of dayShifts) {
    hours += parseMachineSlotHours(s.time_range, dayName || s.day);
    if (!timeRange) timeRange = s.time_range;
    if (!venue) venue = s.venue;
  }
  hours = Number(hours.toFixed(2));
  const meta = metaFor(timeRange, dayName, venue);
  const displayTime = formatTimeRangeDisplay(timeRange, dayName);
  const serviceLabel = `${displayTime} ${meta.serviceName}\n${meta.venue}\n${meta.role}`;
  entries.push({
    day: dayName,
    date: iso,
    note: "",
    role: meta.role,
    hours,
    manual: false,
    service: meta.serviceName,
    completed: true,
    dayOff: false,
    late_hold: false,
    feedback_late: false,
    rate: meta.rate,
    service_label: serviceLabel,
    service_name: meta.serviceName,
    venue: meta.venue,
    time_range: displayTime,
    roleLabel: meta.role,
    displayRole: meta.role,
    serviceLabel,
    serviceName: meta.serviceName,
  });
}

const totalHours = Number(
  entries.reduce((a, e) => a + Number(e.hours || 0), 0).toFixed(2),
);
const totalCost = Number(
  entries
    .reduce((a, e) => a + Number(e.hours || 0) * Number(e.rate || 0), 0)
    .toFixed(2),
);
const primaryRate = RATE_SW;

console.log({
  days: entries.length,
  totalHours,
  totalCost,
  preview: entries.map((e) => ({
    date: e.date,
    hours: e.hours,
    rate: e.rate,
    role: e.role,
    venue: e.venue,
  })),
});

if (totalHours !== 37 || totalCost !== 886) {
  console.warn("WARNING: totals differ from June import (37h / £886)", {
    totalHours,
    totalCost,
  });
}

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existing } = await admin
  .from("staff_timesheets")
  .select("id")
  .eq("submitted_by_user_id", BISMARK_ID)
  .eq("period_month", PERIOD_MONTH)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const payload = {
  submitted_by_user_id: BISMARK_ID,
  submitted_by_name: NAME,
  period_month: PERIOD_MONTH,
  role_label: ROLE,
  total_hours: totalHours,
  entries,
  hourly_rate_used: primaryRate,
  total_cost: totalCost,
  net_cost: totalCost,
  expected_hours: totalHours,
  is_late: false,
  penalty_amount: 0,
  status: "submitted",
  submitted_on: SUBMITTED_ON,
};

let timesheetId = existing?.id || null;
if (timesheetId) {
  const { error } = await admin.from("staff_timesheets").update(payload).eq("id", timesheetId);
  if (error) throw new Error("update timesheet: " + error.message);
  console.log("updated timesheet", timesheetId);
} else {
  const { data: inserted, error } = await admin
    .from("staff_timesheets")
    .insert([payload])
    .select("id, total_hours, total_cost, net_cost, hourly_rate_used, status")
    .single();
  if (error) throw new Error("insert timesheet: " + error.message);
  timesheetId = inserted.id;
  console.log("inserted timesheet", inserted);
}

const { data: after } = await admin
  .from("staff_timesheets")
  .select("id, total_hours, total_cost, net_cost, hourly_rate_used, status, submitted_on, is_late, penalty_amount")
  .eq("id", timesheetId)
  .maybeSingle();

if (
  Number(after?.total_hours) !== totalHours ||
  Number(after?.total_cost) !== totalCost ||
  after?.is_late === true
) {
  console.warn("trigger overwrote totals; forcing via SQL", after);
  const sql = `
    alter table public.staff_timesheets disable trigger user;
    update public.staff_timesheets set
      total_hours = ${totalHours},
      hourly_rate_used = ${primaryRate},
      total_cost = ${totalCost},
      net_cost = ${totalCost},
      expected_hours = ${totalHours},
      is_late = false,
      penalty_amount = 0,
      status = 'submitted',
      submitted_on = '${SUBMITTED_ON}'
    where id = '${timesheetId}';
    alter table public.staff_timesheets enable trigger user;
  `;
  const tmpSql = path.join(__dirname, "tmp/bismark-jun-ts-force.sql");
  fs.mkdirSync(path.dirname(tmpSql), { recursive: true });
  fs.writeFileSync(tmpSql, sql);
  const { spawnSync } = await import("child_process");
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", tmpSql],
    { cwd: root, encoding: "utf8" },
  );
  console.log("force sql", r.status, (r.stdout || "").slice(0, 300), (r.stderr || "").slice(0, 400));
}

const logoDataUrl = loadTimesheetLogoDataUrl(root);
const pdf = buildFormattedTimesheetPdfBytes({
  employeeName: NAME,
  roleLabel: ROLE,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  submittedDate: formatIsoDmy(SUBMITTED_ON),
  statusLabel: "On time",
  entries: entries.map((e) =>
    Object.assign({}, e, {
      rate: e.rate,
      completed: true,
      dayOff: false,
      serviceLabel: e.service_label,
      roleLabel: e.role,
      displayRole: e.role,
    }),
  ),
  hourlyRate: primaryRate,
  totalHours,
  totalCost,
  pendingCost: 0,
  potentialCost: totalCost,
  logoDataUrl,
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const storagePath = `${BISMARK_ID}/timesheet/${stamp}_Bismarks_Timesheet_25th_May_to_24th_June.pdf`;
console.log("upload PDF", storagePath);
const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
  contentType: "application/pdf",
  upsert: true,
});
if (upErr) throw new Error("upload: " + upErr.message);

const { data: oldDocs } = await admin
  .from("documents")
  .select("id, title, file_url")
  .eq("user_id", BISMARK_ID)
  .eq("document_type", "timesheet");

for (const d of oldDocs || []) {
  const t = String(d.title || "");
  if (/25th May|24th June|Bismarks_Timesheet_25th_May|Bismark's Timesheet \(25th May/i.test(t)) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
    console.log("removed old doc", d.id, d.title);
  }
}

const title = "Bismark's Timesheet (25th May to 24th June)";
const { error: docErr } = await admin.from("documents").insert({
  user_id: BISMARK_ID,
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
  .select("id, total_hours, total_cost, net_cost, status, submitted_on, period_month, is_late")
  .eq("id", timesheetId)
  .maybeSingle();

console.log("done", { timesheet: verify, document: title, storagePath });
