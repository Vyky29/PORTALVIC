/**
 * Quick menu — Service Leads section (staff_dashboard.html only).
 * Programme leads: John, Berta, Michelle. Executive field leads: Victor, Javi, Raúl.
 */
import { portalInferStaffKey } from "./auth-handler.js";
import {
  portalLeadPickupRosterNamesForDate,
  portalLeadProgrammeKey,
} from "./portal_lead_session_scope.js";

/** All leads with Service Leads quick-menu tools on staff_dashboard.html */
const STAFF_DASHBOARD_LEAD_KEYS = new Set([
  "berta",
  "john",
  "michelle",
  "victor",
  "javi",
  "raul",
]);

const STAFF_SERVICE_LEAD_BTN_IDS = [
  "quickMenuLeadFeedbackReport",
  "quickMenuStaffSessionsOverview",
  "quickMenuStaffLeadPerformanceReview",
  "quickMenuStaffLeadTermReview",
];

/** @deprecated Separate lead_dashboard.html removed — always false. */
export function portalIsLeadDashboardShell() {
  return false;
}

export function portalIsStaffDashboardShell() {
  try {
    const path = String(
      (typeof window !== "undefined" && window.location && window.location.pathname) || "",
    ).toLowerCase();
    return path.indexOf("staff_dashboard") >= 0;
  } catch {
    return false;
  }
}

export function portalCanAccessServiceLeadsMenu(profile, authEmail) {
  if (!portalIsStaffDashboardShell()) return false;
  const key = portalInferStaffKey(profile, authEmail);
  return STAFF_DASHBOARD_LEAD_KEYS.has(key) || !!portalLeadProgrammeKey(profile, authEmail);
}

function portalAuthEmailFromContext() {
  try {
    const box = typeof window !== "undefined" ? window.__PORTAL_SUPABASE__ : null;
    const user = box && box.session && box.session.user;
    return String((user && user.email) || "").trim();
  } catch {
    return "";
  }
}

function setQuickMenuBtnVisible(id, visible) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.hidden = !visible;
  btn.setAttribute("aria-hidden", visible ? "false" : "true");
}

export function portalSyncServiceLeadsQuickMenu() {
  const profile =
    typeof window !== "undefined" && window.__PORTAL_SUPABASE__
      ? window.__PORTAL_SUPABASE__.staff_profile
      : null;
  const email = portalAuthEmailFromContext();
  const show = portalCanAccessServiceLeadsMenu(profile, email);

  const grp = document.getElementById("portalQuickMenuServiceLeadsGroup");
  if (grp) {
    grp.hidden = !show;
    grp.setAttribute("aria-hidden", show ? "false" : "true");
  }

  STAFF_SERVICE_LEAD_BTN_IDS.forEach((id) => {
    setQuickMenuBtnVisible(id, show);
  });

  try {
    if (typeof window.portalInitQuickMenuAccordion === "function") {
      window.portalInitQuickMenuAccordion();
    }
  } catch (_) {}
}

if (typeof window !== "undefined") {
  window.portalIsLeadDashboardShell = portalIsLeadDashboardShell;
  window.portalIsStaffDashboardShell = portalIsStaffDashboardShell;
  window.portalCanAccessServiceLeadsMenu = portalCanAccessServiceLeadsMenu;
  window.portalSyncServiceLeadsQuickMenu = portalSyncServiceLeadsQuickMenu;
  window.portalLeadPickupRosterNamesForDate = portalLeadPickupRosterNamesForDate;
}
