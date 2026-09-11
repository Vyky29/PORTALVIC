/**
 * Canonical staff_id / roster key for Parent Team, Overview, and Staff.
 * Keep in sync with supabase/functions/_shared/portal_staff_match_key.ts
 *
 * Never collapse javi ↔ javier (different people).
 */
(function (global) {
  "use strict";

  var STAFF_CODE_TO_KEY = {
    stf001: "sandra",
    stf002: "roberto",
    stf003: "dan",
    stf004: "angel",
    stf005: "youssef",
    stf006: "john",
    stf007: "bismark",
    stf008: "giuseppe",
    stf009: "godsway",
    stf010: "javier",
    stf011: "aurora",
    stf012: "berta",
    stf013: "victor",
    stf014: "carlos",
    stf015: "alex",
    stf016: "simon",
    stf017: "javi",
    stf018: "raul",
    stf019: "sevitha",
    stf020: "teflon",
    stf021: "luliya",
    stf022: "andres",
  };

  function stripDiacritics(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function staffJoinedKey(raw) {
    return stripDiacritics(String(raw || ""))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function canonicalStaffMatchKey(value) {
    var raw = stripDiacritics(String(value == null ? "" : value)).toLowerCase().trim();
    if (!raw) return "";

    var joined = raw.replace(/[^a-z0-9]+/g, "");
    if (STAFF_CODE_TO_KEY[joined]) return STAFF_CODE_TO_KEY[joined];

    if (/palankas|arranz/.test(raw) || joined.indexOf("palankas") >= 0 || joined.indexOf("javiarranz") >= 0) {
      return "javi";
    }
    if (/marquez/.test(raw) || joined === "javiermarquez") return "javier";

    if (
      joined === "lulia" ||
      joined === "luliya" ||
      joined === "lulya" ||
      joined === "aida" ||
      joined === "aidalulia" ||
      joined === "aidaluliya" ||
      joined === "aidaluliyajemal"
    ) {
      return "luliya";
    }
    if (joined === "yousef" || joined === "yusef" || joined === "yousseff" || joined === "josep") {
      return "youssef";
    }
    if (joined === "auroragarcia") return "aurora";
    if (
      joined === "emmanuel" ||
      joined === "emmanuelamoakohene" ||
      joined === "nanaamoakohene745"
    ) {
      return "emmanuel";
    }
    if (joined === "emanuel") return "emmanuel";
    if (joined.indexOf("michelle") === 0) return "michelle";

    if (joined === "coverneeded" || joined === "coverneed" || joined === "tbc" || joined === "tba") {
      return joined === "tbc" || joined === "tba" ? joined : "coverneeded";
    }

    var first = raw.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)[0] || "";
    if (!first) return "";
    if (STAFF_CODE_TO_KEY[first]) return STAFF_CODE_TO_KEY[first];
    if (first === "lulia" || first === "lulya" || first === "aida") return "luliya";
    if (first === "yousef" || first === "yusef") return "youssef";
    return first;
  }

  function isBlankOrCoverNeededStaffId(value) {
    var k = canonicalStaffMatchKey(value);
    if (!k) return true;
    return (
      k === "coverneeded" ||
      k === "tbc" ||
      k === "tba" ||
      k === "open" ||
      k === "vacant" ||
      k === "unassigned" ||
      k === "extra"
    );
  }

  function staffIdsMatch(a, b) {
    var ca = canonicalStaffMatchKey(a);
    var cb = canonicalStaffMatchKey(b);
    return !!ca && !!cb && ca === cb;
  }

  var api = {
    canonical: canonicalStaffMatchKey,
    canonicalStaffMatchKey: canonicalStaffMatchKey,
    staffJoinedKey: staffJoinedKey,
    isBlankOrCoverNeededStaffId: isBlankOrCoverNeededStaffId,
    staffIdsMatch: staffIdsMatch,
  };

  global.PortalStaffMatchKey = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
