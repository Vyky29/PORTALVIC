/**
 * Staff live map — share GPS around today's roster shift for all services:
 * from 15 minutes before first session until 15 minutes after last session.
 */
(function (global) {
  "use strict";

  var BEFORE_MS = 15 * 60 * 1000;
  var AFTER_MS = 15 * 60 * 1000;

  function localTodayIso() {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
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
    } catch (_) {}
    var dt = new Date();
    return (
      dt.getFullYear() +
      "-" +
      String(dt.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(dt.getDate()).padStart(2, "0")
    );
  }

  function hmToMsOnIso(iso, hm) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return NaN;
    var y = parseInt(p[0], 10);
    var mo = parseInt(p[1], 10) - 1;
    var da = parseInt(p[2], 10);
    var t = String(hm || "").split(":");
    var h = parseInt(t[0], 10);
    var m = parseInt(t[1], 10) || 0;
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(da) || !Number.isFinite(h)) return NaN;
    return new Date(y, mo, da, h, m, 0, 0).getTime();
  }

  function resolveStaffRosterKey(profile, authUser, bootWrap) {
    if (bootWrap && bootWrap.staffId) {
      return String(bootWrap.staffId).trim().toLowerCase();
    }
    var fn = global.portalPrimaryStaffRosterKey;
    if (typeof fn === "function") {
      var k = fn(profile, authUser);
      if (k) return String(k).trim().toLowerCase();
    }
    return "";
  }

  function sessionCountsForShiftWindow(s) {
    if (!s || s.clientId === "closed") return false;
    if (!s.start || !s.end) return false;
    return true;
  }

  function sessionsForCalendarToday(sessionsModel) {
    var todayIso = localTodayIso();
    var todayDow = new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      timeZone: "Europe/London",
    });
    return (sessionsModel || []).filter(function (s) {
      if (!sessionCountsForShiftWindow(s)) return false;
      var sd = String(s.session_date || "").slice(0, 10);
      if (sd) return sd === todayIso;
      return String(s.day || "") === todayDow;
    });
  }

  function shiftBoundsFromSessions(sessions, todayIso) {
    var minStart = Infinity;
    var maxEnd = -Infinity;
    sessions.forEach(function (s) {
      var startMs = hmToMsOnIso(todayIso, s.start);
      var endMs = hmToMsOnIso(todayIso, s.end);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
      if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
      if (startMs < minStart) minStart = startMs;
      if (endMs > maxEnd) maxEnd = endMs;
    });
    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) return null;
    return { shiftStartMs: minStart, shiftEndMs: maxEnd };
  }

  function bootWrapForProfile(profile, authUser) {
    var bootFn = global.portalBootstrapStaffRosterFromProfile;
    return typeof bootFn === "function" ? bootFn(profile || null, authUser || null) : null;
  }

  function todaySessionsForProfile(profile, authUser) {
    var bootWrap = bootWrapForProfile(profile, authUser);
    if (!bootWrap || !bootWrap.boot) return [];
    return sessionsForCalendarToday(bootWrap.boot.sessionsModel);
  }

  /**
   * Location permission is required when the worker has any rostered session today.
   */
  function portalLiveMapLocationRequiredForWorker(profile, authUser) {
    return todaySessionsForProfile(profile, authUser).length > 0;
  }

  function portalLiveMapLocationRequiredToday(profile, authUser) {
    return portalLiveMapLocationRequiredForWorker(profile, authUser);
  }

  function portalLiveMapShiftWindowState(profile, authUser) {
    var todayIso = localTodayIso();
    var bootWrap = bootWrapForProfile(profile, authUser);
    var staffKey = resolveStaffRosterKey(profile, authUser, bootWrap);
    var todaySessions = todaySessionsForProfile(profile, authUser);
    var locationRequired = todaySessions.length > 0;

    if (!todaySessions.length) {
      return {
        allowed: false,
        reason: "no_shift_today",
        locationRequired: false,
        staffId: staffKey || (bootWrap && bootWrap.staffId) || null,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
        sessionCount: 0,
      };
    }

    var bounds = shiftBoundsFromSessions(todaySessions, todayIso);
    if (!bounds) {
      return {
        allowed: false,
        reason: "invalid_shift_times",
        locationRequired: locationRequired,
        staffId: staffKey || (bootWrap && bootWrap.staffId) || null,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
        sessionCount: todaySessions.length,
      };
    }

    var windowStartMs = bounds.shiftStartMs - BEFORE_MS;
    var windowEndMs = bounds.shiftEndMs + AFTER_MS;
    var now = Date.now();
    var allowed = now >= windowStartMs && now <= windowEndMs;
    var reason = allowed
      ? "in_shift_window"
      : now < windowStartMs
        ? "before_shift_window"
        : "after_shift_window";

    return {
      allowed: allowed,
      reason: reason,
      locationRequired: locationRequired,
      staffId: staffKey || (bootWrap && bootWrap.staffId) || null,
      todayIso: todayIso,
      shiftStartMs: bounds.shiftStartMs,
      shiftEndMs: bounds.shiftEndMs,
      windowStartMs: windowStartMs,
      windowEndMs: windowEndMs,
      sessionCount: todaySessions.length,
    };
  }

  function portalLiveMapMsUntilShiftBoundary(state) {
    if (!state) return 60000;
    if (state.windowStartMs == null || state.windowEndMs == null) {
      return 60000;
    }
    var now = Date.now();
    if (now < state.windowStartMs) return Math.max(15000, state.windowStartMs - now);
    if (now <= state.windowEndMs) return Math.max(15000, state.windowEndMs - now + 1000);
    var tomorrow = new Date();
    tomorrow.setHours(24, 0, 5, 0);
    return Math.max(60000, tomorrow.getTime() - now);
  }

  global.portalLiveMapShiftWindowState = portalLiveMapShiftWindowState;
  global.portalLiveMapLocationRequiredForWorker = portalLiveMapLocationRequiredForWorker;
  global.portalLiveMapLocationRequiredToday = portalLiveMapLocationRequiredToday;
  global.portalLiveMapMsUntilShiftBoundary = portalLiveMapMsUntilShiftBoundary;
  global.PORTAL_LIVE_MAP_SHIFT_BEFORE_MS = BEFORE_MS;
  global.PORTAL_LIVE_MAP_SHIFT_AFTER_MS = AFTER_MS;
})(typeof window !== "undefined" ? window : globalThis);
