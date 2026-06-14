/**
 * Shared bootstrap + save helpers for onboarding applicant forms (Portal session).
 */
(function (global) {
  "use strict";

  function portalUrl() {
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
    try {
      if (global.SUPABASE_ANON_KEY) return String(global.SUPABASE_ANON_KEY);
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

  function staffDisplayName() {
    try {
      var prof = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile;
      if (prof && prof.full_name) return String(prof.full_name).trim();
    } catch (_) {}
    return "";
  }

  function staffSessionId() {
    try {
      var box = global.__PORTAL_SUPABASE__;
      if (box && box.session && box.session.user && box.session.user.id) {
        return String(box.session.user.id);
      }
    } catch (_) {}
    return "";
  }

  async function ensurePortalSession() {
    if (global.__portalOnboardingFormReady) await global.__portalOnboardingFormReady;
    var token = await authToken();
    if (!token) {
      for (var attempt = 0; attempt < 8 && !token; attempt++) {
        await new Promise(function (r) {
          setTimeout(r, 400);
        });
        token = await authToken();
      }
    }
    if (!token) {
      var dest = "login.html";
      try {
        var login = new URL("login.html", global.location.href);
        login.searchParams.set("next", global.location.href);
        dest = login.href;
      } catch (_) {
        dest =
          "login.html?next=" + encodeURIComponent(global.location.pathname + global.location.search);
      }
      global.location.href = dest;
      return null;
    }
    try {
      await edgePost("portal-staff-onboarding-session-touch", {
        portal_staff_name: staffDisplayName(),
      });
    } catch (_) {}
    return token;
  }

  async function edgePost(path, body) {
    var token = await authToken();
    if (!token) throw new Error("not_signed_in");
    var res = await fetch(portalUrl() + "/functions/v1/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: anonKey(),
      },
      body: JSON.stringify(body || {}),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !data || data.ok === false) {
      var err = new Error((data && data.error) || "request_failed");
      err.code = String((data && data.error) || "request_failed");
      err.httpStatus = res.status;
      throw err;
    }
    return data;
  }

  function localJobDraftKey() {
    var sid = staffSessionId();
    return sid ? "portal_job_application_draft_v1_" + sid : "";
  }

  function localHealthDraftKey() {
    var sid = staffSessionId();
    return sid ? "portal_health_questionnaire_draft_v1_" + sid : "";
  }

  function readLocalJobDraft() {
    var key = localJobDraftKey();
    if (!key) return null;
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocalJobDraft(payload) {
    var key = localJobDraftKey();
    if (!key) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ payload: payload || {}, updated_at: new Date().toISOString() })
      );
    } catch (_) {}
  }

  function readLocalHealthDraft() {
    var key = localHealthDraftKey();
    if (!key) return null;
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function writeLocalHealthDraft(payload) {
    var key = localHealthDraftKey();
    if (!key) return;
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ payload: payload || {}, updated_at: new Date().toISOString() })
      );
    } catch (_) {}
  }

  function isHealthBackendMissing(err) {
    return (
      err &&
      (err.code === "table_missing" ||
        err.code === "load_failed" ||
        err.code === "save_failed" ||
        err.httpStatus === 500)
    );
  }

  function isOnboardingBackendMissing(err) {
    return (
      err &&
      (err.code === "onboarding_not_configured" ||
        err.httpStatus === 503 ||
        String(err.message || "").indexOf("onboarding_not_configured") >= 0)
    );
  }

  global.portalOnboardingFormEnsureSession = ensurePortalSession;
  global.portalOnboardingFormStaffName = staffDisplayName;
  global.portalOnboardingFormDashboardUrl = function portalOnboardingFormDashboardUrl() {
    try {
      var qs = new URLSearchParams(global.location.search || "");
      if (String(qs.get("from") || "").trim().toLowerCase() === "lead") {
        return "lead_dashboard.html";
      }
      if (String(qs.get("from") || "").trim().toLowerCase() === "admin") {
        return "admin_dashboard.html";
      }
    } catch (_) {}
    try {
      var prof = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile;
      var route = String((prof && prof.dashboard_route) || "").toLowerCase();
      if (route.indexOf("admin") >= 0) return "admin_dashboard.html";
      var staffRole = String((prof && prof.staff_role) || "").toLowerCase();
      var appRole = String((prof && prof.app_role) || "").toLowerCase();
      if (route.indexOf("lead") >= 0 || staffRole === "lead" || appRole === "lead") {
        return "lead_dashboard.html";
      }
    } catch (_) {}
    return "staff_dashboard.html";
  };
  global.portalOnboardingFormSessionLabel = function portalOnboardingFormSessionLabel() {
    var name = staffDisplayName();
    if (name) return name;
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var email = box.session && box.session.user && box.session.user.email;
      email = String(email || "").trim();
      if (email) return email.split("@")[0];
    } catch (_) {}
    return "";
  };
  global.portalOnboardingFormApplyBackLink = function portalOnboardingFormApplyBackLink() {
    try {
      var el = global.document && global.document.getElementById("obFormBack");
      if (el) el.setAttribute("href", global.portalOnboardingFormDashboardUrl());
    } catch (_) {}
  };
  global.portalOnboardingFormSaveJob = async function (payload, opts) {
    opts = opts || {};
    var name = staffDisplayName();
    if (opts.submit) {
      payload._portal = payload._portal && typeof payload._portal === "object" ? payload._portal : {};
      payload._portal.submitted_at = new Date().toISOString();
    }
    var result;
    try {
      result = await edgePost("portal-staff-onboarding-draft-save", {
        form_type: "job",
        payload: payload,
        portal_staff_name: name,
      });
    } catch (err) {
      if (isOnboardingBackendMissing(err)) {
        writeLocalJobDraft(payload);
        result = { ok: true, source: "local" };
      } else {
        throw err;
      }
    }
    if (opts.submit && typeof global.portalOnboardingMakeWebhookPost === "function") {
      try {
        global.portalOnboardingMakeWebhookPost("job", staffSessionId(), name, payload);
      } catch (_) {}
    }
    return result;
  };
  global.portalOnboardingFormLoadJob = async function () {
    try {
      return await edgePost("portal-staff-onboarding-draft-load", { form_type: "job" });
    } catch (err) {
      if (isOnboardingBackendMissing(err)) {
        var local = readLocalJobDraft();
        return { ok: true, draft: local, source: "local" };
      }
      throw err;
    }
  };
  global.portalOnboardingFormSaveHealth = async function (payload, opts) {
    opts = opts || {};
    var sid = staffSessionId();
    if (!sid) throw new Error("not_signed_in");
    var name = staffDisplayName();
    if (opts.submit) {
      payload._portal = payload._portal && typeof payload._portal === "object" ? payload._portal : {};
      payload._portal.submitted_at = new Date().toISOString();
    }
    var result;
    try {
      result = await edgePost("staff-health-draft-save", {
        staff_session_id: sid,
        staff_name: name,
        payload: payload,
      });
    } catch (err) {
      if (isHealthBackendMissing(err) || isOnboardingBackendMissing(err)) {
        writeLocalHealthDraft(payload);
        result = { ok: true, source: "local" };
      } else {
        throw err;
      }
    }
    if (opts.submit && typeof global.portalOnboardingMakeWebhookPost === "function") {
      try {
        global.portalOnboardingMakeWebhookPost("health", sid, name, payload);
      } catch (_) {}
    }
    return result;
  };
  global.portalOnboardingFormLoadHealth = async function () {
    var sid = staffSessionId();
    if (!sid) throw new Error("not_signed_in");
    try {
      return await edgePost("staff-health-draft-load", { staff_session_id: sid });
    } catch (err) {
      if (isHealthBackendMissing(err) || isOnboardingBackendMissing(err)) {
        var local = readLocalHealthDraft();
        return { ok: true, draft: local, source: "local" };
      }
      throw err;
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
