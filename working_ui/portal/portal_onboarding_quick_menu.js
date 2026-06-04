/**
 * Quick menu — onboarding applicants (Michelle, Teflon): Job application + Health questionnaire
 * at top until complete, then Settings (same pattern as Portal Guide).
 */
(function (global) {
  "use strict";

  /** First-name roster keys that see onboarding quick-menu promos. */
  var ONBOARDING_APPLICANT_KEYS = { michelle: true, teflon: true };

  var JOB_TOP = "quickMenuOnboardingJobTop";
  var HEALTH_TOP = "quickMenuOnboardingHealthTop";
  var JOB_SETTINGS = "quickMenuOnboardingJobSettings";
  var HEALTH_SETTINGS = "quickMenuOnboardingHealthSettings";

  var statusCache = { job: false, health: false, loaded: false };

  function normKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function rosterKeyFromProfile(profile, authEmail) {
    if (typeof global.portalInferStaffKey === "function") {
      var k = global.portalInferStaffKey(profile || {}, authEmail || "");
      if (k) return normKey(k);
    }
    if (typeof global.portalCanonicalStaffRosterKey === "function") {
      var c = global.portalCanonicalStaffRosterKey(
        (profile && profile.username) || (authEmail || "").split("@")[0]
      );
      if (c) return normKey(c);
    }
    var raw = String((profile && profile.full_name) || (profile && profile.username) || "").trim();
    return normKey(raw.split(/\s+/)[0] || raw);
  }

  global.portalOnboardingApplicantIs = function portalOnboardingApplicantIs(profile, authEmail) {
    var key = rosterKeyFromProfile(profile, authEmail);
    return !!(key && ONBOARDING_APPLICANT_KEYS[key]);
  };

  function jobUrl() {
    var u = String(global.PORTAL_ONBOARDING_JOB_URL || "onboarding_job_application.html").trim();
    return u || "onboarding_job_application.html";
  }

  function healthUrl() {
    var u = String(global.PORTAL_ONBOARDING_HEALTH_URL || "onboarding_health_questionnaire.html").trim();
    return u || "onboarding_health_questionnaire.html";
  }

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

  function setBtn(btn, show) {
    if (!btn) return;
    btn.hidden = !show;
    btn.setAttribute("aria-hidden", show ? "false" : "true");
  }

  global.portalOnboardingHasTopPromo = function portalOnboardingHasTopPromo() {
    if (!statusCache.loaded) return false;
    var jobTop = global.document && global.document.getElementById(JOB_TOP);
    var healthTop = global.document && global.document.getElementById(HEALTH_TOP);
    return !!(jobTop && !jobTop.hidden) || !!(healthTop && !healthTop.hidden);
  };

  function applyVisibility(isApplicant) {
    var jobTop = global.document && global.document.getElementById(JOB_TOP);
    var healthTop = global.document && global.document.getElementById(HEALTH_TOP);
    var jobSet = global.document && global.document.getElementById(JOB_SETTINGS);
    var healthSet = global.document && global.document.getElementById(HEALTH_SETTINGS);

    if (!isApplicant) {
      [jobTop, healthTop, jobSet, healthSet].forEach(function (b) {
        setBtn(b, false);
      });
      return;
    }

    setBtn(jobTop, !statusCache.job);
    setBtn(healthTop, !statusCache.health);
    setBtn(jobSet, statusCache.job);
    setBtn(healthSet, statusCache.health);

    if (jobTop) jobTop.setAttribute("data-portal-external-url", jobUrl());
    if (healthTop) healthTop.setAttribute("data-portal-external-url", healthUrl());
    if (jobSet) jobSet.setAttribute("data-portal-external-url", jobUrl());
    if (healthSet) healthSet.setAttribute("data-portal-external-url", healthUrl());
  }

  global.portalSyncOnboardingQuickMenu = async function portalSyncOnboardingQuickMenu(opts) {
    opts = opts || {};
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var profile = opts.profile || box.staff_profile;
      var email = opts.authEmail || "";
      if (!email && box.session && box.session.user && box.session.user.email) {
        email = String(box.session.user.email);
      }

      var isApplicant = global.portalOnboardingApplicantIs(profile, email);
      if (!isApplicant) {
        statusCache.loaded = true;
        applyVisibility(false);
        if (typeof global.portalSyncQuickMenuGuidePlacement === "function") {
          global.portalSyncQuickMenuGuidePlacement();
        }
        return;
      }

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
      applyVisibility(true);

      if (typeof global.portalSyncQuickMenuGuidePlacement === "function") {
        global.portalSyncQuickMenuGuidePlacement();
      }
    } catch (_) {}
  };

  function bindDashboard() {
    try {
      var path = String((global.location && global.location.pathname) || "").toLowerCase();
      if (path.indexOf("staff_dashboard") < 0) return;
      void global.portalSyncOnboardingQuickMenu();
    } catch (_) {}
  }

  if (global.addEventListener) {
    global.addEventListener("portal:supabase-ready", function () {
      void global.portalSyncOnboardingQuickMenu();
    });
    global.addEventListener("portal:guide-read", function () {
      if (typeof global.portalSyncQuickMenuGuidePlacement === "function") {
        global.portalSyncQuickMenuGuidePlacement();
      }
    });
    global.addEventListener("focus", function () {
      void global.portalSyncOnboardingQuickMenu();
    });
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", bindDashboard);
    } else {
      bindDashboard();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
