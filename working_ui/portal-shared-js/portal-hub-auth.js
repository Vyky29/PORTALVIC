/**
 * Thin auth helper for portal-* expense/forms (loads ESM auth-handler from same folder).
 */
(function () {
  if (typeof window === "undefined") return;
  var loaded = false;

  window.portalHubRequireUser = function portalHubRequireUser() {
    if (window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session) {
      return Promise.resolve({
        supabase: window.__PORTAL_SUPABASE__.client,
        session: window.__PORTAL_SUPABASE__.session,
        profile: window.__PORTAL_SUPABASE__.staff_profile,
      });
    }
    var base =
      (window.PORTAL_SHARED_JS_BASE && String(window.PORTAL_SHARED_JS_BASE).replace(/\/$/, "")) ||
      "/portal-shared-js";
    var modUrl = base + "/auth-handler.js?v=20260525-portal-hub";
    if (loaded && typeof window.bootstrapDashboardSupabase === "function") {
      return window.bootstrapDashboardSupabase({ requireProfile: true });
    }
    return import(modUrl)
      .then(function (m) {
        loaded = true;
        if (typeof m.bootstrapDashboardSupabase === "function") {
          return m.bootstrapDashboardSupabase({ requireProfile: true });
        }
        if (typeof m.getSupabaseClient === "function") {
          return m.getSupabaseClient().then(function (client) {
            return { supabase: client, session: null, profile: null };
          });
        }
        throw new Error("auth-handler missing bootstrapDashboardSupabase");
      });
  };
})();
