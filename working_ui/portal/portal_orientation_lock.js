/**
 * Lock screen to landscape on mobile while Sessions Overview (or timesheet/expenses) is open.
 * Staff/lead dashboards stay portrait; only surfaces that call this use the lock.
 */
(function (global) {
  "use strict";

  var _locked = false;
  var _bound = false;

  function canLock() {
    return !!(
      global.screen &&
      global.screen.orientation &&
      typeof global.screen.orientation.lock === "function"
    );
  }

  function isMobileViewport() {
    try {
      return global.matchMedia && global.matchMedia("(max-width: 900px)").matches;
    } catch (_e) {
      return false;
    }
  }

  function applyForceLandscapeClass() {
    try {
      document.documentElement.classList.add("portal-force-landscape");
      if (document.body) document.body.classList.add("portal-force-landscape");
    } catch (_e) {}
  }

  async function portalLockLandscape(options) {
    var opts = options && typeof options === "object" ? options : {};
    var alwaysCss = !!opts.always;
    if (alwaysCss || isMobileViewport()) {
      applyForceLandscapeClass();
    }
    if (!isMobileViewport() && !alwaysCss) return;
    if (!canLock()) return;
    try {
      await global.screen.orientation.lock("landscape");
      _locked = true;
    } catch (_e1) {
      try {
        await global.screen.orientation.lock("landscape-primary");
        _locked = true;
      } catch (_e2) {
        _locked = false;
      }
    }
  }

  async function portalUnlockOrientation() {
    try {
      document.documentElement.classList.remove("portal-force-landscape");
      document.body.classList.remove("portal-force-landscape");
    } catch (_e) {}
    if (!canLock() || !_locked) {
      _locked = false;
      return;
    }
    try {
      await global.screen.orientation.unlock();
    } catch (_e3) {}
    _locked = false;
  }

  function portalBindLandscapeLock(options) {
    if (_bound) return;
    _bound = true;
    var opts = options && typeof options === "object" ? options : {};
    function retry() {
      if (typeof portalLockLandscape === "function") {
        void portalLockLandscape(opts);
      }
    }
    global.addEventListener("orientationchange", retry);
    global.addEventListener("pageshow", retry);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) retry();
    });
    global.addEventListener("resize", retry);
    retry();
  }

  global.portalLockLandscape = portalLockLandscape;
  global.portalUnlockOrientation = portalUnlockOrientation;
  global.portalBindLandscapeLock = portalBindLandscapeLock;
})(typeof window !== "undefined" ? window : globalThis);
