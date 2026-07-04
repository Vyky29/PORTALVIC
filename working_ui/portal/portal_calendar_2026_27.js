/**
 * Day Centre Calendar 2026/27 — HTML calendar in announcement modal + PDF to My Documents on sign.
 * Term dates also feed future staff shift-update forms.
 */
(function (global) {
  "use strict";

  var HTML_SECTION_URL =
    "/portal/day-centre-calendar-2026-27-section.html?v=20260704-term-edges-crash-v2";
  var DOC_TITLE = "Calendar 2026/27";
  var DOC_TYPE = "calendar_2026_27";
  var DOC_CATEGORY = "documents";
  var DOC_SOURCE = "calendar-2026-27";
  var DOC_SESSION_KEY = "calendar-2026-27";
  var ON_ACK_ACTION = "calendar_2026_27";
  /** Bump when calendar content changes — staff must re-ack to see updates. */
  global.PORTAL_CALENDAR_2026_27_ACK_REVISION = 2;
  var CALENDAR_ANNOUNCEMENT_ID = "a0270001-0001-4000-8000-0000000a2701";
  var JSPDF_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js?v=20260702-html-cal";
  var HTML2CANVAS_URL =
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js?v=20260702-html-cal";

  /** Source of truth for staff shift planning (2026/27). */
  global.PORTAL_DAY_CENTRE_CALENDAR_2026_27 = {
    academicYear: "2026-2027",
    label: "Day Centre Term Dates & Calendar 2026/27",
    htmlSectionUrl: HTML_SECTION_URL,
    terms: [
      {
        id: "autumn_2026",
        name: "Autumn Term",
        starts: "2026-09-01",
        ends: "2026-12-18",
        christmasClosed: { from: "2026-12-19", to: "2027-01-03" },
      },
      {
        id: "spring_2027",
        name: "Spring Term",
        starts: "2027-01-04",
        ends: "2027-03-25",
        easterClosed: { from: "2027-03-26", to: "2027-04-11" },
      },
      {
        id: "summer_2027",
        name: "Summer Term",
        starts: "2027-04-12",
        mainTermEnds: "2027-07-16",
        summerProvision: { from: "2027-07-19", to: "2027-07-30" },
        lastDay: "2027-07-30",
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
    openFrom: "2026-09-01",
    openTo: "2027-07-30",
  };

  var _cachedSectionHtml = "";

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

  function ensureHtml2Canvas() {
    if (typeof global.html2canvas === "function") return Promise.resolve();
    return loadScript(HTML2CANVAS_URL);
  }

  function calendarSectionFetchUrl() {
    try {
      if (typeof location !== "undefined" && location.href) {
        return new URL(HTML_SECTION_URL, location.href).href;
      }
    } catch (_) {}
    return HTML_SECTION_URL;
  }

  async function fetchCalendarSectionHtml() {
    if (_cachedSectionHtml) return _cachedSectionHtml;
    var res = await fetch(calendarSectionFetchUrl(), { cache: "force-cache" });
    if (!res.ok) throw new Error("Could not load calendar section");
    _cachedSectionHtml = await res.text();
    return _cachedSectionHtml;
  }

  async function buildCalendarSectionNode() {
    var html = await fetchCalendarSectionHtml();
    var doc = new DOMParser().parseFromString(html, "text/html");
    var root = doc.querySelector(".dc-cal");
    if (!root) throw new Error("Calendar section missing");
    return root.cloneNode(true);
  }

  /**
   * Standalone preview node showing just the After-Schools Autumn term card
   * (same markup/styles as the full calendar). For the re-enrolment lead card.
   */
  global.portalBuildCalendar202627AutumnPreview =
    async function portalBuildCalendar202627AutumnPreview() {
      var html = await fetchCalendarSectionHtml();
      var doc = new DOMParser().parseFromString(html, "text/html");
      var root = doc.querySelector(".dc-cal");
      if (!root) throw new Error("Calendar section missing");
      var article = root.querySelector("#dcCalSessionsPanel .dc-cal-term");
      if (!article) throw new Error("Autumn term not found");
      var styleEl = root.querySelector("style");
      var wrap = global.document.createElement("div");
      wrap.className = "dc-cal dc-cal--preview";
      if (styleEl) wrap.appendChild(styleEl.cloneNode(true));
      var panel = global.document.createElement("div");
      panel.id = "dcCalSessionsPanel";
      var art = article.cloneNode(true);
      // Preview only: title + month grids only (drop the term info list + week
      // count — the full modal keeps them).
      var info = art.querySelector(".dc-cal-term__info");
      var weeks = art.querySelector(".dc-cal-term__weeks");
      if (info) info.remove();
      if (weeks) weeks.remove();
      // Preview only: short month labels (e.g. "Sep 2026") so they fit on one line.
      var labels = art.querySelectorAll(".dc-cal-month__label");
      Array.prototype.forEach.call(labels, function (el) {
        var parts = String(el.textContent || "").trim().split(/\s+/);
        if (parts.length && parts[0].length > 3) {
          parts[0] = parts[0].slice(0, 3);
          el.textContent = parts.join(" ");
        }
      });
      panel.appendChild(art);
      wrap.appendChild(panel);
      try {
        global.portalMarkCalendar202627Highlights(wrap);
      } catch (_) {}
      return wrap;
    };

  async function importDocumentsModule() {
    var v = "20260702-html-cal";
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

  function captureCalendarSectionCanvas(sectionEl) {
    var w = Math.max(sectionEl.scrollWidth || 0, sectionEl.offsetWidth || 0, 900);
    var h = Math.max(sectionEl.scrollHeight || 0, sectionEl.offsetHeight || 0, 400);
    return global.html2canvas(sectionEl, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      logging: false,
      letterRendering: true,
      scrollX: 0,
      scrollY: 0,
      windowWidth: w,
      windowHeight: h,
      backgroundColor: "#FFFFFF",
    });
  }

  function canvasToPdfBlob(canvas) {
    if (!global.jspdf || !global.jspdf.jsPDF) throw new Error("jsPDF missing");
    var pdf = new global.jspdf.jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
      compress: true,
    });
    var margin = 8;
    var pageW = pdf.internal.pageSize.getWidth();
    var pageH = pdf.internal.pageSize.getHeight();
    var drawW = pageW - 2 * margin;
    var imgData = canvas.toDataURL("image/jpeg", 0.92);
    var imgH = (canvas.height * drawW) / canvas.width;
    var heightLeft = imgH;
    var y = margin;

    pdf.addImage(imgData, "JPEG", margin, y, drawW, imgH);
    heightLeft -= pageH - 2 * margin;

    while (heightLeft > 0) {
      y = margin - (imgH - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", margin, y, drawW, imgH);
      heightLeft -= pageH - 2 * margin;
    }

    return pdf.output("blob");
  }

  async function htmlSectionToPdfBlob() {
    await ensureJsPdf();
    await ensureHtml2Canvas();
    var host = global.document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;left:-12000px;top:0;width:900px;background:#fff;z-index:-1;pointer-events:none;";
    global.document.body.appendChild(host);
    try {
      var section = await buildCalendarSectionNode();
      host.appendChild(section);
      try {
        void section.offsetWidth;
      } catch (_) {}
      await new Promise(function (r) {
        setTimeout(r, 80);
      });
      var canvas = await captureCalendarSectionCanvas(section);
      return canvasToPdfBlob(canvas);
    } finally {
      try {
        global.document.body.removeChild(host);
      } catch (_) {}
    }
  }

  global.portalCalendar202627SectionUrl = function portalCalendar202627SectionUrl() {
    return HTML_SECTION_URL;
  };

  /** @deprecated Poster replaced by HTML section — kept for older call sites. */
  global.portalCalendar202627PosterUrl = function portalCalendar202627PosterUrl() {
    return HTML_SECTION_URL;
  };

  global.portalSignableItemIsCalendar202627 = function portalSignableItemIsCalendar202627(item) {
    var annId = String((item && item.portalAnnouncementId) || "").trim();
    if (annId === CALENDAR_ANNOUNCEMENT_ID) return true;
    return String(item && (item.onAckAction || item.on_ack_action) || "").trim() === ON_ACK_ACTION;
  };

  global.portalAnnouncementRowIsCalendar202627 = function portalAnnouncementRowIsCalendar202627(row) {
    if (!row) return false;
    var annId = String(row.id || row.portalAnnouncementId || "").trim();
    if (annId && annId === CALENDAR_ANNOUNCEMENT_ID) return true;
    return String(row.on_ack_action || row.onAckAction || "").trim() === ON_ACK_ACTION;
  };

  /** Live calendar announcement row from dashboard notices (informational — no signature). */
  global.portalCalendar202627NoticeItem = function portalCalendar202627NoticeItem() {
    try {
      var dd = global.dashboardData;
      var raw = dd && Array.isArray(dd.notices) ? dd.notices : [];
      for (var i = 0; i < raw.length; i++) {
        var n = raw[i];
        if (n && global.portalSignableItemIsCalendar202627(n)) return n;
      }
      var live = dd && dd.portalLiveAnnouncementIdSet;
      if (live && live[CALENDAR_ANNOUNCEMENT_ID]) {
        var cached = dd.portalCalendar202627LiveNotice;
        if (cached && global.portalSignableItemIsCalendar202627(cached)) return cached;
        return {
          type: "announcement",
          title: "Calendar 2026/27",
          text: "Term dates — Day Centre, after-schools & crash courses",
          href: "#portal-ann-" + CALENDAR_ANNOUNCEMENT_ID,
          portalAnnouncementId: CALENDAR_ANNOUNCEMENT_ID,
          onAckAction: ON_ACK_ACTION,
          requiresSignature: false,
        };
      }
    } catch (_) {}
    return null;
  };

  global.portalCalendar202627AckKeySuffix = function portalCalendar202627AckKeySuffix() {
    return ":cal-v" + String(global.PORTAL_CALENDAR_2026_27_ACK_REVISION || 1);
  };

  global.portalCalendar202627SignatureKey = function portalCalendar202627SignatureKey(item) {
    var annId = String((item && item.portalAnnouncementId) || "").trim();
    if (!annId) return "";
    return "portal-ann:" + annId + global.portalCalendar202627AckKeySuffix();
  };

  /** First & last day of each After-Schools term (darker-green blinking underline). */
  var DC_CAL_TERM_EDGES = {
    "2026-09-05": "first",
    "2026-12-18": "last",
    "2027-01-04": "first",
    "2027-03-25": "last",
    "2027-04-12": "first",
    "2027-07-16": "last",
  };
  /** Crash-course days (Mon–Thu of each half term) — red, tappable to the crash timetable. */
  var DC_CAL_CRASH_DAYS = {
    "2026-10-26": 1, "2026-10-27": 1, "2026-10-28": 1, "2026-10-29": 1,
    "2027-02-15": 1, "2027-02-16": 1, "2027-02-17": 1, "2027-02-18": 1,
    "2027-05-31": 1, "2027-06-01": 1, "2027-06-02": 1, "2027-06-03": 1,
  };
  var DC_CAL_MONTHS = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };

  function dcCalPad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function dcCalMonthYearFromLabel(label) {
    var parts = String(label || "").trim().toLowerCase().split(/\s+/);
    if (parts.length < 2) return null;
    var mo = DC_CAL_MONTHS[parts[0]];
    var yr = parseInt(parts[1], 10);
    if (mo == null || !yr) return null;
    return { mo: mo, yr: yr };
  }

  /** Mark first/last term days and crash-course-week days in the After-Schools panel. */
  global.portalMarkCalendar202627Highlights = function portalMarkCalendar202627Highlights(root) {
    var section = null;
    if (root && root.querySelector) {
      section = root.classList && root.classList.contains("dc-cal") ? root : root.querySelector(".dc-cal");
    }
    if (!section && global.document) section = global.document.querySelector(".dc-cal");
    if (!section || section.__dcCalHighlighted) return;
    var panel = section.querySelector("#dcCalSessionsPanel");
    if (!panel) return;
    section.__dcCalHighlighted = true;
    var crashTab = section.querySelector("#dcCalCrashTab");
    var months = panel.querySelectorAll(".dc-cal-month");
    Array.prototype.forEach.call(months, function (mEl) {
      var labelEl = mEl.querySelector(".dc-cal-month__label");
      var my = dcCalMonthYearFromLabel(labelEl && labelEl.textContent);
      if (!my) return;
      var cells = mEl.querySelectorAll(".dc-cal-cell");
      Array.prototype.forEach.call(cells, function (cell) {
        var dayEl = cell.querySelector(".dc-cal-day");
        if (!dayEl) return;
        var day = parseInt(dayEl.textContent, 10);
        if (!day) return;
        var iso = my.yr + "-" + dcCalPad2(my.mo + 1) + "-" + dcCalPad2(day);
        var edge = DC_CAL_TERM_EDGES[iso];
        if (edge) {
          cell.classList.add("dc-cal-cell--term-edge");
          cell.setAttribute("title", edge === "first" ? "First day of term" : "Last day of term");
        }
        if (DC_CAL_CRASH_DAYS[iso]) {
          cell.classList.add("dc-cal-cell--crash");
          cell.setAttribute("role", "button");
          cell.setAttribute("tabindex", "0");
          cell.setAttribute("title", "Crash course — tap for the crash course timetable");
          cell.setAttribute("aria-label", "Crash course day " + day + " — open crash course timetable");
          var goCrash = function (ev) {
            if (ev && ev.preventDefault) ev.preventDefault();
            if (crashTab) {
              crashTab.click();
              if (crashTab.scrollIntoView) crashTab.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          };
          cell.addEventListener("click", goCrash);
          cell.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") goCrash(ev);
          });
        }
      });
    });
  };

  /** Tab switcher — required when HTML is injected (inline scripts do not run). */
  global.portalInitCalendar202627Tabs = function portalInitCalendar202627Tabs(root) {
    var section = null;
    if (root) {
      if (
        (root.classList && root.classList.contains("dc-cal")) ||
        root.id === "dcCal2627"
      ) {
        section = root;
      } else if (root.querySelector) {
        section = root.querySelector(".dc-cal");
      }
    }
    if (!section && global.document) {
      section = global.document.querySelector(".dc-cal");
    }
    if (!section) return;
    var tabs = section.querySelectorAll(".dc-cal-tab[data-dc-cal-target]");
    if (!tabs.length) return;

    function showPanel(targetId) {
      tabs.forEach(function (t) {
        var on = t.getAttribute("data-dc-cal-target") === targetId;
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      section.querySelectorAll(".dc-cal-panel").forEach(function (p) {
        p.hidden = p.id !== targetId;
      });
      section.querySelectorAll("[data-dc-cal-summary]").forEach(function (s) {
        s.hidden = s.getAttribute("data-dc-cal-summary") !== targetId;
      });
    }

    tabs.forEach(function (tab) {
      if (tab.__dcCalTabBound) return;
      tab.__dcCalTabBound = true;
      tab.addEventListener("click", function () {
        var target = tab.getAttribute("data-dc-cal-target");
        if (target) showPanel(target);
      });
    });

    var initial =
      section.querySelector('.dc-cal-tab[aria-selected="true"]') ||
      tabs[0];
    var initialTarget =
      initial && initial.getAttribute("data-dc-cal-target")
        ? initial.getAttribute("data-dc-cal-target")
        : "dcCalSessionsPanel";
    showPanel(initialTarget);
    try {
      global.portalMarkCalendar202627Highlights(section);
    } catch (_mark) {}
  };

  /** Inject the interactive HTML calendar into a host element (announcement modal). */
  global.portalLoadCalendar202627Into = async function portalLoadCalendar202627Into(host) {
    if (!host) return;
    host.textContent = "";
    host.setAttribute("role", "region");
    host.setAttribute("aria-label", "Day Centre term dates and calendar 2026/27");
    host.classList.add("portal-calendar-2026-27-preview--loading");
    try {
      var node = await buildCalendarSectionNode();
      host.appendChild(node);
      if (typeof global.portalInitCalendar202627Tabs === "function") {
        global.portalInitCalendar202627Tabs(node);
      }
    } catch (e) {
      try {
        console.warn("[calendar-2026-27] preview inject failed, using iframe", e);
      } catch (_) {}
      try {
        var iframe = global.document.createElement("iframe");
        iframe.className = "portal-calendar-2026-27-iframe";
        iframe.title = "Day Centre term dates and calendar 2026/27";
        iframe.src = calendarSectionFetchUrl();
        iframe.loading = "lazy";
        iframe.addEventListener("load", function () {
          host.classList.remove("portal-calendar-2026-27-preview--loading");
        });
        host.appendChild(iframe);
        return;
      } catch (e2) {
        try {
          console.warn("[calendar-2026-27] preview iframe", e2);
        } catch (_) {}
        host.innerHTML =
          '<p class="alerts-sheet-placeholder" style="margin:0;padding:12px;">Could not load calendar. Please try again.</p>';
      }
    } finally {
      host.classList.remove("portal-calendar-2026-27-preview--loading");
    }
  };

  function triggerBrowserPdfDownload(blob, filename) {
    var a = global.document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = String(filename || "Calendar 2026-27.pdf").trim() || "Calendar 2026-27.pdf";
    a.rel = "noopener";
    global.document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
      try {
        a.remove();
      } catch (_) {}
    }, 600);
  }

  /**
   * Save Calendar 2026/27 PDF to My Documents (idempotent per user).
   * @returns {Promise<{ savedToDocuments: boolean, alreadyHad?: boolean }>}
   */
  global.portalSaveCalendar202627PdfToMyDocuments = async function portalSaveCalendar202627PdfToMyDocuments(opts) {
    var pdfBlob =
      opts && opts.blob instanceof Blob ? opts.blob : await htmlSectionToPdfBlob();
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
      return { savedToDocuments: true, alreadyHad: true, blob: pdfBlob };
    }
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
    return { savedToDocuments: true, alreadyHad: false, blob: pdfBlob };
  };

  /**
   * Optional download: saves once to My Documents, always offers a browser PDF download.
   * @returns {Promise<{ savedToDocuments: boolean, alreadyHad?: boolean }>}
   */
  global.portalDownloadCalendar202627Pdf = async function portalDownloadCalendar202627Pdf() {
    var pdfBlob = await htmlSectionToPdfBlob();
    var result = await global.portalSaveCalendar202627PdfToMyDocuments({ blob: pdfBlob });
    triggerBrowserPdfDownload(pdfBlob, "Calendar 2026-27.pdf");
    return result;
  };
})(typeof window !== "undefined" ? window : globalThis);
