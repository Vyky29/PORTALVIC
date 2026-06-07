/**
 * Staff live map — share GPS only around today's roster shift:
 * from 10 minutes before first session until 30 minutes after last session.
 *
 * Mandatory live-map staff (location block in Settings + shift GPS):
 * - Leads: Berta, John, Michelle
 * - Day Centre: Youssef, Lulia, Michelle, Raul, Victor
 * - Bespoke support: John, Giuseppe, Bismark, Godsway
 * - Climbing: Alex, Carlos, Andres, Javi
 */
(function (global) {
  "use strict";

  var BEFORE_MS = 10 * 60 * 1000;
  var AFTER_MS = 30 * 60 * 1000;

  /** Roster keys (staffProfiles) with mandatory location sharing when on shift. */
  var PORTAL_LIVE_MAP_MANDATORY_STAFF = {
    berta: true,
    john: true,
    michelle: true,
    youssef: true,
    lulia: true,
    raul: true,
    victor: true,
    giuseppe: true,
    bismark: true,
    godsway: true,
    alex: true,
    carlos: true,
    andres: true,
    javi: true,
  };

  /** Leads: any rostered session today counts for the shift window (not only bespoke/day centre). */
  var PORTAL_LIVE_MAP_LEAD_STAFF = {
    berta: true,
    john: true,
    michelle: true,
  };

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

  function portalLiveMapMandatoryStaff(profile, authUser, bootWrap) {
    var key = resolveStaffRosterKey(profile, authUser, bootWrap);
    return !!(key && PORTAL_LIVE_MAP_MANDATORY_STAFF[key]);
  }

  function sessionQualifiesForLiveLocation(s) {
    var svc = String(
      (s && (s.service || s.serviceName || s.programme)) || ""
    ).toLowerCase();
    return (
      svc.indexOf("bespoke") !== -1 ||
      svc.indexOf("day centre") !== -1 ||
      svc.indexOf("day center") !== -1 ||
      svc.indexOf("climbing") !== -1
    );
  }

  /** Shift-window sessions: bespoke, day centre, climbing; leads also count any client session. */
  function sessionQualifiesForLiveLocationShift(s, staffKey) {
    if (sessionQualifiesForLiveLocation(s)) return true;
    if (!staffKey || !PORTAL_LIVE_MAP_LEAD_STAFF[staffKey]) return false;
    if (!s || s.clientId === "closed" || !s.start || !s.end) return false;
    var cid = String(s.clientId || s.clientSlug || "").trim().toLowerCase();
    if (!cid || cid === "available" || cid === "noclient" || cid === "no client") return false;
    return true;
  }

  function sessionsForCalendarToday(sessionsModel) {
    var todayIso = localTodayIso();
    var todayDow = new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      timeZone: "Europe/London",
    });
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
   * True when the worker must enable Location in Settings (mandatory list or qualifying roster).
   * @param {Record<string, unknown> | null | undefined} profile
   * @param {import("@supabase/supabase-js").User | null | undefined} authUser
   */
  function portalLiveMapLocationRequiredForWorker(profile, authUser) {
    var bootFn = global.portalBootstrapStaffRosterFromProfile;
    var bootWrap =
      typeof bootFn === "function" ? bootFn(profile || null, authUser || null) : null;
    if (portalLiveMapMandatoryStaff(profile, authUser, bootWrap)) return true;
    if (!bootWrap || !bootWrap.boot) return false;
    var model = bootWrap.boot.sessionsModel || [];
    for (var i = 0; i < model.length; i++) {
      var s = model[i];
      if (!s || s.clientId === "closed") continue;
      if (!s.start || !s.end) continue;
      if (sessionQualifiesForLiveLocation(s)) return true;
    }
    return false;
  }

  /**
   * True when the worker has a qualifying session on today's calendar rota.
   * @param {Record<string, unknown> | null | undefined} profile
   * @param {import("@supabase/supabase-js").User | null | undefined} authUser
   */
  function portalLiveMapLocationRequiredToday(profile, authUser) {
    var bootFn = global.portalBootstrapStaffRosterFromProfile;
    var bootWrap =
      typeof bootFn === "function" ? bootFn(profile || null, authUser || null) : null;
    if (!bootWrap || !bootWrap.boot) return false;
    var staffKey = resolveStaffRosterKey(profile, authUser, bootWrap);
    var todaySessions = sessionsForCalendarToday(bootWrap.boot.sessionsModel);
    return todaySessions.some(function (s) {
      return sessionQualifiesForLiveLocationShift(s, staffKey);
    });
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
    var mandatory = portalLiveMapMandatoryStaff(profile, authUser, bootWrap);

    if (!bootWrap || !bootWrap.boot) {
      return {
        allowed: false,
        reason: mandatory ? "no_roster_mandatory" : "no_roster",
        locationRequired: mandatory,
        staffId: staffKey || null,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
      };
    }

    var todaySessions = sessionsForCalendarToday(bootWrap.boot.sessionsModel);
    var qualifyingSessions = todaySessions.filter(function (s) {
      return sessionQualifiesForLiveLocationShift(s, staffKey);
    });
    var locationRequired = mandatory || qualifyingSessions.length > 0;

    if (!todaySessions.length) {
      return {
        allowed: false,
        reason: "no_shift_today",
        locationRequired: mandatory,
        staffId: staffKey || bootWrap.staffId,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
      };
    }

    if (!qualifyingSessions.length) {
      return {
        allowed: false,
        reason: mandatory ? "no_qualifying_shift_today" : "location_not_required",
        locationRequired: mandatory,
        staffId: staffKey || bootWrap.staffId,
        todayIso: todayIso,
        windowStartMs: null,
        windowEndMs: null,
        sessionCount: todaySessions.length,
      };
    }

    var bounds = shiftBoundsFromSessions(qualifyingSessions, todayIso);
    if (!bounds) {
      return {
        allowed: false,
        reason: "invalid_shift_times",
        staffId: staffKey || bootWrap.staffId,
        locationRequired: locationRequired,
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
      locationRequired: locationRequired,
      staffId: staffKey || bootWrap.staffId,
      todayIso: todayIso,
      shiftStartMs: bounds.shiftStartMs,
      shiftEndMs: bounds.shiftEndMs,
      windowStartMs: windowStartMs,
      windowEndMs: windowEndMs,
      sessionCount: qualifyingSessions.length,
      mandatory: mandatory,
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
  global.portalLiveMapLocationRequiredForWorker = portalLiveMapLocationRequiredForWorker;
  global.portalLiveMapLocationRequiredToday = portalLiveMapLocationRequiredToday;
  global.portalLiveMapMsUntilShiftBoundary = portalLiveMapMsUntilShiftBoundary;
  global.PORTAL_LIVE_MAP_MANDATORY_STAFF = PORTAL_LIVE_MAP_MANDATORY_STAFF;
  global.PORTAL_LIVE_MAP_SHIFT_BEFORE_MS = BEFORE_MS;
  global.PORTAL_LIVE_MAP_SHIFT_AFTER_MS = AFTER_MS;
})(typeof window !== "undefined" ? window : globalThis);
