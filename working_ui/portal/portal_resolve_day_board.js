/**
 * Option B1 — shared day-board core (admin / staff / timesheet / feedback).
 *
 * One truth for "which seats exist on this ISO" before audience paint:
 *   1. standing = capacity chain rows (Places + Services + Timetable) — already in STAFF_DASHBOARD_SOURCE
 *   2. dated overlays live in those rows (session_date === iso)
 *   3. schedule_overrides / unavailability stay caller-owned for now (Overview/Staff hydrate)
 *   4. exceptions = PortalRosterCanonical.applyCapacityChainDayExceptions (on chain resolve)
 *   5. PortalClientDayVisibility for client start / gone-from / Fadi
 *
 * Audience is a projection after the core (staffId filter, Timetable gate, no aquatic merge).
 * Feedback 20:30 Edge: applyFeedback2030BoardPolicy + B1c occupants gap-fill (roster → occupants → MADRE).
 */
(function (global) {
  "use strict";

  var AUTUMN_FROM = "2026-09-01";
  var TEMPLATE_START = "2026-04-13";
  var TEMPLATE_END = "2026-07-19";

  /** B1b + B1c landed — Edge portal_feedback_2030_match occupants gap-fill. */
  var FEEDBACK_2030_PENDING = "";

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function iso10(v) {
    var s = clean(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function normStaffTok(raw) {
    return clean(raw)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function weekdayLongFromIso(iso) {
    var d = iso10(iso);
    if (!d) return "";
    try {
      return new Date(d + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" });
    } catch (_) {
      return "";
    }
  }

  function dowKey(weekdayLong) {
    var w = clean(weekdayLong).toLowerCase();
    if (w.indexOf("mon") === 0) return "monday";
    if (w.indexOf("tue") === 0) return "tuesday";
    if (w.indexOf("wed") === 0) return "wednesday";
    if (w.indexOf("thu") === 0) return "thursday";
    if (w.indexOf("fri") === 0) return "friday";
    if (w.indexOf("sat") === 0) return "saturday";
    if (w.indexOf("sun") === 0) return "sunday";
    return w;
  }

  function rowDay(row, fallbackIso) {
    var d = clean(row && (row.day || row.weekday || row.weekday_long));
    if (d) return d;
    var sd = iso10(row && (row.session_date || row.sessionDate));
    return sd ? weekdayLongFromIso(sd) : fallbackIso ? weekdayLongFromIso(fallbackIso) : "";
  }

  function rowSessionDate(row) {
    return iso10(row && (row.session_date || row.sessionDate));
  }

  function autumnStaffHoursDoc() {
    try {
      return global.PORTAL_AUTUMN_STAFF_HOURS || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * true = named on Timetable that day;
   * false = Timetable day exists but not them;
   * null = unknown / no doc.
   */
  function workerOnAutumnTimetableIso(rosterKey, dateKey) {
    var doc = autumnStaffHoursDoc();
    var key = normStaffTok(rosterKey);
    var iso = iso10(dateKey);
    if (!doc || !key || !iso) return null;
    var hours = doc.staffHours || {};
    var dowKeys = Object.keys(hours);
    for (var d = 0; d < dowKeys.length; d++) {
      var dates = (hours[dowKeys[d]] && hours[dowKeys[d]].dates) || [];
      for (var i = 0; i < dates.length; i++) {
        var row = dates[i];
        if (iso10(row && row.date) !== iso) continue;
        var cells = (row && row.cells) || [];
        for (var c = 0; c < cells.length; c++) {
          var text = String((cells[c] && cells[c].text) || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          var tokens = text.split(/[^a-z0-9]+/).filter(Boolean);
          if (tokens.indexOf(key) >= 0 || tokens[0] === key) return true;
        }
        return false;
      }
    }
    return false;
  }

  /** Canonical Autumn standing stamp for a weekday (DC or weekend). */
  function canonicalStandingStampForDow(weekdayLong) {
    try {
      var PRC = global.PortalRosterCanonical;
      var dk = dowKey(weekdayLong);
      if (!dk || !PRC) return "";
      var dc = PRC.DAY_CENTRE_STANDING_ISO;
      if (dc && dc[dk]) return iso10(dc[dk]);
      var we = PRC.WEEKEND_STANDING_ISO;
      if (we && we[dk]) return iso10(we[dk]);
    } catch (_) {}
    return "";
  }

  /**
   * Latest standing snap ISO for this weekday from a row/session list.
   * Prefer WEEKEND_STANDING_ISO stamp when present in rows, else summer template window,
   * else latest Autumn dated same-DOW on/before anchorIso.
   */
  function standingSnapIsoForDow(rows, weekdayLong, opts) {
    opts = opts || {};
    var want = clean(weekdayLong);
    if (!want) return "";
    var anchor = iso10(opts.anchorIso || opts.dateKey || "");
    var list = Array.isArray(rows) ? rows : [];
    var weekendWant = canonicalStandingStampForDow(want);
    var bestSummer = "";
    var bestWeekend = "";
    var bestAutumnOrEqual = "";
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r) continue;
      if (clean(rowDay(r)) !== want && dowKey(rowDay(r)) !== dowKey(want)) continue;
      var sd = rowSessionDate(r);
      if (!sd) continue;
      if (sd >= TEMPLATE_START && sd <= TEMPLATE_END) {
        if (!bestSummer || sd > bestSummer) bestSummer = sd;
      }
      if (weekendWant && sd === weekendWant) bestWeekend = sd;
      if (anchor && sd <= anchor && sd >= AUTUMN_FROM) {
        if (!bestAutumnOrEqual || sd > bestAutumnOrEqual) bestAutumnOrEqual = sd;
      }
    }
    if (bestWeekend) return bestWeekend;
    if (weekendWant && !list.length) return weekendWant;
    if (bestSummer) return bestSummer;
    if (bestAutumnOrEqual) return bestAutumnOrEqual;
    return weekendWant || "";
  }

  function clientAllowed(name, iso) {
    var Vis = global.PortalClientDayVisibility;
    if (!Vis || typeof Vis.clientAllowedOnDate !== "function") return true;
    var n = clean(name);
    if (!n) return true;
    if (/^(no participant|open|closed|hold|cover needed|unassigned)$/i.test(n)) return true;
    return !!Vis.clientAllowedOnDate(n, iso);
  }

  function instructorMentionsStaff(instructorsRaw, staffKey) {
    var want = normStaffTok(staffKey);
    if (!want) return true;
    return String(instructorsRaw || "")
      .split(/,|\/|&|\band\b/gi)
      .some(function (part) {
        return normStaffTok(part) === want;
      });
  }

  function sourceRows(opts) {
    opts = opts || {};
    if (Array.isArray(opts.rows)) return opts.rows;
    var src = global.STAFF_DASHBOARD_SOURCE;
    return src && Array.isArray(src.rows) ? src.rows : [];
  }

  /**
   * Core seats for one calendar ISO (before paint).
   * @param {string} iso
   * @param {'admin'|'staff'|'timesheet'|'feedback'} audience
   * @param {{ rows?: any[], staffId?: string, applyVisibility?: boolean }} opts
   */
  function resolveDayBoard(iso, audience, opts) {
    opts = opts || {};
    var dateKey = iso10(iso);
    var aud = clean(audience || "admin").toLowerCase() || "admin";
    var rows = sourceRows(opts);
    var wd = weekdayLongFromIso(dateKey);
    var staffId = clean(opts.staffId || "");
    var applyVis = opts.applyVisibility !== false;
    var meta = {
      iso: dateKey,
      audience: aud,
      weekday: wd,
      snapIso: "",
      usedStanding: false,
      timetableGate: null,
      feedback2030Pending: FEEDBACK_2030_PENDING,
      sourceNote:
        (global.STAFF_DASHBOARD_SOURCE && global.STAFF_DASHBOARD_SOURCE.rosterSourceNote) || "",
    };
    if (!dateKey || !wd) {
      return { seats: [], meta: meta };
    }

    var exact = [];
    var sameDow = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r) continue;
      var rd = rowDay(r, dateKey);
      if (clean(rd) !== wd) continue;
      sameDow.push(r);
      if (rowSessionDate(r) === dateKey) exact.push(r);
    }

    var project = dateKey >= AUTUMN_FROM;
    var snapIso = project ? standingSnapIsoForDow(rows, wd, { anchorIso: dateKey }) : "";
    meta.snapIso = snapIso;
    var standing = [];
    if (project && snapIso && snapIso !== dateKey) {
      for (var s = 0; s < sameDow.length; s++) {
        if (rowSessionDate(sameDow[s]) === snapIso) standing.push(sameDow[s]);
      }
    }
    meta.usedStanding = standing.length > 0;

    /* Timesheet / staff: Timetable owns who works — do not invent later DOW from a dated cover. */
    if ((aud === "timesheet" || aud === "staff") && staffId && standing.length) {
      var onTt = workerOnAutumnTimetableIso(staffId, dateKey);
      meta.timetableGate = onTt;
      if (onTt === false) {
        standing = [];
        meta.usedStanding = false;
      }
    }

    var merged = exact.length ? exact.concat(standing) : standing.length ? standing : exact;
    /* Prefer exact-only when we have exact open seats (timesheet merge policy is caller-side).
       For admin core, keep exact + standing; callers dedupe. */
    if (aud === "timesheet" && exact.length) {
      merged = exact;
      /* If every exact is closed, fall back to standing — caller may re-merge; keep standing in meta. */
      var anyOpen = exact.some(function (row) {
        return String((row && row.status) || "").toLowerCase() !== "closed";
      });
      if (!anyOpen && standing.length) merged = standing;
      else if (anyOpen && standing.length && opts.mergeStandingWithExact) {
        merged = exact.concat(standing);
      }
    }

    var seats = [];
    var seen = Object.create(null);
    for (var m = 0; m < merged.length; m++) {
      var seat = merged[m];
      if (!seat) continue;
      if (staffId && !instructorMentionsStaff(seat.instructors || seat.staffId || seat.staff_name, staffId)) {
        continue;
      }
      var cname = seat.client_name || seat.clientName || seat.client || "";
      if (applyVis && !clientAllowed(cname, dateKey)) continue;
      var id =
        String(seat.id || "") ||
        [rowSessionDate(seat) || dateKey, clean(cname), clean(seat.time_slot || seat.timeSlot), clean(seat.instructors)].join("|");
      if (seen[id]) continue;
      seen[id] = 1;
      seats.push(seat);
    }

    return { seats: seats, meta: meta };
  }

  global.PortalResolveDayBoard = {
    AUTUMN_FROM: AUTUMN_FROM,
    TEMPLATE_START: TEMPLATE_START,
    TEMPLATE_END: TEMPLATE_END,
    FEEDBACK_2030_PENDING: FEEDBACK_2030_PENDING,
    workerOnAutumnTimetableIso: workerOnAutumnTimetableIso,
    canonicalStandingStampForDow: canonicalStandingStampForDow,
    standingSnapIsoForDow: standingSnapIsoForDow,
    resolveDayBoard: resolveDayBoard,
    weekdayLongFromIso: weekdayLongFromIso,
  };
})(typeof window !== "undefined" ? window : globalThis);
