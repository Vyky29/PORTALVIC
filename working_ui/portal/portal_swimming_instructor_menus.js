/**
 * Quick menu + topbar — swimming instructors: term review, day-centre photos, venue exceptions.
 * CEOs (Victor, Javi, Raúl) and Sevitha see all swimming training items on staff/lead shells.
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

  /** Pool venue report in header — swimming only, not day-centre-only staff. */
  var SWIMMING_VENUE_HEADER_KEYS = new Set(["roberto", "aurora", "dan"]);

  /** Day Centre + swimming → session photos (header + quick menu). */
  var SWIMMING_DAY_CENTRE_PHOTO_KEYS = new Set([
    "roberto",
    "youssef",
    "lulia",
    "luliya",
  ]);

  /** Swimming instructors who keep venue but never photos. */
  var SWIMMING_NO_PHOTO_KEYS = new Set(["aurora", "dan"]);

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

  function staffRoleTrackFallback() {
    try {
      var t = global.dashboardData && global.dashboardData.staffRoleTrack;
      if (t) return t;
    } catch (_) {}
    try {
      var boot = global.__spreadsheetBoot;
      if (boot && boot.staffRoleTrack) return boot.staffRoleTrack;
    } catch (_) {}
    return "";
  }

  function staffRoleTrackIsAquatic(track) {
    var t = String(track || "")
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
    if (!t) return false;
    return t === "swimming";
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

  function instructorMatchesStaff(staffKey, instructor) {
    if (!staffKey) return false;
    try {
      var bridge = global.PortalStaffFeedbackBridge;
      if (bridge && typeof bridge.staffOwnsInstructor === "function") {
        return bridge.staffOwnsInstructor(staffKey, instructor);
      }
    } catch (_) {}
    var blob = String(instructor || "").trim();
    if (!blob) return false;
    var parts = blob.split(/[,/&]+|\s+and\s+/gi);
    for (var i = 0; i < parts.length; i++) {
      var p = String(parts[i] || "").trim();
      if (!p) continue;
      var first = canonicalStaffRosterKey((p.split(/\s+/)[0] || "").trim());
      if (canonicalStaffRosterKey(p) === staffKey || first === staffKey) return true;
    }
    return false;
  }

  function serviceIsDayCentre(session) {
    var svc = String(
      (session &&
        (session.service || session.rosterService || session.activity || session.serviceName)) ||
        "",
    ).toLowerCase();
    return svc.indexOf("day centre") !== -1 || svc.indexOf("day center") !== -1;
  }

  function staffHasDayCentreOnRoster(staffKey) {
    if (!staffKey) return false;
    if (SWIMMING_NO_PHOTO_KEYS.has(staffKey)) return false;
    if (SWIMMING_DAY_CENTRE_PHOTO_KEYS.has(staffKey)) return true;

    var bootFn = global.portalBootstrapStaffRosterFromProfile;
    if (typeof bootFn !== "function") return false;
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var bootWrap = bootFn(box.staff_profile || null, (box.session && box.session.user) || null);
      if (!bootWrap || !bootWrap.boot) return false;
      var model = bootWrap.boot.sessionsModel || [];
      for (var i = 0; i < model.length; i++) {
        var s = model[i];
        if (!s || s.clientId === "closed") continue;
        if (!serviceIsDayCentre(s)) continue;
        if (instructorMatchesStaff(staffKey, s.instructor || s.instructors)) return true;
      }
    } catch (_) {}
    return false;
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

  async function portalStaffIsSwimmingInstructor() {
    if (portalStaffHasFullTrainingAccess()) return true;

    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    var uid =
      (box && box.session && box.session.user && box.session.user.id) ||
      (box && box.staff_profile && box.staff_profile.id) ||
      "";
    try {
      if (client && uid) {
        var res = await client.from("staff_role_rates").select("role").eq("user_id", uid);
        if (!res.error && Array.isArray(res.data) && res.data.length) {
          return res.data.some(function (row) {
            return portalStaffRoleLabelIsAquatic(row && row.role);
          });
        }
      }
      return staffRoleTrackIsAquatic(staffRoleTrackFallback());
    } catch (_) {
      return staffRoleTrackIsAquatic(staffRoleTrackFallback());
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

  function applyNonSwimmingToolbar() {
    SWIMMING_MENU_IDS.forEach(function (id) {
      setElementVisible(id, false);
    });
    setIdsVisible(SWIMMING_TERM_REVIEW_IDS, false);
    setIdsVisible(SWIMMING_ACHIEVEMENT_IDS, true);
    setIdsVisible(SWIMMING_PICKUP_IDS, true);
    setIdsVisible(SWIMMING_VENUE_IDS, true);
  }

  function applySwimmingInstructorToolbar(staffKey) {
    SWIMMING_MENU_IDS.forEach(function (id) {
      setElementVisible(id, true);
    });
    setIdsVisible(SWIMMING_TERM_REVIEW_IDS, true);

    setIdsVisible(SWIMMING_PICKUP_IDS, false);

    var showVenue = SWIMMING_VENUE_HEADER_KEYS.has(staffKey);
    setIdsVisible(SWIMMING_VENUE_IDS, showVenue);

    var showPhotos =
      staffHasDayCentreOnRoster(staffKey) && !SWIMMING_NO_PHOTO_KEYS.has(staffKey);
    setIdsVisible(SWIMMING_ACHIEVEMENT_IDS, showPhotos);
  }

  async function portalSyncSwimmingInstructorQuickMenus() {
    var show = await portalStaffIsSwimmingInstructor();
    var staffKey = resolveCurrentStaffKey();

    if (!show) {
      applyNonSwimmingToolbar();
    } else {
      applySwimmingInstructorToolbar(staffKey);
    }

    try {
      if (typeof global.applySetupRoleTrainingRow === "function") {
        global.applySetupRoleTrainingRow();
      }
    } catch (_) {}
  }

  global.portalStaffRoleLabelIsSwimmingInstructor = portalStaffRoleLabelIsSwimmingInstructor;
  global.portalStaffRoleLabelIsAquatic = portalStaffRoleLabelIsAquatic;
  global.portalStaffHasFullTrainingAccess = portalStaffHasFullTrainingAccess;
  global.portalStaffIsSwimmingInstructor = portalStaffIsSwimmingInstructor;
  global.portalSyncSwimmingInstructorQuickMenus = portalSyncSwimmingInstructorQuickMenus;
  global.portalSyncSwimmingTermReviewQuickMenu = portalSyncSwimmingInstructorQuickMenus;
})(typeof window !== "undefined" ? window : globalThis);
