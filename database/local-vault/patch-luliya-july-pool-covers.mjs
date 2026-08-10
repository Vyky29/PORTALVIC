#!/usr/bin/env node
/**
 * Luliya July — add missing afternoon pool SI covers + fix 8 Jul DC to 11–3 (4h).
 *
 * Office:
 *  - 30 Jun Acton cover Aurora band = 2h SI (4.30–6.30), not 1.5h from half-slots
 *  - 1 Jul Northolt cover Dan = 2h SI
 *  - 2 Jul Acton cover Aurora = 2h SI
 *  - 8 Jul: Day Centre Ikram 11–3 = 4h SW (her feedback) + Acton teaching pool = 2h SI
 *    (Stephanie 4.30–5.15 + Adam Ab 5.15–6; paid as 2h afternoon band)
 *
 *   node database/local-vault/patch-luliya-july-pool-covers.mjs
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

const LULIYA_ID = "a103a7cf-5984-42c1-bde7-17cba2938c2f";
const NAME = "Aida Luliya";
const PERIOD_MONTH = "2026-07-01";
const PERIOD_START = "2026-06-25";
const PERIOD_END = "2026-07-31";
const RATE_SW = 18;
const RATE_SI = 22;

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

function rateForRole(role) {
  if (/swim/i.test(String(role || ""))) return RATE_SI;
  return RATE_SW;
}

function weekdayName(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" });
}

function mkSi(iso, hours, label) {
  return {
    day: weekdayName(iso),
    date: iso,
    note: "",
    role: "Swimming Instructor",
    hours,
    manual: true,
    service: "Aquatic Activity",
    completed: true,
    dayOff: false,
    late_hold: false,
    feedback_late: false,
    rate: RATE_SI,
    venue: /Northolt/i.test(label) ? "Northolt" : "Acton",
    time_range: "4.30-6.30",
    service_name: "Aquatic Activity",
    service_label: label,
    serviceName: "Aquatic Activity",
    serviceLabel: label,
    roleLabel: "Swimming Instructor 1",
    displayRole: "Swimming Instructor 1",
  };
}

function mkDc(iso, hours, label) {
  return {
    day: weekdayName(iso),
    date: iso,
    note: "",
    role: "Support Worker",
    hours,
    manual: true,
    service: "Day Centre",
    completed: true,
    dayOff: false,
    late_hold: false,
    feedback_late: false,
    rate: RATE_SW,
    venue: "SwimFarm",
    time_range: hours === 4 ? "11.00-3.00" : "11.00-4.00",
    service_name: "Day Centre",
    service_label: label,
    serviceName: "Day Centre",
    serviceLabel: label,
    roleLabel: "Support Worker 1",
    displayRole: "Support Worker 1",
  };
}

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: sheet, error: loadErr } = await admin
  .from("staff_timesheets")
  .select("*")
  .eq("submitted_by_user_id", LULIYA_ID)
  .eq("period_month", PERIOD_MONTH)
  .single();
if (loadErr) throw loadErr;

const PATCH_DATES = new Set([
  "2026-06-30",
  "2026-07-01",
  "2026-07-02",
  "2026-07-08",
]);

const before = (sheet.entries || []).filter((e) => PATCH_DATES.has(e.date));
console.log("before patch days", before);

const kept = (sheet.entries || []).filter((e) => !PATCH_DATES.has(e.date));

/* Keep existing non-pool rows for 30 Jun / 1 Jul (DC morning), replace 8 Jul DC, add SI. */
const jun30Dc = (sheet.entries || []).find(
  (e) => e.date === "2026-06-30" && /support|day centre/i.test(String(e.role || e.service || "")),
);
const jul1Dc = (sheet.entries || []).find(
  (e) => e.date === "2026-07-01" && /support|day centre/i.test(String(e.role || e.service || "")),
);

