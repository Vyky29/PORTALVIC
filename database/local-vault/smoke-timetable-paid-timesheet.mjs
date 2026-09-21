/**
 * Smoke: Timetable paid_hours parse + dual gate (band hours vs feedback completed).
 * Run: node database/local-vault/smoke-timetable-paid-timesheet.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
let failed = 0;

function ok(label, cond, detail) {
  if (cond) console.log("OK  " + label);
  else {
    failed++;
    console.error("FAIL " + label + (detail ? " — " + detail : ""));
  }
}

function parseHmTokenToMinutes(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, ":");
  if (!s) return NaN;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return NaN;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2] || "0", 10);
  if (h >= 1 && h <= 7) h += 12;
  if (h === 24) h = 0;
  return h * 60 + min;
}

function parsePaidHoursSpec(raw) {
  const s0 = String(raw || "").trim();
  if (!s0) return null;
  const compact = s0.replace(/\s+/g, "");
  if (!/[-–]|to/i.test(compact)) {
    const durOnly =
      compact.match(/^(\d+(?:\.\d+)?)h(?:ours?)?$/i) || compact.match(/^(\d+(?:\.\d+)?)$/);
    if (durOnly) {
      const h = Number(durOnly[1]);
      if (Number.isFinite(h) && h > 0 && h < 24) {
        return { hours: Number(h.toFixed(2)), startMin: null, endMin: null };
      }
    }
  }
  const range = compact.replace(/–/g, "-").replace(/to/gi, "-").split("-");
  if (range.length === 2) {
    const a = parseHmTokenToMinutes(range[0]);
    let b = parseHmTokenToMinutes(range[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (b < a) b += 24 * 60;
      return { hours: Number(((b - a) / 60).toFixed(2)), startMin: a, endMin: b };
    }
  }
  return null;
}

/** Mirror timesheet: payable only when completed; hours stay full band. */
function dualGate(entry) {
  const payable = entry.completed && !entry.dayOff && !entry.lateHold && !entry.upcoming;
  return {
    showHours: entry.hours,
    inPayableTotal: payable ? entry.hours : 0,
    rowTone: entry.completed ? "green" : "orange",
  };
}

console.log("--- parse paid_hours ---");
const sat = parsePaidHoursSpec("10.30-12.30");
ok("Youssef Sat 10.30-12.30 → 2h", sat && sat.hours === 2 && sat.startMin === 10 * 60 + 30 && sat.endMin === 12 * 60 + 30, JSON.stringify(sat));
const wed = parsePaidHoursSpec("1.5");
ok("Stephanie Wed 1.5 → 1.5h", wed && wed.hours === 1.5 && wed.startMin == null, JSON.stringify(wed));
ok("1.5h alias", parsePaidHoursSpec("1.5h")?.hours === 1.5);
ok("empty = no override", parsePaidHoursSpec("") === null && parsePaidHoursSpec("  ") === null);
ok("2.30-4 afternoon", (() => {
  const p = parsePaidHoursSpec("2.30-4");
  return p && p.hours === 1.5 && p.startMin === 14 * 60 + 30 && p.endMin === 16 * 60;
})());

console.log("--- dual gate (feedback vs band) ---");
const pending = dualGate({ hours: 2, completed: false, dayOff: false, lateHold: false, upcoming: false });
ok("pending feedback: still show 2h band", pending.showHours === 2 && pending.inPayableTotal === 0 && pending.rowTone === "orange");
const oneFbDoneButBand2 = dualGate({ hours: 2, completed: false, dayOff: false, lateHold: false, upcoming: false });
ok("partial feedback day stays unpaid total (orange)", oneFbDoneButBand2.inPayableTotal === 0 && oneFbDoneButBand2.showHours === 2);
const done = dualGate({ hours: 2, completed: true, dayOff: false, lateHold: false, upcoming: false });
ok("all feedback done: pay full Timetable band", done.inPayableTotal === 2 && done.rowTone === "green");
ok("never pay only 1h when band is 2", done.inPayableTotal !== 1);

console.log("--- file invariants ---");
const files = [
  "working_ui/timesheet.html",
  "working_ui/portal/admin-roster-spreadsheet-reference.js",
  "working_ui/portal/portal-staff-timetable-merge.js",
  "working_ui/portal/admin-portal-term-slot.js",
  "working_ui/admin_dashboard.html",
  "working_ui/portal/admin-dashboard.css",
];
for (const rel of files) {
  const abs = path.join(root, rel);
  ok("exists " + rel, fs.existsSync(abs));
}

const ts = fs.readFileSync(path.join(root, "working_ui/timesheet.html"), "utf8");
ok("timesheet loads merge script", ts.includes("portal-staff-timetable-merge.js"));
ok("timesheet has applyTimetablePaidBandToDayEntries", ts.includes("function applyTimetablePaidBandToDayEntries"));
ok("payableEntries gated by completed", /payableEntries\s*=\s*state\.entries\.filter\(\(e\)\s*=>\s*e\.completed/.test(ts));
ok("pendingEntries = !completed", /pendingEntries\s*=\s*state\.entries\.filter\(\(e\)\s*=>\s*!e\.completed/.test(ts));
ok("status note mentions Timetable paid band", ts.includes("Timetable paid band"));

const term = fs.readFileSync(path.join(root, "working_ui/portal/admin-portal-term-slot.js"), "utf8");
ok("cross-service releaseSourceSeatForMove", term.includes("function releaseSourceSeatForMove"));
ok("invoice review flag", term.includes("_invoiceReview") && term.includes("invoiceReviewBanner"));

const dash = fs.readFileSync(path.join(root, "working_ui/admin_dashboard.html"), "utf8");
ok("Services cells no longer inject seat__staff in aquatic board", !dash.includes('c4k-svc-seat__staff" title="Normal instructor"'));
ok("Services header still has th staff", dash.includes("c4k-svc-slot-th-seat__staff"));

const css = fs.readFileSync(path.join(root, "working_ui/portal/admin-dashboard.css"), "utf8");
ok("CSS hides cell staff", css.includes(".c4k-svc-seat__staff{display:none"));
ok("CSS enlarges header staff", /c4k-svc-slot-th-seat__staff\{[^}]*font-size:13px/.test(css.replace(/\s+/g, "")));

const asr = fs.readFileSync(path.join(root, "working_ui/portal/admin-roster-spreadsheet-reference.js"), "utf8");
ok("Type paid button", asr.includes("data-asr-pick-type-paid"));
ok("paid drives Timesheet copy", /Paid \(green\).*Timesheet/i.test(asr));

const mig = path.join(root, "supabase/migrations/20260917193000_portal_staff_timetable_paid_hours.sql");
ok("paid_hours migration present", fs.existsSync(mig));

console.log("--- syntax ---");
for (const rel of [
  "working_ui/portal/admin-roster-spreadsheet-reference.js",
  "working_ui/portal/portal-staff-timetable-merge.js",
  "working_ui/portal/admin-portal-term-slot.js",
]) {
  const r = spawnSync("node", ["--check", path.join(root, rel)], { encoding: "utf8" });
  ok("node --check " + path.basename(rel), r.status === 0, r.stderr);
}

if (failed) {
  console.error("\n" + failed + " failure(s)");
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
