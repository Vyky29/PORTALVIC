/**
 * General Induction certificate — SVG build, PDF download, optional My Documents upload.
 */
(function (global) {
  var TRAINING_LABEL = "clubSENsational General Induction";
  var LOGO_URL = "/induction-assets/clubsensational-portal-logo.png";
  var DOC_TITLE = "clubSENsational General Induction Certificate";
  var DOC_TYPE = "induction_certificate";
  var DOC_CATEGORY = "training";
  var DOC_SOURCE = "general-induction";
  var DOC_SESSION_KEY = "general-induction-certificate";
  var PDF_RENDER_WIDTH = 1200;
  var PDF_RENDER_HEIGHT = Math.round(1131 * (PDF_RENDER_WIDTH / 1600));
  var logoDataUriCache = null;

  function yieldToMain() {
    return new Promise(function (resolve) {
      global.setTimeout(resolve, 0);
    });
  }

  function isMobileCertificateFlow() {
    try {
      if (global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (_e) {}
    try {
      if (/iPhone|iPad|iPod|Android/i.test(String(global.navigator && global.navigator.userAgent || ""))) {
        return true;
      }
    } catch (_e2) {}
    return false;
  }

  function notifyProgress(opts, phase) {
    if (opts && typeof opts.onProgress === "function") {
      try {
        opts.onProgress(phase);
      } catch (_e) {}
    }
  }

  function escapeXml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function slugify(value) {
    return (
      String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "certificate"
    );
  }

  function formatDateLabel(date) {
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  function parseDate(issuedIso) {
    var date = issuedIso ? new Date(issuedIso) : new Date();
    if (Number.isNaN(date.getTime())) date = new Date();
    return date;
  }

  function loadLogoDataUri() {
    if (logoDataUriCache) return Promise.resolve(logoDataUriCache);
    return fetch(LOGO_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("logo");
        return res.blob();
      })
      .then(function (blob) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () {
            logoDataUriCache = reader.result;
            resolve(logoDataUriCache);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      });
  }

  function portalBuildInductionCertificateSvg(learnerName, issuedIso, logoDataUri) {
    var date = parseDate(issuedIso);
    return buildCertificateSvg({
      learnerName: learnerName,
      trainingLabel: TRAINING_LABEL,
      logoDataUri: logoDataUri || "",
      date: date,
    });
  }

  function buildCertificateSvg(meta) {
    var issuedOn = formatDateLabel(meta.date || new Date());
    var learnerName = escapeXml(meta.learnerName);
    var trainingLabel = escapeXml(meta.trainingLabel || TRAINING_LABEL);
    var logoHref = escapeXml(meta.logoDataUri || "");

    return [
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="1131" viewBox="0 0 1600 1131" role="img" aria-label="clubSENsational General Induction certificate">',
      "<defs>",
      '<linearGradient id="certBorder" x1="0%" y1="0%" x2="100%" y2="100%">',
      '<stop offset="0%" stop-color="#f0b323"/>',
      '<stop offset="55%" stop-color="#f5cc6a"/>',
      '<stop offset="100%" stop-color="#d79d15"/>',
      "</linearGradient>",
      '<linearGradient id="certHeader" x1="0%" y1="0%" x2="100%" y2="100%">',
      '<stop offset="0%" stop-color="#0f2840"/>',
      '<stop offset="100%" stop-color="#1a4a6e"/>',
      "</linearGradient>",
      "</defs>",
      '<rect width="1600" height="1131" fill="#fef8ec"/>',
      '<rect x="34" y="34" width="1532" height="1063" rx="34" fill="url(#certBorder)"/>',
      '<rect x="54" y="54" width="1492" height="1023" rx="28" fill="#ffffff"/>',
      '<rect x="86" y="86" width="1428" height="220" rx="28" fill="url(#certHeader)"/>',
      logoHref
        ? '<image xlink:href="' +
          logoHref +
          '" href="' +
          logoHref +
          '" x="1180" y="108" width="280" height="120" preserveAspectRatio="xMidYMid meet" opacity="0.98"/>'
        : "",
      '<text x="132" y="158" font-family="Montserrat, Arial, sans-serif" font-size="28" font-weight="800" fill="#f5cc6a" letter-spacing="3">CLUBSENSATIONAL</text>',
      '<text x="132" y="212" font-family="Montserrat, Arial, sans-serif" font-size="62" font-weight="800" fill="#ffffff">Certificate of Completion</text>',
      '<text x="132" y="258" font-family="Montserrat, Arial, sans-serif" font-size="22" font-weight="600" fill="rgba(255,255,255,0.9)">General Induction training completed successfully</text>',
      '<text x="800" y="400" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="30" fill="#5d7688">This certifies that</text>',
      '<text x="800" y="498" text-anchor="middle" font-family="Georgia, Times New Roman, serif" font-size="76" font-weight="700" fill="#0f2840">',
      learnerName,
      "</text>",
      '<line x1="426" y1="522" x2="1174" y2="522" stroke="#e8d4a8" stroke-width="2"/>',
      '<text x="800" y="604" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="30" font-weight="600" fill="#445e70">has successfully completed</text>',
      '<text x="800" y="676" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="50" font-weight="800" fill="#9a6b00">',
      trainingLabel,
      "</text>",
      '<text x="800" y="728" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="22" font-weight="600" fill="#5d7688">Six modules · Video learning · Module quizzes passed</text>',
      '<rect x="182" y="810" width="1236" height="168" rx="28" fill="#fffaf0" stroke="#f3e4c6" stroke-width="2"/>',
      '<text x="250" y="868" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#7a5200">Issued on</text>',
      '<text x="250" y="918" font-family="Montserrat, Arial, sans-serif" font-size="36" font-weight="800" fill="#0f2840">',
      escapeXml(issuedOn),
      "</text>",
      '<text x="1068" y="868" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="20" font-weight="700" fill="#7a5200">Authorised by</text>',
      '<line x1="934" y1="900" x2="1202" y2="900" stroke="#f0b323" stroke-width="3"/>',
      '<text x="1068" y="942" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="24" font-weight="800" fill="#0f2840">clubSENsational</text>',
      '<text x="1068" y="972" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="18" font-weight="600" fill="#5d7688">Staff Learning · General Induction</text>',
      "</svg>",
    ].join("");
  }

  function svgToPdfBlob(svgString) {
    return new Promise(function (resolve, reject) {
      var w = PDF_RENDER_WIDTH;
      var h = PDF_RENDER_HEIGHT;
      var img = new Image();
      var url = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }));
      img.onload = function () {
        try {
          var canvas = global.document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas");
          ctx.fillStyle = "#fef8ec";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          var dataUrl = canvas.toDataURL("image/jpeg", 0.9);
          if (!global.jspdf || !global.jspdf.jsPDF) throw new Error("jsPDF missing");
          var pdf = new global.jspdf.jsPDF({
            orientation: "landscape",
            unit: "px",
            format: [w, h],
            compress: true,
          });
          pdf.addImage(dataUrl, "JPEG", 0, 0, w, h);
          resolve(pdf.output("blob"));
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Could not render certificate image"));
      };
      img.src = url;
    });
  }

  function triggerBrowserDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = global.document.createElement("a");
    link.href = url;
    link.download = filename;
    global.document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 2000);
  }

  async function importDocumentsModule() {
    var v = "20260611-induction-cert";
    var bases = ["/portal/portal_documents.js", "portal/portal_documents.js"];
    for (var i = 0; i < bases.length; i++) {
      try {
        return await import(bases[i] + "?v=" + v);
      } catch (e) {
        console.warn("[induction-cert] import", bases[i], e);
      }
    }
    throw new Error("portal_documents.js not available");
  }

  async function savePdfToMyDocuments(pdfBlob, relatedDateIso) {
    var docs = await importDocumentsModule();
    if (typeof docs.portalRequireUser !== "function" || typeof docs.portalUploadPdfAndCreateDocument !== "function") {
      throw new Error("Document upload API missing");
    }
    var auth = await docs.portalRequireUser();
    var existing = await auth.supabase
      .from("documents")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("document_type", DOC_TYPE)
      .is("hidden_by_user_at", null)
      .limit(1);
    if (existing.error) throw existing.error;
    if (existing.data && existing.data.length) {
      return { savedToDocuments: true, alreadyHad: true };
    }
    await docs.portalUploadPdfAndCreateDocument({
      blob: pdfBlob,
      document_type: DOC_TYPE,
      category: DOC_CATEGORY,
      title: DOC_TITLE,
      source_page: DOC_SOURCE,
      related_date: relatedDateIso ? String(relatedDateIso).slice(0, 10) : null,
      related_session_key: DOC_SESSION_KEY,
      reuseAuth: auth,
    });
    return { savedToDocuments: true, alreadyHad: false };
  }

  function resolveLearnerName(learnerName) {
    var name = String(learnerName || "").trim();
    if (!name && typeof global.portalResolveInductionLearnerName === "function") {
      name = global.portalResolveInductionLearnerName("");
    }
    return name;
  }

  /**
   * @param {string} learnerName
   * @param {string} [issuedIso]
   * @returns {Promise<{ ok: boolean, previewUrl?: string, revoke?: function, learnerName?: string, issuedIso?: string, error?: string }>}
   */
  async function portalGetInductionCertificatePreview(learnerName, issuedIso) {
    var name = resolveLearnerName(learnerName);
    if (!name) return { ok: false, error: "no_name" };
    var logoDataUri = "";
    try {
      logoDataUri = await loadLogoDataUri();
    } catch (_e) {}
    var svg = portalBuildInductionCertificateSvg(name, issuedIso, logoDataUri);
    var previewUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    return {
      ok: true,
      previewUrl: previewUrl,
      revoke: function () {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch (_e) {}
      },
      learnerName: name,
      issuedIso: issuedIso,
    };
  }

  /**
   * @param {string} learnerName
   * @param {string} [issuedIso]
   * @returns {Promise<{ blob: Blob, filename: string, learnerName: string }>}
   */
  async function portalBuildInductionCertificatePdfBlob(learnerName, issuedIso) {
    var name = resolveLearnerName(learnerName);
    if (!name) throw new Error("INDUCTION_CERT_NO_NAME");
    var logoDataUri = "";
    try {
      logoDataUri = await loadLogoDataUri();
    } catch (_e) {}
    var svg = portalBuildInductionCertificateSvg(name, issuedIso, logoDataUri);
    var pdfBlob = await svgToPdfBlob(svg);
    var filename = slugify("general-induction-" + name) + "-certificate.pdf";
    return { blob: pdfBlob, filename: filename, learnerName: name };
  }

  /**
   * @param {string} learnerName
   * @param {string} [issuedIso]
   * @param {{ saveToDocuments?: boolean }} [opts]
   * @returns {Promise<{ downloaded: boolean, savedToDocuments?: boolean }>}
   */
  function shouldSkipBrowserCertificateDownload() {
    return isMobileCertificateFlow();
  }

  function myDocumentsTrainingUrl() {
    try {
      return new URL("my_documents.html?category=training", global.location.href).href;
    } catch (_e) {
      return "/my_documents.html?category=training";
    }
  }

  async function portalDownloadInductionCertificatePdf(learnerName, issuedIso, opts) {
    var options = opts || {};
    notifyProgress(options, "building");
    await yieldToMain();
    var built;
    try {
      built = await portalBuildInductionCertificatePdfBlob(learnerName, issuedIso);
    } catch (err) {
      if (err && err.message === "INDUCTION_CERT_NO_NAME") {
        alert(
          "Your name is not available for the certificate. Sign in to the staff portal, or open induction once so we can load your profile."
        );
        return { downloaded: false, savedToDocuments: false, mobileFlow: isMobileCertificateFlow() };
      }
      throw err;
    }
    var date = parseDate(issuedIso);
    var out = {
      downloaded: false,
      savedToDocuments: false,
      mobileFlow: isMobileCertificateFlow(),
      myDocumentsUrl: myDocumentsTrainingUrl(),
    };
    if (options.saveToDocuments) {
      notifyProgress(options, "saving");
      await yieldToMain();
      try {
        var saved = await savePdfToMyDocuments(built.blob, date.toISOString());
        out.savedToDocuments = !!(saved && saved.savedToDocuments);
        out.alreadyHad = !!(saved && saved.alreadyHad);
      } catch (err) {
        console.warn("[induction-cert] My Documents save", err);
        out.saveError = String(err && err.message ? err.message : err);
      }
    }
    if (!shouldSkipBrowserCertificateDownload()) {
      notifyProgress(options, "downloading");
      await yieldToMain();
      triggerBrowserDownload(built.blob, built.filename);
      out.downloaded = true;
    }
    if (out.downloaded || out.savedToDocuments) {
      notifyProgress(options, "done");
      if (typeof global.portalInductionMarkCertificatePdfDownloaded === "function") {
        global.portalInductionMarkCertificatePdfDownloaded();
      }
    }
    return out;
  }

  function portalDownloadInductionCertificate(learnerName, issuedIso) {
    return portalDownloadInductionCertificatePdf(learnerName, issuedIso, { saveToDocuments: false }).then(
      function (r) {
        return !!(r && r.downloaded);
      }
    );
  }

  global.portalBuildInductionCertificateSvg = portalBuildInductionCertificateSvg;
  global.portalGetInductionCertificatePreview = portalGetInductionCertificatePreview;
  global.portalBuildInductionCertificatePdfBlob = portalBuildInductionCertificatePdfBlob;
  global.portalDownloadInductionCertificatePdf = portalDownloadInductionCertificatePdf;
  global.portalDownloadInductionCertificate = portalDownloadInductionCertificate;
  global.portalInductionIsMobileCertificateFlow = isMobileCertificateFlow;
  global.portalInductionMyDocumentsTrainingUrl = myDocumentsTrainingUrl;
})(typeof window !== "undefined" ? window : globalThis);
