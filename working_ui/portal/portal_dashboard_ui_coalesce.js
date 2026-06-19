/**
 * Coalesce dashboard UI refreshes and stabilise participant photo loads.
 */
(function (global) {
  "use strict";

  var finishTimer = null;
  var finishGen = 0;

  function normalizePhotoUrl(url) {
    if (typeof global.portalNormalizeParticipantPhotoUrl === "function") {
      return global.portalNormalizeParticipantPhotoUrl(url);
    }
    var u = String(url || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) return u;
    if (u.charAt(0) !== "/") u = "/" + u.replace(/^\.?\/*/, "");
    return u;
  }

  global.portalNormalizeParticipantPhotoUrl = normalizePhotoUrl;

  var photoRepairTimer = null;

  function scheduleParticipantPhotoRepair() {
    if (photoRepairTimer) global.clearTimeout(photoRepairTimer);
    photoRepairTimer = global.setTimeout(function () {
      photoRepairTimer = null;
      if (typeof global.portalRefreshTodayNextParticipantPhotos === "function") {
        global.portalRefreshTodayNextParticipantPhotos();
      }
    }, 140);
  }

  global.portalPreloadParticipantPhotoUrls = function portalPreloadParticipantPhotoUrls(urls) {
    if (!global.__PORTAL_PARTICIPANT_PHOTO_PRELOAD__) {
      global.__PORTAL_PARTICIPANT_PHOTO_PRELOAD__ = Object.create(null);
    }
    var cache = global.__PORTAL_PARTICIPANT_PHOTO_PRELOAD__;
    var queued = false;
    (urls || []).forEach(function (raw) {
      var u = normalizePhotoUrl(raw);
      if (!u || cache[u]) return;
      cache[u] = "pending";
      queued = true;
      var img = new Image();
      img.decoding = "async";
      img.onload = img.onerror = function () {
        cache[u] = "done";
        scheduleParticipantPhotoRepair();
      };
      img.src = u;
    });
    if (queued) scheduleParticipantPhotoRepair();
  };

  global.portalParticipantPhotoLoadingAttr = function portalParticipantPhotoLoadingAttr() {
    return ' loading="eager" fetchpriority="low"';
  };

  global.portalScheduleDashboardUiFinish = function portalScheduleDashboardUiFinish(fn, delayMs) {
    if (typeof fn !== "function") return;
    finishGen += 1;
    var gen = finishGen;
    if (finishTimer) global.clearTimeout(finishTimer);
    finishTimer = global.setTimeout(function () {
      finishTimer = null;
      if (gen !== finishGen) return;
      try {
        fn();
      } catch (e) {
        try {
          console.warn("[portal] dashboard ui finish", e);
        } catch (_) {}
      }
    }, delayMs == null ? 48 : delayMs);
  };

  global.portalTodayDayOffPanelSignature = function portalTodayDayOffPanelSignature(opts) {
    opts = opts || {};
    if (opts.loading) return "loading";
    var mode = String(opts.mode || "").trim();
    var preview = opts.preview;
    var previewSig = "solo";
    if (preview) {
      var parts = [
        String(preview.weekday || ""),
        String(preview.dateLabel || ""),
        String(preview.sessionCount || "0"),
        String(preview.venueLabel || ""),
      ];
      (preview.participants || []).forEach(function (p) {
        parts.push(
          String((p && p.clientId) || "") +
            "|" +
            String((p && p.name) || "") +
            "|" +
            normalizePhotoUrl(p && p.photoUrl)
        );
      });
      previewSig = parts.join(";");
    }
    return (mode ? "mode:" + mode + "|" : "") + previewSig;
  };

  global.portalTomorrowListSignature = function portalTomorrowListSignature(rows) {
    return (rows || [])
      .map(function (item) {
        var row = item || {};
        return [
          String(row.clientId || ""),
          String(row.name || ""),
          String(row.time || ""),
          String(row.timeSlotLabel || ""),
          String(row.start || ""),
          String(row.venue || ""),
          normalizePhotoUrl(row.avatarFile),
          String(row.areaNote || ""),
          String(row.futureOverrideLabel || ""),
          String(row.futureOverrideTone || ""),
        ].join(":");
      })
      .join("|");
  };

  global.portalClientsGridSignature = function portalClientsGridSignature(mode, ids) {
    return String(mode || "") + ";" + (ids || []).join(",");
  };

  var OVERVIEW_MINI_PULSE_CLASSES = [
    "mini-card--ov-pulse-makeup",
    "mini-card--ov-pulse-trial",
    "mini-card--ov-pulse-absent",
    "mini-card--ov-pulse-cancelled",
    "mini-card--ov-pulse-admin-shift",
    "mini-card--ov-pulse-training",
    "mini-card--ov-pulse-shadowing",
    "mini-card--ov-pulse-meeting",
    "mini-card--ov-pulse-outstanding",
    "mini-card--ov-pulse-day-off",
    "mini-card--ov-pulse-shift-removed",
    "mini-card--ov-pulse-both",
  ];

  global.portalApplyOverviewMiniCardPulse = function portalApplyOverviewMiniCardPulse(cardEl, pulseCls) {
    if (!cardEl) return;
    OVERVIEW_MINI_PULSE_CLASSES.forEach(function (cls) {
      cardEl.classList.remove(cls);
    });
    cardEl.classList.remove("mini-card--ov-pink", "mini-card--ov-trial", "mini-card--ov-green");
    if (pulseCls) cardEl.classList.add(pulseCls);
  };

  global.portalTermMiniCardPulseClass = function portalTermMiniCardPulseClass(_flags) {
    return "";
  };

  var NEXT_SESSION_MINI_PULSE_CLASSES = OVERVIEW_MINI_PULSE_CLASSES.slice();

  global.portalNextSessionMiniCardPulseClass = function portalNextSessionMiniCardPulseClass(rows) {
    var flags = {
      trial: false,
      makeup: false,
      absent: false,
      cancelled: false,
      admin: false,
      training: false,
      shadowing: false,
      meeting: false,
      outstanding: false,
    };
    (rows || []).forEach(function (row) {
      var tone = String(row && row.futureOverrideTone || "").trim();
      if (tone === "trial") flags.trial = true;
      else if (tone === "pink") flags.makeup = true;
      else if (tone === "absent-green") flags.absent = true;
      else if (tone === "cancelled-green") flags.cancelled = true;
      else if (tone === "admin") flags.admin = true;
      else if (tone === "training") flags.training = true;
      else if (tone === "shadowing") flags.shadowing = true;
      else if (tone === "meeting") flags.meeting = true;
      else if (tone === "pending-feedback") flags.outstanding = true;
    });
    var count =
      (flags.trial ? 1 : 0) +
      (flags.makeup ? 1 : 0) +
      (flags.absent ? 1 : 0) +
      (flags.cancelled ? 1 : 0) +
      (flags.admin ? 1 : 0) +
      (flags.training ? 1 : 0) +
      (flags.shadowing ? 1 : 0) +
      (flags.meeting ? 1 : 0);
    if (count >= 2) return "mini-card--ov-pulse-both";
    if (flags.trial) return "mini-card--ov-pulse-trial";
    if (flags.makeup) return "mini-card--ov-pulse-makeup";
    if (flags.absent) return "mini-card--ov-pulse-absent";
    if (flags.cancelled) return "mini-card--ov-pulse-cancelled";
    if (flags.admin) return "mini-card--ov-pulse-admin-shift";
    if (flags.training) return "mini-card--ov-pulse-training";
    if (flags.shadowing) return "mini-card--ov-pulse-shadowing";
    if (flags.meeting) return "mini-card--ov-pulse-meeting";
    if (flags.outstanding) return "mini-card--ov-pulse-outstanding";
    return "";
  };

  global.portalApplyNextSessionMiniCardPulse = function portalApplyNextSessionMiniCardPulse(cardEl, rows) {
    global.portalApplyOverviewMiniCardPulse(
      cardEl,
      global.portalNextSessionMiniCardPulseClass(rows)
    );
  };

  global.portalApplyTermMiniCardPulse = function portalApplyTermMiniCardPulse(cardEl, flags) {
    global.portalApplyOverviewMiniCardPulse(cardEl, global.portalTermMiniCardPulseClass(flags));
  };

  var termGridIdleTimer = null;
  var termGridIdleGen = 0;

  global.portalTermGridDomSignature = function portalTermGridDomSignature(opts) {
    opts = opts || {};
    var fb = opts.termFeedbackByDate || {};
    var fbPart = "";
    var keys = Object.keys(fb);
    for (var i = 0; i < keys.length; i++) {
      fbPart += keys[i] + ":" + fb[keys[i]] + ";";
    }
    return [
      String(opts.staffId || ""),
      String(opts.termCalendarYear || ""),
      (opts.termCalendarMonths || []).join(","),
      String(keys.length),
      fbPart,
      String(opts.overrideCount || 0),
    ].join("|");
  };

  global.portalScheduleTermGridIdleRender = function portalScheduleTermGridIdleRender(fn, delayMs) {
    if (typeof fn !== "function") return;
    termGridIdleGen += 1;
    var gen = termGridIdleGen;
    if (termGridIdleTimer) global.clearTimeout(termGridIdleTimer);
    termGridIdleTimer = global.setTimeout(function () {
      termGridIdleTimer = null;
      if (gen !== termGridIdleGen) return;
      var run = function () {
        if (gen !== termGridIdleGen) return;
        try {
          fn();
        } catch (e) {
          try {
            console.warn("[portal] term grid idle render", e);
          } catch (_) {}
        }
      };
      if (typeof global.requestIdleCallback === "function") {
        global.requestIdleCallback(run, { timeout: 1200 });
      } else {
        run();
      }
    }, delayMs == null ? 120 : delayMs);
  };

  global.portalTodaySessionCardsSignature = function portalTodaySessionCardsSignature(rows, reviewClassFn) {
    return (rows || [])
      .map(function (item) {
        var row = item || {};
        var reviewCls =
          typeof reviewClassFn === "function" ? String(reviewClassFn(row) || "").trim() : "";
        return [
          String(row.sessionKey || ""),
          String(row.kind || ""),
          String(row.portalOverrideAlertPill || ""),
          reviewCls,
        ].join(":");
      })
      .join("|");
  };
})(typeof window !== "undefined" ? window : globalThis);
