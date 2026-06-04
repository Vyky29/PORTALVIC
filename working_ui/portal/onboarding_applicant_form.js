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
      var ret = encodeURIComponent(global.location.pathname + global.location.search);
      global.location.href = "login.html?portalReturn=" + ret;
      return null;
    }
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
      throw new Error((data && data.error) || "request_failed");
    }
    return data;
  }

  global.portalOnboardingFormEnsureSession = ensurePortalSession;
  global.portalOnboardingFormStaffName = staffDisplayName;
  global.portalOnboardingFormSaveJob = async function (payload, opts) {
    opts = opts || {};
    var name = staffDisplayName();
    if (opts.submit) {
      payload._portal = payload._portal && typeof payload._portal === "object" ? payload._portal : {};
      payload._portal.submitted_at = new Date().toISOString();
    }
    return edgePost("portal-staff-onboarding-draft-save", {
      form_type: "job",
      payload: payload,
      portal_staff_name: name,
    });
  };
  global.portalOnboardingFormLoadJob = async function () {
    return edgePost("portal-staff-onboarding-draft-load", { form_type: "job" });
  };
  global.portalOnboardingFormSaveHealth = async function (payload, opts) {
    opts = opts || {};
    var sid = staffSessionId();
    if (!sid) throw new Error("not_signed_in");
    if (opts.submit) {
      payload._portal = payload._portal && typeof payload._portal === "object" ? payload._portal : {};
      payload._portal.submitted_at = new Date().toISOString();
    }
    return edgePost("staff-health-draft-save", {
      staff_session_id: sid,
      staff_name: staffDisplayName(),
      payload: payload,
    });
  };
  global.portalOnboardingFormLoadHealth = async function () {
    var sid = staffSessionId();
    if (!sid) throw new Error("not_signed_in");
    return edgePost("staff-health-draft-load", { staff_session_id: sid });
  };
})(typeof window !== "undefined" ? window : globalThis);
