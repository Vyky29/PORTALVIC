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
    var preview = opts.preview;
    if (!preview) return "solo";
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
    return parts.join(";");
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
})(typeof window !== "undefined" ? window : globalThis);
