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
  isSupabaseConfigured,
  setPortalStaffContext,
  clearPortalStaffContext,
  portalLogout,
  portalBumpAuthSessionGeneration,
  portalGetCachedAuthSessionGeneration,
  portalSetCachedAuthSessionGeneration,
  bindPortalRemoteLogoutOnStaleAuthGeneration,
} from "./supabase-client.js?v=20260506-portal-interactions";
import {
  resolveDemoEmail,
  resolveStaffKeyFromAuthEmail,
  PORTAL_LOGIN_UNKNOWN_NAME_HELP,
  mergeStaffLoginEmailMap,
} from "./auth-map.js";

export {
  portalLogout,
  getSupabaseClient,
  getPortalStaffContext,
  clearPortalStaffContext,
  portalFetchSubmittedReviewSessionKeys,
  portalMergeReviewKeysIntoMemoryMap,
} from "./supabase-client.js?v=20260506-portal-interactions";

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
 * 1) window.PORTAL_STAFF_LOGIN_MAP from staff_login_map.js (WordPress-friendly; load before this module).
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
function portalPublishedStaffUrl() {
  if (typeof window !== "undefined") {
    const w = String(window.PORTAL_STAFF_DASHBOARD_URL || "").trim();
    if (w) return w;
  }
  return "https://www.clubsensational.org/p1/";
}
function portalPublishedAdminUrl() {
  if (typeof window !== "undefined") {
    const w = String(window.PORTAL_ADMIN_DASHBOARD_URL || "").trim();
    if (w) return w;
  }
  return "https://www.clubsensational.org/operations-admin/";
}
function portalPublishedLeadUrl() {
  if (typeof window !== "undefined") {
    const w = String(window.PORTAL_LEAD_DASHBOARD_URL || "").trim();
    if (w) return w;
  }
  return "https://www.clubsensational.org/l1/";
}

