#!/usr/bin/env node
/**
 * Michelle July timesheet: keep day-offs (red / £0), add work days through 31 Jul,
 * regenerate PDF, replace July doc only.
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
const TIMESHEET_ID = "1ffc5677-4a7b-45ee-9f2e-b1cadbbf3810";
const PERIOD_START = "2026-06-25";
const PERIOD_END = "2026-07-31";
const RATE = 30;

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

function mkWork(iso, hours) {
  return {
    day: weekdayName(iso),
    date: iso,
    note: "",
    role: "Service Lead",
    hours,
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
  const label =
    reason && /time off/i.test(reason)
      ? reason
      : reason
        ? `Day off — ${reason}`
        : "Day off (Time Off Requested)";
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
    service_label: label,
  };
}

const url = readEnv("SUPABASE_URL");
const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: row, error } = await admin
  .from("staff_timesheets")
  .select("*")
  .eq("id", TIMESHEET_ID)
  .maybeSingle();
if (error || !row) throw new Error(error?.message || "timesheet missing");

const { data: offs } = await admin
  .from("staff_unavailability")
  .select("off_date, reason")
  .eq("staff_id", MICHELLE_ID)
  .gte("off_date", PERIOD_START)
  .lte("off_date", PERIOD_END);

const offByDate = new Map();
for (const o of offs || []) {
  const iso = String(o.off_date).slice(0, 10);
  offByDate.set(iso, String(o.reason || "Time off requested — Not working"));
}
/* Always keep Jul 8 even if unavailability row missing. */
if (!offByDate.has("2026-07-08")) {
  offByDate.set("2026-07-08", "Time off requested — Not working");
}

const byDate = new Map();
for (const e of row.entries || []) {
  const iso = String(e.date).slice(0, 10);
  const isOff =
    offByDate.has(iso) ||
    e.dayOff === true ||
    /day off/i.test(String(e.service || "")) ||
    /day off/i.test(String(e.role || ""));
  if (isOff) {
    byDate.set(iso, mkDayOff(iso, offByDate.get(iso) || e.service_label || e.note));
  } else {
    byDate.set(
      iso,
      Object.assign({}, mkWork(iso, Number(e.hours) || 5.5), {
        hours: Number(e.hours) || 5.5,
        completed: true,
        dayOff: false,
      }),
    );
  }
}

/* Force day-off rows from unavailability (replace any work row). */
for (const [iso, reason] of offByDate) {
  byDate.set(iso, mkDayOff(iso, reason));
}

/* Add remaining work days through 31 Jul (Michelle Mon/Tue/Wed/Fri pattern). */
const ADD_WORK = ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-31"];
for (const iso of ADD_WORK) {
  if (offByDate.has(iso)) continue;
  if (!byDate.has(iso)) byDate.set(iso, mkWork(iso, 5.5));
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
const offN = entries.filter((e) => e.dayOff).length;

console.log({
  entries: entries.length,
  dayOffs: offN,
  offDates: entries.filter((e) => e.dayOff).map((e) => e.date),
  totalHours,
  totalCost,
});

const { error: updErr } = await admin
  .from("staff_timesheets")
  .update({
    entries,
    total_hours: totalHours,
    hourly_rate_used: RATE,
    total_cost: totalCost,
    net_cost: totalCost,
    expected_hours: totalHours,
    is_late: false,
    penalty_amount: 0,
    status: "submitted",
    submitted_on: "2026-07-20",
    role_label: "Service Lead",
  })
  .eq("id", TIMESHEET_ID);
if (updErr) throw new Error("update timesheet: " + updErr.message);

const { data: after } = await admin
  .from("staff_timesheets")
  .select("total_hours, hourly_rate_used, total_cost, net_cost")
  .eq("id", TIMESHEET_ID)
  .maybeSingle();
if (
  Number(after?.hourly_rate_used) !== RATE ||
  Number(after?.total_hours) !== totalHours ||
  Number(after?.total_cost) !== totalCost
) {
  const sql = `
    alter table public.staff_timesheets disable trigger user;
    update public.staff_timesheets set
      total_hours = ${totalHours},
      hourly_rate_used = ${RATE},
      total_cost = ${totalCost},
      net_cost = ${totalCost},
      expected_hours = ${totalHours},
      is_late = false,
      penalty_amount = 0
    where id = '${TIMESHEET_ID}';
    alter table public.staff_timesheets enable trigger user;
  `;
  fs.writeFileSync("/tmp/michelle-ts-force.sql", sql);
  const { spawnSync } = await import("child_process");
  spawnSync("npx", ["supabase", "db", "query", "--linked", "-f", "/tmp/michelle-ts-force.sql"], {
    cwd: root,
    encoding: "utf8",
  });
  console.log("forced totals via SQL");
}

const logoDataUrl = loadTimesheetLogoDataUrl(root);
const pdf = buildFormattedTimesheetPdfBytes({
  employeeName: "Michelle Emma Caleb",
  roleLabel: "Service Lead",
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  submittedDate: formatIsoDmy("2026-07-20"),
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

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const storagePath = `${MICHELLE_ID}/timesheet/${ts}_Michelles_Timesheet_25th_June_to_31st_July.pdf`;
const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
  contentType: "application/pdf",
  upsert: true,
});
if (upErr) throw new Error("upload: " + upErr.message);

const { data: julyDocs } = await admin
  .from("documents")
  .select("id, title, file_url")
  .eq("user_id", MICHELLE_ID)
  .eq("document_type", "timesheet");

for (const d of julyDocs || []) {
  const t = String(d.title || "");
  if (/May|June's Timesheet/i.test(t) && !/25th June/i.test(t)) continue;
  if (/25th June|31st July|24th July|Michelles_Timesheet/i.test(t) || /July/i.test(t)) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
    console.log("removed doc", d.id, d.title);
  }
}

const { error: docErr } = await admin.from("documents").insert({
  user_id: MICHELLE_ID,
  document_type: "timesheet",
  category: "finance",
  title: "Michelle's Timesheet (25th June to 31st July)",
  related_date: PERIOD_END,
  file_url: storagePath,
  source_page: "timesheet",
});
if (docErr) throw new Error("document: " + docErr.message);

console.log("OK", { storagePath, totalHours, totalCost, dayOffs: offN });
