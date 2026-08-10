#!/usr/bin/env node
/**
 * July 2026 payroll fixes:
 * 1) Javier — clear late_hold on submitted timesheet so hours pay (£0 → payable)
 * 2) Luliya — office timesheet from MADRE/rota (25 Jun–31 Jul) + PDF
 * 3) Raul + Victor — director contract £4,167 each for July
 * 4) Preview payroll-monthly-report
 *
 *   node database/local-vault/office-july-payroll-javier-luliya-directors.mjs
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  buildFormattedTimesheetPdfBytes,
  formatIsoDmy,
  loadTimesheetLogoDataUrl,
} from "./timesheet-pdf-layout.mjs";
import { readPayrollCronSecret } from "./read_payroll_cron_secret.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const PERIOD_MONTH = "2026-07-01";
const PERIOD_START = "2026-06-25";
const LULIYA_PERIOD_END = "2026-07-31";
const JAVIER_PERIOD_END = "2026-07-24";
const SUBMITTED_ON = "2026-07-24";

const JAVIER_ID = "688afb7d-d5ad-4c9b-a04f-e28ddccda91f";
const LULIYA_ID = "a103a7cf-5984-42c1-bde7-17cba2938c2f";
const RAUL_ID = "69bb3b02-e5f1-4e95-9334-285281d0a190";
const VICTOR_ID = "a0d439df-3a8f-439d-b427-b3459552eae1";
const ADMIN_UID = VICTOR_ID;

const SW_RATE = 18;
const DIRECTOR_GROSS = 4167;

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

function forceTimesheetTotals(id, hours, cost, rate, roleLabel) {
  const sql = `
    alter table public.staff_timesheets disable trigger user;
    update public.staff_timesheets set
      total_hours = ${hours},
      hourly_rate_used = ${rate},
      total_cost = ${cost},
      net_cost = ${cost},
      expected_hours = ${hours},
      is_late = false,
      penalty_amount = 0,
      role_label = '${roleLabel.replace(/'/g, "''")}',
      status = 'submitted',
      submitted_on = '${SUBMITTED_ON}'
    where id = '${id}';
    alter table public.staff_timesheets enable trigger user;
  `;
  const tmpSql = path.join(__dirname, "tmp/july-payroll-force-ts.sql");
  fs.mkdirSync(path.dirname(tmpSql), { recursive: true });
  fs.writeFileSync(tmpSql, sql);
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", tmpSql],
    { cwd: root, encoding: "utf8" },
  );
  if (r.status !== 0) {
    throw new Error("force sql failed: " + (r.stderr || r.stdout || ""));
  }
  console.log("force sql ok", id, hours, cost);
}

const url = readEnv("SUPABASE_URL");
const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── 1) Javier: clear late_hold ──────────────────────────────────────────────
console.log("=== 1) Javier late_hold release ===");
const { data: javRow, error: javErr } = await admin
  .from("staff_timesheets")
  .select("id,entries,total_hours,total_cost")
  .eq("period_month", PERIOD_MONTH)
  .eq("submitted_by_user_id", JAVIER_ID)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (javErr) throw javErr;
if (!javRow) throw new Error("Javier July timesheet missing");

const javEntries = (javRow.entries || []).map((e) => {
  const copy = { ...e };
  copy.late_hold = false;
  copy.feedback_late = false;
  copy.lateHold = false;
  return copy;
});
const javHours =
  Math.round(
    javEntries
      .filter((e) => !e.dayOff)
      .reduce((s, e) => s + (Number(e.hours) || 0), 0) * 100,
  ) / 100;
const javRate = 28;
const javCost = Math.round(javHours * javRate * 100) / 100;

const { error: javUpErr } = await admin
  .from("staff_timesheets")
  .update({ entries: javEntries })
  .eq("id", javRow.id);
if (javUpErr) throw javUpErr;

// Clear admin late-pay holds for those dates
const javDates = [
  ...new Set(
    javEntries
      .filter((e) => !e.dayOff && Number(e.hours) > 0)
      .map((e) => String(e.date).slice(0, 10)),
  ),
];
if (javDates.length) {
  const clearPayload = javDates.map((d) => ({
    staff_user_id: JAVIER_ID,
    session_date: d,
    cleared_by_user_id: ADMIN_UID,
    note: "July payroll: release late feedback hold for report",
  }));
  const { error: clearErr } = await admin
    .from("portal_late_feedback_pay_clearances")
    .upsert(clearPayload, { onConflict: "staff_user_id,session_date" });
  if (clearErr) {
    console.warn("late clear upsert skipped:", clearErr.message);
  }
}

const { data: javAfter } = await admin
  .from("staff_timesheets")
  .select("id,total_hours,total_cost,net_cost")
  .eq("id", javRow.id)
  .maybeSingle();
if (Number(javAfter?.total_cost) !== javCost) {
  forceTimesheetTotals(javRow.id, javHours, javCost, javRate, "Swimming Instructor 3");
}
console.log("Javier", { hours: javHours, cost: javCost, id: javRow.id });

// ── 2) Luliya timesheet ─────────────────────────────────────────────────────
console.log("=== 2) Luliya office timesheet ===");

/** Work days from MADRE/rota (Ikram DC + Sunday MA + Northolt shadow). Jul 22 sick. */
const LULIYA_DC = [
  "2026-06-26",
  "2026-06-29",
  "2026-06-30",
  "2026-07-01",
  "2026-07-03",
  "2026-07-06",
  "2026-07-07",
  "2026-07-08",
  "2026-07-10",
  "2026-07-14",
  "2026-07-16",
  "2026-07-17",
  "2026-07-20",
  "2026-07-21",
  "2026-07-24",
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-31",
];
/** Ikram cut to 11–3 when afternoon Northolt shadowing the same day. */
const LULIYA_DC_CUTOFF_SHADOW = {
  "2026-07-13": true,
  "2026-07-15": true,
};
const LULIYA_SUNDAY = ["2026-06-28"];
const LULIYA_OFF = {
  "2026-07-22": "Time off requested — Sick",
};

