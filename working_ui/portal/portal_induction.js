/**
 * General Induction (clubsensational-induction-provisional) ↔ PORTALVIC staff/lead dashboards.
 */
(function (global) {
  var MODULES = 6;
  var COMPLETE_KEY = "provisional-induction-training-complete";
  var COMPLETED_AT_KEY = "provisional-induction-completed-at";
  var GRANDFATHER_ISSUED_KEY = "portalvic_induction_grandfather_issued_iso";
  var LEARNER_NAME_KEY = "portalvic_staff_display_name";
  var CERT_PDF_DOWNLOADED_KEY = "portalvic_induction_certificate_pdf_downloaded";

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

  /** Name for certificate PDF/SVG — profile, storage, then explicit fallback. */
  function portalResolveInductionLearnerName(fallback) {
    var fb = String(fallback || "").trim();
    if (fb) return fb;
    try {
      var stored =
        global.localStorage.getItem(LEARNER_NAME_KEY) || global.sessionStorage.getItem(LEARNER_NAME_KEY);
      if (stored && String(stored).trim()) return String(stored).trim();
    } catch (_e) {}
    var box = global.__PORTAL_SUPABASE__;
    var profile = box && box.staff_profile;
    var email = "";
    var sess = box && box.session;
    if (sess && sess.user && sess.user.email) email = String(sess.user.email);
    return displayNameFromProfile(profile, email);
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

  function portalInductionModulesAllPassed() {
    for (var i = 1; i <= MODULES; i++) {
      try {
        var s = JSON.parse(global.localStorage.getItem("provisional-induction-module-" + i) || "{}");
        if (!s.quizPass) return false;
      } catch (_e) {
        return false;
      }
    }
    return true;
  }

  /** Stale Zoho-era / grandfather flags must not skip induction for Alex, Michelle, Carlos. */
  function portalInductionLooksGrandfatheredComplete() {
    try {
      if (global.localStorage.getItem(COMPLETE_KEY) !== "1") return false;
      var at = String(global.localStorage.getItem(COMPLETED_AT_KEY) || "").trim();
      var gf = String(global.localStorage.getItem(GRANDFATHER_ISSUED_KEY) || "2026-05-01T12:00:00.000Z").trim();
      if (!at) return true;
      if (at === gf || at.indexOf("2026-05-01") === 0) return true;
    } catch (_e) {}
    return false;
  }

  function portalInductionClearGrandfatherStateForRequired(profile, authEmail) {
    if (!portalInductionMustComplete(profile, authEmail)) return;
    if (!portalInductionLooksGrandfatheredComplete() && portalInductionModulesAllPassed()) return;
    if (!portalInductionLooksGrandfatheredComplete() && !portalInductionModulesAllPassed()) {
      try {
        if (global.localStorage.getItem(COMPLETE_KEY) === "1") global.localStorage.removeItem(COMPLETE_KEY);
      } catch (_e) {}
      return;
    }
    try {
      global.localStorage.removeItem(COMPLETE_KEY);
      global.localStorage.removeItem(COMPLETED_AT_KEY);
      global.localStorage.removeItem(CERT_PDF_DOWNLOADED_KEY);
    } catch (_e2) {}
  }

  function portalInductionIsComplete(profile, authEmail) {
    if (!portalInductionMustComplete(profile, authEmail)) {
      try {
        if (global.localStorage.getItem(COMPLETE_KEY) === "1") return true;
      } catch (_e) {}
      return true;
    }
    if (!portalInductionModulesAllPassed()) {
      try {
        if (global.localStorage.getItem(COMPLETE_KEY) === "1") global.localStorage.removeItem(COMPLETE_KEY);
      } catch (_e2) {}
      return false;
    }
    try {
      global.localStorage.setItem(COMPLETE_KEY, "1");
    } catch (_e3) {}
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
    portalInductionClearGrandfatherStateForRequired(profile, authEmail);
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

  function portalInductionCertificatePdfDownloaded() {
    try {
      return global.localStorage.getItem(CERT_PDF_DOWNLOADED_KEY) === "1";
    } catch (_e) {
      return false;
    }
  }

  function portalInductionMarkCertificatePdfDownloaded() {
    try {
      global.localStorage.setItem(CERT_PDF_DOWNLOADED_KEY, "1");
    } catch (_e) {}
    try {
      global.dispatchEvent(new CustomEvent("portal:induction-cert-downloaded"));
    } catch (_e2) {}
  }

  /** Training complete but worker has not opened induction and downloaded the certificate PDF yet. */
  function portalInductionNeedsCertificateDownload(profile, authEmail) {
    if (!portalInductionIsComplete(profile, authEmail)) return false;
    return !portalInductionCertificatePdfDownloaded();
  }

  async function portalInductionTryMarkPdfFromDocuments() {
    if (portalInductionCertificatePdfDownloaded()) return;
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var client = box.client;
      var uid = box.session && box.session.user && box.session.user.id;
      if (!client || !uid || !client.from) return;
      var res = await client
        .from("documents")
        .select("id")
        .eq("user_id", uid)
        .eq("document_type", "induction_certificate")
        .is("hidden_by_user_at", null)
        .limit(1);
      if (res.error || !Array.isArray(res.data) || !res.data.length) return;
      portalInductionMarkCertificatePdfDownloaded();
    } catch (_e) {}
  }

  function portalInductionSyncQuickMenu(btn, profile, authEmail) {
    if (!btn) return;
    portalInductionClearGrandfatherStateForRequired(profile, authEmail);
    portalInductionApplyGrandfather(profile, authEmail);
    var must = portalInductionMustComplete(profile, authEmail);
    var done = portalInductionIsComplete(profile, authEmail);
    var needsCert = portalInductionNeedsCertificateDownload(profile, authEmail);
    btn.disabled = false;
    btn.removeAttribute("disabled");
    btn.classList.remove("menu-btn--portal-pending");
    btn.setAttribute("aria-disabled", "false");
    btn.classList.toggle("menu-btn--induction-cert-pending", needsCert);
    btn.classList.toggle("menu-btn--portal-pulse", needsCert);
    var sub = btn.querySelector(".menu-btn-sub");
    if (sub) {
      if (needsCert) {
        sub.textContent = "Open and download your certificate (PDF)";
      } else if (must && !done) {
        sub.textContent = "Core company training — start here";
      } else if (must && done) {
        sub.textContent = "Completed — certificate in My documents";
      } else {
        sub.textContent = "Completed — certificate in My documents";
      }
    }
    if (done && !needsCert) btn.classList.add("menu-btn--induction-done");
    else btn.classList.remove("menu-btn--induction-done");
    btn.setAttribute(
      "aria-label",
      needsCert
        ? "Induction — download your certificate PDF"
        : done
          ? "Induction — completed"
          : "Induction — core company training"
    );
  }

  function portalInductionBindDashboard(opts) {
    var profile = (opts && opts.profile) || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile);
    var email = (opts && opts.authEmail) || "";
    if (!email) {
      var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
      email = sess && sess.user && sess.user.email ? String(sess.user.email) : "";
    }
    portalInductionClearGrandfatherStateForRequired(profile, email);
    portalInductionApplyGrandfather(profile, email);
    portalInductionSyncQuickMenu(global.document.getElementById("quickMenuInduction"), profile, email);
    void portalInductionTryMarkPdfFromDocuments().then(function () {
      portalInductionSyncQuickMenu(global.document.getElementById("quickMenuInduction"), profile, email);
    });
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
  global.portalResolveInductionLearnerName = portalResolveInductionLearnerName;
  global.portalInductionCertificatePdfDownloaded = portalInductionCertificatePdfDownloaded;
  global.portalInductionMarkCertificatePdfDownloaded = portalInductionMarkCertificatePdfDownloaded;
  global.portalInductionNeedsCertificateDownload = portalInductionNeedsCertificateDownload;
  global.portalInductionTryMarkPdfFromDocuments = portalInductionTryMarkPdfFromDocuments;
})(typeof window !== "undefined" ? window : globalThis);
