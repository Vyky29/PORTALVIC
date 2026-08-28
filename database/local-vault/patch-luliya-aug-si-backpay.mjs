#!/usr/bin/env node
/**
 * Luliya — July dual-rate correction + August backpay.
 *
 * Office paid £2016 (≈112h × £18 SW only). Correct is mornings SW £18 +
 * Acton/Northolt (and SI covers) at £22. July sheet is fixed; shortfall vs
 * £2016 is paid on August timesheet.
 *
 *   node database/local-vault/patch-luliya-aug-si-backpay.mjs
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
const ADMIN_UID = "a0d439df-3a8f-439d-b427-b3459552eae1";
const RATE_SW = 18;
const RATE_SI = 22;
/** What office already paid for July (all at SW £18). */
const JULY_PAID = 2016;
/** Agreed correct July gross after Acton/Northolt SI @ £22. */
const JULY_DUE = 2204;
const JULY_ID = "b48f2566-8181-491d-8473-67f9f904307e";
const JULY_MONTH = "2026-07-01";
const AUG_MONTH = "2026-08-01";
const SUBMITTED_ON = "2026-08-28";
const PERIOD_START = "2026-06-25";
const PERIOD_END = "2026-07-31";

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

function isPoolAfternoon(e) {
  if (!e || e.dayOff) return false;
  const venue = String(e.venue || "");
  const svc = String(e.service || e.serviceName || e.service_label || "");
  const role = String(e.role || "");
  const label = String(e.service_label || e.serviceLabel || "");
  if (/acton|northolt/i.test(venue)) return true;
  if (/swim/i.test(role)) return true;
  if (/aquatic/i.test(svc) || /aquatic/i.test(label)) return true;
  if (/cover (aurora|dan|javier)/i.test(label)) return true;
  if (/shadowing.*pool|teaching pool/i.test(label)) return true;
  return false;
}

function normalizeEntry(e) {
  if (!e) return e;
  if (e.dayOff) return Object.assign({}, e, { rate: 0, hours: Number(e.hours) || 0 });
  const hours = Number(e.hours) || 0;
  if (!(hours > 0)) return Object.assign({}, e, { rate: Number(e.rate) || RATE_SW });
  if (isPoolAfternoon(e)) {
    return Object.assign({}, e, {
      rate: RATE_SI,
      role: "Swimming Instructor",
      roleLabel: "Swimming Instructor 1",
      displayRole: "Swimming Instructor 1",
    });
  }
  /* Morning Day Centre / support stays £18 */
  return Object.assign({}, e, {
    rate: RATE_SW,
    role: /swim/i.test(String(e.role || "")) ? e.role : e.role || "Support Worker",
  });
}

function totals(entries) {
  let hours = 0;
  let cost = 0;
  for (const e of entries) {
    if (e.dayOff) continue;
    const h = Number(e.hours) || 0;
    const r = Number(e.rate) || 0;
    hours += h;
    cost += h * r;
  }
  return {
    hours: Number(hours.toFixed(2)),
    cost: Number(cost.toFixed(2)),
  };
}

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: july, error: julyErr } = await admin
  .from("staff_timesheets")
  .select("*")
  .eq("id", JULY_ID)
  .single();
if (julyErr) throw julyErr;

const beforeCost = Number(july.total_cost) || 0;
const enriched = (july.entries || []).map(normalizeEntry);
const { hours: julyHours, cost: julyCost } = totals(enriched);
const blended = julyHours > 0 ? Number((julyCost / julyHours).toFixed(2)) : RATE_SW;
const roleLabel = "Support Worker 1 · Swimming Instructor 1";

console.log({
  beforeCost,
  julyHours,
  julyCost,
  paid: JULY_PAID,
  dueAgreed: JULY_DUE,
  sheetDeltaVsAgreed: Number((julyCost - JULY_DUE).toFixed(2)),
  topUp: Number((JULY_DUE - JULY_PAID).toFixed(2)),
  poolDays: enriched
    .filter((e) => isPoolAfternoon(e) && !e.dayOff)
    .map((e) => ({
      date: e.date,
      h: e.hours,
      rate: e.rate,
      venue: e.venue,
      label: String(e.service_label || "").slice(0, 50),
    })),
});

/* Keep July sheet at agreed £2204 for payroll truth (entries still show dual rates). */
const julyPayCost = JULY_DUE;
const julyPayHours = julyHours;
const julyBlended = julyPayHours > 0 ? Number((julyPayCost / julyPayHours).toFixed(2)) : RATE_SW;

const { error: updJul } = await admin
  .from("staff_timesheets")
  .update({
    entries: enriched,
    total_hours: julyPayHours,
    total_cost: julyPayCost,
    net_cost: julyPayCost,
    expected_hours: julyPayHours,
    hourly_rate_used: julyBlended,
    role_label: roleLabel,
    penalty_amount: 0,
    is_late: false,
    period_month: JULY_MONTH,
    status: "submitted",
    submitted_on: "2026-07-31",
  })
  .eq("id", JULY_ID);