function mkLuliya(iso, hours, label, role = "Support Worker") {
  return {
    day: weekdayName(iso),
    date: iso,
    note: "",
    role,
    hours,
    manual: false,
    service: /shadow/i.test(label) ? "Shadowing" : /Sunday|Multi/i.test(label) ? "Multi-Activity" : "Day Centre",
    completed: true,
    dayOff: false,
    late_hold: false,
    feedback_late: false,
    rate: SW_RATE,
    venue: /Northolt|shadow/i.test(label) ? "Northolt" : "SwimFarm",
    service_label: label,
  };
}

function mkOff(iso, reason) {
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
    service_label: reason,
  };
}

const luliyaEntries = [];
for (const iso of LULIYA_DC) {
  luliyaEntries.push(
    mkLuliya(iso, 5, "Day Centre (SwimFarm) · Ikram 11–4"),
  );
}
for (const iso of Object.keys(LULIYA_DC_CUTOFF_SHADOW)) {
  luliyaEntries.push(
    mkLuliya(iso, 4, "Day Centre (SwimFarm) · Ikram 11–3"),
  );
  luliyaEntries.push(
    mkLuliya(iso, 2, "Shadowing Roberto (Northolt) 4.30–6.30"),
  );
}
for (const iso of LULIYA_SUNDAY) {
  luliyaEntries.push(
    mkLuliya(iso, 5, "Sunday Multi-Activity (SwimFarm) 9.15–2.15"),
  );
}
for (const [iso, reason] of Object.entries(LULIYA_OFF)) {
  luliyaEntries.push(mkOff(iso, reason));
}
luliyaEntries.sort((a, b) => String(a.date).localeCompare(String(b.date)));

const luliyaHours =
  Math.round(
    luliyaEntries
      .filter((e) => !e.dayOff)
      .reduce((s, e) => s + (Number(e.hours) || 0), 0) * 100,
  ) / 100;
const luliyaCost = Math.round(luliyaHours * SW_RATE * 100) / 100;

const { data: existingLuliya } = await admin
  .from("staff_timesheets")
  .select("id")
  .eq("submitted_by_user_id", LULIYA_ID)
  .eq("period_month", PERIOD_MONTH)
  .maybeSingle();

const luliyaPayload = {
  submitted_by_user_id: LULIYA_ID,
  submitted_by_name: "Aida Luliya",
  period_month: PERIOD_MONTH,
  role_label: "Support Worker 1",
  total_hours: luliyaHours,
  entries: luliyaEntries,
  hourly_rate_used: SW_RATE,
  total_cost: luliyaCost,
  net_cost: luliyaCost,
  expected_hours: luliyaHours,
  is_late: false,
  penalty_amount: 0,
  status: "submitted",
  submitted_on: SUBMITTED_ON,
};

let luliyaId = existingLuliya?.id || null;
if (luliyaId) {
  const { error } = await admin
    .from("staff_timesheets")
    .update(luliyaPayload)
    .eq("id", luliyaId);
  if (error) throw new Error("luliya update: " + error.message);
} else {
  const { data: inserted, error } = await admin
    .from("staff_timesheets")
    .insert([luliyaPayload])
    .select("id")
    .single();
  if (error) throw new Error("luliya insert: " + error.message);
  luliyaId = inserted.id;
}

const { data: luliyaAfter } = await admin
  .from("staff_timesheets")
  .select("total_hours,total_cost,net_cost")
  .eq("id", luliyaId)
  .maybeSingle();
if (
  Number(luliyaAfter?.total_hours) !== luliyaHours ||
  Number(luliyaAfter?.total_cost) !== luliyaCost
) {
  forceTimesheetTotals(
    luliyaId,
    luliyaHours,
    luliyaCost,
    SW_RATE,
    "Support Worker 1",
  );
}

