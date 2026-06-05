/**
 * Quick menu � Service Leads section (lead dashboard only: Berta, John, Victor, Javier, Ra�l).
 */
import { portalInferStaffKey } from "./auth-handler.js";

/** Programme leads who use the lead dashboard shell � not shown on staff dashboard. */
const LEAD_DASHBOARD_SERVICE_LEAD_KEYS = new Set([
  "berta",
  "john",
  "michelle",
  "victor",
  "javi",
  "raul",
]);

export function portalIsLeadDashboardShell() {
  try {
    const path = String(
      (typeof window !== "undefined" && window.location && window.location.pathname) || "",
    ).toLowerCase();
    return path.indexOf("lead_dashboard") >= 0;
  } catch {
    return false;
  }
}

export function portalCanAccessServiceLeadsMenu(profile, authEmail) {
  if (!portalIsLeadDashboardShell()) return false;
  return LEAD_DASHBOARD_SERVICE_LEAD_KEYS.has(portalInferStaffKey(profile, authEmail));
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

  ["quickMenuStaffSessionsOverview", "quickMenuStaffLeadPerformanceReview", "quickMenuStaffLeadTermReview"].forEach(
    (id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.hidden = true;
      btn.setAttribute("aria-hidden", "true");
    },
  );

  try {
    if (typeof window.portalInitQuickMenuAccordion === "function") {
      window.portalInitQuickMenuAccordion();
    }
  } catch (_) {}
}

if (typeof window !== "undefined") {
  window.portalIsLeadDashboardShell = portalIsLeadDashboardShell;
  window.portalCanAccessServiceLeadsMenu = portalCanAccessServiceLeadsMenu;
  window.portalSyncServiceLeadsQuickMenu = portalSyncServiceLeadsQuickMenu;
}
