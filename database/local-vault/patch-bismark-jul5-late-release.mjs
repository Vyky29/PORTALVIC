#!/usr/bin/env node
/**
 * Bismark — release late pay hold for Sunday 5 Jul 2026 (Serine/Patrick feedback
 * completed Mon 6 Jul) and regenerate his open-cycle timesheet PDF in Documents.
 *
 *   node database/local-vault/patch-bismark-jul5-late-release.mjs
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
const ROLE = "Support Worker 3";
const RATE = 23;
const PERIOD_START = "2026-06-25";
const PERIOD_END = "2026-07-20"; // through yesterday (open cycle to 24 Jul)
const CLEAR_DATE = "2026-07-05";
const ADMIN_UID = "a0d439df-3a8f-439d-b427-b3459552eae1"; // Victor (prior clearances)

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

function serviceForShift(timeRange, dayName) {
  // Sunday Westway 10-3 is Climbing Activity (matches timesheet screenshot).
  if (dayName === "Sunday") {
    return {
      serviceName: "Climbing Activity",
      role: "Climbing Instructor 3",
      venue: "Westway",
    };
  }
  return {
    serviceName: "Bespoke Programme",
    role: ROLE,
    venue: "SwimFarm",
  };
}

function loadBismarkShifts() {
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

const admin = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log("[bismark] 1/3 clear late pay hold for", CLEAR_DATE);
const { error: clrErr } = await admin.from("portal_late_feedback_pay_clearances").upsert(
  [
    {
      staff_user_id: BISMARK_ID,
      session_date: CLEAR_DATE,
      cleared_by_user_id: ADMIN_UID,
      note: "Admin release — late Serine/Patrick climbing feedback (completed Mon 6 Jul)",
    },
  ],
  { onConflict: "staff_user_id,session_date" },
);
if (clrErr) throw new Error("clearance: " + clrErr.message);

const shifts = loadBismarkShifts();
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
  const meta = serviceForShift(timeRange, dayName);
  const displayTime = formatTimeRangeDisplay(timeRange, dayName);
  const serviceLabel = `${displayTime} ${meta.serviceName}\n${venue || meta.venue}\n${meta.role}`;
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
    rate: RATE,
    service_label: serviceLabel,
    service_name: meta.serviceName,
    venue: venue || meta.venue,
    time_range: displayTime,
  });
}

const totalHours = Number(entries.reduce((a, e) => a + Number(e.hours || 0), 0).toFixed(2));
const totalCost = Number((totalHours * RATE).toFixed(2));
console.log("[bismark] 2/3 entries", entries.length, "hours", totalHours, "cost", totalCost);
const jul5 = entries.find((e) => e.date === CLEAR_DATE);
console.log("[bismark] jul5 entry", jul5);

const logoDataUrl = loadTimesheetLogoDataUrl(root);
const pdf = buildFormattedTimesheetPdfBytes({
  employeeName: NAME,
  roleLabel: ROLE,
  periodStart: PERIOD_START,
  periodEnd: PERIOD_END,
  submittedDate: formatIsoDmy("2026-07-21"),
  statusLabel: "On time",
  entries: entries.map((e) =>
    Object.assign({}, e, {
      rate: RATE,
      completed: true,
      dayOff: false,
      serviceLabel: e.service_label,
      roleLabel: e.role,
      displayRole: e.role,
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
const storagePath = `${BISMARK_ID}/timesheet/${stamp}_Bismarks_Timesheet_25th_June_to_20th_July.pdf`;
console.log("[bismark] 3/3 upload PDF", storagePath);
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
  if (/25th June|24th July|20th July|Bismarks_Timesheet|Bismark's Timesheet \(25/i.test(t)) {
    if (d.file_url) {
      await admin.storage.from("documents").remove([d.file_url]).catch(() => {});
    }
    await admin.from("documents").delete().eq("id", d.id);
    console.log("removed old doc", d.id, d.title);
  }
}

const title = "Bismark's Timesheet (25th June to 20th July)";
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

const { data: verifyClr } = await admin
  .from("portal_late_feedback_pay_clearances")
  .select("staff_user_id, session_date, cleared_at, note")
  .eq("staff_user_id", BISMARK_ID)
  .eq("session_date", CLEAR_DATE)
  .maybeSingle();

console.log("[bismark] done", {
  clearance: verifyClr,
  document: title,
  storagePath,
  totalHours,
  totalCost,
});
