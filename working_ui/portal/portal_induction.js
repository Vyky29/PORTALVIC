/**
 * General Induction (clubsensational-induction-provisional) ↔ PORTALVIC staff/lead dashboards.
 */
(function (global) {
  var MODULES = 6;
  var COMPLETE_KEY = "provisional-induction-training-complete";
  var COMPLETED_AT_KEY = "provisional-induction-completed-at";
  var GRANDFATHER_ISSUED_KEY = "portalvic_induction_grandfather_issued_iso";
  var LEARNER_NAME_KEY = "portalvic_staff_display_name";

  /** Must complete the full pathway in-app (Zoho alumni already trained). */
  var REQUIRED_ROSTER_KEYS = { alex: true, michelle: true, carlos: true };
  var REQUIRED_FIRST_NAMES = { alex: true, michelle: true, carlos: true };

  function normKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function firstNameFromProfile(profile) {
    var raw = String((profile && profile.full_name) || (profile && profile.username) || "").trim();
    if (!raw) return "";
    return normKey(raw.split(/\s+/)[0] || "");
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
    return firstNameFromProfile(profile);
  }

  function portalInductionMustComplete(profile, authEmail) {
    var key = rosterKeyFromProfile(profile, authEmail);
    if (key && REQUIRED_ROSTER_KEYS[key]) return true;
    var fn = firstNameFromProfile(profile);
    return !!(fn && REQUIRED_FIRST_NAMES[fn]);
  }

  function displayNameFromProfile(profile, authEmail) {
    if (typeof global.portalTopbarDisplayNameFromAuth === "function") {
      var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
      var n = global.portalTopbarDisplayNameFromAuth(profile, sess);
      if (n && String(n).trim()) return String(n).trim();
    }
    return String((profile && profile.full_name) || (profile && profile.username) || "").trim();
  }

  function setModulePassed(n) {
    try {
      global.localStorage.setItem(
        "provisional-induction-module-" + n,
        JSON.stringify({ journey: true, video: true, quizPass: true })
      );
    } catch (_e) {}
  }

  function portalInductionApplyGrandfather(profile, authEmail) {
    if (portalInductionMustComplete(profile, authEmail)) return false;
    try {
      global.localStorage.setItem(COMPLETE_KEY, "1");
      if (!global.localStorage.getItem(COMPLETED_AT_KEY)) {
        var issued =
          global.localStorage.getItem(GRANDFATHER_ISSUED_KEY) ||
          "2026-05-01T12:00:00.000Z";
        global.localStorage.setItem(COMPLETED_AT_KEY, issued);
        global.localStorage.setItem(GRANDFATHER_ISSUED_KEY, issued);
      }
      for (var i = 1; i <= MODULES; i++) setModulePassed(i);
      var name = displayNameFromProfile(profile, authEmail);
      if (name) {
        global.localStorage.setItem(LEARNER_NAME_KEY, name);
        global.sessionStorage.setItem(LEARNER_NAME_KEY, name);
      }
    } catch (_e2) {}
    return true;
  }

  function portalInductionIsComplete(profile, authEmail) {
    if (!portalInductionMustComplete(profile, authEmail)) return true;
    try {
      if (global.localStorage.getItem(COMPLETE_KEY) === "1") return true;
    } catch (_e) {}
    for (var i = 1; i <= MODULES; i++) {
      try {
        var s = JSON.parse(global.localStorage.getItem("provisional-induction-module-" + i) || "{}");
        if (!s.quizPass) return false;
      } catch (_e2) {
        return false;
      }
    }
    return true;
  }

  function portalInductionBaseUrl() {
    var custom = String(global.PORTAL_INDUCTION_BASE_URL || "").trim();
    if (custom) return custom.replace(/\/?$/, "/");
    return String(global.location.origin || "") + "/general-induction/";
  }

  function portalInductionPrepareLearnerName(profile, authEmail) {
    var name = displayNameFromProfile(profile, authEmail);
    if (!name) return;
    try {
      global.localStorage.setItem(LEARNER_NAME_KEY, name);
      global.sessionStorage.setItem(LEARNER_NAME_KEY, name);
      global.portalVicLearner = { displayName: name, name: name, fullName: name };
    } catch (_e) {}
  }

  function portalInductionOpen(profile, authEmail) {
    portalInductionPrepareLearnerName(profile, authEmail);
    portalInductionApplyGrandfather(profile, authEmail);
    var url;
    try {
      url = new URL(portalInductionBaseUrl(), global.location.href);
    } catch (_e) {
      url = { href: "/general-induction/", searchParams: { set: function () {}, toString: function () { return ""; } } };
      global.location.href = "/general-induction/";
      return;
    }
    var name = displayNameFromProfile(profile, authEmail);
    if (name) url.searchParams.set("learnerName", name);
    if (!portalInductionMustComplete(profile, authEmail)) {
      url.searchParams.set("portalGrandfathered", "1");
    }
    try {
      global.localStorage.setItem("portalLastDashboardUrl", String(global.location.href || ""));
    } catch (_e2) {}
    global.location.href = url.href;
  }

  function portalInductionSyncQuickMenu(btn, profile, authEmail) {
    if (!btn) return;
    portalInductionApplyGrandfather(profile, authEmail);
    var must = portalInductionMustComplete(profile, authEmail);
    var done = portalInductionIsComplete(profile, authEmail);
    btn.disabled = false;
    btn.removeAttribute("disabled");
    btn.classList.remove("menu-btn--portal-pending");
    btn.setAttribute("aria-disabled", "false");
    var sub = btn.querySelector(".menu-btn-sub");
    if (sub) {
      if (must && !done) sub.textContent = "Core company training — start here";
      else if (must && done) sub.textContent = "Completed — view pathway or certificate";
      else sub.textContent = "Completed — certificate in My documents";
    }
    if (done) btn.classList.add("menu-btn--induction-done");
    else btn.classList.remove("menu-btn--induction-done");
    btn.setAttribute(
      "aria-label",
      done ? "Induction — completed" : "Induction — core company training"
    );
  }

  function portalInductionBindDashboard(opts) {
    var profile = (opts && opts.profile) || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile);
    var email = (opts && opts.authEmail) || "";
    if (!email) {
      var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
      email = sess && sess.user && sess.user.email ? String(sess.user.email) : "";
    }
    portalInductionApplyGrandfather(profile, email);
    portalInductionSyncQuickMenu(global.document.getElementById("quickMenuInduction"), profile, email);
  }

  function portalInductionGetCertificateMeta(profile, authEmail) {
    if (!portalInductionIsComplete(profile, authEmail)) return null;
    var issuedIso = "";
    try {
      issuedIso =
        global.localStorage.getItem(COMPLETED_AT_KEY) ||
        global.localStorage.getItem(GRANDFATHER_ISSUED_KEY) ||
        "";
    } catch (_e) {}
    var name = displayNameFromProfile(profile, authEmail);
    if (!name) return null;
    return {
      id: "portal-induction-certificate",
      title: "clubSENsational General Induction Certificate",
      document_type: "induction_certificate",
      category: "training",
      created_at: issuedIso || new Date().toISOString(),
      related_date: (issuedIso || new Date().toISOString()).slice(0, 10),
      file_url: "",
      source_page: "general-induction",
      learnerName: name,
    };
  }

  global.portalInductionMustComplete = portalInductionMustComplete;
  global.portalInductionIsComplete = portalInductionIsComplete;
  global.portalInductionApplyGrandfather = portalInductionApplyGrandfather;
  global.portalInductionOpen = portalInductionOpen;
  global.portalInductionBindDashboard = portalInductionBindDashboard;
  global.portalInductionGetCertificateMeta = portalInductionGetCertificateMeta;
  global.portalInductionDisplayName = displayNameFromProfile;
})(typeof window !== "undefined" ? window : globalThis);
