/**
 * Open unified admin CS Cliq from staff/lead portals (inline embed, not redirect).
 */
(function (global) {
  "use strict";

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
    if (global.portalCsCliqEmbed && typeof global.portalCsCliqEmbed.open === "function") {
      return global.portalCsCliqEmbed.open(channel);
    }
    return false;
  }

  global.portalDmExecutiveCliq = {
    tryOpenAdminCliq: tryOpenAdminCliq,
  };
})(typeof window !== "undefined" ? window : globalThis);
