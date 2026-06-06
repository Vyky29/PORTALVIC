/**
 * Mobile portal screenshot deterrence (best-effort in browser/PWA).
 * White overlay + club logo while the app is in the background (app switcher).
 * Never block touches while the page is visible — fixes PWA stuck overlay.
 */
(function (global) {
  "use strict";

  var GUARD_ID = "portalScreenshotGuard";
  var LOGO_SRC = "/portal/F-02-1.png";
  var LOGO_FALLBACK = "/portal/portal_crest.svg";
  var armed = false;
  var bound = false;
  var rolePolicyBound = false;
  var workerSafeguardBound = false;
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
    var img = document.createElement("img");
    img.className = "portal-screenshot-guard-logo";
    img.src = LOGO_SRC;
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    img.setAttribute("aria-hidden", "true");
    img.onerror = function () {
      this.onerror = null;
      this.src = LOGO_FALLBACK;
    };
    el.appendChild(img);
    var root = document.body || document.documentElement;
    root.appendChild(el);
    el.addEventListener(
      "click",
      function () {
        if (isPageVisible()) hideMaskForce();
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

  function setForegroundMask(on) {
    try {
      document.documentElement.classList.toggle("portal-screenshot-foreground-mask", !!on);
    } catch (_e2) {}
  }

  function syncPageHiddenClass() {
    try {
      document.documentElement.classList.toggle("portal-screenshot-page-hidden", !!document.hidden);
    } catch (_e3) {}
  }

  function showMask(opts) {
    if (!armed || isMediaCaptureActive()) return;
    opts = opts || {};
    global.clearTimeout(lingerTimer);

    if (!document.hidden && !opts.allowForegroundLinger) {
      return;
    }

    var el = ensureEl();
    el.classList.add("is-active");
    setSensitiveHidden(true);
    if (opts.allowForegroundLinger) setForegroundMask(true);
    if (opts.persist) return;
    var ms = opts.lingerMs != null ? opts.lingerMs : isStrict() ? STRICT_LINGER_MS : DEFAULT_LINGER_MS;
    lingerTimer = global.setTimeout(function () {
      if (document.hidden) return;
      hideMaskForce();
    }, ms);
  }

  function hideMask() {
    hideMaskForce();
  }

  function hideMaskForce() {
    global.clearTimeout(lingerTimer);
    setForegroundMask(false);
    var el = document.getElementById(GUARD_ID);
    if (el) el.classList.remove("is-active");
    if (isPageVisible() && !isMediaCaptureActive()) {
      setSensitiveHidden(false);
    }
  }

  function onPageVisible() {
    syncPageHiddenClass();
    hideMaskForce();
  }

  function onPageHidden() {
    syncPageHiddenClass();
    if (!armed || isMediaCaptureActive()) return;
    showMask({ persist: true });
  }

  function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = global.setInterval(function () {
      if (!armed || !isPageVisible() || isMediaCaptureActive()) return;
      var el = document.getElementById(GUARD_ID);
      if (el && el.classList.contains("is-active")) hideMaskForce();
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
          hideMaskForce();
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
        if (e.key === "PrintScreen") showMask({ lingerMs: 4500, allowForegroundLinger: true });
        if (e.ctrlKey && e.shiftKey && (e.key === "s" || e.key === "S")) {
          showMask({ lingerMs: 4500, allowForegroundLinger: true });
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
    } catch (_e4) {}
    ensureEl();
    bindEvents();
    syncPageHiddenClass();
    if (isPageVisible()) hideMaskForce();
    return true;
  }

  function disarm() {
    armed = false;
    try {
      document.documentElement.classList.remove("portal-screenshot-guard-armed");
    } catch (_e5) {}
    hideMaskForce();
  }

  function pushStrict(token) {
    var key = String(token || "default");
    strictTokens[key] = 1;
    if (armed && document.hidden && !isMediaCaptureActive()) showMask({ persist: true });
  }

  function popStrict(token) {
    var key = String(token || "default");
    delete strictTokens[key];
    if (isPageVisible() && !isMediaCaptureActive()) hideMaskForce();
  }

  function pushMediaCaptureBypass(token) {
    var key = String(token || "default");
    mediaCaptureTokens[key] = 1;
    hideMaskForce();
  }

  function popMediaCaptureBypass(token) {
    var key = String(token || "default");
    delete mediaCaptureTokens[key];
    if (isPageVisible() && !document.hidden) hideMaskForce();
  }

  function isWorkerDashboardPage() {
    try {
      var mode = document.documentElement.getAttribute("data-portal-screenshot-guard");
      if (mode === "workers") return true;
      var path = String((global.location && global.location.pathname) || "").toLowerCase();
      return /staff_dashboard\.html/.test(path) || /lead_dashboard\.html/.test(path);
    } catch (_e6) {
      return false;
    }
  }

  function portalScreenshotGuardResolveAppRole() {
    try {
      var box = global.window.__PORTAL_SUPABASE__;
      var profile = box && box.staff_profile;
      if (profile && profile.app_role) return String(profile.app_role).toLowerCase();
    } catch (_e7) {}
    return "";
  }

  function portalScreenshotGuardCaptureAllowed() {
    return portalScreenshotGuardResolveAppRole() === "ceo";
  }

  function bindWorkerSafeguardEvents() {
    if (workerSafeguardBound) return;
    workerSafeguardBound = true;
    global.addEventListener(
      "blur",
      function () {
        if (!armed || portalScreenshotGuardCaptureAllowed()) return;
        if (isMediaCaptureActive()) return;
        showMask({ lingerMs: 2800, allowForegroundLinger: true });
      },
      true
    );
  }

  function bindRolePolicyEvents() {
    if (rolePolicyBound) return;
    rolePolicyBound = true;
    global.addEventListener("portal:supabase-ready", syncRolePolicy, true);
  }

  function syncRolePolicy() {
    if (!isWorkerDashboardPage()) return;
    try {
      if (portalScreenshotGuardCaptureAllowed()) {
        popStrict("safeguarding-workers");
        document.documentElement.classList.remove("portal-screenshot-guard-workers");
        disarm();
        return;
      }
      document.documentElement.classList.add("portal-screenshot-guard-workers");
      arm({ mobileOnly: false });
      pushStrict("safeguarding-workers");
      bindWorkerSafeguardEvents();
    } catch (_e8) {}
  }

  function autoArmFromDocument() {
    try {
      var mode = document.documentElement.getAttribute("data-portal-screenshot-guard");
      if (mode === "off") return;
      if (isWorkerDashboardPage()) {
        bindRolePolicyEvents();
        syncRolePolicy();
        return;
      }
      if (mode === "all") {
        arm({ mobileOnly: false });
        return;
      }
      arm({ mobileOnly: true });
    } catch (_e9) {}
  }

  global.PortalScreenshotGuard = {
    arm: arm,
    disarm: disarm,
    pushStrict: pushStrict,
    popStrict: popStrict,
    pushMediaCaptureBypass: pushMediaCaptureBypass,
    popMediaCaptureBypass: popMediaCaptureBypass,
    showBlack: showMask,
    hideBlack: hideMask,
    hideBlackForce: hideMaskForce,
    isMobilePortalDevice: isMobilePortalDevice,
    syncRolePolicy: syncRolePolicy,
    portalScreenshotGuardCaptureAllowed: portalScreenshotGuardCaptureAllowed,
    portalScreenshotGuardResolveAppRole: portalScreenshotGuardResolveAppRole,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoArmFromDocument);
  } else {
    autoArmFromDocument();
  }
})(typeof window !== "undefined" ? window : this);
