/**
 * Michelle-only onboarding entry points on admin_dashboard.html
 * (home shell for programme leads). Shows Job + Health links until complete.
 */
(function (global) {
  "use strict";

  var BANNER_ID = "portalOnboardingAdminBanner";
  var statusCache = { job: false, health: false, loaded: false };

  function supabaseUrl() {
    try {
      var box = global.__PORTAL_SUPABASE__;
      if (box && box.url) return String(box.url).replace(/\/$/, "");
    } catch (_) {}
    return "https://cklpnwhlqsulpmkipmqb.supabase.co";
  }

  function anonKey() {
    try {
      var box = global.__PORTAL_SUPABASE__;
      if (box && box.anonKey) return String(box.anonKey);
    } catch (_) {}
    return "";
  }

  async function authToken() {
    try {
      var box = global.__PORTAL_SUPABASE__;
      var client = box && box.client;
      if (!client || !client.auth || typeof client.auth.getSession !== "function") return "";
      var res = await client.auth.getSession();
      return (res && res.data && res.data.session && res.data.session.access_token) || "";
    } catch (_) {
      return "";
    }
  }

  function formUrl(path) {
    var u = String(path || "").trim();
    if (typeof global.portalResolveOnboardingFormUrl === "function") {
      u = global.portalResolveOnboardingFormUrl(u);
    }
    if (!u) u = "onboarding_job_application.html";
    if (/from=admin/i.test(u)) return u;
    return u + (u.indexOf("?") >= 0 ? "&" : "?") + "from=admin";
  }

  function injectStyleOnce() {
    if (global.document.getElementById("portalOnboardingAdminBannerStyle")) return;
    var css =
      "#" +
      BANNER_ID +
      "{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:1200;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:14px;background:#173247;color:#fff;box-shadow:0 10px 30px rgba(15,23,42,.28);font-size:13px;line-height:1.35;max-width:640px;margin:0 auto}" +
      "#" +
      BANNER_ID +
      " .portal-ob-admin-banner__copy{min-width:0;flex:1 1 180px;overflow-wrap:break-word}" +
      "#" +
      BANNER_ID +
      " .portal-ob-admin-banner__actions{display:flex;flex-wrap:wrap;gap:8px;flex:0 0 auto}" +
      "#" +
      BANNER_ID +
      " a.portal-ob-admin-banner__btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 12px;border-radius:999px;background:#2d84b3;color:#fff;text-decoration:none;font-weight:700;white-space:nowrap}" +
      "#" +
      BANNER_ID +
      " a.portal-ob-admin-banner__btn--ghost{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24)}" +
      "@media(min-width:900px){#" +
      BANNER_ID +
      "{left:auto;right:16px;bottom:16px;width:min(420px,calc(100vw - 32px))}}";
    var st = global.document.createElement("style");
    st.id = "portalOnboardingAdminBannerStyle";
    st.textContent = css;
    global.document.head.appendChild(st);
  }

  function removeBanner() {
    var el = global.document && global.document.getElementById(BANNER_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function renderBanner() {
    if (!global.document || !global.document.body) return;
    if (!statusCache.loaded) return;
    if (statusCache.job && statusCache.health) {
      removeBanner();
      return;
    }
    injectStyleOnce();
    var existing = global.document.getElementById(BANNER_ID);
    if (!existing) {
      existing = global.document.createElement("div");
      existing.id = BANNER_ID;
      global.document.body.appendChild(existing);
    }
    var chips = [];
    if (!statusCache.job) chips.push("Job application");
    if (!statusCache.health) chips.push("Health questionnaire");
    var actions = "";
    if (!statusCache.job) {
      actions +=
        '<a class="portal-ob-admin-banner__btn" href="' +
        formUrl(global.PORTAL_ONBOARDING_JOB_URL || "onboarding_job_application.html") +
        '">Job application</a>';
    }
    if (!statusCache.health) {
      actions +=
        '<a class="portal-ob-admin-banner__btn" href="' +
        formUrl(global.PORTAL_ONBOARDING_HEALTH_URL || "onboarding_health_questionnaire.html") +
        '">Health form</a>';
    }
    if (statusCache.job || statusCache.health) {
      actions +=
        '<a class="portal-ob-admin-banner__btn portal-ob-admin-banner__btn--ghost" href="' +
        formUrl(global.PORTAL_ONBOARDING_JOB_URL || "onboarding_job_application.html") +
        '">Open forms</a>';
    }
    existing.innerHTML =
      '<div class="portal-ob-admin-banner__copy"><strong>Onboarding pending:</strong> ' +
      chips.join(" · ") +
      "</div><div class=\"portal-ob-admin-banner__actions\">" +
      actions +
      "</div>";
  }

  async function syncBanner() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = box.staff_profile;
      var email = "";
      if (box.session && box.session.user && box.session.user.email) {
        email = String(box.session.user.email);
      }
      if (typeof global.portalOnboardingApplicantIs !== "function") {
        removeBanner();
        return;
      }
      if (!global.portalOnboardingApplicantIs(profile, email)) {
        removeBanner();
        return;
      }
      statusCache.loaded = false;
      var token = await authToken();
      if (token) {
        try {
          var res = await fetch(supabaseUrl() + "/functions/v1/portal-staff-onboarding-status", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
              apikey: anonKey(),
            },
            body: "{}",
          });
          var body = await res.json().catch(function () {
            return {};
          });
          if (res.ok && body && body.ok) {
            statusCache.job = !!body.job;
            statusCache.health = !!body.health;
          }
        } catch (_) {}
      }
      statusCache.loaded = true;
      renderBanner();
    } catch (_) {}
  }

  if (global.addEventListener) {
    global.addEventListener("portal:supabase-ready", function () {
      void syncBanner();
    });
    global.addEventListener("focus", function () {
      void syncBanner();
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