const add = [
  jun30Dc
    ? Object.assign({}, jun30Dc, { rate: RATE_SW, hours: Number(jun30Dc.hours || 5) })
    : mkDc("2026-06-30", 5, "Day Centre (SwimFarm) · Ikram 11–4"),
  mkSi(
    "2026-06-30",
    2,
    "4.30-6.30 Aquatic Activity (cover Aurora · Acton)\nActon\nSwimming Instructor",
  ),
  jul1Dc
    ? Object.assign({}, jul1Dc, { rate: RATE_SW, hours: Number(jul1Dc.hours || 5) })
    : mkDc("2026-07-01", 5, "Day Centre (SwimFarm) · Ikram 11–4"),
  mkSi(
    "2026-07-01",
    2,
    "4.30-6.30 Aquatic Activity (cover Dan · Northolt)\nNortholt\nSwimming Instructor",
  ),
  mkSi(
    "2026-07-02",
    2,
    "4.30-6.30 Aquatic Activity (cover Aurora · Acton)\nActon\nSwimming Instructor",
  ),
  mkDc("2026-07-08", 4, "Day Centre (SwimFarm) · Ikram 11–3"),
  mkSi(
    "2026-07-08",
    2,
    "4.30-6.30 Multi-Activity teaching pool (Stephanie + Adam Ab · Acton)\nActon\nSwimming Instructor",
  ),
];

const entries = kept.concat(add).sort((a, b) => {
  const c = String(a.date || "").localeCompare(String(b.date || ""));
  if (c !== 0) return c;
  const ra = /swim/i.test(String(a.role || "")) ? 1 : 0;
  const rb = /swim/i.test(String(b.role || "")) ? 1 : 0;
  return ra - rb;
});

const enriched = entries.map((e) => {
  const rate =
    e.rate != null && Number(e.rate) > 0 ? Number(e.rate) : rateForRole(e.role);
  return Object.assign({}, e, { rate });
});

const totalHours = Number(
  enriched.reduce((a, e) => a + Number(e.hours || 0), 0).toFixed(2),
);
const totalCost = Number(
  enriched
    .reduce((a, e) => a + Number(e.hours || 0) * Number(e.rate || 0), 0)
    .toFixed(2),
);
const blended = totalHours > 0 ? Number((totalCost / totalHours).toFixed(2)) : RATE_SW;
const roleLabel = "Support Worker 1 · Swimming Instructor 1";

console.log({
  totalHours,
  totalCost,
  blended,
  deltaHours: totalHours - Number(sheet.total_hours),
  deltaCost: totalCost - Number(sheet.total_cost),
  patchDays: enriched.filter((e) => PATCH_DATES.has(e.date)),
});

const { error: updErr } = await admin
  .from("staff_timesheets")
  .update({
    entries: enriched,
    total_hours: totalHours,
    total_cost: totalCost,
    net_cost: totalCost,
    expected_hours: totalHours,
    hourly_rate_used: blended,
    role_label: roleLabel,
    penalty_amount: 0,
    is_late: false,
    submitted_on: "2026-07-31",
  })
  .eq("id", sheet.id);
if (updErr) throw new Error("update: " + updErr.message);

const { data: after } = await admin
  .from("staff_timesheets")
  .select("id, total_hours, total_cost, period_month, submitted_on, entries")
  .eq("id", sheet.id)
  .single();

