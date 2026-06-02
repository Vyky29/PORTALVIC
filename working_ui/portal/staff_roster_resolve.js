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
    stf017: "javi",
    stf018: "raul",
    stf019: "sevitha",
    stf020: "teflon",
  };

  function portalProfileRosterKey(v) {
    var k = String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
    if (k === "luliya") return "lulia";
    return k;
  }

  var PORTAL_AUTH_EMAIL_TO_ROSTER_KEY = {
    "b.traperocasado@gmail.com": "berta",
    "johnnyosti37@gmail.com": "john",
    "stf012@staff.import.pending": "berta",
    "stf006@staff.import.pending": "john",
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
    var keys = portalStaffRosterKeyCandidates(profile, authUser);
    var i;
    for (i = 0; i < keys.length; i++) {
      var boot = Adapter.bootstrap({ source: source, staffId: keys[i] });
      if (boot && Array.isArray(boot.sessionsModel) && boot.sessionsModel.length) {
        return { staffId: keys[i], boot: boot };
      }
    }
    var fallback = keys[0] || "";
    if (!fallback) return null;
    var boot0 = Adapter.bootstrap({ source: source, staffId: fallback });
    if (!boot0) return null;
    return { staffId: fallback, boot: boot0 };
  }

  window.portalStaffRosterKeyCandidates = portalStaffRosterKeyCandidates;
  window.portalBootstrapStaffRosterFromProfile = portalBootstrapStaffRosterFromProfile;
  window.portalRosterKeyFromAuthEmail = portalRosterKeyFromAuthEmail;
})();