/** Same keys as login redirect; keeps staff off the Lead shell if they land on /l1/ by mistake. */
const PORTAL_USERNAME_ROLE_OVERRIDES = {
  sevitha: "admin",
  berta: "lead",
  john: "lead",
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

function portalInferStaffKey(profile, authEmail) {
  const u = portalNormalizeStaffKey(profile?.username);
  if (u) return u;
  const rawName = String(profile?.full_name || "").trim();
  if (rawName) {
    const firstWord = rawName.split(/\s+/)[0] || "";
    const firstKey = portalNormalizeStaffKey(firstWord);
    if (firstKey) return firstKey;
  }
  const fromEmail = resolveStaffKeyFromAuthEmail(authEmail);
  if (fromEmail) return fromEmail;
  const fn = portalNormalizeStaffKey(profile?.full_name);
  if (fn) return fn;
  return "";
}

function portalInferEffectiveRole(profile, authEmail) {
  const appRole = String(profile?.app_role || "").toLowerCase();
  const staffRole = String(profile?.staff_role || "").toLowerCase();
  const staffKey = portalInferStaffKey(profile, authEmail);
  return PORTAL_USERNAME_ROLE_OVERRIDES[staffKey] || appRole || staffRole || "staff";
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

function portalOriginBase(host) {
  const h = String(host || "")
    .toLowerCase()
    .replace(/^www\./, "");
  return h === "clubsensational.org" ? "clubsensational.org" : h;
}

/**
 * Optional `next` / `return` query on the login page: after a successful sign-in,
 * redirect there instead of the role dashboard (same site only; blocks login loops).
 * Treats `www.clubsensational.org` and `clubsensational.org` as the same site.
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
    const here = portalOriginBase(window.location.hostname);
    const there = portalOriginBase(target.hostname);
    if (here !== there || !/^https?:$/i.test(target.protocol)) return null;
    const path = target.pathname.toLowerCase();
    if (path.endsWith("/login") || path.endsWith("login.html") || path.endsWith("/l0") || path.endsWith("/l0/")) {
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

function bindLogin() {
  if (!isSupabaseConfigured()) return;

  const errorEl = document.getElementById("error-msg");
  const nameInput = document.getElementById("name");
  const passwordInput = document.getElementById("password");
  const form = document.getElementById("login-form");
  if (!errorEl || !nameInput || !passwordInput || !form) return;

  function hideError() {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
  }

  function showError(message) {
    errorEl.textContent = message || "Invalid login details";
    errorEl.classList.add("visible");
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

  function resolveDashboardRedirect(route) {
    if (!route || typeof route !== "string") return null;
    const t = route.trim();
    if (!t) return null;
    if (/^https?:\/\//i.test(t)) return t;
    try {
      return new URL(t, window.location.href).href;
    } catch {
      return t;
    }
  }

  function inferDashboardRoute(profile, authEmail) {
    const effectiveRole = portalInferEffectiveRole(profile, authEmail);
    const fromWorkingUi = window.location.pathname.toLowerCase().includes("/working_ui/");
    if (fromWorkingUi) {
      if (effectiveRole === "ceo") return "ceo_dashboard.html";
      if (portalCanAccessAdminDashboard(profile, authEmail)) return "admin_dashboard.html";
      if (effectiveRole === "lead") return "lead_dashboard.html";
      return "staff_dashboard.html";
    }
    const ceoUrl = String(
      (typeof window !== "undefined" && window.PORTAL_CEO_DASHBOARD_URL) ||
        "https://www.clubsensational.org/ce/"
    ).trim();
    if (effectiveRole === "ceo") return ceoUrl;
    if (portalCanAccessAdminDashboard(profile, authEmail)) return portalPublishedAdminUrl();
    if (effectiveRole === "lead") return portalPublishedLeadUrl();
    return portalPublishedStaffUrl();
  }

  async function fetchStaffProfile(supabase, userId) {
    const selectCols =
      "id, username, full_name, app_role, staff_role, dashboard_route, auth_session_generation";
    const byId = await supabase
      .from("staff_profiles")
      .select(selectCols)
      .eq("id", userId)
      .maybeSingle();
    if (byId.error) throw byId.error;
    return byId.data;
  }

  async function redirectUrlForUser(supabase, userId) {
    const profile = await fetchStaffProfile(supabase, userId);
    if (!profile) {
      showError(
        "No staff profile for this account. Ask an admin to link your user in public.staff_profiles."
      );
      return null;
    }
    const { data: userData } = await supabase.auth.getUser();
    const authEmail = userData?.user?.email || "";
    const fromWorkingUi = window.location.pathname.toLowerCase().includes("/working_ui/");
    // Hard rule:
    // - local working_ui uses local html routes
    // - published web uses fixed public routes by role
    // This avoids stale/broken dashboard_route values in DB causing 404.
    let url = resolveDashboardRedirect(inferDashboardRoute(profile, authEmail));
    // Never fall back to DB dashboard_route on the published WordPress site:
    // those values are often legacy relative paths and resolve to 404.
    if (!url && fromWorkingUi) {
      const profileRoute = String(profile.dashboard_route || "").trim();
      url = resolveDashboardRedirect(profileRoute);
    }
    setPortalStaffContext(profile, userId);
    return url;
  }

  async function tryRedirectIfSession() {
    hideError();
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      return;
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    try {
      const url = await redirectUrlForUser(supabase, session.user.id);
      if (!url) return;
      const nextUrl = readSafePostLoginRedirect();
      window.location.replace(nextUrl || url);
    } catch (e) {
      clearPortalStaffContext();
      showError(errorMessage(e, "Could not load your profile"));
    }
  }

  async function onSupabaseSubmit(e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    await tryMergeStaffLoginMapFromSiblingJson();

    hideError();
    const username = nameInput.value.trim();
    const password = passwordInput.value;
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
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data?.user?.id) {
      showError(
        "Wrong password, or this staff account is not created in Supabase yet. " +
          "Restore the shared test password: run database/provision_staff_auth_users.py with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (default 990099; Supabase often requires min 6 characters). " +
          "Or reset each user in Supabase → Authentication → Users. " +
          "Email provider minimum password length must allow the bootstrap password (default 990099 = 6 chars). " +
          "ES: si no entra nadie, vuelve a ejecutar provision_staff_auth_users.py o supabase_update_test_passwords.sql (contraseña de prueba 990099 en stf*@staff.import.pending)."
      );
      return;
    }
    try {
      await portalBumpAuthSessionGeneration(supabase);
    } catch (bumpErr) {
      console.warn(
        "[portal] portal_bump_auth_session_generation failed — apply migration 20260420_portal_auth_generation_and_review_select.sql?",
        bumpErr
      );
    }
    try {
      const url = await redirectUrlForUser(supabase, data.user.id);
      if (!url) return;
      const nextUrl = readSafePostLoginRedirect();
      window.location.href = nextUrl || url;
    } catch (err) {
      clearPortalStaffContext();
      showError(errorMessage(err, "Could not load your profile"));
    }
  }

  form.addEventListener("submit", onSupabaseSubmit, true);

  [nameInput, passwordInput].forEach(function (el) {
    el.addEventListener("input", hideError);
  });

  // Elementor-safe default: stay on login unless explicitly enabled.
  // To enable auto-redirect when a session exists, set:
  //   window.PORTAL_AUTO_REDIRECT_FROM_LOGIN = true
  if (window.PORTAL_AUTO_REDIRECT_FROM_LOGIN === true) {
    void tryRedirectIfSession();
  }
}

/**
 * Optional: dashboards may import this; does not change DOM.
 * @param {{ page?: string }} _opts
 */
export async function bootstrapDashboardSupabase(_opts) {
  const page = String((_opts && _opts.page) || "").trim().toLowerCase();
  const loginRedirect =
    typeof window !== "undefined" && window.PORTAL_LOGIN_REDIRECT_URL
      ? String(window.PORTAL_LOGIN_REDIRECT_URL).trim()
      : "https://www.clubsensational.org/l0/";

  /** Only Admin + Lead shells enforce login + staff_profiles (Staff/CEO stay permissive like legacy demo: name + shared test password). */
  function portalDashboardRequiresStrictGate(page) {
    return page === "admin" || page === "lead";
  }

  if (!isSupabaseConfigured()) {
    if (portalDashboardRequiresStrictGate(page)) {
      try {
        window.location.replace(loginRedirect);
      } catch {
        window.location.href = loginRedirect;
      }
    }
    return;
  }
  try {
    const supabase = getSupabaseClient();
    let {
      data: { session },
    } = await supabase.auth.getSession();
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
        }, 2800);
      });
    }
    if (!session?.user?.id) {
      if (portalDashboardRequiresStrictGate(page)) {
        try {
          window.location.replace(loginRedirect);
        } catch {
          window.location.href = loginRedirect;
        }
      }
      return;
    }
    const { data: profile, error } = await supabase
      .from("staff_profiles")
      .select("id, username, full_name, app_role, staff_role, dashboard_route, auth_session_generation")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error) throw error;

    let authEmailGate = String(session.user?.email || "").trim();
    if (!authEmailGate) {
      try {
        const { data: udata } = await supabase.auth.getUser();
        authEmailGate = String(udata?.user?.email || "").trim();
      } catch {
        /* ignore */
      }
    }

    if (portalDashboardRequiresStrictGate(page) && !profile) {
      try {
        await portalLogout();
      } catch {
        /* ignore */
      }
      clearPortalStaffContext();
      try {
        window.location.replace(loginRedirect);
      } catch {
        window.location.href = loginRedirect;
      }
      return;
    }

    if (page === "admin") {
      if (!portalCanAccessAdminDashboard(profile, authEmailGate)) {
        const eff = portalInferEffectiveRole(profile, authEmailGate);
        const ceoUrl = String(
          (typeof window !== "undefined" && window.PORTAL_CEO_DASHBOARD_URL) ||
            "https://www.clubsensational.org/ce/"
        ).trim();
        const dest =
          eff === "ceo"
            ? ceoUrl
            : eff === "lead"
              ? portalPublishedLeadUrl()
              : portalPublishedStaffUrl();
        try {
          window.location.replace(dest);
        } catch {
          window.location.href = dest;
        }
        return;
      }
    }

    if (profile) setPortalStaffContext(profile, session.user.id);

    if (profile) {
      const gen = Number(profile.auth_session_generation) || 0;
      const cached = portalGetCachedAuthSessionGeneration();
      if (cached != null && gen > cached) {
        try {
          await portalLogout();
        } catch {
          /* ignore */
        }
        window.location.href = loginRedirect;
        return;
      }
      portalSetCachedAuthSessionGeneration(gen);
    }

    if (typeof window !== "undefined" && profile && page === "lead") {
      const qs = String(window.location.search || "");
      const inElementorPreview =
        qs.indexOf("elementor-preview=") !== -1 ||
        qs.indexOf("preview=true") !== -1 ||
        (document.documentElement &&
          document.documentElement.classList.contains("elementor-editor-active"));
      if (!inElementorPreview) {
        let authEmail = String(session.user?.email || "").trim();
        if (!authEmail) {
          try {
            const { data: udata } = await supabase.auth.getUser();
            authEmail = String(udata?.user?.email || "").trim();
          } catch {
            /* ignore */
          }
        }
        const eff = portalInferEffectiveRole(profile, authEmail);
        if (eff !== "lead" && eff !== "admin" && eff !== "ceo") {
          const staffUrl = portalPublishedStaffUrl();
          window.location.replace(staffUrl);
          return;
        }
      }
    }

    if (typeof window !== "undefined" && typeof window.__PORTAL_AUTH_GEN_DISPOSE__ === "function") {
      try {
        window.__PORTAL_AUTH_GEN_DISPOSE__();
      } catch {
        /* ignore */
      }
    }
    if (typeof window !== "undefined" && session?.user?.id) {
      window.__PORTAL_AUTH_GEN_DISPOSE__ = bindPortalRemoteLogoutOnStaleAuthGeneration(
        supabase,
        session.user.id,
        { loginUrl: loginRedirect }
      );
    }

    window.__PORTAL_SUPABASE__ = { client: supabase, session, staff_profile: profile || null };
    window.dispatchEvent(
      new CustomEvent("portal:supabase-ready", { detail: window.__PORTAL_SUPABASE__ })
    );
  } catch (e) {
    console.debug("[portal] Supabase dashboard bootstrap skipped:", e);
  }
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

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("username, full_name")
    .eq("id", session.user.id)
    .maybeSingle();

  const staffKey = normalizeAvatarKey(
    profile?.username || profile?.full_name || session.user.email,
    session.user.id
  );
  const bucket = String(opts.bucket || "staff-avatars").trim() || "staff-avatars";
  const ext = String(file.name || "avatar.jpg").split(".").pop() || "jpg";
  const path = `${staffKey}/avatar.${ext}`;

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
  bindLogin();
}
