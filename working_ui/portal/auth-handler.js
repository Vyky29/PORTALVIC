/**
 * Non-destructive Supabase auth for the existing login page (no new DOM).
 *
 * When Supabase is configured (window.SUPABASE_URL + window.SUPABASE_ANON_KEY),
 * registers a capture-phase listener on #login-form "submit" so it runs before
 * legacy demo scripts on the same form and can stopImmediatePropagation().
 *
 * Load after the form exists, e.g.:
 *   <script type="module" src="…/database/auth-handler.js"></script>
 */

import {
  getSupabaseClient,
  getSupabaseUrl,
  getSupabaseAnonKey,
  isSupabaseConfigured,
  setPortalStaffContext,
  clearPortalStaffContext,
  portalLogout,
  portalClearPersistedSupabaseAuth,
  portalBumpAuthSessionGeneration,
  portalGetCachedAuthSessionGeneration,
  portalSetCachedAuthSessionGeneration,
  portalClearCachedAuthSessionGeneration,
  portalReadPersistedSupabaseAccessToken,
  portalReadPersistedSupabaseSession,
  bindPortalRemoteLogoutOnStaleAuthGeneration,
} from "./supabase-client.js?v=20260707-login-cache";
import {
  resolveDemoEmail,
  resolveCorporateAuthEmail,
  resolveStaffKeyFromAuthEmail,
  portalCanonicalStaffRosterKey,
  portalStaffDisplayName,
  PORTAL_LOGIN_UNKNOWN_NAME_HELP,
  portalIsRegisteredPortalLoginEmail,
  mergeStaffLoginEmailMap,
  PORTAL_EXECUTIVE_AUTH_EMAILS,
  PORTAL_STAFF_CODE_TO_ROSTER_KEY,
} from "./auth-map.js?v=20260707-login-cache";

function portalLoginPromiseTimeout(promise, ms, message) {
  const waitMs = Math.max(1000, Number(ms) || 15000);
  return Promise.race([
    promise,
    new Promise(function (_resolve, reject) {
      setTimeout(function () {
        reject(new Error(message || "Request timed out. Check your connection and try again."));
      }, waitMs);
    }),
  ]);
}

function portalEmergencyRedirectUrl(loginEmail) {
  const em = resolveCorporateAuthEmail(String(loginEmail || "").trim()).toLowerCase();
  if (!em) return null;
  if (PORTAL_EXECUTIVE_AUTH_EMAILS.indexOf(em) >= 0) {
    return portalPublishedAdminUrl();
  }
  if (
    em === "johnnyosti37@gmail.com" ||
    em === "b.traperocasado@gmail.com" ||
    em === "michelle@youtimecounselling.com"
  ) {
    return portalPublishedStaffUrl();
  }
  return null;
}

/** Minimal staff_profiles row when DB link lags but corporate exec email is known. */
function portalExecutiveBootstrapProfileStub(session, authEmail) {
  const em = String(
    resolveCorporateAuthEmail(authEmail || session?.user?.email || "") || "",
  )
    .trim()
    .toLowerCase();
  if (!em) return null;
  const key = resolveStaffKeyFromAuthEmail(em);
  if (!key) return null;
  const isExec = PORTAL_EXECUTIVE_AUTH_EMAILS.indexOf(em) >= 0;
  const isOpsAdmin = em === "sevitha@clubsensational.org" || em === "info@clubsensational.org";
  if (!isExec && !isOpsAdmin) return null;
  const displayNames = { victor: "Victor", raul: "Raúl", javi: "Javi", sevitha: "Sevitha" };
  const userId = session?.user?.id ? String(session.user.id) : "";
  if (!userId) return null;
  return {
    id: userId,
    username: key,
    full_name: displayNames[key] || key.charAt(0).toUpperCase() + key.slice(1),
    app_role: isOpsAdmin ? "admin" : "ceo",
    staff_role: isOpsAdmin ? "admin" : "ceo",
    dashboard_route: isOpsAdmin ? "admin" : "ceo",
    is_active: true,
  };
}

export {
  portalLogout,
  getSupabaseClient,
  getPortalStaffContext,
  clearPortalStaffContext,
  portalClearPersistedSupabaseAuth,
  portalClearCachedAuthSessionGeneration,
  portalFetchSubmittedReviewSessionKeys,
  portalMergeReviewKeysIntoMemoryMap,
} from "./supabase-client.js?v=20260707-login-cache";

/** Bump to force a one-time sign-out + fresh login after a published portal build. */
export const APP_VERSION = "2026-06-08-global-refresh-feedback-cache";
export const PORTAL_APP_VERSION = APP_VERSION;
const PORTAL_APP_VERSION_STORAGE_KEY = "cs_portal_app_version";
const PORTAL_AUTH_VERSION_KEYS = [
  "cs_portal_user",
  "cs_portal_session",
  "cs_portal_auth",
  "portal_user",
  "portal_session",
  "currentUser",
  "loggedInUser",
];

let staffLoginMapSiblingFetched = false;

/**
 * @param {unknown} body
 * @returns {Record<string, string> | null}
 */
