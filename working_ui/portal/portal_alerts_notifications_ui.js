/**
 * Staff / lead Settings sheet — notifications, location, voice typing (adapted from admin).
 * Also surfaces unread Portal WhatsApp (club → leader) like admin Family messages unread.
 */
(function (global) {
  "use strict";

  var bound = false;
  var testLockUntil = 0;
  var lastTestStatus = "";

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

  function lockTestStatus(ms) {
    testLockUntil = Date.now() + Math.max(1500, Number(ms) || 8000);
  }

  function testStatusLocked() {
    return Date.now() < testLockUntil;
  }

  function silentPushRegister() {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (typeof global.portalEnsureWebPushSubscription === "function") {
      void global.portalEnsureWebPushSubscription();
    }
  }

  function applyWebPushStatus(statusEl, wp) {
    if (!statusEl || !wp) return;
    if (testStatusLocked()) return;
    if (typeof global.portalApplyWebPushStatus === "function") {
      global.portalApplyWebPushStatus(statusEl, wp, {
        registeredMessage:
          "Registered for background alerts. Send test checks this tab only — close the app to verify real push.",
      });
    }
  }

  function flashInSheetBanner(ok, text) {
    var panel = document.querySelector("#alertsNotificationsSheet .portal-alerts-panel");
    if (!panel) return;
    var el = document.getElementById("portalNotifyTestFlash");
    if (!el) {
      el = document.createElement("p");
      el.id = "portalNotifyTestFlash";
      el.className = "portal-alerts-test-flash";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "assertive");
      var pushBlock = document.getElementById("portalPushNotifyBlock");
      if (pushBlock) pushBlock.insertBefore(el, pushBlock.firstChild);
      else panel.insertBefore(el, panel.firstChild);
    }
    el.hidden = false;
    el.classList.toggle("portal-alerts-test-flash--ok", !!ok);
    el.classList.toggle("portal-alerts-test-flash--bad", !ok);
    el.textContent = String(text || "");
    global.setTimeout(function () {
      try {
        el.hidden = true;
      } catch (_e) {}
    }, 10000);
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
      if (!testStatusLocked()) {
        statusEl.textContent = "Not supported on this browser." + ctx;
      }
      if (btn) btn.disabled = true;
      syncTestButton(testBtn, "unsupported");
      return;
    }
    var p = Notification.permission;
    if (p === "granted") {
      if (!testStatusLocked()) {
        statusEl.textContent =
          "Notifications on — Send test checks this tab only.";
      } else if (lastTestStatus) {
        statusEl.textContent = lastTestStatus;
      }
      syncTestButton(testBtn, p);
      if (typeof global.portalEnsureWebPushSubscription === "function") {
        global.portalEnsureWebPushSubscription().then(function (wp) {
          if (testStatusLocked()) {
            if (statusEl && lastTestStatus) statusEl.textContent = lastTestStatus;
            return;
          }
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
      if (!testStatusLocked()) {
        statusEl.textContent =
          "Blocked — allow notifications for this site in browser settings." + ctx;
      }
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
      if (!testStatusLocked()) {
        statusEl.textContent =
          "Off — tap Turn on notifications and choose Allow in the browser prompt." +
          (env && env.desktop ? " Use Chrome or Edge on desktop for best results." : "") +
          ctx;
      }
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
    if (typeof global.portalStaffWaRefreshUnread === "function") {
      void global.portalStaffWaRefreshUnread();
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
    lockTestStatus(10000);
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
        lastTestStatus = msg;
        if (statusEl) statusEl.textContent = msg;
        flashInSheetBanner(!!(result && result.ok), msg);
        return result;
      });
    }
    try {
      new Notification("Test: portal notification", {
        body: "If you see this banner, notifications are working on this device.",
        icon: "/portal/app-icon/icon-192.png?v=20260624-push-icon",
        badge: "/portal/app-icon/icon-192.png?v=20260624-push-icon",
      });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      lastTestStatus = "Test sent — if you saw the banner, this device is ready.";
      if (statusEl) statusEl.textContent = lastTestStatus;
      flashInSheetBanner(true, lastTestStatus);
    } catch (e) {
      lastTestStatus =
        "Could not show test notification: " +
        (e && e.message ? e.message : String(e)) +
        notifyContextHint();
      if (statusEl) statusEl.textContent = lastTestStatus;
      flashInSheetBanner(false, lastTestStatus);
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
          if (Notification.permission === "granted") {
            return sendTestNotification(statusEl);
          }
          refresh();
        })
        .catch(function () {
          refresh();
        });
      return;
    }
    if (Notification.permission === "granted") {
      if (statusEl) statusEl.textContent = "Sending test…";
      lastTestStatus = "Sending test…";
      lockTestStatus(12000);
      // Show the test notification first so the button always does something,
      // even if the background push (re)registration is slow on iOS.
      sendTestNotification(statusEl).then(function () {
        var testMsg = statusEl ? String(statusEl.textContent || "") : "";
        lastTestStatus = testMsg || lastTestStatus;
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
            var combined =
              (testMsg || "Test sent.") +
              " Background push still needs: " +
              global.portalSubscribeFailureMessage(wp);
            lastTestStatus = combined;
            lockTestStatus(10000);
            statusEl.textContent = combined;
            flashInSheetBanner(false, combined);
            return;
          }
          if (statusEl && lastTestStatus) statusEl.textContent = lastTestStatus;
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
    } else if (t.id === "portalStaffWaAlertsOpenBtn") {
      e.preventDefault();
      flashAlertsButton(t);
      if (typeof global.portalStaffWaOpen === "function") {
        global.portalStaffWaOpen();
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
      if (testStatusLocked()) return;
      if (typeof Notification !== "undefined" && Notification.permission !== "denied") {
        refresh();
      }
    });
    global.addEventListener("visibilitychange", function () {
      if (!global.document || global.document.visibilityState !== "visible") return;
      if (testStatusLocked()) return;
      if (typeof Notification !== "undefined") refresh();
    });
  }

  if (!global.__PORTAL_PUSH_RECEIVED_TOAST_BOUND__ && global.navigator && global.navigator.serviceWorker) {
    global.__PORTAL_PUSH_RECEIVED_TOAST_BOUND__ = true;
    try {
      global.navigator.serviceWorker.addEventListener("message", function (ev) {
        var d = ev && ev.data;
        if (!d || d.type !== "portal-push-received") return;
        if (d.portalOpen === "incoming_call") return;
        /* Leader-facing WA pushes belong on staff dashboard only; never toast them on admin. */
        if (d.portalOpen === "staff_whatsapp") return;
        if (typeof global.portalPushIsForCurrentUser === "function" && !global.portalPushIsForCurrentUser(d)) {
          return;
        }
        var title = String(d.title || "Portal alert");
        var body = String(d.body || "");
        var statusEl = qNotify("portalNotifyStatus");
        var line = title + (body ? " — " + body : "");
        if (statusEl) {
          lastTestStatus = line;
          lockTestStatus(6000);
          statusEl.textContent = line;
        }
        flashInSheetBanner(true, line);
        if (typeof global.portalPlayAlertCue === "function") {
          global.portalPlayAlertCue();
        } else if (global.navigator.vibrate) {
          try {
            global.navigator.vibrate([200, 80, 200]);
          } catch (_v) {}
        }
      });
    } catch (_m) {}
  }
})(typeof window !== "undefined" ? window : globalThis);
