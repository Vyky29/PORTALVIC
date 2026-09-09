/**
 * Canonical human-facing staff labels (display only — roster keys stay lulia/javier/javi).
 * Luliya never Lulia/Lulya/Aida; Javier Marquez never Javi; CEO never Javier/Javi alone.
 * Session feedback authors use first names only (portalStaffAuthorFirstName).
 */
(function (global) {
  "use strict";

  function normKey(value) {
    return String(value || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function isLuliyaNormKey(k) {
    return (
      k === "luliya" ||
      k === "lulia" ||
      k === "lulya" ||
      k === "aida" ||
      k === "aidaluliya" ||
      k === "aidalulia" ||
      k === "aidaluliyajemal" ||
      k === "stf021"
    );
  }

  function displayFromNormKey(k) {
    if (!k) return "";
    if (isLuliyaNormKey(k)) return "Luliya";
    if (k === "javier" || k === "javiermarquez" || k === "stf010") return "Javier";
    if (
      k === "javi" ||
      k === "javiarranz" ||
      k === "javiarranzescorial" ||
      k === "palankas" ||
      k === "palankasarranz" ||
      k === "palankasarranzescorial" ||
      k === "javipalankas" ||
      k === "stf017"
    ) {
      return "Javi Palankas";
    }
    return "";
  }

  function firstNameToken(raw) {
    var part = String(raw || "")
      .split(/[,/&]|\band\b/i)[0]
      .trim();
    if (!part) return "";
    return part.split(/\s+/)[0] || "";
  }

  /**
   * @param {string} value roster key, instructor token, or profile staffName fragment
   * @returns {string}
   */
  function portalStaffDisplayName(value) {
    var raw = String(value || "").trim();
    if (!raw) return "";
    var mapped = displayFromNormKey(normKey(raw));
    if (mapped) return mapped;
    var firstTok = firstNameToken(raw);
    mapped = displayFromNormKey(normKey(firstTok));
    if (mapped) return mapped;
    try {
      var canon =
        typeof global.portalCanonicalStaffRosterKey === "function"
          ? global.portalCanonicalStaffRosterKey(raw)
          : normKey(raw);
      if (canon) {
        mapped = displayFromNormKey(normKey(canon));
        if (mapped) return mapped;
        var src = global.STAFF_DASHBOARD_SOURCE;
        var prof = src && src.staffProfiles ? src.staffProfiles[canon] : null;
        var sn = prof && String(prof.staffName || "").trim();
        if (sn) {
          mapped = displayFromNormKey(normKey(sn));
          if (mapped) return mapped;
          mapped = displayFromNormKey(normKey(firstNameToken(sn)));
          if (mapped) return mapped;
          firstTok = firstNameToken(sn) || firstTok;
        }
      }
    } catch (_) {}
    var label = firstTok || raw;
    mapped = displayFromNormKey(normKey(label));
    if (mapped) return mapped;
    if (/^[A-Z]{2,}$/.test(label)) {
      return label.charAt(0) + label.slice(1).toLowerCase();
    }
    return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
  }

  /** First name only for session_feedback.completed_by_name (Luliya not Aida Luliya). */
  function portalStaffAuthorFirstName(value) {
    var mapped = portalStaffDisplayName(value);
    if (!mapped) return "";
    if (/^javi palankas$/i.test(mapped)) return "Javi";
    var first = firstNameToken(mapped) || mapped;
    var again = displayFromNormKey(normKey(first));
    return again || first;
  }

  /** Comma-separated instructor roster label → display names. */
  function portalFormatInstructorLabel(label) {
    var raw = String(label || "").trim();
    if (!raw) return "";
    return raw
      .split(/[,/&]|\band\b/gi)
      .map(function (part) {
        return portalStaffDisplayName(String(part || "").trim());
      })
      .filter(Boolean)
      .join(", ");
  }

  global.portalStaffDisplayName = portalStaffDisplayName;
  global.portalStaffAuthorFirstName = portalStaffAuthorFirstName;
  global.portalFormatInstructorLabel = portalFormatInstructorLabel;
})(typeof window !== "undefined" ? window : globalThis);
