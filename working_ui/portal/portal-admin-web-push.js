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
    if (typeof global.portalRefreshAlertsNotifyUi === "function") {
      global.portalRefreshAlertsNotifyUi();
    }
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
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
        return { ok: false, reason: "no-sw" };
      }
      if (
        typeof Notification === "undefined" ||
        Notification.permission !== "granted"
      ) {
        return { ok: false, reason: "no-notify-perm" };
      }
      var vapid = PORTAL_VAPID_PUBLIC_KEY;
      if (!vapid) return { ok: false, reason: "no-vapid" };
      var reg = await navigator.serviceWorker.ready;
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

    function notifyContextHint() {
      try {
        if (typeof global !== "undefined" && global.self !== global.top) {
          return " Open the portal in a full browser tab.";
        }
      } catch (_) {}
      if (typeof global !== "undefined" && global.isSecureContext === false) {
        return " Needs HTTPS.";
      }
      return "";
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
        if (testBtn) testBtn.hidden = true;
        return;
      }
      var p = Notification.permission;
      if (p === "granted") {
        statusEl.textContent =
          "On — chat, late submissions, and ops alerts when this tab is in the background.";
        if (typeof global.portalEnsureWebPushSubscription === "function") {
          global.portalEnsureWebPushSubscription().then(function (wp) {
            if (wp && wp.ok) {
              statusEl.textContent =
                "On — including alerts when the browser is closed.";
            } else if (wp && wp.reason === "no-vapid") {
              statusEl.textContent =
                "On — closed-browser alerts need ops VAPID setup.";
            } else if (wp && wp.reason === "no-sw") {
              statusEl.textContent =
                "On — closed-browser alerts may be limited on this device.";
            } else if (wp && wp.reason === "no-session") {
              statusEl.textContent =
                "On — finish sign-in to register this device.";
            }
          });
        }
        if (btn) {
          btn.textContent = "Notifications on";
          btn.disabled = true;
        }
        if (testBtn) testBtn.hidden = false;
      } else if (p === "denied") {
        statusEl.textContent =
          "Blocked — allow notifications for this site in browser settings." + ctx;
        if (btn) {
          btn.textContent = "Open browser settings";
          btn.disabled = false;
        }
        if (testBtn) testBtn.hidden = true;
      } else {
        statusEl.textContent = "Off — tap below to allow." + ctx;
        if (btn) {
          btn.textContent = "Turn on notifications";
          btn.disabled = false;
        }
        if (testBtn) testBtn.hidden = true;
      }
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

    function onTestClick() {
      var statusEl = qNotify("portalNotifyStatus");
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") {
        if (statusEl) {
          statusEl.textContent =
            "Allow notifications first (Turn on), then use Send test." +
            notifyContextHint();
        }
        refresh();
        return;
      }
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
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        typeof global.portalEnsureWebPushSubscription === "function"
      ) {
        void global.portalEnsureWebPushSubscription();
      }
    } catch (_) {}
  });

  (function portalAdminRegisterServiceWorkerEarly() {
    if (!("serviceWorker" in navigator)) return;
    try {
      var swUrl = new URL("clubsensational-portal-sw.js", global.location.href).href;
      var scopeBase = new URL("./", global.location.href).href;
      navigator.serviceWorker
        .register(swUrl, { scope: scopeBase })
        .then(function (reg) {
          global.__PORTAL_SW_REG__ = reg;
        })
        .catch(function (e) {
          console.warn("[portal-admin] service worker register", e);
        });
    } catch (e) {
      console.warn("[portal-admin] service worker", e);
    }
  })();

  if ("serviceWorker" in navigator) {
    try {
      navigator.serviceWorker.addEventListener("message", function (ev) {
        try {
          var d = ev.data;
          if (!d || d.type !== "portal-notification-click") return;
          if (d.portalOpen === "alerts") {
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
