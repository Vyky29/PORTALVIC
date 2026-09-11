/**
 * Canonical term calendar 2026/27 — programme-aware closed days.
 *
 * Day Centre: open Mon–Fri through October half term.
 * After-school + weekend: closed 24 Oct – 1 Nov (half term + flanking weekends).
 *
 * Consumed by Parent, Booking, Staff/Overview closed-day checks.
 */
(function (global) {
  "use strict";

  var AUTUMN_2026 = {
    id: "autumn_2026",
    name: "Autumn Term",
    start: "2026-09-01",
    afterSchoolStart: "2026-09-05",
    weekdayAfterSchoolStart: "2026-09-07",
    end: "2026-12-18",
    christmasClosed: { from: "2026-12-19", to: "2027-01-03" },
  };

  var SPRING_2027 = {
    id: "spring_2027",
    name: "Spring Term",
    start: "2027-01-04",
    end: "2027-03-25",
    easterClosed: { from: "2027-03-26", to: "2027-04-11" },
  };

  var SUMMER_2027 = {
    id: "summer_2027",
    name: "Summer Term",
    start: "2027-04-12",
    end: "2027-07-30",
  };

  /** After-school + weekend: half-term week and flanking weekends. */
  var AFTER_SCHOOL_HALF_TERM_2026 = { from: "2026-10-24", to: "2026-11-01", reason: "half_term" };

  /** Weekend-only closures around half terms (Day Centre does not run weekends). */
  var WEEKEND_CLOSURES = [
    { from: "2026-10-24", to: "2026-10-25", reason: "half_term_weekend" },
    { from: "2026-10-31", to: "2026-11-01", reason: "half_term_weekend" },
    { from: "2027-02-13", to: "2027-02-14", reason: "half_term_weekend" },
    { from: "2027-02-20", to: "2027-02-21", reason: "half_term_weekend" },
    { from: "2027-05-29", to: "2027-05-30", reason: "half_term_weekend" },
    { from: "2027-06-05", to: "2027-06-06", reason: "half_term_weekend" },
  ];

  /** Single club-closed days (bank holidays etc.). */
  var CLUB_CLOSED_SINGLES = ["2027-05-03"];

  var TERMS = [AUTUMN_2026, SPRING_2027, SUMMER_2027];

  function cleanIso(iso) {
    var s = String(iso || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function inRange(iso, from, to) {
    if (!iso || !from || !to) return false;
    return iso >= from && iso <= to;
  }

  function inAnyRange(iso, ranges) {
    for (var i = 0; i < (ranges || []).length; i++) {
      var r = ranges[i];
      if (r && inRange(iso, r.from || r.start, r.to || r.end)) return true;
    }
    return false;
  }

  /**
   * @param {string} labelOrService
   * @returns {'day_centre'|'weekend'|'afterschool'}
   */
  function inferServiceKind(labelOrService) {
    var s = String(labelOrService || "").toLowerCase();
    if (/day\s*centre|day\s*center|\bdc\b/.test(s)) return "day_centre";
    if (/weekend|\bsaturday\b|\bsunday\b/.test(s)) return "weekend";
    return "afterschool";
  }

  function termWindow(termId) {
    var id = String(termId || "").trim();
    for (var i = 0; i < TERMS.length; i++) {
      if (TERMS[i].id === id) return TERMS[i];
    }
    return AUTUMN_2026;
  }

  /** Everyone closed: Christmas, Easter, bank holidays. */
  function isFullyClosedIso(iso) {
    var d = cleanIso(iso);
    if (!d) return false;
    for (var i = 0; i < TERMS.length; i++) {
      var t = TERMS[i];
      if (t.christmasClosed && inRange(d, t.christmasClosed.from, t.christmasClosed.to)) return true;
      if (t.easterClosed && inRange(d, t.easterClosed.from, t.easterClosed.to)) return true;
    }
    for (var j = 0; j < CLUB_CLOSED_SINGLES.length; j++) {
      if (d === CLUB_CLOSED_SINGLES[j]) return true;
    }
    return false;
  }

  function closedRangesForKind(serviceKind) {
    var kind = String(serviceKind || "afterschool").toLowerCase();
    var out = [];
    for (var i = 0; i < TERMS.length; i++) {
      var t = TERMS[i];
      if (t.christmasClosed) out.push(Object.assign({ reason: "christmas" }, t.christmasClosed));
      if (t.easterClosed) out.push(Object.assign({ reason: "easter" }, t.easterClosed));
    }
    if (kind === "day_centre") {
      WEEKEND_CLOSURES.forEach(function (r) {
        out.push(r);
      });
    } else {
      out.push(AFTER_SCHOOL_HALF_TERM_2026);
      /* Feb / May half-term weekends already in WEEKEND_CLOSURES; weekday AS HT TBD in later terms. */
      WEEKEND_CLOSURES.forEach(function (r) {
        if (r.from.indexOf("2026-10") === 0) return;
        out.push(r);
      });
    }
    CLUB_CLOSED_SINGLES.forEach(function (iso) {
      out.push({ from: iso, to: iso, reason: "bank_holiday" });
    });
    return out;
  }

  /**
   * @param {string} iso
   * @param {{ serviceKind?: string, label?: string }|string} [opts]
   */
  function isClosedIso(iso, opts) {
    var d = cleanIso(iso);
    if (!d) return false;
    if (isFullyClosedIso(d)) return true;
    var kind =
      typeof opts === "string"
        ? opts
        : (opts && opts.serviceKind) ||
          (opts && opts.label ? inferServiceKind(opts.label) : "afterschool");
    return inAnyRange(d, closedRangesForKind(kind));
  }

  function afterSchoolHalfTermWindow() {
    return {
      from: AFTER_SCHOOL_HALF_TERM_2026.from,
      to: AFTER_SCHOOL_HALF_TERM_2026.to,
    };
  }

  /** Booking-shaped calendars (start/end + closedRanges with start/end keys). */
  function bookingCalendarAfterSchool() {
    return {
      start: AUTUMN_2026.afterSchoolStart,
      end: AUTUMN_2026.end,
      closedRanges: [{ start: AFTER_SCHOOL_HALF_TERM_2026.from, end: AFTER_SCHOOL_HALF_TERM_2026.to }],
    };
  }

  function bookingCalendarDayCentre() {
    return {
      start: AUTUMN_2026.start,
      end: AUTUMN_2026.end,
      closedRanges: [],
    };
  }

  var api = {
    AUTUMN_2026: AUTUMN_2026,
    SPRING_2027: SPRING_2027,
    SUMMER_2027: SUMMER_2027,
    TERMS: TERMS,
    inferServiceKind: inferServiceKind,
    termWindow: termWindow,
    isFullyClosedIso: isFullyClosedIso,
    isClosedIso: isClosedIso,
    closedRanges: closedRangesForKind,
    afterSchoolHalfTermWindow: afterSchoolHalfTermWindow,
    bookingCalendarAfterSchool: bookingCalendarAfterSchool,
    bookingCalendarDayCentre: bookingCalendarDayCentre,
  };

  global.PortalTermCalendar = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
