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
        "Lock the phone or close the app to verify real push."
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
  async function portalServerHasPushEndpoint(client, userId, endpoint) {
    endpoint = String(endpoint || "").trim();
    userId = String(userId || "").trim();
    if (!client || !userId || !endpoint) return false;
    try {
      var res = await client
        .from("portal_push_subscriptions")
        .select("endpoint")
        .eq("user_id", userId)
        .eq("endpoint", endpoint)
        .maybeSingle();
      return !res.error && !!(res.data && res.data.endpoint);
    } catch (_q) {
      return false;
    }
  }

  async function portalPostPushSubscriptionToServer(client, session, sub) {
    if (!client || !session || !session.access_token || !sub) {
      return { ok: false, reason: "no-session" };
    }
    var userId = String(session.user && session.user.id ? session.user.id : "").trim();
    var endpoint = String(sub.endpoint || "").trim();
    var subJson = sub.toJSON();
    var fnRes = await client.functions.invoke("portal-push-subscribe", {
      body: { subscription: subJson, register_app: "portal" },
    });
    if (fnRes.error) {
      var st = Number(
        fnRes.error.status ||
          (fnRes.error.context && fnRes.error.context.status) ||
          0
      );
      return { ok: false, reason: "subscribe-fn", status: st || 0 };
    }
    var onServer = await portalServerHasPushEndpoint(client, userId, endpoint);
    if (!onServer) return { ok: false, reason: "server-missing" };
    return { ok: true };
  }

  async function portalEnsureFreshPushSubscription(reg, vapidPublicKey, client, session, attempt) {
    attempt = Number(attempt || 0);
    var env = portalNotifyEnvironment();
    var standalone =
      typeof portalIsStandalonePwa === "function" ? portalIsStandalonePwa() : false;
    var buildKey = "portal_web_push_build";
    var buildVal = "20260619-portal-only-v1";
    var prevBuild = persistGet(buildKey);
    if (
      env.isIOS &&
      env.mobile &&
      standalone &&
      prevBuild &&
      prevBuild !== buildVal &&
      reg &&
      reg.pushManager
    ) {
      try {
        var oldSub = await reg.pushManager.getSubscription();
        if (oldSub) await oldSub.unsubscribe();
      } catch (_u) {}
    }
    var sub = await portalSubscribePushWithCurrentVapid(reg, vapidPublicKey);
    var posted = await portalPostPushSubscriptionToServer(client, session, sub);
    if (posted.ok) {
      if (env.isIOS && env.mobile && standalone) persistSet(buildKey, buildVal);
      return { ok: true, sub: sub };
    }
    if (posted.reason === "server-missing" && attempt < 1) {
      try {
        await sub.unsubscribe();
      } catch (_u) {}
      return portalEnsureFreshPushSubscription(reg, vapidPublicKey, client, session, attempt + 1);
    }
    return posted;
  }

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

  function portalVapidConfigured() {
    return !!(
      global.__PORTAL_VAPID_PUBLIC_KEY__ &&
      String(global.__PORTAL_VAPID_PUBLIC_KEY__).trim()
    );
  }

  function portalVapidStatusText() {
    if (portalVapidConfigured()) {
      return "VAPID configured — Turn on saves this device for background alerts. Send test checks this tab only; lock the phone or close the app to verify real push.";
    }
    return "VAPID missing (closed-tab push disabled) — alerts work in this tab until IT configures server push.";
  }

  function portalSubscribeFailureMessage(wp) {
    wp = wp || {};
    var reason = String(wp.reason || "").trim();
    if (reason === "no-session") {
      return "Sign-in still loading — wait a few seconds and tap Turn on again.";
    }
    if (reason === "no-vapid") {
      return "Server push keys (VAPID) missing — contact IT.";
    }
    if (reason === "no-sw" || reason === "sw-timeout") {
      return "Service worker not ready — refresh the page and try again.";
    }
    if (reason === "subscribe-http") {
      return (
        "Could not save subscription (HTTP " +
        String(wp.status || "?") +
        "). Check Edge Function portal-push-subscribe."
      );
    }
    if (reason === "no-notify-perm") {
      return "Allow notifications when the browser asks.";
    }
    if (reason === "exception") {
      return "Could not register push — try Chrome or Edge on desktop.";
    }
    return "Could not register this device for background alerts.";
  }

  function portalNotifyFrameHint(reason) {
    try {
      if (typeof global !== "undefined" && global.self !== global.top) {
        return " Open the portal in a full browser tab (not inside another site frame).";
      }
    } catch (_e) {}
    if (typeof global !== "undefined" && global.isSecureContext === false) {
      return " Needs HTTPS.";
    }
    var env =
      typeof portalNotifyEnvironment === "function" ? portalNotifyEnvironment() : null;
    if (typeof portalNotifyEnvironmentHint === "function") {
      return portalNotifyEnvironmentHint(env, reason);
    }
    return "";
  }

  function portalApplyWebPushStatus(statusEl, wp, opts) {
    opts = opts || {};
    if (!statusEl || !wp) return;
    var env =
      wp.env ||
      (typeof portalNotifyEnvironment === "function" ? portalNotifyEnvironment() : null);
    if (wp.ok) {
      statusEl.textContent =
        opts.registeredMessage ||
        "On — including alerts when this browser is in the background (Mac or Windows).";
      return;
    }
    if (wp.reason === "no-vapid") {
      statusEl.textContent =
        "On in this tab — server push needs IT setup (VAPID) for closed-browser alerts.";
      return;
    }
    if (wp.reason === "no-sw" || wp.reason === "sw-timeout") {
      statusEl.textContent =
        "On in this tab — background alerts need the browser service worker." +
        portalNotifyFrameHint(wp.reason);
      return;
    }
    if (wp.reason === "no-session") {
      statusEl.textContent = "On — finish sign-in to register this computer.";
      return;
    }
    if (wp.reason === "server-missing") {
      statusEl.textContent =
        "Could not save this device on the server — tap Register this device again." +
        portalNotifyFrameHint(wp.reason);
      return;
    }
    if (wp.reason === "subscribe-fn" || wp.reason === "subscribe-http") {
      statusEl.textContent =
        "Could not register push on the server (error " +
        String(wp.status || "?") +
        "). Try again or contact IT." +
        portalNotifyFrameHint(wp.reason);
      return;
    }
    if (env && env.desktop) {
      statusEl.textContent =
        "On in this tab — use Send test alert; for background alerts, check browser notification settings." +
        portalNotifyFrameHint(wp.reason);
    }
  }

  function portalWaitForPortalSession(maxMs) {
    maxMs = Number(maxMs || 12000);
    var start = Date.now();
    return new Promise(function (resolve) {
      (function tick() {
        var box = global.__PORTAL_SUPABASE__;
        var token =
          box && box.session && box.session.access_token
            ? String(box.session.access_token).trim()
            : "";
        if (token) {
          resolve(true);
          return;
        }
        if (Date.now() - start >= maxMs) {
          resolve(false);
          return;
        }
        setTimeout(tick, 220);
      })();
    });
  }

  async function portalRegisterPushAfterGrant(statusEl, opts) {
    opts = opts || {};
    if (typeof portalRegisterPortalServiceWorker === "function") {
      try {
        await portalRegisterPortalServiceWorker();
      } catch (_sw) {}
    }
    var hasSession = await portalWaitForPortalSession(15000);
    if (!hasSession) {
      return { ok: false, reason: "no-session" };
    }
    if (typeof global.portalEnsureWebPushSubscription !== "function") {
      return { ok: false, reason: "no-fn" };
    }
    var wp = await global.portalEnsureWebPushSubscription();
    if (wp && wp.ok) {
      return wp;
    }
    return wp || { ok: false, reason: "unknown" };
  }

  function portalSyncNotifyVapidHint(vapidEl) {
    if (!vapidEl) return;
    vapidEl.textContent = portalVapidStatusText();
    vapidEl.hidden = false;
  }

  async function portalShowBackgroundChatNotification(title, body, tag, data) {
    if (typeof global.Notification === "undefined") return false;
    if (global.Notification.permission !== "granted") return false;
    title = String(title || "New message").trim();
    body = String(body || "").trim();
    tag = String(tag || "portal-chat-bg-" + Date.now()).trim();
    data = data || {};
    var icon = "/portal/app-icon/icon-192.png?v=20260624-push-icon";
    var opts = {
      body: body,
      icon: icon,
      badge: icon,
      tag: tag,
      renotify: true,
      silent: false,
      vibrate: [120, 55, 120, 55, 160],
      data: data,
    };
    try {
      var reg =
        typeof global.portalRegisterPortalServiceWorker === "function"
          ? await global.portalRegisterPortalServiceWorker()
          : global.navigator && global.navigator.serviceWorker
            ? await global.navigator.serviceWorker.ready
            : null;
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(title, opts);
        return true;
      }
    } catch (_sw) {}
    try {
      new global.Notification(title, opts);
      return true;
    } catch (_n) {}
    return false;
  }

  global.portalVapidConfigured = portalVapidConfigured;
  global.portalVapidStatusText = portalVapidStatusText;
  global.portalSubscribeFailureMessage = portalSubscribeFailureMessage;
  global.portalNotifyFrameHint = portalNotifyFrameHint;
  global.portalApplyWebPushStatus = portalApplyWebPushStatus;
  global.portalWaitForPortalSession = portalWaitForPortalSession;
  global.portalRegisterPushAfterGrant = portalRegisterPushAfterGrant;
  global.portalSyncNotifyVapidHint = portalSyncNotifyVapidHint;
  global.portalSendLocalTestNotification = portalSendLocalTestNotification;
  global.portalTestNotificationStatusMessage = portalTestNotificationStatusMessage;
  global.portalNotifyEnvironment = portalNotifyEnvironment;
  global.portalNotifyEnvironmentHint = portalNotifyEnvironmentHint;
  global.portalUserActivationActive = global.portalUserActivationActive || portalUserActivationActive;
  global.portalRegisterPortalServiceWorker = portalRegisterPortalServiceWorker;
  global.portalAwaitServiceWorkerReady = portalAwaitServiceWorkerReady;
  global.portalSubscribePushWithCurrentVapid = portalSubscribePushWithCurrentVapid;
  global.portalEnsureFreshPushSubscription = portalEnsureFreshPushSubscription;
  global.portalPostPushSubscriptionToServer = portalPostPushSubscriptionToServer;
  global.portalServerHasPushEndpoint = portalServerHasPushEndpoint;
  global.portalShowBackgroundChatNotification = portalShowBackgroundChatNotification;
})(typeof window !== "undefined" ? window : globalThis);
