/**
 * Ops admin staff dashboard — hide payroll/participants; show contractor invoice.
 */
(function (global) {
  "use strict";

  var HIDE_IDS = [
    "dockParticipantsTile",
    "quickMenuSessionParticipants",
    "quickMenuWorkTimesheet",
    "quickMenuMyDocsPayslips",
    "topbarToolCellAchievements",
    "topbarToolAchievements",
    "quickMenuParticipantAchievements",
  ];

  var SHOW_IDS = ["quickMenuContractorInvoice"];

  function resolveStaffKey() {
    try {
      if (global.portalInferStaffKey && global.__PORTAL_SUPABASE__) {
        var box = global.__PORTAL_SUPABASE__;
        var prof = box.staff_profile;
        var em = box.session && box.session.user ? box.session.user.email : "";
        var k = global.portalInferStaffKey(prof, em);
        if (k) return String(k).trim().toLowerCase();
      }
    } catch (_) {}
    try {
      if (global.dashboardData && global.dashboardData.staffId) {
        return String(global.dashboardData.staffId).trim().toLowerCase();
      }
    } catch (_) {}
    try {
      if (global.STAFF_DASHBOARD_ID) return String(global.STAFF_DASHBOARD_ID).trim().toLowerCase();
    } catch (_) {}
    return "";
  }

  function isOpsAdminViewer() {
    var key = resolveStaffKey();
    if (
      global.portalOpsAdminDisplay &&
      typeof global.portalOpsAdminDisplay.isOpsAdminStaffKey === "function"
    ) {
      return global.portalOpsAdminDisplay.isOpsAdminStaffKey(key);
    }
    return key === "sevitha" || key === "info";
  }

  function setVisible(id, visible) {
    var el = global.document && global.document.getElementById(id);
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) el.removeAttribute("data-portal-ops-admin-hidden");
    else el.setAttribute("data-portal-ops-admin-hidden", "1");
  }

  function syncOpsAdminStaffDashboardUi() {
    if (!isOpsAdminViewer()) return;
    HIDE_IDS.forEach(function (id) {
      setVisible(id, false);
    });
    SHOW_IDS.forEach(function (id) {
      setVisible(id, true);
    });
    try {
      if (global.document && global.document.documentElement) {
        global.document.documentElement.classList.add("portal-ops-admin-staff-view");
      }
    } catch (_) {}
    try {
      if (
        global.portalOpsAdminDutyRoster &&
        typeof global.portalOpsAdminDutyRoster.patchTermConfig === "function"
      ) {
        global.portalOpsAdminDutyRoster.patchTermConfig();
      }
    } catch (_) {}
  }

  global.portalSyncOpsAdminStaffDashboardUi = syncOpsAdminStaffDashboardUi;
  global.portalIsOpsAdminStaffViewer = isOpsAdminViewer;

  if (global.document && global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", syncOpsAdminStaffDashboardUi);
  } else {
    syncOpsAdminStaffDashboardUi();
  }
  global.addEventListener("portal:supabase-ready", syncOpsAdminStaffDashboardUi);
})(typeof window !== "undefined" ? window : globalThis);
