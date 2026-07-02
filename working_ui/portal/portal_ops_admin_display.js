/**
 * Shared ops-admin display label — Sevitha is the portal Admin account.
 */
(function (global) {
  "use strict";

  var OPS_ADMIN_LABEL = "Sevitha (Admin)";
  var OPS_ADMIN_SHORT = "Admin";

  function isSevithaProfile(row) {
    if (!row) return false;
    if (
      global.portalCsCliqManagementInbox &&
      typeof global.portalCsCliqManagementInbox.isSevithaProfile === "function"
    ) {
      return global.portalCsCliqManagementInbox.isSevithaProfile(row);
    }
    if (global.portalDmRoles && typeof global.portalDmRoles.normKey === "function") {
      var nk = global.portalDmRoles.normKey(row.username || "");
      if (nk === "sevitha" || nk === "info") return true;
    }
    var u = String(row.username || "")
      .trim()
      .toLowerCase();
    return u === "sevitha" || u === "info";
  }

  function isOpsAdminProfile(row) {
    if (!row) return false;
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsOperationsAdminProfile === "function"
    ) {
      return global.portalDmRoles.portalDmIsOperationsAdminProfile(row);
    }
    return String(row.app_role || "").toLowerCase() === "admin" && isSevithaProfile(row);
  }

  function isOpsAdminStaffKey(staffKey) {
    var k = String(staffKey || "")
      .trim()
      .toLowerCase();
    return k === "sevitha" || k === "info";
  }

  /** MANAGER duty slot label on staff dashboard for ops admin. */
  function rosterDutyLabel(baseLabel, staffKey) {
    var base = String(baseLabel || "").trim().toUpperCase();
    if (base === "MANAGER" && isOpsAdminStaffKey(staffKey)) return workerFacingLabel();
    return String(baseLabel || "").trim();
  }

  /** Worker-facing lane — generic Admin. */
  function workerFacingLabel() {
    return OPS_ADMIN_SHORT;
  }

  /** Management board / god mode — named ops admin. */
  function managementLabel(prof) {
    if (isSevithaProfile(prof) || isOpsAdminProfile(prof)) return OPS_ADMIN_LABEL;
    return OPS_ADMIN_SHORT;
  }

  global.portalOpsAdminDisplay = {
    label: OPS_ADMIN_LABEL,
    shortLabel: OPS_ADMIN_SHORT,
    isSevithaProfile: isSevithaProfile,
    isOpsAdminProfile: isOpsAdminProfile,
    isOpsAdminStaffKey: isOpsAdminStaffKey,
    rosterDutyLabel: rosterDutyLabel,
    workerFacingLabel: workerFacingLabel,
    managementLabel: managementLabel,
  };
})(typeof window !== "undefined" ? window : globalThis);
