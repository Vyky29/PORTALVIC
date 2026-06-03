/**
 * Download General Induction certificate (SVG) — same visual as induction app.
 */
(function (global) {
  var TRAINING_LABEL = "clubSENsational General Induction";
  var LOGO_URL = "/induction-assets/clubsensational-portal-logo.png";
  var logoDataUriCache = null;

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

  function downloadSvg(filename, content) {
    var blob = new Blob([content], { type: "image/svg+xml;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = global.document.createElement("a");
    link.href = url;
    link.download = filename;
    global.document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function portalDownloadInductionCertificate(learnerName, issuedIso) {
    var name = String(learnerName || "").trim();
    if (!name) {
      alert("Your name is not available for the certificate. Open the portal from your staff dashboard first.");
      return Promise.resolve(false);
    }
    var date = issuedIso ? new Date(issuedIso) : new Date();
    if (Number.isNaN(date.getTime())) date = new Date();

    return loadLogoDataUri()
      .then(function (logoDataUri) {
        var svg = buildCertificateSvg({
          learnerName: name,
          trainingLabel: TRAINING_LABEL,
          logoDataUri: logoDataUri,
          date: date,
        });
        downloadSvg(slugify("general-induction-" + name) + "-certificate.svg", svg);
        return true;
      })
      .catch(function () {
        var svg = buildCertificateSvg({
          learnerName: name,
          trainingLabel: TRAINING_LABEL,
          date: date,
        });
        downloadSvg(slugify("general-induction-" + name) + "-certificate.svg", svg);
        return true;
      });
  }

  global.portalDownloadInductionCertificate = portalDownloadInductionCertificate;
})(typeof window !== "undefined" ? window : globalThis);
