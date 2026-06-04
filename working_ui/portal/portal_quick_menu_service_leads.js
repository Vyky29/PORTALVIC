/**
 * Quick menu  Service Leads section (Berta, John, Victor, Javier, Ral, Sevitha).
 */
import { portalInferStaffKey } from "./auth-handler.js";

const SERVICE_LEAD_KEYS = new Set(["berta", "john", "victor", "javi", "raul", "sevitha"]);

export function portalCanAccessServiceLeadsMenu(profile, authEmail) {
  return SERVICE_LEAD_KEYS.has(portalInferStaffKey(profile, authEmail));
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
      btn.hidden = !show;
      btn.setAttribute("aria-hidden", show ? "false" : "true");
    },
  );

  try {
    if (typeof window.portalInitQuickMenuAccordion === "function") {
      window.portalInitQuickMenuAccordion();
    }
  } catch (_) {}
}

if (typeof window !== "undefined") {
  window.portalCanAccessServiceLeadsMenu = portalCanAccessServiceLeadsMenu;
  window.portalSyncServiceLeadsQuickMenu = portalSyncServiceLeadsQuickMenu;
}