function extractStaffLoginEmailMap(body) {
  if (!body || typeof body !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (body);
  if (typeof o.staff_username_to_email === "object" && o.staff_username_to_email) {
    return /** @type {Record<string, string>} */ (o.staff_username_to_email);
  }
  if (typeof o.map === "object" && o.map) {
    return /** @type {Record<string, string>} */ (o.map);
  }
  const keys = Object.keys(o).filter(
    (k) => k !== "version" && k !== "notes" && k !== "map" && k !== "staff_username_to_email"
  );
  if (
    keys.length &&
    keys.every((k) => typeof o[k] === "string" && String(o[k]).includes("@"))
  ) {
    return /** @type {Record<string, string>} */ (o);
  }
  return null;
}

/**
 * 1) window.PORTAL_STAFF_LOGIN_MAP from staff_login_map.js (load before this module).
 * 2) Optional fetch staff_login_map.json same folder as this module (local / hosts that allow .json).
 */
async function tryMergeStaffLoginMapFromSiblingJson() {
  if (staffLoginMapSiblingFetched) return;
  staffLoginMapSiblingFetched = true;
  try {
    if (typeof window !== "undefined") {
      const w = window.PORTAL_STAFF_LOGIN_MAP;
      const fromWindow = extractStaffLoginEmailMap(w);
      if (fromWindow) {
        mergeStaffLoginEmailMap(fromWindow);
        return;
      }
    }
    if (typeof import.meta === "undefined" || !import.meta.url) return;
    const custom = typeof window !== "undefined" && window.PORTAL_STAFF_LOGIN_MAP_URL;
    const jsonUrl = custom
      ? String(custom).trim()
      : new URL("staff_login_map.json", new URL(".", import.meta.url)).href;
    if (!jsonUrl) return;
    const r = await fetch(jsonUrl, { cache: "no-store" });
    if (!r.ok) return;
    const body = await r.json();
    const map = extractStaffLoginEmailMap(body);
    if (map) mergeStaffLoginEmailMap(map);
  } catch {
    /* optional file */
  }
}

/** Published site dashboard URLs; override from login.html before loading this module. */
function portalPublishedPageUrl(filename, overrideKey) {
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
function portalPublishedStaffUrl() {
  return portalPublishedPageUrl("staff_dashboard.html", "PORTAL_STAFF_DASHBOARD_URL");
}
function portalPublishedAdminUrl() {
  return portalPublishedPageUrl("admin_dashboard.html", "PORTAL_ADMIN_DASHBOARD_URL");
}
function portalPublishedLeadUrl() {
  return portalPublishedStaffUrl();
}
function portalPublishedLoginUrl() {
  return portalPublishedPageUrl("login.html", "PORTAL_LOGIN_REDIRECT_URL");
}
function portalPublishedChooseUrl() {
  return portalPublishedPageUrl("portal_choose.html", "PORTAL_CHOOSE_URL");
}
function portalPublishedOfficeUrl() {
  return portalPublishedPageUrl("office_portal.html", "PORTAL_OFFICE_DASHBOARD_URL");
}
function portalPublishedNewChatUrl() {
  return portalPublishedPageUrl("admin_dashboard.html", "PORTAL_ADMIN_URL");
}
/** @deprecated use portalPublishedNewChatUrl */
function portalPublishedCsCliqUrl() {
  return portalPublishedNewChatUrl();
}

/** Login URL that returns to `returnHref` after sign-in (same origin). */
function portalLoginUrlWithReturn(returnHref) {
  if (typeof window === "undefined") return portalPublishedLoginUrl();
  try {
    const login = new URL(portalPublishedLoginUrl(), window.location.href);
    const ret = String(returnHref || window.location.href || "").trim();
    if (ret) login.searchParams.set("next", ret);
    if (portalUrlIsNewChatPage(ret || window.location.href)) {
      login.searchParams.set("app", "new_chat");
    }
    return login.href;
  } catch {
    return portalPublishedLoginUrl();
  }
}

function portalUrlIsNewChatPage(href) {
  return false; /* chat removed 2026-06-09 */
}

/** @deprecated */
function portalUrlIsCsCliqPage(href) {
  return portalUrlIsNewChatPage(href);
}

function portalUrlIsOnboardingFormPage(href) {
  if (typeof window === "undefined" && !href) return false;
  try {
    const u = new URL(String(href || window.location.href), window.location.href);
    return /onboarding_(job_application|health_questionnaire)\.html$/i.test(u.pathname);
  } catch {
    return false;
  }
}

function portalNormalizeNewChatUrl(href) {
  if (typeof window === "undefined") return href;
  try {
    if (!portalUrlIsNewChatPage(href)) return href;
    const u = new URL(href, window.location.href);
    if (!/new_chat\.html$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/?(?:cs_cliq|new_chat)\/?$/i, "/new_chat.html");
    }
    return u.href;
  } catch {
    return href;
  }
}

function portalNormalizeCsCliqUrl(href) {
  return portalNormalizeNewChatUrl(href);
}

/** Username → effective role for post-login routing. */
const PORTAL_USERNAME_ROLE_OVERRIDES = {
  sevitha: "admin",
  berta: "lead",
  john: "lead",
  michelle: "lead",
  javi: "ceo",
  raul: "ceo",
  victor: "ceo",
};

function portalNormalizeStaffKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function portalInferStaffKey(profile, authEmail) {
  const fromEmail = resolveStaffKeyFromAuthEmail(authEmail);
  if (fromEmail) return portalCanonicalStaffRosterKey(fromEmail);
  const u = portalNormalizeStaffKey(profile?.username);
  if (u) return portalCanonicalStaffRosterKey(u);
  const rawName = String(profile?.full_name || "").trim();
  if (rawName) {
    const firstWord = rawName.split(/\s+/)[0] || "";
    const firstKey = portalNormalizeStaffKey(firstWord);
    if (firstKey) return portalCanonicalStaffRosterKey(firstKey);
  }
  const fn = portalNormalizeStaffKey(profile?.full_name);
  if (fn) return portalCanonicalStaffRosterKey(fn);
  return "";
}

export { portalCanonicalStaffRosterKey, portalStaffDisplayName };

export function portalInferEffectiveRole(profile, authEmail) {
  const appRole = String(profile?.app_role || "").toLowerCase();
  const staffRole = String(profile?.staff_role || "").toLowerCase();
  const staffKey = portalInferStaffKey(profile, authEmail);
  return PORTAL_USERNAME_ROLE_OVERRIDES[staffKey] || appRole || staffRole || "staff";
}

export function portalIsOperationsAdminUser(profile, authEmail) {
  if (!profile) return false;
  const key = portalInferStaffKey(profile, authEmail);
  return key === "sevitha" || key === "info";
}

/** Admin views Sevitha may open from office_portal (payroll / staff files only). */
export const PORTAL_OFFICE_ADMIN_VIEW_IDS = new Set([
  "office_admin",
  "portal_payslips",
  "portal_documents",
  "portal_docs_timesheet",
  "portal_docs_expense",
  "portal_docs_portalpin",
  "portal_docs_certificate",
  "portal_docs_passport",
  "portal_docs_checklist",
  "portal_docs_firstaid",
  "staffhr_contracts",
]);

export function portalIsOfficeAdminViewId(viewId) {
  const id = String(viewId || "").trim();
  if (!id) return false;
  if (PORTAL_OFFICE_ADMIN_VIEW_IDS.has(id)) return true;
  return id.indexOf("portal_docs_") === 0;
}

export function portalOfficeAdminDashboardUrl(viewId) {
  const v = String(viewId || "office_admin").trim() || "office_admin";
  try {
    const u = new URL(portalPublishedAdminUrl(), window.location.href);
    u.searchParams.set("view", v);
    u.searchParams.set("office", "1");
    return u.href;
  } catch {
    return (
      "admin_dashboard.html?view=" + encodeURIComponent(v) + "&office=1"
    );
  }
}

/**
 * Full operations admin dashboard (Victor / Javi / Raúl) — not office slim mode for Sevitha.
 */
export function portalCanAccessAdminDashboardFull(profile, authEmail) {
  return (
    portalCanAccessAdminDashboard(profile, authEmail) &&
    !portalIsOperationsAdminUser(profile, authEmail)
  );
}

/**
 * Admin dashboard: **Admin**, **Manager** (`staff_role`), **CEO** (e.g. Victor), and username override `admin`.
 * Plain **staff** / **lead** (without manager/admin/CEO) are redirected to their own shells.
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {string} authEmail
 */
export function portalCanAccessAdminDashboard(profile, authEmail) {
  if (!profile) return false;
  const app = String(profile.app_role || "").toLowerCase();
  const staff = String(profile.staff_role || "").toLowerCase();
  const staffKey = portalInferStaffKey(profile, authEmail);
  const override = PORTAL_USERNAME_ROLE_OVERRIDES[staffKey];
  const eff = portalInferEffectiveRole(profile, authEmail);
  if (eff === "ceo" || app === "ceo" || override === "ceo") return true;
  if (override === "admin" || app === "admin") return true;
  if (staff === "manager" || staff === "admin") return true;
  return false;
}

/** CEO dashboard shell — Victor, Javi, Raúl only (not ops admins such as Sevitha). */
const PORTAL_CEO_DASHBOARD_ALLOWED_KEYS = new Set(["victor", "javi", "raul"]);
const PORTAL_CEO_DASHBOARD_DENIED_KEYS = new Set(["sevitha", "info"]);
const PORTAL_CEO_DASHBOARD_DENIED_EMAILS = new Set([
  "sevitha@clubsensational.org",
  "info@clubsensational.org",
]);

export function portalCanAccessCeoDashboard(profile, authEmail) {
  const email = String(resolveCorporateAuthEmail(authEmail) || authEmail || "")
    .trim()
    .toLowerCase();
  if (email && PORTAL_CEO_DASHBOARD_DENIED_EMAILS.has(email)) return false;
  const staffKey = portalInferStaffKey(profile, authEmail);
  if (!staffKey || PORTAL_CEO_DASHBOARD_DENIED_KEYS.has(staffKey)) return false;
  if (PORTAL_CEO_DASHBOARD_ALLOWED_KEYS.has(staffKey)) return true;
  if (!profile) return false;
  const app = String(profile.app_role || "").toLowerCase();
  if (app === "admin") return false;
  return false;
}

/** CS Cliq standalone app — directors (Victor/Raúl/Javi), ops admin, CEO. */
export function portalCanAccessCsCliq(profile, authEmail) {
  if (!profile) return false;
  if (portalCanAccessAdminDashboard(profile, authEmail) || portalCanAccessCeoDashboard(profile, authEmail)) {
    return true;
  }
  const staffKey = portalInferStaffKey(profile, authEmail);
  if (staffKey === "victor" || staffKey === "raul" || staffKey === "javi" || staffKey === "sevitha") {
    return true;
  }
  if (
    typeof window !== "undefined" &&
    window.portalDmRoles &&
    typeof window.portalDmRoles.portalDmUsesAdminCliq === "function"
  ) {
    return window.portalDmRoles.portalDmUsesAdminCliq(profile);
  }
  return false;
}

/**
 * Schedule & Covers writes (schedule_overrides RLS): admin/ceo in staff_profiles,
 * or portal username overrides (Victor/Javi/Raúl → ceo, Sevitha → admin).
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {string} authEmail
 */
export function portalCanWriteScheduleOverrides(profile, authEmail) {
  if (!profile) return false;
  const app = String(profile.app_role || "").toLowerCase();
  if (app === "admin" || app === "ceo") return true;
  const eff = portalInferEffectiveRole(profile, authEmail);
  return eff === "admin" || eff === "ceo";
}

/** Victor, Raúl, Javi — login home is Admin portal (not lead shell). */
export function portalIsExecutiveLeadHomeUser(profile, authEmail) {
  return portalCanAccessCeoDashboard(profile, authEmail);
}

/** Same trio — explicit alias for admin-home routing/docs. */
export function portalIsAdminHomeExecutiveUser(profile, authEmail) {
  return portalCanAccessCeoDashboard(profile, authEmail);
}

/** John, Berta, Michelle — programme leads (staff home; lead tools on staff shell). */
const PORTAL_STAFF_HOME_PROGRAMME_LEAD_KEYS = new Set(["john", "berta", "michelle"]);

export function portalIsStaffHomeProgrammeLead(profile, authEmail) {
  if (!profile) return false;
  const key = portalInferStaffKey(profile, authEmail);
  if (PORTAL_STAFF_HOME_PROGRAMME_LEAD_KEYS.has(key)) return true;
  const em = String(authEmail || "")
    .trim()
    .toLowerCase();
  return (
    em === "johnnyosti37@gmail.com" ||
    em === "b.traperocasado@gmail.com" ||
    em === "michelle@youtimecounselling.com"
  );
}

/** Alias — same allowlist as staff-shell programme lead tools. */
export function portalIsProgrammeLeadUser(profile, authEmail) {
  return portalIsStaffHomeProgrammeLead(profile, authEmail);
}

/** Staff shell with programme-lead field tools (Berta/John/Michelle + Victor/Raúl/Javi from admin). */
export function portalStaffHomeHasLeadFieldTools(profile, authEmail) {
  return (
    portalIsStaffHomeProgrammeLead(profile, authEmail) ||
    portalIsAdminHomeExecutiveUser(profile, authEmail)
  );
}

/** @deprecated Lead shell removed — programme/field leads use staff_dashboard.html. */
export function portalIsLeadDashboardShellPage() {
  return false;
}

/**
 * Admin / CEO / manager: pick Staff, Lead, or Admin after sign-in.
 * Executive trio skip chooser — land on Admin portal directly.
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {string} authEmail
 */
export function portalShouldShowPortalChooser(profile, authEmail) {
  if (!profile) return false;
  if (portalIsExecutiveLeadHomeUser(profile, authEmail)) return false;
  if (portalIsProgrammeLeadUser(profile, authEmail)) return false;
  if (portalIsOperationsAdminUser(profile, authEmail)) return false;
  const eff = portalInferEffectiveRole(profile, authEmail);
  const staff = String(profile.staff_role || "").toLowerCase();
  if (portalCanAccessAdminDashboard(profile, authEmail)) return true;
  if (eff === "ceo" || eff === "admin") return true;
  if (staff === "manager" || staff === "admin") return true;
  return false;
}

function portalOriginBase(host) {
  return String(host || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

function portalOriginSameForRedirect(hostA, hostB) {
  const a = portalOriginBase(hostA);
  const b = portalOriginBase(hostB);
  if (!a || !b) return false;
  if (a === b) return true;
  const loopback = { localhost: true, "127.0.0.1": true, "[::1]": true };
  return !!(loopback[a] && loopback[b]);
}

const PORTAL_LOGIN_REDIRECT_NEXT_KEY = "portal_login_redirect_next";
const PORTAL_LOGIN_APP_KEY = "portal_login_app";
const PORTAL_LOGIN_NEW_CHAT_LOCAL_KEY = "portal_login_new_chat_dest_v1";
const PORTAL_LOGIN_CS_CLIQ_LOCAL_KEY = PORTAL_LOGIN_NEW_CHAT_LOCAL_KEY;

function portalNewChatDefaultUrl() {
  return new URL("admin_dashboard.html", window.location.href).href;
}

function portalCsCliqDefaultUrl() {
  return portalNewChatDefaultUrl();
}

/** Login screen is CS Cliq (red theme) even if query/session was lost on mobile. */
function portalLoginPageCsCliqIntent() {
  if (typeof window === "undefined") return false;
  if (window.false === true || window.false === true) return true;
  try {
    const hidden = document.getElementById("portalLoginApp");
    const appVal = hidden ? String(hidden.value || "").trim().toLowerCase() : "";
    if (appVal === "new_chat" || appVal === "cs_cliq") return true;
  } catch {
    /* ignore */
  }
  try {
    if (document.documentElement.getAttribute("data-portal-login-app") === "new_chat") return true;
    if (document.documentElement.getAttribute("data-portal-login-app") === "cs_cliq") return true;
    if (document.documentElement.classList.contains("login-theme-cs-cliq")) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function portalMarkCsCliqLoginIntent(destHref) {
  if (typeof window === "undefined") return;
  const dest = destHref || portalCsCliqDefaultUrl();
  window.false = true;
  try {
    sessionStorage.setItem(PORTAL_LOGIN_REDIRECT_NEXT_KEY, dest);
    sessionStorage.setItem(PORTAL_LOGIN_APP_KEY, "cs_cliq");
    localStorage.setItem(PORTAL_LOGIN_CS_CLIQ_LOCAL_KEY, dest);
  } catch {
    /* ignore */
  }
  try {
    const hidden = document.getElementById("portalLoginApp");
    if (hidden) hidden.value = "cs_cliq";
  } catch {
    /* ignore */
  }
}

function portalPersistLoginRedirectIntent() {
  if (typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    const app = String(u.searchParams.get("app") || "").trim().toLowerCase();
    const raw = String(u.searchParams.get("next") || u.searchParams.get("return") || "").trim();
    const isNewChat =
      false /* chat removed */ ||
      false /* chat removed */ ||
      /new_chat(?:\.html)?(?:\?|#|$)/i.test(raw) ||
      /cs_cliq(?:\.html)?(?:\?|#|$)/i.test(raw) ||
      /portal_open=(?:new_chat|cs_cliq)/i.test(raw) ||
      portalLoginPageCsCliqIntent();
    if (!isNewChat) return;
    const dest = raw
      ? new URL(raw, window.location.href).href
      : portalCsCliqDefaultUrl();
    portalMarkCsCliqLoginIntent(dest);
  } catch {
    /* ignore */
  }
}

function portalClearLoginRedirectIntent() {
  if (typeof window === "undefined") return;
  window.false = false;
  try {
    sessionStorage.removeItem(PORTAL_LOGIN_REDIRECT_NEXT_KEY);
    sessionStorage.removeItem(PORTAL_LOGIN_APP_KEY);
    localStorage.removeItem(PORTAL_LOGIN_CS_CLIQ_LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

/** CS Cliq login intent from ?app=cs_cliq and/or persisted sessionStorage. */
function portalReadCsCliqLoginIntent() {
  if (typeof window === "undefined") return null;
  try {
    const fromNext = readSafePostLoginRedirect();
    if (fromNext && portalUrlIsNewChatPage(fromNext)) return fromNext;
    const u = new URL(window.location.href);
    const app = String(u.searchParams.get("app") || "").trim().toLowerCase();
    if (false /* chat removed */ || false /* chat removed */) {
      return portalNewChatDefaultUrl();
    }
    const stored = String(sessionStorage.getItem(PORTAL_LOGIN_REDIRECT_NEXT_KEY) || "").trim();
    if (stored && portalUrlIsNewChatPage(stored)) {
      return new URL(stored, window.location.href).href;
    }
    const appStored = String(sessionStorage.getItem(PORTAL_LOGIN_APP_KEY) || "").trim().toLowerCase();
    if (appStored === "new_chat" || appStored === "cs_cliq") {
      return portalNewChatDefaultUrl();
    }
    const localStored = String(localStorage.getItem(PORTAL_LOGIN_NEW_CHAT_LOCAL_KEY) || "").trim();
    if (localStored && portalUrlIsNewChatPage(localStored)) {
      return new URL(localStored, window.location.href).href;
    }
    if (portalLoginPageCsCliqIntent()) {
      return portalCsCliqDefaultUrl();
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Optional `next` / `return` query on the login page: after a successful sign-in,
 * redirect there instead of the role dashboard (same site only; blocks login loops).
 * @returns {string | null}
 */
function readSafePostLoginRedirect() {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(window.location.href);
    const raw = (u.searchParams.get("next") || u.searchParams.get("return") || "").trim();
    if (!raw || raw.length > 2048) return null;
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
    const target = new URL(decoded, window.location.href);
    if (!portalOriginSameForRedirect(window.location.hostname, target.hostname)) return null;
    if (!/^https?:$/i.test(target.protocol)) return null;
    const path = target.pathname.toLowerCase();
    if (path.endsWith("/login") || path.endsWith("login.html")) {
      return null;
    }
    return target.href;
  } catch {
    return null;
  }
}

function isLoginPage() {
  return Boolean(document.getElementById("login-form"));
}

/** Drop stale session-review / feedback colours cached on this device. */
export function portalClearDeviceFeedbackReviewCache() {
  if (typeof window === "undefined") return;
  const dropKeys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k === "portalSessionReviewMap_v1" ||
        k.indexOf("portalSessionReviewMap_v1:") === 0 ||
        k === "portalCatchUpReviewReset_v1" ||
        k === "portalMachineReviewReset_v1"
      ) {
        dropKeys.push(k);
      }
    }
    dropKeys.forEach((k) => {
      localStorage.removeItem(k);
    });
  } catch {
    /* ignore */
  }
}

/**
 * One-time session refresh after a portal build bump.
 * Clears portal session/auth keys and device feedback review cache.
 */
export function enforceAppVersion() {
  if (typeof window === "undefined") return false;

  const versionKey = PORTAL_APP_VERSION_STORAGE_KEY;
  let savedVersion = "";
  try {
    savedVersion = localStorage.getItem(versionKey) || "";
  } catch {
    /* ignore */
  }

  if (savedVersion === APP_VERSION) return false;

  try {
    localStorage.setItem(versionKey, APP_VERSION);
  } catch {
    /* ignore */
  }

  try {
    portalClearDeviceFeedbackReviewCache();
  } catch {
    /* ignore */
  }

  PORTAL_AUTH_VERSION_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  });

  try {
    clearPortalStaffContext();
    portalClearCachedAuthSessionGeneration();
    portalClearPersistedSupabaseAuth();
  } catch {
    /* ignore */
  }

  if (!(window.location.pathname || "").toLowerCase().includes("login")) {
    let dest = "login.html?updated=1";
    try {
      if (
        portalUrlIsCsCliqPage(window.location.href) ||
        portalUrlIsOnboardingFormPage(window.location.href)
      ) {
        dest = portalLoginUrlWithReturn(window.location.href);
        const login = new URL(dest, window.location.href);
        login.searchParams.set("updated", "1");
        dest = login.href;
      }
    } catch {
      /* keep default */
    }
    try {
      window.location.href = dest;
    } catch {
      window.location.replace(dest);
    }
    return true;
  }

  return false;
}

/** @deprecated use enforceAppVersion */
export function portalMaybeForceAppVersionRefresh() {
  return enforceAppVersion();
}

function portalShowLoginUpdatedBannerIfNeeded() {
  if (!isLoginPage() || typeof window === "undefined") return;
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get("updated") !== "1") return;
    const info = document.getElementById("login-updated-msg");
    if (info) info.classList.add("visible");
    u.searchParams.delete("updated");
    const qs = u.searchParams.toString();
    window.history.replaceState({}, "", u.pathname + (qs ? "?" + qs : "") + u.hash);
  } catch {
    /* ignore */
  }
}

function portalNormalizeUrl(value) {
  if (!value || typeof value !== "string") return value;
  try {
    const u = new URL(value, window.location.href);
    // Collapse accidental duplicate slashes in the path (e.g. admin_dashboard.html//ceo...).
    u.pathname = u.pathname.replace(/\/{2,}/g, "/");
    return u.href;
  } catch {
    return value.replace(/([^:])\/{2,}/g, "$1/");
  }
}

function resolveDashboardRedirect(route) {
  if (!route || typeof route !== "string") return null;
  const t = route.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return portalNormalizeUrl(t);
  try {
    return portalNormalizeUrl(new URL(t, window.location.href).href);
  } catch {
    return t;
  }
}

function inferDashboardRoute(profile, authEmail) {
  const effectiveRole = portalInferEffectiveRole(profile, authEmail);
  const fromWorkingUi =
    typeof window !== "undefined" &&
    window.location.pathname.toLowerCase().includes("/working_ui/");
  if (portalIsProgrammeLeadUser(profile, authEmail)) {
    return fromWorkingUi ? "staff_dashboard.html" : portalPublishedStaffUrl();
  }
  if (fromWorkingUi) {
    if (portalIsAdminHomeExecutiveUser(profile, authEmail)) return "admin_dashboard.html";
    if (portalIsOperationsAdminUser(profile, authEmail)) return "admin_dashboard.html";
    if (portalCanAccessAdminDashboard(profile, authEmail)) return "admin_dashboard.html";
    return "staff_dashboard.html";
  }
  if (portalIsAdminHomeExecutiveUser(profile, authEmail)) return portalPublishedAdminUrl();
  if (portalIsOperationsAdminUser(profile, authEmail)) return portalPublishedAdminUrl();
  if (portalCanAccessAdminDashboard(profile, authEmail)) return portalPublishedAdminUrl();
  if (effectiveRole === "lead") return portalPublishedStaffUrl();
  return portalPublishedStaffUrl();
}

function bindLogin() {
  if (!isSupabaseConfigured()) {
    window.__PORTAL_LOGIN_BOOT_FAILED__ =
      "Portal sign-in is not configured on this page. Please refresh or contact the office.";
    return;
  }
  portalPersistLoginRedirectIntent();

  const errorEl = document.getElementById("error-msg");
  const nameInput = document.getElementById("name");
  const passwordInput = document.getElementById("password");
  const form = document.getElementById("login-form");
  if (!errorEl || !nameInput || !passwordInput || !form) {
    window.__PORTAL_LOGIN_BOOT_FAILED__ =
      "Login form did not load correctly. Please refresh and try again.";
    return;
  }

  function hideError() {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
  }

  function showError(message) {
    errorEl.textContent = message || "Invalid login details";
    errorEl.classList.add("visible");
    try {
      errorEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (_scroll) {}
  }

  function errorMessage(err, fallback) {
    if (!err) return fallback;
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === "string") return err;
    if (typeof err === "object") {
      // Supabase PostgrestError shape often has .message
      // @ts-ignore
      if (typeof err.message === "string" && err.message) return err.message;
      try {
        return JSON.stringify(err);
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  async function portalEnsureSupabaseSession(supabase, session) {
    if (!session || !session.access_token) return;
    try {
      // Avoid getSession() here — it can block on Supabase auth lock while sign-in finishes.
      await portalLoginPromiseTimeout(
        supabase.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token || "",
        }),
        8000,
        "Could not save your session. Try again."
      );
    } catch (sessErr) {
      console.warn("[portal] setSession after sign-in failed", sessErr);
    }
  }

  function portalParseStaffProfileRpcPayload(data) {
    if (data == null) return null;
    if (typeof data === "object" && !Array.isArray(data)) {
      const id = data.id != null ? String(data.id).trim() : "";
      if (id) return data;
      return null;
    }
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        return portalParseStaffProfileRpcPayload(parsed);
      } catch {
        return null;
      }
    }
    return null;
  }

  function portalStaffProfileUsernameCandidates(authEmail) {
    const email = String(authEmail || "")
      .trim()
      .toLowerCase();
    const names = new Set();
    const rosterKey = resolveStaffKeyFromAuthEmail(email);
    if (rosterKey) {
      names.add(rosterKey);
      if (rosterKey === "lulia") {
        ["luliya", "lulia", "aida", "Luliya", "Aida"].forEach((n) => names.add(n));
      } else if (rosterKey === "javier") {
        ["javier", "Javier", "javi", "Javi"].forEach((n) => names.add(n));
      } else if (rosterKey === "javi") {
        ["javi", "Javi", "javier", "Javier"].forEach((n) => names.add(n));
      } else if (rosterKey === "youssef") {
        ["youssef", "Youssef", "yousef", "yusef"].forEach((n) => names.add(n));
      } else {
        const cap = rosterKey.charAt(0).toUpperCase() + rosterKey.slice(1);
        names.add(cap);
      }
    }
    const local = email.split("@")[0] || "";
    if (local && PORTAL_STAFF_CODE_TO_ROSTER_KEY[local]) {
      const codeKey = PORTAL_STAFF_CODE_TO_ROSTER_KEY[local];
      names.add(codeKey);
      if (codeKey === "lulia") {
        ["luliya", "lulia", "aida", "Luliya", "Aida"].forEach((n) => names.add(n));
      }
    }
    return [...names].filter(Boolean);
  }

  async function fetchStaffProfileByUsernameAliases(supabase, authEmail) {
    const selectCols =
      "id, username, full_name, app_role, staff_role, dashboard_route, auth_session_generation, is_active, nationality";
    const candidates = portalStaffProfileUsernameCandidates(authEmail);
    if (!candidates.length) return null;
    const { data, error } = await supabase
      .from("staff_profiles")
      .select(selectCols)
      .in("username", candidates)
      .limit(1);
    if (error) {
      console.warn("[portal] staff_profiles alias lookup:", error);
      return null;
    }
    return Array.isArray(data) && data.length ? data[0] : null;
  }

  async function fetchStaffProfile(supabase, userId) {
    const selectCols =
      "id, username, full_name, app_role, staff_role, dashboard_route, auth_session_generation, is_active, nationality";
    async function loadViaRpc() {
      const rpc = await supabase.rpc("portal_get_session_staff_profile");
      if (rpc.error) {
        console.warn("[portal] portal_get_session_staff_profile:", rpc.error);
        return null;
      }
      return portalParseStaffProfileRpcPayload(rpc.data);
    }
    let fromRpc = await loadViaRpc();
    if (!fromRpc) {
      await new Promise(function (r) {
        setTimeout(r, 120);
      });
      fromRpc = await loadViaRpc();
    }
    if (fromRpc) return fromRpc;
    const byId = await supabase
      .from("staff_profiles")
      .select(selectCols)
      .eq("id", userId)
      .maybeSingle();
    if (byId.error) throw byId.error;
    if (byId.data) return byId.data;
    let authEmail = "";
    try {
      const { data: userData } = await supabase.auth.getUser();
      authEmail = String(userData?.user?.email || "").trim();
    } catch {
      /* ignore */
    }
    const aliasProfile = await fetchStaffProfileByUsernameAliases(supabase, authEmail);
    if (aliasProfile) return aliasProfile;
    let sessionUser = { id: userId, email: authEmail };
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) sessionUser = userData.user;
    } catch {
      /* ignore */
    }
    return portalExecutiveBootstrapProfileStub({ user: sessionUser }, authEmail);
  }

  async function portalLogoutAfterProfileFailure() {
    try {
      await portalLogout();
    } catch {
      /* ignore */
    }
    clearPortalStaffContext();
  }

  function portalLoginFailureMessage(resolvedEmail) {
    const lower = String(resolvedEmail || "").trim().toLowerCase();
    if (/^stf\d{3}@staff\.import\.pending$/.test(lower)) {
      return (
        "Wrong PIN. Use your first name (e.g. Aurora) and the 4-digit PIN from the office — not an old test password. " +
        "If you forgot your PIN, ask the office."
      );
    }
    return "Wrong password. Check your email and password, or contact the office.";
  }

  function portalStaffProfileMissingMessage(opts) {
    opts = opts || {};
    const registered = opts.registeredLogin !== false;
    if (registered) {
      return (
        "Sign-in worked, but your staff record is not linked yet. " +
        "Contact the office — ops can fix this in Supabase in a few minutes."
      );
    }
    return (
      "This account is not set up for the club portal. " +
      "Use your staff first name or work email from the office."
    );
  }

  async function redirectUrlForUser(supabase, userId, loginOpts) {
    loginOpts = loginOpts || {};
    let profile = await fetchStaffProfile(supabase, userId);
    if (!profile) {
      let authEmail = String(loginOpts.email || "").trim();
      if (!authEmail) {
        try {
          const { data: userData } = await supabase.auth.getUser();
          authEmail = String(userData?.user?.email || "").trim();
        } catch {
          /* ignore */
        }
      }
      const emergency = portalEmergencyRedirectUrl(authEmail);
      if (emergency) {
        try {
          const { data: userData } = await supabase.auth.getUser();
          profile =
            portalExecutiveBootstrapProfileStub(userData, authEmail) ||
            portalExecutiveBootstrapProfileStub({ user: { id: userId, email: authEmail } }, authEmail);
        } catch {
          profile = portalExecutiveBootstrapProfileStub(
            { user: { id: userId, email: authEmail } },
            authEmail,
          );
        }
      }
    }
    if (!profile) {
      await portalLogoutAfterProfileFailure();
      showError(portalStaffProfileMissingMessage(loginOpts));
      return null;
    }
    if (profile.is_active === false) {
      try {
        await portalLogout();
      } catch {
        /* ignore */
      }
      clearPortalStaffContext();
      showError("This account is disabled. Please contact an admin.");
      return null;
    }
    const { data: userData } = await supabase.auth.getUser();
    const authEmail = userData?.user?.email || "";
    const fromWorkingUi = window.location.pathname.toLowerCase().includes("/working_ui/");
    // Hard rule:
    // - local working_ui uses local html routes
    // - published web uses fixed public routes by role
    // This avoids stale/broken dashboard_route values in DB causing 404.
    portalPersistLoginRedirectIntent();
    const csCliqIntentRaw = portalReadCsCliqLoginIntent();
    const nextUrlRaw = csCliqIntentRaw || readSafePostLoginRedirect();
    const nextUrl = nextUrlRaw ? portalNormalizeCsCliqUrl(nextUrlRaw) : null;
    let url;
    if (nextUrl && portalUrlIsCsCliqPage(nextUrl)) {
      if (portalCanAccessCsCliq(profile, authEmail)) {
        url = nextUrl;
        portalClearLoginRedirectIntent();
      } else {
        url = portalShouldShowPortalChooser(profile, authEmail)
          ? portalPublishedChooseUrl()
          : resolveDashboardRedirect(inferDashboardRoute(profile, authEmail));
      }
    } else if (nextUrl) {
      url = nextUrl;
    } else {
      url = portalShouldShowPortalChooser(profile, authEmail)
        ? portalPublishedChooseUrl()
        : resolveDashboardRedirect(inferDashboardRoute(profile, authEmail));
    }
    // On published deploy, avoid stale DB dashboard_route paths that 404.
    if (!url && fromWorkingUi) {
      const profileRoute = String(profile.dashboard_route || "").trim();
      url = resolveDashboardRedirect(profileRoute);
    }
    setPortalStaffContext(profile, userId);
    return url;
  }

  async function tryForceLogoutFromUrl() {
    if (typeof window === "undefined") return;
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get("portal_logout") !== "1" && u.searchParams.get("logout") !== "1") {
        return;
      }
      let supabase;
      try {
        supabase = getSupabaseClient();
      } catch {
        portalClearPersistedSupabaseAuth();
        return;
      }
      try {
        await portalLogout();
      } catch {
        portalClearPersistedSupabaseAuth();
      }
      u.searchParams.delete("portal_logout");
      u.searchParams.delete("logout");
      const qs = u.searchParams.toString();
      const clean = u.pathname + (qs ? "?" + qs : "") + u.hash;
      window.history.replaceState({}, "", clean);
    } catch {
      /* ignore */
    }
  }

  const LEGACY_PORTAL_AUTH_HOSTS = new Set([
    "clubsensational-portal-2026.vercel.app",
    "portal-2025-eta.vercel.app",
  ]);
  const PORTALVIC_LOGIN_URL = "https://portalvic.vercel.app/login.html";

  function tryRedirectLegacyPortalAuthHost() {
    if (typeof window === "undefined") return false;
    try {
      const host = window.location.hostname;
      if (!LEGACY_PORTAL_AUTH_HOSTS.has(host)) return false;
      const dest = new URL(PORTALVIC_LOGIN_URL);
      dest.search = window.location.search || "";
      dest.hash = window.location.hash || "";
      window.location.replace(dest.toString());
      return true;
    } catch {
      return false;
    }
  }

  /** Supabase email links land with #error=… or #access_token=… in the hash. */
  function showAuthCallbackErrorFromHash() {
    if (typeof window === "undefined") return false;
    try {
      const u = new URL(window.location.href);
      const rawHash = (u.hash || "").replace(/^#/, "");
      if (!rawHash) return false;
      const params = new URLSearchParams(rawHash);
      const err = params.get("error");
      const code = params.get("error_code") || err;
      const desc = params.get("error_description") || "";
      if (!err && !code && !desc) return false;
      let msg =
        "Problema con el enlace del correo" +
        (code ? " (" + code + "). " : ". ");
      if (code === "otp_expired" || /expired/i.test(desc)) {
        msg +=
          "El enlace ya no es válido o ha caducado. Pide un enlace nuevo desde https://portalvic.vercel.app/ (no uses el host portal-2026). ";
      } else if (err === "access_denied") {
        msg +=
          "Si el correo te abrió clubsensational-portal-2026.vercel.app en lugar de portalvic, un admin debe cambiar Supabase → Authentication → URL Configuration (Site URL = portalvic). ";
      }
      if (desc) {
        msg += decodeURIComponent(String(desc).replace(/\+/g, " "));
      }
      showError(msg);
      u.hash = "";
      window.history.replaceState({}, "", u.pathname + (u.search || ""));
      return true;
    } catch {
      return false;
    }
  }

  async function tryRedirectIfSession() {
    if (window.__PORTAL_LOGIN_SUBMIT_INFLIGHT__) return;
    if (tryRedirectLegacyPortalAuthHost()) return;
    if (showAuthCallbackErrorFromHash()) return;
    hideError();
    await tryForceLogoutFromUrl();
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return;
    }
    let session = null;
    try {
      const sessionWrap = await portalLoginPromiseTimeout(
        supabase.auth.getSession(),
        8000,
        "Session check timed out"
      );
      session = sessionWrap && sessionWrap.data ? sessionWrap.data.session : null;
    } catch (sessionErr) {
      console.warn("[portal] login session check skipped:", sessionErr);
      return;
    }
    if (!session?.user?.id) return;
    try {
      if (window.PORTAL_STAFF_APP === true) {
        const bar = document.getElementById("loginActiveSessionBar");
        if (bar) {
          const email = String(session.user.email || "").trim();
          bar.hidden = false;
          bar.innerHTML =
            'Already signed in' +
            (email ? " as <strong>" + email.replace(/</g, "&lt;") + "</strong>" : "") +
            '. <a href="login.html?portal_logout=1">Sign out</a> to use another account.';
        }
      }
      const sessionEmail = String(session.user.email || "").trim();
      const url = await redirectUrlForUser(supabase, session.user.id, {
        email: sessionEmail,
        registeredLogin: portalIsRegisteredPortalLoginEmail(sessionEmail),
      });
      if (!url) return;
      if (typeof portalStaffAppBlocksPassiveLoginRedirect === "function") {
        if (portalStaffAppBlocksPassiveLoginRedirect(url)) return;
      }
      window.location.replace(url);
    } catch (e) {
      clearPortalStaffContext();
      showError(errorMessage(e, "Could not load your profile"));
    }
  }

  async function onSupabaseSubmit(e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    if (window.__PORTAL_LOGIN_SUBMIT_INFLIGHT__) return;

    await tryMergeStaffLoginMapFromSiblingJson();

    hideError();
    const username = nameInput.value.trim();
    const password = passwordInput.value;
    const loginBtn = document.getElementById("btn-login");
    const loginBtnLabel = loginBtn ? loginBtn.textContent : "Login";

    function resetLoginBtn() {
      if (loginBtn) {
        loginBtn.disabled = false;
        loginBtn.textContent = loginBtnLabel || "Login";
      }
    }

    const email = resolveDemoEmail(username);
    if (!email) {
      showError(PORTAL_LOGIN_UNKNOWN_NAME_HELP);
      return;
    }
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch (err) {
      showError(err instanceof Error ? err.message : "Configuration error");
      return;
    }

    window.__PORTAL_LOGIN_SUBMIT_INFLIGHT__ = true;
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = "Signing in…";
    }

    var navigated = false;
    try {
      const signInWrap = await portalLoginPromiseTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        25000,
        "Sign-in timed out. Check your connection and tap Login again."
      );
      const data = signInWrap && signInWrap.data;
      const error = signInWrap && signInWrap.error;
      if (error || !data?.user?.id) {
        showError(portalLoginFailureMessage(email));
        return;
      }
      if (data.session) {
        /* signInWithPassword already stores the session; awaiting setSession can deadlock on GoTrue lock. */
        void portalEnsureSupabaseSession(supabase, data.session);
      }
      void portalBumpAuthSessionGeneration(supabase).catch(function (bumpErr) {
        console.warn(
          "[portal] portal_bump_auth_session_generation failed — apply migration 20260420_portal_auth_generation_and_review_select.sql?",
          bumpErr
        );
      });
      portalPersistLoginRedirectIntent();
      let url = portalEmergencyRedirectUrl(email);
      if (!url) {
        try {
          url = await portalLoginPromiseTimeout(
            redirectUrlForUser(supabase, data.user.id, {
              email,
              registeredLogin: true,
            }),
            12000,
            "Loading your profile timed out."
          );
        } catch (profileErr) {
          url = portalEmergencyRedirectUrl(email);
          if (!url) throw profileErr;
          console.warn("[portal] profile redirect fallback after timeout", profileErr);
        }
      }
      if (!url) return;
      if (loginBtn) loginBtn.textContent = "Opening…";
      navigated = true;
      window.location.href = url;
    } catch (err) {
      clearPortalStaffContext();
      showError(errorMessage(err, "Could not sign in"));
    } finally {
      window.__PORTAL_LOGIN_SUBMIT_INFLIGHT__ = false;
      if (!navigated && loginBtn && loginBtn.disabled) {
        resetLoginBtn();
      }
    }
  }

  form.addEventListener("submit", onSupabaseSubmit, true);
  window.__PORTAL_LOGIN_HANDLER_READY__ = true;

  [nameInput, passwordInput].forEach(function (el) {
    el.addEventListener("input", hideError);
  });

  // Stay on login unless explicitly enabled.
  // To enable auto-redirect when a session exists, set:
  //   window.PORTAL_AUTO_REDIRECT_FROM_LOGIN = true
  if (window.PORTAL_AUTO_REDIRECT_FROM_LOGIN === true) {
    void tryRedirectIfSession();
  }
}

