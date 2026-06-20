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
    venue: true,
    pickup: true,
    planner: false,
    sixIcon: false,
    leadExtras: false,
  };

  /**
   * Named swimming / special profiles (all include CLIENTS in the header).
   * @type {Record<string, {photo:boolean,swReview:boolean,venue:boolean,pickup:boolean,planner:boolean,sixIcon:boolean,leadExtras?:boolean}>}
   */
  var EXPLICIT_TOPBAR_PROFILES = {
    sandra: {
      photo: true,
      swReview: false,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: false,
    },
    roberto: {
      photo: true,
      swReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: false,
    },
    aurora: {
      photo: false,
      swReview: true,
      venue: true,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    dan: {
      photo: false,
      swReview: true,
      venue: true,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    javier: {
      photo: false,
      swReview: true,
      venue: true,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    simon: {
      photo: false,
      swReview: true,
      venue: true,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    angel: {
      photo: false,
      swReview: true,
      venue: true,
      pickup: true,
      planner: false,
      sixIcon: false,
    },
    youssef: {
      photo: true,
      swReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: true,
    },
    lulia: {
      photo: true,
      swReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: true,
    },
    berta: {
      photo: true,
      swReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
    },
    john: {
      photo: true,
      swReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
    },
    michelle: {
      photo: true,
      swReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
    },
    victor: {
      photo: true,
      swReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: true,
    },
    raul: {
      photo: true,
      swReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: true,
    },
    javi: {
      photo: true,
      swReview: true,
      venue: true,
      pickup: true,
      planner: true,
      sixIcon: false,
      leadExtras: true,
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
    if (k === "luliya" || k === "aida" || k === "stf021") return "lulia";
    if (k === "yousef" || k === "yousseff" || k === "yusef") return "youssef";
    if (k === "stf006") return "john";
    if (k === "stf012") return "berta";
    if (k === "michelleemmacaleb" || k.indexOf("michelle") === 0) return "michelle";
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

  function resolveCurrentStaffKey() {
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
        return !!global.portalCanAccessCeoDashboard(profile, email);
      }
      if (typeof global.__portalCanAccessCeoDashboard === "function") {
        return !!global.__portalCanAccessCeoDashboard(profile, email);
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

  function applyTopbarProfile(profile) {
    profile = profile || DEFAULT_TOPBAR_PROFILE;
    var venueOn = !!profile.venue && portalStaffVenueReportToolsAllowed();
    setIdsVisible(SWIMMING_ACHIEVEMENT_IDS, !!profile.photo);
    setIdsVisible(SWIMMING_TERM_REVIEW_IDS, !!profile.swReview);
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
    setIdsVisible(CEO_STAFF_TOPBAR_IDS, true);
    setIdsVisible(SWIMMING_TERM_REVIEW_IDS, false);
    var plannerOn = !!String(
      global.ROUTINES_PLANNER_HANDOFF_URL || global.ROUTINES_PLANNER_URL || "",
    ).trim();
    setIdsVisible(SWIMMING_PLANNER_IDS, plannerOn);
    if (plannerOn && typeof global.portalEnableRoutinesPlannerUi === "function") {
      try {
        global.portalEnableRoutinesPlannerUi();
      } catch (_) {}
    }
    SWIMMING_MENU_IDS.forEach(function (id) {
      setElementVisible(id, false);
    });
    global.__PORTAL_TOPBAR_SIX_ICON_GRID__ = false;
    global.__PORTAL_TOPBAR_LEAD_EXTRAS__ = false;
  }

  global.portalSyncCeoFullTopbarTools = applyCeoStaffTopbarTools;

  function resolveTopbarProfileForStaff(staffKey) {
    if (EXPLICIT_TOPBAR_PROFILES[staffKey]) {
      return EXPLICIT_TOPBAR_PROFILES[staffKey];
    }
    var leadKey = resolveProgrammeLeadStaffKeyFromAuth();
    if (leadKey && EXPLICIT_TOPBAR_PROFILES[leadKey]) {
      return EXPLICIT_TOPBAR_PROFILES[leadKey];
    }
    return DEFAULT_TOPBAR_PROFILE;
  }

  function portalResyncPlannerToolsAfterIdentity() {
    var staffKey = resolveCurrentStaffKey();
    if (!staffKey) staffKey = resolveProgrammeLeadStaffKeyFromAuth();
    applyTopbarProfile(resolveTopbarProfileForStaff(staffKey));
    try {
      if (typeof global.portalSyncTopbarRoleTools === "function") {
        global.portalSyncTopbarRoleTools({ isLead: !!global.__PORTAL_TOPBAR_IS_LEAD__ });
      }
    } catch (_) {}
  }

  async function portalSyncSwimmingInstructorQuickMenus() {
    if (portalStaffIsCeoTopbarFullAccess()) {
      applyTopbarProfile({
        photo: true,
        swReview: true,
        venue: true,
        pickup: true,
        planner: true,
        sixIcon: false,
        leadExtras: true,
      });
      try {
        if (typeof global.applySetupRoleTrainingRow === "function") {
          global.applySetupRoleTrainingRow();
        }
      } catch (_) {}
      return;
    }

    var staffKey = resolveCurrentStaffKey();
    applyTopbarProfile(resolveTopbarProfileForStaff(staffKey));

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
  }
})(typeof window !== "undefined" ? window : globalThis);
