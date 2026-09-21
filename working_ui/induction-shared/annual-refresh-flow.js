(function () {
  var ITEMS = document.querySelectorAll("[data-refresh-item]");
  var recapCheck = document.getElementById("refreshRecapCheck");
  var quiz = document.getElementById("quiz");
  var form = document.getElementById("refreshQuizForm");
  var submitBtn = document.getElementById("refreshSubmit");
  var hint = document.getElementById("refreshSubmitHint");
  var scoreCard = document.getElementById("refreshScoreCard");
  var scoreMsg = document.getElementById("refreshScoreMsg");
  var doneLink = document.getElementById("refreshDoneLink");
  var yearEl = document.getElementById("refreshYearLabel");

  var CORRECT = {
    q1: "C",
    q2: "C",
    q3: "C",
    q4: "F",
    q5: "B",
    q6: "T",
    q7: "B",
    q8: "B",
    q9: "C",
    q10: "B",
    q11: "C",
    q12: "B",
  };
  var QCOUNT = Object.keys(CORRECT).length;

  function yearLabel() {
    if (typeof window.portalInductionTrainingYear === "function") {
      return window.portalInductionTrainingYear();
    }
    return "";
  }

  function pageProfile() {
    var p = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.staff_profile;
    if (p) return p;
    if (typeof window.portalInductionLearnerHintFromUrl === "function") {
      return window.portalInductionLearnerHintFromUrl();
    }
    return null;
  }

  function pageEmail() {
    try {
      var sess = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.session;
      return sess && sess.user && sess.user.email ? String(sess.user.email) : "";
    } catch (_e) {
      return "";
    }
  }

  function hasFullPathway() {
    if (typeof window.portalInductionHasFullPathwayComplete !== "function") return true;
    return window.portalInductionHasFullPathwayComplete(pageProfile(), pageEmail());
  }

  function openedCount() {
    var n = 0;
    ITEMS.forEach(function (el) {
      if (el.classList.contains("is-done")) n++;
    });
    return n;
  }

  function answeredCount() {
    var n = 0;
    Object.keys(CORRECT).forEach(function (name) {
      if (form && form.querySelector('input[name="' + name + '"]:checked')) n++;
    });
    return n;
  }

  function saveRecap() {
    if (typeof window.portalInductionSaveRefresh !== "function") return;
    var prev = typeof window.portalInductionLoadRefresh === "function"
      ? window.portalInductionLoadRefresh()
      : {};
    window.portalInductionSaveRefresh({
      year: yearLabel(),
      recap: true,
      quizPass: !!prev.quizPass && prev.year === yearLabel(),
      at: prev.at || "",
    });
  }

  function unlockQuiz() {
    if (!quiz) return;
    quiz.classList.remove("gated-locked");
    quiz.classList.add("is-unlocked");
    var banner = quiz.querySelector(".section-lock-banner");
    if (banner) banner.style.display = "none";
  }

  function refreshUi() {
    var all = ITEMS.length > 0 && openedCount() >= ITEMS.length;
    if (recapCheck) {
      recapCheck.disabled = !all;
      if (!all) recapCheck.checked = false;
    }
    if (recapCheck && recapCheck.checked) {
      saveRecap();
      unlockQuiz();
    }
    var n = answeredCount();
    if (submitBtn) submitBtn.disabled = n < QCOUNT;
    if (hint) {
      hint.textContent =
        n < QCOUNT
          ? "Answer all " + QCOUNT + " questions to submit (" + n + " of " + QCOUNT + " done)."
          : "All questions answered. You can submit.";
    }
  }

  ITEMS.forEach(function (el) {
    el.addEventListener("click", function () {
      el.classList.add("is-open", "is-done");
      el.setAttribute("aria-pressed", "true");
      refreshUi();
    });
  });

  if (recapCheck) {
    recapCheck.addEventListener("change", refreshUi);
  }
  if (form) {
    form.addEventListener("change", refreshUi);
  }

  function markPassed() {
    if (typeof window.portalInductionMarkAnnualRefreshPassed === "function") {
      window.portalInductionMarkAnnualRefreshPassed();
    }
  }

  function learnerName() {
    if (typeof window.portalResolveInductionLearnerName === "function") {
      var n = window.portalResolveInductionLearnerName("");
      if (n) return n;
    }
    try {
      var q = new URLSearchParams(window.location.search);
      var fromUrl = q.get("learnerName") || q.get("name") || q.get("staffName");
      if (fromUrl && String(fromUrl).trim()) return String(fromUrl).trim();
    } catch (_e) {}
    return "";
  }

  function recapCertMeta() {
    var year = yearLabel() || "this year";
    var name = learnerName() || "Staff";
    return {
      trainingLabel: "General Induction recap " + year,
      headerSub: "Annual refresh completed successfully",
      detailLine: "Recap cards · Day-to-day · Quiz passed",
      footerLine: "Staff Learning · Annual refresh " + year,
      ariaLabel: "clubSENsational General Induction recap diploma",
      filenameStem: "general-induction-recap-" + String(year).replace("/", "-") + "-" + name,
    };
  }

  function recapDocumentMeta() {
    var year = yearLabel() || "this year";
    var yearSlug = String(year).replace("/", "-");
    return {
      documentType: "induction_recap_certificate",
      documentTitle: "clubSENsational General Induction recap " + year,
      category: "training",
      sourcePage: "general-induction-recap",
      relatedSessionKey: "general-induction-recap-" + yearSlug,
    };
  }

  function recapPdfOptions(extra, flags) {
    var doc = recapDocumentMeta();
    extra = extra || recapCertMeta();
    flags = flags || {};
    return {
      saveToDocuments: flags.saveToDocuments !== false,
      skipDownload: !!flags.skipDownload,
      cert: extra,
      documentType: doc.documentType,
      documentTitle: doc.documentTitle,
      category: doc.category,
      sourcePage: doc.sourcePage,
      relatedSessionKey: doc.relatedSessionKey,
    };
  }

  function myDocsTrainingUrl() {
    if (typeof window.portalInductionMyDocumentsTrainingUrl === "function") {
      return window.portalInductionMyDocumentsTrainingUrl();
    }
    try {
      return new URL("/my_documents.html?category=training", window.location.href).href;
    } catch (_e) {
      return "/my_documents.html?category=training";
    }
  }

  function setSavedHint(msg) {
    var el = document.getElementById("refreshDiplomaSaved");
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
  }

  function ensureMyDocsLink() {
    var wrap = document.getElementById("refreshDiplomaWrap");
    if (!wrap || wrap.querySelector(".annual-refresh__my-docs")) return;
    var a = document.createElement("a");
    a.className = "annual-refresh__back annual-refresh__my-docs";
    a.href = myDocsTrainingUrl();
    a.textContent = "Open My documents - Training";
    wrap.appendChild(a);
  }

  function applySaveResult(result) {
    if (result && result.savedToDocuments) {
      setSavedHint(
        result.alreadyHad
          ? "Your diploma is already in My documents - Training."
          : "Diploma saved to My documents - Training."
      );
      ensureMyDocsLink();
      return;
    }
    setSavedHint(
      result && result.saveError
        ? "Could not save yet. Sign in on the staff app and try Download diploma again."
        : "Could not save yet. Sign in on the staff app so we can put this in My documents."
    );
  }

  function saveDiplomaToDocuments(extra) {
    var name = learnerName();
    extra = extra || recapCertMeta();
    setSavedHint("Saving diploma to My documents...");
    return loadJsPdf()
      .then(function () {
        if (typeof window.portalDownloadInductionCertificatePdf !== "function") {
          throw new Error("PDF helper missing");
        }
        return window.portalDownloadInductionCertificatePdf(
          name,
          new Date().toISOString(),
          recapPdfOptions(extra, { saveToDocuments: true, skipDownload: true })
        );
      })
      .then(function (result) {
        applySaveResult(result);
        return result;
      })
      .catch(function () {
        setSavedHint("Could not save yet. Sign in on the staff app so we can put this in My documents.");
      });
  }

  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf);
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js?v=20260921-induction-recap2";
      s.onload = function () {
        if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf);
        else reject(new Error("jsPDF failed"));
      };
      s.onerror = function () {
        reject(new Error("jsPDF failed"));
      };
      document.head.appendChild(s);
    });
  }

  function showDiploma() {
    var wrap = document.getElementById("refreshDiplomaWrap");
    var img = document.getElementById("refreshDiplomaPreview");
    var btn = document.getElementById("refreshDiplomaDownload");
    if (!wrap) return;
    wrap.hidden = false;
    var name = learnerName();
    var extra = recapCertMeta();
    if (typeof window.portalGetInductionCertificatePreview === "function") {
      window.portalGetInductionCertificatePreview(name, new Date().toISOString(), extra).then(function (prev) {
        if (prev && prev.ok && prev.previewUrl && img) {
          img.src = prev.previewUrl;
        }
      });
    }
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        btn.disabled = true;
        loadJsPdf()
          .then(function () {
            if (typeof window.portalDownloadInductionCertificatePdf !== "function") {
              throw new Error("PDF helper missing");
            }
            return window.portalDownloadInductionCertificatePdf(
              name,
              new Date().toISOString(),
              recapPdfOptions(extra, { saveToDocuments: true, skipDownload: false })
            );
          })
          .then(function (result) {
            applySaveResult(result);
          })
          .catch(function () {
            alert("Could not build the diploma PDF. Try again from this page.");
          })
          .then(function () {
            btn.disabled = false;
          });
      });
    }
    if (!wrap.dataset.saveStarted) {
      wrap.dataset.saveStarted = "1";
      saveDiplomaToDocuments(extra);
    }
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (answeredCount() < QCOUNT) {
        alert("Please answer all " + QCOUNT + " questions before submitting.");
        return;
      }
      var score = 0;
      Object.keys(CORRECT).forEach(function (name) {
        var input = form.querySelector('input[name="' + name + '"]:checked');
        var ok = !!(input && input.value === CORRECT[name]);
        if (ok) score++;
        var fb = document.getElementById("fb-" + name);
        if (fb) {
          fb.className = "feedback " + (ok ? "correct" : "incorrect");
          fb.textContent = ok ? "Correct." : "Not quite. Review the recap cards and try again.";
        }
      });
      var passed = score === QCOUNT;
      if (scoreCard) {
        scoreCard.classList.add("show");
        scoreCard.classList.toggle("is-fail", !passed);
      }
      if (scoreMsg) {
        scoreMsg.textContent = passed
          ? "Refresh complete for " + (yearLabel() || "this year") + ". Your diploma is below."
          : "You scored " + score + "/" + QCOUNT + ". Every answer must be correct to finish this year's refresh.";
      }
      if (doneLink) doneLink.style.display = passed ? "inline-flex" : "none";
      if (passed) {
        markPassed();
        showDiploma();
      }
      if (submitBtn) submitBtn.disabled = passed;
      if (scoreCard) scoreCard.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function boot() {
    var p = pageProfile();
    var email = pageEmail();
    if (typeof window.portalInductionApplyGrandfather === "function") {
      window.portalInductionApplyGrandfather(p, email);
    }
    var year = yearLabel();
    if (yearEl && year) yearEl.textContent = year;
    if (typeof window.portalInductionRefreshPassedForYear === "function" && year) {
      /* keep going even if already passed so they can re-read */
    }
    if (!hasFullPathway()) {
      window.location.replace("/general-induction/");
      return;
    }
    var prev = typeof window.portalInductionLoadRefresh === "function"
      ? window.portalInductionLoadRefresh()
      : {};
    if (prev.recap && prev.year === year) {
      ITEMS.forEach(function (el) {
        el.classList.add("is-open", "is-done");
        el.setAttribute("aria-pressed", "true");
      });
      if (recapCheck) {
        recapCheck.disabled = false;
        recapCheck.checked = true;
      }
      unlockQuiz();
    }
    if (prev.quizPass && prev.year === year) {
      showDiploma();
    }
    refreshUi();
  }

  function bootWhenReady() {
    var ready = window.__portalInductionProgressReady;
    if (ready && typeof ready.then === "function") {
      ready.then(boot).catch(boot);
      return;
    }
    boot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootWhenReady, { once: true });
  } else {
    bootWhenReady();
  }
})();
