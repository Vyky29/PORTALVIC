/**
 * clubSENsational Staff app — boot (staff deploy only).
 * Preconnect, service worker, defer web push until after first paint.
 */
(function (global) {
  "use strict";
  if (!global.PORTAL_STAFF_APP) return;

  try {
    var pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = "https://cklpnwhlqsulpmkipmqb.supabase.co";
    pre.crossOrigin = "anonymous";
    (document.head || document.documentElement).appendChild(pre);
  } catch (_) {}

  function registerStaffSw() {
    if (!("serviceWorker" in global.navigator)) return;
    try {
      global.navigator.serviceWorker
        .register("/portal/staff-app-sw.js?v=20260623-staff-perf", { scope: "/" })
        .catch(function () {});
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registerStaffSw, { once: true });
  } else {
    registerStaffSw();
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
      var s = document.createElement("script");
      s.src = urls[i++];
      s.defer = true;
      s.onload = s.onerror = next;
      (document.head || document.documentElement).appendChild(s);
    }
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(next, { timeout: 4000 });
    } else {
      global.setTimeout(next, 1200);
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
