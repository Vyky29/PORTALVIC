/**
 * Venue Report reminder schedule (opening/closing) for staff dashboard.
 * Opening: reminder if not submitted by openEnd (service start − 5 min, unless fixed below).
 * Closing: reminder if not submitted by closeEnd (service end + 15 min, unless fixed below).
 */
(function (global) {
  "use strict";

  var OPEN_GRACE_MIN = 5;
  var CLOSE_GRACE_MIN = 15;

  function mins(h, m) {
    return h * 60 + (m || 0);
  }

  function normStaffId(id) {
    return String(id || "")
      .trim()
      .toLowerCase();
  }

  function normDayName(day) {
    return String(day || "").trim();
  }

  function dowFromDayName(dayName) {
    var map = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };
    return map[normDayName(dayName)];
  }

  function isDayCentreRow(s) {
    if (!s) return false;
    var blob =
      String(s.rosterService || s.service || s.activity || "") +
      " " +
      String(s.feedbackUnitKey || "");
    return /day\s*centre/i.test(blob) || blob.indexOf("day_centre") >= 0;
  }

  function staffHasRosterOnDay(staffId, dayName, sessionsModel) {
    var id = normStaffId(staffId);
    var day = normDayName(dayName);
    if (!id || !day || !Array.isArray(sessionsModel)) return false;
    for (var i = 0; i < sessionsModel.length; i++) {
      var s = sessionsModel[i];
      if (!s) continue;
      if (normStaffId(s.staffId) !== id) continue;
      if (normDayName(s.day) !== day) continue;
      return true;
    }
    return false;
  }

  function staffOnVenueRoster(staffId, dayName, venueNeedle, sessionsModel) {
    var id = normStaffId(staffId);
    var day = normDayName(dayName);
    var needle = String(venueNeedle || "")
      .trim()
      .toLowerCase();
    if (!id || !day || !needle || !Array.isArray(sessionsModel)) return false;
    for (var i = 0; i < sessionsModel.length; i++) {
      var s = sessionsModel[i];
      if (!s || normStaffId(s.staffId) !== id || normDayName(s.day) !== day) continue;
      var v = String(s.venue || "")
        .trim()
        .toLowerCase();
      if (v.indexOf(needle) >= 0) return true;
    }
    return false;
  }

  function dayHasDayCentreSessions(dayName, sessionsModel) {
    var day = normDayName(dayName);
    if (!day || !Array.isArray(sessionsModel)) return false;
    for (var i = 0; i < sessionsModel.length; i++) {
      var s = sessionsModel[i];
      if (!s || normDayName(s.day) !== day) continue;
      if (isDayCentreRow(s)) return true;
    }
    return false;
  }
  function staffOnDayCentreRoster(staffId, dayName, sessionsModel) {
    var id = normStaffId(staffId);
    var day = normDayName(dayName);
    if (!id || !day || !Array.isArray(sessionsModel)) return false;
    for (var i = 0; i < sessionsModel.length; i++) {
      var s = sessionsModel[i];
      if (!s) continue;
      if (normStaffId(s.staffId) !== id) continue;
      if (normDayName(s.day) !== day) continue;
      if (isDayCentreRow(s)) return true;
    }
    return false;
  }

  /** Earliest Day Centre session start (minutes) for staff on this day, or null. */
  function dayCentreEarliestStartMin(staffId, dayName, sessionsModel, parseStartMin) {
    var id = normStaffId(staffId);
    var day = normDayName(dayName);
    var best = null;
    if (!Array.isArray(sessionsModel)) return null;
    for (var i = 0; i < sessionsModel.length; i++) {
      var s = sessionsModel[i];
      if (!s || normStaffId(s.staffId) !== id || normDayName(s.day) !== day) continue;
      if (!isDayCentreRow(s)) continue;
      var sm =
        typeof parseStartMin === "function"
          ? parseStartMin(s.start)
          : null;
      if (sm == null || !Number.isFinite(sm)) continue;
      if (best == null || sm < best) best = sm;
    }
    return best;
  }

  /** Day Centre SwimFarm — opening Mon/Tue/Wed/Fri; closing per assignee below. */
  var DAY_CENTRE = {
    venue: "SwimFarm",
    label: "Day Centre",
    openDows: [1, 2, 3, 5],
    openByDow: {
      1: { serviceStart: mins(11, 0), openEnd: mins(10, 55) },
      2: { serviceStart: mins(12, 30), openEnd: mins(12, 25) },
      3: { serviceStart: mins(11, 0), openEnd: mins(10, 55) },
      5: { serviceStart: mins(11, 0), openEnd: mins(10, 55) },
    },
    closeByDow: {
      1: { serviceEnd: mins(18, 30), closeEnd: mins(18, 45) },
      2: { serviceEnd: mins(15, 0), closeEnd: mins(15, 15) },
      3: { serviceEnd: mins(18, 30), closeEnd: mins(18, 45) },
      5: { serviceEnd: mins(18, 30), closeEnd: mins(18, 45) },
    },
  };

  /** Thursday Day Centre — Roberto opening; legacy closing until Victor handover. */
  var ROBERTO_THU = {
    venue: "SwimFarm",
    label: "Day Centre (Thu)",
    openEnd: mins(12, 25),
    closeEnd: mins(15, 15),
    serviceStart: mins(12, 30),
    serviceEnd: mins(15, 0),
  };

  /** Thursday SwimFarm — Victor closing from 2026-06-19 (last bespoke block ~5pm). */
  var VICTOR_THU_CLOSE_FROM_ISO = "2026-06-19";
  var VICTOR_THU = {
    venue: "SwimFarm",
    label: "SwimFarm (Thu)",
    closeEnd: mins(17, 15),
    serviceEnd: mins(17, 0),
  };

  /** Berta — Acton Wednesday (afternoon). */
  var BERTA_WED_ACTON = {
    venue: "Acton",
    label: "Acton (Wed)",
    openEnd: mins(16, 25),
    closeEnd: mins(18, 45),
    serviceStart: mins(16, 30),
    serviceEnd: mins(18, 30),
  };

  /** Sunday pool — per-person windows. */
  var SUNDAY = {
    roberto: {
      venue: "SwimFarm",
      label: "Sunday pool (Roberto)",
      openEnd: mins(8, 55),
      closeEnd: mins(15, 30),
      serviceStart: mins(9, 0),
      serviceEnd: mins(15, 15),
    },
    berta: {
      venue: "SwimFarm",
      label: "Sunday SwimFarm (Berta)",
      openEnd: mins(9, 25),
      closeEnd: mins(14, 30),
      serviceStart: mins(9, 30),
      serviceEnd: mins(14, 15),
    },
    john: {
      venue: "SwimFarm",
      label: "Sunday bespoke (John)",
      openEnd: mins(9, 20),
      closeEnd: mins(14, 45),
      serviceStart: mins(9, 25),
      serviceEnd: mins(14, 30),
    },
  };

  var CLOSING_ASSIGNEES = {
    john: { dows: [1, 3, 5], slot: "day_centre" },
    michelle: { dows: [2], slot: "day_centre" },
    roberto: { sun: "roberto" },
    victor: { dows: [4], slot: "victor_thu" },
    berta: { wedActon: true, sun: "berta" },
  };

  function normViewDateIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function victorThuSwimFarmClosingActive(viewDateIso) {
    var iso = normViewDateIso(viewDateIso);
    if (!iso) {
      try {
        var now = new Date();
        iso =
          now.getFullYear() +
          "-" +
          String(now.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(now.getDate()).padStart(2, "0");
      } catch (_e) {
        return false;
      }
    }
    return iso >= VICTOR_THU_CLOSE_FROM_ISO;
  }

  function openingDuty(staffId, dow, dayName, sessionsModel, parseStartMin) {
    var id = normStaffId(staffId);
    if (dow == null) dow = dowFromDayName(dayName);

    if (id === "roberto" && dow === 4 && staffOnDayCentreRoster(id, dayName, sessionsModel)) {
      return {
        kind: "open",
        scopeKey: "roberto_thu_open",
        venue: ROBERTO_THU.venue,
        label: ROBERTO_THU.label,
        openEnd: ROBERTO_THU.openEnd,
      };
    }

    if (id === "berta" && dow === 3 && staffOnVenueRoster(id, dayName, "acton", sessionsModel)) {
      return {
        kind: "open",
        scopeKey: "berta_wed_acton_open",
        venue: BERTA_WED_ACTON.venue,
        label: BERTA_WED_ACTON.label,
        openEnd: BERTA_WED_ACTON.openEnd,
      };
    }

    if (dow === 0) {
      if (id === "roberto" && staffHasRosterOnDay(id, dayName, sessionsModel)) {
        return {
          kind: "open",
          scopeKey: "sun_roberto_open",
          venue: SUNDAY.roberto.venue,
          label: SUNDAY.roberto.label,
          openEnd: SUNDAY.roberto.openEnd,
        };
      }
      if (id === "berta" && staffOnVenueRoster(id, dayName, "swimfarm", sessionsModel)) {
        return {
          kind: "open",
          scopeKey: "sun_berta_open",
          venue: SUNDAY.berta.venue,
          label: SUNDAY.berta.label,
          openEnd: SUNDAY.berta.openEnd,
        };
      }
      if (id === "john" && staffHasRosterOnDay(id, dayName, sessionsModel)) {
        return {
          kind: "open",
          scopeKey: "sun_john_open",
          venue: SUNDAY.john.venue,
          label: SUNDAY.john.label,
          openEnd: SUNDAY.john.openEnd,
        };
      }
      return null;
    }

    if (DAY_CENTRE.openDows.indexOf(dow) < 0) return null;
    if (!staffOnDayCentreRoster(id, dayName, sessionsModel)) return null;

    var cfg = DAY_CENTRE.openByDow[dow];
    if (!cfg) return null;

    var earliest = dayCentreEarliestStartMin(id, dayName, sessionsModel, parseStartMin);
    if (earliest != null && earliest > cfg.serviceStart + 30) return null;

    return {
      kind: "open",
      scopeKey: "day_centre_open_" + dow,
      venue: DAY_CENTRE.venue,
      label: DAY_CENTRE.label,
      openEnd: cfg.openEnd,
    };
  }

  function closingDuty(staffId, dow, dayName, sessionsModel, viewDateIso) {
    var id = normStaffId(staffId);
    if (dow == null) dow = dowFromDayName(dayName);
    var victorThuClose = victorThuSwimFarmClosingActive(viewDateIso);

    if (id === "john") {
      if (dow === 0 && staffHasRosterOnDay(id, dayName, sessionsModel)) {
        return {
          kind: "close",
          scopeKey: "sun_john_close",
          venue: SUNDAY.john.venue,
          label: SUNDAY.john.label,
          closeEnd: SUNDAY.john.closeEnd,
        };
      }
      if (
        CLOSING_ASSIGNEES.john.dows.indexOf(dow) >= 0 &&
        staffHasRosterOnDay(id, dayName, sessionsModel) &&
        dayHasDayCentreSessions(dayName, sessionsModel)
      ) {
        var cc = DAY_CENTRE.closeByDow[dow];
        if (!cc) return null;
        return {
          kind: "close",
          scopeKey: "day_centre_close_" + dow,
          venue: DAY_CENTRE.venue,
          label: DAY_CENTRE.label,
          closeEnd: cc.closeEnd,
        };
      }
    }

    if (id === "michelle" && dow === 2 && staffOnDayCentreRoster(id, dayName, sessionsModel)) {
      return {
        kind: "close",
        scopeKey: "day_centre_close_2",
        venue: DAY_CENTRE.venue,
        label: DAY_CENTRE.label,
        closeEnd: DAY_CENTRE.closeByDow[2].closeEnd,
      };
    }

    if (id === "roberto") {
      if (
        !victorThuClose &&
        dow === 4 &&
        staffOnDayCentreRoster(id, dayName, sessionsModel)
      ) {
        return {
          kind: "close",
          scopeKey: "roberto_thu_close",
          venue: ROBERTO_THU.venue,
          label: ROBERTO_THU.label,
          closeEnd: ROBERTO_THU.closeEnd,
        };
      }
      if (dow === 0 && staffHasRosterOnDay(id, dayName, sessionsModel)) {
        return {
          kind: "close",
          scopeKey: "sun_roberto_close",
          venue: SUNDAY.roberto.venue,
          label: SUNDAY.roberto.label,
          closeEnd: SUNDAY.roberto.closeEnd,
        };
      }
    }

    if (
      id === "victor" &&
      victorThuClose &&
      dow === 4 &&
      staffOnVenueRoster(id, dayName, "swimfarm", sessionsModel)
    ) {
      return {
        kind: "close",
        scopeKey: "victor_thu_close",
        venue: VICTOR_THU.venue,
        label: VICTOR_THU.label,
        closeEnd: VICTOR_THU.closeEnd,
      };
    }

    if (id === "berta") {
      if (dow === 3 && staffOnVenueRoster(id, dayName, "acton", sessionsModel)) {
        return {
          kind: "close",
          scopeKey: "berta_wed_acton_close",
          venue: BERTA_WED_ACTON.venue,
          label: BERTA_WED_ACTON.label,
          closeEnd: BERTA_WED_ACTON.closeEnd,
        };
      }
      if (dow === 0 && staffOnVenueRoster(id, dayName, "swimfarm", sessionsModel)) {
        return {
          kind: "close",
          scopeKey: "sun_berta_close",
          venue: SUNDAY.berta.venue,
          label: SUNDAY.berta.label,
          closeEnd: SUNDAY.berta.closeEnd,
        };
      }
    }

    return null;
  }

  /**
   * @returns {{ opening: object|null, closing: object|null }}
   */
  function portalVenueReportDutyForStaff(staffId, ctx) {
    ctx = ctx || {};
    var dayName =
      ctx.viewDay ||
      ctx.dayName ||
      (typeof ctx.demoViewDay !== "undefined" ? ctx.demoViewDay : "");
    var dow = ctx.dow != null ? ctx.dow : dowFromDayName(dayName);
    var sessionsModel = ctx.sessionsModel || [];
    var parseStartMin = ctx.parseStartMin || null;
    var viewDateIso = normViewDateIso(ctx.viewDateIso);

    return {
      opening: openingDuty(staffId, dow, dayName, sessionsModel, parseStartMin),
      closing: closingDuty(staffId, dow, dayName, sessionsModel, viewDateIso),
    };
  }

  function portalVenueReportScopeApplies(staffId, ctx) {
    if (!ctx || !ctx.hasShiftToday) return false;
    var duty = portalVenueReportDutyForStaff(staffId, ctx);
    return !!(duty.opening || duty.closing);
  }

  function portalVenueTimeWindowsForStaff(staffId, ctx) {
    var duty = portalVenueReportDutyForStaff(staffId, ctx);
    if (!duty.opening && !duty.closing) return null;
    var openEnd = duty.opening ? duty.opening.openEnd : null;
    var closeEnd = duty.closing ? duty.closing.closeEnd : null;
    var venue =
      (duty.opening && duty.opening.venue) ||
      (duty.closing && duty.closing.venue) ||
      "";
    var scopeKey =
      (duty.opening && duty.opening.scopeKey) ||
      (duty.closing && duty.closing.scopeKey) ||
      "venue";
    return {
      label: scopeKey,
      venue: venue,
      openEnd: openEnd,
      closeEnd: closeEnd,
      opening: duty.opening,
      closing: duty.closing,
    };
  }

  function portalVenueLocalScopeSlug(windows) {
    if (!windows) return "";
    return String(windows.label || windows.venue || "venue")
      .replace(/[^a-z0-9]+/gi, "_")
      .slice(0, 64);
  }

  var api = {
    OPEN_GRACE_MIN: OPEN_GRACE_MIN,
    CLOSE_GRACE_MIN: CLOSE_GRACE_MIN,
    DAY_CENTRE: DAY_CENTRE,
    portalVenueReportDutyForStaff: portalVenueReportDutyForStaff,
    portalVenueReportScopeApplies: portalVenueReportScopeApplies,
    portalVenueTimeWindowsForStaff: portalVenueTimeWindowsForStaff,
    portalVenueLocalScopeSlug: portalVenueLocalScopeSlug,
    staffOnDayCentreRoster: staffOnDayCentreRoster,
    staffHasRosterOnDay: staffHasRosterOnDay,
    staffOnVenueRoster: staffOnVenueRoster,
  };

  global.PortalVenueReportSchedule = api;
})(typeof window !== "undefined" ? window : globalThis);
