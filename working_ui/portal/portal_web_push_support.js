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
  global.portalNotifyEnvironment = portalNotifyEnvironment;
  global.portalNotifyEnvironmentHint = portalNotifyEnvironmentHint;
  global.portalUserActivationActive = global.portalUserActivationActive || portalUserActivationActive;
  global.portalRegisterPortalServiceWorker = portalRegisterPortalServiceWorker;
  global.portalAwaitServiceWorkerReady = portalAwaitServiceWorkerReady;
})(typeof window !== "undefined" ? window : globalThis);
