import { portalLogout, bootstrapDashboardSupabase, portalInferStaffKey, portalCanonicalStaffRosterKey, portalStaffDisplayName, portalCanAccessCeoDashboard, portalIsStaffHomeProgrammeLead, portalIsProgrammeLeadUser, portalIsAdminHomeExecutiveUser } from "/portal/auth-handler.js?v=20260704-login-map-fix";
import { portalSyncExecWorkspaceSwitchSlot } from "/portal/portal_exec_workspace_switch.js?v=20260630-ops-admin-switch";
import {
  portalEnforceStaffAppPilotGate,
  portalSyncStaffAppPilotBanner,
} from "/portal/portal_staff_app_pilot.js?v=20260624-staff-pilot";

window.__PORTAL_LOGOUT_FN__ = portalLogout;
window.portalInferStaffKey = portalInferStaffKey;
window.portalCanonicalStaffRosterKey = portalCanonicalStaffRosterKey;
window.portalStaffDisplayName = portalStaffDisplayName;
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

if (typeof window.portalSyncOpsAdminStaffDashboardUi === "function") {
  window.portalSyncOpsAdminStaffDashboardUi();
}

const profile = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
const session = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session;
const authEmail = session && session.user ? String(session.user.email || "").trim() : "";

await portalEnforceStaffAppPilotGate({ profile, authEmail });
portalSyncStaffAppPilotBanner({ profile, authEmail });

if (typeof window.portalStaffResolveIdentityEarlyFromSession === "function") {
  try {
    window.portalStaffResolveIdentityEarlyFromSession();
  } catch (_) {}
}

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
}

if (typeof window.__PORTAL_STAFF_REHYDRATE__ === "function") {
  void Promise.race([
    window.__PORTAL_STAFF_REHYDRATE__(),
    new Promise(function (r) {
      setTimeout(r, typeof window !== "undefined" && window.PORTAL_STAFF_APP ? 8000 : 15000);
    }),
  ]).finally(function () {
    try {
      if (
        window.dashboardData &&
        window.dashboardData.portalIdentityResolved === false &&
        typeof window.portalStaffFinishIdentityUi === "function"
      ) {
        window.portalStaffFinishIdentityUi(
          (window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile) || {},
          window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile,
          window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session
        );
      }
    } catch (_) {}
  });
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

if (typeof window.portalEnsureStaffDashboardDockBindings === "function") {
  window.portalEnsureStaffDashboardDockBindings();
} else {
  function portalEnsureStaffDashboardDockBindingsFallback() {
    const qm = document.getElementById("dockQuickMenuTile");
    if (qm && qm.getAttribute("data-portal-dock-qm-bound") !== "1") {
      qm.setAttribute("data-portal-dock-qm-bound", "1");
      qm.addEventListener("click", function () {
        try {
          if (typeof window.handleQuickMenuDockClick === "function") {
            window.handleQuickMenuDockClick();
            return;
          }
        } catch (_) {}
        if (typeof window.portalToggleQuickMenuFromDock === "function") {
          window.portalToggleQuickMenuFromDock();
          return;
        }
        if (typeof window.openSheet === "function") {
          window.openSheet("menuSheet", { skipNavRecord: true, bypassAnnouncementLock: true });
        }
      });
    }
    const topbarOut = document.getElementById("topbarStaffSignOut");
    if (topbarOut && window.PORTAL_STAFF_APP === true) {
      topbarOut.hidden = false;
    }
  }
  portalEnsureStaffDashboardDockBindingsFallback();
  window.addEventListener("portal:supabase-ready", portalEnsureStaffDashboardDockBindingsFallback);
}
window.addEventListener("portal:staff-identity-resolved", function () {
  if (typeof window.portalEnsureStaffDashboardDockBindings === "function") {
    window.portalEnsureStaffDashboardDockBindings();
  }
});
