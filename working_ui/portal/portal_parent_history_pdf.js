/**
 * Parent portal — branded PDF downloads for weekly notes + session feedback
 * (former / place-released history keep).
 */
(function (global) {
  "use strict";

  var JSPDF_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js?v=20260902-parent-history";
  var PDF_LOGO_URLS = [
    "portal/logoPDF.png",
    "logoPDF.png",
    "portal/F-02-1.png",
    "/portal/logoPDF.png",
    "/logoPDF.png",
    "/portal/F-02-1.png",
  ];
  var ORG = "clubSENsational";
  var logoDataUrlCache = null;

  function clean(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
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
            list.push(new URL(rel.replace(/^\//, ""), global.location.href).href);
          } catch (_e) {}
          if (rel.charAt(0) === "/") list.push(rel);
        });
      }
    } catch (_e2) {}
    PDF_LOGO_URLS.forEach(function (rel) {
      list.push(rel);
    });
    var seen = Object.create(null);
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
    if (!logoDataUrl) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(45, 132, 179);
      pdf.text(ORG, pageW / 2, 18, { align: "center" });
      pdf.setTextColor(23, 50, 71);
      return 26;
    }
    try {
      var fmt = /^data:image\/jpe?g/i.test(logoDataUrl) ? "JPEG" : "PNG";
      var props = pdf.getImageProperties(logoDataUrl);
      var iw = props.width || 1;
      var ih = props.height || 1;
      var logoBox = 26;
      var scale = Math.min(logoBox / iw, logoBox / ih);
      var logoW = iw * scale;
      var logoH = ih * scale;
      var logoX = (pageW - logoW) / 2;
      pdf.addImage(logoDataUrl, fmt, logoX, 10, logoW, logoH);
      return 10 + logoH + 6;
    } catch (_e) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(45, 132, 179);
      pdf.text(ORG, pageW / 2, 18, { align: "center" });
      pdf.setTextColor(23, 50, 71);
      return 26;
    }
  }

  function drawFooter(pdf, pageW, pageH, margin) {
    pdf.setDrawColor(200, 210, 220);
    pdf.setLineWidth(0.3);
    pdf.line(margin, pageH - 14, pageW - margin, pageH - 14);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(114, 130, 144);
    pdf.text(ORG + " · Family portal", margin, pageH - 8);
    pdf.text(
      "Generated " +
        new Date().toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      pageW - margin,
      pageH - 8,
      { align: "right" },
    );
    pdf.setTextColor(23, 50, 71);
  }

  function ensureSpace(pdf, y, need, margin, pageW, pageH, logoDataUrl) {
    if (y + need <= pageH - 18) return y;
    drawFooter(pdf, pageW, pageH, margin);
    pdf.addPage();
    var top = drawPdfLogo(pdf, logoDataUrl, pageW);
    return top + 4;
  }

  function writeWrapped(pdf, text, x, y, maxW, lineH) {
    var lines = pdf.splitTextToSize(clean(text) || "—", maxW);
    pdf.text(lines, x, y);
    return y + lines.length * lineH;
  }

  function saveBlob(filename, blob) {
    var name = String(filename || "download.pdf").replace(/[^\w.\-]+/g, "_");
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
      } catch (_e) {}
    }, 1200);
  }

  function participantLabel(opts) {
    return clean((opts && opts.participantName) || "Participant") || "Participant";
  }

  function fmtDate(iso) {
    var s = clean(iso).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return clean(iso) || "—";
    try {
      var p = s.split("-").map(Number);
      return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (_e) {
      return s;
    }
  }

  function drawDocTitle(pdf, y, title, subtitle, pageW, margin) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(23, 50, 71);
    pdf.text(title, pageW / 2, y, { align: "center" });
    y += 7;
    if (subtitle) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(90, 106, 118);
      pdf.text(subtitle, pageW / 2, y, { align: "center" });
      y += 6;
    }
    pdf.setDrawColor(45, 132, 179);
    pdf.setLineWidth(0.6);
    pdf.line(margin + 20, y, pageW - margin - 20, y);
    pdf.setTextColor(23, 50, 71);
    return y + 8;
  }

  function buildWeeklyNotePdf(opts) {
    opts = opts || {};
    return Promise.all([ensureJsPdf(), loadPdfLogoDataUrl()]).then(function (parts) {
      var logoDataUrl = parts[1];
      var pdf = new global.jspdf.jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var margin = 18;
      var y = drawPdfLogo(pdf, logoDataUrl, pageW);
      y = drawDocTitle(
        pdf,
        y,
        "Weekly note",
        participantLabel(opts) + (opts.weekLabel ? " · " + opts.weekLabel : ""),
        pageW,
        margin,
      );
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      y = writeWrapped(pdf, opts.body || "", margin, y, pageW - margin * 2, 6);
      drawFooter(pdf, pageW, pageH, margin);
      return pdf.output("blob");
    });
  }

  function buildWeeklyNotesBundlePdf(opts) {
    opts = opts || {};
    var notes = Array.isArray(opts.notes) ? opts.notes : [];
    return Promise.all([ensureJsPdf(), loadPdfLogoDataUrl()]).then(function (parts) {
      var logoDataUrl = parts[1];
      var pdf = new global.jspdf.jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var margin = 18;
      var y = drawPdfLogo(pdf, logoDataUrl, pageW);
      y = drawDocTitle(
        pdf,
        y,
        "Weekly notes",
        participantLabel(opts) + " · " + notes.length + (notes.length === 1 ? " note" : " notes"),
        pageW,
        margin,
      );
      notes.forEach(function (n, idx) {
        y = ensureSpace(pdf, y, 28, margin, pageW, pageH, logoDataUrl);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(12);
        pdf.setTextColor(45, 132, 179);
        pdf.text(clean(n.weekLabel || n.week_start || "Week") || "Week", margin, y);
        y += 6;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(11);
        pdf.setTextColor(23, 50, 71);
        y = writeWrapped(pdf, n.body || "", margin, y, pageW - margin * 2, 6);
        y += 6;
        if (idx < notes.length - 1) {
          pdf.setDrawColor(220, 228, 236);
          pdf.setLineWidth(0.3);
          pdf.line(margin, y, pageW - margin, y);
          y += 8;
        }
      });
      drawFooter(pdf, pageW, pageH, margin);
      return pdf.output("blob");
    });
  }

  function sessionStatsFromRows(rows) {
    var list = rows || [];
    var total = list.length;
    var absent = 0;
    var eng = [];
    list.forEach(function (r) {
      var att = clean(r.attendance).toLowerCase();
      if (att.indexOf("absent") >= 0 || r.parent_absent) absent += 1;
      var n = Number(r.engagement_rating);
      if (Number.isFinite(n) && n >= 1 && n <= 5) eng.push(n);
    });
    var present = Math.max(0, total - absent);
    var engAvg = eng.length ? eng.reduce(function (a, b) { return a + b; }, 0) / eng.length : null;
    return {
      total: total,
      present: present,
      absent: absent,
      pctPresent: total ? Math.round((present / total) * 100) : 0,
      engAvg: engAvg,
      engCount: eng.length,
    };
  }

  function drawStatsBox(pdf, y, stats, pageW, margin) {
    var boxH = 28;
    pdf.setFillColor(234, 245, 251);
    pdf.setDrawColor(45, 132, 179);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(margin, y, pageW - margin * 2, boxH, 2, 2, "FD");
    var colW = (pageW - margin * 2) / 3;
    var labels = [
      ["Attendance", stats.pctPresent + "% · " + stats.present + "/" + stats.total],
      [
        "Engagement",
        stats.engAvg != null ? stats.engAvg.toFixed(1) + " / 5 avg" : "—",
      ],
      ["Sessions", String(stats.total) + (stats.absent ? " (" + stats.absent + " absent)" : "")],
    ];
    labels.forEach(function (pair, i) {
      var cx = margin + colW * i + colW / 2;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(90, 106, 118);
      pdf.text(pair[0], cx, y + 10, { align: "center" });
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(23, 50, 71);
      pdf.text(pair[1], cx, y + 20, { align: "center" });
    });
    return y + boxH + 10;
  }

  function buildSessionsOverviewPdf(opts) {
    opts = opts || {};
    var rows = Array.isArray(opts.sessions) ? opts.sessions : [];
    return Promise.all([ensureJsPdf(), loadPdfLogoDataUrl()]).then(function (parts) {
      var logoDataUrl = parts[1];
      var pdf = new global.jspdf.jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      var margin = 16;
      var y = drawPdfLogo(pdf, logoDataUrl, pageW);
      y = drawDocTitle(
        pdf,
        y,
        "Sessions overview",
        participantLabel(opts) +
          (opts.termLabel ? " · " + opts.termLabel : "") +
          " · " +
          rows.length +
          (rows.length === 1 ? " session" : " sessions"),
        pageW,
        margin,
      );
      var stats = sessionStatsFromRows(rows);
      y = drawStatsBox(pdf, y, stats, pageW, margin);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(45, 132, 179);
      pdf.text("Session feedback", margin, y);
      y += 6;

      rows.forEach(function (row, idx) {
        y = ensureSpace(pdf, y, 32, margin, pageW, pageH, logoDataUrl);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.setTextColor(23, 50, 71);
        var head =
          fmtDate(row.session_date) +
          (clean(row.service) ? " · " + clean(row.service) : "");
        y = writeWrapped(pdf, head, margin, y, pageW - margin * 2, 5);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(90, 106, 118);
        var meta = [
          clean(row.session_time) ? "Time: " + clean(row.session_time) : "",
          clean(row.instructor || row.feedback_by_name || row.completed_by_name)
            ? "Instructor: " + clean(row.instructor || row.feedback_by_name || row.completed_by_name)
            : "",
          row.engagement_rating != null && String(row.engagement_rating).trim() !== ""
            ? "Engagement: " + String(row.engagement_rating)
            : "",
          clean(row.client_emotions) ? "Regulation: " + clean(row.client_emotions) : "",
          clean(row.independence || row.engagement_patterns)
            ? "Independence: " + clean(row.independence || row.engagement_patterns)
            : "",
        ]
          .filter(Boolean)
          .join("  ·  ");
        if (meta) y = writeWrapped(pdf, meta, margin, y, pageW - margin * 2, 4.5);
        var note = clean(row.comment || row.parent_message);
        if (note) {
          pdf.setFontSize(10);
          pdf.setTextColor(23, 50, 71);
          y = writeWrapped(pdf, note, margin, y, pageW - margin * 2, 5);
        }
        y += 4;
        if (idx < rows.length - 1) {
          pdf.setDrawColor(220, 228, 236);
          pdf.line(margin, y, pageW - margin, y);
          y += 6;
        }
      });
      drawFooter(pdf, pageW, pageH, margin);
      return pdf.output("blob");
    });
  }

  function buildSingleSessionPdf(opts) {
    opts = opts || {};
    var row = opts.session || {};
    return buildSessionsOverviewPdf({
      participantName: opts.participantName,
      termLabel: opts.termLabel,
      sessions: [row],
    });
  }

  function downloadWeeklyNote(opts) {
    var slug = clean(opts && opts.filenameSlug) || "weekly-note";
    return buildWeeklyNotePdf(opts).then(function (blob) {
      saveBlob(slug + ".pdf", blob);
      return blob;
    });
  }

  function downloadWeeklyNotesAll(opts) {
    var slug = clean(opts && opts.filenameSlug) || "weekly-notes";
    return buildWeeklyNotesBundlePdf(opts).then(function (blob) {
      saveBlob(slug + ".pdf", blob);
      return blob;
    });
  }

  function downloadSessionsOverview(opts) {
    var slug = clean(opts && opts.filenameSlug) || "sessions-overview";
    return buildSessionsOverviewPdf(opts).then(function (blob) {
      saveBlob(slug + ".pdf", blob);
      return blob;
    });
  }

  function downloadSingleSession(opts) {
    var slug = clean(opts && opts.filenameSlug) || "session-feedback";
    return buildSingleSessionPdf(opts).then(function (blob) {
      saveBlob(slug + ".pdf", blob);
      return blob;
    });
  }

  global.PortalParentHistoryPdf = {
    downloadWeeklyNote: downloadWeeklyNote,
    downloadWeeklyNotesAll: downloadWeeklyNotesAll,
    downloadSessionsOverview: downloadSessionsOverview,
    downloadSingleSession: downloadSingleSession,
    buildWeeklyNotePdf: buildWeeklyNotePdf,
    buildSessionsOverviewPdf: buildSessionsOverviewPdf,
  };
})(typeof window !== "undefined" ? window : globalThis);
