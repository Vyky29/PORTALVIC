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
  var OWNER_KEY = "provisional-induction-owner-id";
  var REFRESH_KEY = "provisional-induction-annual-refresh";

  /**
   * Must complete the full six modules in-app (after onboarding).
   * Zoho alumni (including Alex, Michelle, Carlos) are grandfathered and do the annual recap only.
   */
  var REQUIRED_ROSTER_KEYS = { emmanuel: true, patience: true, ann: true, gina: true };
  var REQUIRED_FIRST_NAMES = {
    emmanuel: true,
    emanuel: true,
    patience: true,
    ann: true,
    gina: true,
  };

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

  function portalInductionLearnerHintFromUrl() {
    try {
      var q = new URLSearchParams(global.location.search);
      if (q.get("portalGrandfathered") !== "1") return null;
      var name = String(q.get("learnerName") || q.get("name") || q.get("staffName") || "").trim();
      if (!name) return null;
      return { full_name: name, username: name };
    } catch (_e) {
      return null;
    }
  }

  function portalInductionHasIdentifiableLearner(profile, authEmail) {
    if (String(authEmail || "").trim()) return true;
    if (profile && (profile.full_name || profile.username || profile.id || profile.email)) return true;
    return false;
  }

  function portalInductionClearLocalProgress() {
    try {
      for (var i = 1; i <= MODULES; i++) {
        global.localStorage.removeItem("provisional-induction-module-" + i);
      }
      global.localStorage.removeItem(COMPLETE_KEY);
      global.localStorage.removeItem(COMPLETED_AT_KEY);
      global.localStorage.removeItem(CERT_PDF_DOWNLOADED_KEY);
      global.localStorage.removeItem(GRANDFATHER_ISSUED_KEY);
      global.localStorage.removeItem(LEARNER_NAME_KEY);
      global.sessionStorage.removeItem(LEARNER_NAME_KEY);
      global.localStorage.removeItem(REFRESH_KEY);
    } catch (_e) {}
  }

  function portalInductionBindStorageOwner(userId) {
    var id = String(userId || "").trim();
    if (!id) return false;
    try {
      var prev = String(global.localStorage.getItem(OWNER_KEY) || "").trim();
      if (prev && prev !== id) portalInductionClearLocalProgress();
      global.localStorage.setItem(OWNER_KEY, id);
    } catch (_e2) {}
    return true;
  }

  function portalInductionResetAnonymousGrandfather() {
    var profile = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile;
    if (!profile) profile = portalInductionLearnerHintFromUrl();
    if (portalInductionHasIdentifiableLearner(
      profile,
      (function () {
        try {
          var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
          return sess && sess.user && sess.user.email ? String(sess.user.email) : "";
        } catch (_e) {
          return "";
        }
      })()
    )) {
      return false;
    }
    if (!portalInductionLooksGrandfatheredComplete()) return false;
    portalInductionClearLocalProgress();
    try {
      global.localStorage.removeItem(OWNER_KEY);
    } catch (_e3) {}
    return true;
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
    if (!portalInductionHasIdentifiableLearner(profile, authEmail)) return false;
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

  /** Grandfather stamp: quiz marked passed with no watch time and no quiz start. */
  function portalInductionModuleIsStamp(st) {
    if (!st || !st.quizPass) return false;
    if (st.outcomes || st.quizStarted) return false;
    if (Number(st.maxWatchedTime) > 0) return false;
    return true;
  }

  function portalInductionPassedModulesAreStampsOnly() {
    var anyPass = false;
    for (var i = 1; i <= MODULES; i++) {
      var st = {};
      try {
        st = JSON.parse(global.localStorage.getItem("provisional-induction-module-" + i) || "{}");
      } catch (_e) {
        st = {};
      }
      var started = !!(st.journey || st.video || st.outcomes || st.quizStarted || Number(st.maxWatchedTime) > 0 || st.quizPass);
      if (!started) continue;
      if (!portalInductionModuleIsStamp(st)) return false;
      anyPass = true;
    }
    return anyPass;
  }

  /**
   * New hires do the six induction modules. The annual recap is a later admin ask.
   * A shared browser can still hold another worker's stamp or recap pass — drop that
   * so it is not written onto this hire.
   */
  function portalInductionClearFakeCompleteForRequired(profile, authEmail) {
    if (!portalInductionMustComplete(profile, authEmail)) return false;
    var cleared = false;
    try {
      if (portalInductionPassedModulesAreStampsOnly()) {
        for (var i = 1; i <= MODULES; i++) {
          global.localStorage.removeItem("provisional-induction-module-" + i);
        }
        global.localStorage.removeItem(COMPLETE_KEY);
        global.localStorage.removeItem(COMPLETED_AT_KEY);
        global.localStorage.removeItem(CERT_PDF_DOWNLOADED_KEY);
        cleared = true;
      }
      if (global.localStorage.getItem(REFRESH_KEY)) {
        global.localStorage.removeItem(REFRESH_KEY);
        cleared = true;
      }
    } catch (_e2) {}
    return cleared;
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

  function portalInductionLondonParts(date) {
    var d = date instanceof Date ? date : date ? new Date(date) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(d);
    var y = 0;
    var m = 0;
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "year") y = Number(parts[i].value);
      if (parts[i].type === "month") m = Number(parts[i].value);
    }
    return { year: y, month: m };
  }

  function portalInductionTrainingYear(date) {
    var p = portalInductionLondonParts(date);
    if (p.month >= 9) return p.year + "/" + String(p.year + 1).slice(-2);
    return p.year - 1 + "/" + String(p.year).slice(-2);
  }

  function portalInductionLoadRefresh() {
    try {
      var raw = global.localStorage.getItem(REFRESH_KEY);
      var data = raw ? JSON.parse(raw) : {};
      if (!data || typeof data !== "object") data = {};
      return {
        year: String(data.year || ""),
        recap: !!data.recap,
        quizPass: !!data.quizPass,
        at: data.at || "",
      };
    } catch (_e) {
      return { year: "", recap: false, quizPass: false, at: "" };
    }
  }

  function portalInductionSaveRefresh(next) {
    try {
      global.localStorage.setItem(REFRESH_KEY, JSON.stringify(next || {}));
    } catch (_e) {}
    try {
      global.dispatchEvent(new CustomEvent("portal:induction-progress", { detail: { refresh: true } }));
    } catch (_e2) {}
  }

  function portalInductionRefreshPassedForYear(year) {
    var y = String(year || portalInductionTrainingYear());
    var r = portalInductionLoadRefresh();
    return !!(r.quizPass && r.year === y);
  }

  function portalInductionHasFullPathwayComplete(profile, authEmail) {
    if (portalInductionMustComplete(profile, authEmail)) {
      return portalInductionModulesAllPassed();
    }
    if (!portalInductionHasIdentifiableLearner(profile, authEmail)) return false;
    try {
      if (global.localStorage.getItem(COMPLETE_KEY) === "1") return true;
    } catch (_e) {}
    return portalInductionModulesAllPassed();
  }

  function portalInductionRefreshDue(profile, authEmail) {
    if (!portalInductionHasFullPathwayComplete(profile, authEmail)) return false;
    var year = portalInductionTrainingYear();
    if (portalInductionRefreshPassedForYear(year)) return false;
    if (portalInductionModulesAllPassed() && !portalInductionLooksGrandfatheredComplete()) {
      try {
        var at = String(global.localStorage.getItem(COMPLETED_AT_KEY) || "").trim();
        if (at && portalInductionTrainingYear(at) === year) return false;
      } catch (_e2) {}
    }
    return true;
  }

  function portalInductionMarkAnnualRefreshPassed() {
    var year = portalInductionTrainingYear();
    portalInductionSaveRefresh({
      year: year,
      recap: true,
      quizPass: true,
      at: new Date().toISOString(),
    });
    return year;
  }

  function portalInductionRefreshUrl() {
    return portalInductionBaseUrl().replace(/\/?$/, "/") + "annual-refresh/";
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
    if (portalInductionMustComplete(profile, authEmail)) {
      if (!portalInductionModulesAllPassed()) {
        try {
          if (global.localStorage.getItem(COMPLETE_KEY) === "1") global.localStorage.removeItem(COMPLETE_KEY);
        } catch (_e2) {}
        return false;
      }
      try {
        global.localStorage.setItem(COMPLETE_KEY, "1");
      } catch (_e3) {}
    } else if (!portalInductionHasFullPathwayComplete(profile, authEmail)) {
      return false;
    }
    if (portalInductionRefreshDue(profile, authEmail)) return false;
    return true;
  }

  function portalInductionBaseUrl() {
    try {
      var here = String(global.location.origin || "").replace(/\/$/, "");
      if (here && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(here)) {
        return here + "/general-induction/";
      }
      if (here && (/portalvic\.vercel\.app$/i.test(here) || /clubsensational-staff\.vercel\.app$/i.test(here))) {
        return here + "/general-induction/";
      }
    } catch (_e0) {}
    var custom = String(global.PORTAL_INDUCTION_BASE_URL || "").trim();
    if (custom) return custom.replace(/\/?$/, "/");
    if (typeof global.portalCanonicalPortalPageUrl === "function") {
      return global.portalCanonicalPortalPageUrl("general-induction/");
    }
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
    try {
      var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
      var uid = sess && sess.user && sess.user.id;
      if (uid) portalInductionBindStorageOwner(uid);
    } catch (_eOwn) {}
    portalInductionPrepareLearnerName(profile, authEmail);
    portalInductionClearFakeCompleteForRequired(profile, authEmail);
    portalInductionClearGrandfatherStateForRequired(profile, authEmail);
    portalInductionApplyGrandfather(profile, authEmail);
    if (
      typeof global.portalPortalHostLooksWrong === "function" &&
      global.portalPortalHostLooksWrong()
    ) {
      try {
        global.sessionStorage.setItem(
          "portalInductionHostWarning",
          "Use https://portalvic.vercel.app for General Induction — not clubsensational.org."
        );
      } catch (_) {}
    }
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

  function portalInductionOpenRefresh(profile, authEmail) {
    try {
      var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
      var uid = sess && sess.user && sess.user.id;
      if (uid) portalInductionBindStorageOwner(uid);
    } catch (_eOwn) {}
    portalInductionPrepareLearnerName(profile, authEmail);
    portalInductionApplyGrandfather(profile, authEmail);
    var url;
    try {
      url = new URL(portalInductionRefreshUrl(), global.location.href);
    } catch (_e) {
      global.location.href = "/general-induction/annual-refresh/";
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
    var refreshDue =
      typeof portalInductionRefreshDue === "function"
        ? portalInductionRefreshDue(profile, authEmail)
        : false;
    var year = portalInductionTrainingYear();
    var needsCert = portalInductionNeedsCertificateDownload(profile, authEmail);
    btn.disabled = false;
    btn.removeAttribute("disabled");
    btn.classList.remove("menu-btn--portal-pending");
    btn.setAttribute("aria-disabled", "false");
    btn.classList.toggle("menu-btn--induction-cert-pending", needsCert);
    btn.classList.toggle("menu-btn--portal-pulse", !!(needsCert || (must && !done)));
    var sub = btn.querySelector(".menu-btn-sub");
    if (sub) {
      if (needsCert) {
        sub.textContent = "Open and download your certificate (PDF)";
      } else if (must && !done) {
        sub.textContent = "Core company training — start here";
      } else if (must && done) {
        sub.textContent = "Completed — certificate in My documents";
      } else {
        sub.textContent = "Completed " + year + " — certificate in My documents";
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

  function portalInductionSyncRecapQuickMenu(btn, profile, authEmail) {
    if (!btn) return;
    /* Recap is for people who already finished induction and were asked to refresh.
       New hires (full six modules) do not see it. */
    if (portalInductionMustComplete(profile, authEmail)) {
      btn.hidden = true;
      btn.setAttribute("aria-hidden", "true");
      btn.disabled = true;
      btn.classList.remove("menu-btn--portal-pulse");
      return;
    }
    var full = portalInductionHasFullPathwayComplete(profile, authEmail);
    var year = portalInductionTrainingYear();
    var refreshDue = portalInductionRefreshDue(profile, authEmail);
    btn.hidden = !full;
    btn.setAttribute("aria-hidden", full ? "false" : "true");
    btn.disabled = !full;
    btn.classList.toggle("menu-btn--portal-pulse", !!(full && refreshDue));
    var sub = btn.querySelector(".menu-btn-sub");
    if (sub) {
      if (!full) sub.textContent = "After you finish Induction";
      else if (refreshDue) sub.textContent = "Due " + year + " - recap, day-to-day, quiz";
      else sub.textContent = "Completed " + year + " - open again anytime";
    }
    btn.setAttribute(
      "aria-label",
      refreshDue ? "Recap General Induction — due " + year : "Recap General Induction"
    );
  }

  var _inductionPdfProbeInflight = null;
  function portalInductionBindDashboard(opts) {
    var profile = (opts && opts.profile) || (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile);
    var email = (opts && opts.authEmail) || "";
    if (!email) {
      var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
      email = sess && sess.user && sess.user.email ? String(sess.user.email) : "";
    }
    portalInductionClearFakeCompleteForRequired(profile, email);
    portalInductionClearGrandfatherStateForRequired(profile, email);
    portalInductionApplyGrandfather(profile, email);
    portalInductionSyncQuickMenu(global.document.getElementById("quickMenuInduction"), profile, email);
    portalInductionSyncRecapQuickMenu(global.document.getElementById("quickMenuInductionRecap"), profile, email);
    /* Only refresh the Quick-menu button after the documents probe — never call the
       full dashboard sync helper (portal_induction_bind overwrites that name and
       would re-enter BindDashboard forever → thousands of GETs). */
    if (_inductionPdfProbeInflight) return;
    _inductionPdfProbeInflight = portalInductionTryMarkPdfFromDocuments()
      .catch(function () {})
      .then(function () {
        portalInductionSyncQuickMenu(global.document.getElementById("quickMenuInduction"), profile, email);
        portalInductionSyncRecapQuickMenu(global.document.getElementById("quickMenuInductionRecap"), profile, email);
      })
      .finally(function () {
        _inductionPdfProbeInflight = null;
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

  global.portalInductionClearFakeCompleteForRequired = portalInductionClearFakeCompleteForRequired;
  global.portalInductionMustComplete = portalInductionMustComplete;
  global.portalInductionLearnerHintFromUrl = portalInductionLearnerHintFromUrl;
  global.portalInductionHasIdentifiableLearner = portalInductionHasIdentifiableLearner;
  global.portalInductionClearLocalProgress = portalInductionClearLocalProgress;
  global.portalInductionBindStorageOwner = portalInductionBindStorageOwner;
  global.portalInductionResetAnonymousGrandfather = portalInductionResetAnonymousGrandfather;
  global.portalInductionIsComplete = portalInductionIsComplete;
  global.portalInductionApplyGrandfather = portalInductionApplyGrandfather;
  global.portalInductionTrainingYear = portalInductionTrainingYear;
  global.portalInductionLoadRefresh = portalInductionLoadRefresh;
  global.portalInductionSaveRefresh = portalInductionSaveRefresh;
  global.portalInductionRefreshDue = portalInductionRefreshDue;
  global.portalInductionRefreshPassedForYear = portalInductionRefreshPassedForYear;
  global.portalInductionHasFullPathwayComplete = portalInductionHasFullPathwayComplete;
  global.portalInductionMarkAnnualRefreshPassed = portalInductionMarkAnnualRefreshPassed;
  global.portalInductionRefreshUrl = portalInductionRefreshUrl;
  global.portalInductionOpen = portalInductionOpen;
  global.portalInductionOpenRefresh = portalInductionOpenRefresh;
  global.portalInductionBindDashboard = portalInductionBindDashboard;
  global.portalInductionGetCertificateMeta = portalInductionGetCertificateMeta;
  global.portalInductionDisplayName = displayNameFromProfile;
  global.portalResolveInductionLearnerName = portalResolveInductionLearnerName;
  global.portalInductionCertificatePdfDownloaded = portalInductionCertificatePdfDownloaded;
  global.portalInductionMarkCertificatePdfDownloaded = portalInductionMarkCertificatePdfDownloaded;
  global.portalInductionNeedsCertificateDownload = portalInductionNeedsCertificateDownload;
  global.portalInductionTryMarkPdfFromDocuments = portalInductionTryMarkPdfFromDocuments;
  global.portalInductionSyncQuickMenu = portalInductionSyncQuickMenu;
  global.portalInductionSyncQuickMenuBtn = portalInductionSyncQuickMenu;
  global.portalInductionSyncRecapQuickMenu = portalInductionSyncRecapQuickMenu;
})(typeof window !== "undefined" ? window : globalThis);
