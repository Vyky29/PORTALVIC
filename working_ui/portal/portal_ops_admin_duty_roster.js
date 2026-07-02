/**
 * Ops admin (Sevitha) — Mon–Fri admin duty 11:00–15:00 on staff dashboard.
 * Patches term shift dates and merges synthetic MANAGER roster rows (shown as ADMIN in UI).
 */
(function (global) {
  "use strict";

  var OPS_KEYS = { sevitha: true, info: true };
  var TERM_FROM = "2026-06-01";
  var TERM_TO = "2026-07-17";
  var WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function normKey(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function isOpsAdminStaffKey(staffKey) {
    return !!OPS_KEYS[normKey(staffKey)];
  }

  function weekdayDatesBetween(fromIso, toIso) {
    var from = String(fromIso || "").trim().slice(0, 10);
    var to = String(toIso || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];
    var out = [];
    var seen = Object.create(null);
    var d = new Date(from + "T12:00:00");
    var end = new Date(to + "T12:00:00");
    if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return [];
    while (d.getTime() <= end.getTime()) {
      var wd = d.getDay();
      if (wd >= 1 && wd <= 5) {
        var iso =
          d.getFullYear() +
          "-" +
          String(d.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(d.getDate()).padStart(2, "0");
        if (!seen[iso]) {
          seen[iso] = true;
          out.push(iso);
        }
      }
      d.setDate(d.getDate() + 1);
    }
    return out;
  }

  function termBounds() {
    var meta =
      (global.STAFF_DASHBOARD_SOURCE && global.STAFF_DASHBOARD_SOURCE.meta) ||
      (global.PORTAL_TERM_FROM_TIMETABLE && global.PORTAL_TERM_FROM_TIMETABLE.meta) ||
      {};
    return {
      from: String(meta.termFrom || TERM_FROM).slice(0, 10),
      to: String(meta.termTo || TERM_TO).slice(0, 10),
    };
  }

  function patchTermConfig() {
    var t = global.PORTAL_TERM_FROM_TIMETABLE;
    if (!t || typeof t !== "object") return;
    var bounds = termBounds();
    var dates = weekdayDatesBetween(bounds.from, bounds.to);
    if (!dates.length) return;

    if (!t.termStaffWeekdayIndicesByProfileKey) t.termStaffWeekdayIndicesByProfileKey = {};
    if (!t.termStaffWeekdayIndicesDashboardByProfileKey) {
      t.termStaffWeekdayIndicesDashboardByProfileKey = {};
    }
    if (!t.termStaffShiftDatesByProfileKey) t.termStaffShiftDatesByProfileKey = {};

    ["sevitha", "info"].forEach(function (k) {
      t.termStaffWeekdayIndicesByProfileKey[k] = [1, 2, 3, 4, 5];
      t.termStaffWeekdayIndicesDashboardByProfileKey[k] = [1, 2, 3, 4, 5];
      t.termStaffShiftDatesByProfileKey[k] = dates.slice();
    });
  }

  function dutyRowForDate(iso) {
    var d = new Date(iso + "T12:00:00");
    var day = WEEKDAY_NAMES[d.getDay()] || "Monday";
    return {
      client_name: "MANAGER",
      day: day,
      instructors: "SEVITHA",
      service: "Day Centre",
      area: "Hub · Admin",
      time_slot: "11 to 3",
      venue: "SwimFarm",
      session_date: iso,
      __portal_ops_admin_duty: true,
    };
  }

  function mergeDutyRows(source, staffKey) {
    if (!isOpsAdminStaffKey(staffKey)) return source;
    var src = source && typeof source === "object" ? source : {};
    var rows = Array.isArray(src.rows) ? src.rows.slice() : [];
    var bounds = termBounds();
    var dates = weekdayDatesBetween(bounds.from, bounds.to);
    var seen = Object.create(null);
    rows.forEach(function (row) {
      if (!row || String(row.instructors || "").toUpperCase().indexOf("SEVITHA") < 0) return;
      var iso = String(row.session_date || row.date || "").trim().slice(0, 10);
      var nm = String(row.client_name || "").trim().toLowerCase();
      if (iso && (nm === "manager" || nm === "home" || nm === "casa")) {
        seen[iso + "|" + nm] = true;
      }
    });
    dates.forEach(function (iso) {
      var key = iso + "|manager";
      if (seen[key]) return;
      seen[key] = true;
      rows.push(dutyRowForDate(iso));
    });
    return Object.assign({}, src, { rows: rows });
  }

  patchTermConfig();

  global.portalOpsAdminDutyRoster = {
    isOpsAdminStaffKey: isOpsAdminStaffKey,
    mergeDutyRows: mergeDutyRows,
    patchTermConfig: patchTermConfig,
    weekdayDatesBetween: weekdayDatesBetween,
  };
})(typeof window !== "undefined" ? window : globalThis);
