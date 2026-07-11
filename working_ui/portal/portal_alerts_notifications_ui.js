/**
 * Staff / lead Settings sheet — notifications, location, voice typing (adapted from admin).
 */
(function (global) {
  "use strict";

  var bound = false;

  function alertsSheetEl() {
    return document.getElementById("alertsNotificationsSheet");
  }

  function qNotify(id) {
    return document.getElementById(id);
  }

  function notifyContextHint(reason) {
    if (typeof global.portalNotifyEnvironmentHint === "function") {
      var env =
        typeof global.portalNotifyEnvironment === "function"
          ? global.portalNotifyEnvironment()
          : null;
      return global.portalNotifyEnvironmentHint(env, reason);
    }
    return "";
  }

  function silentPushRegister() {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (typeof global.portalEnsureWebPushSubscription === "function") {
      void global.portalEnsureWebPushSubscription();
    }
  }

  function applyWebPushStatus(statusEl, wp) {
    if (!statusEl || !wp) return;
    if (typeof global.portalApplyWebPushStatus === "function") {
      global.portalApplyWebPushStatus(statusEl, wp, {
        registeredMessage:
          "Registered for background alerts. Send test checks this tab only — close the app to verify real push.",
      });
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
    testBtn.hidden = false;
    testBtn.disabled = false;
    testBtn.setAttribute("aria-disabled", "false");
    if (permission === "granted") {
      testBtn.textContent = "Send test alert";
      if (opts.highlight) {
        testBtn.classList.add("portal-alerts-test-btn--ready");
      }
    } else if (permission === "denied") {
      testBtn.textContent = "Send test alert";
    } else {
      testBtn.textContent = "Send test alert";
    }
  }

  function syncVapidHint() {
    var vapidEl = qNotify("portalNotifyVapidHint");
    if (!vapidEl) return;
    if (typeof global.portalSyncNotifyVapidHint === "function") {
      global.portalSyncNotifyVapidHint(vapidEl);
      return;
    }
    if (typeof global.portalVapidStatusText === "function") {
      vapidEl.textContent = global.portalVapidStatusText();
      vapidEl.hidden = false;
    }
  }

  function syncDeniedHelp(show) {
    var el = qNotify("portalNotifyDeniedHelp");
    if (el) el.hidden = !show;
  }

  function refreshNotifyBlock() {
    var statusEl = qNotify("portalNotifyStatus");
    var btn = qNotify("portalNotifyEnableBtn");
    var testBtn = qNotify("portalNotifyTestBtn");
    if (!statusEl) return;
    var ctx = notifyContextHint();
    syncVapidHint();
    syncDeniedHelp(false);
    if (typeof Notification === "undefined") {
      statusEl.textContent = "Not supported on this browser." + ctx;
      if (btn) btn.disabled = true;
      syncTestButton(testBtn, "unsupported");
      return;
    }
    var p = Notification.permission;
    if (p === "granted") {
      statusEl.textContent =
        "Notifications on — Send test checks this tab only.";
      syncTestButton(testBtn, p);
      if (typeof global.portalEnsureWebPushSubscription === "function") {
        global.portalEnsureWebPushSubscription().then(function (wp) {
          applyWebPushStatus(statusEl, wp);
          if (wp && wp.ok) {
            statusEl.textContent =
              "Registered for background alerts. Send test checks this tab only — close the app to verify real push.";
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
      if (typeof global.portalShowNotificationDeniedHelp === "function") {
        global.portalShowNotificationDeniedHelp({ scroll: false });
      } else {
        syncDeniedHelp(true);
      }
      statusEl.textContent =
        "Blocked — allow notifications for this site in browser settings." + ctx;
      if (btn) {
        btn.textContent = "Check browser settings";
        btn.disabled = false;
      }
    } else {
      var env =
        typeof global.portalNotifyEnvironment === "function"
          ? global.portalNotifyEnvironment()
          : null;
      syncTestButton(testBtn, p);
      statusEl.textContent =
        "Off — tap Turn on notifications and choose Allow in the browser prompt." +
        (env && env.desktop ? " Use Chrome or Edge on desktop for best results." : "") +
        ctx;
      if (btn) {
        btn.textContent = "Turn on notifications";
        btn.disabled = false;
      }
    }
  }

  function refresh() {
    refreshNotifyBlock();
    if (typeof global.portalSyncAlertsSettingsChrome === "function") {
      global.portalSyncAlertsSettingsChrome();
    }
    if (typeof global.portalRefreshEnableAllUi === "function") {
      global.portalRefreshEnableAllUi();
    }
    if (typeof global.portalRefreshLocationUi === "function") {
      global.portalRefreshLocationUi();
    }
    if (typeof global.portalRefreshMicrophoneUi === "function") {
      global.portalRefreshMicrophoneUi();
    }
    silentPushRegister();
  }

  global.portalRefreshAlertsNotifyUi = refresh;

  function onEnableClick() {
    if (typeof Notification === "undefined") return;
    try {
      global.__PORTAL_WPS_SKIP__ = false;
    } catch (_s) {}
    var statusEl = qNotify("portalNotifyStatus");
    var btn = qNotify("portalNotifyEnableBtn");
    if (Notification.permission === "denied") {
      if (typeof global.portalShowNotificationDeniedHelp === "function") {
        global.portalShowNotificationDeniedHelp({ scroll: true });
      } else {
        syncDeniedHelp(true);
        if (statusEl) {
          statusEl.textContent =
            "Blocked — allow notifications for this site in browser settings." +
            notifyContextHint("denied");
        }
      }
      if (statusEl) {
        statusEl.textContent =
          "Tapped — on iPhone/iPad open Settings → Safari → portalvic.vercel.app → Notifications → Allow, then refresh this page." +
          notifyContextHint("denied");
      }
      flashAlertsButton(btn);
      void Notification.requestPermission().then(function (r) {
        if (r === "granted" && typeof global.portalRegisterPushAfterGrant === "function") {
          return global.portalRegisterPushAfterGrant(statusEl);
        }
      }).finally(function () {
        refresh();
      });
      return;
    }
    if (Notification.permission === "granted") {
      if (typeof global.portalRegisterPushAfterGrant === "function") {
        void global.portalRegisterPushAfterGrant(statusEl).then(function () {
          refresh();
        });
      } else {
        refresh();
      }
      return;
    }
    if (statusEl) statusEl.textContent = "Waiting for browser permission…";
    Notification.requestPermission()
      .then(function (r) {
        if (r === "granted") {
          try {
            new Notification("Portal alerts on", {
              body: "Alerts and reminders on this device.",
            });
          } catch (e) {
            if (statusEl) {
              statusEl.textContent =
                "Permission granted but the browser did not show a banner: " +
                (e && e.message ? e.message : String(e)) +
                notifyContextHint();
            }
          }
          if (typeof global.portalRegisterPushAfterGrant === "function") {
            return global.portalRegisterPushAfterGrant(statusEl);
          }
          return null;
        }
        if (statusEl) {
          statusEl.textContent =
            r === "default"
              ? "No permission yet — tap Allow in the browser prompt, or try again." +
                notifyContextHint()
              : "Notification permission was not granted (" + String(r) + ")." + notifyContextHint();
        }
      })
      .catch(function (err) {
        if (statusEl) {
          statusEl.textContent =
            "Could not request notification permission: " +
            (err && err.message ? err.message : String(err)) +
            notifyContextHint();
        }
      })
      .then(function () {
        refresh();
      });
  }

  function sendTestNotification(statusEl) {
    if (typeof global.portalSendLocalTestNotification === "function") {
      return global.portalSendLocalTestNotification({
        title: "Test: portal notification",
        body: "If you see this banner, notifications are working on this device.",
      }).then(function (result) {
        var msg =
          typeof global.portalTestNotificationStatusMessage === "function"
            ? global.portalTestNotificationStatusMessage(result)
            : result && result.ok
              ? "Test sent — if you saw the banner, this device is ready."
              : "Could not show test notification.";
        if (statusEl) statusEl.textContent = msg;
      });
    }
    try {
      new Notification("Test: portal notification", {
        body: "If you see this banner, notifications are working on this device.",
        icon: "/portal/app-icon/icon-192.png?v=20260624-push-icon",
        badge: "/portal/app-icon/icon-192.png?v=20260624-push-icon",
      });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      if (statusEl) {
        statusEl.textContent = "Test sent — if you saw the banner, this device is ready.";
      }
    } catch (e) {
      if (statusEl) {
        statusEl.textContent =
          "Could not show test notification: " +
          (e && e.message ? e.message : String(e)) +
          notifyContextHint();
      }
    }
    return Promise.resolve();
  }

  function onTestClick() {
    try {
      global.__PORTAL_WPS_SKIP__ = false;
    } catch (_s) {}
    var statusEl = qNotify("portalNotifyStatus");
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      if (statusEl) statusEl.textContent = "Waiting for browser permission…";
      Notification.requestPermission()
        .then(function (r) {
          if (r === "granted" && typeof global.portalRegisterPushAfterGrant === "function") {
            return global.portalRegisterPushAfterGrant(statusEl);
          }
          if (statusEl && r !== "granted") {
            statusEl.textContent = "Allow notifications to send a test alert." + notifyContextHint();
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
    if (Notification.permission === "granted") {
      if (statusEl) statusEl.textContent = "Sending test…";
      // Show the test notification first so the button always does something,
      // even if the background push (re)registration is slow on iOS.
      sendTestNotification(statusEl).then(function () {
        var testMsg = statusEl ? String(statusEl.textContent || "") : "";
        var reg =
          typeof global.portalRegisterPushAfterGrant === "function"
            ? global.portalRegisterPushAfterGrant(statusEl)
            : typeof global.portalEnsureWebPushSubscription === "function"
              ? global.portalEnsureWebPushSubscription()
              : Promise.resolve();
        void reg.then(function (wp) {
          // Do not call refresh() here — it wiped the test result and made the
          // button feel broken ("nothing happens").
          if (wp && !wp.ok && statusEl && typeof global.portalSubscribeFailureMessage === "function") {
            statusEl.textContent =
              (testMsg || "Test sent.") +
              " Background push still needs: " +
              global.portalSubscribeFailureMessage(wp);
            return;
          }
          if (statusEl && testMsg) statusEl.textContent = testMsg;
        });
      });
      return;
    }
    if (Notification.permission === "denied") {
      if (typeof global.portalShowNotificationDeniedHelp === "function") {
        global.portalShowNotificationDeniedHelp({ scroll: true });
      } else {
        syncDeniedHelp(true);
      }
      if (statusEl) {
        statusEl.textContent =
          "Tapped — on iPhone/iPad open Settings → Safari → portalvic.vercel.app → Notifications → Allow, then refresh this page." +
          notifyContextHint("denied");
      }
      flashAlertsButton(qNotify("portalNotifyTestBtn"));
      return;
    }
  }

  function onContinueClick(btn) {
    if (typeof global.portalRequestDefaultPortalPermissions === "function") {
      btn.disabled = true;
      var prev = btn.textContent;
      btn.textContent = "Allow when asked…";
      void global.portalRequestDefaultPortalPermissions().finally(function () {
        silentPushRegister();
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
    refresh();
  }

  function flashAlertsButton(btn) {
    if (!btn) return;
    btn.classList.add("portal-alerts-action-btn--tapped");
    global.setTimeout(function () {
      btn.classList.remove("portal-alerts-action-btn--tapped");
    }, 700);
  }

  function handleAlertsSheetTap(e) {
    var t = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!t) return;
    var alertsSheet = alertsSheetEl();
    if (!alertsSheet || !alertsSheet.contains(t) || t.disabled) return;
    if (t.id === "portalEnableAllBtn") {
      e.preventDefault();
      flashAlertsButton(t);
      onContinueClick(t);
    } else if (t.id === "portalNotifyEnableBtn") {
      e.preventDefault();
      flashAlertsButton(t);
      onEnableClick();
    } else if (t.id === "portalNotifyTestBtn") {
      e.preventDefault();
      flashAlertsButton(t);
      onTestClick();
    } else if (t.id === "portalMicEnableBtn") {
      e.preventDefault();
      flashAlertsButton(t);
      if (typeof global.portalRequestMicrophonePermission === "function") {
        void global.portalRequestMicrophonePermission();
      }
    }
  }

  function bindAlertsSheetUi() {
    var alertsSheet = alertsSheetEl();
    if (!alertsSheet || bound) return;
    bound = true;
    alertsSheet.addEventListener("click", handleAlertsSheetTap, true);
    alertsSheet.addEventListener("touchend", handleAlertsSheetTap, { capture: true, passive: false });
  }

  function init() {
    bindAlertsSheetUi();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.addEventListener("portal:supabase-ready", function () {
    bindAlertsSheetUi();
    refresh();
  });

  if (!global.__PORTAL_NOTIFY_FOCUS_BOUND__) {
    global.__PORTAL_NOTIFY_FOCUS_BOUND__ = true;
    global.addEventListener("focus", function () {
      if (typeof Notification !== "undefined" && Notification.permission !== "denied") {
        refresh();
      }
    });
    global.addEventListener("visibilitychange", function () {
      if (!global.document || global.document.visibilityState !== "visible") return;
      if (typeof Notification !== "undefined") refresh();
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
