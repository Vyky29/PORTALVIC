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

  function myDocumentsTrainingUrl() {
    if (typeof global.portalInductionMyDocumentsTrainingUrl === "function") {
      return global.portalInductionMyDocumentsTrainingUrl();
    }
    try {
      return new URL("my_documents.html?category=training", global.location.href).href;
    } catch (_e) {
      return "/my_documents.html?category=training";
    }
  }

  function isMobileCertificateFlow() {
    if (typeof global.portalInductionIsMobileCertificateFlow === "function") {
      return global.portalInductionIsMobileCertificateFlow();
    }
    return /iPhone|iPad|iPod|Android/i.test(String(global.navigator && global.navigator.userAgent || ""));
  }

  function yieldToMain() {
    return new Promise(function (resolve) {
      global.setTimeout(resolve, 0);
    });
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise(function (_resolve, reject) {
        global.setTimeout(function () {
          reject(new Error("INDUCTION_CERT_TIMEOUT"));
        }, ms);
      }),
    ]);
  }

  async function certificateExistsInDocuments() {
    try {
      var box = global.__PORTAL_SUPABASE__ || {};
      var client = box.client;
      var uid = box.session && box.session.user && box.session.user.id;
      if (!client || !uid || !client.from) return false;
      var res = await client
        .from("documents")
        .select("id")
        .eq("user_id", uid)
        .eq("document_type", "induction_certificate")
        .is("hidden_by_user_at", null)
        .limit(1);
      return !!(res.data && res.data.length);
    } catch (_e) {
      return false;
    }
  }

  function setDownloadButtonBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.setAttribute("aria-busy", busy ? "true" : "false");
    if (label) btn.textContent = label;
  }

  function promoteButtonToMyDocuments(btn) {
    if (!btn) return;
    btn.dataset.inductionCertSaved = "1";
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.textContent = "Open My documents";
    btn.classList.add("btn-certificate-download--saved");
  }

  function ensureMyDocumentsLink(afterBtn) {
    var actions = afterBtn && afterBtn.parentNode;
    if (!actions || actions.querySelector(".induction-certificate-panel__my-docs-link")) return;
    var link = global.document.createElement("a");
    link.className = "induction-certificate-panel__my-docs-link";
    link.href = myDocumentsTrainingUrl();
    link.textContent = "Open My documents → Training";
    actions.appendChild(link);
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
    if (btn && btn.dataset.inductionCertSaved === "1") {
      global.location.href = myDocumentsTrainingUrl();
      return;
    }
    var iso = issuedIso();
    setDownloadButtonBusy(btn, true, "Building certificate…");
    setSavedHint("");
    await yieldToMain();
    try {
      await loadJsPdf();
      if (typeof global.portalDownloadInductionCertificatePdf !== "function") {
        throw new Error("Certificate PDF helper not loaded.");
      }
      var result = await withTimeout(
        global.portalDownloadInductionCertificatePdf(name, iso, {
          saveToDocuments: true,
          onProgress: function (phase) {
            if (phase === "saving") setDownloadButtonBusy(btn, true, "Saving to My documents…");
            else if (phase === "downloading") setDownloadButtonBusy(btn, true, "Downloading PDF…");
            else if (phase === "building") setDownloadButtonBusy(btn, true, "Building certificate…");
          },
        }),
        90000
      );
      if (result && result.savedToDocuments) {
        if (result.alreadyHad) {
          setSavedHint("Your certificate is already in My documents → Training.");
        } else {
          setSavedHint("Certificate saved to My documents → Training.");
        }
        if (isMobileCertificateFlow()) {
          promoteButtonToMyDocuments(btn);
        } else {
          setSavedHint(
            (result.downloaded ? "PDF downloaded. " : "") +
              "Your certificate is in My documents → Training."
          );
          ensureMyDocumentsLink(btn);
          setDownloadButtonBusy(btn, false, "Download certificate (PDF)");
        }
      } else if (result && result.downloaded) {
        setSavedHint("PDF downloaded to your device.");
        setDownloadButtonBusy(btn, false, "Download certificate (PDF)");
      } else {
        setSavedHint(
          result && result.saveError
            ? "Could not save yet (" + result.saveError + "). Sign in on the portal and try again."
            : "Could not save yet. Sign in on the portal and try again, or open My documents → Training."
        );
        setDownloadButtonBusy(btn, false, "Download certificate (PDF)");
      }
    } catch (err) {
      console.error("[induction] certificate PDF", err);
      var maybeSaved = await certificateExistsInDocuments();
      if (maybeSaved) {
        setSavedHint("Your certificate is in My documents → Training.");
        if (isMobileCertificateFlow()) promoteButtonToMyDocuments(btn);
        else {
          ensureMyDocumentsLink(btn);
          setDownloadButtonBusy(btn, false, "Download certificate (PDF)");
        }
      } else if (err && err.message === "INDUCTION_CERT_TIMEOUT") {
        setSavedHint(
          "This is taking longer than usual. If nothing happens, open My documents → Training — your certificate may already be there."
        );
        ensureMyDocumentsLink(btn);
        setDownloadButtonBusy(btn, false, "Try again");
      } else {
        setSavedHint(
          "Could not prepare the certificate. Try again, or open My documents → Training from your dashboard."
        );
        ensureMyDocumentsLink(btn);
        setDownloadButtonBusy(btn, false, "Download certificate (PDF)");
      }
    } finally {
      if (btn && btn.dataset.inductionCertSaved !== "1" && btn.disabled) {
        setDownloadButtonBusy(btn, false, "Download certificate (PDF)");
      }
    }
  }

  function bindDownload() {
    var btn = global.document.getElementById("downloadInductionCertificate");
    if (!btn || btn.dataset.portalPdfBound) return;
    btn.dataset.portalPdfBound = "1";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (btn.dataset.inductionCertSaved === "1") {
        global.location.href = myDocumentsTrainingUrl();
        return;
      }
      void onDownloadClick(btn);
    });
  }

  async function syncSavedCertificateUi() {
    if (!isTrainingComplete()) return;
    var exists = await certificateExistsInDocuments();
    if (!exists) return;
    var btn = global.document.getElementById("downloadInductionCertificate");
    if (typeof global.portalInductionMarkCertificatePdfDownloaded === "function") {
      global.portalInductionMarkCertificatePdfDownloaded();
    }
    setSavedHint("Your certificate is in My documents → Training.");
    if (isMobileCertificateFlow()) promoteButtonToMyDocuments(btn);
    else ensureMyDocumentsLink(btn);
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
        void syncSavedCertificateUi();
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
