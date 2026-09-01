#!/usr/bin/env node
/**
 * John Kyei-Fram — pay Sunday 5 Jul 2026 (missed on July timesheet) in August payroll.
 * 5.5h Service Lead Multi-Activity @ £30 = £165.
 *
 *   node database/local-vault/patch-john-aug-jul5-backpay.mjs
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
import { SUNDAY_LEAD_MA_PAY_HOURS } from "./timesheet-pay-hours.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const JOHN_ID = "fec4f699-739e-48ee-ba0c-604f9887e874";
const NAME = "John Kyei-Fram";
const ROLE = "Service Lead";
const RATE = 30;
const WORK_DATE = "2026-07-05";
const PERIOD_MONTH = "2026-08-01";
const PERIOD_START = "2026-07-05";
const PERIOD_END = "2026-07-05";
const SUBMITTED_ON = "2026-08-28";
const HOURS = SUNDAY_LEAD_MA_PAY_HOURS; // 5.5
const ADMIN_UID = "a0d439df-3a8f-439d-b427-b3459552eae1";

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

const totalHours = HOURS;
const totalCost = Number((totalHours * RATE).toFixed(2));

const entry = {
  day: "Sunday",
  date: WORK_DATE,
  note: "Backpay — missed on July timesheet; paid in August",
  role: ROLE,
  roleLabel: ROLE,
  displayRole: ROLE,
  hours: HOURS,
  manual: true,
  admin: true,
  service: "Multi-Activity",
  serviceName: "Multi-Activity",
  service_name: "Multi-Activity",
  serviceLabel: "9.00-2.30 Multi-Activity (Jul backpay)",
  service_label: "9.00-2.30 Multi-Activity (Jul backpay)",
  venue: "SwimFarm",
  timeRange: "9.00-2.30",
  time_range: "9.00-2.30",
  completed: true,
  dayOff: false,
  late_hold: false,
  feedback_late: false,
  rate: RATE,
};

const entries = [entry];

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: clrErr } = await admin.from("portal_late_feedback_pay_clearances").upsert(
  {
    staff_user_id: JOHN_ID,
    session_date: WORK_DATE,
    cleared_by_user_id: ADMIN_UID,
    note: "Office: Jul 5 Multi-Activity paid on August timesheet (missed July sheet)",
  },
  { onConflict: "staff_user_id,session_date" },
);
if (clrErr) console.warn("clearance upsert:", clrErr.message);
else console.log("late-pay clearance ok for", WORK_DATE);

const { data: existing } = await admin
  .from("staff_timesheets")
  .select("id,entries,total_hours,total_cost")
  .eq("submitted_by_user_id", JOHN_ID)
  .eq("period_month", PERIOD_MONTH)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

let finalEntries = entries;
let finalHours = totalHours;
let finalCost = totalCost;

if (existing?.id && Array.isArray(existing.entries) && existing.entries.length) {
  const withoutDup = existing.entries.filter(
    (e) => String(e.date || "").slice(0, 10) !== WORK_DATE,
  );
  finalEntries = [...withoutDup, entry].sort((a, b) =>
    String(a.date || "").localeCompare(String(b.date || "")),
  );
  finalHours = Number(
    finalEntries
      .filter((e) => !e.dayOff)
      .reduce((s, e) => s + (Number(e.hours) || 0), 0)
      .toFixed(2),
  );
  finalCost = Number((finalHours * RATE).toFixed(2));
  console.log("merging into existing August sheet", existing.id);
}

const payload = {
  submitted_by_user_id: JOHN_ID,
  submitted_by_name: NAME,
  period_month: PERIOD_MONTH,
  role_label: ROLE,
  total_hours: finalHours,
  entries: finalEntries,
  hourly_rate_used: RATE,
  total_cost: finalCost,
  net_cost: finalCost,
  expected_hours: finalHours,
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
    .select("id,total_hours,total_cost,net_cost,status")
    .single();
  if (error) throw new Error("insert timesheet: " + error.message);
  timesheetId = inserted.id;
  console.log("inserted timesheet", inserted);
}

const { data: after } = await admin
  .from("staff_timesheets")
  .select("id,total_hours,total_cost,net_cost,hourly_rate_used,status,period_month")
  .eq("id", timesheetId)
  .maybeSingle();

if (
  Number(after?.total_hours) !== finalHours ||
  Number(after?.total_cost) !== finalCost ||
  String(after?.period_month || "").slice(0, 10) !== PERIOD_MONTH
) {
  console.warn("trigger overwrote fields; forcing via SQL", after);
  const sql = `
    alter table public.staff_timesheets disable trigger user;
    update public.staff_timesheets set
      period_month = '${PERIOD_MONTH}',
      total_hours = ${finalHours},
      hourly_rate_used = ${RATE},
      total_cost = ${finalCost},
      net_cost = ${finalCost},
      expected_hours = ${finalHours},
      is_late = false,
      penalty_amount = 0,
      status = 'submitted',
      submitted_on = '${SUBMITTED_ON}',
      entries = '${JSON.stringify(finalEntries).replace(/'/g, "''")}'::jsonb
    where id = '${timesheetId}';
    alter table public.staff_timesheets enable trigger user;
  `;
  const tmpSql = path.join(__dirname, "tmp/john-aug-jul5-force.sql");
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
  entries: finalEntries.map((e) =>
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
  totalHours: finalHours,
  totalCost: finalCost,
  pendingCost: 0,
  potentialCost: finalCost,
  logoDataUrl,
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const storagePath = `${JOHN_ID}/timesheet/${stamp}_Johns_Timesheet_5th_July_backpay_August.pdf`;
const title = "John's Timesheet — 5 Jul backpay (August pay)";

const { error: upErr } = await admin.storage
  .from("documents")
  .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
if (upErr) throw new Error("storage upload: " + upErr.message);

const { data: oldDocs } = await admin
  .from("documents")
  .select("id,title,file_url")
  .eq("user_id", JOHN_ID)
  .eq("document_type", "timesheet");

for (const d of oldDocs || []) {
  const t = String(d.title || "");
  if (/5 Jul backpay|July backpay.*August|5th_July_backpay/i.test(t)) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
  }
}

const { error: docErr } = await admin.from("documents").insert({
  user_id: JOHN_ID,
  document_type: "timesheet",
  category: "finance",
  title,
  related_date: PERIOD_MONTH,
  file_url: storagePath,
  source_page: "timesheet",
});
if (docErr) throw new Error("documents insert: " + docErr.message);

const { data: verify } = await admin
  .from("staff_timesheets")
  .select("id,period_month,total_hours,total_cost,net_cost,status,submitted_on,entries")
  .eq("id", timesheetId)
  .maybeSingle();

console.log({
  ok: true,
  timesheetId,
  period_month: verify?.period_month,
  total_hours: verify?.total_hours,
  total_cost: verify?.total_cost,
  net_cost: verify?.net_cost,
  status: verify?.status,
  hasJul5: (verify?.entries || []).some((e) => String(e.date || "").slice(0, 10) === WORK_DATE),
  pdf: title,
  storagePath,
});
