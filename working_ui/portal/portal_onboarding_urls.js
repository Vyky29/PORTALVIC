/**
 * Onboarding applicant form URLs (Job + Health).
 * Defaults: same Portal origin. Override PORTAL_ONBOARDING_ORIGIN for a separate host.
 */
(function (global) {
  "use strict";

  var JOB_PATH = "onboarding_job_application.html";
  var HEALTH_PATH = "onboarding_health_questionnaire.html";

  function trimSlash(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function resolveFormUrl(pathOrUrl) {
    var u = String(pathOrUrl || "").trim();
    if (!u) return u;
    if (/^https?:\/\//i.test(u)) return u;
    var origin = trimSlash(global.PORTAL_ONBOARDING_ORIGIN);
    if (!origin) {
      try {
        origin = trimSlash(global.location && global.location.origin);
      } catch (_) {
        origin = "";
      }
    }
    if (!origin) return u;
    if (u.charAt(0) !== "/") u = "/" + u;
    return origin + u;
  }

  if (typeof global.PORTAL_ONBOARDING_JOB_URL !== "string") {
    global.PORTAL_ONBOARDING_JOB_URL = JOB_PATH;
  }
  if (typeof global.PORTAL_ONBOARDING_HEALTH_URL !== "string") {
    global.PORTAL_ONBOARDING_HEALTH_URL = HEALTH_PATH;
  }

  global.portalResolveOnboardingFormUrl = resolveFormUrl;
})(typeof window !== "undefined" ? window : globalThis);