/** Admin ghost teleport (`?ghostToken=`) — read-only mirror; skip single-session kick + visit side effects. */
function portalIsGhostDashboardSession() {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(String(window.location.search || ""));
    if (q.get("ghostToken") || q.get("ghost")) return true;
  } catch {
    /* ignore */
  }
  return !!(window.__PORTAL_GHOST_VIEW__ && window.__PORTAL_GHOST_VIEW__.active);
}

/** CEO ops-admin chat mirror (`?portalGodAdmin=1`) — shared Admin inbox, not Sevitha's login. */
function portalIsGodModeAdminSession() {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(String(window.location.search || ""));
    if (q.get("portalGodAdmin") === "1" || q.get("portalGodAdmin") === "true") return true;
  } catch {
    /* ignore */
  }
  return !!window.__PORTAL_CEO_GOD_MODE_ADMIN__;
}

/**
 * Optional dashboard side effects (presence, visit tracking, location probes).
 * Runs after portal:supabase-ready so roster rehydrate is not blocked.
 */
async function runPortalDashboardAuthSideEffects(ctx) {
  const page = String(ctx.page || "").trim().toLowerCase();
  const profile = ctx.profile || null;
  const session = ctx.session || null;
  const supabase = ctx.supabase;
  const isGhostDashboard = !!ctx.isGhostDashboard;
  const isLeadOverview = page === "lead_overview";

  try {
    if (isLeadOverview || isGhostDashboard) {
      throw new Error("skip_presence_on_lead_overview");
    }
    const { startPortalLivePresence, mountPortalLivePresenceBar } = await import(
      "./portal_live_presence.js?v=20260707-admin-online-fix"
    );
    await startPortalLivePresence({ page, profile, session });
    if (document.getElementById("portalLivePresenceBar")) {
      mountPortalLivePresenceBar("portalLivePresenceBar");
    }
  } catch (presenceErr) {
    console.debug("[portal] live presence skipped:", presenceErr);
  }
  try {
    if (!isLeadOverview && !isGhostDashboard) {
      const { startPortalVisitTracker } = await import(
        "./portal_visit_tracker.js?v=20260617-direct-pulse"
      );
      await startPortalVisitTracker({ page, profile, session });
    }
  } catch (visitErr) {
    console.debug("[portal] visit tracker skipped:", visitErr);
  }
  try {
    if (!isLeadOverview && !isGhostDashboard) {
      await import("./portal_training_progress_sync.js?v=20260610-rpc-fallback");
      if (typeof window.portalSyncTrainingProgressToSupabase === "function") {
        await window.portalSyncTrainingProgressToSupabase({
          client: supabase,
          session,
          profile: profile || null,
        });
      }
    }
  } catch (tprogErr) {
    console.debug("[portal] training progress sync skipped:", tprogErr);
  }
  try {
    if (isLeadOverview || isGhostDashboard) {
      throw new Error("skip_location_on_lead_overview");
    }
    const perm = await import("./portal_location_permission.js?v=20260610-console-clean2");
    window.portalLocationPermissionGranted = perm.portalLocationPermissionGranted;
    window.portalMicrophonePermissionGranted = perm.portalMicrophonePermissionGranted;
    window.portalCameraPermissionGranted = perm.portalCameraPermissionGranted;
    window.portalCommsMediaPermissionsGranted = perm.portalCommsMediaPermissionsGranted;
    window.portalRequestLocationPermission = perm.requestLocationPermission;
    window.portalRequestMicrophonePermission = perm.requestMicrophonePermission;
    window.portalRequestCameraPermission = perm.requestCameraPermission;
    window.portalMarkCameraGranted = perm.markCameraGranted;
    window.portalMarkCameraDenied = perm.markCameraDenied;
    window.portalRequestCallMediaPermissions = perm.requestCallMediaPermissions;
    window.portalRequestAllPortalPermissions = perm.requestAllPortalPermissions;
    window.portalRequestDefaultPortalPermissions = perm.requestDefaultPortalPermissions;
    window.portalRefreshLocationUi = perm.portalRefreshLocationUi;
    window.portalRefreshMicrophoneUi = perm.portalRefreshMicrophoneUi;
    window.portalRefreshCameraUi = perm.portalRefreshCameraUi;
    window.portalRefreshEnableAllUi = perm.portalRefreshEnableAllUi;
    window.portalRefreshMandatoryAlertsSettingsUi = perm.portalRefreshMandatoryAlertsSettingsUi;
    window.portalOnAlertsSheetOpened = perm.portalOnAlertsSheetOpened;
    window.portalRequestNotificationPermission = perm.requestNotificationPermission;
    window.portalEnsureMandatoryAlertsSettings = perm.portalEnsureMandatoryAlertsSettings;
    window.portalSyncAlertsSettingsChrome = perm.portalSyncAlertsSettingsChrome;
    window.portalMandatoryAlertsSettingsComplete = perm.portalMandatoryAlertsSettingsComplete;
    window.portalBindPortalLocationPermissionUi = perm.bindPortalLocationPermissionUi;
    window.portalBindAutoNotificationOnFirstGesture = perm.bindAutoNotificationOnFirstGesture;
    perm.bindPortalLocationPermissionUi();
    perm.bindMandatoryAlertsSettingsResume();
    await Promise.all([
      perm.probeLocationPermissionState(),
      perm.probeMicrophonePermissionState(),
      perm.probeCameraPermissionState(),
    ]);
    perm.portalRefreshMicrophoneUi();
    perm.portalRefreshCameraUi();
    perm.portalRefreshEnableAllUi();
    perm.portalSyncAlertsSettingsChrome();
    const loc = await import("./portal_location_tracker.js?v=20260610-all-services-window");
    window.portalRestartLocationTracker = function () {
      return loc.restartPortalLocationTracker({ page, profile, session });
    };
    window.portalUploadLocationFromPosition = function (pos) {
      return loc.uploadLocationFromPosition(pos);
    };
    await loc.startPortalLocationTracker({ page, profile, session });
    await perm.portalEnsureMandatoryAlertsSettings({ page });
  } catch (locErr) {
    console.debug("[portal] location tracker skipped:", locErr);
  }
}

