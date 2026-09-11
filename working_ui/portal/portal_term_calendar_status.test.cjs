/**
 * Contract tests: portal_term_calendar + portal_session_status
 * Run: node working_ui/portal/portal_term_calendar_status.test.cjs
 */
"use strict";

const assert = require("assert");
const path = require("path");

const cal = require(path.join(__dirname, "portal_term_calendar.js"));
const status = require(path.join(__dirname, "portal_session_status.js"));

// --- Calendar: Day Centre open through Oct half-term weekdays ---
["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"].forEach((iso) => {
  assert.strictEqual(
    cal.isClosedIso(iso, { serviceKind: "day_centre" }),
    false,
    "DC should be open on " + iso,
  );
});

// --- Calendar: After-school closed 24 Oct – 1 Nov ---
["2026-10-24", "2026-10-26", "2026-10-30", "2026-11-01"].forEach((iso) => {
  assert.strictEqual(
    cal.isClosedIso(iso, { serviceKind: "afterschool" }),
    true,
    "AS should be closed on " + iso,
  );
});
assert.strictEqual(cal.isClosedIso("2026-10-23", { serviceKind: "afterschool" }), false);
assert.strictEqual(cal.isClosedIso("2026-11-02", { serviceKind: "afterschool" }), false);

// --- Christmas closed for everyone ---
assert.strictEqual(cal.isFullyClosedIso("2026-12-25"), true);
assert.strictEqual(cal.isClosedIso("2026-12-25", { serviceKind: "day_centre" }), true);

// --- Infer kind ---
assert.strictEqual(cal.inferServiceKind("Day Centre"), "day_centre");
assert.strictEqual(cal.inferServiceKind("Aquatic Activity"), "afterschool");

// --- Status: absent wins over clock ---
const absentPast = status.resolve({
  iso: "2026-09-11",
  todayIso: "2026-09-11",
  endMinutes: 13 * 60,
  nowMinutes: 15 * 60,
  attendance: "Absent",
});
assert.strictEqual(absentPast.status, "absent");

const absentDates = status.resolve({
  iso: "2026-09-11",
  todayIso: "2026-09-11",
  endMinutes: 13 * 60,
  nowMinutes: 15 * 60,
  absentDates: ["2026-09-11"],
});
assert.strictEqual(absentDates.status, "absent");

// --- Status: clock past without feedback → awaiting_feedback (NOT completed) ---
const awaiting = status.resolve({
  iso: "2026-09-11",
  todayIso: "2026-09-11",
  endMinutes: 13 * 60,
  nowMinutes: 15 * 60,
});
assert.strictEqual(awaiting.status, "awaiting_feedback");

// --- Status: present feedback → completed ---
const done = status.resolve({
  iso: "2026-09-11",
  todayIso: "2026-09-11",
  endMinutes: 13 * 60,
  nowMinutes: 15 * 60,
  attendance: "Present",
  feedbackSubmitted: true,
});
assert.strictEqual(done.status, "completed");

// --- Status: scheduled before end ---
const scheduled = status.resolve({
  iso: "2026-09-11",
  todayIso: "2026-09-11",
  endMinutes: 13 * 60,
  nowMinutes: 11 * 60,
});
assert.strictEqual(scheduled.status, "scheduled");

// --- Cancelled ---
const cancelled = status.resolve({
  iso: "2026-09-11",
  cancelledDates: ["2026-09-11"],
});
assert.strictEqual(cancelled.status, "cancelled");

console.log("portal_term_calendar_status.test.cjs: OK");
