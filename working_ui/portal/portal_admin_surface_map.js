/**
 * Ops admin surface map — Victor, Raúl, Javi (CEO exec) + Sevitha (ops admin).
 * Mobile vs desktop defaults for admin_dashboard.html CS Cliq + map.
 */
(function (global) {
  "use strict";

  var CEO_PROFILE_KEYS = { victor: true, raul: true, javi: true };
  var OPS_PROFILE_KEYS = { sevitha: true, info: true };

  var MOBILE_MAX_WIDTH = 899;
  var DESKTOP_MIN_WIDTH = 1280;

  function normKey(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function profileRow(prof) {
    return prof || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) || {};
  }

  function profileKey(prof) {
    prof = profileRow(prof);
    if (global.portalInferStaffKey && typeof global.portalInferStaffKey === "function") {
      var k = normKey(global.portalInferStaffKey(prof, ""));
      if (k) return k;
    }
    return normKey(prof.username || String(prof.full_name || "").split(/\s+/)[0]);
  }

  function isCeoExec(prof) {
    prof = profileRow(prof);
    var key = profileKey(prof);
    if (CEO_PROFILE_KEYS[key]) return true;
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsExecutiveCeoTrioMember === "function"
    ) {
      return global.portalDmRoles.portalDmIsExecutiveCeoTrioMember(prof);
    }
    return String(prof.app_role || "").toLowerCase() === "ceo" && CEO_PROFILE_KEYS[key];
  }

  function isOpsAdmin(prof) {
    prof = profileRow(prof);
    var key = profileKey(prof);
    if (OPS_PROFILE_KEYS[key]) return true;
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmIsOperationsAdminProfile === "function"
    ) {
      return global.portalDmRoles.portalDmIsOperationsAdminProfile(prof);
    }
    return String(prof.app_role || "").toLowerCase() === "admin" && !isCeoExec(prof);
  }

  function isOpsSurfaceUser(prof) {
    return isCeoExec(prof) || isOpsAdmin(prof);
  }

  function previewWorkerPortalActive() {
    try {
      var q = new URLSearchParams(global.location.search || "");
      return q.get("portalPreviewWorker") === "1" || q.get("portalStayWorker") === "1";
    } catch (_q) {
      return false;
    }
  }

  function isMobileLayout() {
    try {
      if (global.matchMedia && global.matchMedia("(min-width: " + DESKTOP_MIN_WIDTH + "px)").matches) {
        return false;
      }
      var w = global.innerWidth || global.document.documentElement.clientWidth || 0;
      var h = global.innerHeight || global.document.documentElement.clientHeight || 0;
      if (w <= MOBILE_MAX_WIDTH) return true;
      if (w < DESKTOP_MIN_WIDTH && h <= 640) {
        try {
          if (global.matchMedia("(orientation: landscape)").matches) return true;
        } catch (_land) {}
      }
      return false;
    } catch (_e) {
      return (global.innerWidth || 0) < DESKTOP_MIN_WIDTH;
    }
  }

  /**
   * @returns {{
   *   profileKey: string,
   *   cohort: 'ceo_exec'|'ops_admin'|'other_admin',
   *   layout: 'mobile_compact'|'desktop',
   *   homeDashboard: string,
   *   chatExperience: 'cs_cliq_admin',
   *   csCliq: { defaultChannel: string, showCeoExec: boolean, sendWorkerMessagesAsAdmin: boolean },
   *   mobile: { bottomNavViews: string[], defaultView: string, csCliqStartPane: string },
   *   desktop: { defaultView: string, csCliqStartPane: string }
   * }}
   */
  function resolve(prof) {
    prof = profileRow(prof);
    var key = profileKey(prof);
    var ceo = isCeoExec(prof);
    var ops = isOpsAdmin(prof);
    var mobile = isMobileLayout();
    var cohort = ceo ? "ceo_exec" : ops ? "ops_admin" : "other_admin";

    var mobileDefaultView = ceo ? "staff_live_map" : ops ? "nav_hub" : "dashboard";
    var desktopDefaultView = ceo ? "staff_live_map" : ops ? "operations_admin" : "dashboard";
    var mobileBottomNav = ceo
      ? ["staff_live_map", "fullnav"]
      : ops
        ? ["nav_hub", "operations_admin", "settings"]
        : ["nav_hub", "fullnav"];

    return {
      profileKey: key,
      cohort: cohort,
      layout: mobile ? "mobile_compact" : "desktop",
      homeDashboard: "admin_dashboard.html",
      chatExperience: "cs_cliq_admin",
      csCliq: {
        defaultChannel: "staff_lead",
        showCeoExec: ceo,
        sendWorkerMessagesAsAdmin: ceo,
        opsInboxLabel: "Admin",
        staffChannelLabel: "Staff · Leads",
        ceoExecLabel: "Executive messages",
      },
      mobile: {
        bottomNavViews: mobileBottomNav,
        defaultView: mobileDefaultView,
        csCliqStartPane: "list",
      },
      desktop: {
        defaultView: desktopDefaultView,
        csCliqStartPane: "channels",
      },
    };
  }

  function shouldUseSimplifiedInbox(prof) {
    if (isOpsSurfaceUser(prof)) return false;
    if (
      global.portalDmRoles &&
      typeof global.portalDmRoles.portalDmUsesAdminCliq === "function" &&
      global.portalDmRoles.portalDmUsesAdminCliq(prof)
    ) {
      return false;
    }
    return true;
  }

  /** Ops admin may use staff dashboard (shifts, term, invoices); no redirect to admin only. */
  function shouldRedirectFromWorkerPortal(prof, pathname) {
    if (previewWorkerPortalActive()) return false;
    return false;
  }

  function adminDashboardUrl(surface, opts) {
    opts = opts || {};
    surface = surface || resolve();
    try {
      var u = new URL("admin_dashboard.html", global.location.href);
      var view = String(opts.view || surface.mobile.defaultView || "staff_live_map").trim();
      if (view) {
        u.searchParams.set("view", view);
        u.hash = view;
      }
      if (opts.openCsCliq) {
        u.searchParams.set("view", "cs_cliq");
        u.hash = "cs_cliq";
      }
      return u.href;
    } catch (_u) {
      return "admin_dashboard.html";
    }
  }

  function applyDocumentClasses(prof) {
    prof = profileRow(prof);
    if (!isOpsSurfaceUser(prof)) return resolve(prof);
    var surface = resolve(prof);
    var root = global.document && global.document.documentElement;
    if (!root) return surface;
    root.classList.toggle("portal-admin-surface-mobile", surface.layout === "mobile_compact");
    root.classList.toggle("portal-admin-surface-desktop", surface.layout === "desktop");
    root.classList.remove("portal-admin-surface--ceo_exec", "portal-admin-surface--ops_admin");
    root.classList.add("portal-admin-surface--" + surface.cohort);
    if (global.document.body) {
      global.document.body.dataset.portalAdminSurface = surface.cohort;
      global.document.body.dataset.portalAdminLayout = surface.layout;
    }
    return surface;
  }

  function primeCsCliqBoot(prof) {
    var surface = resolve(prof);
    if (!isOpsSurfaceUser(prof)) return surface;
    if (surface.layout === "mobile_compact") {
      global.__PORTAL_CS_CLIQ_PENDING_PANE = surface.mobile.csCliqStartPane;
    } else {
      global.__PORTAL_CS_CLIQ_PENDING_PANE = surface.desktop.csCliqStartPane;
    }
    global.__PORTAL_ADMIN_DM_CHANNEL = surface.csCliq.defaultChannel;
    return surface;
  }

  function bindLayoutListener(prof) {
    if (global.__PORTAL_ADMIN_SURFACE_LAYOUT_BOUND__) return;
    global.__PORTAL_ADMIN_SURFACE_LAYOUT_BOUND__ = true;
    var last = "";
    function sync() {
      var layout = resolve(prof).layout;
      if (layout === last) return;
      last = layout;
      applyDocumentClasses(prof);
    }
    global.addEventListener("resize", sync, { passive: true });
    global.addEventListener("orientationchange", sync, { passive: true });
  }

  function bootAdminSurface(prof) {
    prof = profileRow(prof);
    if (!isOpsSurfaceUser(prof)) return null;
    var surface = applyDocumentClasses(prof);
    primeCsCliqBoot(prof);
    bindLayoutListener(prof);
    global.__PORTAL_ADMIN_SURFACE__ = surface;
    return surface;
  }

  global.portalAdminSurfaceMap = {
    CEO_PROFILE_KEYS: CEO_PROFILE_KEYS,
    OPS_PROFILE_KEYS: OPS_PROFILE_KEYS,
    resolve: resolve,
    isCeoExec: isCeoExec,
    isOpsAdmin: isOpsAdmin,
    isOpsSurfaceUser: isOpsSurfaceUser,
    isMobileLayout: isMobileLayout,
    shouldUseSimplifiedInbox: shouldUseSimplifiedInbox,
    shouldRedirectFromWorkerPortal: shouldRedirectFromWorkerPortal,
    adminDashboardUrl: adminDashboardUrl,
    applyDocumentClasses: applyDocumentClasses,
    primeCsCliqBoot: primeCsCliqBoot,
    bootAdminSurface: bootAdminSurface,
  };
})(typeof window !== "undefined" ? window : globalThis);
