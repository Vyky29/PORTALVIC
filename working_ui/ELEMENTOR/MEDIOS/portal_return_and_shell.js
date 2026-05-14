/**
 * Embedded portal pages (e.g. WordPress): hide theme chrome and validate `portalReturn` redirects.
 */
(function (global) {
  "use strict";

  var CSS =
    "html.portal-app-shell body.admin-bar{padding-top:0!important;margin-top:0!important}" +
    "html.portal-app-shell #wpadminbar," +
    "html.portal-app-shell #masthead," +
    "html.portal-app-shell header#masthead," +
    "html.portal-app-shell .site-header," +
    "html.portal-app-shell #site-header," +
    "html.portal-app-shell .ast-primary-header-bar," +
    "html.portal-app-shell .ast-above-header," +
    "html.portal-app-shell .elementor-location-header," +
    "html.portal-app-shell .elementor-location-footer," +
    "html.portal-app-shell #colophon," +
    "html.portal-app-shell footer.site-footer," +
    "html.portal-app-shell .site-footer," +
    "html.portal-app-shell #footer," +
    "html.portal-app-shell .site-bottom-footer-inner-wrap," +
    "html.portal-app-shell .footer-widget-area{display:none!important;visibility:hidden!important;height:0!important;overflow:hidden!important;pointer-events:none!important}" +
    "html.portal-app-shell .site-content," +
    "html.portal-app-shell #content," +
    "html.portal-app-shell .site-main," +
    "html.portal-app-shell #primary{margin-top:0!important;padding-top:0!important}" +
    "html.portal-app-shell #page," +
    "html.portal-app-shell .site{margin-top:0!important;padding-top:0!important}" +
    "html.portal-app-shell," +
    "html.portal-app-shell body{max-width:100vw!important;overflow-x:hidden!important}" +
    "html.portal-app-shell #page," +
    "html.portal-app-shell .site," +
    "html.portal-app-shell .site-content," +
    "html.portal-app-shell #content," +
    "html.portal-app-shell #primary," +
    "html.portal-app-shell .site-main{max-width:100vw!important;overflow-x:hidden!important}";

  function installWpChromeHide() {
    try {
      document.documentElement.classList.add("portal-app-shell");
    } catch (e) {}
    if (document.getElementById("portal-hide-wp-chrome")) return;
    var st = document.createElement("style");
    st.id = "portal-hide-wp-chrome";
    st.textContent = CSS;
    var head = document.head || document.getElementsByTagName("head")[0];
    if (head && head.firstChild) head.insertBefore(st, head.firstChild);
    else if (head) head.appendChild(st);
    else try {
      document.documentElement.appendChild(st);
    } catch (e2) {}
  }

  function portalReturnHostAllowed(hostname) {
    var h = String(hostname || "").toLowerCase();
    if (!h) return false;
    if (h === "localhost" || h === "127.0.0.1") return true;
    if (h === "www.clubsensational.org" || h === "clubsensational.org") return true;
    if (/(^|\.)clubsensational\.org$/i.test(h)) return true;
    try {
      if (typeof location !== "undefined" && location.hostname && h === String(location.hostname).toLowerCase()) return true;
    } catch (e) {}
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

  installWpChromeHide();

  global.portalGetPortalReturnUrl = portalGetPortalReturnUrl;
  global.portalRedirectToPortalReturn = portalRedirectToPortalReturn;
})(typeof window !== "undefined" ? window : this);
