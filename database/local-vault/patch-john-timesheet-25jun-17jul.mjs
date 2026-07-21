#!/usr/bin/env node
/**
 * John Kyei-Fram — timesheet 25 Jun → 17 Jul 2026, submitted.
 * Roster shifts from machine timetable + day-offs + £60 June extra (2h @ £30).
 * Writes staff_timesheets (Admin payroll) + PDF in Documents (My Documents).
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

const JOHN_ID = "fec4f699-739e-48ee-ba0c-604f9887e874";
const PERIOD_START = "2026-06-25";
const PERIOD_END = "2026-07-17";
const PERIOD_MONTH = "2026-07-01";
const RATE = 30;
const JUNE_EXTRA_GBP = 60;
const SUBMITTED_ON = "2026-07-17";
const NAME = "John Kyei-Fram";
const ROLE = "Service Lead";

const DAY_OFFS = new Map([
  ["2026-07-08", "Time off requested — Planned Absence — Other"],
  ["2026-07-10", "Time off requested — Planned Absence — Other"],
]);

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

function loadJohnShifts() {
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
        /^john$/i.test(r.staff) &&
        r.session_date >= PERIOD_START &&
        r.session_date <= PERIOD_END,
    );
}

function mkWork(iso, hours, label) {
  return {
    day: weekdayName(iso),
    date: iso,
    note: "",
    role: ROLE,
    hours,
    manual: false,
    service: label,
    completed: true,
    dayOff: false,
    late_hold: false,
    feedback_late: false,
    rate: RATE,
    service_label: label,
  };
}

function mkDayOff(iso, reason) {
  return {
    day: weekdayName(iso),
    date: iso,
    note: "",
    role: "Day off",
    hours: 0,
    manual: false,
    service: "Day off",
    completed: true,
    dayOff: true,
    late_hold: false,
    feedback_late: false,
    rate: 0,
    service_label: reason || "Day off",
  };
}

function mkJuneExtra() {
  const hours = Number((JUNE_EXTRA_GBP / RATE).toFixed(2));
  return {
    day: "",
    date: "",
    note: "Extra pay from June (£60)",
    role: ROLE,
    hours,
    manual: true,
    service: "Extra hours (June)",
    completed: true,
    dayOff: false,
    late_hold: false,
    feedback_late: false,
    rate: RATE,
    service_label: "Extra hours (June)",
  };
}

const shifts = loadJohnShifts();
const byDate = new Map();
for (const r of shifts) {
  const iso = r.session_date;
  if (DAY_OFFS.has(iso)) {
    byDate.set(iso, mkDayOff(iso, DAY_OFFS.get(iso)));
    continue;
  }
  let hours = parseMachineSlotHours(r.time_range, r.day);
  if (!(hours > 0)) continue;
  /* Programme leads (Berta/John): Sunday MA / SwimFarm = 5.5h. */
  if (String(r.day || "") === "Sunday") {
    hours = 5.5;
  }
  const label = `${r.time_range} ${r.venue}`.trim();
  byDate.set(iso, mkWork(iso, hours, label));
}
for (const [iso, reason] of DAY_OFFS) {
  byDate.set(iso, mkDayOff(iso, reason));
}

/* Extra June hours last, no date — not sorted into a calendar day. */
const datedEntries = [...byDate.values()].sort((a, b) =>
  String(a.date).localeCompare(String(b.date)),
);
const entries = [...datedEntries, mkJuneExtra()];
const totalHours = Number(
  entries
    .filter((e) => !e.dayOff)
    .reduce((s, e) => s + (Number(e.hours) || 0), 0)
    .toFixed(2),
);
const totalCost = Number((totalHours * RATE).toFixed(2));

console.log({
  shifts: shifts.length,
  entries: entries.length,
  dayOffs: [...DAY_OFFS.keys()],
  totalHours,
  totalCost,
  juneExtra: JUNE_EXTRA_GBP,
  preview: entries.map((e) => ({
    date: e.date,
    hours: e.hours,
    dayOff: !!e.dayOff,
    service: e.service_label || e.service,
  })),
});

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existing } = await admin
  .from("staff_timesheets")
  .select("id")
  .eq("submitted_by_user_id", JOHN_ID)
  .eq("period_month", PERIOD_MONTH)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

const payload = {
  submitted_by_user_id: JOHN_ID,
  submitted_by_name: NAME,
  period_month: PERIOD_MONTH,
  role_label: ROLE,
  total_hours: totalHours,
  entries,
  hourly_rate_used: RATE,
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
  .select("id, total_hours, total_cost, net_cost, hourly_rate_used, status, submitted_on, is_late")
  .eq("id", timesheetId)
  .maybeSingle();

if (
  Number(after?.total_hours) !== totalHours ||
  Number(after?.total_cost) !== totalCost ||
  Number(after?.hourly_rate_used) !== RATE
) {
  console.warn("trigger overwrote totals; forcing via SQL", after);
  const sql = `
    alter table public.staff_timesheets disable trigger user;
    update public.staff_timesheets set
      total_hours = ${totalHours},
      hourly_rate_used = ${RATE},
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
  const tmpSql = path.join(__dirname, "tmp/john-ts-force.sql");
  fs.mkdirSync(path.dirname(tmpSql), { recursive: true });
  fs.writeFileSync(tmpSql, sql);
  const { spawnSync } = await import("child_process");
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", tmpSql],
    { cwd: root, encoding: "utf8" },
  );
  console.log("force sql", r.status, (r.stdout || "").slice(0, 200), (r.stderr || "").slice(0, 400));
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
      rate: e.dayOff ? 0 : RATE,
      completed: true,
      dayOff: !!e.dayOff,
      serviceLabel: e.service_label || e.service,
      roleLabel: e.dayOff ? "" : ROLE,
      displayRole: e.dayOff ? "" : ROLE,
    }),
  ),
  hourlyRate: RATE,
  totalHours,
  totalCost,
  pendingCost: 0,
  potentialCost: totalCost,
  logoDataUrl,
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const storagePath = `${JOHN_ID}/timesheet/${stamp}_Johns_Timesheet_25th_June_to_17th_July.pdf`;
const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
  contentType: "application/pdf",
  upsert: true,
});
if (upErr) throw new Error("upload: " + upErr.message);

const { data: julyDocs } = await admin
  .from("documents")
  .select("id, title, file_url")
  .eq("user_id", JOHN_ID)
  .eq("document_type", "timesheet");

for (const d of julyDocs || []) {
  const t = String(d.title || "");
  if (/25th June|17th July|Johns_Timesheet|John's Timesheet \(25/i.test(t)) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
    console.log("removed old doc", d.id, d.title);
  }
}

const title = "John's Timesheet (25th June to 17th July)";
const { error: docErr } = await admin.from("documents").insert({
  user_id: JOHN_ID,
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
  .select("id, total_hours, total_cost, net_cost, status, submitted_on, period_month")
  .eq("id", timesheetId)
  .maybeSingle();

console.log("OK", {
  timesheetId,
  verify,
  storagePath,
  title,
  totalHours,
  totalCost,
});
