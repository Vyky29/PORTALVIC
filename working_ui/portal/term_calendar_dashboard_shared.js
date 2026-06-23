/**
 * Staff + lead My Term grid: view window from 1 Jun, blue = work day, red = off day.
 * Requires window.PORTAL_TERM_FROM_TIMETABLE (term_from_timetable.js).
 */
(function (global) {
  function termCfg() {
    return global.PORTAL_TERM_FROM_TIMETABLE || {};
  }

  function normIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function londonYesterdayIso() {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date(Date.now() - 86400000));
      var y = parts.find(function (p) {
        return p.type === "year";
      });
      var m = parts.find(function (p) {
        return p.type === "month";
      });
      var d = parts.find(function (p) {
        return p.type === "day";
      });
      if (y && m && d) return y.value + "-" + m.value + "-" + d.value;
    } catch (_e) {}
    var dt = new Date(Date.now() - 86400000);
    return (
      dt.getFullYear() +
      "-" +
      String(dt.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(dt.getDate()).padStart(2, "0")
    );
  }

  function feedbackAssumeCompleteThroughIso() {
    var t = termCfg();
    var fixed = normIso(t.termFeedbackAssumeCompleteThroughIso);
    if (fixed) return fixed;
    if (t.termFeedbackAssumeCompleteThroughYesterday) return londonYesterdayIso();
    return "";
  }

  /** Catch-up export days stay actionable (per-client done list). */
  function staffCatchUpFeedbackDates(staffId) {
    var id = String(staffId || "").trim().toLowerCase();
    var t = termCfg();
    var bypass = Array.isArray(t.termStaffLateSubmissionBypassProfileKeys)
      ? t.termStaffLateSubmissionBypassProfileKeys
      : [];
    if (!id || !bypass.some(function (k) { return String(k || "").trim().toLowerCase() === id; })) {
      return [];
    }
    var map = t.termStaffCatchUpFeedbackDatesByProfileKey;
    var raw = map && map[id];
    if (!Array.isArray(raw)) return [];
    return raw.map(normIso).filter(Boolean);
  }

  /** True when session feedback before today is treated complete (legacy Zoho / bulk catch-up). */
  function feedbackAssumeComplete(iso, staffId) {
    var key = normIso(iso);
    var through = feedbackAssumeCompleteThroughIso();
    if (!key || !through || key > through) return false;
    if (staffCatchUpFeedbackDates(staffId).indexOf(key) >= 0) return false;
    return true;
  }

  function fromIso() {
    var t = termCfg();
    return normIso(t.termDashboardCalendarFrom) || normIso(t.termResumeDate) || "2026-06-01";
  }

  function toIso() {
    var t = termCfg();
    return normIso(t.termDashboardCalendarTo) || normIso(t.lastDate) || "2026-07-17";
  }

  function inView(iso) {
    var f = fromIso();
    var to = toIso();
    if (f && iso < f) return false;
    if (to && iso > to) return false;
    return true;
  }

  /** Summer Term 2 feedback reminders only from term resume (e.g. 2026-06-01), not April/May roster. */
  function feedbackReminderFromIso() {
    return fromIso();
  }

  /** True when a calendar day may count toward incomplete-feedback reminders (in term window and not future). */
  function feedbackReminderDayInScope(iso, todayIso, staffId) {
    var key = normIso(iso);
    if (!key) return false;
    var today = normIso(todayIso);
    if (today && key > today) return false;
    var id = String(staffId || "").trim().toLowerCase();
    if (id && staffExtraCalendarDates(id).indexOf(key) >= 0) return true;
    var from = feedbackReminderFromIso();
    if (from && key < from) return false;
    return true;
  }

  function staffExtraCalendarDates(staffId) {
    var id = String(staffId || "").trim().toLowerCase();
    var map = termCfg().termStaffExtraCalendarDatesByProfileKey;
    var raw = map && map[id];
    if (!Array.isArray(raw)) return [];
    return raw.map(normIso).filter(Boolean);
  }

  function staffDateInView(iso, staffId) {
    if (inView(iso)) return true;
    return staffExtraCalendarDates(staffId).indexOf(iso) >= 0;
  }

  function applyView(dashboardData) {
    var t = termCfg();
    if (!dashboardData || typeof dashboardData !== "object") return;
    if (t.termName) dashboardData.termName = t.termName;
    dashboardData.termCalendarYear =
      Number(
        t.termDashboardCalendarYear != null ? t.termDashboardCalendarYear : t.termCalendarYear
      ) || 2026;
    if (Array.isArray(t.termDashboardCalendarMonths) && t.termDashboardCalendarMonths.length) {
      dashboardData.termCalendarMonths = t.termDashboardCalendarMonths.map(Number);
    } else {
      dashboardData.termCalendarMonths = [5, 6];
    }
    dashboardData.termCalendarFirstDom =
      t.termDashboardCalendarFirstDom && typeof t.termDashboardCalendarFirstDom === "object"
        ? t.termDashboardCalendarFirstDom
        : {};
    dashboardData.termDashboardCalendarFrom = fromIso();
    dashboardData.termDashboardCalendarTo = toIso();
    if (Array.isArray(t.termHalfTermWeekStarts)) {
      dashboardData.termHalfTermWeekStarts = t.termHalfTermWeekStarts.map(String);
    }
  }

  function workedWeekdaysForStaff(staffId) {
    var id = String(staffId || "").trim().toLowerCase();
    var t = termCfg();
    var dash = t.termStaffWeekdayIndicesDashboardByProfileKey;
    var all = t.termStaffWeekdayIndicesByProfileKey;
    if (dash && Array.isArray(dash[id]) && dash[id].length) {
      return dash[id].slice().sort(function (a, b) {
        return a - b;
      });
    }
    if (all && Array.isArray(all[id]) && all[id].length) {
      return all[id].slice().sort(function (a, b) {
        return a - b;
      });
    }
    return [];
  }

  function staffBaselineShiftDates(staffId) {
    var id = String(staffId || "").trim().toLowerCase();
    var t = termCfg();
    var map = t.termStaffShiftDatesByProfileKey;
    if (!map || typeof map !== "object" || !id) return null;
    if (!Object.prototype.hasOwnProperty.call(map, id)) return [];
    var raw = map[id];
    if (!Array.isArray(raw)) return [];
    return raw.map(normIso).filter(Boolean);
  }

  function staffAwayDates(staffId) {
    var id = String(staffId || "").trim().toLowerCase();
    var map = termCfg().termStaffAwayDatesByProfileKey;
    var raw = map && map[id];
    if (!Array.isArray(raw)) return [];
    return raw.map(normIso).filter(Boolean);
  }

  /** Date was on the published term timetable (zero-hours availability lock). */
  function staffHadBaselineShiftOnDate(iso, staffId) {
    var key = normIso(iso);
    var dates = staffBaselineShiftDates(staffId);
    if (!key || !dates) return false;
    return dates.indexOf(key) >= 0;
  }

  /**
   * Intense red: removed from an original term shift (e.g. requested day off from scheduled days).
   * Normal red only: day off that was never on the baseline (cover added later then removed).
   */
  function staffRemovedFromBaselineShiftOnDate(iso, staffId, opts) {
    opts = opts || {};
    var key = normIso(iso);
    var id = String(staffId || "").trim().toLowerCase();
    if (!key || !id) return false;
    if (!staffHadBaselineShiftOnDate(key, id)) return false;
    if (typeof opts.hasInstructorCover === "function" && opts.hasInstructorCover(key, id)) {
      return false;
    }
    if (typeof opts.rosterApplies === "function" && opts.rosterApplies(key, id)) {
      return false;
    }
    if (staffAwayDates(id).indexOf(key) >= 0) return true;
    if (typeof opts.dayIsRed === "function" && opts.dayIsRed(key, id)) return true;
    return false;
  }

  function staffOffWeekdayOnDate(iso, staffId) {
    var id = String(staffId || "").trim().toLowerCase();
    if (!iso || !id) return false;
    var t = termCfg();
    var map = t.termStaffOffWeekdaysRangeByProfileKey;
    var cfg = map && map[id];
    if (!cfg || typeof cfg !== "object") return false;
    var f = normIso(cfg.from);
    var to = normIso(cfg.to);
    if (f && iso < f) return false;
    if (to && iso > to) return false;
    var wd = new Date(iso + "T12:00:00").getDay();
    var drop = Array.isArray(cfg.weekdays) ? cfg.weekdays.map(Number) : [];
    return drop.indexOf(wd) >= 0;
  }

  function rosterRowIsDayCentre(row) {
    if (!row) return false;
    var blob = String(
      row.rosterService || row.service || row.activity || row.feedbackUnitKey || ""
    );
    return /day\s*centre/i.test(blob) || blob.indexOf("day_centre") >= 0;
  }

  /** First calendar day a staff member counts for a service (e.g. Day Centre mornings). */
  function staffServiceStartIso(staffId, serviceKey) {
    var id = String(staffId || "").trim().toLowerCase();
    var svc = String(serviceKey || "").trim().toLowerCase();
    if (!id || !svc) return "";
    var map = termCfg().termStaffServiceStartDatesByProfileKey;
    var perStaff = map && map[id];
    if (!perStaff || typeof perStaff !== "object") return "";
    return normIso(perStaff[svc]);
  }

  /** Hide Day Centre (etc.) before staff-specific service start — e.g. Youssef from 12 Jun. */
  function staffSessionServiceActiveOnDate(staffId, sessionRow, isoYmd) {
    var iso = normIso(isoYmd);
    var id = String(staffId || "").trim().toLowerCase();
    if (!iso || !id || !sessionRow) return true;
    if (!rosterRowIsDayCentre(sessionRow)) return true;
    var start = staffServiceStartIso(id, "day_centre");
    if (start && iso < start) return false;
    return true;
  }

  /** Red cell: outside view, vacation, or weekday not on this staff's Summer Term rota. */
  function dayIsRed(iso, weekdayIndex, staffId, worked, extraRed) {
    if (!staffDateInView(iso, staffId)) return true;
    if (staffExtraCalendarDates(staffId).indexOf(iso) >= 0) {
      if (staffOffWeekdayOnDate(iso, staffId)) return true;
      return false;
    }
    if (extraRed) return true;
    if (staffOffWeekdayOnDate(iso, staffId)) return true;
    if (Array.isArray(worked) && worked.length && worked.indexOf(weekdayIndex) < 0) return true;
    return false;
  }

  global.PortalTermCalendarDashboard = {
    fromIso: fromIso,
    toIso: toIso,
    inView: inView,
    staffExtraCalendarDates: staffExtraCalendarDates,
    staffDateInView: staffDateInView,
    feedbackReminderFromIso: feedbackReminderFromIso,
    feedbackReminderDayInScope: feedbackReminderDayInScope,
    feedbackAssumeCompleteThroughIso: feedbackAssumeCompleteThroughIso,
    feedbackAssumeComplete: feedbackAssumeComplete,
    applyView: applyView,
    workedWeekdaysForStaff: workedWeekdaysForStaff,
    staffBaselineShiftDates: staffBaselineShiftDates,
    staffAwayDates: staffAwayDates,
    staffHadBaselineShiftOnDate: staffHadBaselineShiftOnDate,
    staffRemovedFromBaselineShiftOnDate: staffRemovedFromBaselineShiftOnDate,
    staffOffWeekdayOnDate: staffOffWeekdayOnDate,
    staffServiceStartIso: staffServiceStartIso,
    staffSessionServiceActiveOnDate: staffSessionServiceActiveOnDate,
    dayIsRed: dayIsRed,
  };
})(typeof window !== "undefined" ? window : this);
