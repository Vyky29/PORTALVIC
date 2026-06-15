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
  var LOADER_ID = "portal-auth-page-gate-loader";

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
      "visibility:visible!important;background:#edf4fb;" +
      "}" +
    "html.portal-page-dashboard-gated:not(.portal-auth-ready) .admin-shell," +
    "html.portal-page-dashboard-gated:not(.portal-auth-ready) .lead-dashboard," +
    "html.portal-page-dashboard-gated:not(.portal-auth-ready) #page{" +
      "opacity:0!important;pointer-events:none!important;" +
      "}" +
    "#" +
      LOADER_ID +
      "{" +
      "position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:14px;background:#edf4fb;" +
      "font:600 14px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;color:#1e3a5f;" +
      "}" +
    "html.portal-auth-ready #" +
      LOADER_ID +
      "{display:none!important;}" +
    "#" +
      LOADER_ID +
      " .portal-auth-gate-spinner{" +
      "width:36px;height:36px;border:3px solid #c5d9ea;border-top-color:#2563eb;" +
      "border-radius:50%;animation:portalAuthGateSpin .75s linear infinite;" +
      "}" +
    "@keyframes portalAuthGateSpin{to{transform:rotate(360deg);}}"
  );

  function showLoader() {
    if (doc.getElementById(LOADER_ID)) return;
    var el = doc.createElement("div");
    el.id = LOADER_ID;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-busy", "true");
    el.innerHTML =
      '<div class="portal-auth-gate-spinner" aria-hidden="true"></div>' +
      "<span>Loading portal…</span>";
    (doc.body || doc.documentElement).appendChild(el);
  }

  if (doc.body) showLoader();
  else doc.addEventListener("DOMContentLoaded", showLoader, { once: true });

  function markReady() {
    doc.documentElement.classList.add("portal-auth-ready");
    var loader = doc.getElementById(LOADER_ID);
    if (loader) {
      loader.setAttribute("aria-busy", "false");
    }
  }

  global.addEventListener("portal:supabase-ready", markReady, { once: true });

  global.addEventListener(
    "portal:auth-gate-release",
    markReady,
    { once: true }
  );

  /* Safety: never leave a blank screen if bootstrap hangs on slow networks. */
  global.setTimeout(function () {
    if (!doc.documentElement.classList.contains("portal-auth-ready")) {
      markReady();
    }
  }, 12000);
})(typeof window !== "undefined" ? window : globalThis);
