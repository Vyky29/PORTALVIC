/**
 * Staff live map — share GPS only around today's roster shift:
 * from 15 minutes before first session until 30 minutes after last session.
 */
(function (global) {
  "use strict";

  var BEFORE_MS = 15 * 60 * 1000;
  var AFTER_MS = 30 * 60 * 1000;

  function localTodayIso() {
    var d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
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

  function sessionsForCalendarToday(sessionsModel) {
    var todayIso = localTodayIso();
    var todayDow = new Date().toLocaleDateString("en-GB", { weekday: "long" });
    return (sessionsModel || []).filter(function (s) {
      if (!s || s.clientId === "closed") return false;
      if (!s.start || !s.end) return false;
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

  /**
   * @param {Record<string, unknown> | null | undefined} profile
   * @param {import("@supabase/supabase-js").User | null | undefined} authUser
   */
  function portalLiveMapShiftWindowState(profile, authUser) {
    var todayIso = localTodayIso();
    var bootFn = global.portalBootstrapStaffRosterFromProfile;
    var bootWrap =
      typeof bootFn === "function" ? bootFn(profile || null, authUser || null) : null;

    if (!bootWrap || !bootWrap.boot) {
      return {
        allowed: false,
        reason: "no_roster",
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
      };
    }

    var todaySessions = sessionsForCalendarToday(bootWrap.boot.sessionsModel);
    if (!todaySessions.length) {
      return {
        allowed: false,
        reason: "no_shift_today",
        staffId: bootWrap.staffId,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
      };
    }

    var bounds = shiftBoundsFromSessions(todaySessions, todayIso);
    if (!bounds) {
      return {
        allowed: false,
        reason: "invalid_shift_times",
        staffId: bootWrap.staffId,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
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
      staffId: bootWrap.staffId,
      todayIso: todayIso,
      shiftStartMs: bounds.shiftStartMs,
      shiftEndMs: bounds.shiftEndMs,
      windowStartMs: windowStartMs,
      windowEndMs: windowEndMs,
      sessionCount: todaySessions.length,
    };
  }

  /** Ms until the next boundary (window open or close); minimum 15s. */
  function portalLiveMapMsUntilShiftBoundary(state) {
    if (!state || state.windowStartMs == null || state.windowEndMs == null) {
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
  global.portalLiveMapMsUntilShiftBoundary = portalLiveMapMsUntilShiftBoundary;
  global.PORTAL_LIVE_MAP_SHIFT_BEFORE_MS = BEFORE_MS;
  global.PORTAL_LIVE_MAP_SHIFT_AFTER_MS = AFTER_MS;
})(typeof window !== "undefined" ? window : globalThis);
