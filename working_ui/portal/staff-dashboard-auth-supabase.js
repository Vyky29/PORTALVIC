import { portalLogout, bootstrapDashboardSupabase, portalInferStaffKey, portalCanonicalStaffRosterKey, portalCanAccessCeoDashboard, portalIsStaffHomeProgrammeLead, portalIsProgrammeLeadUser, portalIsAdminHomeExecutiveUser } from "/portal/auth-handler.js?v=20260620-javi-roster-key";
import { portalSyncExecWorkspaceSwitchSlot } from "/portal/portal_exec_workspace_switch.js?v=20260526-exec-modes";

window.__PORTAL_LOGOUT_FN__ = portalLogout;
window.portalInferStaffKey = portalInferStaffKey;
window.portalCanonicalStaffRosterKey = portalCanonicalStaffRosterKey;
window.portalCanAccessCeoDashboard = portalCanAccessCeoDashboard;
window.portalIsStaffHomeProgrammeLead = portalIsStaffHomeProgrammeLead;
window.portalIsProgrammeLeadUser = portalIsProgrammeLeadUser;
window.portalIsAdminHomeExecutiveUser = portalIsAdminHomeExecutiveUser;

try {
  await bootstrapDashboardSupabase({ page: "staff" });
} catch (e) {
  console.warn("staff_dashboard: Supabase bootstrap", e);
}

portalSyncExecWorkspaceSwitchSlot("staff");

const profile = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
const session = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session;

if (window.dashboardData) {
  const ghostEarly =
    window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active
      ? window.__PORTAL_GHOST_VIEW__
      : null;
  if (!ghostEarly) {
    const displayName =
      typeof window.portalTopbarDisplayNameFromAuth === "function"
        ? window.portalTopbarDisplayNameFromAuth(profile, session)
        : profile
          ? String(profile.full_name || profile.username || "").trim()
          : "";
    if (displayName) window.dashboardData.staffName = displayName;
  }
  if (!String(window.STAFF_DASHBOARD_ID || "").trim()) {
    window.dashboardData.portalIdentityResolved = false;
  }
}

if (typeof window.__PORTAL_STAFF_REHYDRATE__ === "function") {
  try {
    await window.__PORTAL_STAFF_REHYDRATE__();
  } catch (e2) {
    console.warn("staff_dashboard: roster rehydrate after auth", e2);
  }
} else if (typeof window.renderHeader === "function") {
  window.renderHeader();
}

if (typeof window.portalSyncServiceLeadsQuickMenu === "function") {
  window.portalSyncServiceLeadsQuickMenu();
}
if (typeof window.portalSyncLeadTeamShiftUi === "function") {
  window.portalSyncLeadTeamShiftUi();
}
if (typeof window.__PORTAL_LOGOUT_FN__ !== "function") {
  window.__PORTAL_LOGOUT_FN__ = portalLogout;
}
