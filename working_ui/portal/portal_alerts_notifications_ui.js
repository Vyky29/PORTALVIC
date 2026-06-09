/**
 * Settings sheet — two buttons: portal features + voice typing (staff / lead).
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

  function clearNotifyStatus() {
    var statusEl = qNotify("portalNotifyStatus");
    if (statusEl) statusEl.textContent = "";
    var vapidEl = qNotify("portalNotifyVapidHint");
    if (vapidEl) {
      vapidEl.textContent = "";
      vapidEl.hidden = true;
    }
  }

  function silentPushRegister() {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (typeof global.portalEnsureWebPushSubscription === "function") {
      void global.portalEnsureWebPushSubscription();
    }
  }

  function refresh() {
    clearNotifyStatus();
    var testBtn = qNotify("portalNotifyTestBtn");
    var enableBtn = qNotify("portalNotifyEnableBtn");
    if (testBtn) testBtn.hidden = true;
    if (enableBtn) enableBtn.hidden = true;
    if (typeof global.portalSyncAlertsSettingsChrome === "function") {
      global.portalSyncAlertsSettingsChrome();
    }
    if (typeof global.portalRefreshEnableAllUi === "function") {
      global.portalRefreshEnableAllUi();
    }
    if (typeof global.portalRefreshMicrophoneUi === "function") {
      global.portalRefreshMicrophoneUi();
    }
    silentPushRegister();
  }

  global.portalRefreshAlertsNotifyUi = refresh;

  function onContinueClick(btn) {
    if (typeof global.portalRequestDefaultPortalPermissions === "function") {
      btn.disabled = true;
      var prev = btn.textContent;
      btn.textContent = "Allow when asked…";
      void global.portalRequestDefaultPortalPermissions().finally(function () {
        silentPushRegister();
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
    refresh();
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
            ? e.target.closest("#portalEnableAllBtn")
            : null;
        if (!t || !alertsSheet.contains(t) || t.disabled) return;
        e.preventDefault();
        onContinueClick(t);
      },
      true
    );
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
})(typeof window !== "undefined" ? window : globalThis);
