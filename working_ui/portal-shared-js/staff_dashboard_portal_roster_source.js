/**
 * Builds STAFF_DASHBOARD_SOURCE.rows from admin portal overview/status data
 * (SESSION_FEEDBACK_STATUS_PORTAL_SOURCE), not legacy spreadsheet exports.
 *
 * Reference week: 2026-05-11 … 2026-05-17.
 * Summer term 2 deltas: dated rows from 2026-05-18 onward.
 * Break: 2026-05-24 (Sat) … 2026-05-31 (Sun); resume 2026-06-01; term ends 2026-07-17.
 */
(function () {
  var REF_START = "2026-05-11";
  var REF_END = "2026-05-17";
  var SUMMER2_START = "2026-05-18";
  var TERM_END = "2026-07-17";
  var BREAK_FROM = "2026-05-24";
  var BREAK_TO = "2026-05-31";

  function normIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function parseIsoLocal(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return null;
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10) - 1;
    var d = parseInt(p[2], 10);
    var dt = new Date(y, m, d);
    if (isNaN(dt.getTime())) return null;
    return dt;
  }

  function isoFromDate(dt) {
    if (!dt || isNaN(dt.getTime())) return "";
    return (
      dt.getFullYear() +
      "-" +
      String(dt.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(dt.getDate()).padStart(2, "0")
    );
  }

  function isoAddDays(iso, days) {
    var dt = parseIsoLocal(iso);
    if (!dt) return "";
    dt.setDate(dt.getDate() + days);
    return isoFromDate(dt);
  }

  function weekdayLongFromIso(iso) {
    var dt = parseIsoLocal(iso);
    if (!dt) return "";
    return dt.toLocaleDateString("en-GB", { weekday: "long" });
  }

  function termBreakRange() {
    var t = typeof window !== "undefined" ? window.PORTAL_TERM_FROM_TIMETABLE : null;
    if (!t) return { from: BREAK_FROM, to: BREAK_TO };
    return {
      from: normIso(t.termBreakFrom) || BREAK_FROM,
      to: normIso(t.termBreakTo) || BREAK_TO,
    };
  }

  function isoIsTermBreak(iso) {
    var br = termBreakRange();
    return !!(iso && br.from && br.to && iso >= br.from && iso <= br.to);
  }

  /** From this ISO, roster rows come from the machine bundle (dated summer export), not portal status projection. */
  function machineRosterFloorIso() {
    var t = typeof window !== "undefined" ? window.PORTAL_TERM_FROM_TIMETABLE : null;
    if (t) {
      var v = normIso(t.termResumeDate) || normIso(t.termDashboardCalendarFrom);
      if (v) return v;
    }
    return "2026-06-01";
  }

  function snapshotMachineRows() {
    if (typeof window === "undefined") return [];
    if (
      Array.isArray(window.__STAFF_DASHBOARD_MACHINE_ROWS__) &&
      window.__STAFF_DASHBOARD_MACHINE_ROWS__.length
    ) {
      return window.__STAFF_DASHBOARD_MACHINE_ROWS__;
    }
    var src = window.STAFF_DASHBOARD_SOURCE;
    if (src && Array.isArray(src.rows) && src.rows.length) {
      window.__STAFF_DASHBOARD_MACHINE_ROWS__ = src.rows.slice();
      return window.__STAFF_DASHBOARD_MACHINE_ROWS__;
    }
    return [];
  }

  snapshotMachineRows();

  function statusRowToAdapterRow(r) {
    return {
      client_name: String(r.client || "").trim(),
      day: String(r.weekday || weekdayLongFromIso(r.date) || "").trim(),
      instructors: String(r.instructor || "").trim(),
      service: String(r.service || "").trim(),
      area: String(r.notes || "").trim(),
      time_slot: String(r.timeSlot || "").trim(),
      venue: String(r.venue || "").trim(),
      session_date: normIso(r.date),
    };
  }

  function datedRowKey(row) {
    return [
      row.session_date,
      String(row.client_name || "").toLowerCase(),
      String(row.time_slot || "").toLowerCase(),
      String(row.instructors || "").toLowerCase(),
    ].join("|");
  }

  function datedSlotKey(row) {
    return [
      row.session_date,
      String(row.client_name || "").toLowerCase(),
      String(row.time_slot || "").toLowerCase(),
    ].join("|");
  }

  function templateKey(row) {
    return [
      String(row.day || "").toLowerCase(),
      String(row.client_name || "").toLowerCase(),
      String(row.time_slot || "").toLowerCase(),
    ].join("|");
  }

  function projectThroughIso() {
    var t =
      typeof window !== "undefined" ? window.PORTAL_TERM_FROM_TIMETABLE : null;
    return (t && normIso(t.lastDate)) || TERM_END;
  }

  function buildRowsFromPortalStatus() {
    var status =
      typeof window !== "undefined" &&
      window.SESSION_FEEDBACK_STATUS_PORTAL_SOURCE;
    var list = status && Array.isArray(status.rows) ? status.rows : [];
    if (!list.length) return [];

    var datedByKey = Object.create(null);
    var datedSlotTaken = Object.create(null);
    var templates = Object.create(null);

    list.forEach(function (raw) {
      var row = statusRowToAdapterRow(raw);
      if (!row.client_name || !row.day) return;
      var iso = row.session_date;
      if (!iso) return;

      datedByKey[datedRowKey(row)] = row;
      datedSlotTaken[datedSlotKey(row)] = true;

      if (iso >= REF_START && iso <= REF_END) {
        templates[templateKey(row)] = Object.assign({}, row);
      }
      if (iso >= SUMMER2_START) {
        var tpl = Object.assign({}, row);
        delete tpl.session_date;
        templates[templateKey(row)] = tpl;
      }
    });

    var lastIso = projectThroughIso();
    var rosterFloor = machineRosterFloorIso();
    var cur = REF_START;
    while (cur && cur <= lastIso) {
      if (rosterFloor && cur >= rosterFloor) {
        cur = isoAddDays(cur, 1);
        continue;
      }
      if (!isoIsTermBreak(cur)) {
        var dow = weekdayLongFromIso(cur);
        if (dow !== "Sunday") {
          Object.keys(templates).forEach(function (tk) {
            var t = templates[tk];
            if (String(t.day || "") !== dow) return;
            var projected = Object.assign({}, t, { session_date: cur, day: dow });
            var sk = datedSlotKey(projected);
            if (datedSlotTaken[sk]) return;
            var dk = datedRowKey(projected);
            if (!datedByKey[dk]) datedByKey[dk] = projected;
          });
        }
      }
      cur = isoAddDays(cur, 1);
    }

    return Object.keys(datedByKey)
      .map(function (k) {
        return datedByKey[k];
      })
      .sort(function (a, b) {
        var c = String(a.session_date || "").localeCompare(
          String(b.session_date || "")
        );
        if (c) return c;
        c = String(a.day || "").localeCompare(String(b.day || ""));
        if (c) return c;
        return String(a.time_slot || "").localeCompare(String(b.time_slot || ""));
      });
  }

  /** Pre–Summer Term 2 catch-up/extra calendar days: keep machine dated rows when portal status projection misses them. */
  function preTermCatchUpMachineDates() {
    var t = typeof window !== "undefined" ? window.PORTAL_TERM_FROM_TIMETABLE : null;
    if (!t) return [];
    var out = [];
    var add = function (iso) {
      var d = normIso(iso);
      if (d && out.indexOf(d) < 0) out.push(d);
    };
    var extra = t.termStaffExtraCalendarDatesByProfileKey || {};
    var catchUp = t.termStaffCatchUpFeedbackDatesByProfileKey || {};
    Object.keys(extra).forEach(function (k) {
      (extra[k] || []).forEach(add);
    });
    Object.keys(catchUp).forEach(function (k) {
      (catchUp[k] || []).forEach(add);
    });
    return out;
  }

  function appendMachineRowsForPreTermCatchUpDays(baseRows, machineRows, floorIso) {
    var dates = preTermCatchUpMachineDates();
    if (!dates.length) return baseRows;
    var floor = normIso(floorIso) || machineRosterFloorIso();
    var seen = Object.create(null);
    (baseRows || []).forEach(function (r) {
      var iso = normIso(r.session_date);
      if (!iso) return;
      if (dates.indexOf(iso) >= 0) seen[datedRowKey(r)] = true;
      else seen[datedSlotKey(r)] = true;
    });
    var out = (baseRows || []).slice();
    (machineRows || []).forEach(function (r) {
      var iso = normIso(r.session_date);
      if (!iso || iso >= floor || dates.indexOf(iso) < 0) return;
      var dedupeKey = datedRowKey(r);
      if (seen[dedupeKey]) return;
      seen[dedupeKey] = true;
      out.push(r);
    });
    return out;
  }

  function applyPortalRosterDbRows(rows) {
    var cache =
      typeof window !== "undefined" && window.PORTAL_ROSTER_ROWS_CACHE;
    var list = Array.isArray(cache) ? cache : [];
    if (!list.length) return rows;
    var mergeFn =
      typeof window !== "undefined" &&
      window.PortalRosterRowsMerge &&
      window.PortalRosterRowsMerge.mergePortalRosterRows;
    if (!mergeFn) return rows;
    return mergeFn(rows, list);
  }

  function resolveStaffDashboardSource() {
    var base =
      (typeof window !== "undefined" && window.STAFF_DASHBOARD_SOURCE) || {};
    var machineRows = snapshotMachineRows();
    var portalRows = buildRowsFromPortalStatus();
    var floor = machineRosterFloorIso();
    var mergedRows;

    if (!portalRows.length) {
      mergedRows = applyPortalRosterDbRows(
        Array.isArray(machineRows) && machineRows.length ? machineRows : base.rows || []
      );
      return Object.assign({}, base, { rows: mergedRows });
    }

    var fromMachine = machineRows.filter(function (r) {
      return normIso(r.session_date) >= floor;
    });
    var fromPortal = portalRows.filter(function (r) {
      var iso = normIso(r.session_date);
      return !iso || iso < floor;
    });

    mergedRows = appendMachineRowsForPreTermCatchUpDays(
      fromPortal.concat(fromMachine),
      machineRows,
      floor
    );
    mergedRows = applyPortalRosterDbRows(mergedRows);

    return Object.assign({}, base, {
      rows: mergedRows,
      rosterSourceNote:
        "portal status before " +
        floor +
        "; machine roster from " +
        floor +
        "; ref " +
        REF_START +
        "–" +
        REF_END +
        "; break " +
        BREAK_FROM +
        "–" +
        BREAK_TO +
        "; term ends " +
        TERM_END,
    });
  }

  window.portalResolveStaffDashboardSource = resolveStaffDashboardSource;

  function refreshStaffDashboardSourceFromPortal() {
    if (typeof window === "undefined" || !window.STAFF_DASHBOARD_SOURCE) return;
    window.STAFF_DASHBOARD_SOURCE = resolveStaffDashboardSource();
    dispatchStaffDashboardSourceUpdated();
  }

  window.portalRefreshStaffDashboardSourceFromPortal = refreshStaffDashboardSourceFromPortal;

  function dispatchStaffDashboardSourceUpdated() {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(new CustomEvent("portal:staff-dashboard-source-updated"));
    } catch (_) {}
  }

  function refreshPortalRosterRowsFromSupabase(client) {
    if (
      typeof window === "undefined" ||
      !window.PortalRosterRowsMerge ||
      typeof window.PortalRosterRowsMerge.loadAndCache !== "function"
    ) {
      return Promise.resolve([]);
    }
    return window.PortalRosterRowsMerge.loadAndCache(client).then(function (rows) {
      refreshStaffDashboardSourceFromPortal();
      return rows;
    });
  }

  window.portalRefreshPortalRosterRowsFromSupabase = refreshPortalRosterRowsFromSupabase;

  refreshStaffDashboardSourceFromPortal();
})();
