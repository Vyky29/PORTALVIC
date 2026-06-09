/**
 * Admin dashboard — Web Push subscription + notifications sheet (parity with staff/lead).
 */
(function (global) {
  "use strict";

  var SUPABASE_CLIENT_MODULE =
    "/portal/supabase-client.js?v=20260616-tinashe-shared-feedback";

  var PORTAL_VAPID_PUBLIC_KEY =
    typeof global !== "undefined" && global.__PORTAL_VAPID_PUBLIC_KEY__
      ? String(global.__PORTAL_VAPID_PUBLIC_KEY__).trim()
      : "";

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

  var portalInboundAlertLastAt = 0;

  function portalAdminToastFallback(msg, ms) {
    var m = String(msg || "").trim();
    if (!m) return;
    if (typeof global.portalAdminToast === "function") {
      global.portalAdminToast(m);
      return;
    }
    var t = document.getElementById("opwfToast");
    if (!t) return;
    t.textContent = m;
    t.classList.add("is-on");
    clearTimeout(portalAdminToastFallback._tm);
    portalAdminToastFallback._tm = setTimeout(function () {
      t.classList.remove("is-on");
    }, ms || 4200);
  }

  function portalAdminPulseAlertBadge() {
    var bd = document.getElementById("alertBadge");
    if (!bd) return;
    bd.classList.add("portal-alert-badge--pulse");
    clearTimeout(portalAdminPulseAlertBadge._tm);
    portalAdminPulseAlertBadge._tm = setTimeout(function () {
      bd.classList.remove("portal-alert-badge--pulse");
    }, 3600);
  }

  function portalAdminShowInboundAlert(payload) {
    payload = payload || {};
    var now = Date.now();
    if (now - portalInboundAlertLastAt < 1400) return;
    portalInboundAlertLastAt = now;
    var title = String(payload.title || "New alert").trim();
    var body = String(payload.body || payload.sub || "").trim();
    var msg = body ? title + " — " + body : title;
    portalAdminToastFallback(msg, 4200);
    portalAdminPulseAlertBadge();
    if (typeof global.__portalAdminRenderAlerts === "function") {
      try {
        global.__portalAdminRenderAlerts();
      } catch (_) {}
    }
  }

  global.portalAdminShowInboundAlert = portalAdminShowInboundAlert;
  global.portalAdminPulseAlertBadge = portalAdminPulseAlertBadge;

  function portalAdminDmDismissChatPushNotifications() {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .getRegistration()
      .then(function (reg) {
        if (!reg || typeof reg.getNotifications !== "function") return;
        return reg.getNotifications();
      })
      .then(function (notifications) {
        (notifications || []).forEach(function (n) {
          try {
            var tag = String(n.tag || "");
            if (tag.indexOf("portal-chat-") === 0) n.close();
          } catch (_c) {}
        });
      })
      .catch(function () {});
  }
  global.portalAdminDmDismissChatPushNotifications =
    portalAdminDmDismissChatPushNotifications;

  async function portalAdminOpenChatFromPush(chat) {
    chat = chat || {};
    var threadId = String(chat.threadId || chat.thread_id || "").trim();
    var groupId = String(chat.groupId || chat.group_id || "").trim();
    try {
      if (typeof global.portalAdminDmSyncIncomingAttention === "function") {
        await global.portalAdminDmSyncIncomingAttention({ suppressNotify: true });
      }
    } catch (_) {}
    if (typeof global.portalAdminNavigateToCsCliq === "function") {
      await global.portalAdminNavigateToCsCliq();
    }
    if (groupId && typeof global.portalAdminDmOpenGroupThread === "function") {
      await global.portalAdminDmOpenGroupThread(groupId);
      if (typeof global.portalAdminDmDismissChatPushNotifications === "function") {
        global.portalAdminDmDismissChatPushNotifications();
      }
      return;
    }
    if (threadId && typeof global.portalAdminDmOpenThread === "function") {
      await global.portalAdminDmOpenThread(threadId);
      if (typeof global.portalAdminDmDismissChatPushNotifications === "function") {
        global.portalAdminDmDismissChatPushNotifications();
      }
      return;
    }
    portalAdminOpenAlertsNotificationsSheet();
  }
  global.portalAdminOpenChatFromPush = portalAdminOpenChatFromPush;

  function portalAdminHandleForegroundPush(d) {
    if (!d) return;
    if (d.portalOpen === "incoming_call") {
      if (typeof global.portalHandleIncomingCallPush === "function") {
        var call = d.call || {};
        void global.portalHandleIncomingCallPush({
          msgId: call.messageId || call.msgId,
          src: call.source || call.src || "dm",
        });
      }
      return;
    }
    if (d.portalOpen === "chat") {
      void portalAdminOpenChatFromPush(d.chat || {});
      return;
    }
    try {
      if (typeof global.portalAdminDmSyncIncomingAttention === "function") {
        void global.portalAdminDmSyncIncomingAttention({ suppressNotify: true });
      }
      if (typeof global.portalSyncFloatingChatUnreadFromMenuBtn === "function") {
        global.portalSyncFloatingChatUnreadFromMenuBtn();
      }
    } catch (_) {}
    portalAdminShowInboundAlert({
      title: d.title,
      body: d.body,
    });
  }

  function portalAdminRequestNotificationsPermission() {
    if (typeof Notification === "undefined") return Promise.resolve("unsupported");
    if (Notification.permission === "granted") {
      return Promise.resolve("granted");
    }
    if (Notification.permission === "denied") {
      return Promise.resolve("denied");
    }
    return Notification.requestPermission().then(function (r) {
      return r === "granted" ? "granted" : r === "denied" ? "denied" : "prompt";
    });
  }

  function portalAdminOpenAlertsNotificationsSheet() {
    var sheet = document.getElementById("alertsNotificationsSheet");
    var backdrop = document.getElementById("portalAdminSheetBackdrop");
    if (!sheet) return;
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    if (backdrop) {
      backdrop.classList.add("open");
      backdrop.setAttribute("aria-hidden", "false");
    }
    void portalOnAdminAlertsSheetOpened();
  }

  function portalAdminSubscribeFailureMessage(wp) {
    wp = wp || {};
    var reason = String(wp.reason || "").trim();
    if (reason === "no-session") {
      return "Sign-in still loading — wait a few seconds and tap Turn on again.";
    }
    if (reason === "no-vapid") {
      return "Server push keys missing — contact IT.";
    }
    if (reason === "no-sw" || reason === "sw-timeout") {
      return "Service worker not ready — refresh the page and try again.";
    }
    if (reason === "subscribe-http") {
      return "Could not save subscription (HTTP " + String(wp.status || "?") + "). Check Edge Function portal-push-subscribe.";
    }
    if (reason === "no-notify-perm") {
      return "Allow notifications when the browser asks.";
    }
    if (reason === "exception") {
      return "Could not register push — try Chrome or Edge on desktop.";
    }
    return "Could not register this device for background alerts.";
  }

  function portalAdminWaitForSession(maxMs) {
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

  async function portalAdminRegisterPushAfterGrant(statusEl) {
    if (typeof global.portalRegisterPortalServiceWorker === "function") {
      try {
        await global.portalRegisterPortalServiceWorker();
      } catch (_) {}
    }
    var hasSession = await portalAdminWaitForSession(15000);
    if (!hasSession) {
      return { ok: false, reason: "no-session" };
    }
    if (typeof global.portalEnsureWebPushSubscription !== "function") {
      return { ok: false, reason: "no-fn" };
    }
    var wp = await global.portalEnsureWebPushSubscription();
    return wp || { ok: false, reason: "unknown" };
  }

  async function portalOnAdminAlertsSheetOpened() {
    if (typeof global.portalRefreshAlertsNotifyUi === "function") {
      global.portalRefreshAlertsNotifyUi();
    }
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      typeof global.portalEnsureWebPushSubscription === "function"
    ) {
      void portalAdminRegisterPushAfterGrant(null);
    }
  }

  function qNotify(id) {
    return document.getElementById(id);
  }

  function notifyContextHint(reason) {
    var parts = "";
    try {
      if (typeof global !== "undefined" && global.self !== global.top) {
        parts += " Open the portal in a full browser tab.";
      }
    } catch (_) {}
    if (typeof global !== "undefined" && global.isSecureContext === false) {
      parts += " Needs HTTPS.";
    }
    if (typeof global.portalNotifyEnvironmentHint === "function") {
      parts += global.portalNotifyEnvironmentHint(null, reason);
    }
    return parts;
  }

  function portalEnsureAdminMandatoryNotifications() {
    try {
      var persistGet =
        typeof global.portalPersistGet === "function"
          ? global.portalPersistGet
          : function (k) {
              try {
                return global.localStorage.getItem(k);
              } catch (_) {
                return null;
              }
            };
      var persistSet =
        typeof global.portalPersistSet === "function"
          ? global.portalPersistSet
          : function (k, v) {
              try {
                global.localStorage.setItem(k, String(v));
              } catch (_) {}
            };
      if (persistGet("portal_admin_alerts_setup_v1") === "1") return;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        persistSet("portal_admin_alerts_setup_v1", "1");
        if (typeof global.portalEnsureWebPushSubscription === "function") {
          void global.portalEnsureWebPushSubscription();
        }
        return;
      }
      persistSet("portal_admin_alerts_setup_v1", "1");
      requestAnimationFrame(portalAdminOpenAlertsNotificationsSheet);
    } catch (_) {}
  }

  function portalAdminCloseAlertsNotificationsSheet() {
    var sheet = document.getElementById("alertsNotificationsSheet");
    var backdrop = document.getElementById("portalAdminSheetBackdrop");
    if (sheet) {
      sheet.classList.remove("open");
      sheet.setAttribute("aria-hidden", "true");
    }
    if (backdrop) {
      backdrop.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
    }
  }

  global.portalAdminOpenAlertsNotificationsSheet =
    portalAdminOpenAlertsNotificationsSheet;
  global.portalAdminCloseAlertsNotificationsSheet =
    portalAdminCloseAlertsNotificationsSheet;

  global.portalEnsureWebPushSubscription = async function portalEnsureWebPushSubscription() {
    if (global.__PORTAL_WPS_IN_FLIGHT) return { ok: true, reason: "in-flight" };
    global.__PORTAL_WPS_IN_FLIGHT = true;
    try {
      var env =
        typeof global.portalNotifyEnvironment === "function"
          ? global.portalNotifyEnvironment()
          : { pushSupported: true, desktop: true };
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return { ok: false, reason: "no-sw", env: env };
      }
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      ) {
        return { ok: false, reason: "no-notify-perm", env: env };
      }
      var vapid = PORTAL_VAPID_PUBLIC_KEY;
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
      var keyU8 = portalUrlBase64ToUint8Array(vapid);
      var sub =
        typeof global.portalSubscribePushWithCurrentVapid === "function"
          ? await global.portalSubscribePushWithCurrentVapid(reg, vapid)
          : await (async function () {
              var existing = await reg.pushManager.getSubscription();
              if (existing) return existing;
              return reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: keyU8,
              });
            })();
      var box = global.__PORTAL_SUPABASE__;
      var token =
        box && box.session && box.session.access_token
          ? String(box.session.access_token).trim()
          : "";
      if (!token) return { ok: false, reason: "no-session" };
      var mod = await import(SUPABASE_CLIENT_MODULE);
      var fnUrl =
        typeof mod.getSupabaseFunctionUrl === "function"
          ? mod.getSupabaseFunctionUrl("portal-push-subscribe")
          : "";
      var anon =
        typeof mod.getSupabaseAnonKey === "function" ? mod.getSupabaseAnonKey() : "";
      if (!fnUrl || !anon) return { ok: false, reason: "no-fn-url" };
      var res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: anon,
        },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) {
        var detail = "";
        try {
          detail = await res.text();
        } catch (_) {}
        console.warn("[portal-admin] portal-push-subscribe", res.status, detail);
        return { ok: false, reason: "subscribe-http", status: res.status };
      }
      return { ok: true };
    } catch (e) {
      console.warn("[portal-admin] portalEnsureWebPushSubscription", e);
      return { ok: false, reason: "exception" };
    } finally {
      global.__PORTAL_WPS_IN_FLIGHT = false;
    }
  };

  (function initPortalAdminAlertsNotificationsUi() {
    var alertsUiBound = false;

    function applyWebPushStatus(statusEl, wp) {
      /* UI stays silent — button state only */
    }

    function syncTestButton(testBtn, permission, opts) {
      if (testBtn) testBtn.hidden = true;
    }

    function refresh() {
      var statusEl = qNotify("portalNotifyStatus");
      var btn = qNotify("portalNotifyEnableBtn");
      var testBtn = qNotify("portalNotifyTestBtn");
      if (statusEl) statusEl.textContent = "";
      syncTestButton(testBtn, "unsupported");
      if (typeof Notification === "undefined") {
        if (btn) btn.disabled = true;
        return;
      }
      var p = Notification.permission;
      if (p === "granted") {
        if (typeof global.portalEnsureWebPushSubscription === "function") {
          global.portalEnsureWebPushSubscription().then(function (wp) {
            if (btn) {
              if (wp && wp.ok) {
                btn.textContent = "Notifications on";
                btn.disabled = true;
              } else {
                btn.textContent = "Turn on notifications";
                btn.disabled = false;
              }
            }
          });
        } else if (btn) {
          btn.textContent = "Turn on notifications";
          btn.disabled = false;
        }
      } else if (p === "denied") {
        if (btn) {
          btn.textContent = "Turn on notifications";
          btn.disabled = false;
        }
      } else if (btn) {
        btn.textContent = "Turn on notifications";
        btn.disabled = false;
      }
    }

    global.portalRefreshAlertsNotifyUi = refresh;

    function onEnableClick() {
      if (typeof Notification === "undefined") return;
      var statusEl = qNotify("portalNotifyStatus");
      if (Notification.permission === "granted") {
        void portalAdminRegisterPushAfterGrant(statusEl).then(function () {
          refresh();
        });
        return;
      }
      Notification.requestPermission()
        .then(function (r) {
          if (r === "granted") {
            return portalAdminRegisterPushAfterGrant(statusEl);
          }
        })
        .then(function () {
          refresh();
        });
    }

    function sendTestNotification(statusEl) {
      return Promise.resolve();
    }

    function onTestClick() {
      /* hidden in UI */
    }

    function handleAlertsSheetButtonClick(t) {
      if (!t || t.disabled) return;
      if (t.id === "portalNotifyEnableBtn") onEnableClick();
      else if (t.id === "portalNotifyTestBtn") onTestClick();
    }

    function bindAlertsSheetUi() {
      if (alertsUiBound) return;
      var alertsSheet = document.getElementById("alertsNotificationsSheet");
      if (!alertsSheet) return;
      alertsUiBound = true;
      alertsSheet.addEventListener(
        "click",
        function (e) {
          var closeBtn =
            e.target && e.target.closest
              ? e.target.closest("#portalAdminAlertsSheetClose")
              : null;
          if (closeBtn && alertsSheet.contains(closeBtn)) {
            e.preventDefault();
            portalAdminCloseAlertsNotificationsSheet();
            return;
          }
          var t =
            e.target && e.target.closest
              ? e.target.closest("#portalNotifyEnableBtn, #portalNotifyTestBtn")
              : null;
          if (!t || !alertsSheet.contains(t)) return;
          e.preventDefault();
          handleAlertsSheetButtonClick(t);
        },
        true
      );
    }

    document.addEventListener(
      "click",
      function (e) {
        var t =
          e.target && e.target.closest
            ? e.target.closest("#portalNotifyEnableBtn, #portalNotifyTestBtn")
            : null;
        if (!t) return;
        var sheet = document.getElementById("alertsNotificationsSheet");
        if (!sheet || !sheet.contains(t) || !sheet.classList.contains("open")) return;
        e.preventDefault();
        handleAlertsSheetButtonClick(t);
      },
      true
    );

    var backdrop = document.getElementById("portalAdminSheetBackdrop");
    if (backdrop) {
      backdrop.addEventListener("click", portalAdminCloseAlertsNotificationsSheet);
    }

    document.addEventListener("click", function (e) {
      var openBtn =
        e.target && e.target.closest
          ? e.target.closest(
              '[data-open="alertsNotificationsSheet"], [data-admin-nav-action="device_notifications"]'
            )
          : null;
      if (!openBtn) return;
      e.preventDefault();
      portalAdminOpenAlertsNotificationsSheet();
    });

    function initAlertsUi() {
      bindAlertsSheetUi();
      refresh();
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initAlertsUi);
    } else {
      initAlertsUi();
    }
  })();

  global.addEventListener("portal:supabase-ready", function () {
    try {
      if (typeof global.portalRegisterPortalServiceWorker === "function") {
        void global.portalRegisterPortalServiceWorker();
      }
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        typeof global.portalEnsureWebPushSubscription === "function"
      ) {
        void global.portalEnsureWebPushSubscription().then(function (wp) {
          if (wp && wp.ok === false && wp.reason === "no-notify-perm") {
            requestAnimationFrame(portalAdminOpenAlertsNotificationsSheet);
          }
        });
      } else if (
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        requestAnimationFrame(portalAdminOpenAlertsNotificationsSheet);
      }
      portalEnsureAdminMandatoryNotifications();
    } catch (_) {}
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    try {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        typeof global.portalEnsureWebPushSubscription === "function"
      ) {
        void global.portalEnsureWebPushSubscription();
      }
      if (typeof global.portalRefreshAlertsNotifyUi === "function") {
        global.portalRefreshAlertsNotifyUi();
      }
    } catch (_) {}
  });

  if (typeof global.portalRegisterPortalServiceWorker === "function") {
    void global.portalRegisterPortalServiceWorker();
  }

  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.addEventListener("message", function (ev) {
        try {
          var d = ev.data;
          if (!d || !d.type) return;
          if (d.type === "portal-push-received") {
            portalAdminHandleForegroundPush(d);
            return;
          }
          if (d.type !== "portal-notification-click") return;
          if (d.portalOpen === "incoming_call") return;
          if (d.portalOpen === "chat") {
            void portalAdminOpenChatFromPush(d.chat || {});
            return;
          }
          if (d.portalOpen === "alerts") {
            try {
              if (typeof global.portalAdminDmSyncIncomingAttention === "function") {
                void global.portalAdminDmSyncIncomingAttention();
              }
            } catch (_) {}
            portalAdminOpenAlertsNotificationsSheet();
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  (function portalAdminConsumeOpenAlertsQuery() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      if (q.get("portalOpen") !== "alerts") return;
      q.delete("portalOpen");
      var next =
        global.location.pathname +
        (q.toString() ? "?" + q.toString() : "") +
        (global.location.hash || "");
      global.history.replaceState(null, "", next);
      requestAnimationFrame(portalAdminOpenAlertsNotificationsSheet);
    } catch (_) {}
  })();
})(typeof window !== "undefined" ? window : globalThis);
