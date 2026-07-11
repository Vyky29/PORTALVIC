/**
 * Victor, Raúl, Javi — switch Lead / Admin (ops) / CEO (insights) from Quick menu.
 */
import { portalInferStaffKey, portalCanAccessAdminDashboard, portalCanAccessCeoDashboard } from "./auth-handler.js?v=20260707-login-cache";

const EXEC_KEYS = new Set(["victor", "raul", "javi"]);
const OPS_ADMIN_KEYS = new Set(["sevitha", "info"]);

const ICONS = {
  staff:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  lead:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>',
  admin:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>',
  ceo:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>',
};

function publishedUrl(filename, overrideKey) {
  if (typeof window !== "undefined") {
    const w = String(window[overrideKey] || "").trim();
    if (w) return w;
    try {
      return new URL(filename, window.location.href).href;
    } catch {
      /* fall through */
    }
  }
  return filename;
}

export function portalCanExecWorkspaceSwitch(profile, authEmail) {
  const key = portalInferStaffKey(profile, authEmail);
  if (EXEC_KEYS.has(key) || OPS_ADMIN_KEYS.has(key)) return true;
  if (portalCanAccessAdminDashboard(profile, authEmail)) return true;
  if (portalCanAccessCeoDashboard(profile, authEmail)) return true;
  return false;
}

/** @param {"staff"|"lead"|"ceo"|"admin"} currentMode */
export function portalExecWorkspaceSwitchTargets(currentMode, profile, authEmail) {
  const mode = String(currentMode || "").trim().toLowerCase();
  const key = portalInferStaffKey(profile, authEmail);
  const opsAdmin = OPS_ADMIN_KEYS.has(key);
  const all = [
    {
      mode: "staff",
      label: "Staff Portal",
      sub: "Your roster, sessions and field tools",
      url: publishedUrl("staff_dashboard.html?portalStayWorker=1", "PORTAL_STAFF_DASHBOARD_URL"),
    },
    {
      mode: "lead",
      label: "Lead Portal",
      sub: "Lead report, team tools — same as Michelle, John and Berta",
      url: publishedUrl(
        "staff_dashboard.html?portalStayWorker=1&portalLeadHome=1",
        "PORTAL_LEAD_DASHBOARD_URL"
      ),
    },
    {
      mode: "admin",
      label: "Admin Portal",
      sub: "Day operations, roster, feedback and admin tools",
      url: publishedUrl("admin_dashboard.html", "PORTAL_ADMIN_DASHBOARD_URL"),
    },
    {
      mode: "ceo",
      label: "CEO Portal",
      sub: "Strategic snapshot, finance trends and company insights",
      url: publishedUrl("ceo_dashboard.html", "PORTAL_CEO_DASHBOARD_URL"),
    },
  ];
  if (opsAdmin) {
    return all.filter((t) => t.mode !== mode && t.mode !== "ceo" && t.mode !== "lead");
  }
  // On staff shell, "Lead" and "Staff" are the same page — only show Lead when not already there.
  if (mode === "staff" || mode === "lead") {
    return all.filter((t) => t.mode !== "staff" && t.mode !== "lead");
  }
  return all.filter((t) => t.mode !== mode);
}

function navigate(url) {
  const raw = String(url || "").trim();
  if (!raw) return;
  try {
    window.location.href = new URL(raw, window.location.href).href;
  } catch {
    window.location.href = raw;
  }
}

/**
 * @param {HTMLElement | null} host
 * @param {"staff"|"lead"|"admin"} currentMode
 */
export function portalMountExecWorkspaceSwitch(host, currentMode, profile, authEmail) {
  if (!host) return;
  host.textContent = "";
  host.hidden = true;
  host.setAttribute("aria-hidden", "true");
  if (!portalCanExecWorkspaceSwitch(profile, authEmail)) return;

  const targets = portalExecWorkspaceSwitchTargets(currentMode, profile, authEmail);
  if (!targets.length) return;

  targets.forEach((t) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-btn menu-btn--exec-workspace menu-btn--exec-workspace-" + t.mode;
    btn.setAttribute("data-portal-exec-workspace", t.mode);
    const iconKey = t.mode === "ceo" ? "ceo" : t.mode;
    btn.innerHTML =
      '<div class="menu-btn-icon" aria-hidden="true">' +
      (ICONS[iconKey] || ICONS.staff) +
      '</div><div class="menu-btn-copy"><strong>' +
      t.label +
      '</strong><span class="menu-btn-sub">' +
      t.sub +
      "</span></div>";
    btn.addEventListener("click", () => navigate(t.url));
    host.appendChild(btn);
  });

  host.hidden = false;
  host.removeAttribute("aria-hidden");
}

export function portalSyncExecWorkspaceSwitchSlot(currentMode) {
  const host = document.getElementById("portalExecWorkspaceSwitchSlot");
  if (!host) return;
  const ctx = typeof window !== "undefined" && window.__PORTAL_SUPABASE__ ? window.__PORTAL_SUPABASE__ : {};
  const profile = ctx.staff_profile || null;
  const email = String((ctx.session && ctx.session.user && ctx.session.user.email) || "").trim();
  portalMountExecWorkspaceSwitch(host, currentMode, profile, email);
}
