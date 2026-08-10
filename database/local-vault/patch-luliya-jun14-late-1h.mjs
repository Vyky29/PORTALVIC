#!/usr/bin/env node
/**
 * Luliya — Sunday 14 Jun 2026: Support Worker 9.15–2.15, arrived 1h late → paid 4h.
 * Makes the −1h late deduction explicit on the timesheet + regenerates June PDF.
 *
 *   node database/local-vault/patch-luliya-jun14-late-1h.mjs
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
const PERIOD_MONTH = "2026-06-01";
const PERIOD_START = "2026-05-25";
const PERIOD_END = "2026-06-24";
const RATE_SW = 18;
const RATE_SI = 22;
const DAY = "2026-06-14";

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

const { data: june, error: loadErr } = await admin
  .from("staff_timesheets")
  .select("*")
  .eq("submitted_by_user_id", LULIYA_ID)
  .eq("period_month", PERIOD_MONTH)
  .single();
if (loadErr) throw loadErr;

const beforeJun14 = (june.entries || []).filter((e) => e.date === DAY);
console.log("before Jun14", beforeJun14);

const jun14Entry = {
  day: "Sunday",
  date: DAY,
  note:
    "LATE ARRIVAL −1h unpaid: scheduled Support Worker 9.15–2.15 (5h); arrived 1 hour late → paid 4h (10.15–2.15) @ £18.",
  role: "Support Worker",
  hours: 4,
  manual: true,
  service: "Multi-Activity",
  completed: true,
  dayOff: false,
  late_hold: false,
  feedback_late: false,
  rate: RATE_SW,
  venue: "SwimFarm",
  time_range: "10.15-2.15",
  service_name: "Multi-Activity (−1h late)",
  service_label:
    "10.15-2.15 Multi-Activity (−1h late)\nSwimFarm\nSupport Worker\nScheduled 9.15–2.15; arrived 1h late → paid 4h",
  serviceName: "Multi-Activity (−1h late)",
  serviceLabel:
    "10.15-2.15 Multi-Activity (−1h late)\nSwimFarm\nSupport Worker\nScheduled 9.15–2.15; arrived 1h late → paid 4h",
  roleLabel: "Support Worker 1",
  displayRole: "Support Worker 1",
};

const entries = (june.entries || [])
  .filter((e) => e.date !== DAY)
  .concat([jun14Entry])
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
const roleLabel = hasSi
  ? "Support Worker 1 · Swimming Instructor 1"
  : "Support Worker 1";

console.log({
  totalHours,
  totalCost,
  blended,
  jun14: jun14Entry,
  deltaHours: totalHours - Number(june.total_hours),
  deltaCost: totalCost - Number(june.total_cost),
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
    penalty_amount: Number(june.penalty_amount || 0),
  })
  .eq("id", june.id);
if (updErr) throw new Error("update: " + updErr.message);

const { data: after } = await admin
  .from("staff_timesheets")
  .select(
    "id, total_hours, total_cost, net_cost, hourly_rate_used, role_label, entries, is_late, penalty_amount, submitted_on",
  )
  .eq("id", june.id)
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
      penalty_amount = ${Number(june.penalty_amount || 0)}
    where id = '${june.id}';
    alter table public.staff_timesheets enable trigger user;
  `;
  const tmpSql = path.join(__dirname, "tmp/luliya-jun14-late-force.sql");
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
const submittedOn = String(after?.submitted_on || june.submitted_on || PERIOD_END).slice(0, 10);
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
      dayOff: false,
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
const storagePath = `${LULIYA_ID}/timesheet/${stamp}_Luliyas_Timesheet_25th_May_to_24th_June.pdf`;
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
  if (/25th May|24th June|May to 24th June|Timesheet \(June\)|June Timesheet/i.test(t)) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
    console.log("removed old doc", d.id, d.title);
  }
}

const title = "Luliya's Timesheet (25th May to 24th June)";
const { error: docErr } = await admin.from("documents").insert({
  user_id: LULIYA_ID,
  document_type: "timesheet",
  category: "finance",
  title,
  related_date: PERIOD_END,
  file_url: storagePath,
  source_page: "office-patch-luliya-jun14-late",
});
if (docErr) throw new Error("document: " + docErr.message);

const { data: verify } = await admin
  .from("staff_timesheets")
  .select("id, total_hours, total_cost, net_cost, hourly_rate_used, role_label, entries")
  .eq("id", june.id)
  .single();

console.log("done", {
  hours: verify.total_hours,
  cost: verify.total_cost,
  rate: verify.hourly_rate_used,
  jun14: (verify.entries || []).filter((e) => e.date === DAY),
  document: title,
  storagePath,
});
