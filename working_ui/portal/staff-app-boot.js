/**
 * clubSENsational Staff app — boot (staff deploy only).
 * Preconnect, preload critical JS, defer non-essential assets after first paint.
 */
(function (global) {
  "use strict";
  if (!global.PORTAL_STAFF_APP) return;

  var VER = "20260624-staff-boot2";
  var isMobile = /iPhone|iPod|Android.+Mobile|Windows Phone/i.test(String(global.navigator && global.navigator.userAgent || ""));

  try {
    var pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = "https://cklpnwhlqsulpmkipmqb.supabase.co";
    pre.crossOrigin = "anonymous";
    (document.head || document.documentElement).appendChild(pre);
  } catch (_) {}

  function preloadScript(src) {
    try {
      if (document.querySelector('link[rel="preload"][href="' + src + '"]')) return;
      var l = document.createElement("link");
      l.rel = "preload";
      l.as = "script";
      l.href = src;
      (document.head || document.documentElement).appendChild(l);
    } catch (_) {}
  }

  if (/staff_dashboard/i.test(String(global.location.pathname || ""))) {
    preloadScript("/portal/staff_dashboard_spreadsheet_bundle.js?v=20260622-madre-unified");
    preloadScript("/portal/staff-dashboard-core.js?v=20260624-staff-perf4");
    preloadScript("/portal/portal_topbar_header.js?v=20260622-sandra-visual-vic");
    if (isMobile) {
      preloadScript("/portal/staff-dashboard-auth-bridge.js?v=20260624-staff-perf4");
      preloadScript("/portal/staff-dashboard-rehydrate.js?v=20260624-staff-perf4");
    }
  }

  if ("serviceWorker" in global.navigator) {
    try {
      global.navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) {
          reg.unregister().catch(function () {});
        });
      });
    } catch (_) {}
  }

  function loadScript(src, asModule) {
    return new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = src;
      if (asModule) s.type = "module";
      s.defer = true;
      s.onload = s.onerror = resolve;
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function loadCss(href) {
    return new Promise(function (resolve) {
      if (document.querySelector('link[href="' + href + '"]')) {
        resolve();
        return;
      }
      var l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.onload = l.onerror = resolve;
      (document.head || document.documentElement).appendChild(l);
    });
  }

  global.portalStaffDeferWebPush = function portalStaffDeferWebPush() {
    if (global.__PORTAL_STAFF_PUSH_DEFERRED__) return;
    global.__PORTAL_STAFF_PUSH_DEFERRED__ = true;
    var urls = [
      "/portal/portal_web_push_support.js?v=20260619-inflight-fix",
      "/portal/portal_ensure_web_push.js?v=20260619-inflight-fix",
      "/portal/portal_alerts_notifications_ui.js?v=20260619-inflight-fix",
    ];
    var i = 0;
    function next() {
      if (i >= urls.length) return;
      loadScript(urls[i++]).then(next);
    }
    scheduleIdle(next, 4000);
  };

  function portalStaffDeferDashboardExtras() {
    if (global.__PORTAL_STAFF_EXTRAS_DEFERRED__) return;
    global.__PORTAL_STAFF_EXTRAS_DEFERRED__ = true;
    if (!/staff_dashboard/i.test(String(global.location.pathname || ""))) return;
    var run = function () {
      loadCss("/portal/portal_ghost_view.css?v=20260624-ghost-handoff");
      loadScript("/portal/portal-ghost-view.js?v=20260624-ghost-handoff");
      loadScript("/portal/portal_wellbeing_review_reminder.js?v=20260604-wellbeing-reminder-off");
      loadCss("/portal/portal_achievements.css?v=20260614-ios-camera-fix");
    };
    scheduleIdle(run, isMobile ? 1200 : 2500);
  }

  function portalStaffMobileWarmDashboard(){
    if (!isMobile || !/staff_dashboard/i.test(String(global.location.pathname || ""))) return;
    var run = function () {
      if (typeof global.portalRefreshScheduleOverrideDayChrome === "function") {
        global.portalRefreshScheduleOverrideDayChrome();
      }
    };
    global.setTimeout(run, 1800);
  }

  function scheduleIdle(fn, timeoutMs) {
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(fn, { timeout: timeoutMs || 3000 });
    } else {
      global.setTimeout(fn, 800);
    }
  }

  function onDomReady() {
    if (typeof global.portalStaffDeferWebPush === "function") {
      global.portalStaffDeferWebPush();
    }
    portalStaffDeferDashboardExtras();
    portalStaffMobileWarmDashboard();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
  } else {
    onDomReady();
  }
})(typeof window !== "undefined" ? window : globalThis);
