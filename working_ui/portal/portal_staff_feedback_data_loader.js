/**
 * Defer ~250KB session feedback exports until after first paint.
 * Today cards refresh when data arrives (portal:feedback-data-ready).
 */
(function (global) {
  "use strict";

  var SCRIPTS = [
    "/portal/session_feedback_portal_data.js?v=20260614-acat-jun8-absent",
    "/portal/session_feedback_status_portal_data.js?v=20260614-acat-jun8-absent",
    "/portal/staff_portal_feedback_bridge.js?v=20260621-per-instructor-feedback",
  ];

  var inflight = null;
  var done = false;

  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = global.document.createElement("script");
      s.src = src;
      s.async = false;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        resolve();
      };
      (global.document.head || global.document.documentElement).appendChild(s);
    });
  }

  function markReady() {
    done = true;
    global.__PORTAL_STAFF_FEEDBACK_DATA_READY__ = true;
    try {
      global.dispatchEvent(new Event("portal:feedback-data-ready"));
    } catch (_) {}
  }

  global.portalEnsureStaffFeedbackData = function portalEnsureStaffFeedbackData() {
    if (done) return Promise.resolve();
    if (inflight) return inflight;
    var chain = Promise.resolve();
    SCRIPTS.forEach(function (src) {
      chain = chain.then(function () {
        return loadScript(src);
      });
    });
    inflight = chain.then(markReady);
    return inflight;
  };

  function schedule() {
    var run = function () {
      void global.portalEnsureStaffFeedbackData();
    };
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(run, { timeout: 900 });
    } else {
      global.setTimeout(run, 120);
    }
  }

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", schedule, { once: true });
  } else {
    schedule();
  }
})(typeof window !== "undefined" ? window : globalThis);
