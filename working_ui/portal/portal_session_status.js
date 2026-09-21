/**
 * Canonical session status for Parent / Staff / Overview.
 *
 * Precedence:
 *   absent > cancelled > not_enrolled > completed | awaiting_feedback | scheduled
 *
 * Clock past end alone is never "completed" — that requires present feedback
 * (or explicit completed). Past end with no feedback → awaiting_feedback.
 */
(function (global) {
  "use strict";

  function clean(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function cleanIso(iso) {
    var s = clean(iso).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function attendanceIsAbsent(attendance) {
    var a = clean(attendance).toLowerCase();
    if (!a) return false;
    if (/^(no|n|false|0)$/.test(a)) return true;
    return /\b(absent|absence|no[\s-]?show|noshow|did not attend)\b/.test(a);
  }

  function attendanceIsPresent(attendance) {
    var a = clean(attendance).toLowerCase();
    if (!a) return false;
    if (attendanceIsAbsent(a)) return false;
    return /\b(present|attended|yes|y|true|1)\b/.test(a) || a === "present";
  }

  function isoInList(iso, list) {
    var d = cleanIso(iso);
    if (!d || !Array.isArray(list)) return false;
    for (var i = 0; i < list.length; i++) {
      if (cleanIso(list[i]) === d) return true;
    }
    return false;
  }

  function overrideIsAbsent(overrideType) {
    var t = clean(overrideType).toLowerCase();
    return (
      t === "client_absence_announced" ||
      t === "client_absence" ||
      t === "slot_clear_client" ||
      /\babsence\b/.test(t)
    );
  }

  function overrideIsCancel(overrideType) {
    var t = clean(overrideType).toLowerCase();
    return t === "slot_close" || t === "club_cancel" || t === "cancelled";
  }

  /**
   * @param {object} input
   * @returns {{ status: string, label: string, endedByClock: boolean }}
   */
  function resolve(input) {
    input = input || {};
    var iso = cleanIso(input.iso);
    var now = input.now instanceof Date ? input.now : new Date();
    var todayIso =
      cleanIso(input.todayIso) ||
      [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
      ].join("-");
    var nowMins =
      input.nowMinutes != null
        ? Number(input.nowMinutes)
        : now.getHours() * 60 + now.getMinutes();
    var endM = input.endMinutes != null ? Number(input.endMinutes) : null;
    var endedByClock =
      !!iso && iso === todayIso && endM != null && Number.isFinite(endM) && nowMins >= endM;

    if (
      overrideIsAbsent(input.overrideType) ||
      attendanceIsAbsent(input.attendance) ||
      isoInList(iso, input.absentDates) ||
      input.parentAbsenceReported === true
    ) {
      return { status: "absent", label: "Absent", endedByClock: endedByClock };
    }

    if (
      overrideIsCancel(input.overrideType) ||
      isoInList(iso, input.cancelledDates) ||
      input.clubCancelled === true
    ) {
      return { status: "cancelled", label: "Cancelled", endedByClock: endedByClock };
    }

    if (input.notEnrolled === true) {
      return { status: "not_enrolled", label: "Not re-enrolled", endedByClock: endedByClock };
    }

    var feedbackSubmitted = input.feedbackSubmitted === true;
    var present = attendanceIsPresent(input.attendance);

    if (feedbackSubmitted && !attendanceIsAbsent(input.attendance)) {
      return { status: "completed", label: "Session completed", endedByClock: endedByClock };
    }
    if (present) {
      return { status: "completed", label: "Session completed", endedByClock: endedByClock };
    }

    if (endedByClock || input.sessionEnded === true) {
      return {
        status: "awaiting_feedback",
        label: "Awaiting feedback",
        endedByClock: true,
      };
    }

    return { status: "scheduled", label: "Scheduled", endedByClock: false };
  }

  var api = {
    resolve: resolve,
    attendanceIsAbsent: attendanceIsAbsent,
    attendanceIsPresent: attendanceIsPresent,
  };

  global.PortalSessionStatus = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
