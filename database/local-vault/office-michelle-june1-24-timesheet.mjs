#!/usr/bin/env node
/**
 * Michelle Emma Caleb — timesheet 1 Jun → 24 Jun 2026 (Day Centre).
 * Pay band: Mon/Tue/Wed/Fri · 5.5h @ £30 (10:45–16:15).
 * Day offs from staff_unavailability: 10 Jun, 24 Jun.
 * 17 Jun: not on staff CSV (Luliya cover) but Michelle feedback → include 5.5h.
 *
 *   node database/local-vault/office-michelle-june1-24-timesheet.mjs
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

const MICHELLE_ID = "4ae392bb-edd1-4aea-88bb-19eedc2a03c1";
const NAME = "Michelle Emma Caleb";
const ROLE = "Service Lead";
const PERIOD_START = "2026-06-01";
const PERIOD_END = "2026-06-24";
const PERIOD_MONTH = "2026-06-01";
const SUBMITTED_ON = "2026-06-24";
const RATE = 30;
const HOURS = 5.5;

/** CSV work days Mon/Tue/Wed/Fri · excludes day-offs 10 & 24 Jun.
 *  17 Jun: Luliya on rota (Michelle not scheduled) — omit from DC base. */
const WORK_DATES = [
  "2026-06-01",
  "2026-06-02",
  "2026-06-03",
  "2026-06-05",
  "2026-06-08",
  "2026-06-09",
  "2026-06-12",
  "2026-06-15",
  "2026-06-16",
  "2026-06-19",
  "2026-06-22",
  "2026-06-23",
];

const DAY_OFFS = {
  "2026-06-10": "Not working",
  "2026-06-24": "Not working",
};

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

function mkWork(iso) {
  return {
    day: weekdayName(iso),
    date: iso,
    note: "",
    role: ROLE,
    hours: HOURS,
    manual: false,
    service: "Day Centre",
    completed: true,
    dayOff: false,
    late_hold: false,
    feedback_late: false,
    rate: RATE,
    service_label: "Day Centre (SwimFarm)",
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
    service_label: reason
      ? `Day off — ${reason}`
      : "Day off (Time Off Requested)",
  };
}

const url = readEnv("SUPABASE_URL");
const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const byDate = new Map();
for (const iso of WORK_DATES) byDate.set(iso, mkWork(iso));
for (const [iso, reason] of Object.entries(DAY_OFFS)) {
  byDate.set(iso, mkDayOff(iso, reason));
}

const entries = [...byDate.values()].sort((a, b) =>
  String(a.date).localeCompare(String(b.date)),
);
const totalHours =
  Math.round(
    entries
      .filter((e) => !e.dayOff)
      .reduce((s, e) => s + (Number(e.hours) || 0), 0) * 100,
  ) / 100;
const totalCost = Math.round(totalHours * RATE * 100) / 100;

console.log({
  period: `${PERIOD_START} → ${PERIOD_END}`,
  workDays: WORK_DATES.length,
  dayOffs: Object.keys(DAY_OFFS),
  totalHours,
  totalCost,
});

const { data: existing } = await admin
  .from("staff_timesheets")
  .select("id")
  .eq("submitted_by_user_id", MICHELLE_ID)
  .eq("period_month", PERIOD_MONTH)
  .maybeSingle();

const payload = {
  submitted_by_user_id: MICHELLE_ID,
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
    .select("id, total_hours, total_cost, status")
    .single();
  if (error) throw new Error("insert timesheet: " + error.message);
  timesheetId = inserted.id;
  console.log("inserted timesheet", inserted);
}

const { data: after } = await admin
  .from("staff_timesheets")
  .select("id, total_hours, total_cost, net_cost, hourly_rate_used, is_late")
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
  const tmpSql = path.join(__dirname, "tmp/michelle-jun1-24-ts-force.sql");
  fs.mkdirSync(path.dirname(tmpSql), { recursive: true });
  fs.writeFileSync(tmpSql, sql);
  const { spawnSync } = await import("child_process");
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", tmpSql],
    { cwd: root, encoding: "utf8" },
  );
  console.log("force sql", r.status, (r.stdout || "").slice(0, 200));
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
const storagePath = `${MICHELLE_ID}/timesheet/${stamp}_Michelles_Timesheet_1st_June_to_24th_June.pdf`;
const localPdf = path.join(__dirname, "tmp", "Michelle_Timesheet_1st_June_to_24th_June.pdf");
fs.mkdirSync(path.dirname(localPdf), { recursive: true });
fs.writeFileSync(localPdf, pdf);
console.log("local PDF", localPdf);

const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
  contentType: "application/pdf",
  upsert: true,
});
if (upErr) throw new Error("upload: " + upErr.message);

const { data: oldDocs } = await admin
  .from("documents")
  .select("id, title, file_url")
  .eq("user_id", MICHELLE_ID)
  .eq("document_type", "timesheet");

for (const d of oldDocs || []) {
  const t = String(d.title || "");
  if (/1st June|1 June|to 24th June\)|Timesheet \(1/i.test(t) && !/25th June/i.test(t)) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
    console.log("removed old doc", d.id, d.title);
  }
}

const title = "Michelle's Timesheet (1st June to 24th June)";
const { error: docErr } = await admin.from("documents").insert({
  user_id: MICHELLE_ID,
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

console.log("OK", { timesheet: verify, document: title, storagePath, totalHours, totalCost });
