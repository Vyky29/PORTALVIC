/**
 * clubSENsational Staff app — rollout gate + portalvic migrate banner.
 * Open to all staff (pilot allowlist kept only as historical reference).
 */
import { portalInferStaffKey } from "./auth-handler.js";

/** When true, anyone signed in may use clubsensational-staff; portalvic shows migrate banner. */
export const PORTAL_STAFF_APP_OPEN_TO_ALL = true;

/**
 * Legacy pilot roster (unused while OPEN_TO_ALL). Kept for reference / rollback.
 * @deprecated
 */
export const PORTAL_STAFF_APP_PILOT_ROSTER_KEYS = new Set([
  "michelle",
  "raul",
  "javi",
  "javier",
  "roberto",
  "luliya",
  "lulia",
  "youssef",
  "yousef",
  "yusef",
]);

export function portalStaffAppPilotOrigin() {
  try {
    const fromWin = String(
      (typeof window !== "undefined" && window.CLUBSENSATIONAL_STAFF_ORIGIN) ||
        (typeof window !== "undefined" && window.PORTAL_CANONICAL_ORIGIN) ||
        "",
    ).trim();
    if (fromWin) return fromWin.replace(/\/$/, "");
  } catch (_) {}
  return "https://clubsensational-staff.vercel.app";
}

export function portalStaffAppMainPortalOrigin() {
  try {
    const fromWin = String(
      (typeof window !== "undefined" && window.PORTAL_ADMIN_PORTAL_ORIGIN) || "",
    ).trim();
    if (fromWin) return fromWin.replace(/\/$/, "");
  } catch (_) {}
  return "https://portalvic.vercel.app";
}

export function portalStaffAppPilotLoginUrl() {
  return portalStaffAppPilotOrigin() + "/login.html";
}

export function portalStaffAppMainPortalLoginUrl() {
  return portalStaffAppMainPortalOrigin() + "/login.html";
}

/** True if this user may use clubsensational-staff (and see the migrate banner on portalvic). */
export function portalStaffAppPilotUser(profile, authEmail) {
  if (PORTAL_STAFF_APP_OPEN_TO_ALL) return true;
  const key = portalInferStaffKey(profile, authEmail);
  return !!(key && PORTAL_STAFF_APP_PILOT_ROSTER_KEYS.has(key));
}

/** clubsensational-staff: sign out and send non-allowlisted users to portalvic (no-op when open to all). */
export async function portalEnforceStaffAppPilotGate(opts) {
  opts = opts || {};
  if (typeof window === "undefined" || !window.PORTAL_STAFF_APP) return;
  if (PORTAL_STAFF_APP_OPEN_TO_ALL) return;

  const box = window.__PORTAL_SUPABASE__ || {};
  const profile = opts.profile || box.staff_profile;
  const email =
    opts.authEmail ||
    String((box.session && box.session.user && box.session.user.email) || "").trim();
  if (!profile) return;
  if (portalStaffAppPilotUser(profile, email)) return;

  const dest = portalStaffAppMainPortalLoginUrl();
  try {
    const logout = window.__PORTAL_LOGOUT_FN__;
    if (typeof logout === "function") {
      await Promise.race([
        logout(),
        new Promise(function (_, rej) {
          setTimeout(function () {
            rej(new Error("logout timeout"));
          }, 4000);
        }),
      ]);
    }
  } catch (_) {}

  try {
    const u = new URL(dest, window.location.href);
    window.location.replace(u.href);
  } catch (_) {
    window.location.href = dest;
  }
}

/** portalvic: banner for staff — open the new staff app. */
export function portalSyncStaffAppPilotBanner(opts) {
  opts = opts || {};
  if (typeof window === "undefined" || window.PORTAL_STAFF_APP) return;
  const path = String((window.location && window.location.pathname) || "").toLowerCase();
  if (path.indexOf("staff_dashboard") < 0) return;

  const box = window.__PORTAL_SUPABASE__ || {};
  const profile = opts.profile || box.staff_profile;
  const email =
    opts.authEmail ||
    String((box.session && box.session.user && box.session.user.email) || "").trim();
  if (!portalStaffAppPilotUser(profile, email)) return;

  const hostId = "portalStaffAppPilotBanner";
  let host = document.getElementById(hostId);
  if (!host) {
    host = document.createElement("div");
    host.id = hostId;
    host.className = "portal-staff-app-pilot-banner";
    host.setAttribute("role", "status");
    host.innerHTML =
      '<div class="portal-staff-app-pilot-banner__inner">' +
      '<p class="portal-staff-app-pilot-banner__copy"><strong>Staff app.</strong> Use clubSENsational Staff on your phone — same login.</p>' +
      '<div class="portal-staff-app-pilot-banner__actions">' +
      '<a class="portal-staff-app-pilot-banner__btn portal-staff-app-pilot-banner__btn--pri" id="portalStaffAppPilotOpen" href="#">Open staff app</a>' +
      '<button type="button" class="portal-staff-app-pilot-banner__btn portal-staff-app-pilot-banner__btn--ghost" id="portalStaffAppPilotDismiss">Stay here</button>' +
      "</div></div>";
    const app = document.querySelector(".app");
    if (app && app.parentNode) app.parentNode.insertBefore(host, app);
    else document.body.insertBefore(host, document.body.firstChild);

    const styleId = "portalStaffAppPilotBannerCss";
    if (!document.getElementById(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent =
        ".portal-staff-app-pilot-banner{position:sticky;top:0;z-index:140;padding:10px 12px 0;background:#edf4fb}" +
        ".portal-staff-app-pilot-banner__inner{max-width:min(100%,var(--layout-max-mobile,480px));margin:0 auto;padding:10px 12px;border-radius:12px;background:#fff8e6;border:1px solid #f4b740;box-sizing:border-box}" +
        ".portal-staff-app-pilot-banner__copy{margin:0 0 10px;font-size:13px;line-height:1.45;color:#173247;min-width:0;overflow-wrap:break-word}" +
        ".portal-staff-app-pilot-banner__actions{display:flex;flex-wrap:wrap;gap:8px;min-width:0}" +
        ".portal-staff-app-pilot-banner__btn{flex:1 1 auto;min-width:0;max-width:100%;padding:8px 12px;border-radius:10px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:center;text-decoration:none;box-sizing:border-box}" +
        ".portal-staff-app-pilot-banner__btn--pri{background:#2d84b3;color:#fff;border:0}" +
        ".portal-staff-app-pilot-banner__btn--ghost{background:transparent;color:#173247;border:1px solid rgba(23,50,71,.18)}";
      document.head.appendChild(st);
    }

    document.getElementById("portalStaffAppPilotDismiss")?.addEventListener("click", function () {
      try {
        sessionStorage.setItem("portalStaffAppPilotBannerDismissed", "1");
      } catch (_) {}
      host.hidden = true;
    });
  }

  try {
    if (sessionStorage.getItem("portalStaffAppPilotBannerDismissed") === "1") {
      host.hidden = true;
      return;
    }
  } catch (_) {}

  const open = document.getElementById("portalStaffAppPilotOpen");
  if (open) open.href = portalStaffAppPilotLoginUrl();
  host.hidden = false;
}

if (typeof window !== "undefined") {
  window.portalStaffAppPilotUser = portalStaffAppPilotUser;
  window.portalEnforceStaffAppPilotGate = portalEnforceStaffAppPilotGate;
  window.portalSyncStaffAppPilotBanner = portalSyncStaffAppPilotBanner;
  window.portalStaffAppPilotLoginUrl = portalStaffAppPilotLoginUrl;
}
