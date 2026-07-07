/**
 * Staff dashboard boot — clubsensational-staff (PORTAL_STAFF_APP) and portalvic staff_dashboard
 * (legacy URL until workers migrate). Handheld gets sequential load + fast rehydrate; desktop parallel.
 */
(function (global) {
  "use strict";

  function detectHandheldStaff() {
    try {
      var nav = global.navigator || {};
      var ua = String(nav.userAgent || "");
      if (/iPhone|iPod|iPad|Android|Windows Phone/i.test(ua)) return true;
      if (String(nav.platform || "") === "MacIntel" && Number(nav.maxTouchPoints || 0) > 1) return true;
    } catch (_) {}
    return false;
  }

  var isHandheld = detectHandheldStaff();
  var isStaffDashboard = /staff_dashboard/i.test(String(global.location.pathname || ""));
  var isStaffApp = !!global.PORTAL_STAFF_APP;
  var isPortalvicStaff = !isStaffApp && isStaffDashboard;

  if (!isStaffApp && !isPortalvicStaff) return;

  try {
    var root = document.documentElement;
    if (isStaffApp) root.classList.add("portal-staff-app");
    if (isPortalvicStaff) root.classList.add("portal-vic-staff");
    root.classList.add(isHandheld ? "portal-staff-handheld" : "portal-staff-desktop");
  } catch (_) {}

  global.portalStaffIsHandheldDevice = function portalStaffIsHandheldDevice() {
    return isHandheld;
  };

  var VER = "20260625-lead-day-cards-nav";

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
    preloadScript("/portal/staff_dashboard_spreadsheet_bundle.js?v=20260707-roberto-venues");
    preloadScript("/portal/staff-dashboard-dock-boot.js?v=20260625-lead-day-cards-nav");
    preloadScript("/portal/staff-dashboard-topbar.js?v=20260625-lead-day-cards-nav");
    preloadScript("/portal/staff-dashboard-feedback.js?v=20260705-day-centre-peer");
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
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      if (asModule) s.type = "module";
      s.async = false;
      s.onload = s.onerror = resolve;
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function loadSequential(urls, asModule) {
    var chain = Promise.resolve();
    (urls || []).forEach(function (u) {
      chain = chain.then(function () {
        return loadScript(u, asModule);
      });
    });
    return chain;
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

  var STAFF_DEFERRED_HEAVY = [
    "/portal/clients_info_embed.js?v=20260608-anas-ismail",
    "/portal/clients_gender_embed.js?v=20260605-gender3",
      "/portal/portal_staff_lead_aquatic_slots.js?v=20260704-cover-merge-feedback",
    "/portal/portal_participant_identity.js?v=20260703-desktop",
    "/portal/portal_participant_general_hydrate.js?v=20260703-desktop",
    "/portal/portal_staff_gender_embed.js?v=20260605-mockup-compact",
    "/portal/portal_swimming_instructor_menus.js?v=20260707-topbar-diag2",
    "/portal/portal_staff_photos.js?v=20260624-rt-debug",
  ];

  function portalStaffStartDeferredDashboardScripts() {
    if (!isStaffDashboard) return;
    if (global.__PORTAL_STAFF_DEFERRED_DASHBOARD__) return;
    global.__PORTAL_STAFF_DEFERRED_DASHBOARD__ = true;

    function runDesktop() {
      var clientsInfo = STAFF_DEFERRED_HEAVY[0];
      var rest = STAFF_DEFERRED_HEAVY.slice(1);
      void loadScript(clientsInfo, false)
        .then(function () {
          afterClientsInfoReady();
          return Promise.all(rest.map(function (u) { return loadScript(u, false); }));
        })
        .then(afterDeferredDashboardScripts);
    }

    function runHandheld() {
      void loadSequential(STAFF_DEFERRED_HEAVY, false)
        .then(function () {
          afterClientsInfoReady();
          afterDeferredDashboardScripts();
        });
    }

    var start = function () {
      if (isHandheld) runHandheld();
      else runDesktop();
    };

    if (isHandheld) {
      var kick = function () {
        global.setTimeout(start, 3500);
      };
      if (document.readyState === "complete") kick();
      else global.addEventListener("load", kick, { once: true });
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
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
      global.setTimeout(resolve, isHandheld ? 20000 : 12000);
    });
  };

  global.portalStaffDeferWebPush = function portalStaffDeferWebPush() {
    if (global.__PORTAL_STAFF_PUSH_DEFERRED__) return;
    global.__PORTAL_STAFF_PUSH_DEFERRED__ = true;
    var urls = [
      "/portal/portal_web_push_support.js?v=20260628-test-sw-ready",
      "/portal/portal_ensure_web_push.js?v=20260619-inflight-fix",
      "/portal/portal_alerts_notifications_ui.js?v=20260705-ios-taps",
    ];
    var i = 0;
    function next() {
      if (i >= urls.length) return;
      loadScript(urls[i++]).then(next);
    }
    scheduleIdle(next, isHandheld ? 8000 : 4000);
  };

  function portalStaffDeferHeadExtras() {
    if (global.__PORTAL_STAFF_HEAD_EXTRAS__) return;
    global.__PORTAL_STAFF_HEAD_EXTRAS__ = true;
    if (!isStaffDashboard) return;
    scheduleIdle(function () {
      void loadSequential(
        [
          "/portal/portal_orientation_lock.js?v=20260622-next-chip-client",
          "/portal/portal_venue_report_schedule.js?v=20260621-venue-duty-fix",
        ],
        false
      );
    }, isHandheld ? 5000 : 1500);
  }

  function portalStaffDeferDashboardExtras() {
    if (global.__PORTAL_STAFF_EXTRAS_DEFERRED__) return;
    global.__PORTAL_STAFF_EXTRAS_DEFERRED__ = true;
    if (!isStaffDashboard) return;
    var run = function () {
      loadCss("/portal/portal_ghost_view.css?v=20260624-ghost-handoff");
      loadScript("/portal/portal-ghost-view.js?v=20260624-ghost-handoff");
      loadScript("/portal/portal_wellbeing_review_reminder.js?v=20260604-wellbeing-reminder-off");
      loadCss("/portal/portal_achievements.css?v=20260703-session-photos-back");
    };
    scheduleIdle(run, isHandheld ? 6000 : 2500);
  }

  function scheduleIdle(fn, timeoutMs) {
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(fn, { timeout: timeoutMs || 3000 });
    } else {
      global.setTimeout(fn, isHandheld ? 1500 : 800);
    }
  }

  function onDomReady() {
    if (!isHandheld) portalStaffStartDeferredDashboardScripts();
    portalStaffDeferHeadExtras();
    if (isStaffApp && typeof global.portalStaffDeferWebPush === "function") {
      global.portalStaffDeferWebPush();
    }
    portalStaffDeferDashboardExtras();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDomReady, { once: true });
  } else {
    onDomReady();
  }
})(typeof window !== "undefined" ? window : globalThis);
