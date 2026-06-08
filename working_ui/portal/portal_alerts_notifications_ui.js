/**
 * Notifications block in alertsNotificationsSheet (staff / lead dashboards).
 * Test button stays visible; tap requests permission when still at default, then sends a test alert.
 */
(function (global) {
  "use strict";

  var bound = false;
  var PORTAL_NOTIFY_ICON = "/portal/app-icon/icon-192.png?v=20260624-push-icon";

  function portalNotifyIconOpts() {
    return { icon: PORTAL_NOTIFY_ICON, badge: PORTAL_NOTIFY_ICON };
  }

  function alertsSheetEl() {
    return document.getElementById("alertsNotificationsSheet");
  }

  function qNotify(id) {
    return document.getElementById(id);
  }

  function notifyContextHint() {
    try {
      if (typeof global !== "undefined" && global.self !== global.top) {
        return " Open the portal in a full browser tab (not inside another site frame).";
      }
    } catch (_e) {}
    if (typeof global !== "undefined" && global.isSecureContext === false) {
      return " Needs HTTPS.";
    }
    return "";
  }

  function syncTestButton(testBtn, permission) {
    if (!testBtn) return;
    if (typeof Notification === "undefined") {
      testBtn.hidden = true;
      return;
    }
    testBtn.hidden = false;
    testBtn.disabled = permission === "denied" || permission === "unsupported";
    testBtn.setAttribute(
      "aria-disabled",
      testBtn.disabled ? "true" : "false"
    );
    testBtn.textContent = "Send test alert";
    if (permission === "denied") {
      testBtn.title = "Allow notifications in browser settings first.";
    } else {
      testBtn.title = "Turns alerts on and sends a test notification.";
    }
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
      statusEl.textContent = "On — announcements and roster changes.";
      if (typeof global.portalEnsureWebPushSubscription === "function") {
        global.portalEnsureWebPushSubscription().then(function (wp) {
          if (wp && wp.ok) {
            statusEl.textContent = "On — including alerts when the app is closed.";
          } else if (wp && wp.reason === "no-vapid") {
            statusEl.textContent = "On — alerts when app is closed need ops setup.";
          } else if (wp && wp.reason === "no-sw") {
            statusEl.textContent = "On — closed-app alerts may be limited here.";
          } else if (wp && wp.reason === "no-session") {
            statusEl.textContent = "On — finish sign-in to register this device.";
          }
        });
      }
      if (btn) {
        btn.textContent = "Notifications on";
        btn.disabled = true;
      }
    } else if (p === "denied") {
      statusEl.textContent =
        "Blocked — allow notifications for this site in browser settings." + ctx;
      if (btn) {
        btn.textContent = "Open browser settings";
        btn.disabled = false;
      }
    } else {
      var env =
        typeof global.portalNotifyEnvironment === "function"
          ? global.portalNotifyEnvironment()
          : null;
      var desktopHint =
        env && env.desktop
          ? " Alerts turn on with one tap anywhere on the dashboard (Mac and Windows each need Allow in that browser)."
          : " Alerts turn on with one tap anywhere on the dashboard.";
      if (typeof global.portalNotifyEnvironmentHint === "function") {
        desktopHint += global.portalNotifyEnvironmentHint(env);
      }
      statusEl.textContent = desktopHint + ctx;
      if (btn) {
        btn.textContent = "Turn on notifications";
        btn.disabled = false;
      }
    }
    syncTestButton(testBtn, p);
    if (typeof global.portalSyncAlertsSettingsChrome === "function") {
      global.portalSyncAlertsSettingsChrome();
    }
    if (typeof global.portalRefreshEnableAllUi === "function") {
      global.portalRefreshEnableAllUi();
    }
  }

  global.portalRefreshAlertsNotifyUi = refresh;

  function requestNotifyThenRefresh() {
    var statusEl = qNotify("portalNotifyStatus");
    if (typeof Notification === "undefined") return Promise.resolve();
    if (Notification.permission === "denied") {
      refresh();
      return Promise.resolve();
    }
    if (Notification.permission === "granted") {
      if (typeof global.portalEnsureWebPushSubscription === "function") {
        return global.portalEnsureWebPushSubscription().then(function () {
          refresh();
        }, function () {
          refresh();
        });
      }
      refresh();
      return Promise.resolve();
    }
    return Notification.requestPermission()
      .then(function (r) {
        if (r === "granted") {
          try {
            new Notification("Portal alerts on", Object.assign({
              body: "Announcements, roster changes and incoming calls on this device.",
            }, portalNotifyIconOpts()));
          } catch (e) {
            if (statusEl) {
              statusEl.textContent =
                "Permission was granted but the browser did not show a banner: " +
                (e && e.message ? e.message : String(e)) +
                notifyContextHint();
            }
            refresh();
            return;
          }
          if (typeof global.portalEnsureWebPushSubscription === "function") {
            return global.portalEnsureWebPushSubscription().then(function () {
              refresh();
            }, function () {
              refresh();
            });
          }
        } else if (r !== "default" && statusEl) {
          statusEl.textContent =
            "Notification permission was not granted (" + String(r) + ")." + notifyContextHint();
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

  function onEnableClick() {
    void requestNotifyThenRefresh();
  }

  function onTestClick() {
    var statusEl = qNotify("portalNotifyStatus");
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      void requestNotifyThenRefresh().then(function () {
        if (Notification.permission !== "granted") return;
        sendTestNotification(statusEl);
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

  function sendTestNotification(statusEl) {
    var finish = function (result) {
      if (statusEl) {
        statusEl.textContent =
          typeof global.portalTestNotificationStatusMessage === "function"
            ? global.portalTestNotificationStatusMessage(result || { ok: true })
            : "Test sent — if you saw the banner, this device is ready.";
      }
      if (typeof global.portalEnsureWebPushSubscription === "function") {
        void global.portalEnsureWebPushSubscription().then(function (wp) {
          if (statusEl && wp && wp.ok) {
            statusEl.textContent = "On — including alerts when the app is closed.";
          }
          refresh();
        });
      } else {
        refresh();
      }
    };
    if (typeof global.portalSendLocalTestNotification === "function") {
      void global
        .portalSendLocalTestNotification({
          title: "Test: portal notification",
          body: "If you see this, notifications can reach your device.",
        })
        .then(finish);
      return;
    }
    try {
      new Notification("Test: portal notification", Object.assign({
        body: "If you see this, notifications can reach your device.",
      }, portalNotifyIconOpts()));
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      finish({ ok: true });
    } catch (e) {
      if (statusEl) {
        statusEl.textContent =
          "Could not show test notification: " +
          (e && e.message ? e.message : String(e)) +
          notifyContextHint();
      }
    }
  }

  function onContinueClick(btn) {
    var statusEl = qNotify("portalEnableAllStatus");
    if (typeof global.portalRequestDefaultPortalPermissions === "function") {
      btn.disabled = true;
      var prev = btn.textContent;
      btn.textContent = "Allow when asked…";
      void global.portalRequestDefaultPortalPermissions().finally(function () {
        if (typeof global.portalRefreshEnableAllUi === "function") {
          global.portalRefreshEnableAllUi();
        }
        refresh();
        if (
          typeof global.portalMandatoryAlertsSettingsComplete === "function" &&
          global.portalMandatoryAlertsSettingsComplete()
        ) {
          return;
        }
        btn.disabled = false;
        btn.textContent = prev;
      });
      return;
    }
    if (statusEl) {
      statusEl.textContent =
        "Still loading — close this sheet, wait a few seconds, open Settings again and tap Continue.";
    }
    void requestNotifyThenRefresh();
  }

  function bindAlertsSheetUi() {
    var alertsSheet = alertsSheetEl();
    if (!alertsSheet || bound) return;
    bound = true;
    alertsSheet.addEventListener(
      "click",
      function (e) {
        var t =
          e.target && e.target.closest
            ? e.target.closest(
                "#portalNotifyEnableBtn, #portalNotifyTestBtn, #portalEnableAllBtn"
              )
            : null;
        if (!t || !alertsSheet.contains(t)) return;
        e.preventDefault();
        if (t.disabled) return;
        if (t.id === "portalNotifyEnableBtn") onEnableClick();
        else if (t.id === "portalNotifyTestBtn") onTestClick();
        else if (t.id === "portalEnableAllBtn") onContinueClick(t);
      },
      true
    );
  }

  function init() {
    bindAlertsSheetUi();
    if (typeof global.portalBindPortalLocationPermissionUi === "function") {
      try {
        global.portalBindPortalLocationPermissionUi();
      } catch (_e) {}
    }
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.addEventListener("portal:supabase-ready", function () {
    bindAlertsSheetUi();
    if (typeof global.portalBindPortalLocationPermissionUi === "function") {
      try {
        global.portalBindPortalLocationPermissionUi();
      } catch (_e2) {}
    }
    refresh();
  });
})(typeof window !== "undefined" ? window : globalThis);
