/**
 * Staff portal subpages: phone-width vertical frame (matches staff_dashboard dev-mobile-preview).
 */
(function (global) {
  "use strict";

  var FORCE_VERTICAL =
    /portal-venue-review|portal-pickup|venue_review|venue-review|pickup\.html/i;

  function pagePath() {
    try {
      return String((global.location && global.location.pathname) || "").toLowerCase();
    } catch (_e) {
      return "";
    }
  }

  function isForceVerticalPage() {
    return FORCE_VERTICAL.test(pagePath());
  }

  function shouldUseMobileVertical() {
    if (isForceVerticalPage()) return true;
    try {
      var q = new URLSearchParams(global.location.search).get("m");
      var st = global.sessionStorage.getItem("staffPortalMobileUx");
      var narrow =
        global.matchMedia && global.matchMedia("(max-width:720px)").matches;
      return q === "1" || st === "1" || narrow;
    } catch (_e2) {
      return true;
    }
  }

  function applySubpageMobileVertical() {
    var on = shouldUseMobileVertical();
    var root = global.document.documentElement;
    root.setAttribute("data-portal-mobile-vertical", on ? "1" : "0");
    if (on) {
      root.setAttribute("data-portal-mobile", "1");
      if (global.document.body) {
        global.document.body.classList.add("portal-subpage-mobile-vertical");
      }
    } else {
      root.setAttribute("data-portal-mobile", "0");
      if (global.document.body) {
        global.document.body.classList.remove("portal-subpage-mobile-vertical");
      }
    }
  }

  applySubpageMobileVertical();
  global.portalApplySubpageMobileVertical = applySubpageMobileVertical;
  global.portalIsForceVerticalSubpage = isForceVerticalPage;
})(typeof window !== "undefined" ? window : globalThis);
