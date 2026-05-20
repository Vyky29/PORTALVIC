/**
 * Optional portalReturn redirect helper for satellite HTML pages.
 * Vercel static deploy — no host CMS integration.
 */
(function (global) {
  "use strict";

  function portalReturnHostAllowed(hostname) {
    var h = String(hostname || "").toLowerCase();
    if (!h) return false;
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h === "www.clubsensational.org" || h === "clubsensational.org") return true;
    if (/(^|\.)clubsensational\.org$/i.test(h)) return true;
    try {
      if (typeof location !== "undefined" && location.hostname && h === String(location.hostname).toLowerCase()) return true;
    } catch (e) {}
    try {
      if (typeof location !== "undefined" && /\.vercel\.app$/i.test(h)) return true;
    } catch (e2) {}
    return false;
  }

  function portalGetPortalReturnUrl() {
    try {
      var q = typeof location !== "undefined" ? String(location.search || "") : "";
      var sp = new URLSearchParams(q.replace(/^\?/, ""));
      var raw = sp.get("portalReturn");
      if (!raw) return "";
      var decoded = String(raw);
      try {
        decoded = decodeURIComponent(decoded);
      } catch (eDecode) {
        decoded = String(raw);
      }
      var baseHref =
        typeof location !== "undefined" && location.href
          ? location.href
          : typeof document !== "undefined" && document.baseURI
            ? document.baseURI
            : "http://localhost/";
      var u = new URL(decoded, baseHref);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      if (!portalReturnHostAllowed(u.hostname)) return "";
      return u.href;
    } catch (e) {
      return "";
    }
  }

  function portalRedirectToPortalReturn() {
    var t = portalGetPortalReturnUrl();
    if (!t) return;
    try {
      global.location.replace(t);
    } catch (e) {
      try {
        global.location.href = t;
      } catch (e2) {}
    }
  }

  global.portalGetPortalReturnUrl = portalGetPortalReturnUrl;
  global.portalRedirectToPortalReturn = portalRedirectToPortalReturn;
})(typeof window !== "undefined" ? window : this);
