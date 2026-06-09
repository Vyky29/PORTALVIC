/**
 * Notifications block in alertsNotificationsSheet (staff / lead dashboards).
 * Parity with admin device-notifications sheet (VAPID status, register + test).
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

  function notifyContextHint(reason) {
    if (typeof global.portalNotifyFrameHint === "function") {
      return global.portalNotifyFrameHint(reason);
    }
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

  function syncVapidHint() {
    var vapidEl = qNotify("portalNotifyVapidHint");
    if (typeof global.portalSyncNotifyVapidHint === "function") {
      global.portalSyncNotifyVapidHint(vapidEl);
    } else if (vapidEl) {
      vapidEl.hidden = true;
    }
  }

  function syncTestButton(testBtn, permission, opts) {
    opts = opts || {};
    if (!testBtn) return;
    testBtn.classList.remove("portal-alerts-test-btn--ready");
    if (typeof Notification === "undefined") {
      testBtn.hidden = true;
      return;
    }
    if (permission !== "granted") {
      testBtn.hidden = true;
      testBtn.disabled = true;
      testBtn.setAttribute("aria-disabled", "true");
      return;
    }
    testBtn.hidden = false;
    testBtn.disabled = false;
    testBtn.setAttribute("aria-disabled", "false");
    testBtn.textContent = "Send test alert";
    if (opts.highlight) {
      testBtn.classList.add("portal-alerts-test-btn--ready");
    }
    testBtn.title = "Sends a test banner on this device.";
  }

  function refresh() {
    var statusEl = qNotify("portalNotifyStatus");
    var btn = qNotify("portalNotifyEnableBtn");
    var testBtn = qNotify("portalNotifyTestBtn");
    syncVapidHint();
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
        "On — tap Send test alert to confirm banners reach this device.";
      syncTestButton(testBtn, p);
      if (typeof global.portalEnsureWebPushSubscription === "function") {
        global.portalEnsureWebPushSubscription().then(function (wp) {
          if (typeof global.portalApplyWebPushStatus === "function") {
            global.portalApplyWebPushStatus(statusEl, wp);
          } else if (wp && wp.ok) {
            statusEl.textContent =
              "On — including alerts when this browser is in the background (Mac or Windows).";
          }
          syncTestButton(testBtn, "granted", { highlight: !!(wp && wp.ok) });
          if (btn) {
            if (wp && wp.ok) {
              btn.textContent = "Notifications on";
              btn.disabled = true;
            } else {
              btn.textContent = "Register this device";
              btn.disabled = false;
            }
          }
        });
      } else if (btn) {
        btn.textContent = "Register this device";
        btn.disabled = false;
      }
    } else if (p === "denied") {
      syncTestButton(testBtn, p);
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
      statusEl.textContent =
        (env && env.desktop
          ? "Tap Turn on once on this computer (each Mac/Windows browser needs its own Allow)."
          : "Tap Turn on to allow notifications on this device.") + ctx;
      if (btn) {
        btn.textContent = "Turn on notifications";
        btn.disabled = false;
      }
      syncTestButton(testBtn, p);
    }
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
      if (typeof global.portalRegisterPushAfterGrant === "function") {
        return global.portalRegisterPushAfterGrant(statusEl).then(function () {
          refresh();
        });
      }
      if (typeof global.portalEnsureWebPushSubscription === "function") {
        return global.portalEnsureWebPushSubscription().then(function () {
          refresh();
        }, refresh);
      }
      refresh();
      return Promise.resolve();
    }
    if (statusEl) statusEl.textContent = "Waiting for browser permission…";
    return Notification.requestPermission()
      .then(function (r) {
        if (r === "granted") {
          try {
            new Notification(
              "Portal alerts on",
              Object.assign(
                {
                  body: "Announcements, roster changes and incoming calls on this device.",
                },
                portalNotifyIconOpts()
              )
            );
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
          if (typeof global.portalRegisterPushAfterGrant === "function") {
            return global.portalRegisterPushAfterGrant(statusEl).then(refresh);
          }
        } else if (r !== "default" && statusEl) {
          statusEl.textContent =
            "Notification permission was not granted (" + String(r) + ")." +
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

  function onEnableClick() {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") {
      refresh();
      return;
    }
    void requestNotifyThenRefresh();
  }

  function sendTestNotification(statusEl) {
    var finish = function (result) {
      if (statusEl) {
        statusEl.textContent =
          typeof global.portalTestNotificationStatusMessage === "function"
            ? global.portalTestNotificationStatusMessage(result || { ok: true })
            : "Test sent — if you saw the banner, this device is ready.";
      }
      refresh();
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
      new Notification(
        "Test: portal notification",
        Object.assign(
          {
            body: "If you see this, notifications can reach your device.",
          },
          portalNotifyIconOpts()
        )
      );
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

  function onTestClick() {
    var statusEl = qNotify("portalNotifyStatus");
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      if (statusEl) statusEl.textContent = "Waiting for browser permission…";
      void requestNotifyThenRefresh().then(function () {
        refresh();
        if (Notification.permission === "granted") {
          void (typeof global.portalRegisterPushAfterGrant === "function"
            ? global.portalRegisterPushAfterGrant(statusEl).then(function () {
                sendTestNotification(statusEl);
              })
            : Promise.resolve().then(function () {
                sendTestNotification(statusEl);
              }));
        }
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
    var runTest = function () {
      sendTestNotification(statusEl);
    };
    if (typeof global.portalRegisterPushAfterGrant === "function") {
      void global.portalRegisterPushAfterGrant(statusEl).then(runTest);
      return;
    }
    runTest();
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
          global.portalMandatoryAlertsSettingsComplete() &&
          typeof global.portalRegisterPushAfterGrant === "function" &&
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          void global.portalRegisterPushAfterGrant(qNotify("portalNotifyStatus")).then(
            refresh
          );
        }
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
