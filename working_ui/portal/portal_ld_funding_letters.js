/**
 * L&D funding decision letters — email text, print HTML, PDF blob (POL-049 Phase 3).
 */
(function (global) {
  "use strict";

  var JSPDF_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js?v=20260703-ld-funding";

  /** Same static crest used on timesheet / portal PDF headers. */
  var PDF_LOGO_URLS = ["portal/F-02-1.png", "logoPDF.png", "portal/portal_crest.svg"];

  var ORG = "clubSENsational Ltd";
  var SCHEME = "Learning & Development Funding Scheme (POL-049)";
  var DECLINE_REASON_OTHER = "other";
  var logoDataUrlCache = null;

  var DECLINE_REASONS = [
    {
      code: "role_relevance",
      label: "Not sufficiently relevant to current role or business need",
      letter:
        "The proposed learning is not sufficiently relevant to your current role or an identified business need at this time.",
    },
    {
      code: "participant_benefit",
      label: "Limited benefit to the individuals we support",
      letter:
        "The application does not demonstrate sufficient benefit to the individuals we support.",
    },
    {
      code: "budget",
      label: "Available training budget",
      letter: "Available training budget does not allow approval of this application at present.",
    },
    {
      code: "scheme_criteria",
      label: "Scheme criteria not met (probation, performance or commitment)",
      letter:
        "The application does not meet the scheme criteria at this time (for example probation period, performance or commitment).",
    },
    {
      code: "recent_funding",
      label: "Recent approval or funding already committed",
      letter:
        "A recent application has already been approved or training funding is already committed elsewhere.",
    },
  ];

  function declineReasonByCode(code) {
    var k = clean(code);
    for (var i = 0; i < DECLINE_REASONS.length; i++) {
      if (DECLINE_REASONS[i].code === k) return DECLINE_REASONS[i];
    }
    return null;
  }

  function normalizeDeclineCodes(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.map(function (c) {
        return clean(c);
      }).filter(Boolean);
    }
    if (typeof raw === "string") {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return normalizeDeclineCodes(parsed);
      } catch (_) {}
      return raw
        .split(",")
        .map(function (c) {
          return clean(c);
        })
        .filter(Boolean);
    }
    return [];
  }

  function buildDeclineReasonLines(app) {
    var codes = normalizeDeclineCodes(app && app.decline_reason_codes);
    var lines = [];
    codes.forEach(function (code) {
      if (code === DECLINE_REASON_OTHER) return;
      var reason = declineReasonByCode(code);
      if (reason) lines.push(reason.letter);
    });
    var other = clean(app && app.decline_reason_other);
    if (codes.indexOf(DECLINE_REASON_OTHER) >= 0 && other) {
      lines.push(other);
    }
    return lines;
  }

  function clean(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function fmtDate(iso) {
    var s = clean(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      try {
        return new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      } catch (_) {
        return s || "—";
      }
    }
    try {
      return new Date(s + "T12:00:00").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (_) {
      return s;
    }
  }

  function fmtMoney(n) {
    if (n == null || n === "") return null;
    var x = Number(n);
    if (!Number.isFinite(x)) return null;
    return "£" + x.toFixed(2);
  }

  function statusKey(app) {
    return clean(app && app.status).toLowerCase();
  }

  function decisionLabel(st) {
    var k = clean(st).toLowerCase();
    if (k === "approved") return "Approved";
    if (k === "declined") return "Declined";
    if (k === "approved_conditional") return "Approved with conditions";
    return "Pending review";
  }

  function subjectFor(app) {
    var st = statusKey(app);
    if (st === "pending") return "L&D Funding Application — pending review";
    return (
      "L&D Funding Application — " +
      decisionLabel(st) +
      " — " +
      clean(app.course_title || "Course")
    );
  }

  function letterDate(app) {
    return fmtDate(app.reviewed_at || app.updated_at || new Date().toISOString());
  }

  function buildParagraphs(app) {
    var a = app || {};
    var st = statusKey(a);
    var name = clean(a.employee_name) || "Colleague";
    var course = clean(a.course_title) || "your requested course";
    var provider = clean(a.training_provider);
    var cost = fmtMoney(a.total_course_cost_gbp);
    var approved = fmtMoney(a.funding_amount_gbp);
    var lines = [];

    lines.push("Dear " + name + ",");
    lines.push("");
    lines.push(
      "Thank you for submitting your Learning & Development Funding Application in relation to " +
        course +
        (provider ? " (" + provider + ")" : "") +
        "."
    );

    if (st === "declined") {
      lines.push("");
      lines.push(
        "After careful consideration, we are unable to approve funding for this application at this time. " +
          "This decision has been made in line with the " +
          SCHEME +
          "."
      );
      var declineLines = buildDeclineReasonLines(a);
      if (declineLines.length) {
        lines.push("");
        lines.push("This reflects the following:");
        declineLines.forEach(function (line) {
          lines.push("• " + line);
        });
      } else {
        lines.push("");
        lines.push(
          "This reflects relevance to your role, benefit to the individuals we support, performance and commitment, and available training budget."
        );
      }
      lines.push("");
      lines.push(
        "This does not prevent you from discussing alternative development options with your line manager or submitting a future application where circumstances change."
      );
    } else if (st === "approved" || st === "approved_conditional") {
      lines.push("");
      if (st === "approved_conditional") {
        lines.push(
          "We are pleased to confirm conditional approval for funding under the " + SCHEME + "."
        );
      } else {
        lines.push("We are pleased to confirm approval for funding under the " + SCHEME + ".");
      }
      lines.push("");
      lines.push("Please find the confirmed details below:");
      lines.push("");
      if (approved) {
        lines.push("Approved funding amount: " + approved);
        if (cost) {
          var amtNum = Number(a.funding_amount_gbp);
          var costNum = Number(a.total_course_cost_gbp);
          if (Number.isFinite(amtNum) && Number.isFinite(costNum) && costNum > 0) {
            var pctShown = Math.round((amtNum / costNum) * 100);
            lines.push("(" + pctShown + "% of stated course cost " + cost + ")");
          }
        }
      } else if (cost) lines.push("Course cost stated on application: " + cost);
      if (clean(a.reimbursement_schedule)) {
        lines.push("Reimbursement schedule: " + clean(a.reimbursement_schedule));
      } else {
        lines.push(
          "Reimbursement schedule: 50% after 6 months of continuous employment following course completion; 50% after 12 months (unless otherwise agreed in writing)."
        );
      }
      if (clean(a.additional_conditions)) {
        lines.push("Additional conditions: " + clean(a.additional_conditions));
      }
      if (clean(a.exceptional_funding_arrangement)) {
        lines.push(
          "Exceptional funding arrangement: " + clean(a.exceptional_funding_arrangement)
        );
      }
      lines.push("");
      lines.push(
        "Please do not enrol on the course until you have received this written confirmation. " +
          "Unless otherwise agreed, you remain responsible for paying course fees directly to the training provider. " +
          "Reimbursement is subject to successful completion of the approved learning and your remaining in continuous employment, as set out in POL-049."
      );
      if (st === "approved_conditional") {
        lines.push("");
        lines.push(
          "This approval is conditional upon the additional conditions stated above being met."
        );
      }
    } else {
      lines.push("");
      lines.push(
        "Your application is currently under review. You will receive written confirmation once a decision has been made."
      );
    }

    lines.push("");
    lines.push("If you have any questions, please contact Human Resources.");
    lines.push("");
    lines.push("Yours sincerely,");
    lines.push("");
    lines.push("Human Resources");
    lines.push(ORG);

    return lines;
  }

  function buildEmailBody(app) {
    var lines = buildParagraphs(app);
    var header = [
      subjectFor(app),
      "",
      "Date: " + letterDate(app),
      "Employee: " + clean(app.employee_name),
      "Course: " + clean(app.course_title),
      "",
      "---",
      "",
    ];
    return header.concat(lines).join("\n");
  }

  function buildPlainLines(app) {
    return [
      ORG,
      SCHEME,
      "Decision letter",
      "",
      "Date: " + letterDate(app),
      "Employee: " + clean(app.employee_name),
      clean(app.job_title) ? "Job title: " + clean(app.job_title) : "",
      clean(app.service_department) ? "Department: " + clean(app.service_department) : "",
      "Course: " + clean(app.course_title),
      clean(app.training_provider) ? "Provider: " + clean(app.training_provider) : "",
      "Decision: " + decisionLabel(app.status),
      "",
    ]
      .filter(function (l) {
        return l !== "";
      })
      .concat(buildParagraphs(app));
  }

  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function logoSrcForHtml() {
    try {
      if (global.location && global.location.href) {
        return new URL(PDF_LOGO_URLS[0], global.location.href).href;
      }
    } catch (_) {}
    return "/" + PDF_LOGO_URLS[0];
  }

  function buildLetterHtml(app) {
    var paras = buildParagraphs(app);
    var body = paras
      .map(function (p) {
        if (!p) return "<br>";
        return "<p style=\"margin:0 0 12px;line-height:1.55;color:#1f2937\">" + escHtml(p) + "</p>";
      })
      .join("");
    var logoSrc = escHtml(logoSrcForHtml());
    return (
      '<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8">' +
      "<title>" +
      escHtml(subjectFor(app)) +
      '</title></head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1f2937">' +
      '<div style="text-align:center;margin:0 0 16px">' +
      '<img src="' +
      logoSrc +
      '" alt="clubSENsational" width="96" height="96" style="width:96px;height:auto;display:inline-block" ' +
      'onerror="this.onerror=null;this.src=\'/portal/portal_crest.svg\'" />' +
      "</div>" +
      '<div style="border-bottom:3px solid #f4b942;padding-bottom:12px;margin-bottom:20px">' +
      '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#9a6700;font-weight:700">' +
      escHtml(ORG) +
      "</div>" +
      '<h1 style="margin:6px 0 4px;font-size:22px;color:#2d3e50">' +
      escHtml(decisionLabel(app.status)) +
      " — L&amp;D funding</h1>" +
      '<div style="font-size:13px;color:#64748b">Date: ' +
      escHtml(letterDate(app)) +
      "</div></div>" +
      '<dl style="margin:0 0 18px;font-size:14px;display:grid;grid-template-columns:120px 1fr;gap:6px 12px">' +
      "<dt style=\"font-weight:700;color:#475569\">Employee</dt><dd style=\"margin:0\">" +
      escHtml(app.employee_name) +
      "</dd>" +
      "<dt style=\"font-weight:700;color:#475569\">Course</dt><dd style=\"margin:0;overflow-wrap:break-word\">" +
      escHtml(app.course_title) +
      "</dd>" +
      (clean(app.training_provider)
        ? '<dt style="font-weight:700;color:#475569">Provider</dt><dd style="margin:0">' +
          escHtml(app.training_provider) +
          "</dd>"
        : "") +
      "</dl>" +
      body +
      '<p style="margin:24px 0 0;font-size:11px;color:#94a3b8">' +
      escHtml(SCHEME) +
      " · Version 1.0</p></body></html>"
    );
  }

  function sanitizeFilenamePart(s) {
    return (
      clean(s)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "letter"
    );
  }

  function documentTitle(app) {
    var st = statusKey(app);
    var bit =
      st === "approved"
        ? "Approval"
        : st === "declined"
          ? "Decline"
          : st === "approved_conditional"
            ? "Conditional approval"
            : "Decision";
    var course = clean(app.course_title);
    return "L&D funding — " + bit + (course ? " — " + course : "");
  }

  function pdfFilename(app) {
    var stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return stamp + "_ld-funding-" + sanitizeFilenamePart(decisionLabel(app.status)) + ".pdf";
  }

  function ensureJsPdf() {
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve(global.jspdf);
    return new Promise(function (resolve, reject) {
      var existing = global.document.querySelector('script[data-portal-jspdf="1"]');
      if (existing) {
        existing.addEventListener("load", function () {
          if (global.jspdf && global.jspdf.jsPDF) resolve(global.jspdf);
          else reject(new Error("jsPDF failed to load"));
        });
        existing.addEventListener("error", function () {
          reject(new Error("jsPDF failed to load"));
        });
        return;
      }
      var s = global.document.createElement("script");
      s.src = JSPDF_URL;
      s.async = true;
      s.setAttribute("data-portal-jspdf", "1");
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

  function readImageUrlAsDataUrl(url) {
    return fetch(url, { mode: "cors" })
      .then(function (res) {
        if (!res.ok) return "";
        return res.blob();
      })
      .then(function (blob) {
        if (!blob) return "";
        return new Promise(function (resolve) {
          var r = new FileReader();
          r.onload = function () {
            resolve(String(r.result || ""));
          };
          r.onerror = function () {
            resolve("");
          };
          r.readAsDataURL(blob);
        });
      })
      .catch(function () {
        return "";
      });
  }

  function loadPdfLogoDataUrl() {
    if (logoDataUrlCache) return Promise.resolve(logoDataUrlCache);
    var list = [];
    try {
      if (global.location && global.location.href) {
        PDF_LOGO_URLS.forEach(function (rel) {
          try {
            list.push(new URL(rel, global.location.href).href);
          } catch (_) {}
        });
      }
    } catch (_) {}
    PDF_LOGO_URLS.forEach(function (rel) {
      list.push(rel);
      list.push("/" + rel);
    });
    var seen = {};
    var chain = Promise.resolve("");
    list.forEach(function (url) {
      if (!url || seen[url]) return;
      seen[url] = true;
      chain = chain.then(function (data) {
        if (data) return data;
        return readImageUrlAsDataUrl(url);
      });
    });
    return chain.then(function (data) {
      if (data) logoDataUrlCache = data;
      return data || "";
    });
  }

  function drawPdfLogo(pdf, logoDataUrl, pageW) {
    if (!logoDataUrl) return 18;
    try {
      var fmt = /^data:image\/jpe?g/i.test(logoDataUrl)
        ? "JPEG"
        : /^data:image\/svg/i.test(logoDataUrl)
          ? "PNG"
          : "PNG";
      if (/^data:image\/svg/i.test(logoDataUrl)) {
        /* jsPDF cannot embed SVG reliably — skip to text-only header */
        return 18;
      }
      var props = pdf.getImageProperties(logoDataUrl);
      var iw = props.width || 1;
      var ih = props.height || 1;
      var logoBox = 28;
      var scale = Math.min(logoBox / iw, logoBox / ih);
      var logoW = iw * scale;
      var logoH = ih * scale;
      var logoX = (pageW - logoW) / 2;
      pdf.addImage(logoDataUrl, fmt, logoX, 12, logoW, logoH);
      return 12 + logoH + 8;
    } catch (_) {
      return 18;
    }
  }

  function writePdfLines(pdf, lines, startY, margin, boldFirstOrgLine) {
    var y = startY;
    var pageW = pdf.internal.pageSize.getWidth();
    var maxW = pageW - margin * 2;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    lines.forEach(function (line, idx) {
      if (boldFirstOrgLine && idx === 0) {
        pdf.setFontSize(13);
        pdf.setFont("helvetica", "bold");
      } else if (boldFirstOrgLine && idx === 2) {
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "normal");
      }
      if (!line) {
        y += 4;
        return;
      }
      var wrapped = pdf.splitTextToSize(line, maxW);
      wrapped.forEach(function (wl) {
        if (y > 280) {
          pdf.addPage();
          y = 18;
        }
        pdf.text(wl, margin, y);
        y += 6;
      });
    });
  }

  function buildLetterPdfBlob(app) {
    return Promise.all([ensureJsPdf(), loadPdfLogoDataUrl()]).then(function (parts) {
      var logoDataUrl = parts[1];
      var pdf = new global.jspdf.jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      var pageW = pdf.internal.pageSize.getWidth();
      var margin = 18;
      var y = drawPdfLogo(pdf, logoDataUrl, pageW);
      writePdfLines(pdf, buildPlainLines(app), y, margin, true);
      return pdf.output("blob");
    });
  }

  function copyText(text) {
    var t = String(text || "");
    if (!t) return Promise.reject(new Error("Nothing to copy."));
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      return global.navigator.clipboard.writeText(t);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = global.document.createElement("textarea");
        ta.value = t;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px;top:0";
        global.document.body.appendChild(ta);
        ta.select();
        var ok = global.document.execCommand("copy");
        global.document.body.removeChild(ta);
        if (ok) resolve();
        else reject(new Error("Copy blocked — select the text manually."));
      } catch (err) {
        reject(err);
      }
    });
  }

  function printLetter(app) {
    var html = buildLetterHtml(app);
    var w = global.open("", "_blank", "noopener,noreferrer");
    if (!w) throw new Error("Pop-up blocked — allow pop-ups to print.");
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    global.setTimeout(function () {
      try {
        w.print();
      } catch (_) {}
    }, 350);
  }

  function downloadPdfBlob(blob, filename) {
    var url = global.URL.createObjectURL(blob);
    var a = global.document.createElement("a");
    a.href = url;
    a.download = filename || "ld-funding-letter.pdf";
    a.rel = "noopener";
    global.document.body.appendChild(a);
    a.click();
    global.document.body.removeChild(a);
    global.setTimeout(function () {
      try {
        global.URL.revokeObjectURL(url);
      } catch (_) {}
    }, 2000);
  }

  function buildLetterPdfBlobFromText(text) {
    return Promise.all([ensureJsPdf(), loadPdfLogoDataUrl()]).then(function (parts) {
      var logoDataUrl = parts[1];
      var pdf = new global.jspdf.jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      var pageW = pdf.internal.pageSize.getWidth();
      var margin = 18;
      var y = drawPdfLogo(pdf, logoDataUrl, pageW);
      writePdfLines(pdf, String(text || "").split(/\r?\n/), y, margin, false);
      return pdf.output("blob");
    });
  }

  function buildLetterHtmlFromText(text, subject) {
    var logoSrc = escHtml(logoSrcForHtml());
    return (
      '<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><title>' +
      escHtml(subject || "L&D funding decision") +
      '</title></head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1f2937">' +
      '<div style="text-align:center;margin:0 0 16px">' +
      '<img src="' +
      logoSrc +
      '" alt="clubSENsational" width="96" height="96" style="width:96px;height:auto;display:inline-block" ' +
      'onerror="this.onerror=null;this.src=\'/portal/portal_crest.svg\'" />' +
      "</div>" +
      '<pre style="margin:0;font-family:inherit;font-size:14px;line-height:1.55;white-space:pre-wrap;overflow-wrap:break-word">' +
      escHtml(text || "") +
      "</pre></body></html>"
    );
  }

  function printLetterText(text, subject) {
    var html = buildLetterHtmlFromText(text, subject);
    var w = global.open("", "_blank", "noopener,noreferrer");
    if (!w) throw new Error("Pop-up blocked — allow pop-ups to print.");
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    global.setTimeout(function () {
      try {
        w.print();
      } catch (_) {}
    }, 350);
  }

  function isDecided(app) {
    var st = statusKey(app);
    return st === "approved" || st === "declined" || st === "approved_conditional";
  }

  global.PortalLDFundingLetters = {
    isDecided: isDecided,
    subjectFor: subjectFor,
    buildEmailBody: buildEmailBody,
    buildLetterHtml: buildLetterHtml,
    buildLetterPdfBlob: buildLetterPdfBlob,
    buildLetterPdfBlobFromText: buildLetterPdfBlobFromText,
    buildLetterHtmlFromText: buildLetterHtmlFromText,
    copyText: copyText,
    printLetter: printLetter,
    printLetterText: printLetterText,
    downloadPdfBlob: downloadPdfBlob,
    documentTitle: documentTitle,
    pdfFilename: pdfFilename,
    decisionLabel: decisionLabel,
    DECLINE_REASONS: DECLINE_REASONS,
    DECLINE_REASON_OTHER: DECLINE_REASON_OTHER,
    normalizeDeclineCodes: normalizeDeclineCodes,
    buildDeclineReasonLines: buildDeclineReasonLines,
  };
})(typeof window !== "undefined" ? window : globalThis);
