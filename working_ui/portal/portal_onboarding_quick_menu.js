/**
 * Quick menu — onboarding applicant (Michelle): Job application + Health questionnaire
 * at top until complete, then Settings (same pattern as Portal Guide).
 */
(function (global) {
  "use strict";

  /** Production allowlist — email on Portal auth session. */
  var ONBOARDING_APPLICANT_EMAILS = {
    "michelle@youtimecounselling.com": true,
  };

  var JOB_TOP = "quickMenuOnboardingJobTop";
  var HEALTH_TOP = "quickMenuOnboardingHealthTop";
  var JOB_SETTINGS = "quickMenuOnboardingJobSettings";
  var HEALTH_SETTINGS = "quickMenuOnboardingHealthSettings";

  var statusCache = { job: false, health: false, loaded: false };

  function normEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function portalPreviewTeflon() {
    try {
      var qs = new URLSearchParams(global.location.search || "");
      return String(qs.get("portalPreview") || "").trim().toLowerCase() === "teflon";
    } catch (_) {
      return false;
    }
  }

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
    var email = normEmail(authEmail);
    if (email && ONBOARDING_APPLICANT_EMAILS[email]) return true;
    if (portalPreviewTeflon()) {
      var key = rosterKeyFromProfile(profile, authEmail);
      return key === "teflon";
    }
    return false;
  };

  function resolveUrl(pathOrUrl) {
    if (typeof global.portalResolveOnboardingFormUrl === "function") {
      return global.portalResolveOnboardingFormUrl(pathOrUrl);
    }
    var u = String(pathOrUrl || "").trim();
    return u || "onboarding_job_application.html";
  }

  function jobUrl() {
    return resolveUrl(global.PORTAL_ONBOARDING_JOB_URL || "onboarding_job_application.html");
  }

  function healthUrl() {
    return resolveUrl(global.PORTAL_ONBOARDING_HEALTH_URL || "onboarding_health_questionnaire.html");
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

  function hideAllOnboardingButtons() {
    var jobTop = global.document && global.document.getElementById(JOB_TOP);
    var healthTop = global.document && global.document.getElementById(HEALTH_TOP);
    var jobSet = global.document && global.document.getElementById(JOB_SETTINGS);
    var healthSet = global.document && global.document.getElementById(HEALTH_SETTINGS);
    [jobTop, healthTop, jobSet, healthSet].forEach(function (b) {
      setBtn(b, false);
    });
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

    if (!isApplicant || !statusCache.loaded) {
      hideAllOnboardingButtons();
      return;
    }

    setBtn(jobTop, !statusCache.job);
    setBtn(healthTop, !statusCache.health);
    setBtn(jobSet, statusCache.job);
    setBtn(healthSet, statusCache.health);

    var jUrl = jobUrl();
    var hUrl = healthUrl();
    if (jobTop) jobTop.setAttribute("data-portal-external-url", jUrl);
    if (healthTop) healthTop.setAttribute("data-portal-external-url", hUrl);
    if (jobSet) jobSet.setAttribute("data-portal-external-url", jUrl);
    if (healthSet) healthSet.setAttribute("data-portal-external-url", hUrl);
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

      statusCache.loaded = false;
      hideAllOnboardingButtons();

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
      if (path.indexOf("staff_dashboard") < 0 && path.indexOf("lead_dashboard") < 0) return;
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
