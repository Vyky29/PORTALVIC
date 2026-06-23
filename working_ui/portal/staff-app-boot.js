/**
 * clubSENsational Staff app — boot (staff deploy only).
 * Preconnect + defer web push. Service worker disabled until chunk loader is stable on iOS PWA.
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

  if ("serviceWorker" in global.navigator) {
    try {
      global.navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) {
          reg.unregister().catch(function () {});
        });
      });
    } catch (_) {}
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

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        if (typeof global.portalStaffDeferWebPush === "function") {
          global.portalStaffDeferWebPush();
        }
      },
      { once: true }
    );
  } else if (typeof global.portalStaffDeferWebPush === "function") {
    global.portalStaffDeferWebPush();
  }
})(typeof window !== "undefined" ? window : globalThis);
