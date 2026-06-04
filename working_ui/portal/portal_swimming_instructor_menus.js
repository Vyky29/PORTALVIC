/**
 * Quick menu — Swimming Term Review + Swimming Programme (Training section).
 * Visible for aquatic/swimming staff; hidden for climbing, support-only, etc.
 * CEOs (Victor, Javi, Raúl) and Sevitha see all swimming training items on staff/lead shells.
 */
(function (global) {
  "use strict";

  var SWIMMING_MENU_IDS = ["quickMenuStaffTermReview", "quickMenuRoleTraining"];

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

  function setSwimmingMenuVisible(show) {
    SWIMMING_MENU_IDS.forEach(function (id) {
      var btn = global.document && global.document.getElementById(id);
      if (!btn) return;
      btn.hidden = !show;
      btn.setAttribute("aria-hidden", show ? "false" : "true");
    });
  }

  async function portalSyncSwimmingInstructorQuickMenus() {
    var show = await portalStaffIsSwimmingInstructor();
    setSwimmingMenuVisible(show);
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