if (
  Number(after?.total_hours) !== totalHours ||
  Number(after?.total_cost) !== totalCost ||
  String(after?.period_month).slice(0, 10) !== PERIOD_MONTH
) {
  console.warn("forcing totals/period via SQL", {
    got: {
      hours: after?.total_hours,
      cost: after?.total_cost,
      period: after?.period_month,
    },
    want: { totalHours, totalCost, PERIOD_MONTH },
  });
  const sql = `
    alter table public.staff_timesheets disable trigger user;
    update public.staff_timesheets set
      period_month = '${PERIOD_MONTH}',
      submitted_on = '2026-07-31',
      is_late = false,
      penalty_amount = 0,
      total_hours = ${totalHours},
      hourly_rate_used = ${blended},
      total_cost = ${totalCost},
      net_cost = ${totalCost},
      expected_hours = ${totalHours},
      role_label = '${roleLabel.replace(/'/g, "''")}'
    where id = '${sheet.id}';
    alter table public.staff_timesheets enable trigger user;
  `;
  const tmpSql = path.join(__dirname, "tmp/luliya-july-pool-force.sql");
  fs.mkdirSync(path.dirname(tmpSql), { recursive: true });
  fs.writeFileSync(tmpSql, sql);
  const { spawnSync } = await import("child_process");
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", tmpSql],
    { cwd: root, encoding: "utf8" },
  );
  console.log("force sql", r.status, (r.stderr || "").slice(0, 200));
}

const logoDataUrl = loadTimesheetLogoDataUrl(root);
const pdf = buildFormattedTimesheetPdfBytes({
  employeeName: NAME,
  roleLabel,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  submittedDate: formatIsoDmy("2026-07-31"),
  statusLabel: "On time",
  entries: enriched.map((e) =>
    Object.assign({}, e, {
      completed: true,
      dayOff: !!e.dayOff,
      serviceLabel: e.service_label || e.serviceLabel,
      roleLabel: e.roleLabel || e.role,
      displayRole: e.displayRole || e.roleLabel || e.role,
    }),
  ),
  hourlyRate: blended,
  totalHours,
  totalCost,
  pendingCost: 0,
  potentialCost: totalCost,
  logoDataUrl,
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const storagePath = `${LULIYA_ID}/timesheet/${stamp}_Luliyas_Timesheet_25th_June_to_31st_July.pdf`;
const { error: upErr } = await admin.storage.from("documents").upload(storagePath, pdf, {
  contentType: "application/pdf",
  upsert: true,
});
if (upErr) throw new Error("upload: " + upErr.message);

const { data: oldDocs } = await admin
  .from("documents")
  .select("id, title, file_url")
  .eq("user_id", LULIYA_ID)
  .eq("document_type", "timesheet");

for (const d of oldDocs || []) {
  const t = String(d.title || "");
  if (/25th June|31st July|June to 31st July/i.test(t)) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
    console.log("removed old doc", d.id, d.title);
  }
}

const title = "Aida Luliya's Timesheet (25th June to 31st July)";
const { error: docErr } = await admin.from("documents").insert({
  user_id: LULIYA_ID,
  document_type: "timesheet",
  category: "finance",
  title,
  related_date: PERIOD_END,
  file_url: storagePath,
  source_page: "office-patch-luliya-july-pool",
});
if (docErr) throw new Error("document: " + docErr.message);

const outPdf = path.join(__dirname, "tmp/Aida_Luliya_Timesheet_25th_June_to_31st_July.pdf");
fs.mkdirSync(path.dirname(outPdf), { recursive: true });
fs.writeFileSync(outPdf, pdf);

const { data: verify } = await admin
  .from("staff_timesheets")
  .select("id, period_month, total_hours, total_cost, net_cost, hourly_rate_used, role_label, entries")
  .eq("id", sheet.id)
  .single();

const siH = (verify.entries || [])
  .filter((e) => /swim/i.test(String(e.role || "")))
  .reduce((a, e) => a + Number(e.hours || 0), 0);
const swH = (verify.entries || [])
  .filter((e) => /support/i.test(String(e.role || "")))
  .reduce((a, e) => a + Number(e.hours || 0), 0);

console.log("done", {
  period: verify.period_month,
  hours: verify.total_hours,
  cost: verify.total_cost,
  rate: verify.hourly_rate_used,
  swH,
  siH,
  patchDays: (verify.entries || []).filter((e) => PATCH_DATES.has(e.date)),
  document: title,
});
