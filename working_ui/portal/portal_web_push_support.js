/**
 * Web Push + notifications — shared desktop/mobile helpers (admin, staff, lead).
 */
(function (global) {
  "use strict";

  function persistGet(key) {
    try {
      return global.localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function persistSet(key, val) {
    try {
      global.localStorage.setItem(key, String(val));
    } catch (_) {}
  }

  function portalIsStandalonePwa() {
    try {
      if (global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) {
        return true;
      }
      if (global.navigator && global.navigator.standalone === true) return true;
    } catch (_) {}
    return false;
  }

  function portalNotifyEnvironment() {
    var ua = String((global.navigator && global.navigator.userAgent) || "");
    var isMac = /Macintosh|Mac OS X/i.test(ua);
    var isWin = /Windows/i.test(ua);
    var isIOS = /iPhone|iPad|iPod/i.test(ua);
    var isAndroid = /Android/i.test(ua);
    var isSafari = /Safari/i.test(ua) && !/Chrom|Edg|OPR|Firefox/i.test(ua);
    var isFirefox = /Firefox/i.test(ua);
    var isEdge = /Edg\//i.test(ua);
    var isChrome = /Chrom/i.test(ua) && !isEdge;
    var mobile = isIOS || isAndroid;
    var desktop = !mobile && (isMac || isWin || /Linux/i.test(ua));
    var pushSupported = !!(
      global.isSecureContext &&
      global.navigator &&
      "serviceWorker" in global.navigator &&
      "PushManager" in global
    );
    return {
      isMac: isMac,
      isWin: isWin,
      isIOS: isIOS,
      isAndroid: isAndroid,
      isSafari: isSafari,
      isFirefox: isFirefox,
      isChrome: isChrome,
      isEdge: isEdge,
      mobile: mobile,
      desktop: desktop,
      pushSupported: pushSupported,
    };
  }

  function portalNotifyEnvironmentHint(env, reason) {
    env = env || portalNotifyEnvironment();
    if (typeof global.Notification === "undefined") {
      if (env.desktop && env.isSafari) {
        return " Use Safari 16.4+ on Mac, or install Chrome/Edge for this computer.";
      }
      if (env.desktop) {
        return " Use Chrome or Edge on this computer.";
      }
      return "";
    }
    if (reason === "no-sw" || reason === "sw-timeout" || !env.pushSupported) {
      if (env.isIOS && env.mobile) {
        return " iPhone/iPad: add the portal to your Home Screen (Share → Add to Home Screen), open it from that icon, then turn on alerts — Safari tabs alone cannot ring for calls when closed.";
      }
      if (env.isMac && env.isSafari) {
        return " Mac Safari: allow this site under Safari → Settings → Websites → Notifications. For alerts when the browser is closed, Safari 17+ or Chrome on this Mac works best.";
      }
      if (env.isWin) {
        return " Windows: use Chrome or Edge, click Allow when asked, and check Focus Assist is not blocking notifications.";
      }
      if (env.isMac) {
        return " Mac: allow notifications when the browser asks; Chrome or Edge on desktop is most reliable for ops alerts.";
      }
      return " Allow notifications in the browser when prompted.";
    }
    if (reason === "no-vapid") {
      return " Server push keys are not configured — contact IT.";
    }
    if (global.Notification && global.Notification.permission === "denied") {
      if (env.isMac && env.isSafari) {
        return " Safari: Settings → Websites → Notifications → this site → Allow. Also System Settings → Notifications → Safari.";
      }
      if (env.isWin) {
        return " Windows: Settings → System → Notifications → allow Chrome or Microsoft Edge.";
      }
      if (env.isMac) {
        return " Mac: System Settings → Notifications → your browser → allow alerts.";
      }
    }
    return "";
  }

  function portalUserActivationActive() {
    try {
      return (
        global.navigator &&
        global.navigator.userActivation &&
        global.navigator.userActivation.isActive === true
      );
    } catch (_) {
      return false;
    }
  }

  async function portalRegisterPortalServiceWorker() {
    if (!global.navigator || !("serviceWorker" in global.navigator)) {
      return null;
    }
    if (global.__PORTAL_SW_REG__ && global.__PORTAL_SW_REG__.active) {
      return global.__PORTAL_SW_REG__;
    }
    if (global.__PORTAL_SW_REG_PROMISE__) {
      return global.__PORTAL_SW_REG_PROMISE__;
    }
    global.__PORTAL_SW_REG_PROMISE__ = (async function () {
      try {
        var swUrl = new URL("clubsensational-portal-sw.js", global.location.href).href;
        var scopeBase = new URL("./", global.location.href).href;
        var reg = await global.navigator.serviceWorker.register(swUrl, { scope: scopeBase });
        global.__PORTAL_SW_REG__ = reg;
        try {
          await reg.update();
        } catch (_u) {}
        return reg;
      } catch (e) {
        console.warn("[portal] service worker register", e);
        global.__PORTAL_SW_REG__ = null;
        return null;
      } finally {
        global.__PORTAL_SW_REG_PROMISE__ = null;
      }
    })();
    return global.__PORTAL_SW_REG_PROMISE__;
  }

  async function portalAwaitServiceWorkerReady(timeoutMs) {
    timeoutMs = Number(timeoutMs || 15000);
    var reg = await portalRegisterPortalServiceWorker();
    if (!reg) {
      throw new Error("service-worker-not-registered");
    }
    return new Promise(function (resolve, reject) {
      var done = false;
      var tm = setTimeout(function () {
        if (done) return;
        done = true;
        reject(new Error("service-worker-ready-timeout"));
      }, timeoutMs);
      global.navigator.serviceWorker.ready
        .then(function (readyReg) {
          if (done) return;
          done = true;
          clearTimeout(tm);
          resolve(readyReg || reg);
        })
        .catch(function (err) {
          if (done) return;
          done = true;
          clearTimeout(tm);
          reject(err);
        });
    });
  }

  global.portalPersistGet = global.portalPersistGet || persistGet;
  global.portalPersistSet = global.portalPersistSet || persistSet;
  global.portalIsStandalonePwa = portalIsStandalonePwa;
  async function portalSendLocalTestNotification(opts) {
    opts = opts || {};
    var title = String(opts.title || "Test: portal notification").trim();
    var body = String(
      opts.body ||
        "If you see this banner, notifications can reach your device."
    ).trim();
    var icon = String(opts.icon || "/portal/app-icon/icon-192.png?v=20260624-push-icon").trim();
    if (typeof global.Notification === "undefined") {
      return { ok: false, reason: "unsupported" };
    }
    if (global.Notification.permission !== "granted") {
      return { ok: false, reason: "no-perm" };
    }
    var env = portalNotifyEnvironment();
    var notifyOpts = {
      body: body,
      icon: icon,
      badge: icon,
      tag: "portal-local-test-" + Date.now(),
      renotify: true,
    };

    if (env.mobile || env.isIOS || env.isAndroid) {
      try {
        var reg = await portalRegisterPortalServiceWorker();
        if (reg && typeof reg.showNotification === "function") {
          await reg.showNotification(title, notifyOpts);
          if (global.navigator && global.navigator.vibrate) {
            try {
              global.navigator.vibrate([100, 50, 100]);
            } catch (_v) {}
          }
          return { ok: true, via: "sw", env: env };
        }
      } catch (_sw) {}
    }

    try {
      new global.Notification(title, notifyOpts);
      if (global.navigator && global.navigator.vibrate) {
        try {
          global.navigator.vibrate([100, 50, 100]);
        } catch (_v2) {}
      }
      return { ok: true, via: "window", env: env };
    } catch (e) {
      return { ok: false, reason: "exception", error: e, env: env };
    }
  }

  function portalTestNotificationStatusMessage(result) {
    result = result || {};
    var env = result.env || portalNotifyEnvironment();
    if (!result.ok) {
      if (result.reason === "no-perm") {
        return "Allow notifications for this site, then try Send test alert again.";
      }
      if (result.reason === "unsupported") {
        return "Not supported on this browser." + portalNotifyEnvironmentHint(env);
      }
      return (
        "Could not show test notification." +
        portalNotifyEnvironmentHint(env, result.reason)
      );
    }
    if (env.isIOS && env.mobile) {
      return (
        "Test sent — on iPhone you may not see a banner while the portal is open. " +
        "Lock the phone or send a real chat message with the app closed."
      );
    }
    if (env.mobile) {
      return "Test sent — if you did not see a banner, switch away from the portal and try again.";
    }
    return "Test sent — if you saw the banner, this device is ready.";
  }

  function portalUrlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /** Re-subscribe when VAPID key rotates (old push subs cannot receive). */
  async function portalSubscribePushWithCurrentVapid(reg, vapidPublicKey) {
    if (!reg || !reg.pushManager || !vapidPublicKey) {
      throw new Error("missing-push-params");
    }
    var vapidId = String(
      global.__PORTAL_VAPID_KEY_ID__ || vapidPublicKey.slice(0, 16)
    ).trim();
    var storedId = persistGet("portal_vapid_key_id");
    var keyU8 = portalUrlBase64ToUint8Array(String(vapidPublicKey).trim());
    var sub = await reg.pushManager.getSubscription();
    if (sub && vapidId && storedId && storedId !== vapidId) {
      try {
        await sub.unsubscribe();
      } catch (_u) {}
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyU8,
      });
      if (vapidId) persistSet("portal_vapid_key_id", vapidId);
    }
    return sub;
  }

  global.portalSendLocalTestNotification = portalSendLocalTestNotification;
  global.portalTestNotificationStatusMessage = portalTestNotificationStatusMessage;
  global.portalNotifyEnvironment = portalNotifyEnvironment;
  global.portalNotifyEnvironmentHint = portalNotifyEnvironmentHint;
  global.portalUserActivationActive = global.portalUserActivationActive || portalUserActivationActive;
  global.portalRegisterPortalServiceWorker = portalRegisterPortalServiceWorker;
  global.portalAwaitServiceWorkerReady = portalAwaitServiceWorkerReady;
  global.portalSubscribePushWithCurrentVapid = portalSubscribePushWithCurrentVapid;
})(typeof window !== "undefined" ? window : globalThis);
