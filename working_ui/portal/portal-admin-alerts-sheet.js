/**
 * Admin Settings — open/close device notifications sheet + wire test push UI.
 */
(function (global) {
  "use strict";

  var returnFocusEl = null;
  var uiBound = false;

  function sheetEl() {
    return document.getElementById("alertsNotificationsSheet");
  }

  function backdropEl() {
    return document.getElementById("portalAdminSheetBackdrop");
  }

  function onSheetOpened() {
    if (typeof global.portalRefreshAlertsNotifyUi === "function") {
      global.portalRefreshAlertsNotifyUi();
    }
  }

  function openSheet() {
    var sheet = sheetEl();
    var backdrop = backdropEl();
    if (!sheet) return;
    var opener = document.activeElement;
    if (
      opener &&
      opener !== document.body &&
      typeof opener.focus === "function" &&
      !sheet.contains(opener)
    ) {
      returnFocusEl = opener;
    }
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    if (backdrop) {
      backdrop.classList.add("open");
      backdrop.setAttribute("aria-hidden", "false");
    }
    onSheetOpened();
    requestAnimationFrame(function () {
      var primary =
        document.getElementById("portalNotifyEnableBtn") ||
        document.getElementById("portalAdminAlertsSheetClose");
      if (primary && typeof primary.focus === "function") {
        try {
          primary.focus({ preventScroll: true });
        } catch (_) {
          primary.focus();
        }
      }
    });
  }

  function closeSheet() {
    var sheet = sheetEl();
    var backdrop = backdropEl();
    if (sheet) {
      var focused = document.activeElement;
      if (focused && sheet.contains(focused) && typeof focused.blur === "function") {
        focused.blur();
      }
      sheet.classList.remove("open");
      sheet.setAttribute("aria-hidden", "true");
    }
    if (backdrop) {
      backdrop.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
    }
    var restore = returnFocusEl;
    returnFocusEl = null;
    if (restore && typeof restore.focus === "function") {
      requestAnimationFrame(function () {
        try {
          restore.focus({ preventScroll: true });
        } catch (_) {
          restore.focus();
        }
      });
    }
  }

  function bindUi() {
    if (uiBound) return;
    var sheet = sheetEl();
    if (!sheet) return;
    uiBound = true;

    sheet.addEventListener(
      "click",
      function (e) {
        var closeBtn =
          e.target && e.target.closest
            ? e.target.closest("#portalAdminAlertsSheetClose")
            : null;
        if (closeBtn && sheet.contains(closeBtn)) {
          e.preventDefault();
          closeSheet();
        }
      },
      true
    );

    var backdrop = backdropEl();
    if (backdrop) {
      backdrop.addEventListener("click", closeSheet);
    }

    document.addEventListener(
      "click",
      function (e) {
        var openBtn =
          e.target && e.target.closest
            ? e.target.closest(
                '[data-open="alertsNotificationsSheet"], [data-admin-nav-action="device_notifications"]'
              )
            : null;
        if (!openBtn) return;
        e.preventDefault();
        openSheet();
      },
      true
    );
  }

  function init() {
    bindUi();
  }

  global.portalAdminOpenAlertsNotificationsSheet = openSheet;
  global.portalAdminCloseAlertsNotificationsSheet = closeSheet;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  global.addEventListener("portal:supabase-ready", function () {
    bindUi();
    var deferPush = function () {
      if (typeof global.portalRegisterPortalServiceWorker === "function") {
        void global.portalRegisterPortalServiceWorker();
      }
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        typeof global.portalEnsureWebPushSubscription === "function"
      ) {
        void global.portalEnsureWebPushSubscription();
      }
    };
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(deferPush, { timeout: 4000 });
    } else {
      global.setTimeout(deferPush, 1200);
    }
  });

  if (typeof global.portalRegisterPortalServiceWorker === "function") {
    if (typeof global.requestIdleCallback === "function") {
      global.requestIdleCallback(function () {
        void global.portalRegisterPortalServiceWorker();
      }, { timeout: 5000 });
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
