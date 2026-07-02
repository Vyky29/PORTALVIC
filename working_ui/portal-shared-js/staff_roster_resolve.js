/**
 * Resolve staff_profiles + auth user → roster key (roberto, …), same rules as timesheet.html.
 */
(function () {
  var PORTAL_STAFF_CODE_TO_ROSTER_KEY = {
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
    stf021: "lulia",
    stf022: "andres",
  };

  /** Never treat these as the same person when bootstrapping rosters. */
  var ROSTER_KEY_NEVER_CROSS = {
    javi: ["javier"],
    javier: ["javi"],
  };

  var EXEC_OR_ADMIN_ROSTER_KEYS = {
    victor: true,
    raul: true,
    javi: true,
    sevitha: true,
  };

  function portalProfileRosterKey(v) {
    var k = String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
    if (!k) return "";
    if (k === "luliya") return "lulia";
    if (k === "aida") return "lulia";
    if (k === "javiermarquez") return "javier";
    if (k === "javiarranz" || k === "javiarranzescorial") return "javi";
    var alias = PORTAL_STAFF_CODE_TO_ROSTER_KEY[k];
    if (alias) return alias;
    return k;
  }

  var PORTAL_AUTH_EMAIL_TO_ROSTER_KEY = {
    "b.traperocasado@gmail.com": "berta",
    "johnnyosti37@gmail.com": "john",
    "stf012@staff.import.pending": "berta",
    "stf006@staff.import.pending": "john",
    "stf021@staff.import.pending": "lulia",
    "stf016@staff.import.pending": "simon",
  };

  /** Auth email → roster key (berta, john); stf00x local part via staff code map. */
  function portalRosterKeyFromAuthEmail(authEmail) {
    var em = String(authEmail || "").trim().toLowerCase();
    if (!em) return "";
    if (PORTAL_AUTH_EMAIL_TO_ROSTER_KEY[em]) return PORTAL_AUTH_EMAIL_TO_ROSTER_KEY[em];
    var local = em.split("@")[0] || "";
    if (!local) return "";
    var alias = PORTAL_STAFF_CODE_TO_ROSTER_KEY[local];
    return alias || "";
  }

  /**
   * Authoritative roster key for the signed-in user (email / username / infer — not name guesses).
   * @returns {string}
   */
  function portalPrimaryStaffRosterKey(profile, authUser) {
    var p = profile || {};
    var user = authUser || null;
    var email = user && user.email ? String(user.email) : "";
    if (typeof window.portalInferStaffKey === "function") {
      var inferred = window.portalInferStaffKey(p, email);
      if (inferred) return portalProfileRosterKey(inferred);
    }
    var fromEmail = portalRosterKeyFromAuthEmail(email);
    if (fromEmail) return fromEmail;
    var fromUser = portalProfileRosterKey(p.username);
    if (fromUser && PORTAL_STAFF_CODE_TO_ROSTER_KEY[fromUser]) return PORTAL_STAFF_CODE_TO_ROSTER_KEY[fromUser];
    if (fromUser && !/^stf\d{3}$/.test(fromUser)) return fromUser;
    return "";
  }

  function portalStaffIsExecOrAdminProfile(profile, authUser) {
    var app = String((profile && profile.app_role) || "").toLowerCase();
    if (app === "ceo" || app === "admin") return true;
    var pk = portalPrimaryStaffRosterKey(profile, authUser);
    return !!(pk && EXEC_OR_ADMIN_ROSTER_KEYS[pk]);
  }

  /** Ignore ?portalPreview=teflon when a real signed-in user is not the teflon demo account. */
  function portalStaffShouldIgnoreTeflonPreview(profile, authUser) {
    try {
      var qs = new URLSearchParams(window.location.search || "");
      if (String(qs.get("portalPreview") || "").trim().toLowerCase() !== "teflon") return false;
      var pk = portalPrimaryStaffRosterKey(profile, authUser);
      return !!pk && pk !== "teflon";
    } catch (_ignore) {
      return false;
    }
  }

  function portalStaffClearTeflonPreviewFromUrl() {
    try {
      var u = new URL(window.location.href);
      if (!u.searchParams.has("portalPreview")) return;
      u.searchParams.delete("portalPreview");
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    } catch (_url) {}
  }

  function portalStaffRosterKeyCandidates(profile, authUser) {
    var p = profile || {};
    var user = authUser || null;
    var meta = (user && user.user_metadata) || {};
    var email = user && user.email ? String(user.email) : "";
    var emailLocal = email.split("@")[0] || "";
    var fromEmail = portalRosterKeyFromAuthEmail(email);
    var raw = [];
    if (fromEmail) raw.push(fromEmail);
    raw.push(
      p.username,
      p.full_name,
      String(p.full_name || "").split(/\s+/).filter(Boolean)[0],
      meta.preferred_username,
      meta.username,
      meta.name,
      meta.full_name,
      emailLocal
    );
    if (typeof window.portalInferStaffKey === "function") {
      var inferred = window.portalInferStaffKey(p, email);
      if (inferred) raw.push(inferred);
    }
    var seen = Object.create(null);
    var out = [];
    raw.forEach(function (v) {
      var k = portalProfileRosterKey(v);
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(k);
      if (/^stf\d{3}$/.test(k)) {
        var alias = PORTAL_STAFF_CODE_TO_ROSTER_KEY[k];
        if (alias && !seen[alias]) {
          seen[alias] = true;
          out.push(alias);
        }
      }
    });
    return out;
  }

  /**
   * Keys allowed for roster bootstrap — never borrow another instructor's sessions.
   * @returns {string[]}
   */
  function portalBootstrapKeysForProfile(profile, authUser) {
    var primary = portalPrimaryStaffRosterKey(profile, authUser);
    var blocked = Object.create(null);
    if (primary && ROSTER_KEY_NEVER_CROSS[primary]) {
      ROSTER_KEY_NEVER_CROSS[primary].forEach(function (k) {
        blocked[k] = true;
      });
    }
    var seen = Object.create(null);
    var out = [];
    function push(k) {
      var c = portalProfileRosterKey(k);
      if (!c || seen[c] || blocked[c]) return;
      seen[c] = true;
      out.push(c);
    }
    if (primary) push(primary);
    if (portalStaffIsExecOrAdminProfile(profile, authUser)) {
      return out;
    }
    if (primary) {
      Object.keys(PORTAL_STAFF_CODE_TO_ROSTER_KEY).forEach(function (code) {
        if (PORTAL_STAFF_CODE_TO_ROSTER_KEY[code] === primary) push(code);
      });
    }
    return out.length ? out : portalStaffRosterKeyCandidates(profile, authUser).filter(function (k) {
      return !blocked[portalProfileRosterKey(k)];
    });
  }

  function portalDashboardSource() {
    if (typeof window.portalResolveStaffDashboardSource === "function") {
      return window.portalResolveStaffDashboardSource();
    }
    return typeof window !== "undefined" ? window.STAFF_DASHBOARD_SOURCE : null;
  }

  /**
   * @returns {{ staffId: string, boot: object } | null}
   */
  function portalBootstrapStaffRosterFromProfile(profile, authUser) {
    var Adapter =
      typeof window !== "undefined" ? window.StaffDashboardSpreadsheetAdapter : null;
    var source = portalDashboardSource();
    if (!Adapter || !source) return null;
    var keys = portalBootstrapKeysForProfile(profile, authUser);
    if (!keys.length) return null;
    var i;
    for (i = 0; i < keys.length; i++) {
      var boot = Adapter.bootstrap({ source: source, staffId: keys[i] });
      if (boot && Array.isArray(boot.sessionsModel) && boot.sessionsModel.length) {
        return { staffId: portalProfileRosterKey(keys[i]), boot: boot };
      }
    }
    var useKey = portalProfileRosterKey(keys[0]);
    var boot0 = Adapter.bootstrap({ source: source, staffId: useKey });
    if (!boot0) return null;
    return { staffId: useKey, boot: boot0 };
  }

  window.portalPrimaryStaffRosterKey = portalPrimaryStaffRosterKey;
  window.portalStaffRosterKeyCandidates = portalStaffRosterKeyCandidates;
  window.portalBootstrapStaffRosterFromProfile = portalBootstrapStaffRosterFromProfile;
  window.portalRosterKeyFromAuthEmail = portalRosterKeyFromAuthEmail;
  window.portalStaffIsExecOrAdminProfile = portalStaffIsExecOrAdminProfile;
  window.portalStaffShouldIgnoreTeflonPreview = portalStaffShouldIgnoreTeflonPreview;
  window.portalStaffClearTeflonPreviewFromUrl = portalStaffClearTeflonPreviewFromUrl;
})();
