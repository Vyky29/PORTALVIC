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
    return k;
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

  function applyTopbarProfile(profile) {
    profile = profile || DEFAULT_TOPBAR_PROFILE;
    setIdsVisible(SWIMMING_ACHIEVEMENT_IDS, !!profile.photo);
    setIdsVisible(SWIMMING_TERM_REVIEW_IDS, !!profile.swReview);
    setIdsVisible(SWIMMING_VENUE_IDS, !!profile.venue);
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
    setIdsVisible(SWIMMING_PLANNER_IDS, false);
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
    return DEFAULT_TOPBAR_PROFILE;
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
})(typeof window !== "undefined" ? window : globalThis);
