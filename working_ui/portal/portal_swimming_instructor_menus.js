/**
 * Quick menu — Swimming Term Review + Swimming Programme visible only for Swimming Instructor roles.
 */
(function (global) {
  "use strict";

  var SWIMMING_MENU_IDS = ["quickMenuStaffTermReview", "quickMenuRoleTraining"];

  function portalStaffRoleLabelIsSwimmingInstructor(role) {
    return /swimming\s*instructor/i.test(String(role || "").trim());
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
    return "swimming";
  }

  async function portalStaffIsSwimmingInstructor() {
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
            return portalStaffRoleLabelIsSwimmingInstructor(row && row.role);
          });
        }
        var track = String(staffRoleTrackFallback() || "")
          .toLowerCase()
          .replace(/[\s_-]+/g, "");
        return track === "swimming";
      }
      var trackFallback = String(staffRoleTrackFallback() || "")
        .toLowerCase()
        .replace(/[\s_-]+/g, "");
      return trackFallback === "swimming";
    } catch (_) {
      return false;
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
  global.portalStaffIsSwimmingInstructor = portalStaffIsSwimmingInstructor;
  global.portalSyncSwimmingInstructorQuickMenus = portalSyncSwimmingInstructorQuickMenus;
  global.portalSyncSwimmingTermReviewQuickMenu = portalSyncSwimmingInstructorQuickMenus;
})(typeof window !== "undefined" ? window : globalThis);
