/**
 * Completed General Induction: certificate-only view (green panel), PDF download, My Documents.
 */
(function (global) {
  var COMPLETE_KEY = "provisional-induction-training-complete";
  var MODULES = 6;

  function isTrainingComplete() {
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

  function learnerName() {
    if (typeof global.portalInductionDisplayName === "function") {
      var p = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile;
      var email = "";
      try {
        var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
        email = sess && sess.user && sess.user.email ? String(sess.user.email) : "";
      } catch (_e) {}
      var n = global.portalInductionDisplayName(p, email);
      if (n) return n;
    }
    if (global.provisionalInductionCertificate && global.provisionalInductionCertificate.getLearnerName) {
      return global.provisionalInductionCertificate.getLearnerName();
    }
    return "";
  }

  function issuedIso() {
    try {
      return (
        global.localStorage.getItem("provisional-induction-completed-at") ||
        global.localStorage.getItem("portalvic_induction_grandfather_issued_iso") ||
        ""
      );
    } catch (_e) {
      return "";
    }
  }

  function dashboardReturnUrl() {
    try {
      var u = global.localStorage.getItem("portalLastDashboardUrl");
      if (u && String(u).trim()) return String(u).trim();
    } catch (_e2) {}
    return "staff_dashboard.html";
  }

  function ensureBackLink() {
    if (global.document.getElementById("inductionPortalBack")) return;
    var wrap = global.document.querySelector(".training-wrap");
    if (!wrap) return;
    var a = global.document.createElement("a");
    a.id = "inductionPortalBack";
    a.className = "induction-portal-back";
    a.href = dashboardReturnUrl();
    a.textContent = "← Back to dashboard";
    wrap.insertBefore(a, wrap.firstChild);
  }

  function applyCertificateOnlyLayout() {
    if (!isTrainingComplete()) return;
    global.document.body.classList.add("induction--certificate-only");
    var panel = global.document.getElementById("inductionCertificatePanel");
    if (panel) {
      panel.hidden = false;
      panel.classList.add("induction-certificate-panel--portal-complete");
    }
    ensureBackLink();
    var nameEl = global.document.getElementById("inductionCertificateLearnerName");
    var name = learnerName();
    if (nameEl) {
      nameEl.textContent = name
        ? "Certificate for " + name
        : "Your name will appear on the certificate when you open induction from the portal.";
    }
    var btn = global.document.getElementById("downloadInductionCertificate");
    if (btn) btn.textContent = "Download certificate (PDF)";
  }

  function setSavedHint(msg) {
    var panel = global.document.getElementById("inductionCertificatePanel");
    if (!panel) return;
    var el = panel.querySelector(".induction-certificate-panel__saved");
    if (!el) {
      el = global.document.createElement("p");
      el.className = "induction-certificate-panel__saved";
      var actions = panel.querySelector(".induction-certificate-panel__actions");
      if (actions) actions.parentNode.insertBefore(el, actions.nextSibling);
      else panel.querySelector(".induction-certificate-panel__copy").appendChild(el);
    }
    el.textContent = msg || "";
    el.hidden = !msg;
  }

  function loadJsPdf() {
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf);
    return new Promise(function (resolve, reject) {
      var s = global.document.createElement("script");
      s.src =
        "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js?v=20260611-induction";
      s.onload = function () {
        if (global.jspdf && global.jspdf.jsPDF) resolve(global.jspdf);
        else reject(new Error("jsPDF failed to load"));
      };
      s.onerror = function () {
        reject(new Error("jsPDF failed to load"));
      };
      global.document.head.appendChild(s);
    });
  }

  async function importDocumentsModule() {
    var v = "20260611-induction";
    var bases = ["/portal/portal_documents.js", "portal/portal_documents.js"];
    for (var i = 0; i < bases.length; i++) {
      try {
        return await import(bases[i] + "?v=" + v);
      } catch (e) {
        console.warn("[induction] documents import", bases[i], e);
      }
    }
    throw new Error("Could not load portal_documents.js");
  }

  async function importAuthBootstrap() {
    var v = "20260611-induction";
    var bases = ["/portal/auth-handler.js", "portal/auth-handler.js"];
    for (var i = 0; i < bases.length; i++) {
      try {
        return await import(bases[i] + "?v=" + v);
      } catch (e) {
        console.warn("[induction] auth import", bases[i], e);
      }
    }
    return null;
  }

  async function onDownloadClick(btn) {
    var name = learnerName();
    if (!name) {
      alert("Open induction from the staff portal so we can put your name on the certificate.");
      return;
    }
    var iso = issuedIso();
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Preparing PDF…";
    }
    setSavedHint("");
    try {
      await loadJsPdf();
      if (typeof global.portalDownloadInductionCertificatePdf !== "function") {
        throw new Error("Certificate PDF helper not loaded.");
      }
      var result = await global.portalDownloadInductionCertificatePdf(name, iso, {
        saveToDocuments: true,
      });
      if (result && result.savedToDocuments) {
        setSavedHint(
          "Saved to My documents → Training. Open it anytime from the dashboard — no need to download again on your phone."
        );
      } else if (result && result.downloaded) {
        setSavedHint("PDF downloaded. A copy is also saved under My documents → Training when you are signed in.");
      } else if (result && !result.downloaded && !result.savedToDocuments) {
        setSavedHint("Could not save yet. Sign in on the portal and try again, or open My documents → Training.");
      }
      if (result && result.downloaded && typeof global.portalInductionMarkCertificatePdfDownloaded === "function") {
        global.portalInductionMarkCertificatePdfDownloaded();
      }
    } catch (err) {
      console.error("[induction] certificate PDF", err);
      setSavedHint(
        "Could not prepare the certificate. Try again, or open My documents → Training from your dashboard."
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Download certificate (PDF)";
      }
    }
  }

  function bindDownload() {
    var btn = global.document.getElementById("downloadInductionCertificate");
    if (!btn || btn.dataset.portalPdfBound) return;
    btn.dataset.portalPdfBound = "1";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      void onDownloadClick(btn);
    });
  }

  async function bootstrapAuth() {
    try {
      var auth = await importAuthBootstrap();
      if (auth && typeof auth.bootstrapDashboardSupabase === "function") {
        await auth.bootstrapDashboardSupabase({ page: "staff" });
      }
    } catch (e) {
      console.warn("[induction] auth bootstrap", e);
    }
    if (typeof global.portalInductionApplyGrandfather === "function") {
      var p = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile;
      var email = "";
      try {
        var sess = global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.session;
        email = sess && sess.user && sess.user.email ? String(sess.user.email) : "";
      } catch (_e) {}
      global.portalInductionApplyGrandfather(p, email);
    }
  }

  function init() {
    void bootstrapAuth().then(function () {
      applyCertificateOnlyLayout();
      if (isTrainingComplete()) {
        bindDownload();
        if (
          global.provisionalInductionCertificate &&
          typeof global.provisionalInductionCertificate.refreshDashboardPanel === "function"
        ) {
          global.provisionalInductionCertificate.refreshDashboardPanel();
        }
      }
    });
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
