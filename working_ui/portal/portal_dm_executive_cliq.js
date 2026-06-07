/**
 * Route ops directors and admin to the unified admin CS Cliq from any portal.
 */
(function (global) {
  "use strict";

  var RETURN_KEY = "portal_cliq_return_url";

  function profileRow() {
    return (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  function usesAdminCliq() {
    if (global.portalDmRoles && typeof global.portalDmRoles.portalDmUsesAdminCliq === "function") {
      return global.portalDmRoles.portalDmUsesAdminCliq(profileRow());
    }
    return false;
  }

  function onAdminPortal() {
    if (global.portalDmRoles && typeof global.portalDmRoles.portalDmOnAdminPortal === "function") {
      return global.portalDmRoles.portalDmOnAdminPortal();
    }
    try {
      return /admin_dashboard\.html/i.test(String((global.location && global.location.pathname) || ""));
    } catch (_e) {
      return false;
    }
  }

  function tryOpenAdminCliq(channel) {
    if (!usesAdminCliq() || onAdminPortal()) return false;
    channel = String(channel || "staff_lead").trim() === "ceo_exec" ? "ceo_exec" : "staff_lead";
    try {
      global.sessionStorage.setItem(RETURN_KEY, String(global.location.href || ""));
      global.sessionStorage.setItem("portal_cliq_pending_channel", channel);
    } catch (_ss) {}
    global.location.assign("/admin_dashboard.html?portal_open=cs_cliq&portal_cliq_channel=" + encodeURIComponent(channel));
    return true;
  }

  function consumeReturnUrl() {
    try {
      var url = String(global.sessionStorage.getItem(RETURN_KEY) || "").trim();
      if (url) global.sessionStorage.removeItem(RETURN_KEY);
      return url;
    } catch (_e) {
      return "";
    }
  }

  function consumePendingChannel() {
    try {
      var ch = String(global.sessionStorage.getItem("portal_cliq_pending_channel") || "").trim();
      if (ch) global.sessionStorage.removeItem("portal_cliq_pending_channel");
      return ch === "ceo_exec" ? "ceo_exec" : "staff_lead";
    } catch (_e2) {
      return "staff_lead";
    }
  }

  global.portalDmExecutiveCliq = {
    tryOpenAdminCliq: tryOpenAdminCliq,
    consumeReturnUrl: consumeReturnUrl,
    consumePendingChannel: consumePendingChannel,
  };
})(typeof window !== "undefined" ? window : globalThis);
