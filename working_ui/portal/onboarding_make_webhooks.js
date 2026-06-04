/**
 * Optional Make.com webhooks on onboarding form submit (job + health).
 * Vercel build injects %%ONBOARDING_*_MAKE_URL%% from env; override via window.* before load.
 */
(function (global) {
  "use strict";

  if (
    typeof global.PORTAL_ONBOARDING_JOB_MAKE_WEBHOOK_URL !== "string" ||
    !String(global.PORTAL_ONBOARDING_JOB_MAKE_WEBHOOK_URL).trim()
  ) {
    global.PORTAL_ONBOARDING_JOB_MAKE_WEBHOOK_URL = "%%ONBOARDING_JOB_MAKE_URL%%";
  }
  if (
    typeof global.PORTAL_ONBOARDING_HEALTH_MAKE_WEBHOOK_URL !== "string" ||
    !String(global.PORTAL_ONBOARDING_HEALTH_MAKE_WEBHOOK_URL).trim()
  ) {
    global.PORTAL_ONBOARDING_HEALTH_MAKE_WEBHOOK_URL = "%%ONBOARDING_HEALTH_MAKE_URL%%";
  }

  function cleanUrl(value) {
    var url = String(value || "").trim();
    if (!/^https?:\/\//i.test(url)) return "";
    if (url.indexOf("%%") >= 0) return "";
    return url;
  }

  function webhookUrl(formType) {
    if (formType === "job") {
      return cleanUrl(global.PORTAL_ONBOARDING_JOB_MAKE_WEBHOOK_URL);
    }
    return cleanUrl(global.PORTAL_ONBOARDING_HEALTH_MAKE_WEBHOOK_URL);
  }

  function buildBody(formType, sessionId, staffName, payload) {
    var portal = payload._portal && typeof payload._portal === "object" ? payload._portal : {};
    var submittedAt = portal.submitted_at || new Date().toISOString();
    var body = {
      source: formType === "job"
        ? "portal-onboarding-job-application"
        : "portal-onboarding-health-questionnaire",
      form_type: formType,
      applicant_session_id: sessionId,
      staff_session_id: sessionId,
      portal_staff_name: staffName,
      submitted_at: submittedAt,
      payload: payload,
    };
    Object.keys(payload).forEach(function (key) {
      if (key !== "_portal") body[key] = payload[key];
    });
    return body;
  }

  global.portalOnboardingMakeWebhookPost = function portalOnboardingMakeWebhookPost(
    formType,
    sessionId,
    staffName,
    payload,
  ) {
    var url = webhookUrl(formType);
    if (!url) return Promise.resolve();
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(formType, sessionId, staffName, payload)),
      mode: "cors",
      keepalive: true,
    }).catch(function (err) {
      console.warn("[onboarding-make-webhook]", formType, err);
    });
  };
})(typeof window !== "undefined" ? window : globalThis);
