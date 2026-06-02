/**
 * Mobile portal screenshot deterrence (best-effort in browser/PWA).
 * Black overlay only while the app is in the background (app switcher / task switch).
 * Never block touches while the page is visible — fixes PWA stuck black screen.
 */
(function (global) {
  "use strict";

  var GUARD_ID = "portalScreenshotGuard";
  var armed = false;
  var bound = false;
  var strictTokens = Object.create(null);
  var mediaCaptureTokens = Object.create(null);
  var lingerTimer = null;
  var watchdogTimer = null;
  var DEFAULT_LINGER_MS = 3400;
  var STRICT_LINGER_MS = 5200;

  function isMobilePortalDevice() {
    try {
      if (global.matchMedia) {
        if (global.matchMedia("(display-mode: standalone)").matches) return true;
        if (global.matchMedia("(max-width: 768px)").matches) return true;
      }
    } catch (_e) {}
    var ua = String((global.navigator && global.navigator.userAgent) || "");
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  }

  function isStrict() {
    var k;
    for (k in strictTokens) {
      if (Object.prototype.hasOwnProperty.call(strictTokens, k)) return true;
    }
    return false;
  }

  function isMediaCaptureActive() {
    var k;
    for (k in mediaCaptureTokens) {
      if (Object.prototype.hasOwnProperty.call(mediaCaptureTokens, k)) return true;
    }
    return false;
  }

  function isPageVisible() {
    try {
      return !document.hidden && document.visibilityState === "visible";
    } catch (_e) {
      return true;
    }
  }

  function ensureEl() {
    var el = document.getElementById(GUARD_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = GUARD_ID;
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("role", "presentation");
    var root = document.body || document.documentElement;
    root.appendChild(el);
    el.addEventListener(
      "click",
      function () {
        if (isPageVisible()) hideBlackForce();
      },
      true
    );
    return el;
  }

  function setSensitiveHidden(on) {
    try {
      document.documentElement.classList.toggle("portal-screenshot-sensitive-hidden", !!on);
    } catch (_e) {}
  }

  function syncPageHiddenClass() {
    try {
      document.documentElement.classList.toggle("portal-screenshot-page-hidden", !!document.hidden);
    } catch (_e) {}
  }

  function showBlack(opts) {
    if (!armed || isMediaCaptureActive()) return;
    opts = opts || {};
    global.clearTimeout(lingerTimer);

    if (!document.hidden && !opts.allowForegroundLinger) {
      return;
    }

    var el = ensureEl();
    el.classList.add("is-active");
    setSensitiveHidden(true);
    if (opts.persist) return;
    var ms = opts.lingerMs != null ? opts.lingerMs : isStrict() ? STRICT_LINGER_MS : DEFAULT_LINGER_MS;
    lingerTimer = global.setTimeout(function () {
      if (document.hidden) return;
      hideBlackForce();
    }, ms);
  }

  function hideBlack() {
    hideBlackForce();
  }

  function hideBlackForce() {
    global.clearTimeout(lingerTimer);
    var el = document.getElementById(GUARD_ID);
    if (el) el.classList.remove("is-active");
    if (isPageVisible() && !isMediaCaptureActive()) setSensitiveHidden(false);
  }

  function onPageVisible() {
    syncPageHiddenClass();
    hideBlackForce();
  }

  function onPageHidden() {
    syncPageHiddenClass();
    if (!armed || isMediaCaptureActive()) return;
    showBlack({ persist: true });
  }

  function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = global.setInterval(function () {
      if (!armed || !isPageVisible() || isMediaCaptureActive()) return;
      var el = document.getElementById(GUARD_ID);
      if (el && el.classList.contains("is-active")) hideBlackForce();
    }, 2500);
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    document.addEventListener(
      "visibilitychange",
      function () {
        if (!armed) return;
        if (isMediaCaptureActive()) {
          hideBlackForce();
          return;
        }
        if (document.hidden) onPageHidden();
        else onPageVisible();
      },
      true
    );

    global.addEventListener(
      "pageshow",
      function () {
        if (!armed) return;
        onPageVisible();
      },
      true
    );

    document.addEventListener(
      "keyup",
      function (e) {
        if (!armed) return;
        if (e.key === "PrintScreen") showBlack({ lingerMs: 4500, allowForegroundLinger: true });
        if (e.ctrlKey && e.shiftKey && (e.key === "s" || e.key === "S")) {
          showBlack({ lingerMs: 4500, allowForegroundLinger: true });
        }
      },
      true
    );

    document.addEventListener(
      "contextmenu",
      function (e) {
        if (!armed) return;
        var t = e.target;
        if (t && t.closest && t.closest(".portal-screenshot-protected")) e.preventDefault();
      },
      true
    );

    document.addEventListener(
      "dragstart",
      function (e) {
        if (!armed) return;
        var t = e.target;
        if (t && t.closest && t.closest(".portal-screenshot-protected")) e.preventDefault();
      },
      true
    );

    startWatchdog();
  }

  function arm(options) {
    options = options || {};
    if (armed) return true;
    if (options.mobileOnly !== false && !isMobilePortalDevice()) return false;
    armed = true;
    try {
      document.documentElement.classList.add("portal-screenshot-guard-armed");
    } catch (_e2) {}
    ensureEl();
    bindEvents();
    syncPageHiddenClass();
    if (isPageVisible()) hideBlackForce();
    return true;
  }

  function disarm() {
    armed = false;
    try {
      document.documentElement.classList.remove("portal-screenshot-guard-armed");
    } catch (_e3) {}
    hideBlackForce();
  }

  function pushStrict(token) {
    var key = String(token || "default");
    strictTokens[key] = 1;
    if (armed && document.hidden && !isMediaCaptureActive()) showBlack({ persist: true });
  }

  function popStrict(token) {
    var key = String(token || "default");
    delete strictTokens[key];
    if (isPageVisible() && !isMediaCaptureActive()) hideBlackForce();
  }

  function pushMediaCaptureBypass(token) {
    var key = String(token || "default");
    mediaCaptureTokens[key] = 1;
    hideBlackForce();
  }

  function popMediaCaptureBypass(token) {
    var key = String(token || "default");
    delete mediaCaptureTokens[key];
    if (isPageVisible() && !document.hidden) hideBlackForce();
  }

  function autoArmFromDocument() {
    try {
      var mode = document.documentElement.getAttribute("data-portal-screenshot-guard");
      if (mode === "off") return;
      if (mode === "all") {
        arm({ mobileOnly: false });
        return;
      }
      arm({ mobileOnly: true });
    } catch (_e4) {}
  }

  global.PortalScreenshotGuard = {
    arm: arm,
    disarm: disarm,
    pushStrict: pushStrict,
    popStrict: popStrict,
    pushMediaCaptureBypass: pushMediaCaptureBypass,
    popMediaCaptureBypass: popMediaCaptureBypass,
    showBlack: showBlack,
    hideBlack: hideBlack,
    hideBlackForce: hideBlackForce,
    isMobilePortalDevice: isMobilePortalDevice,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoArmFromDocument);
  } else {
    autoArmFromDocument();
  }
})(typeof window !== "undefined" ? window : this);
