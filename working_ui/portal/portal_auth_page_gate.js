/**
 * Hide dashboard chrome until Supabase auth is ready; keep login as an isolated screen.
 * Load synchronously in <head> on login + dashboard pages.
 */
(function (global) {
  "use strict";

  var doc = global.document;
  if (!doc || !doc.documentElement) return;

  var path = String((global.location && global.location.pathname) || "").toLowerCase();
  var isLogin = /(?:^|\/)login(?:\.html)?(?:$|[?#])/.test(path) || !!doc.getElementById("login-form");
  var isDashboard =
    /staff_dashboard|lead_dashboard|admin_dashboard|ceo_dashboard|office_portal|cs_cliq|portal_choose/i.test(path);

  var STYLE_ID = "portal-auth-page-gate-css";

  function injectStyles(css) {
    if (doc.getElementById(STYLE_ID)) return;
    var el = doc.createElement("style");
    el.id = STYLE_ID;
    el.textContent = css;
    (doc.head || doc.documentElement).appendChild(el);
  }

  if (isLogin) {
    doc.documentElement.classList.add("portal-page-login");
    injectStyles(
      "html.portal-page-login,html.portal-page-login body{" +
        "min-height:100%;min-height:100dvh;margin:0;background:#f4f8fb!important;" +
        "overflow-x:hidden;overflow-y:auto;" +
        "}" +
        "html.portal-page-login body{" +
        "position:relative;isolation:isolate;" +
        "}" +
        "html.portal-page-login body::before{" +
        "content:'';position:fixed;inset:0;z-index:0;pointer-events:none;" +
        "background:linear-gradient(180deg,#f7fbff 0%,#edf4fb 100%);" +
        "}" +
        "html.portal-page-login .login-wrap{position:relative;z-index:1;}" +
        "html.portal-page-login .portal-dashboard-bleed{" +
        "display:none!important;visibility:hidden!important;" +
        "}"
    );
    global.addEventListener("pageshow", function (ev) {
      if (ev && ev.persisted) {
        try {
          global.location.reload();
        } catch (_r) {}
      }
    });
    return;
  }

  if (!isDashboard) return;

  doc.documentElement.classList.add("portal-page-dashboard-gated");
  injectStyles(
    "html.portal-page-dashboard-gated:not(.portal-auth-ready) body{" +
      "visibility:hidden!important;background:#edf4fb;" +
      "}" +
      "html.portal-page-dashboard-gated:not(.portal-auth-ready) .admin-shell," +
      "html.portal-page-dashboard-gated:not(.portal-auth-ready) .lead-dashboard," +
      "html.portal-page-dashboard-gated:not(.portal-auth-ready) #page{" +
      "opacity:0!important;pointer-events:none!important;" +
      "}"
  );

  function markReady() {
    doc.documentElement.classList.add("portal-auth-ready");
  }

  global.addEventListener("portal:supabase-ready", markReady, { once: true });

  global.addEventListener(
    "portal:auth-gate-release",
    markReady,
    { once: true }
  );

  /* Safety: never leave a blank screen if bootstrap hangs >6s on public pages. */
  global.setTimeout(function () {
    if (!doc.documentElement.classList.contains("portal-auth-ready")) {
      markReady();
    }
  }, 6000);
})(typeof window !== "undefined" ? window : globalThis);