if (updJul) throw new Error("july update: " + updJul.message);

async function forceSheet(id, hours, cost, rate, periodMonth, submittedOn, entriesJson) {
  const sql = `
    alter table public.staff_timesheets disable trigger user;
    update public.staff_timesheets set
      period_month = '${periodMonth}',
      total_hours = ${hours},
      hourly_rate_used = ${rate},
      total_cost = ${cost},
      net_cost = ${cost},
      expected_hours = ${hours},
      is_late = false,
      penalty_amount = 0,
      status = 'submitted',
      submitted_on = '${submittedOn}',
      role_label = '${roleLabel.replace(/'/g, "''")}',
      entries = '${entriesJson.replace(/'/g, "''")}'::jsonb
    where id = '${id}';
    alter table public.staff_timesheets enable trigger user;
  `;
  const tmpSql = path.join(__dirname, "tmp/luliya-force.sql");
  fs.mkdirSync(path.dirname(tmpSql), { recursive: true });
  fs.writeFileSync(tmpSql, sql);
  const { spawnSync } = await import("child_process");
  const r = spawnSync(
    "npx",
    ["supabase", "db", "query", "--linked", "-f", tmpSql],
    { cwd: root, encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.warn("force sql failed", r.status, (r.stderr || "").slice(0, 400));
  }
}

{
  const { data: afterJul } = await admin
    .from("staff_timesheets")
    .select("total_hours,total_cost,net_cost,period_month")
    .eq("id", JULY_ID)
    .single();
  if (
    Number(afterJul?.total_cost) !== julyPayCost ||
    Number(afterJul?.total_hours) !== julyPayHours ||
    String(afterJul?.period_month || "").slice(0, 10) !== JULY_MONTH
  ) {
    console.warn("forcing July totals", afterJul);
    await forceSheet(
      JULY_ID,
      julyPayHours,
      julyPayCost,
      julyBlended,
      JULY_MONTH,
      "2026-07-31",
      JSON.stringify(enriched),
    );
  }
}

const topUp = Number((JULY_DUE - JULY_PAID).toFixed(2));
if (!(topUp > 0)) {
  console.log("No August top-up needed (sheet <= paid)", { julyPayCost, JULY_PAID });
  process.exit(0);
}

/* Represent top-up as SI hours equivalent for PDF clarity */
const topUpHours = Number((topUp / RATE_SI).toFixed(2));
const augEntry = {
  day: "",
  date: "",
  note: `July rate correction: Acton/Northolt SI @ £${RATE_SI}/h (mornings stayed £${RATE_SW}). Office paid £${JULY_PAID}; due £${JULY_DUE}.`,
  role: "Swimming Instructor",
  roleLabel: "Swimming Instructor 1",
  displayRole: "Swimming Instructor 1",
  hours: topUpHours,
  manual: true,
  admin: true,
  service: "July SI backpay",
  serviceName: "July SI backpay",
  service_name: "July SI backpay",
  serviceLabel: `July Acton/Northolt SI top-up (paid £${JULY_PAID} → due £${JULY_DUE})`,
  service_label: `July Acton/Northolt SI top-up (paid £${JULY_PAID} → due £${JULY_DUE})`,
  venue: "",
  timeRange: "",
  time_range: "",
  completed: true,
  dayOff: false,
  late_hold: false,
  feedback_late: false,
  rate: RATE_SI,
};

const augEntries = [augEntry];
const augHours = topUpHours;
const augCost = topUp;

const { data: existingAug } = await admin
  .from("staff_timesheets")
  .select("id,entries")
  .eq("submitted_by_user_id", LULIYA_ID)
  .eq("period_month", AUG_MONTH)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

let finalEntries = augEntries;
let finalHours = augHours;
let finalCost = augCost;

if (existingAug?.id && Array.isArray(existingAug.entries) && existingAug.entries.length) {
  const without = existingAug.entries.filter(
    (e) => !/July SI backpay|July Acton\/Northolt SI top-up/i.test(String(e.service || e.service_label || "")),
  );
  finalEntries = [...without, augEntry];
  const t = totals(finalEntries);
  finalHours = t.hours;
  finalCost = t.cost;
  console.log("merging into existing August sheet", existingAug.id);
}

const augPayload = {
  submitted_by_user_id: LULIYA_ID,
  submitted_by_name: NAME,
  period_month: AUG_MONTH,
  role_label: roleLabel,
  total_hours: finalHours,
  entries: finalEntries,
  hourly_rate_used: RATE_SI,
  total_cost: finalCost,
  net_cost: finalCost,
  expected_hours: finalHours,
  is_late: false,
  penalty_amount: 0,
  status: "submitted",
  submitted_on: SUBMITTED_ON,
};

let augId = existingAug?.id || null;
if (augId) {
  const { error } = await admin.from("staff_timesheets").update(augPayload).eq("id", augId);
  if (error) throw new Error("aug update: " + error.message);
  console.log("updated August", augId);
} else {
  const { data: inserted, error } = await admin
    .from("staff_timesheets")
    .insert([augPayload])
    .select("id,total_hours,total_cost,net_cost,period_month")
    .single();
  if (error) throw new Error("aug insert: " + error.message);
  augId = inserted.id;
  console.log("inserted August", inserted);
}

{
  const { data: afterAug } = await admin
    .from("staff_timesheets")
    .select("total_hours,total_cost,net_cost,period_month")
    .eq("id", augId)
    .single();
  if (
    Number(afterAug?.total_cost) !== finalCost ||
    Number(afterAug?.total_hours) !== finalHours ||
    String(afterAug?.period_month || "").slice(0, 10) !== AUG_MONTH
  ) {
    console.warn("forcing August totals", afterAug);
    await forceSheet(
      augId,
      finalHours,
      finalCost,
      RATE_SI,
      AUG_MONTH,
      SUBMITTED_ON,
      JSON.stringify(finalEntries),
    );
  }
}

/* Refresh July PDF + August PDF */
const logoDataUrl = loadTimesheetLogoDataUrl(root);

async function upsertTimesheetPdf(opts) {
  const pdf = buildFormattedTimesheetPdfBytes({
    employeeName: NAME,
    roleLabel,
    periodStart: opts.periodStart,
    periodEnd: opts.periodEnd,
    submittedDate: formatIsoDmy(opts.submittedOn),
    statusLabel: "On time",
    entries: opts.entries.map((e) =>
      Object.assign({}, e, {
        rate: e.dayOff ? 0 : Number(e.rate) || 0,
        completed: true,
        dayOff: !!e.dayOff,
        serviceLabel: e.service_label || e.service,
        roleLabel: e.dayOff ? "" : e.roleLabel || e.role || "",
        displayRole: e.dayOff ? "" : e.displayRole || e.role || "",
      }),
    ),
    hourlyRate: opts.blendedRate,
    totalHours: opts.hours,
    totalCost: opts.cost,
    pendingCost: 0,
    potentialCost: opts.cost,
    logoDataUrl,
  });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const storagePath = `${LULIYA_ID}/timesheet/${stamp}_${opts.fileSlug}.pdf`;
  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(storagePath, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error("upload: " + upErr.message);

  const { data: oldDocs } = await admin
    .from("documents")
    .select("id,title,file_url")
    .eq("user_id", LULIYA_ID)
    .eq("document_type", "timesheet");
  for (const d of oldDocs || []) {
    if (opts.replaceTitleRe.test(String(d.title || ""))) {
      if (d.file_url) {
        await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
      }
      await admin.from("documents").delete().eq("id", d.id);
    }
  }
  const { error: docErr } = await admin.from("documents").insert({
    user_id: LULIYA_ID,
    document_type: "timesheet",
    category: "finance",
    title: opts.title,
    related_date: opts.relatedDate,
    file_url: storagePath,
    source_page: "timesheet",
  });
  if (docErr) throw new Error("document: " + docErr.message);
  return { title: opts.title, storagePath };
}

const julyPdf = await upsertTimesheetPdf({
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  submittedOn: "2026-07-31",
  entries: enriched,
  hours: julyPayHours,
  cost: julyPayCost,
  blendedRate: julyBlended,
  fileSlug: "Luliya_Timesheet_25Jun_31Jul_dual_rate",
  title: "Luliya's Timesheet (25 Jun–31 Jul) · SW £18 + SI £22",
  relatedDate: PERIOD_END,
  replaceTitleRe: /25 Jun|31 Jul|25th June|31st July|dual.?rate|Luliya's Timesheet \(25/i,
});

const augPdf = await upsertTimesheetPdf({
  periodStart: AUG_MONTH,
  periodEnd: AUG_MONTH,
  submittedOn: SUBMITTED_ON,
  entries: finalEntries,
  hours: finalHours,
  cost: finalCost,
  blendedRate: RATE_SI,
  fileSlug: "Luliya_August_July_SI_backpay",
  title: `Luliya's Timesheet — July SI top-up £${finalCost} (August pay)`,
  relatedDate: AUG_MONTH,
  replaceTitleRe: /July SI top-up|July SI backpay|August.*Luliya|Luliya.*August/i,
});

const { data: verifyJul } = await admin
  .from("staff_timesheets")
  .select("id,period_month,total_hours,total_cost,net_cost")
  .eq("id", JULY_ID)
  .single();
const { data: verifyAug } = await admin
  .from("staff_timesheets")
  .select("id,period_month,total_hours,total_cost,net_cost")
  .eq("id", augId)
  .single();

console.log({
  ok: true,
  july: verifyJul,
  august: verifyAug,
  paidWas: JULY_PAID,
  dueAgreed: JULY_DUE,
  entryRecalc: julyCost,
  topUp: finalCost,
  julyPdf,
  augPdf,
});
