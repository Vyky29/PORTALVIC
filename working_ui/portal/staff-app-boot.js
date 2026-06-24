/**
 * clubSENsational Staff app — boot (staff deploy only).
 * Preconnect, preload critical JS, defer non-essential assets after first paint.
 */
(function (global) {
  "use strict";
  if (!global.PORTAL_STAFF_APP) return;

  var VER = "20260624-staff-boot4";
  var isMobile = /iPhone|iPod|Android.+Mobile|Windows Phone/i.test(
    String((global.navigator && global.navigator.userAgent) || "")
  );
  var isStaffDashboard = /staff_dashboard/i.test(String(global.location.pathname || ""));

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

  if (isStaffDashboard) {
    preloadScript("/portal/staff_dashboard_spreadsheet_bundle.js?v=20260622-madre-unified");
    preloadScript("/portal/staff-dashboard-core.js?v=20260624-staff-perf5");
    preloadScript("/portal/clients_info_embed.js?v=20260608-anas-ismail");
    preloadScript("/portal/portal_topbar_header.js?v=20260622-sandra-visual-vic");
    if (isMobile) {
      preloadScript("/portal/staff-dashboard-auth-bridge.js?v=20260624-staff-perf5");
      preloadScript("/portal/staff-dashboard-rehydrate.js?v=20260624-staff-perf5");
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
      s.async = true;
      s.onload = s.onerror = resolve;
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function loadParallel(urls, asModule) {
    return Promise.all(
      (urls || []).map(function (u) {
        return loadScript(u, asModule);
      })
    );
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

  function afterClientsInfoReady() {
    if (typeof global.portalApplyClientsInfoToNotes === "function") {
      try {
        global.portalApplyClientsInfoToNotes();
      } catch (_) {}
    }
    try {
      global.dispatchEvent(new Event("portal:clients-info-ready"));
    } catch (_) {}
  }

  function afterDeferredDashboardScripts() {
    if (typeof global.portalHydrateParticipantGeneralInfoFromSupabase === "function") {
      void global.portalHydrateParticipantGeneralInfoFromSupabase();
    }
    global.__PORTAL_STAFF_DEFERRED_DASHBOARD_READY__ = true;
    try {
      global.dispatchEvent(new Event("portal:staff-deferred-dashboard-ready"));
    } catch (_) {}
  }

  /** ~240KB off the sync footer chain — download starts here while body still parses. */
  function portalStaffStartDeferredDashboardScripts() {
    if (!isStaffDashboard) return;
    if (global.__PORTAL_STAFF_DEFERRED_DASHBOARD__) return;
    global.__PORTAL_STAFF_DEFERRED_DASHBOARD__ = true;

    var clientsInfo = "/portal/clients_info_embed.js?v=20260608-anas-ismail";
    var rest = [
      "/portal/clients_gender_embed.js?v=20260605-gender3",
      "/portal/portal_staff_lead_aquatic_slots.js?v=20260624-ma-consecutive-merge",
      "/portal/portal_participant_identity.js?v=20260703-desktop",
      "/portal/portal_participant_general_hydrate.js?v=20260703-desktop",
      "/portal/portal_staff_gender_embed.js?v=20260605-mockup-compact",
      "/portal/portal_swimming_instructor_menus.js?v=20260622-sandra-visual-vic",
      "/portal/portal_staff_photos.js?v=20260624-rt-debug",
    ];

    void loadScript(clientsInfo, false)
      .then(function () {
        afterClientsInfoReady();
        return loadParallel(rest, false);
      })
      .then(afterDeferredDashboardScripts);
  }

  global.portalStaffEnsureDeferredDashboardScripts = function portalStaffEnsureDeferredDashboardScripts() {
    portalStaffStartDeferredDashboardScripts();
    if (global.__PORTAL_STAFF_DEFERRED_DASHBOARD_READY__) {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      var done = function () {
        global.removeEventListener("portal:staff-deferred-dashboard-ready", done);
        resolve();
      };
      global.addEventListener("portal:staff-deferred-dashboard-ready", done);
      global.setTimeout(resolve, 12000);
    });
  };

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

  function portalStaffDeferHeadExtras() {
    if (global.__PORTAL_STAFF_HEAD_EXTRAS__) return;
    global.__PORTAL_STAFF_HEAD_EXTRAS__ = true;
    if (!isStaffDashboard) return;
    void loadParallel(
      [
        "/portal/portal_orientation_lock.js?v=20260622-next-chip-client",
        "/portal/portal_venue_report_schedule.js?v=20260621-venue-duty-fix",
      ],
      false
    );
  }

  function portalStaffDeferDashboardExtras() {
    if (global.__PORTAL_STAFF_EXTRAS_DEFERRED__) return;
    global.__PORTAL_STAFF_EXTRAS_DEFERRED__ = true;
    if (!isStaffDashboard) return;
    var run = function () {
      loadCss("/portal/portal_ghost_view.css?v=20260624-ghost-handoff");
      loadScript("/portal/portal-ghost-view.js?v=20260624-ghost-handoff");
      loadScript("/portal/portal_wellbeing_review_reminder.js?v=20260604-wellbeing-reminder-off");
      loadCss("/portal/portal_achievements.css?v=20260614-ios-camera-fix");
    };
    scheduleIdle(run, isMobile ? 1200 : 2500);
  }

  function scheduleIdle(fn, timeoutMs) {
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(fn, { timeout: timeoutMs || 3000 });
    } else {
      global.setTimeout(fn, 800);
    }
  }

  function onDomReady() {
    portalStaffStartDeferredDashboardScripts();
    portalStaffDeferHeadExtras();
    if (typeof global.portalStaffDeferWebPush === "function") {
      global.portalStaffDeferWebPush();
    }
    portalStaffDeferDashboardExtras();
  }

  portalStaffStartDeferredDashboardScripts();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
  } else {
    onDomReady();
  }
})(typeof window !== "undefined" ? window : globalThis);
