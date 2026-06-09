/**
 * Lock screen to landscape on mobile while Sessions Overview is open.
 * Staff/lead dashboards stay portrait; only overview surfaces call this.
 */
(function (global) {
  "use strict";

  var _locked = false;

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

  async function portalLockLandscape() {
    if (!isMobileViewport()) return;
    try {
      document.documentElement.classList.add("portal-force-landscape");
      if (document.body) document.body.classList.add("portal-force-landscape");
    } catch (_e) {}
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

  global.portalLockLandscape = portalLockLandscape;
  global.portalUnlockOrientation = portalUnlockOrientation;
})(typeof window !== "undefined" ? window : globalThis);
