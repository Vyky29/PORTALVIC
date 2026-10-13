/**
 * Smoke: session disruption shifts.
 * Two blocks on the day (morning and afternoon) are a pick.
 * One block is the whole day.
 * Validate covers only the shift they marked.
 *
 *   node database/local-vault/smoke-disruption-shifts-20261013.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "../..");
let failed = 0;

function check(name, ok, detail) {
  if (ok) {
    console.log("ok  " + name);
    return;
  }
  failed += 1;
  console.log("FAIL " + name + (detail ? " - " + detail : ""));
}

function loadShifts() {
  const window = {};
  const ctx = vm.createContext({ window: window, globalThis: window });
  vm.runInContext(
    fs.readFileSync(path.join(root, "working_ui/portal/portal_capacity_chain_occupants.js"), "utf8"),
    ctx,
  );
  vm.runInContext(
    fs.readFileSync(path.join(root, "working_ui/portal/portal_disruption_shifts.js"), "utf8"),
    ctx,
  );
  return {
    fn: window.PortalDisruptionShifts.shiftsForStaffOnDate,
    by: window.PORTAL_CAPACITY_CHAIN_OCCUPANTS.bySlotId,
  };
}

function loadAfternoonPredicate() {
  const src = fs.readFileSync(
    path.join(root, "supabase/functions/portal-admin-session-disruption-validate/index.ts"),
    "utf8",
  );
  const start = src.indexOf("function disruptionSlotIsAfternoon");
  const end = src.indexOf("\nasync function resolveNameKey");
  if (start < 0 || end < start) throw new Error("disruptionSlotIsAfternoon missing");
  const body = src.slice(start, end).trim().replace(/\(raw:[\s\S]*?\): boolean/, "(raw)");
  const window = {};
  const ctx = vm.createContext({ window: window });
  vm.runInContext(
    "function clean(v, max){ return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim().slice(0, max || 80); }\n" +
      body +
      "\nwindow.disruptionSlotIsAfternoon = disruptionSlotIsAfternoon;",
    ctx,
  );
  return window.disruptionSlotIsAfternoon;
}

function keepSlot(isAfternoon, shift, slot) {
  const afternoon = isAfternoon(slot);
  if (shift === "Morning" && afternoon) return false;
  if (shift === "Afternoon" && !afternoon) return false;
  return true;
}

const { fn, by } = loadShifts();
const iso = "2026-10-13";

const roberto = fn(by, "Roberto Reali", iso);
check("Roberto Tue 13 has two shifts to pick", roberto.mode === "pick", roberto.mode);
check(
  "Roberto morning is SwimFarm before 3pm",
  roberto.bands[0] &&
    roberto.bands[0].id === "morning" &&
    roberto.bands[0].venues.indexOf("SwimFarm") >= 0 &&
    roberto.bands[0].start < 15 * 60,
  JSON.stringify(roberto.bands[0]),
);
check(
  "Roberto afternoon is Acton from 4",
  roberto.bands[1] &&
    roberto.bands[1].id === "afternoon" &&
    roberto.bands[1].venues.indexOf("Acton") >= 0 &&
    roberto.bands[1].start >= 16 * 60,
  JSON.stringify(roberto.bands[1]),
);

const luliya = fn(by, "Luliya", iso);
check(
  "Luliya Tue 13 also picks morning and afternoon",
  luliya.mode === "pick" && luliya.bands.length === 2,
  luliya.mode + " " + luliya.bands.length,
);

const javier = fn(by, "Javier", iso);
check("Javier Tue 13 is the day, not a pick", javier.mode === "day", javier.mode);
check(
  "Javier only has the afternoon block",
  javier.bands.length === 1 && javier.bands[0].id === "afternoon" && /the day/.test(javier.hint),
  javier.hint,
);

const aurora = fn(by, "Aurora", iso);
check(
  "Aurora Tue 13 is the day",
  aurora.mode === "day" && aurora.bands.length === 1 && aurora.bands[0].id === "afternoon",
  aurora.mode + " " + (aurora.bands[0] && aurora.bands[0].text),
);

const none = fn(by, "Youssef", iso);
check(
  "No sessions that day is still the day",
  none.mode === "day" && none.bands.length === 0 && /No booked sessions/.test(none.hint),
  none.hint,
);

const bad = fn(by, "Roberto", "not-a-date");
check("A bad date does not invent shifts", bad.mode === "day" && bad.bands.length === 0);

const isAfternoon = loadAfternoonPredicate();
const dc = { programme: "Day Centre", anchor_start: "12:30:00" };
const dcLate = { programme: "Day Centre", anchor_start: "15:00:00" };
const pool = { programme: "Aquatic Activity", anchor_start: "16:00:00" };
const morningPool = { programme: "Aquatic Activity", anchor_start: "11:00:00" };

check("Day Centre 12.30 is morning", isAfternoon(dc) === false);
check("Day Centre 3pm stays morning", isAfternoon(dcLate) === false);
check("Aquatic 4pm is afternoon", isAfternoon(pool) === true);
check("Aquatic 11am is morning", isAfternoon(morningPool) === false);

check("Morning off keeps Day Centre", keepSlot(isAfternoon, "Morning", dc) === true);
check("Morning off drops 4pm aquatic", keepSlot(isAfternoon, "Morning", pool) === false);
check("Afternoon off drops Day Centre", keepSlot(isAfternoon, "Afternoon", dc) === false);
check("Afternoon off keeps 4pm aquatic", keepSlot(isAfternoon, "Afternoon", pool) === true);
check("Day off keeps both", keepSlot(isAfternoon, "Day", dc) && keepSlot(isAfternoon, "Day", pool));

const form = fs.readFileSync(path.join(root, "working_ui/session_disruption_report.html"), "utf8");
check("Form sends shift_label", form.indexOf("shift_label: shiftLabel") >= 0);
check("Both ticks become Day", form.indexOf('picked.length >= 2 ? "Day"') >= 0);
check("One block returns Day", form.indexOf('if (shiftState.mode !== "pick") return "Day"') >= 0);

const admin = fs.readFileSync(path.join(root, "working_ui/admin_dashboard.html"), "utf8");
check("Admin list has a Shift column", admin.indexOf("<th>Shift</th>") >= 0);
check("Admin reads Morning and Afternoon", admin.indexOf("function portalSdReportShift") >= 0);

const validate = fs.readFileSync(
  path.join(root, "supabase/functions/portal-admin-session-disruption-validate/index.ts"),
  "utf8",
);
check("Validate writes Morning only", validate.indexOf('"Morning only"') >= 0);
check("Validate writes Afternoon only", validate.indexOf('"Afternoon only"') >= 0);

const submit = fs.readFileSync(
  path.join(root, "supabase/functions/portal-session-disruption-submit/index.ts"),
  "utf8",
);
check(
  "Submit stores Day, Morning, or Afternoon",
  submit.indexOf('shiftRaw === "Morning"') >= 0 && submit.indexOf("shift_label: shiftLabel") >= 0,
);

if (failed) {
  console.log("\n" + failed + " failed");
  process.exit(1);
}
console.log("\nall passed");