/**
 * Optional: dashboards may import this; does not change DOM.
 * @param {{ page?: string }} _opts
 */
function portalBootstrapStaffProfileUsernameCandidates(authEmail) {
  const email = String(authEmail || "").trim().toLowerCase();
  const names = new Set();
  const rosterKey = resolveStaffKeyFromAuthEmail(email);
  if (rosterKey) {
    names.add(rosterKey);
    if (rosterKey === "lulia") ["luliya", "lulia", "aida", "Luliya", "Aida"].forEach((n) => names.add(n));
    else if (rosterKey === "javier") ["javier", "Javier", "javi", "Javi"].forEach((n) => names.add(n));
    else if (rosterKey === "javi") ["javi", "Javi", "javier", "Javier"].forEach((n) => names.add(n));
    else if (rosterKey === "youssef") ["youssef", "Youssef", "yousef", "yusef"].forEach((n) => names.add(n));
    else names.add(rosterKey.charAt(0).toUpperCase() + rosterKey.slice(1));
  }
  const local = email.split("@")[0] || "";
  if (local && PORTAL_STAFF_CODE_TO_ROSTER_KEY[local]) {
    const codeKey = PORTAL_STAFF_CODE_TO_ROSTER_KEY[local];
    names.add(codeKey);
    if (codeKey === "lulia") ["luliya", "lulia", "aida", "Luliya", "Aida"].forEach((n) => names.add(n));
  }
  return [...names].filter(Boolean);
}

