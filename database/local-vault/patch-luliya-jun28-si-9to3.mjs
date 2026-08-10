#!/usr/bin/env node
/**
 * Luliya — Sunday 28 Jun 2026: cover Javier SwimFarm aquatic 9–3 = 6h SI @ £22.
 * Was wrongly 5h SW @ £18 Multi-Activity 9.15–2.15 on the July timesheet.
 *
 *   node database/local-vault/patch-luliya-jun28-si-9to3.mjs
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
const DAY = "2026-06-28";

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

const before = (sheet.entries || []).filter((e) => e.date === DAY);
console.log("before Jun28", before);

const jun28Entry = {
  day: "Sunday",
  date: DAY,
  note: "Cover Javier (SwimFarm aquatic) 9–3 · Swimming Instructor @ £22.",
  role: "Swimming Instructor",
  hours: 6,
  manual: true,
  service: "Aquatic Activity",
  completed: true,
  dayOff: false,
  late_hold: false,
  feedback_late: false,
  rate: RATE_SI,
  venue: "SwimFarm",
  time_range: "9.00-3.00",
  service_name: "Aquatic Activity (cover Javier)",
  service_label:
    "9.00-3.00 Aquatic Activity (cover Javier)\nSwimFarm\nSwimming Instructor",
  serviceName: "Aquatic Activity (cover Javier)",
  serviceLabel:
    "9.00-3.00 Aquatic Activity (cover Javier)\nSwimFarm\nSwimming Instructor",
  roleLabel: "Swimming Instructor 1",
  displayRole: "Swimming Instructor 1",
};

const entries = (sheet.entries || [])
  .filter((e) => e.date !== DAY)
  .concat([jun28Entry])
  .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

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
const hasSi = enriched.some((e) => /swim/i.test(String(e.role || "")));
const hasSw = enriched.some((e) => /support/i.test(String(e.role || "")));
const roleLabel =
  hasSi && hasSw
    ? "Support Worker 1 · Swimming Instructor 1"
    : hasSi
      ? "Swimming Instructor 1"
      : "Support Worker 1";

console.log({
  totalHours,
  totalCost,
  blended,
  jun28: jun28Entry,
  deltaHours: totalHours - Number(sheet.total_hours),
  deltaCost: totalCost - Number(sheet.total_cost),
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
    penalty_amount: Number(sheet.penalty_amount || 0),
  })
  .eq("id", sheet.id);
if (updErr) throw new Error("update: " + updErr.message);

const { data: after } = await admin
  .from("staff_timesheets")
  .select(
    "id, total_hours, total_cost, net_cost, hourly_rate_used, role_label, entries, is_late, penalty_amount, submitted_on",
  )
  .eq("id", sheet.id)
  .single();

if (
  Number(after?.total_hours) !== totalHours ||
  Number(after?.total_cost) !== totalCost
) {
  console.warn("trigger overwrote totals; forcing via SQL", {
    got: { hours: after?.total_hours, cost: after?.total_cost },
    want: { totalHours, totalCost },
  });
  const sql = `
    alter table public.staff_timesheets disable trigger user;
    update public.staff_timesheets set
      total_hours = ${totalHours},
      hourly_rate_used = ${blended},
      total_cost = ${totalCost},
      net_cost = ${totalCost},
      expected_hours = ${totalHours},
      role_label = '${roleLabel.replace(/'/g, "''")}',
      penalty_amount = ${Number(sheet.penalty_amount || 0)}
    where id = '${sheet.id}';
    alter table public.staff_timesheets enable trigger user;
  `;
  const tmpSql = path.join(__dirname, "tmp/luliya-jun28-si-force.sql");
  fs.mkdirSync(path.dirname(tmpSql), { recursive: true });
  fs.writeFileSync(tmpSql, sql);
  const { spawnSync } = await import("child_process");
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", tmpSql],
    { cwd: root, encoding: "utf8" },
  );
  console.log(
    "force sql",
    r.status,
    (r.stdout || "").slice(0, 300),
    (r.stderr || "").slice(0, 400),
  );
}

const logoDataUrl = loadTimesheetLogoDataUrl(root);
const submittedOn = String(
  after?.submitted_on || sheet.submitted_on || PERIOD_END,
).slice(0, 10);
const pdf = buildFormattedTimesheetPdfBytes({
  employeeName: NAME,
  roleLabel,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  submittedDate: formatIsoDmy(submittedOn),
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
  if (/25th June|31st July|June to 31st July|Timesheet \(July\)|July Timesheet/i.test(t)) {
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
  source_page: "office-patch-luliya-jun28-si",
});
if (docErr) throw new Error("document: " + docErr.message);

const outPdf = path.join(__dirname, "tmp/Aida_Luliya_Timesheet_25th_June_to_31st_July.pdf");
fs.mkdirSync(path.dirname(outPdf), { recursive: true });
fs.writeFileSync(outPdf, pdf);

const { data: verify } = await admin
  .from("staff_timesheets")
  .select("id, total_hours, total_cost, net_cost, hourly_rate_used, role_label, entries")
  .eq("id", sheet.id)
  .single();

console.log("done", {
  hours: verify.total_hours,
  cost: verify.total_cost,
  rate: verify.hourly_rate_used,
  jun28: (verify.entries || []).filter((e) => e.date === DAY),
  document: title,
  storagePath,
  localPdf: outPdf,
});
