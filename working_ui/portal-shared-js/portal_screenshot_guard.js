/**
 * Mobile portal screenshot deterrence (best-effort in browser/PWA).
 * Hides sensitive UI behind an instant black overlay when the page loses focus
 * (common during power+volume screenshot on Android). Strict mode for photo viewers.
 * True black screenshots on the same device need a native Android wrapper (FLAG_SECURE).
 */
(function (global) {
  "use strict";

  var GUARD_ID = "portalScreenshotGuard";
  var armed = false;
  var bound = false;
  var strictTokens = Object.create(null);
  var lingerTimer = null;
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

  function ensureEl() {
    var el = document.getElementById(GUARD_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = GUARD_ID;
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("role", "presentation");
    var root = document.body || document.documentElement;
    root.appendChild(el);
    return el;
  }

  function setSensitiveHidden(on) {
    try {
      document.documentElement.classList.toggle("portal-screenshot-sensitive-hidden", !!on);
    } catch (_e) {}
  }

  function showBlack(opts) {
    if (!armed) return;
    opts = opts || {};
    var el = ensureEl();
    el.classList.add("is-active");
    setSensitiveHidden(true);
    global.clearTimeout(lingerTimer);
    if (opts.persist) return;
    var ms = opts.lingerMs != null ? opts.lingerMs : isStrict() ? STRICT_LINGER_MS : DEFAULT_LINGER_MS;
    lingerTimer = global.setTimeout(function () {
      if (document.hidden || isStrict()) return;
      el.classList.remove("is-active");
      setSensitiveHidden(false);
    }, ms);
  }

  function hideBlack() {
    if (document.hidden || isStrict()) return;
    global.clearTimeout(lingerTimer);
    var el = document.getElementById(GUARD_ID);
    if (el) el.classList.remove("is-active");
    setSensitiveHidden(false);
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    document.addEventListener(
      "visibilitychange",
      function () {
        if (!armed) return;
        if (document.hidden) showBlack({ persist: true });
        else showBlack({ lingerMs: isStrict() ? STRICT_LINGER_MS : DEFAULT_LINGER_MS });
      },
      true
    );

    global.addEventListener(
      "blur",
      function () {
        if (armed) showBlack({ persist: true });
      },
      true
    );

    global.addEventListener(
      "pagehide",
      function () {
        if (armed) showBlack({ persist: true });
      },
      true
    );

    global.addEventListener(
      "focus",
      function () {
        if (!armed || document.hidden) return;
        if (isStrict()) showBlack({ persist: true });
        else hideBlack();
      },
      true
    );

    document.addEventListener(
      "keyup",
      function (e) {
        if (!armed) return;
        if (e.key === "PrintScreen") showBlack({ lingerMs: 4500 });
        if (e.ctrlKey && e.shiftKey && (e.key === "s" || e.key === "S")) showBlack({ lingerMs: 4500 });
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
    return true;
  }

  function disarm() {
    armed = false;
    try {
      document.documentElement.classList.remove("portal-screenshot-guard-armed");
    } catch (_e3) {}
    hideBlack();
  }

  function pushStrict(token) {
    var key = String(token || "default");
    strictTokens[key] = 1;
    if (armed && document.hidden) showBlack({ persist: true });
  }

  function popStrict(token) {
    var key = String(token || "default");
    delete strictTokens[key];
    if (!document.hidden && !isStrict()) hideBlack();
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
    showBlack: showBlack,
    hideBlack: hideBlack,
    isMobilePortalDevice: isMobilePortalDevice,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoArmFromDocument);
  } else {
    autoArmFromDocument();
  }
})(typeof window !== "undefined" ? window : this);
