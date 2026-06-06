/**
 * Portal screenshot deterrence (best-effort in browser/PWA).
 * White + logo flash only on detected screen-capture shortcuts — not app switch,
 * not achievement camera / gallery photo UI. iOS hardware screenshots cannot be
 * detected from the web; desktop/Android key combos are covered where possible.
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
  var sensitiveObserver = null;
  var mediaCaptureTokens = Object.create(null);
  var lingerTimer = null;
  var watchdogTimer = null;
  var SCREENSHOT_MASK_MS = 1500;
  var WORKER_MASK_MS = 4200;

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

  function isMediaCaptureActive() {
    var k;
    for (k in mediaCaptureTokens) {
      if (Object.prototype.hasOwnProperty.call(mediaCaptureTokens, k)) return true;
    }
    return false;
  }

  function isPhotoCaptureUiActive() {
    if (isMediaCaptureActive()) return true;
    try {
      if (document.body && document.body.classList.contains("portal-achievements-camera-open")) return true;
      var cam = document.getElementById("portalAchievementsCameraFullscreen");
      if (cam && !cam.hidden) return true;
    } catch (_e2) {}
    return false;
  }

  function isPageVisible() {
    try {
      return !document.hidden && document.visibilityState === "visible";
    } catch (_e3) {
      return true;
    }
  }

  function portalScreenshotGuardCaptureAllowed() {
    try {
      var box = global.window.__PORTAL_SUPABASE__;
      var profile = box && box.staff_profile;
      if (profile && profile.app_role) {
        return String(profile.app_role).toLowerCase() === "ceo";
      }
    } catch (_e4) {}
    return false;
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
    return el;
  }

  function setSensitiveHidden(on) {
    try {
      document.documentElement.classList.toggle("portal-screenshot-sensitive-hidden", !!on);
      document.documentElement.classList.toggle("portal-screenshot-worker-sensitive-hidden", !!on);
    } catch (_e5) {}
  }

  function setForegroundMask(on) {
    try {
      document.documentElement.classList.toggle("portal-screenshot-foreground-mask", !!on);
    } catch (_e6) {}
  }

  function hideMaskForce() {
    global.clearTimeout(lingerTimer);
    setForegroundMask(false);
    var el = document.getElementById(GUARD_ID);
    if (el) el.classList.remove("is-active");
    if (isPageVisible() && !isPhotoCaptureUiActive()) {
      setSensitiveHidden(false);
    }
  }

  function triggerScreenshotMask(opts) {
    if (!armed || portalScreenshotGuardCaptureAllowed()) return;
    if (isPhotoCaptureUiActive()) return;
    opts = opts || {};
    global.clearTimeout(lingerTimer);
    var el = ensureEl();
    el.classList.add("is-active");
    setSensitiveHidden(true);
    setForegroundMask(true);
    var linger =
      opts.lingerMs != null
        ? opts.lingerMs
        : isWorkerSafeguardActive()
          ? WORKER_MASK_MS
          : SCREENSHOT_MASK_MS;
    lingerTimer = global.setTimeout(hideMaskForce, linger);
  }

  function startWatchdog() {
    if (watchdogTimer) return;
    watchdogTimer = global.setInterval(function () {
      if (!armed || !isPageVisible() || isPhotoCaptureUiActive()) return;
      var el = document.getElementById(GUARD_ID);
      if (el && el.classList.contains("is-active")) hideMaskForce();
    }, 800);
  }

  function isScreenshotKeyEvent(e) {
    if (!e) return false;
    var key = String(e.key || "");
    var code = String(e.code || "");
    if (key === "PrintScreen" || code === "PrintScreen") return true;
    if (e.ctrlKey && e.shiftKey && (key === "s" || key === "S")) return true;
    if (e.metaKey && e.shiftKey && (key === "3" || key === "4" || key === "5")) return true;
    return false;
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    document.addEventListener(
      "keydown",
      function (e) {
        if (!armed || !isScreenshotKeyEvent(e)) return;
        triggerScreenshotMask({ lingerMs: 1800 });
      },
      true
    );

    document.addEventListener(
      "keyup",
      function (e) {
        if (!armed) return;
        if (e.key === "PrintScreen" || e.code === "PrintScreen") {
          triggerScreenshotMask({ lingerMs: 2200 });
        }
      },
      true
    );

    document.addEventListener(
      "visibilitychange",
      function () {
        if (!armed) return;
        if (!document.hidden) hideMaskForce();
      },
      true
    );

    global.addEventListener(
      "pageshow",
      function () {
        if (!armed) return;
        hideMaskForce();
      },
      true
    );

    document.addEventListener(
      "contextmenu",
      function (e) {
        if (!armed) return;
        var t = e.target;
        if (t && t.closest && isSensitiveSurface(t)) e.preventDefault();
      },
      true
    );

    document.addEventListener(
      "dragstart",
      function (e) {
        if (!armed) return;
        var t = e.target;
        if (t && t.closest && isSensitiveSurface(t)) e.preventDefault();
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
    } catch (_e7) {}
    ensureEl();
    bindEvents();
    hideMaskForce();
    return true;
  }

  function disarm() {
    armed = false;
    try {
      document.documentElement.classList.remove("portal-screenshot-guard-armed");
    } catch (_e8) {}
    hideMaskForce();
  }

  function pushMediaCaptureBypass(token) {
    var key = String(token || "default");
    mediaCaptureTokens[key] = 1;
    hideMaskForce();
  }

  function popMediaCaptureBypass(token) {
    var key = String(token || "default");
    delete mediaCaptureTokens[key];
    if (isPageVisible()) hideMaskForce();
  }

  function isSensitiveSurface(node) {
    if (!node || !node.closest) return false;
    return !!node.closest(
      ".portal-screenshot-protected, .portal-achievement-protected, #clientPhotoSlot, .clients-grid-avatar, .today-participant-chip__avatar, .calendar-day-avatar, .portal-achievements-viewer, .portal-achievements-gallery, .portal-ach-cam-gallery"
    );
  }

  function isWorkerSafeguardActive() {
    if (!armed || portalScreenshotGuardCaptureAllowed()) return false;
    try {
      return document.documentElement.classList.contains("portal-screenshot-guard-workers");
    } catch (_eW) {}
    return false;
  }

  function shouldTagSensitiveImage(img) {
    if (!img || img.nodeName !== "IMG") return false;
    if (img.closest("#topbarStaffPhoto") || img.closest(".avatar-wrap") || img.closest(".portal-dm-inbox-brand")) {
      return false;
    }
    if (img.classList.contains("portal-screenshot-guard-logo")) return false;
    var src = String(img.getAttribute("src") || "").toLowerCase();
    if (/f-02-1\.png|portal_crest|footerlogo|\/staff_photos\//.test(src)) return false;
    if (img.classList.contains("portal-achievement-protected") || img.classList.contains("portal-screenshot-protected")) {
      return true;
    }
    if (img.closest("#clientPhotoSlot, .clients-grid-avatar, .today-participant-chip__avatar, .calendar-day-avatar, .portal-achievements-gallery, .portal-achievements-viewer, .portal-ach-cam-gallery")) {
      return true;
    }
    return /\/participants\//.test(src);
  }

  function tagSensitiveImages(root) {
    if (!isWorkerSafeguardActive()) return;
    var scope = root && root.querySelectorAll ? root : document;
    try {
      scope.querySelectorAll("img").forEach(function (img) {
        if (!shouldTagSensitiveImage(img)) return;
        img.classList.add("portal-screenshot-protected");
        img.setAttribute("draggable", "false");
      });
    } catch (_eTag) {}
  }

  function startSensitiveImageObserver() {
    if (sensitiveObserver || !global.MutationObserver) return;
    sensitiveObserver = new global.MutationObserver(function (mutations) {
      if (!isWorkerSafeguardActive()) return;
      mutations.forEach(function (m) {
        if (m.type === "childList") {
          m.addedNodes.forEach(function (node) {
            if (!node || node.nodeType !== 1) return;
            if (node.nodeName === "IMG") tagSensitiveImages(node.parentElement || document);
            else tagSensitiveImages(node);
          });
        } else if (m.type === "attributes" && m.target && m.target.nodeName === "IMG") {
          tagSensitiveImages(m.target.parentElement || document);
        }
      });
    });
    var root = document.body || document.documentElement;
    if (!root) return;
    sensitiveObserver.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "class"],
    });
    tagSensitiveImages(root);
  }

  function bindWorkerSafeguardEvents() {
    if (workerSafeguardBound) return;
    workerSafeguardBound = true;

    document.addEventListener(
      "visibilitychange",
      function () {
        if (!isWorkerSafeguardActive()) return;
        if (document.hidden) setSensitiveHidden(true);
        else if (!isPhotoCaptureUiActive()) setSensitiveHidden(false);
      },
      true
    );

    global.addEventListener(
      "pagehide",
      function () {
        if (!isWorkerSafeguardActive()) return;
        setSensitiveHidden(true);
      },
      true
    );

    global.addEventListener(
      "blur",
      function () {
        if (!isWorkerSafeguardActive()) return;
        setSensitiveHidden(true);
      },
      true
    );

    global.addEventListener(
      "focus",
      function () {
        if (!isWorkerSafeguardActive()) return;
        if (isPageVisible() && !isPhotoCaptureUiActive()) setSensitiveHidden(false);
      },
      true
    );

    document.addEventListener(
      "copy",
      function (e) {
        if (!isWorkerSafeguardActive()) return;
        var t = e.target;
        if (t && isSensitiveSurface(t)) e.preventDefault();
      },
      true
    );
  }

  function isWorkerDashboardPage() {
    try {
      var mode = document.documentElement.getAttribute("data-portal-screenshot-guard");
      if (mode === "workers") return true;
      var path = String((global.location && global.location.pathname) || "").toLowerCase();
      return /staff_dashboard\.html/.test(path) || /lead_dashboard\.html/.test(path);
    } catch (_e9) {
      return false;
    }
  }

  function portalScreenshotGuardResolveAppRole() {
    try {
      var box = global.window.__PORTAL_SUPABASE__;
      var profile = box && box.staff_profile;
      if (profile && profile.app_role) return String(profile.app_role).toLowerCase();
    } catch (_e10) {}
    return "";
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
        document.documentElement.classList.remove("portal-screenshot-guard-workers");
        disarm();
        return;
      }
      document.documentElement.classList.add("portal-screenshot-guard-workers");
      arm({ mobileOnly: false });
      bindWorkerSafeguardEvents();
      startSensitiveImageObserver();
      tagSensitiveImages(document);
      if (document.hidden) setSensitiveHidden(true);
    } catch (_e11) {}
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
    } catch (_e12) {}
  }

  global.PortalScreenshotGuard = {
    arm: arm,
    disarm: disarm,
    pushStrict: function () {},
    popStrict: function () {},
    pushMediaCaptureBypass: pushMediaCaptureBypass,
    popMediaCaptureBypass: popMediaCaptureBypass,
    showBlack: triggerScreenshotMask,
    hideBlack: hideMaskForce,
    hideBlackForce: hideMaskForce,
    triggerScreenshotMask: triggerScreenshotMask,
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