const logoDataUrl = loadTimesheetLogoDataUrl(root);
const luliyaPdf = buildFormattedTimesheetPdfBytes({
  employeeName: "Aida Luliya",
  roleLabel: "Support Worker 1",
  periodStart: PERIOD_START,
  periodEnd: LULIYA_PERIOD_END,
  submittedDate: formatIsoDmy(SUBMITTED_ON),
  statusLabel: "On time",
  entries: luliyaEntries.map((e) =>
    Object.assign({}, e, {
      rate: e.dayOff ? 0 : SW_RATE,
      completed: true,
      dayOff: !!e.dayOff,
    }),
  ),
  hourlyRate: SW_RATE,
  totalHours: luliyaHours,
  totalCost: luliyaCost,
  pendingCost: 0,
  potentialCost: luliyaCost,
  logoDataUrl,
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const luliyaStorage = `${LULIYA_ID}/timesheet/${stamp}_Aida_Luliya_Timesheet_25th_June_to_31st_July.pdf`;
const localPdf = path.join(
  __dirname,
  "tmp",
  "Aida_Luliya_Timesheet_25th_June_to_31st_July.pdf",
);
fs.mkdirSync(path.dirname(localPdf), { recursive: true });
fs.writeFileSync(localPdf, luliyaPdf);

const { error: upErr } = await admin.storage
  .from("documents")
  .upload(luliyaStorage, luliyaPdf, { contentType: "application/pdf", upsert: true });
if (upErr) throw new Error("luliya upload: " + upErr.message);

const { data: oldDocs } = await admin
  .from("documents")
  .select("id,title,file_url")
  .eq("user_id", LULIYA_ID)
  .eq("document_type", "timesheet");
for (const d of oldDocs || []) {
  if (/June|July|Timesheet/i.test(String(d.title || ""))) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
  }
}

const luliyaTitle = "Aida Luliya's Timesheet (25th June to 31st July)";
const { error: docErr } = await admin.from("documents").insert({
  user_id: LULIYA_ID,
  document_type: "timesheet",
  category: "finance",
  title: luliyaTitle,
  related_date: LULIYA_PERIOD_END,
  file_url: luliyaStorage,
  source_page: "timesheet",
});
if (docErr) throw new Error("luliya document: " + docErr.message);
console.log("Luliya", { hours: luliyaHours, cost: luliyaCost, id: luliyaId });

// ── 3) Raul + Victor director salaries ──────────────────────────────────────
console.log("=== 3) Raul + Victor director contracts ===");
for (const row of [
  { user_id: RAUL_ID, name: "Raul" },
  { user_id: VICTOR_ID, name: "Victor" },
]) {
  const { data: existing } = await admin
    .from("staff_timesheet_imports")
    .select("id")
    .eq("period_month", PERIOD_MONTH)
    .eq("name", row.name)
    .maybeSingle();
  const payload = {
    user_id: row.user_id,
    period_month: PERIOD_MONTH,
    name: row.name,
    role: "Director",
    pay_type: "contract",
    gross: DIRECTOR_GROSS,
    contract_type: "Full time",
    total_hours: null,
  };
  if (existing?.id) {
    const { error } = await admin
      .from("staff_timesheet_imports")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(row.name + " import update: " + error.message);
    console.log("updated import", row.name);
  } else {
    const { error } = await admin.from("staff_timesheet_imports").insert([payload]);
    if (error) throw new Error(row.name + " import insert: " + error.message);
    console.log("inserted import", row.name);
  }
}

// ── 4) Payroll preview ──────────────────────────────────────────────────────
console.log("=== 4) payroll-monthly-report preview ===");
const secret = readPayrollCronSecret();
const fnUrl = `${url.replace(/\/$/, "")}/functions/v1/payroll-monthly-report`;
const resp = await fetch(fnUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    "x-payroll-cron-secret": secret,
  },
  // dryRun is a boolean flag — mode "dryRun" is NOT valid and defaults to SEND.
  body: JSON.stringify({ month: "2026-07", dryRun: true }),
});
const body = await resp.json().catch(() => ({}));
if (!resp.ok) {
  console.error(body);
  throw new Error("payroll preview failed: " + resp.status);
}

const workers = body.workers || [];
const contracts = body.contracts || [];
const notSubmitted = body.missing || body.notSubmitted || [];
const pick = (name) =>
  [...workers, ...contracts].filter((r) =>
    String(r.name || "").toLowerCase().includes(name),
  );

console.log(
  JSON.stringify(
    {
      summary: body.summary,
      javier: pick("javier"),
      luliya: pick("luli").concat(pick("aida")),
      raul: pick("raul"),
      victor: pick("victor"),
      notSubmitted: notSubmitted.map((n) => n.name),
    },
    null,
    2,
  ),
);

console.log("OK", {
  javier: { hours: javHours, cost: javCost },
  luliya: { hours: luliyaHours, cost: luliyaCost },
  directors: DIRECTOR_GROSS,
});
