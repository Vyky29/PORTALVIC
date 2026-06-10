/**
 * Staff live map — share GPS around today's roster shift:
 * from 15 minutes before first session until 15 minutes after last session,
 * and until session feedback is submitted when still pending.
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

  function portalWorkerPendingSessionFeedback() {
    try {
      if (typeof global.portalReminderState === "function") {
        var st = global.portalReminderState();
        return !!(st && st.sessionFeedbackNeed);
      }
    } catch (_) {}
    return false;
  }

  /**
   * True when the worker must enable Location in Settings (any shift today or pending feedback).
   * @param {Record<string, unknown> | null | undefined} profile
   * @param {import("@supabase/supabase-js").User | null | undefined} authUser
   */
  function portalLiveMapLocationRequiredForWorker(profile, authUser) {
    if (portalWorkerPendingSessionFeedback()) return true;
    return portalLiveMapLocationRequiredToday(profile, authUser);
  }

  /**
   * True when the worker has a rostered session on today's calendar.
   * @param {Record<string, unknown> | null | undefined} profile
   * @param {import("@supabase/supabase-js").User | null | undefined} authUser
   */
  function portalLiveMapLocationRequiredToday(profile, authUser) {
    var bootFn = global.portalBootstrapStaffRosterFromProfile;
    var bootWrap =
      typeof bootFn === "function" ? bootFn(profile || null, authUser || null) : null;
    if (!bootWrap || !bootWrap.boot) return false;
    var todaySessions = sessionsForCalendarToday(bootWrap.boot.sessionsModel);
    return todaySessions.length > 0;
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
    var staffKey = resolveStaffRosterKey(profile, authUser, bootWrap);
    var pendingFeedback = portalWorkerPendingSessionFeedback();

    if (!bootWrap || !bootWrap.boot) {
      return {
        allowed: pendingFeedback,
        reason: pendingFeedback ? "pending_feedback_no_roster" : "no_roster",
        locationRequired: pendingFeedback,
        staffId: staffKey || null,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
        pendingFeedback: pendingFeedback,
      };
    }

    var todaySessions = sessionsForCalendarToday(bootWrap.boot.sessionsModel);
    var locationRequired = todaySessions.length > 0 || pendingFeedback;

    if (!todaySessions.length) {
      return {
        allowed: pendingFeedback,
        reason: pendingFeedback ? "pending_feedback_only" : "no_shift_today",
        locationRequired: locationRequired,
        staffId: staffKey || bootWrap.staffId,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
        pendingFeedback: pendingFeedback,
      };
    }

    var bounds = shiftBoundsFromSessions(todaySessions, todayIso);
    if (!bounds) {
      return {
        allowed: pendingFeedback,
        reason: pendingFeedback ? "pending_feedback_invalid_shift" : "invalid_shift_times",
        staffId: staffKey || bootWrap.staffId,
        locationRequired: locationRequired,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
        pendingFeedback: pendingFeedback,
      };
    }

    var windowStartMs = bounds.shiftStartMs - BEFORE_MS;
    var windowEndMs = bounds.shiftEndMs + AFTER_MS;
    var now = Date.now();
    var inShiftWindow = now >= windowStartMs && now <= windowEndMs;
    var feedbackExtension = pendingFeedback && now >= windowStartMs && now > windowEndMs;
    var allowed = inShiftWindow || feedbackExtension;
    var reason = allowed
      ? feedbackExtension
        ? "pending_feedback"
        : "in_shift_window"
      : now < windowStartMs
        ? "before_shift_window"
        : pendingFeedback
          ? "after_shift_pending_feedback"
          : "after_shift_window";

    return {
      allowed: allowed,
      reason: reason,
      locationRequired: locationRequired,
      staffId: staffKey || bootWrap.staffId,
      todayIso: todayIso,
      shiftStartMs: bounds.shiftStartMs,
      shiftEndMs: bounds.shiftEndMs,
      windowStartMs: windowStartMs,
      windowEndMs: windowEndMs,
      sessionCount: todaySessions.length,
      pendingFeedback: pendingFeedback,
    };
  }

  /** Ms until the next boundary (window open or close); minimum 15s. */
  function portalLiveMapMsUntilShiftBoundary(state) {
    if (!state) return 60000;
    if (state.pendingFeedback && state.allowed) {
      return 120000;
    }
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
  global.portalWorkerPendingSessionFeedback = portalWorkerPendingSessionFeedback;
  global.PORTAL_LIVE_MAP_SHIFT_BEFORE_MS = BEFORE_MS;
  global.PORTAL_LIVE_MAP_SHIFT_AFTER_MS = AFTER_MS;
})(typeof window !== "undefined" ? window : globalThis);
