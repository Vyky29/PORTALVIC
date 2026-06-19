/**
 * Register PushManager subscription with portal-push-subscribe (admin + shared dashboards).
 */
(function (global) {
  "use strict";

  if (typeof global.portalEnsureWebPushSubscription === "function") return;

  function vapidKey() {
    return global.__PORTAL_VAPID_PUBLIC_KEY__
      ? String(global.__PORTAL_VAPID_PUBLIC_KEY__).trim()
      : "";
  }

  global.portalEnsureWebPushSubscription = async function portalEnsureWebPushSubscription() {
    if (global.__PORTAL_WPS_IN_FLIGHT_PROMISE) return global.__PORTAL_WPS_IN_FLIGHT_PROMISE;
    global.__PORTAL_WPS_IN_FLIGHT_PROMISE = (async function () {
    try {
      var env =
        typeof global.portalNotifyEnvironment === "function"
          ? global.portalNotifyEnvironment()
          : { pushSupported: true, desktop: true };
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return { ok: false, reason: "no-sw", env: env };
      }
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return { ok: false, reason: "no-notify-perm", env: env };
      }
      var vapid = vapidKey();
      if (!vapid) return { ok: false, reason: "no-vapid", env: env };
      var reg = null;
      if (typeof global.portalAwaitServiceWorkerReady === "function") {
        try {
          reg = await global.portalAwaitServiceWorkerReady(15000);
        } catch (swErr) {
          var swMsg = swErr && swErr.message ? String(swErr.message) : String(swErr);
          if (swMsg.indexOf("timeout") >= 0) {
            return { ok: false, reason: "sw-timeout", env: env };
          }
          return { ok: false, reason: "no-sw", env: env };
        }
      } else {
        reg = await navigator.serviceWorker.ready;
      }
      var box = global.__PORTAL_SUPABASE__;
      var token =
        box && box.session && box.session.access_token
          ? String(box.session.access_token).trim()
          : "";
      if (!token) return { ok: false, reason: "no-session" };
      if (
        typeof global.portalEnsureFreshPushSubscription === "function" &&
        box &&
        box.client
      ) {
        var fresh = await global.portalEnsureFreshPushSubscription(
          reg,
          vapid,
          box.client,
          box.session
        );
        return fresh && fresh.ok ? { ok: true } : fresh || { ok: false, reason: "subscribe-failed" };
      }
      var sub =
        typeof global.portalSubscribePushWithCurrentVapid === "function"
          ? await global.portalSubscribePushWithCurrentVapid(reg, vapid)
          : await (async function () {
              var keyU8 =
                typeof global.portalUrlBase64ToUint8Array === "function"
                  ? global.portalUrlBase64ToUint8Array(vapid)
                  : null;
              if (!keyU8) throw new Error("missing-vapid-decode");
              var existing = await reg.pushManager.getSubscription();
              if (existing) return existing;
              return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: keyU8,
              });
            })();
      if (typeof global.portalPostPushSubscriptionToServer === "function" && box.client) {
        return global.portalPostPushSubscriptionToServer(box.client, box.session, sub);
      }
      return { ok: false, reason: "no-fn-url" };
    } catch (e) {
      try {
        console.warn("[portal] portalEnsureWebPushSubscription", e);
      } catch (_) {}
      return { ok: false, reason: "exception" };
    }
    })();
    try {
      return await global.__PORTAL_WPS_IN_FLIGHT_PROMISE;
    } finally {
      global.__PORTAL_WPS_IN_FLIGHT_PROMISE = null;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
