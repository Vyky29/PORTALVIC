/**
 * Shared internal-chat role rules ù directors (Raul, Javier, Victor), admin, staff reachability.
 */
(function (global) {
  "use strict";

  var DIRECTOR_FIRST_KEYS = { raul: true, victor: true, javier: true, javi: true };
  var DIRECTOR_SURNAME_KEYS = { arranz: true, palan: true };

  function normKey(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function profileRow(prof) {
    return prof || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  function profileNameParts(row) {
    var parts = String((row && row.full_name) || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return {
      username: normKey(row && row.username),
      first: normKey(parts[0] || ""),
      last: normKey(parts.length > 1 ? parts[parts.length - 1] : ""),
      full: normKey((row && row.full_name) || ""),
    };
  }

  function portalDmIsDirectorProfile(row) {
    if (!row || row.is_active === false) return false;
    var ar = String(row.app_role || "").toLowerCase();
    if (ar === "staff") return false;
    var p = profileNameParts(row);
    if (p.username === "raul" || p.username === "victor") return true;
    if (p.username.indexOf("palan") >= 0) return true;
    if (p.username === "javi" || p.username === "javier") {
      return (
        DIRECTOR_SURNAME_KEYS[p.last] ||
        p.full.indexOf("arranz") >= 0 ||
        p.full.indexOf("palan") >= 0
      );
    }
    if (p.full.indexOf("palan") >= 0 || p.full.indexOf("arranz") >= 0) return true;
    if (p.first === "raul" || p.first === "victor") return true;
    if (
      (p.first === "javier" || p.first === "javi") &&
      (DIRECTOR_SURNAME_KEYS[p.last] || p.full.indexOf("arranz") >= 0 || p.full.indexOf("palan") >= 0)
    ) {
      return true;
    }
    return false;
  }

  function portalDmIsAdminProfile(row) {
    if (!row || row.is_active === false) return false;
    var ar = String(row.app_role || "").toLowerCase();
    return ar === "admin" || ar === "ceo";
  }

  /** Staff may start a DM only with the three directors or admin/CEO. */
  function portalDmStaffInitiatePeer(row) {
    return portalDmIsDirectorProfile(row) || portalDmIsAdminProfile(row);
  }

  /** Raul, Javier Arranz (Palan), Victor, admin, and CEO use the admin CS Cliq experience. */
  function portalDmUsesAdminCliq(prof) {
    var row = profileRow(prof);
    if (portalDmIsAdminProfile(row) || portalDmIsDirectorProfile(row)) return true;
    return false;
  }

  /** Named CEO accounts (Raul, Victor, Javi) plus Javier Arranz / Palan ù not staff named Javier. */
  function portalDmIsExecutiveCeoTrioMember(row) {
    row = profileRow(row);
    if (!row || row.is_active === false) return false;
    var ar = String(row.app_role || "").toLowerCase();
    var u = String(row.username || "")
      .trim()
      .toLowerCase();
    if (ar === "ceo" && (u === "raul" || u === "victor" || u === "javi")) return true;
    return portalDmIsDirectorProfile(row);
  }

  function portalDmOnAdminPortal() {
    try {
      return /admin_dashboard\.html/i.test(String((global.location && global.location.pathname) || ""));
    } catch (_e) {
      return false;
    }
  }

  global.portalDmRoles = {
    normKey: normKey,
    portalDmIsDirectorProfile: portalDmIsDirectorProfile,
    portalDmIsExecutiveCeoTrioMember: portalDmIsExecutiveCeoTrioMember,
    portalDmIsAdminProfile: portalDmIsAdminProfile,
    portalDmStaffInitiatePeer: portalDmStaffInitiatePeer,
    portalDmUsesAdminCliq: portalDmUsesAdminCliq,
    portalDmOnAdminPortal: portalDmOnAdminPortal,
  };
})(typeof window !== "undefined" ? window : globalThis);
