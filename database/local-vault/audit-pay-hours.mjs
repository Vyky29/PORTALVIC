/** One-off audit: print pay-banded roster hours for key staff (June period). */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";
import { applyRosterEntryPayBands } from "./timesheet-pay-hours.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sandbox = { console };
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(root, "database/staff_dashboard_spreadsheet_bundle.js"), "utf8"), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, "database/staff_dashboard_spreadsheet_adapter.js"), "utf8"), sandbox);

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseIso(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function eachDateInclusive(start, end) {
  const out = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(new Date(d));
  return out;
}
function hmToMinutes(hm) {
  const [h, m] = String(hm || "0:0").split(":").map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}
function normStaff(v) {
  const x = String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  return x === "yousef" || x === "youssef" ? "youssef" : x;
}

function sessionsForCalendarDate(sessions, dateObj) {
  const dateKey = isoDate(dateObj);
  const dayName = WEEKDAY[dateObj.getDay()];
  const list = sessions || [];
  const dated = list.filter((s) => String(s.session_date || "").trim().slice(0, 10) === dateKey);
  if (dated.length) return dated;
  const rosterUsesDates = list.some((s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s.session_date || "").trim().slice(0, 10)));
  if (rosterUsesDates) return [];
  return list.filter((s) => String(s.day || "").trim() === dayName);
}

function dayRosterHours(rows, dateObj) {
  if (!rows.length) return 0;
  let minStart = Infinity, maxEnd = -Infinity;
  for (const s of rows) {
    const a = hmToMinutes(s.start);
    let b = hmToMinutes(s.end);
    if (b < a) b += 24 * 60;
    if (a < minStart) minStart = a;
    if (b > maxEnd) maxEnd = b;
  }
  const bufferMin = 15;
  const dayName = WEEKDAY[dateObj.getDay()];
  if (maxEnd - minStart < 120 && dayName !== "Sunday") {
    minStart -= bufferMin;
    maxEnd += bufferMin;
  }
  return Number((Math.max(0, maxEnd - minStart) / 60).toFixed(2));
}

function serviceToRole(service) {
  const s = String(service || "").toLowerCase();
  if (/climb/.test(s)) return "Climbing Instructor";
  if (/swim|aquatic/.test(s)) return "Swimming Instructor";
  if (/physical|fitness|gym|\bpt\b/.test(s)) return "Fitness Instructor";
  if (/multi|bespoke|day ?cent|support|hub/.test(s)) return "Support Worker";
  if (/lead|programme/.test(s)) return "Service Lead";
  return "";
}

function sessionPayRole(session) {
  const svc = String((session && (session.rosterService || session.service || session.activity)) || "").toLowerCase();
  const area = String((session && (session.rosterArea || session.area)) || "").toLowerCase();
  if (/big pool|small pool|teaching pool|\blane\b/.test(area)) return "Swimming Instructor";
  if (/day\s*centre/.test(svc)) return "Support Worker";
  return serviceToRole(svc);
}

function slotMinutes(session) {
  const a = hmToMinutes(session && session.start);
  let b = hmToMinutes(session && session.end);
  if (b < a) b += 24 * 60;
  return Math.max(0, b - a);
}

function roleHoursForSessions(rows) {
  let mins = 0;
  for (const s of rows || []) mins += slotMinutes(s);
  return Number((mins / 60).toFixed(2));
}

function primaryServiceLabelForRows(rows) {
  const counts = Object.create(null);
  for (const s of rows || []) {
    const label = String(s.rosterService || s.service || s.activity || "Shift").trim() || "Shift";
    counts[label] = (counts[label] || 0) + 1;
  }
  let best = "Shift", bestN = 0;
  for (const k of Object.keys(counts)) if (counts[k] > bestN) { best = k; bestN = counts[k]; }
  return best;
}

function computeEntries(rosterKey, periodStart, periodEnd) {
  const boot = sandbox.StaffDashboardSpreadsheetAdapter.bootstrap({
    staffId: rosterKey,
    source: sandbox.STAFF_DASHBOARD_SOURCE,
  });
  const sessions = boot.sessionsModel || [];
  const entries = [];
  for (const dateObj of eachDateInclusive(parseIso(periodStart), parseIso(periodEnd))) {
    const dayRows = sessionsForCalendarDate(sessions, dateObj).filter((s) => {
      const st = String(s.status || "").toLowerCase();
      if (st === "closed" || st === "available") return false;
      return normStaff(s.staffId) === normStaff(rosterKey);
    });
    if (!dayRows.length) continue;
    const byRole = Object.create(null);
    for (const s of dayRows) {
      const role = sessionPayRole(s) || serviceToRole(s.rosterService || s.service);
      if (!byRole[role]) byRole[role] = [];
      byRole[role].push(s);
    }
    const roleKeys = Object.keys(byRole).filter(Boolean);
    for (const role of roleKeys) {
      const rows = byRole[role];
      let hours = roleHoursForSessions(rows);
      if (roleKeys.length === 1) hours = dayRosterHours(rows, dateObj);
      const svc = primaryServiceLabelForRows(rows);
      const dayName = WEEKDAY[dateObj.getDay()];
      hours = applyRosterEntryPayBands({ hours, dayName, rosterKey, role, service: svc, dateObj, dayRows: rows });
      if (hours <= 0) continue;
      entries.push({ date: isoDate(dateObj), day: dayName, hours, role, service: svc });
    }
  }
  return entries;
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : ["berta", "john", "michelle", "roberto", "simon", "giuseppe", "bismark", "godsway"];
const periodStart = "2026-05-25";
const periodEnd = "2026-06-24";

for (const key of keys) {
  const entries = computeEntries(key, periodStart, periodEnd);
  console.log(`\n=== ${key} (${entries.length} rows, ${entries.reduce((a,e)=>a+e.hours,0).toFixed(2)}h) ===`);
  for (const e of entries) {
    if (e.day === "Sunday" || /bespoke|multi|day centre/i.test(e.service) || key === "michelle") {
      console.log(`  ${e.date} ${e.day} ${e.hours}h ${e.role} — ${e.service}`);
    }
  }
}
