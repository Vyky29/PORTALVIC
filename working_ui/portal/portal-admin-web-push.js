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

  function portalAdminHandleForegroundPush(d) {
    if (!d) return;
    if (d.portalOpen === "incoming_call") return;
    try {
      if (typeof global.portalAdminDmSyncIncomingAttention === "function") {
        void global.portalAdminDmSyncIncomingAttention();
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

  async function portalOnAdminAlertsSheetOpened() {
    if (
      typeof global.portalUserActivationActive === "function" &&
      global.portalUserActivationActive() &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      await portalAdminRequestNotificationsPermission();
      if (Notification.permission === "granted") {
        try {
          new Notification("Admin portal alerts on", {
            body: "Ops alerts on this computer (Mac or Windows).",
          });
        } catch (_) {}
        if (typeof global.portalEnsureWebPushSubscription === "function") {
          void global.portalEnsureWebPushSubscription();
        }
      }
    }
    if (typeof global.portalRefreshAlertsNotifyUi === "function") {
      global.portalRefreshAlertsNotifyUi();
    }
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
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyU8,
        });
      }
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
    var alertsSheet = document.getElementById("alertsNotificationsSheet");

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

    function applyWebPushStatus(statusEl, wp) {
      if (!statusEl || !wp) return;
      var env =
        wp.env ||
        (typeof global.portalNotifyEnvironment === "function"
          ? global.portalNotifyEnvironment()
          : null);
      if (wp.ok) {
        statusEl.textContent =
          "On — including alerts when this browser is in the background (Mac or Windows).";
        return;
      }
      if (wp.reason === "no-vapid") {
        statusEl.textContent = "On in this tab — server push needs IT setup for closed-browser alerts.";
        return;
      }
      if (wp.reason === "no-sw" || wp.reason === "sw-timeout") {
        statusEl.textContent =
          "On in this tab — background alerts need the browser service worker." +
          notifyContextHint(wp.reason);
        return;
      }
      if (wp.reason === "no-session") {
        statusEl.textContent = "On — finish sign-in to register this computer.";
        return;
      }
      if (env && env.desktop) {
        statusEl.textContent =
          "On in this tab — use Send test alert; for background alerts, check browser notification settings." +
          notifyContextHint(wp.reason);
      }
    }

    function syncTestButton(testBtn, permission) {
      if (!testBtn) return;
      if (typeof Notification === "undefined") {
        testBtn.hidden = true;
        return;
      }
      testBtn.hidden = false;
      testBtn.disabled = permission === "denied" || permission === "unsupported";
      testBtn.setAttribute("aria-disabled", testBtn.disabled ? "true" : "false");
    }

    function refresh() {
      var statusEl = qNotify("portalNotifyStatus");
      var btn = qNotify("portalNotifyEnableBtn");
      var testBtn = qNotify("portalNotifyTestBtn");
      if (!statusEl) return;
      var ctx = notifyContextHint();
      if (typeof Notification === "undefined") {
        statusEl.textContent = "Not supported on this browser." + ctx;
        if (btn) btn.disabled = true;
        syncTestButton(testBtn, "unsupported");
        return;
      }
      var p = Notification.permission;
      if (p === "granted") {
        statusEl.textContent =
          "On — chat, late submissions, and ops alerts on this computer (same setup on Mac and Windows).";
        if (typeof global.portalEnsureWebPushSubscription === "function") {
          global.portalEnsureWebPushSubscription().then(function (wp) {
            applyWebPushStatus(statusEl, wp);
          });
        }
        if (btn) {
          btn.textContent = "Notifications on";
          btn.disabled = true;
        }
      } else if (p === "denied") {
        statusEl.textContent =
          "Blocked — allow notifications for this site in browser settings." +
          notifyContextHint("denied");
        if (btn) {
          btn.textContent = "Open browser settings";
          btn.disabled = false;
        }
      } else {
        var env =
          typeof global.portalNotifyEnvironment === "function"
            ? global.portalNotifyEnvironment()
            : null;
        statusEl.textContent =
          (env && env.desktop
            ? "Alerts are on by default — tap Turn on or Send test alert once on this computer (each Mac/Windows browser needs its own Allow)."
            : "Alerts are on by default — tap Turn on or Send test alert to allow on this device.") + ctx;
        if (btn) {
          btn.textContent = "Turn on notifications";
          btn.disabled = false;
        }
      }
      syncTestButton(testBtn, p);
    }

    global.portalRefreshAlertsNotifyUi = refresh;

    function onEnableClick() {
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "denied") {
        refresh();
        return;
      }
      var statusEl = qNotify("portalNotifyStatus");
      Notification.requestPermission()
        .then(function (r) {
          if (r === "granted") {
            try {
              new Notification("Admin portal alerts on", {
                body: "Ops alerts and chat on this device.",
              });
            } catch (e) {
              if (statusEl) {
                statusEl.textContent =
                  "Permission granted but the browser did not show a banner: " +
                  (e && e.message ? e.message : String(e)) +
                  notifyContextHint();
              }
              refresh();
              return;
            }
            if (typeof global.portalEnsureWebPushSubscription === "function") {
              void global
                .portalEnsureWebPushSubscription()
                .then(function () {
                  refresh();
                }, function () {
                  refresh();
                });
              return;
            }
          } else if (r !== "default" && statusEl) {
            statusEl.textContent =
              "Notification permission was not granted (" +
              String(r) +
              ")." +
              notifyContextHint();
          }
          refresh();
        })
        .catch(function (err) {
          if (statusEl) {
            statusEl.textContent =
              "Could not request notification permission: " +
              (err && err.message ? err.message : String(err)) +
              notifyContextHint();
          }
          refresh();
        });
    }

    function sendTestNotification(statusEl) {
      try {
        new Notification("Test: admin portal notification", {
          body: "If you see this, notifications can reach your device.",
        });
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      } catch (e) {
        if (statusEl) {
          statusEl.textContent =
            "Could not show test notification: " +
            (e && e.message ? e.message : String(e)) +
            notifyContextHint();
        }
      }
    }

    function onTestClick() {
      var statusEl = qNotify("portalNotifyStatus");
      if (typeof Notification === "undefined") return;
      if (Notification.permission === "default") {
        Notification.requestPermission()
          .then(function (r) {
            if (r === "granted") {
              try {
                new Notification("Admin portal alerts on", {
                  body: "Ops alerts and chat on this device.",
                });
              } catch (_) {}
              if (typeof global.portalEnsureWebPushSubscription === "function") {
                return global.portalEnsureWebPushSubscription();
              }
            }
          })
          .then(function () {
            refresh();
            if (Notification.permission === "granted") sendTestNotification(statusEl);
          })
          .catch(function () {
            refresh();
          });
        return;
      }
      if (Notification.permission !== "granted") {
        if (statusEl) {
          statusEl.textContent =
            "Allow notifications for this site in browser settings, then try Send test alert again." +
            notifyContextHint();
        }
        refresh();
        return;
      }
      sendTestNotification(statusEl);
    }

    if (alertsSheet) {
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
          if (t.disabled) return;
          if (t.id === "portalNotifyEnableBtn") onEnableClick();
          else if (t.id === "portalNotifyTestBtn") onTestClick();
        },
        true
      );
    }

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

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", refresh);
    } else {
      refresh();
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
