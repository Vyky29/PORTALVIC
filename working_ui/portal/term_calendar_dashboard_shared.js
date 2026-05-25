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
  function feedbackReminderDayInScope(iso, todayIso) {
    var key = normIso(iso);
    if (!key) return false;
    var from = feedbackReminderFromIso();
    var today = normIso(todayIso);
    if (from && key < from) return false;
    if (today && key > today) return false;
    return true;
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

  /** Red cell: outside view, vacation, or weekday not on this staff's Summer Term rota. */
  function dayIsRed(iso, weekdayIndex, staffId, worked, extraRed) {
    if (!inView(iso)) return true;
    if (extraRed) return true;
    if (staffOffWeekdayOnDate(iso, staffId)) return true;
    if (Array.isArray(worked) && worked.length && worked.indexOf(weekdayIndex) < 0) return true;
    return false;
  }

  global.PortalTermCalendarDashboard = {
    fromIso: fromIso,
    toIso: toIso,
    inView: inView,
    feedbackReminderFromIso: feedbackReminderFromIso,
    feedbackReminderDayInScope: feedbackReminderDayInScope,
    applyView: applyView,
    workedWeekdaysForStaff: workedWeekdaysForStaff,
    staffOffWeekdayOnDate: staffOffWeekdayOnDate,
    dayIsRed: dayIsRed,
  };
})(typeof window !== "undefined" ? window : this);