async function portalBootstrapLoadStaffProfile(supabase, session, authEmailGate) {
  const selectCols =
    "id, username, full_name, app_role, staff_role, dashboard_route, auth_session_generation, is_active, nationality";
  const rpc = await supabase.rpc("portal_get_session_staff_profile");
  if (!rpc.error && rpc.data && typeof rpc.data === "object") return rpc.data;
  const { data: profileRow, error } = await supabase
    .from("staff_profiles")
    .select(selectCols)
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) throw error;
  if (profileRow) return profileRow;
  const candidates = portalBootstrapStaffProfileUsernameCandidates(authEmailGate);
  if (!candidates.length) return null;
  const { data, error: aliasErr } = await supabase
    .from("staff_profiles")
    .select(selectCols)
    .in("username", candidates)
    .limit(1);
  if (aliasErr) {
    console.warn("[portal] staff_profiles alias lookup:", aliasErr);
    return portalExecutiveBootstrapProfileStub(session, authEmailGate);
  }
  const row = Array.isArray(data) && data.length ? data[0] : null;
  return row || portalExecutiveBootstrapProfileStub(session, authEmailGate);
}

export async function bootstrapDashboardSupabase(_opts) {
  if (typeof window !== "undefined") {
    if (window.__PORTAL_SUPABASE__?.client) return;
    if (window.__PORTAL_SUPABASE_BOOT_INFLIGHT__) {
      return window.__PORTAL_SUPABASE_BOOT_INFLIGHT__;
    }
  }

  const boot = async () => {
  if (enforceAppVersion()) return;

  const page = String((_opts && _opts.page) || "").trim().toLowerCase();
  const isGhostDashboard = portalIsGhostDashboardSession();
  const isGodModeAdmin = portalIsGodModeAdminSession();
  const loginRedirect = portalPublishedLoginUrl();
  const isLeadOverview = page === "lead_overview";
  const leadHubUrl = portalPublishedLeadUrl();
  /** Programme-lead session overview: return to lead hub, not login, when auth is not ready yet. */
  function portalDashboardUsesLoginWithReturn(p) {
    return (
      p === "onboarding" ||
      p === "cs_cliq" ||
      p === "admin" ||
      p === "office" ||
      p === "ceo" ||
      p === "lead" ||
      p === "choose"
    );
  }
  const authFailureRedirect =
    page === "lead_overview"
      ? leadHubUrl
      : portalDashboardUsesLoginWithReturn(page) && typeof window !== "undefined"
        ? portalLoginUrlWithReturn(window.location.href)
        : loginRedirect;
  const sessionWaitMs =
    isLeadOverview ||
    page === "cs_cliq" ||
    page === "onboarding" ||
    page === "admin" ||
    page === "office" ||
    page === "ceo" ||
    page === "lead" ||
    page === "choose"
      ? 7000
      : 2800;

  /** Admin + Lead + CEO + portal chooser (+ lead overview) enforce login + staff_profiles. */
  function portalDashboardRequiresStrictGate(page) {
    return (
      page === "admin" ||
      page === "office" ||
      page === "lead" ||
      page === "lead_overview" ||
      page === "ceo" ||
      page === "cs_cliq" ||
      page === "choose"
    );
  }

  if (!isSupabaseConfigured()) {
    if (portalDashboardRequiresStrictGate(page)) {
      try {
        window.location.replace(authFailureRedirect);
      } catch {
        window.location.href = authFailureRedirect;
      }
    }
    return;
  }
  try {
    const supabase = getSupabaseClient();
    if (typeof window !== "undefined") {
      window.__PORTAL_SUPABASE_SINGLETON__ = supabase;
    }
    let {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      const persisted = portalReadPersistedSupabaseSession();
      if (persisted?.access_token) {
        try {
          await supabase.auth.setSession({
            access_token: persisted.access_token,
            refresh_token: persisted.refresh_token || "",
          });
        } catch {
          /* ignore */
        }
        ({
          data: { session },
        } = await supabase.auth.getSession());
      }
    }
    /** After a full navigation (e.g. return from session feedback), storage session can lag behind getSession(); recover before giving up. */
    if (!session?.user?.id) {
      const { data: ud, error: guErr } = await supabase.auth.getUser();
      if (!guErr && ud?.user?.id) {
        const {
          data: { session: s2 },
        } = await supabase.auth.getSession();
        session = s2;
      }
    }
    if (!session?.user?.id) {
      session = await new Promise((resolve) => {
        let t = null;
        const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, next) => {
          if (next?.user?.id && (event === "INITIAL_SESSION" || event === "SIGNED_IN")) {
            if (t != null) clearTimeout(t);
            try {
              authSub.unsubscribe();
            } catch {
              /* ignore */
            }
            resolve(next);
          }
        });
        t = setTimeout(() => {
          try {
            authSub.unsubscribe();
          } catch {
            /* ignore */
          }
          resolve(null);
        }, sessionWaitMs);
      });
    }
    if (!session?.user?.id) {
      if (portalDashboardRequiresStrictGate(page) || page === "onboarding") {
        try {
          window.location.replace(authFailureRedirect);
        } catch {
          window.location.href = authFailureRedirect;
        }
      } else if (page === "staff") {
        /** Help guide / staff surfaces: expose client so voice can refresh session on Play. */
        window.__PORTAL_SUPABASE_SINGLETON__ = supabase;
        window.__PORTAL_SUPABASE__ = { client: supabase, session: null, staff_profile: null };
        try {
          window.SUPABASE_URL = getSupabaseUrl();
          window.SUPABASE_ANON_KEY = getSupabaseAnonKey();
        } catch {
          /* ignore */
        }
      }
      return;
    }
    let authEmailGate = String(session.user?.email || "").trim();
    if (!authEmailGate) {
      try {
        const { data: udata } = await supabase.auth.getUser();
        authEmailGate = String(udata?.user?.email || "").trim();
      } catch {
        /* ignore */
      }
    }

    let profile = await portalBootstrapLoadStaffProfile(supabase, session, authEmailGate);

    if (profile && profile.is_active === false) {
      try {
        await portalLogout();
      } catch {
        /* ignore */
      }
      clearPortalStaffContext();
      const inactiveRedirect =
        page === "onboarding" || portalDashboardUsesLoginWithReturn(page)
          ? portalLoginUrlWithReturn(window.location.href)
          : loginRedirect;
      try {
        window.location.replace(inactiveRedirect);
      } catch {
        window.location.href = inactiveRedirect;
      }
      return;
    }

    if (portalDashboardRequiresStrictGate(page) && !profile) {
      try {
        await portalLogout();
      } catch {
        /* ignore */
      }
      clearPortalStaffContext();
      try {
        window.location.replace(authFailureRedirect);
      } catch {
        window.location.href = authFailureRedirect;
      }
      return;
    }

    if (page === "lead_overview") {
      try {
        const { portalCanAccessLeadSessionOverview } = await import(
          "./portal_lead_session_scope.js"
        );
        if (!portalCanAccessLeadSessionOverview(profile, authEmailGate)) {
          const hubUrl =
            resolveDashboardRedirect(inferDashboardRoute(profile, authEmailGate)) || leadHubUrl;
          try {
            window.location.replace(hubUrl);
          } catch {
            window.location.href = hubUrl;
          }
          return;
        }
      } catch (scopeErr) {
        console.warn("[portal] lead_overview scope check", scopeErr);
        const hubUrl =
          resolveDashboardRedirect(inferDashboardRoute(profile, authEmailGate)) || leadHubUrl;
        try {
          window.location.replace(hubUrl);
        } catch {
          window.location.href = hubUrl;
        }
        return;
      }
    }

    if (page === "admin") {
      if (!portalCanAccessAdminDashboard(profile, authEmailGate)) {
        const eff = portalInferEffectiveRole(profile, authEmailGate);
        const dest = portalNormalizeUrl(
          portalIsAdminHomeExecutiveUser(profile, authEmailGate)
            ? portalPublishedAdminUrl()
            : eff === "lead"
              ? portalPublishedLeadUrl()
              : portalPublishedStaffUrl()
        );
        try {
          window.location.replace(dest);
        } catch {
          window.location.href = dest;
        }
        return;
      }
      if (portalIsOperationsAdminUser(profile, authEmailGate)) {
        /* Full admin shell (sidebar + menu) — office_portal is only the personal home. */
      }
    }

    if (page === "office") {
      if (!portalIsOperationsAdminUser(profile, authEmailGate)) {
        const dest = resolveDashboardRedirect(inferDashboardRoute(profile, authEmailGate));
        try {
          window.location.replace(dest);
        } catch {
          window.location.href = dest;
        }
        return;
      }
    }

    if (page === "ceo") {
      if (!portalCanAccessCeoDashboard(profile, authEmailGate)) {
        const dest = resolveDashboardRedirect(inferDashboardRoute(profile, authEmailGate));
        try {
          window.location.replace(dest);
        } catch {
          window.location.href = dest;
        }
        return;
      }
    }

    if (page === "cs_cliq") {
      const dest = resolveDashboardRedirect(inferDashboardRoute(profile, authEmailGate));
      try {
        window.location.replace(dest);
      } catch {
        window.location.href = dest;
      }
      return;
    }

    if (page === "choose") {
      if (!portalShouldShowPortalChooser(profile, authEmailGate)) {
        const dest = resolveDashboardRedirect(inferDashboardRoute(profile, authEmailGate));
        try {
          window.location.replace(dest);
        } catch {
          window.location.href = dest;
        }
        return;
      }
    }

    if (profile) setPortalStaffContext(profile, session.user.id);

    /* CEO/admin accounts (Victor, Raul, Javi, Sevitha) hop between admin/staff/ceo portals and
       re-login often, so their auth_session_generation churns. Single-session auto-logout is meant
       for field workers who share devices — exempt exec/admin so their open tabs are not kicked. */
    const singleSessionExempt =
      !!profile && ["ceo", "admin"].includes(String(profile.app_role || "").trim().toLowerCase());

    if (profile) {
      const gen = Number(profile.auth_session_generation) || 0;
      if (isGhostDashboard || isGodModeAdmin || singleSessionExempt) {
        // Fresh tab can hold a stale generation cache; sync to server before single-session kick.
        portalClearCachedAuthSessionGeneration();
        portalSetCachedAuthSessionGeneration(gen);
      } else {
        const cached = portalGetCachedAuthSessionGeneration();
        if (cached != null && gen > cached) {
          try {
            await portalLogout();
          } catch {
            /* ignore */
          }
          const kickUrl =
            page === "onboarding" || portalDashboardUsesLoginWithReturn(page)
              ? portalLoginUrlWithReturn(window.location.href)
              : loginRedirect;
          window.location.href = kickUrl;
          return;
        }
        portalSetCachedAuthSessionGeneration(gen);
      }
    }

    if (typeof window !== "undefined" && profile && (page === "lead" || page === "staff")) {
      const surfaceMap = globalThis.portalAdminSurfaceMap;
      if (
        surfaceMap &&
        typeof surfaceMap.shouldRedirectFromWorkerPortal === "function" &&
        surfaceMap.shouldRedirectFromWorkerPortal(profile, window.location.pathname)
      ) {
        const dest = surfaceMap.adminDashboardUrl(surfaceMap.resolve(profile));
        window.location.replace(dest);
        return;
      }
    }

    if (typeof window !== "undefined" && typeof window.__PORTAL_AUTH_GEN_DISPOSE__ === "function") {
      try {
        window.__PORTAL_AUTH_GEN_DISPOSE__();
      } catch {
        /* ignore */
      }
    }
    if (
      typeof window !== "undefined" &&
      session?.user?.id &&
      !isGhostDashboard &&
      !singleSessionExempt &&
      page !== "onboarding"
    ) {
      window.__PORTAL_AUTH_GEN_DISPOSE__ = bindPortalRemoteLogoutOnStaleAuthGeneration(
        supabase,
        session.user.id,
        { loginUrl: loginRedirect }
      );
    }

    window.__PORTAL_SUPABASE__ = { client: supabase, session, staff_profile: profile || null };
    try {
      window.SUPABASE_URL = getSupabaseUrl();
      window.SUPABASE_ANON_KEY = getSupabaseAnonKey();
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.add("portal-auth-ready");
    }
    window.dispatchEvent(
      new CustomEvent("portal:supabase-ready", { detail: window.__PORTAL_SUPABASE__ })
    );
    if (typeof window !== "undefined" && profile && page === "admin") {
      const surfaceMap = globalThis.portalAdminSurfaceMap;
      if (surfaceMap && typeof surfaceMap.bootAdminSurface === "function") {
        surfaceMap.bootAdminSurface(profile);
      }
    }
    void runPortalDashboardAuthSideEffects({
      page,
      profile,
      session,
      supabase,
      isGhostDashboard,
    });
  } catch (e) {
    console.debug("[portal] Supabase dashboard bootstrap skipped:", e);
    if (
      typeof window !== "undefined" &&
      (portalDashboardRequiresStrictGate(page) || page === "staff")
    ) {
      try {
        const supabase = getSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user?.id && !(window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client)) {
          let profile = null;
          let authEmail = String(session.user?.email || "").trim();
          try {
            profile = await portalBootstrapLoadStaffProfile(supabase, session, authEmail);
          } catch {
            /* profile optional in recovery path */
          }
          window.__PORTAL_SUPABASE_SINGLETON__ = supabase;
          window.__PORTAL_SUPABASE__ = {
            client: supabase,
            session,
            staff_profile: profile,
          };
          try {
            window.SUPABASE_URL = getSupabaseUrl();
            window.SUPABASE_ANON_KEY = getSupabaseAnonKey();
          } catch {
            /* ignore */
          }
          if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.classList.add("portal-auth-ready");
          }
          window.dispatchEvent(
            new CustomEvent("portal:supabase-ready", { detail: window.__PORTAL_SUPABASE__ })
          );
          void runPortalDashboardAuthSideEffects({
            page,
            profile,
            session,
            supabase,
            isGhostDashboard,
          });
        }
      } catch {
        /* ignore */
      }
    }
  }
  };

  if (typeof window !== "undefined") {
    window.__PORTAL_SUPABASE_BOOT_INFLIGHT__ = boot();
    try {
      await window.__PORTAL_SUPABASE_BOOT_INFLIGHT__;
    } finally {
      window.__PORTAL_SUPABASE_BOOT_INFLIGHT__ = null;
    }
    return;
  }
  return boot();
}

