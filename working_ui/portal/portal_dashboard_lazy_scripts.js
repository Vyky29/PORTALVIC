/**
 * Deferred dashboard chunks (help bot, achievements, induction, onboarding, …).
 * Keeps first paint off ~300KB+ of non-roster scripts on staff/lead dashboards.
 */
(function (global) {
  "use strict";

  var STAFF_LAZY_SCRIPTS = [
    "/portal/teflon_guide_demo_data.js?v=20260604-guide-roster",
    "/portal/teflon_guide_demo_merge.js?v=20260604-guide-roster",
    "/portal/portal_participant_achievements.js?v=20260722-achievement-rls-msg",
    "/portal/portal_client_sessions_overview.js?v=20260607-no-opt-labels",
    "/portal/portal_induction.js?v=20260614-induction-canonical",
    "/portal/portal_induction_bind.js?v=20260604-induction-persist",
    "/portal/portal_guide_ack.js?v=20260614-no-menu-guide",
    "/portal/portal_guide_menu.js?v=20260614-no-menu-guide",
    "/portal/portal-openai-assist.js?v=20260607-openai-assist-b",
    "/portal/portal_help_bot.js?v=20260607-help-ai-b",
    "/portal/portal_onboarding_urls.js?v=20260601-onboarding-urls",
    "/portal/portal_onboarding_quick_menu.js?v=20260614-onboarding-session",
  ];

  var LEAD_LAZY_SCRIPTS = STAFF_LAZY_SCRIPTS;

  var inflight = null;
  var done = false;

  function dashboardShell() {
    return "staff";
  }

  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = global.document.createElement("script");
      s.src = src;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        resolve();
      };
      (global.document.head || global.document.documentElement).appendChild(s);
    });
  }

  function loadSequential(urls) {
    var chain = Promise.resolve();
    (urls || []).forEach(function (src) {
      chain = chain.then(function () {
        return loadScript(src);
      });
    });
    return chain;
  }

  function markReady() {
    done = true;
    global.__PORTAL_DASHBOARD_LAZY_READY__ = true;
    try {
      global.dispatchEvent(new Event("portal:dashboard-lazy-ready"));
    } catch (_) {}
  }

  global.portalEnsureDashboardLazyScripts = function portalEnsureDashboardLazyScripts() {
    if (done) return Promise.resolve();
    if (inflight) return inflight;
    var urls = dashboardShell() === "lead" ? LEAD_LAZY_SCRIPTS : STAFF_LAZY_SCRIPTS;
    inflight = loadSequential(urls).then(markReady);
    return inflight;
  };

  function scheduleLazyLoad() {
    var run = function () {
      void global.portalEnsureDashboardLazyScripts();
    };
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(run, { timeout: 1800 });
    } else {
      global.setTimeout(run, 180);
    }
  }

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", scheduleLazyLoad, { once: true });
  } else {
    scheduleLazyLoad();
  }
})(typeof window !== "undefined" ? window : globalThis);
