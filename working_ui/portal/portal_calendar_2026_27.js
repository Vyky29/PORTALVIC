/**
 * Day Centre Calendar 2026/27 — announcement poster + PDF to My Documents on sign.
 * Term dates also feed future staff shift-update forms.
 */
(function (global) {
  "use strict";

  var POSTER_URL = "/portal/assets/calendar-2026-27-poster.png";
  var DOC_TITLE = "Calendar 2026/27";
  var DOC_TYPE = "calendar_2026_27";
  var DOC_CATEGORY = "documents";
  var DOC_SOURCE = "calendar-2026-27";
  var DOC_SESSION_KEY = "calendar-2026-27";
  var ON_ACK_ACTION = "calendar_2026_27";
  var JSPDF_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js?v=20260701-calendar";

  /** Source of truth for staff shift planning (2026/27). */
  global.PORTAL_DAY_CENTRE_CALENDAR_2026_27 = {
    academicYear: "2026-2027",
    label: "Day Centre Term Dates & Calendar 2026/27",
    posterUrl: POSTER_URL,
    terms: [
      {
        id: "autumn_2026",
        name: "Autumn Term",
        starts: "2026-09-05",
        halfTermOpen: { from: "2026-10-26", to: "2026-10-30" },
        christmasClosed: { from: "2026-12-19", to: "2027-01-03" },
      },
      {
        id: "spring_2027",
        name: "Spring Term",
        starts: "2027-01-04",
        halfTermOpen: { from: "2027-02-15", to: "2027-02-19" },
        easterClosed: { from: "2027-03-26", to: "2027-04-11" },
      },
      {
        id: "summer_2027",
        name: "Summer Term",
        starts: "2027-04-12",
        halfTermOpen: { from: "2027-05-31", to: "2027-06-04" },
        lastDay: "2027-07-30",
        summerProvision: { from: "2027-07-19", to: "2027-07-30" },
      },
    ],
    weekendClosures: [
      { from: "2026-10-24", to: "2026-10-25" },
      { from: "2026-10-31", to: "2026-11-01" },
      { from: "2027-02-13", to: "2027-02-14" },
      { from: "2027-02-20", to: "2027-02-21" },
      { from: "2027-05-29", to: "2027-05-30" },
      { from: "2027-06-05", to: "2027-06-06" },
    ],
    /** First open day through last open day of the academic year. */
    openFrom: "2026-09-05",
    openTo: "2027-07-30",
  };

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = global.document.createElement("script");
      s.src = src;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Could not load " + src));
      };
      (global.document.head || global.document.documentElement).appendChild(s);
    });
  }

  function ensureJsPdf() {
    if (global.jspdf && global.jspdf.jsPDF) return Promise.resolve();
    return loadScript(JSPDF_URL);
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("Could not load calendar poster"));
      };
      img.src = url;
    });
  }

  async function importDocumentsModule() {
    var v = "20260701-calendar";
    var bases = ["/portal/portal_documents.js", "portal/portal_documents.js"];
    for (var i = 0; i < bases.length; i++) {
      try {
        return await import(bases[i] + "?v=" + v);
      } catch (e) {
        try {
          console.warn("[calendar-2026-27] import", bases[i], e);
        } catch (_) {}
      }
    }
    throw new Error("portal_documents.js not available");
  }

  async function posterImageToPdfBlob() {
    await ensureJsPdf();
    var img = await loadImage(POSTER_URL);
    var w = img.naturalWidth || 1600;
    var h = img.naturalHeight || 1131;
    if (!global.jspdf || !global.jspdf.jsPDF) throw new Error("jsPDF missing");
    var pdf = new global.jspdf.jsPDF({
      orientation: w >= h ? "landscape" : "portrait",
      unit: "px",
      format: [w, h],
      compress: true,
    });
    var canvas = global.document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    var dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    pdf.addImage(dataUrl, "JPEG", 0, 0, w, h);
    return pdf.output("blob");
  }

  global.portalCalendar202627PosterUrl = function portalCalendar202627PosterUrl() {
    return POSTER_URL;
  };

  global.portalSignableItemIsCalendar202627 = function portalSignableItemIsCalendar202627(item) {
    return String(item && (item.onAckAction || item.on_ack_action) || "").trim() === ON_ACK_ACTION;
  };

  /**
   * Save Calendar 2026/27 PDF to My Documents (idempotent per user).
   * @returns {Promise<{ savedToDocuments: boolean, alreadyHad?: boolean }>}
   */
  global.portalSaveCalendar202627PdfToMyDocuments = async function portalSaveCalendar202627PdfToMyDocuments() {
    var docs = await importDocumentsModule();
    if (
      typeof docs.portalRequireUser !== "function" ||
      typeof docs.portalUploadPdfAndCreateDocument !== "function"
    ) {
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
    var pdfBlob = await posterImageToPdfBlob();
    await docs.portalUploadPdfAndCreateDocument({
      blob: pdfBlob,
      document_type: DOC_TYPE,
      category: DOC_CATEGORY,
      title: DOC_TITLE,
      source_page: DOC_SOURCE,
      related_date: "2026-09-05",
      related_session_key: DOC_SESSION_KEY,
      reuseAuth: auth,
    });
    return { savedToDocuments: true, alreadyHad: false };
  };
})(typeof window !== "undefined" ? window : globalThis);
