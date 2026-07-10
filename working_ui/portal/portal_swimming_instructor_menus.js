/**
 * Staff topbar + quick menu tool visibility (explicit per-roster profiles).
 * Programme leads (Berta/John/Michelle) and CEOs use portal_topbar_header.js after this runs.
 */
(function (global) {
  "use strict";

  var SWIMMING_MENU_IDS = ["quickMenuStaffTermReview", "quickMenuRoleTraining"];
  var SWIMMING_TERM_REVIEW_IDS = [
    "quickMenuStaffTermReview",
    "topbarToolCellTermReview",
    "topbarToolTermReview",
  ];
  var LEAD_TERM_REVIEW_IDS = [
    "quickMenuStaffLeadTermReview",
    "topbarToolCellLeadTermReview",
    "topbarToolLeadTermReview",
  ];
  var SWIMMING_ACHIEVEMENT_IDS = [
    "quickMenuParticipantAchievements",
    "topbarToolCellAchievements",
    "topbarToolAchievements",
  ];
  var SWIMMING_PICKUP_IDS = [
    "quickMenuDropoffPickup",
    "topbarToolCellPickup",
    "topbarToolPickup",
  ];
  var SWIMMING_VENUE_IDS = [
    "quickMenuWorkVenue",
    "topbarToolCellVenue",
    "topbarToolVenue",
  ];
  var SWIMMING_PLANNER_IDS = [
    "quickMenuStaffSessionPlan",
    "topbarToolCellSessionPlanner",
    "topbarToolSessionPlanner",
  ];

  /** Default staff (Godsway, Bismark, Giuseppe, Carlos, Alex, …). Sandra has an explicit profile below. */
  var DEFAULT_TOPBAR_PROFILE = {
    photo: true,
    swReview: false,
    leadReview: false,
    venue: true,
    pickup: true,
    planner: false,
    sixIcon: false,
    leadExtras: false,
  };

  /**
   * Named swimming / special profiles (all include CLIENTS in the header).
   * photoDays: optional weekdays when Photo shows even if photo is false (e.g. Dan — Sundays only).
   * @type {Record<string, {photo:boolean,photoDays?:string[],swReview:boolean,leadReview:boolean,venue:boolean,pickup:boolean,planner:boolean,sixIcon:boolean,leadExtras?:boolean,stats?:boolean}>}
   */
  var EXPLICIT_TOPBAR_PROFILES = {
    alex: {
      photo: true,
      swReview: false,
      leadReview: false,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
    },
    andres: {
      photo: true,
      swReview: false,
      leadReview: false,
      venue: true,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    angel: {
      photo: false,
      swReview: true,
      leadReview: false,
      venue: false,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    aurora: {
      photo: true,
      swReview: true,
      leadReview: false,
      venue: false,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    berta: {
      photo: true,
      swReview: false,
      leadReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: true,
    },
    bismark: {
      photo: true,
      swReview: false,
      leadReview: false,
      venue: true,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    carlos: {
      photo: true,
      swReview: false,
      leadReview: false,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
    },
    dan: {
      photo: false,
      photoDays: ["Sunday"],
      swReview: true,
      leadReview: false,
      venue: false,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    giuseppe: {
      photo: true,
      swReview: false,
      leadReview: false,
      venue: false,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    godsway: {
      photo: true,
      swReview: false,
      leadReview: false,
      venue: false,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    javier: {
      photo: true,
      swReview: true,
      leadReview: false,
      venue: false,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    john: {
      photo: true,
      swReview: false,
      leadReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
    },
    lulia: {
      photo: true,
      swReview: true,
      leadReview: false,
      venue: false,
      pickup: true,
      planner: true,
      sixIcon: true,
    },
    michelle: {
      photo: true,
      swReview: false,
      leadReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
    },
    sandra: {
      photo: true,
      swReview: false,
      leadReview: false,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
    },
    sevitha: {
      photo: true,
      swReview: true,
      leadReview: false,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: false,
    },
    simon: {
      photo: false,
      swReview: true,
      leadReview: false,
      venue: false,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    youssef: {
      photo: true,
      swReview: false,
      leadReview: false,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
    },
    roberto: {
      photo: true,
      swReview: true,
      leadReview: false,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: false,
    },
    victor: {
      photo: true,
      swReview: true,
      leadReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: true,
      stats: false,
    },
    raul: {
      photo: true,
      swReview: true,
      leadReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: true,
      stats: false,
    },
    javi: {
      photo: true,
      swReview: true,
      leadReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: true,
      stats: false,
    },
    palankas: {
      photo: true,
      swReview: true,
      leadReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: true,
      stats: false,
    },
  };

  var CEO_STAFF_TOPBAR_IDS = [
    "quickMenuParticipantAchievements",
    "topbarToolCellAchievements",
    "topbarToolAchievements",
    "quickMenuWorkVenue",
    "topbarToolCellVenue",
    "topbarToolVenue",
    "quickMenuDropoffPickup",
    "topbarToolCellPickup",
    "topbarToolPickup",
  ];

  function portalStaffRoleLabelIsSwimmingInstructor(role) {
    return /swimming\s*instructor/i.test(String(role || "").trim());
  }

  function portalStaffRoleLabelIsAquatic(role) {
    var r = String(role || "")
      .trim()
      .toLowerCase();
    if (!r) return false;
    if (portalStaffRoleLabelIsSwimmingInstructor(role)) return true;
    return /aquatic|swim(?:ming)?\s*(?:instructor|coach|teacher)|pool\s*instructor|lane\s*coach/.test(
      r,
    );
  }

  function canonicalStaffRosterKey(value) {
    var k = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
    if (!k) return "";
    // Prefer the authoritative resolver (auth-map.js) which knows the full
    // staff-code map (stf001..stf022 -> roster keys, e.g. stf005 -> youssef).
    // STAFF_DASHBOARD_ID is often a staff code, so without this the topbar
    // profile lookup fell back to DEFAULT for anyone whose code wasn't hard
    // coded below (e.g. Youssef = stf005 -> only Photo/Venue/PickUp showed).
    try {
      if (typeof global.portalCanonicalStaffRosterKey === "function") {
        var canon = global.portalCanonicalStaffRosterKey(k);
        if (canon) return canon;
      }
    } catch (_) {}
    if (k === "luliya" || k === "aida" || k === "stf021") return "lulia";
    if (k === "yousef" || k === "yousseff" || k === "yusef" || k === "stf005") return "youssef";
    if (k.indexOf("youssef") === 0 || k.indexOf("yousef") === 0) return "youssef";
    if (k === "stf006") return "john";
    if (k === "stf012") return "berta";
    if (k === "michelleemmacaleb" || k.indexOf("michelle") === 0) return "michelle";
    if (k === "palankas" || k === "palankasarranz" || k === "palankasarranzescorial") return "javi";
    if (k === "javiarranz" || k === "javiarranzescorial") return "javi";
    return k;
  }

  var PROGRAMME_LEAD_AUTH_EMAILS = {
    "b.traperocasado@gmail.com": "berta",
    "johnnyosti37@gmail.com": "john",
    "michelle@youtimecounselling.com": "michelle",
  };

  function resolveProgrammeLeadStaffKeyFromAuth() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var em = String((box.session && box.session.user && box.session.user.email) || "")
        .trim()
        .toLowerCase();
      if (em && PROGRAMME_LEAD_AUTH_EMAILS[em]) return PROGRAMME_LEAD_AUTH_EMAILS[em];
      if (em.indexOf("traperocasado") >= 0) return "berta";
      if (em.indexOf("johnnyosti") >= 0 || em.indexOf("john.osti") >= 0) return "john";
      if (em.indexOf("michelle@youtimecounselling") >= 0) return "michelle";
    } catch (_) {}
    return "";
  }

  /* Remember the last non-empty key we resolved. Several topbar re-syncs fire on
     frequent events (avatar/orbit refresh, source-updated, identity-resolved) and
     STAFF_DASHBOARD_ID can be momentarily "" during those passes; without this,
     one empty pass would re-apply the DEFAULT icon set (Photo/Venue/PickUp) over
     the staff's real profile (e.g. Youssef's Photo/Review/PickUp/Plan). */
  var __portalLastGoodStaffKey = "";

  function resolveCurrentStaffKey() {
    var resolved = resolveCurrentStaffKeyRaw();
    if (resolved) {
      __portalLastGoodStaffKey = resolved;
      return resolved;
    }
    return __portalLastGoodStaffKey;
  }

  /* Anti-downgrade guard. Several async passes (identity-resolved, source-updated,
     avatar refresh) each re-resolve + re-apply the topbar profile. If one pass
     transiently resolves to DEFAULT for a staff who actually has an explicit
     profile (e.g. Youssef = Photo/Venue/PickUp/Plan), it would drop the 4th icon
     back to the 3-icon default. Remember the last explicit (non-default) profile
     per staff key and reuse it when a later pass fails to resolve for the SAME
     staff (or before identity is known). A genuine switch to a different known
     staff (e.g. admin ghost teleport) still gets its own profile. */
  var __portalLastExplicitProfile = null;
  var __portalLastExplicitKey = "";

  function resolveTopbarProfileForStaffGuarded(staffKey) {
    var canon = canonicalStaffRosterKey(staffKey);
    var profile = resolveTopbarProfileForStaff(staffKey);
    if (profile && profile !== DEFAULT_TOPBAR_PROFILE) {
      __portalLastExplicitKey = canon;
      __portalLastExplicitProfile = profile;
      return profile;
    }
    if (__portalLastExplicitProfile && (!canon || canon === __portalLastExplicitKey)) {
      return __portalLastExplicitProfile;
    }
    return profile;
  }

  function resolveCurrentStaffKeyRaw() {
    try {
      var sid = global.STAFF_DASHBOARD_ID;
      if (sid) {
        var fromStaffDash = canonicalStaffRosterKey(sid);
        if (fromStaffDash) return fromStaffDash;
      }
    } catch (_) {}
    try {
      var dd = global.dashboardData;
      if (dd && dd.staffId) {
        var fromDash = canonicalStaffRosterKey(dd.staffId);
        if (fromDash) return fromDash;
      }
    } catch (_) {}
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      var user = box.session && box.session.user;
      if (typeof global.portalInferStaffKey === "function") {
        return canonicalStaffRosterKey(
          global.portalInferStaffKey(profile, user && user.email),
        );
      }
      if (profile && profile.username) {
        return canonicalStaffRosterKey(profile.username);
      }
    } catch (_) {}
    var fromAuth = resolveProgrammeLeadStaffKeyFromAuth();
    if (fromAuth) return fromAuth;
    return "";
  }

  function portalStaffHasFullTrainingAccess() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      var user = box.session && box.session.user;
      if (typeof global.portalStaffIsExecOrAdminProfile === "function") {
        if (global.portalStaffIsExecOrAdminProfile(profile, user)) return true;
      }
      var app = String((profile && profile.app_role) || "").toLowerCase();
      if (app === "ceo" || app === "admin") return true;
    } catch (_) {}
    return false;
  }

  function portalStaffIsCeoTopbarFullAccess() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      var email = (box.session && box.session.user && box.session.user.email) || "";
      if (typeof global.portalCanAccessCeoDashboard === "function") {
        if (global.portalCanAccessCeoDashboard(profile, email)) return true;
      } else if (typeof global.__portalCanAccessCeoDashboard === "function") {
        if (global.__portalCanAccessCeoDashboard(profile, email)) return true;
      }
      var staffKey = resolveCurrentStaffKey();
      return staffKey === "victor" || staffKey === "javi" || staffKey === "raul";
    } catch (_) {
      return false;
    }
  }

  function setElementVisible(id, visible) {
    var el = global.document && global.document.getElementById(id);
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function setIdsVisible(ids, visible) {
    (ids || []).forEach(function (id) {
      setElementVisible(id, visible);
    });
  }

  function portalStaffVenueReportToolsAllowed() {
    try {
      if (typeof global.portalCanOpenVenueReportNormally === "function") {
        return !!global.portalCanOpenVenueReportNormally();
      }
    } catch (_) {}
    return true;
  }

  function weekdayLongForPhotoGate(referenceDate) {
    try {
      var d = referenceDate instanceof Date ? referenceDate : new Date();
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString("en-GB", { weekday: "long" });
    } catch (_) {
      return "";
    }
  }

  function portalTopbarPhotoVisibleForProfile(profile, referenceDate) {
    profile = profile || DEFAULT_TOPBAR_PROFILE;
    if (profile.photo) return true;
    var days = profile.photoDays;
    if (!Array.isArray(days) || !days.length) return false;
    var wd = weekdayLongForPhotoGate(referenceDate);
    if (!wd) return false;
    for (var i = 0; i < days.length; i += 1) {
      if (String(days[i] || "").trim() === wd) return true;
    }
    return false;
  }

  function applyTopbarProfile(profile) {
    profile = profile || DEFAULT_TOPBAR_PROFILE;
    /* Venue tool is now self-initiated (staff do a venue review only if a venue isn't
       right), so it follows the header profile flag alone and is no longer gated by the
       scheduled opening/closing duty windows. */
    var venueOn = !!profile.venue;
    setIdsVisible(SWIMMING_ACHIEVEMENT_IDS, portalTopbarPhotoVisibleForProfile(profile));
    setIdsVisible(SWIMMING_TERM_REVIEW_IDS, !!profile.swReview);
    setIdsVisible(LEAD_TERM_REVIEW_IDS, !!profile.leadReview);
    setIdsVisible(SWIMMING_VENUE_IDS, venueOn);
    setIdsVisible(SWIMMING_PICKUP_IDS, !!profile.pickup);
    setIdsVisible(SWIMMING_PLANNER_IDS, !!profile.planner);
    if (profile.planner && typeof global.portalEnableRoutinesPlannerUi === "function") {
      try {
        global.portalEnableRoutinesPlannerUi();
      } catch (_) {}
    }

    SWIMMING_MENU_IDS.forEach(function (id) {
      setElementVisible(id, !!profile.swReview);
    });

    global.__PORTAL_TOPBAR_SIX_ICON_GRID__ = !!profile.sixIcon;
    global.__PORTAL_TOPBAR_LEAD_EXTRAS__ = !!profile.leadExtras;
  }

  function applyCeoStaffTopbarTools() {
    var staffKey = resolveCurrentStaffKey();
    if (!staffKey) staffKey = resolveProgrammeLeadStaffKeyFromAuth();
    var profile = resolveTopbarProfileForStaff(staffKey);
    applyTopbarProfile(profile);
    var showLead = !!profile.leadExtras;
    var showStats = showLead && profile.stats !== false;
    setIdsVisible(["topbarToolCellLeadReport", "topbarToolLeadReport"], showLead);
    setIdsVisible(["topbarToolCellSessionsOverview", "topbarToolSessionsOverview"], showStats);
    global.__PORTAL_TOPBAR_SIX_ICON_GRID__ = false;
    global.__PORTAL_TOPBAR_LEAD_EXTRAS__ = showLead;
  }

  global.portalSyncCeoFullTopbarTools = applyCeoStaffTopbarTools;

  /**
   * Resolve the topbar profile for a staff key robustly. The stored key can be a
   * full-name variant (e.g. "yousseflastname") depending on how the roster hit was
   * matched, so fall back to the displayed staff name (first token) and a prefix
   * match against the known profiles before defaulting.
   */
  function resolveTopbarProfileForStaff(staffKey) {
    var key = canonicalStaffRosterKey(staffKey);
    var matched = key && EXPLICIT_TOPBAR_PROFILES[key] ? EXPLICIT_TOPBAR_PROFILES[key] : null;

    if (!matched) {
      try {
        var nm = (global.dashboardData && global.dashboardData.staffName) || "";
        var nameKey = canonicalStaffRosterKey(String(nm).split(/\s+/)[0]);
        if (nameKey && EXPLICIT_TOPBAR_PROFILES[nameKey]) {
          matched = EXPLICIT_TOPBAR_PROFILES[nameKey];
        }
      } catch (_) {}
    }

    if (!matched && key) {
      var profileKeys = Object.keys(EXPLICIT_TOPBAR_PROFILES);
      for (var i = 0; i < profileKeys.length; i += 1) {
        var pk = profileKeys[i];
        if (pk.length >= 5 && key.indexOf(pk) === 0) {
          matched = EXPLICIT_TOPBAR_PROFILES[pk];
          break;
        }
      }
    }

    if (!matched) {
      var leadKey = resolveProgrammeLeadStaffKeyFromAuth();
      if (leadKey && EXPLICIT_TOPBAR_PROFILES[leadKey]) {
        matched = EXPLICIT_TOPBAR_PROFILES[leadKey];
      }
    }

    return matched || DEFAULT_TOPBAR_PROFILE;
  }

  function portalResyncPlannerToolsAfterIdentity() {
    var staffKey = resolveCurrentStaffKey();
    if (!staffKey) staffKey = resolveProgrammeLeadStaffKeyFromAuth();
    applyTopbarProfile(resolveTopbarProfileForStaffGuarded(staffKey));
    try {
      if (typeof global.portalSyncTopbarRoleTools === "function") {
        global.portalSyncTopbarRoleTools({ isLead: !!global.__PORTAL_TOPBAR_IS_LEAD__ });
      }
    } catch (_) {}
  }

  async function portalSyncSwimmingInstructorQuickMenus() {
    if (portalStaffIsCeoTopbarFullAccess()) {
      var ceoKey = resolveCurrentStaffKey() || resolveProgrammeLeadStaffKeyFromAuth();
      applyTopbarProfile(resolveTopbarProfileForStaff(ceoKey));
      try {
        if (typeof global.applySetupRoleTrainingRow === "function") {
          global.applySetupRoleTrainingRow();
        }
      } catch (_) {}
      return;
    }

    var staffKey = resolveCurrentStaffKey();
    applyTopbarProfile(resolveTopbarProfileForStaffGuarded(staffKey));

    try {
      if (typeof global.applySetupRoleTrainingRow === "function") {
        global.applySetupRoleTrainingRow();
      }
    } catch (_) {}
  }

  global.portalStaffRoleLabelIsSwimmingInstructor = portalStaffRoleLabelIsSwimmingInstructor;
  global.portalStaffRoleLabelIsAquatic = portalStaffRoleLabelIsAquatic;
  global.portalStaffHasFullTrainingAccess = portalStaffHasFullTrainingAccess;
  global.portalStaffIsSwimmingInstructor = function () {
    return Promise.resolve(false);
  };
  /** Catalog for portal_topbar_icons_lab.html — order matches staff_dashboard topbar DOM. */
  var PORTAL_TOPBAR_TOOL_CATALOG = [
    { id: "photo", label: "Photo", cellId: "topbarToolCellAchievements", profileKey: "photo" },
    { id: "venue", label: "Venue", cellId: "topbarToolCellVenue", profileKey: "venue" },
    { id: "pickup", label: "PickUp", cellId: "topbarToolCellPickup", profileKey: "pickup" },
    {
      id: "swReview",
      label: "Review",
      cellId: "topbarToolCellTermReview",
      profileKey: "swReview",
      reviewKind: "swimming",
    },
    {
      id: "leadReview",
      label: "TermRev",
      cellId: "topbarToolCellLeadTermReview",
      profileKey: "leadReview",
      reviewKind: "lead",
    },
    { id: "plan", label: "Plan", cellId: "topbarToolCellSessionPlanner", profileKey: "planner" },
    { id: "lead", label: "Lead", cellId: "topbarToolCellLeadReport", leadExtra: true },
    { id: "stats", label: "Stats", cellId: "topbarToolCellSessionsOverview", leadExtra: true },
  ];

  function portalStaffIsProgrammeLeadKey(staffKey) {
    return staffKey === "berta" || staffKey === "john" || staffKey === "michelle";
  }

  /**
   * Resolve which header tool ids are visible for a roster profile (lab + diagnostics).
   * @param {object} profile
   * @param {{staffKey?:string,venueDuty?:boolean,isLeadShell?:boolean,isCeoTopbar?:boolean,plannerUrlSet?:boolean}} opts
   * @returns {string[]}
   */
  function portalComputeVisibleTopbarToolIds(profile, opts) {
    opts = opts || {};
    profile = profile || DEFAULT_TOPBAR_PROFILE;
    var staffKey = canonicalStaffRosterKey(opts.staffKey || "");
    var venueOn = !!profile.venue && opts.venueDuty !== false;
    var isLeadShell = !!opts.isLeadShell;
    var isCeoTopbar = !!opts.isCeoTopbar || (staffKey === "victor" || staffKey === "javi" || staffKey === "raul");
    var isProgrammeLead =
      isLeadShell || portalStaffIsProgrammeLeadKey(staffKey) || (isCeoTopbar && !!profile.leadExtras);
    var showLeadExtras =
      isLeadShell ||
      isProgrammeLead ||
      (!!profile.sixIcon && !!profile.leadExtras);
    var plannerOn =
      !!profile.planner &&
      (opts.plannerUrlSet !== false) &&
      !!String(global.ROUTINES_PLANNER_HANDOFF_URL || global.ROUTINES_PLANNER_URL || "").trim();
    var out = [];
    if (isCeoTopbar && !isLeadShell && !portalStaffIsProgrammeLeadKey(staffKey)) {
      if (portalTopbarPhotoVisibleForProfile(profile, opts.referenceDate)) out.push("photo");
      if (venueOn) out.push("venue");
      if (profile.pickup) out.push("pickup");
      if (profile.swReview) out.push("swReview");
      if (profile.leadReview) out.push("leadReview");
      if (plannerOn) out.push("plan");
      if (showLeadExtras) {
        out.push("lead");
        if (profile.stats !== false) out.push("stats");
      }
      return out;
    }
    if (portalTopbarPhotoVisibleForProfile(profile, opts.referenceDate)) out.push("photo");
    if (venueOn) out.push("venue");
    if (profile.pickup) out.push("pickup");
    if (profile.swReview) out.push("swReview");
    if (profile.leadReview && (isProgrammeLead || isLeadShell)) out.push("leadReview");
    if (plannerOn) out.push("plan");
    if (showLeadExtras) {
      out.push("lead");
      if (profile.stats !== false) out.push("stats");
    }
    return out;
  }

  function portalTopbarGridModeForVisibleCount(n, profile, opts) {
    opts = opts || {};
    profile = profile || DEFAULT_TOPBAR_PROFILE;
    var staffKey = canonicalStaffRosterKey(opts.staffKey || "");
    var isProgrammeLead =
      !!opts.isLeadShell ||
      portalStaffIsProgrammeLeadKey(staffKey) ||
      ((staffKey === "victor" || staffKey === "javi" || staffKey === "raul") && !!profile.leadExtras);
    var showLeadExtras =
      !!opts.isLeadShell ||
      isProgrammeLead ||
      (!!profile.sixIcon && !!profile.leadExtras);
    if (n >= 7) return "eight";
    if (showLeadExtras || n > 3 || !!profile.sixIcon) return "lead";
    return "four";
  }

  global.portalTopbarPhotoVisibleForProfile = portalTopbarPhotoVisibleForProfile;
  global.PORTAL_TOPBAR_TOOL_CATALOG = PORTAL_TOPBAR_TOOL_CATALOG;
  global.PORTAL_DEFAULT_TOPBAR_PROFILE = DEFAULT_TOPBAR_PROFILE;
  global.PORTAL_EXPLICIT_TOPBAR_PROFILES = EXPLICIT_TOPBAR_PROFILES;
  global.portalComputeVisibleTopbarToolIds = portalComputeVisibleTopbarToolIds;
  global.portalTopbarGridModeForVisibleCount = portalTopbarGridModeForVisibleCount;
  global.portalStaffIsProgrammeLeadKey = portalStaffIsProgrammeLeadKey;
  global.portalSyncSwimmingInstructorQuickMenus = portalSyncSwimmingInstructorQuickMenus;
  global.portalSyncSwimmingTermReviewQuickMenu = portalSyncSwimmingInstructorQuickMenus;
  global.portalResolveStaffTopbarProfile = resolveTopbarProfileForStaff;
  global.portalResyncPlannerToolsAfterIdentity = portalResyncPlannerToolsAfterIdentity;

  if (global.addEventListener) {
    global.addEventListener("portal:staff-identity-resolved", function () {
      try {
        portalResyncPlannerToolsAfterIdentity();
      } catch (_) {}
    });
    /* Safety net: if `portal:staff-identity-resolved` fired before this module
       attached its listener (e.g. a cache-bump refetches one script while others
       load from cache, reordering boot), the topbar can stay stuck on the default
       profile (3 icons) and drop a worker's own tools (e.g. Youssef's "Plan").
       Re-apply once the page settles — but only when a staff key resolves, so this
       never downgrades an already-correct topbar to the default. */
    var portalLateTopbarResync = function () {
      try {
        var k =
          (typeof resolveCurrentStaffKey === "function" && resolveCurrentStaffKey()) ||
          (typeof resolveProgrammeLeadStaffKeyFromAuth === "function" &&
            resolveProgrammeLeadStaffKeyFromAuth());
        if (k) portalResyncPlannerToolsAfterIdentity();
      } catch (_) {}
    };
    if (global.document && global.document.readyState === "complete") {
      setTimeout(portalLateTopbarResync, 0);
    } else {
      global.addEventListener("load", function () {
        setTimeout(portalLateTopbarResync, 300);
      });
    }
    global.addEventListener("portal:staff-deferred-dashboard-ready", function () {
      try {
        portalResyncPlannerToolsAfterIdentity();
      } catch (_) {}
      try {
        if (typeof global.portalSyncTodaySectionDisplay === "function") {
          global.portalSyncTodaySectionDisplay();
        } else if (typeof portalSyncTodaySectionDisplay === "function") {
          portalSyncTodaySectionDisplay();
        }
      } catch (_) {}
      try {
        if (typeof global.renderToday === "function") global.renderToday();
        else if (typeof renderToday === "function") renderToday();
      } catch (_) {}
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