function normalizeAvatarKey(raw, fallback) {
  const key = String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return key || String(fallback || "staff").toLowerCase();
}

/**
 * Uploads staff avatar to Supabase Storage and stores URL in auth metadata.
 * Requires a public bucket named `staff-avatars`.
 *
 * @param {File} file
 * @param {{ bucket?: string }} [opts]
 * @returns {Promise<{ publicUrl: string, path: string }>}
 */
export async function uploadStaffAvatar(file, opts = {}) {
  if (!file) throw new Error("No image selected.");
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Selected file is not an image.");
  }

  const supabase = getSupabaseClient();
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  if (!session?.user?.id) throw new Error("No active session.");

  const bucket = String(opts.bucket || "staff-avatars").trim() || "staff-avatars";
  const ext = String(file.name || "avatar.jpg").split(".").pop() || "jpg";
  const path = `${session.user.id}/avatar.${ext}`;

  const { error: uploadErr } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
    cacheControl: "3600",
  });
  if (uploadErr) throw uploadErr;

  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
  const publicUrl = `${pub.publicUrl}?t=${Date.now()}`;

  const { error: updateErr } = await supabase.auth.updateUser({
    data: { avatar_url: publicUrl },
  });
  if (updateErr) throw updateErr;

  try {
    if (window.__PORTAL_SUPABASE__?.session?.user) {
      const oldMeta = window.__PORTAL_SUPABASE__.session.user.user_metadata || {};
      window.__PORTAL_SUPABASE__.session.user.user_metadata = {
        ...oldMeta,
        avatar_url: publicUrl,
      };
    }
  } catch {
    /* ignore */
  }

  return { publicUrl, path };
}

if (isLoginPage()) {
  try {
    enforceAppVersion();
    portalShowLoginUpdatedBannerIfNeeded();
    bindLogin();
  } catch (loginBootErr) {
    console.error("[portal] login bootstrap failed", loginBootErr);
    window.__PORTAL_LOGIN_BOOT_FAILED__ =
      "Could not start sign-in. Please refresh and try again.";
    try {
      const bootErrEl = document.getElementById("error-msg");
      if (bootErrEl) {
        bootErrEl.textContent = window.__PORTAL_LOGIN_BOOT_FAILED__;
        bootErrEl.classList.add("visible");
      }
    } catch {
      /* ignore */
    }
  }
}
