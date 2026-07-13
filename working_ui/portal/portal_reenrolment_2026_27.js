/**
 * Re-enrolment 2026/27 — parent link + family portal.
 * Lookup/submit via Supabase Edge Functions (no full client list in browser).
 */
(function (global) {
  "use strict";

  var ACADEMIC_YEAR = "2026-27";
  var SESSION_KEY = "clubsens_parent_portal_session_v1";
  var RE_ENROL_DEADLINE_ISO = "2026-07-17";
  var RE_ENROL_DEADLINE_LABEL = "Friday 17 July 2026";
  /** Bank transfer: the first payment of the year must reach us before term starts. */
  var RE_BANK_FIRST_DUE = "by 15 August 2026";

  /** Bank transfer · flexi term: 2 payments per term (1st on day 1 of term month + half-term week). */
  var RE_PAY_FLEXI_TERM = [
    {
      term: "autumn",
      termLabel: "Autumn term",
      halves: [
        { halfLabel: "1st half", due: "1 September 2026" },
        { halfLabel: "2nd half", due: "Monday 26 October 2026" },
      ],
    },
    {
      term: "spring",
      termLabel: "Spring term",
      halves: [
        { halfLabel: "1st half", due: "1 January 2027" },
        { halfLabel: "2nd half", due: "Monday 15 February 2027" },
      ],
    },
    {
      term: "summer",
      termLabel: "Summer term",
      halves: [
        { halfLabel: "1st half", due: "1 April 2027" },
        { halfLabel: "2nd half", due: "Monday 31 May 2027" },
      ],
    },
  ];

  var state = {
    step: "identify",
    lookup: null,
    choices: {},
    fromPortal: false,
    portalSession: "",
    contactId: "",
    avatarUrl: "",
    pendingPhotoFile: null,
    pendingPreviewUrl: "",
    billing2627: { fundCode: "privately_funded", payCode: "bank_transfer", editing: false },
    /** null until parent picks: whole_year | term_by_term */
    enrolmentCadence: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Same stroke icons as admin participant workspace tabs (photo 2). */
  var RE_ICON_SVGS = {
    registers:
      '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/>',
    photo:
      '<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
    billing:
      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    services:
      '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    daycentre:
      '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>',
    calendar:
      '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    contact:
      '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    submit:
      '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>',
    termStart:
      '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 14 11 16 15 12"/>',
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/>',
    halfTerm:
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    closure:
      '<path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>',
    lastDay:
      '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="15" x2="16" y2="15"/>',
    crash:
      '<path d="M2 12c2.5-5 7-8 10-8s7.5 3 10 8"/><path d="M5 16.5c2.5 3.5 6 5.5 9.5 5.5"/><circle cx="12" cy="13" r="2"/>',
    current:
      '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
    user:
      '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    age:
      '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h8"/>',
    clock:
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    mapPin:
      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>',
    instructor:
      '<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
    wallet:
      '<path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 100 4h4v-4h-4z"/>',
    building:
      '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><line x1="9" y1="6" x2="9.01" y2="6"/><line x1="15" y1="6" x2="15.01" y2="6"/><line x1="9" y1="10" x2="9.01" y2="10"/><line x1="15" y1="10" x2="15.01" y2="10"/>',
    receipt:
      '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>',
  };

  function reIconSvg(key) {
    var inner = RE_ICON_SVGS[key];
    if (!inner) return "";
    return (
      '<span class="re-title-ico" aria-hidden="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' +
      inner +
      "</svg></span>"
    );
  }

  function reCalIconSvg(key) {
    var inner = RE_ICON_SVGS[key];
    if (!inner) return "";
    return (
      '<span class="re-cal-line__ico" aria-hidden="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
      inner +
      "</svg></span>"
    );
  }

  function reRefIconSvg(key) {
    var inner = RE_ICON_SVGS[key];
    if (!inner) return "";
    return (
      '<span class="re-ref-ico" aria-hidden="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
      inner +
      "</svg></span>"
    );
  }

  function reSectionTitle(tag, iconKey, textHtml) {
    tag = tag || "h3";
    return (
      "<" +
      tag +
      ' class="re-section-title">' +
      '<span class="re-section-title__inner">' +
      reIconSvg(iconKey) +
      '<span class="re-section-title__text">' +
      textHtml +
      "</span></span></" +
      tag +
      ">"
    );
  }

  function supabaseUrl() {
    return String(global.SUPABASE_URL || "").replace(/\/$/, "");
  }

  function anonKey() {
    return String(global.SUPABASE_ANON_KEY || "");
  }

  function fn(name) {
    return supabaseUrl() + "/functions/v1/" + name;
  }

  function money(n) {
    var v = Number(n);
    if (!Number.isFinite(v)) return "—";
    return "£" + v.toFixed(2).replace(/\.00$/, "");
  }

  function showNotice(el, type, msg) {
    if (!el) return;
    el.hidden = false;
    el.className = "re-notice re-notice--" + (type || "info");
    el.textContent = msg || "";
  }

  function hideNotice(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = "";
  }

  function setStep(step) {
    state.step = step;
    var map = { identify: "reStepIdentify", form: "reStepForm", done: "reStepDone" };
    Object.keys(map).forEach(function (key) {
      var el = $(map[key]);
      if (el) el.hidden = key !== step;
    });
  }

  function parentPortalHref() {
    return "/parent/app";
  }

  function syncPortalBackUi() {
    var back = $("reBackLink");
    if (back) {
      back.textContent =
        state.fromPortal || state.portalSession
          ? "← Back to Home (Menu)"
          : "← Back";
    }
    var modalBack = $("reInfoModalPortalBack");
    if (modalBack) modalBack.href = parentPortalHref();
  }

  function patchStaffCalendarPortalBack(host) {
    if (!host) return;
    var backWrap = host.querySelector(".dc-cal__back-wrap");
    if (backWrap) backWrap.hidden = true;
  }

  function upgradeInfoModalChrome() {
    var closeBtn = $("reInfoModalClose");
    if (closeBtn) closeBtn.remove();
    var head = document.querySelector("#reInfoModal .re-modal-head");
    if (head && !$("reInfoModalPortalBack")) {
      head.insertAdjacentHTML(
        "afterbegin",
        '<a class="re-modal-back-portal" id="reInfoModalPortalBack" href="/parent/app">← Back to Home (Menu)</a>',
      );
    }
    syncPortalBackUi();
  }

  function readPortalSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return "";
      var j = JSON.parse(raw);
      if (!j || !j.token || Number(j.expiresAt) <= Date.now()) return "";
      return String(j.token);
    } catch (_e) {
      return "";
    }
  }

  function formatPickDob(iso) {
    if (!iso) return "";
    try {
      var d = new Date(String(iso).slice(0, 10) + "T12:00:00");
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (_e) {
      return String(iso);
    }
  }

  function showPublicIdentifyForm() {
    var title = $("reIdentifyTitle");
    var sub = $("reIdentifySub");
    var form = $("reIdentifyForm");
    var pick = $("rePortalPickList");
    if (title) title.textContent = "Find your record";
    if (sub) {
      sub.hidden = false;
      sub.textContent = "Enter the parent/carer name and participant details we have on file.";
    }
    if (form) form.hidden = false;
    if (pick) {
      pick.hidden = true;
      pick.innerHTML = "";
    }
  }

  function showPortalParticipantPick(children) {
    var title = $("reIdentifyTitle");
    var sub = $("reIdentifySub");
    var form = $("reIdentifyForm");
    var pick = $("rePortalPickList");
    if (title) title.textContent = "Choose participant";
    if (sub) {
      sub.hidden = false;
      sub.textContent = "Select who you are re-enrolling for 2026/27.";
    }
    if (form) form.hidden = true;
    if (!pick) return;
    pick.hidden = false;
    pick.innerHTML = (children || [])
      .map(function (c) {
        var name = String(c.display_name || "Participant");
        var meta = c.dob_iso ? "DOB " + formatPickDob(c.dob_iso) : "";
        return (
          '<button type="button" class="re-pick-card" role="listitem" data-contact-id="' +
          esc(String(c.contact_id || "")) +
          '">' +
          '<span style="min-width:0">' +
          '<span class="re-pick-card__name">' +
          esc(name) +
          "</span>" +
          (meta ? '<span class="re-pick-card__meta">' + esc(meta) + "</span>" : "") +
          "</span>" +
          '<span class="re-pick-card__cta">Continue →</span>' +
          "</button>"
        );
      })
      .join("");
    pick.querySelectorAll("[data-contact-id]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var cid = String(btn.getAttribute("data-contact-id") || "").trim();
        if (!cid) return;
        state.contactId = cid;
        state.fromPortal = true;
        syncPortalBackUi();
        hideNotice($("reNotice"));
        showNotice($("reNotice"), "info", "Loading your programme…");
        void onLookup(null);
      });
    });
  }

  async function fetchPortalChildren() {
    if (!state.portalSession) return [];
    try {
      var res = await fetch(fn("parent-portal-home-load"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: "Bearer " + anonKey(),
          "x-parent-portal-session": state.portalSession,
        },
        body: "{}",
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) return [];
      return Array.isArray(data.children) ? data.children : [];
    } catch (_e) {
      return [];
    }
  }

  function queryParams() {
    try {
      return new URLSearchParams(global.location.search || "");
    } catch (_e) {
      return new URLSearchParams();
    }
  }

  function formatServiceTwoLineParts(slot) {
    if (!slot) return null;
    var dur = slot.durationMin ? slot.durationMin + "'" : "";
    var svc = serviceTypeDisplay(slot.serviceType);
    var day = slot.day ? String(slot.day).trim() : "";
    var service = [dur, svc].filter(Boolean).join(" ");
    if (slot.venue) service += " (" + String(slot.venue).trim().toUpperCase() + ")";
    var detailParts = [];
    var time = formatTimeForServiceLine(slot.timeSlot);
    if (time) detailParts.push(time);
    if (day) detailParts.push(day.endsWith("s") ? day : day + "s");
    var detail = detailParts.join(", ");
    if (!service) return null;
    return { service: service, detail: detail };
  }

  function formatCurrentServiceParts(slot) {
    return formatServiceTwoLineParts(slot);
  }

  function formatWeeklySlotCardParts(slot) {
    return formatServiceTwoLineParts(slot);
  }

  function slotLabel(slot) {
    if (slot.displayLabel) return esc(slot.displayLabel);
    var dur = slot.durationMin ? slot.durationMin + "'" : "";
    var svc = String(slot.serviceType || "")
      .replace(/\bAQUATIC ACTIVITY\b/i, "Aquatic Activity")
      .replace(/\bCLIMBING ACTIVITY\b/i, "Climbing Activity")
      .replace(/\bSW\b/i, "Aquatic Activity")
      .replace(/^[''\s]+|[''\s]+$/g, "");
    var time = slot.timeSlot ? " - " + slot.timeSlot : "";
    var day = slot.day ? ", " + slot.day + (slot.day.endsWith("s") ? "" : "s") : "";
    var venue = slot.venue ? " (" + slot.venue + ")" : "";
    return esc((dur ? dur + " " : "") + svc + time + day + venue);
  }

  function hasWeeklySlots(data) {
    return !!((data && data.weekly_slots) || []).length;
  }

  function hasDayCentreEnrolled(data) {
    return !!(data && data.day_centre && data.day_centre.slots && data.day_centre.slots.length);
  }

  function primaryServiceSectionTitle(data) {
    if (!hasWeeklySlots(data) && hasDayCentreEnrolled(data)) return "Day Centre — SwimFarm";
    if (hasWeeklySlots(data)) return "After-School &amp; Weekends";
    return "Your programme";
  }

  function serviceTypeDisplay(serviceType) {
    var t = String(serviceType || "")
      .trim()
      .toUpperCase();
    if (t.includes("AQUATIC") || t === "SW") return "Aquatic Activity";
    if (t.includes("MULTI") || t === "S&C" || t === "S & C" || t.includes("S&C")) return "Multi-Activity";
    if (t.includes("CLIMB") || t === "CL") return "Climbing Activity";
    if (t.includes("PHYSICAL") || t.includes("FITNESS") || t === "FIT") return "Physical Activity";
    if (t.includes("BESPOKE") || t === "BS") return "Bespoke Programme";
    if (t.includes("COUNSEL")) return "Counselling";
    return String(serviceType || "")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, function (c) {
        return c.toUpperCase();
      });
  }

  function formatTimeForServiceLine(timeSlot) {
    var s = String(timeSlot || "").trim();
    if (!s) return "";
    if (/\b(am|pm)\b/i.test(s)) return s;
    var startRaw = (s.split(/\s+to\s+/i)[0] || "").trim();
    var start = Number.parseFloat(startRaw);
    if (Number.isFinite(start) && start >= 1 && start <= 8) return s + " pm";
    return s;
  }

  function parseLegacyServicePart(part) {
    var p = String(part || "").trim();
    if (!p) return null;
    var slashIdx = p.indexOf(" / ");
    if (slashIdx >= 0) {
      return {
        service: p.slice(0, slashIdx).trim(),
        detail: p.slice(slashIdx + 3).trim(),
      };
    }
    return { service: p, detail: "" };
  }

  function formatCurrentPaymentMethodLabel(raw) {
    var s = String(raw || "").toLowerCase();
    if (!s) return "";
    var compact = s.replace(/[\s_\-]+/g, "");
    if (
      compact.includes("gocardless") ||
      s.includes("direct debit") ||
      s.includes("direct payment")
    ) {
      return "Direct Payment (GoCardless)";
    }
    if (s.includes("bank")) return "Bank Transfer";
    return String(raw).trim();
  }

  // Legend dots next to each service (NOT calendar paint).
  // Green/red are reserved for the calendar: green = service days, red = closures.
  var RE_SERVICE_TONES = [
    "#ca8a04",
    "#2d7fb8",
    "#7c4dbf",
    "#0f766e",
    "#db2777",
  ];

  /** Calendar preview only: booked weekdays → club green (closures stay red). */
  var RE_CAL_SERVICE_GREEN = "#CFEA8B";

  function reDayNameToCol(day) {
    var s = String(day || "").trim().toLowerCase().slice(0, 3);
    var map = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
    return Object.prototype.hasOwnProperty.call(map, s) ? map[s] : null;
  }

  function reBuildServiceTones(slots) {
    var items = [];
    var colMap = {};
    (slots || []).forEach(function (slot) {
      var parts = formatCurrentServiceParts(slot);
      if (!parts) return;
      var tone = RE_SERVICE_TONES[items.length % RE_SERVICE_TONES.length];
      var col = reDayNameToCol(slot && slot.day);
      items.push({ service: parts.service, detail: parts.detail, tone: tone, col: col });
      if (col != null && colMap[col] == null) colMap[col] = tone;
    });
    return { items: items, colMap: colMap };
  }

  /** Weekday → green for autumn preview (ignore multi-service legend colours). */
  function reBuildCalendarServiceDayColors(slots) {
    var colMap = {};
    (slots || []).forEach(function (slot) {
      var col = reDayNameToCol(slot && slot.day);
      if (col != null) colMap[col] = RE_CAL_SERVICE_GREEN;
    });
    return colMap;
  }

  function renderCurrentArrangementsRefListHtml(data) {
    var cur = (data && data.current_arrangements_2526) || {};
    var rows = [];
    function addRefRow(iconKey, label, val) {
      val = val != null ? String(val).trim() : "";
      if (!val) return;
      rows.push(
        '<li class="re-current-ref-row">' +
        reRefIconSvg(iconKey) +
        '<div class="re-ref-body">' +
        '<span class="re-ref-label">' +
        esc(label) +
        "</span>" +
        '<span class="re-ref-value">' +
        esc(val) +
        "</span></div></li>",
      );
    }
    function addRefServicesBlock(slots) {
      var items = reBuildServiceTones(slots).items;
      if (!items.length && cur.slot) {
        String(cur.slot)
          .split(" · ")
          .forEach(function (part) {
            var parsed = parseLegacyServicePart(part);
            if (parsed) items.push(parsed);
          });
      }
      if (!items.length) return;
      rows.push(
        '<li class="re-current-ref-row re-current-ref-row--services">' +
        reRefIconSvg("services") +
        '<div class="re-ref-body">' +
        '<span class="re-ref-label">Service / Services</span>' +
        '<ul class="re-ref-service-list">' +
        items
          .map(function (item) {
            return (
              '<li class="re-ref-service-item">' +
              '<span class="re-ref-service-name">' +
              esc(item.service) +
              (item.tone
                ? '<span class="re-ref-service-dot" style="background:' +
                  item.tone +
                  '" aria-hidden="true"></span>'
                : "") +
              "</span>" +
              (item.detail
                ? '<span class="re-ref-service-detail">' + esc(item.detail) + "</span>"
                : "") +
              "</li>"
            );
          })
          .join("") +
        "</ul></div></li>",
      );
    }
    addRefServicesBlock((data && data.weekly_slots) || []);
    addRefRow("billing", "Payment method", formatCurrentPaymentMethodLabel(cur.payment_method));
    addRefRow("wallet", "Funding", cur.funding);
    if (!rows.length) {
      var legacy = fundingCurrent2526(data);
      addRefRow("billing", "Payment method", formatCurrentPaymentMethodLabel(legacy.payment_method));
      addRefRow("wallet", "Funding", legacy.funding);
    }
    if (!rows.length) {
      return '<p class="re-muted re-current-ref-empty">No current arrangements on file — contact the office if this is wrong.</p>';
    }
    return '<ul class="re-current-ref-list">' + rows.join("") + "</ul>";
  }

  function renderCurrentArrangementsSection(data) {
    return (
      '<section class="re-section re-section--current-ref">' +
      reSectionTitle("h3", "current", "Current arrangements (2025/26)") +
      '<p class="re-muted re-current-ref-note">Reference from this year&apos;s record — confirm 2026/27 choices below.</p>' +
      '<div class="re-current-ref-grid">' +
      '<div class="re-current-ref-grid__left">' +
      renderParticipantHeadIdentity(data) +
      "</div>" +
      '<div class="re-current-ref-grid__right">' +
      renderCurrentArrangementsRefListHtml(data) +
      "</div></div></section>"
    );
  }

  function termProgrammeTotal(data, term) {
    if (term === "annual") return resolveAnnualWeeklyTotal(data);
    var slots = keptWeeklySlots(data);
    return slots.reduce(function (sum, s) {
      var t = s.termTotals && s.termTotals[term];
      return sum + (Number.isFinite(Number(t)) ? Number(t) : 0);
    }, 0);
  }

  /** Headline total under cadence: full year, or current term only when term-by-term. */
  function estimatedBillingTotalDisplay(data) {
    var annual = resolveAnnualWeeklyTotal(data);
    var cadence = normalizeEnrolmentCadence(state.enrolmentCadence);
    if (cadence === "term_by_term") {
      var term = currentReenrolBillingTerm();
      var amt = termProgrammeTotal(data, term);
      var label =
        term === "spring"
          ? "Estimated Spring Term 2027 total"
          : term === "summer"
            ? "Estimated Summer Term 2027 total"
            : "Estimated Autumn Term 2026 total";
      return { label: label, amount: amt, annual: annual };
    }
    return {
      label: "Estimated programme total 2026/27",
      amount: annual,
      annual: annual,
    };
  }

  function estimatedBillingTotalHtml(data) {
    var d = estimatedBillingTotalDisplay(data);
    return (
      "<strong>" +
      esc(d.label) +
      ":</strong> " +
      esc(money(d.amount))
    );
  }

  function isReEnrolSubmissionOpen() {
    var end = new Date(RE_ENROL_DEADLINE_ISO + "T23:59:59");
    return Date.now() <= end.getTime();
  }

  function renderReEnrolDeadlineBanner() {
    if (isReEnrolSubmissionOpen()) {
      return (
        '<div class="re-banner re-banner--deadline">' +
        "Review your current programme and confirm for September 2026. " +
        "<strong>Submit by " +
        esc(RE_ENROL_DEADLINE_LABEL) +
        "</strong> — payments follow from mid-August (bank transfer) or September (Direct Payment)." +
        "</div>"
      );
    }
    return (
      '<div class="re-banner re-banner--warn">' +
      "<strong>Re-enrolment closed on " +
      esc(RE_ENROL_DEADLINE_LABEL) +
      ".</strong> Contact info@clubsensational.org if you still need to confirm 2026/27." +
      "</div>"
    );
  }

  function dueOnFirst(monthYear) {
    return "1 " + monthYear;
  }

  /** Matches backend currentReenrolBillingTerm (2026/27). */
  function currentReenrolBillingTerm() {
    var m = new Date().getMonth() + 1;
    if (m >= 9 && m <= 12) return "autumn";
    if (m >= 1 && m <= 3) return "spring";
    if (m >= 4 && m <= 6) return "summer";
    return "autumn";
  }

  function reenrolTermDisplayLabel(term) {
    if (term === "spring") return "Spring";
    if (term === "summer") return "Summer";
    return "Autumn";
  }

  function paymentPreviewNote(payCode, schedCode, cadence) {
    var termOnly = normalizeEnrolmentCadence(cadence) === "term_by_term";
    var termLabel = reenrolTermDisplayLabel(currentReenrolBillingTerm());
    if (payCode === "own_way_flexible" && schedCode === "own_term") {
      return termOnly
        ? "Term-by-term: we invoice " +
            termLabel +
            " only for now (programme + £50 admin). Later terms when you reconfirm. Own payment timing — keep at least two sessions paid in advance for every service."
        : "Term by term on your own payment timing (bank transfer, Card or Apple Pay) — not our fixed due dates. Programme total stays the same, plus a £50 admin fee each term. You must keep at least two sessions paid in advance for every service you attend; if the balance falls below that, we may pause sessions or move you to a standard payment plan.";
    }
    if (payCode === "gocardless") {
      if (schedCode === "term_3") {
        return termOnly
          ? "Term-by-term: one Direct Payment for " +
              termLabel +
              " only. Later terms are billed when you reconfirm. Collection around the term start."
          : "Same programme total — three Direct Payments (one per term). First collection around early September, then December and March.";
      }
      if (schedCode === "term_flexi") {
        return termOnly
          ? "Term-by-term: two Direct Payments for " +
              termLabel +
              " only. Later terms when you reconfirm."
          : "Same programme total — six Direct Payments (two per term). First collection around early September; later dates follow each half-term.";
      }
      if (schedCode === "monthly_10") {
        return termOnly
          ? "Term-by-term: monthly Direct Payments for " +
              termLabel +
              " only (Autumn 4 / Spring 3 / Summer 3). Later terms when you reconfirm."
          : "Same programme total — ten Direct Payments (Autumn 4, Spring 3, Summer 3). First collection on 1 September; then on the 1st of each month through June.";
      }
      if (schedCode === "monthly_term") {
        return termOnly
          ? "Term-by-term: monthly Direct Payments for " + termLabel + " only. Later terms when you reconfirm."
          : "Same programme total — one direct payment per month of each term (Autumn 4, Spring 3, Summer 4 = 11). We set up your GoCardless agreement in July; GoCardless collects the first payment on 1 September and it reaches us around 5–6 September, then on the 1st of each month.";
      }
      return "Same programme total — Direct Payment (GoCardless). The office confirms your final collection plan.";
    }
    if (payCode === "bank_transfer" && schedCode === "monthly_10") {
      return termOnly
        ? "Term-by-term: monthly invoices for " +
            termLabel +
            " only (Autumn 4 / Spring 3 / Summer 3). Later terms when you reconfirm."
        : "Same programme total — ten invoices (Autumn 4, Spring 3, Summer 3). Pay each month from the parent portal by bank transfer or Card / Apple Pay. First due 1 September 2026.";
    }
    if (payCode === "bank_transfer" && schedCode === "term_flexi") {
      return termOnly
        ? "Term-by-term: two invoices for " +
            termLabel +
            " only. Later terms when you reconfirm. First half due on the 1st of the term month."
        : "Same programme total — six invoices (two per term). First half of each term is due on the 1st (1 September, 1 January, 1 April); second half during half-term week. Pay from the parent portal by bank transfer or Card / Apple Pay.";
    }
    if (payCode === "bank_transfer" && schedCode === "term_3" && termOnly) {
      return (
        "Term-by-term: one invoice for " +
        termLabel +
        " only. Later terms when you reconfirm. First payment due by 15 August 2026 when billing Autumn."
      );
    }
    if (payCode === "bank_transfer") {
      return "Same programme total — the first payment (term, one-off or full year) is due by 15 August 2026 so it reaches us before term; later payments follow each term. Paying on or before each due date (including Card / Apple Pay when offered) has no admin fee.";
    }
    return "Same programme total — compare due dates below. The office confirms your final invoice plan before term starts.";
  }

  function renderPaymentSchedulePreviewHtml(data) {
    var payEl = document.querySelector('input[name="re_pay_2627"]:checked');
    var schedEl = document.querySelector('input[name="re_pay_schedule_2627"]:checked');
    var fundEl = document.querySelector('input[name="re_fund_2627"]:checked');
    var fundCode = fundEl ? fundEl.value : "privately_funded";
    if (!isParentPaysPanel(fundCode)) return "";
    var payCode = payEl ? payEl.value : "bank_transfer";
    var schedCode = schedEl ? schedEl.value : null;
    if (payCode !== "bank_transfer" && payCode !== "gocardless" && payCode !== "own_way_flexible") {
      return "";
    }
    if (!schedCode) return "";
    var cadence = normalizeEnrolmentCadence(state.enrolmentCadence);
    var billingTerm = cadence === "term_by_term" ? currentReenrolBillingTerm() : null;
    function includeTerm(termKey) {
      return !billingTerm || billingTerm === termKey;
    }
    var annual = resolveAnnualWeeklyTotal(data);
    var fee = adminFeeApplies(payCode);
    var feeTotal = adminFeeTotalForSchedule(payCode, schedCode, cadence);
    function amt(base) {
      var n = Number(base);
      if (!Number.isFinite(n) || n <= 0) return "—";
      if (payCode === "gocardless" && fee) {
        return money(n + RE_ADMIN_FEE_GC_PER_INSTALLMENT);
      }
      return money(n);
    }
    if (payCode === "own_way_flexible") {
      var buffer = ownArrangementAdvanceBuffer(data);
      var ownRows = [];
      ["Autumn", "Spring", "Summer"].forEach(function (label, i) {
        var termKey = i === 0 ? "autumn" : i === 1 ? "spring" : "summer";
        if (!includeTerm(termKey)) return;
        ownRows.push({
          label: label + " term · programme",
          due: "Your own timing",
          amount: money(termProgrammeTotal(data, termKey)),
        });
        ownRows.push({
          label: label + " term · admin fee",
          due: "Each term",
          amount: money(RE_ADMIN_FEE_OWN),
        });
      });
      if (buffer.total > 0) {
        ownRows.push({
          label: "Minimum credit on account (2 sessions × each service)",
          due: "Always in advance",
          amount: money(buffer.total),
        });
      }
      var ownFeeNote =
        feeTotal > 0
          ? billingTerm
            ? " Admin fee for this term: " + money(feeTotal) + "."
            : " Admin fees add " + money(feeTotal) + " over the year (indicative total " + money(annual + feeTotal) + ")."
          : "";
      return (
        '<div class="re-pay-preview">' +
        '<h4 class="re-pay-preview__title">Indicative totals</h4>' +
        '<p class="re-muted re-pay-preview__note">' +
        esc(paymentPreviewNote(payCode, schedCode, cadence)) +
        ownFeeNote +
        "</p>" +
        '<ul class="re-pay-preview-list">' +
        ownRows
          .map(function (r) {
            return (
              '<li class="re-pay-preview-list__row">' +
              '<span class="re-pay-preview-list__label">' +
              esc(r.label) +
              "</span>" +
              '<span class="re-pay-preview-list__due">' +
              esc(r.due) +
              "</span>" +
              '<span class="re-pay-preview-list__amt">' +
              esc(r.amount) +
              "</span></li>"
            );
          })
          .join("") +
        "</ul></div>"
      );
    }
    var bankFirstDue =
      payCode === "bank_transfer"
        ? schedCode === "monthly_10"
          ? dueOnFirst("September 2026")
          : RE_BANK_FIRST_DUE
        : dueOnFirst("September 2026");
    var rows = [];
    if (schedCode === "yearly_1off") {
      rows.push({
        term: null,
        label: "Full year (1 payment)",
        due: bankFirstDue,
        amount: amt(annual),
      });
    } else if (schedCode === "term_3") {
      [
        { term: "autumn", label: "Autumn term", due: bankFirstDue },
        { term: "spring", label: "Spring term", due: dueOnFirst("December 2026") },
        { term: "summer", label: "Summer term", due: dueOnFirst("March 2027") },
      ].forEach(function (t) {
        if (!includeTerm(t.term)) return;
        rows.push({
          term: t.term,
          label: t.label,
          due: t.due,
          amount: amt(termProgrammeTotal(data, t.term)),
        });
      });
    } else if (schedCode === "term_flexi") {
      RE_PAY_FLEXI_TERM.forEach(function (t) {
        if (!includeTerm(t.term)) return;
        var termTotal = termProgrammeTotal(data, t.term);
        var halfAmt = termTotal / 2;
        t.halves.forEach(function (h) {
          rows.push({
            term: t.term,
            label: t.termLabel + " · " + h.halfLabel,
            due: h.due,
            amount: amt(halfAmt),
          });
        });
      });
    } else if (schedCode === "monthly_term") {
      var termPlan = [
        { term: "autumn", label: "Autumn", months: ["September 2026", "October 2026", "November 2026", "December 2026"] },
        { term: "spring", label: "Spring", months: ["January 2027", "February 2027", "March 2027"] },
        { term: "summer", label: "Summer", months: ["April 2027", "May 2027", "June 2027", "July 2027"] },
      ];
      var payNo = 0;
      termPlan.forEach(function (t) {
        if (!includeTerm(t.term)) return;
        var termTotal = termProgrammeTotal(data, t.term);
        var perMonth = termTotal / t.months.length;
        t.months.forEach(function (label) {
          payNo += 1;
          rows.push({
            term: t.term,
            label: "Payment " + payNo + " · " + label + " (" + t.label + ")",
            due: dueOnFirst(label),
            amount: amt(perMonth),
          });
        });
      });
    } else if (schedCode === "monthly_10") {
      var monthly10Plan = [
        { term: "autumn", label: "Autumn", months: ["September 2026", "October 2026", "November 2026", "December 2026"] },
        { term: "spring", label: "Spring", months: ["January 2027", "February 2027", "March 2027"] },
        { term: "summer", label: "Summer", months: ["April 2027", "May 2027", "June 2027"] },
      ];
      var payNo10 = 0;
      monthly10Plan.forEach(function (t) {
        if (!includeTerm(t.term)) return;
        var termTotal = termProgrammeTotal(data, t.term);
        var perMonth = termTotal / t.months.length;
        t.months.forEach(function (label) {
          payNo10 += 1;
          rows.push({
            term: t.term,
            label: "Payment " + payNo10 + " · " + label + " (" + t.label + ")",
            due: dueOnFirst(label),
            amount: amt(perMonth),
          });
        });
      });
    }
    if (!rows.length) return "";
    return (
      '<div class="re-pay-preview">' +
      '<h4 class="re-pay-preview__title">Indicative payment schedule</h4>' +
      '<p class="re-muted re-pay-preview__note">' +
      esc(paymentPreviewNote(payCode, schedCode, cadence)) +
      (fee && payCode === "gocardless"
        ? " Each payment shown includes the " +
          money(RE_ADMIN_FEE_GC_PER_INSTALLMENT) +
          " Direct Payment admin fee."
        : "") +
      "</p>" +
      '<ul class="re-pay-preview-list">' +
      rows
        .map(function (r) {
          return (
            '<li class="re-pay-preview-list__row">' +
            '<span class="re-pay-preview-list__label">' +
            esc(r.label) +
            "</span>" +
            '<span class="re-pay-preview-list__due">Due ' +
            esc(r.due) +
            "</span>" +
            '<span class="re-pay-preview-list__amt">' +
            esc(r.amount) +
            "</span></li>"
          );
        })
        .join("") +
      "</ul></div>"
    );
  }

  function syncPaymentSchedulePreview() {
    var host = $("rePaySchedulePreview");
    if (!host || !state.lookup) return;
    host.innerHTML = renderPaymentSchedulePreviewHtml(state.lookup);
    host.hidden = !host.innerHTML;
  }

  function participantDisplayName(data) {
    return (data && data.participant && data.participant.display_name) || "";
  }

  function participantAgeLabel(data) {
    var cur = data && data.current_arrangements_2526;
    if (cur && cur.age != null && String(cur.age).trim()) {
      var n = String(cur.age).trim();
      return /\s*years?$/i.test(n) ? n : n + " years";
    }
    var dob = data && data.participant && data.participant.dob_iso;
    if (dob) {
      try {
        var d = new Date(String(dob).slice(0, 10) + "T12:00:00");
        var now = new Date();
        var age = now.getFullYear() - d.getFullYear();
        var m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
        if (age >= 0) return age + " years";
      } catch (_e) {}
    }
    var ageInput = $("reParticipantAge") && $("reParticipantAge").value;
    if (ageInput) return String(ageInput).trim() + " years";
    return "";
  }

  function renderParticipantHeadIdentity(data) {
    var name = participantDisplayName(data);
    var url = resolveAvatarUrl(data);
    var initials = esc(participantInitials(name));
    var gCls =
      typeof global.portalParticipantGenderClass === "function"
        ? global.portalParticipantGenderClass(name, "re-head-photo--")
        : "";
    var imgHtml = url
      ? '<img class="re-head-photo__img" src="' +
        esc(url) +
        '" alt="" width="88" height="88" loading="lazy" decoding="async" onerror="this.remove();this.parentElement.classList.remove(\'re-head-photo--has-img\');" />' +
        '<span class="re-head-photo__init" aria-hidden="true">' +
        initials +
        "</span>"
      : '<span class="re-head-photo__init" aria-hidden="true">' + initials + "</span>";
    return (
      '<div class="re-head-identity">' +
      '<div class="re-head-photo' +
      (url ? " re-head-photo--has-img" : "") +
      gCls +
      '">' +
      imgHtml +
      "</div>" +
      '<p class="re-participant-name">' +
      esc(name) +
      "</p>" +
      "</div>"
    );
  }

  function resolveAvatarUrl(data) {
    var p = data && data.participant;
    if (p && p.avatar_url) return String(p.avatar_url);
    var name = participantDisplayName(data);
    var cid = p && p.contact_id;
    if (typeof global.portalParticipantPhotoUrl === "function") {
      return global.portalParticipantPhotoUrl(name, "", cid) || "";
    }
    return "";
  }

  function participantInitials(name) {
    if (typeof global.portalParticipantInitials === "function") {
      return global.portalParticipantInitials(name);
    }
    name = String(name || "").trim();
    if (!name) return "?";
    var parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function currentAvatarPreviewUrl() {
    if (state.pendingPreviewUrl) return state.pendingPreviewUrl;
    return state.avatarUrl || "";
  }

  function hasSavedParticipantPhoto() {
    return !!(state.avatarUrl && String(state.avatarUrl).trim());
  }

  function syncPhotoSectionUi() {
    var section = document.querySelector(".re-photo-section");
    var saved = hasSavedParticipantPhoto();
    var btns = $("rePhotoBtns");
    var edit = $("rePhotoEditBtn");
    var status = $("rePhotoStatus");
    if (section) section.classList.toggle("re-photo-section--saved", saved);
    if (btns) btns.hidden = saved;
    if (edit) edit.hidden = !saved;
    if (status && saved && status.className.indexOf("re-photo-status--error") < 0) {
      status.textContent = "";
      status.hidden = true;
    } else if (status) status.hidden = false;
  }

  function renderPhotoSection(data) {
    var name = participantDisplayName(data);
    var url = currentAvatarPreviewUrl();
    var initials = esc(participantInitials(name));
    var saved = !!(resolveAvatarUrl(data) && !state.pendingPhotoFile);
    var imgHtml = url
      ? '<img class="re-photo-img" src="' +
        esc(url) +
        '" alt="" width="96" height="96" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />' +
        '<span class="re-photo-init" hidden aria-hidden="true">' +
        initials +
        "</span>"
      : '<span class="re-photo-init" aria-hidden="true">' + initials + "</span>";

    return (
      '<section class="re-section re-photo-section' +
      (saved ? " re-photo-section--saved" : "") +
      '">' +
      '<div class="re-photo-row">' +
      '<div class="re-photo-col">' +
      '<div class="re-photo-avatar" id="rePhotoAvatar">' +
      imgHtml +
      "</div>" +
      '<button type="button" class="re-photo-edit" id="rePhotoEditBtn"' +
      (saved ? "" : " hidden") +
      '>Edit</button>' +
      "</div>" +
      '<div class="re-photo-actions">' +
      reSectionTitle("h3", "photo", "Participant photo") +
      '<p class="re-muted">Used in the family portal and internal records. Previous photos are kept for admin use.</p>' +
      '<input type="file" id="rePhotoInput" accept="image/jpeg,image/png,image/webp,image/*" hidden />' +
      '<div class="re-photo-btns" id="rePhotoBtns"' +
      (saved ? " hidden" : "") +
      ">" +
      '<button type="button" class="re-btn re-btn--secondary" id="rePhotoChooseBtn">' +
      (saved ? "Change photo" : "Add photo") +
      "</button>" +
      '<button type="button" class="re-btn re-btn--ghost" id="rePhotoRemoveBtn">Remove</button>' +
      '<button type="button" class="re-btn re-btn--primary re-photo-save" id="rePhotoSaveBtn">Save photo</button>' +
      "</div>" +
      '<p class="re-muted re-photo-status" id="rePhotoStatus" role="status"' +
      (saved ? " hidden" : "") +
      "></p>" +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  function refreshPhotoAvatarDom() {
    var host = $("rePhotoAvatar");
    if (!host) return;
    var name = participantDisplayName(state.lookup);
    var url = currentAvatarPreviewUrl();
    var initials = esc(participantInitials(name));
    if (url) {
      host.innerHTML =
        '<img class="re-photo-img" src="' +
        esc(url) +
        '" alt="" width="96" height="96" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />' +
        '<span class="re-photo-init" hidden aria-hidden="true">' +
        initials +
        "</span>";
    } else {
      host.innerHTML = '<span class="re-photo-init" aria-hidden="true">' + initials + "</span>";
    }
  }

  function setPhotoStatus(msg, type) {
    var el = $("rePhotoStatus");
    if (!el) return;
    el.hidden = false;
    el.textContent = msg || "";
    el.className = "re-muted re-photo-status" + (type ? " re-photo-status--" + type : "");
  }

  function avatarFormFields() {
    var data = state.lookup || {};
    var parent = data.parent || {};
    var fd = new FormData();
    fd.append("contact_id", String((data.participant && data.participant.contact_id) || ""));
    fd.append("source", state.fromPortal ? "parent_portal_reenrol" : "re_enrolment");
    if (state.fromPortal && state.portalSession) {
      /* session via header */
    } else {
      fd.append("parent_first_name", parent.first_name || ($("reParentFirst") && $("reParentFirst").value) || "");
      fd.append("parent_last_name", parent.last_name || ($("reParentLast") && $("reParentLast").value) || "");
      fd.append("participant_name", participantDisplayName(data) || ($("reParticipantName") && $("reParticipantName").value) || "");
      var age = $("reParticipantAge") && $("reParticipantAge").value;
      if (age) fd.append("participant_age", age);
    }
    return fd;
  }

  function avatarFetchHeaders() {
    var headers = {
      apikey: anonKey(),
      Authorization: "Bearer " + anonKey(),
    };
    if (state.portalSession) headers["x-parent-portal-session"] = state.portalSession;
    return headers;
  }

  async function saveParticipantPhoto() {
    setPhotoStatus("");
    if (!state.pendingPhotoFile && !state.lookup) return;
    if (!state.pendingPhotoFile) {
      setPhotoStatus("Choose a photo first.", "warn");
      return;
    }
    var btn = $("rePhotoSaveBtn");
    if (btn) btn.disabled = true;
    try {
      var fd = avatarFormFields();
      fd.append("photo", state.pendingPhotoFile, state.pendingPhotoFile.name || "photo.jpg");
      var res = await fetch(fn("portal-participant-avatar-save"), {
        method: "POST",
        headers: avatarFetchHeaders(),
        body: fd,
      });
      var out = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !out.ok) {
        setPhotoStatus("Could not save photo — try again.", "error");
        return;
      }
      state.avatarUrl = out.avatar_url || state.avatarUrl;
      state.pendingPhotoFile = null;
      if (state.pendingPreviewUrl) {
        try {
          URL.revokeObjectURL(state.pendingPreviewUrl);
        } catch (_e) {}
        state.pendingPreviewUrl = "";
      }
      if (state.lookup && state.lookup.participant) {
        state.lookup.participant.avatar_url = state.avatarUrl;
      }
      var input = $("rePhotoInput");
      if (input) input.value = "";
      refreshPhotoAvatarDom();
      syncPhotoSectionUi();
      if (!hasSavedParticipantPhoto()) {
        setPhotoStatus("Photo saved.", "ok");
      }
    } catch (_e) {
      setPhotoStatus("Network error saving photo.", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function removeParticipantPhoto() {
    setPhotoStatus("");
    var btn = $("rePhotoRemoveBtn");
    if (btn) btn.disabled = true;
    try {
      var fd = avatarFormFields();
      fd.append("remove", "1");
      var res = await fetch(fn("portal-participant-avatar-save"), {
        method: "POST",
        headers: avatarFetchHeaders(),
        body: fd,
      });
      var out = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !out.ok) {
        setPhotoStatus("Could not remove photo.", "error");
        return;
      }
      state.avatarUrl = "";
      state.pendingPhotoFile = null;
      if (state.pendingPreviewUrl) {
        try {
          URL.revokeObjectURL(state.pendingPreviewUrl);
        } catch (_e) {}
        state.pendingPreviewUrl = "";
      }
      if (state.lookup && state.lookup.participant) {
        state.lookup.participant.avatar_url = null;
      }
      refreshPhotoAvatarDom();
      syncPhotoSectionUi();
      setPhotoStatus("Live photo removed. Previous copies stay in admin archive.", "ok");
    } catch (_e) {
      setPhotoStatus("Network error.", "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function bindPhotoHandlers() {
    var input = $("rePhotoInput");
    var choose = $("rePhotoChooseBtn");
    var save = $("rePhotoSaveBtn");
    var remove = $("rePhotoRemoveBtn");
    var edit = $("rePhotoEditBtn");
    function onPhotoFilePicked(file) {
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        setPhotoStatus("Photo must be under 8 MB.", "error");
        if (input) input.value = "";
        syncPhotoSectionUi();
        return;
      }
      state.pendingPhotoFile = file;
      if (state.pendingPreviewUrl) {
        try {
          URL.revokeObjectURL(state.pendingPreviewUrl);
        } catch (_e) {}
      }
      state.pendingPreviewUrl = URL.createObjectURL(file);
      refreshPhotoAvatarDom();
      if (hasSavedParticipantPhoto()) {
        saveParticipantPhoto();
        return;
      }
      syncPhotoSectionUi();
      setPhotoStatus("Preview ready — tap Save photo.", "info");
    }
    if (choose && input) {
      choose.addEventListener("click", function () {
        input.click();
      });
      input.addEventListener("change", function () {
        onPhotoFilePicked(input.files && input.files[0]);
      });
    }
    if (edit && input) {
      edit.addEventListener("click", function () {
        input.click();
      });
    }
    if (save) save.addEventListener("click", saveParticipantPhoto);
    if (remove) remove.addEventListener("click", removeParticipantPhoto);
  }

  function sumAnnualWeeklyTotal(slots) {
    if (!slots || !slots.length) return 0;
    var sum = 0;
    for (var i = 0; i < slots.length; i++) {
      var t = slots[i] && slots[i].termTotals && slots[i].termTotals.annual;
      if (Number.isFinite(Number(t))) sum += Number(t);
    }
    return Math.round(sum * 100) / 100;
  }

  function weeklySlotChoice(slot, idx) {
    var id = esc(slot && slot.id ? slot.id : "slot-" + idx);
    var choices = state.weeklyChoices || {};
    return choices[id] === "withdraw" ? "withdraw" : "keep";
  }

  function keptWeeklySlots(data) {
    var slots = (data && data.weekly_slots) || [];
    return slots.filter(function (s, i) {
      return weeklySlotChoice(s, i) !== "withdraw";
    });
  }

  function firstNameFromDisplay(name) {
    return String(name || "").trim().split(/\s+/)[0] || "";
  }

  function dayCentreWithdrawn(data) {
    if (!hasDayCentreEnrolled(data)) return false;
    var dc = document.querySelector('input[name="dc_choice"]:checked');
    return dc ? dc.value === "withdraw" : false;
  }

  function noSessionsKept(data) {
    var hasWeekly = hasWeeklySlots(data);
    var hasDc = hasDayCentreEnrolled(data);
    if (!hasWeekly && !hasDc) return false;
    var keptWeekly = hasWeekly && keptWeeklySlots(data).length > 0;
    var keptDc = hasDc && !dayCentreWithdrawn(data);
    return !keptWeekly && !keptDc;
  }

  function renderReenrolFarewellHtml(data) {
    var first = firstNameFromDisplay(participantDisplayName(data));
    var firstEsc = esc(first);
    return (
      '<div class="re-farewell" id="reFarewell" hidden>' +
      '<div class="re-farewell__card">' +
      '<span class="re-farewell__icon">' +
      reIconSvg("heart") +
      "</span>" +
      "<h4>Thank you for being part of ClubSENsational</h4>" +
      "<p>You've chosen not to continue any activities for 2026/27, so there is nothing to pay.</p>" +
      "<p>Thank you for your trust and support" +
      (first ? " during the time " + firstEsc + " has spent with us" : " over this time") +
      ". It has been a pleasure having you with us. We wish you and your family all the very best, and we truly hope our paths cross again in the future — our door is always open.</p>" +
      '<p class="re-farewell__cta">Just confirm and submit below to let us know.</p>' +
      "</div></div>"
    );
  }

  function resolveAnnualWeeklyTotal(data) {
    var slots = (data && data.weekly_slots) || [];
    if (slots.length) return sumAnnualWeeklyTotal(keptWeeklySlots(data));
    var api = data && data.annual_weekly_total;
    if (api != null && Number(api) > 0) return Number(api);
    return 0;
  }

  function fundingCurrent2526(data) {
    var f = (data && data.funding) || {};
    if (f.current_2526) return f.current_2526;
    return {
      payment_method: f.payment_method || null,
      funding: f.funding || f.method || null,
      invoice_type: f.invoice_type || f.vat || null,
      invoice_type_code:
        f.invoice_type_code ||
        (f.vat && String(f.vat).toLowerCase().indexOf("exempt") >= 0 ? "exempt" : "vat_included"),
    };
  }

  function isFunderPaid(fundCode) {
    return fundCode === "la_nhs";
  }

  function isParentPaysPanel(fundCode) {
    return fundCode === "privately_funded" || fundCode === "la_direct_payments";
  }

  function isDirectPayments(fundCode) {
    return fundCode === "la_direct_payments";
  }

  /** Own arrangement is private-pay only — not for LA Direct Payments funding. */
  function payMethodAllowedForFunding(payCode, fundCode) {
    if (normalizePayMethodChoice(payCode) === "own_way_flexible" && isDirectPayments(fundCode)) {
      return false;
    }
    return true;
  }

  function privatePayMethodsForFunding(fundCode) {
    return RE_PRIVATE_PAY_METHODS.filter(function (o) {
      return payMethodAllowedForFunding(o.code, fundCode);
    });
  }

  function adminFeeApplies(payCode) {
    return payCode === "gocardless" || payCode === "own_way_flexible";
  }

  /** GoCardless / Direct Payment: small per-instalment fee. */
  var RE_ADMIN_FEE_GC_PER_INSTALLMENT = 1.5;
  /** Own arrangement: £50 per term only (no year option). */
  var RE_ADMIN_FEE_OWN = 50;
  /** Own arrangement: always keep 2 sessions paid in advance per service. */
  var RE_OWN_ADVANCE_SESSIONS = 2;

  function installmentCountForSchedule(scheduleCode, cadence) {
    var termOnly = normalizeEnrolmentCadence(cadence) === "term_by_term";
    var term = termOnly ? currentReenrolBillingTerm() : null;
    if (scheduleCode === "monthly_term") {
      if (term === "autumn") return 4;
      if (term === "spring") return 3;
      if (term === "summer") return 4;
      return 11;
    }
    if (scheduleCode === "monthly_10") {
      if (term === "autumn") return 4;
      if (term === "spring" || term === "summer") return 3;
      return 10;
    }
    if (scheduleCode === "term_flexi") return termOnly ? 2 : 6;
    if (scheduleCode === "term_3") return termOnly ? 1 : 3;
    if (scheduleCode === "yearly_1off") return 1;
    if (scheduleCode === "own_term") return termOnly ? 1 : 3;
    return 1;
  }

  function adminFeeTotalForSchedule(payCode, scheduleCode, cadence) {
    if (!adminFeeApplies(payCode)) return 0;
    if (payCode === "own_way_flexible") {
      var ownTerms = normalizeEnrolmentCadence(cadence) === "term_by_term" ? 1 : 3;
      return RE_ADMIN_FEE_OWN * ownTerms;
    }
    return RE_ADMIN_FEE_GC_PER_INSTALLMENT * installmentCountForSchedule(scheduleCode, cadence);
  }

  function isAutoContinueSchedule(payCode, scheduleCode) {
    if (payCode === "own_way_flexible") return false;
    return isAllYearScheduleCode(scheduleCode);
  }

  function normalizeEnrolmentCadence(code) {
    if (code === "whole_year" || code === "term_by_term") return code;
    return "";
  }

  function enrolmentCadenceLabel(code) {
    if (code === "whole_year") {
      return "Whole year — confirm once; continue each term automatically";
    }
    if (code === "term_by_term") {
      return "Term by term — confirm before each term";
    }
    return "";
  }

  function scheduleMatchesCadence(scheduleCode, cadence) {
    if (!cadence) return true;
    var code = String(scheduleCode || "");
    if (cadence === "whole_year") {
      /* Year commitment: one-off, 3 term, flexi 6, or monthly 10/11. */
      return (
        code === "yearly_1off" ||
        code === "term_3" ||
        code === "term_flexi" ||
        code === "monthly_10" ||
        code === "monthly_term"
      );
    }
    /* Term-by-term: no full-year one-off. */
    return (
      code === "term_3" ||
      code === "term_flexi" ||
      code === "monthly_10" ||
      code === "monthly_term" ||
      code === "own_term"
    );
  }

  function schedulesForPayAndCadence(payCode, cadence) {
    var opts = (RE_SCHEDULE_OPTIONS[payCode] || []).slice();
    var cad = normalizeEnrolmentCadence(cadence);
    if (!cad) return opts;
    return opts.filter(function (o) {
      return scheduleMatchesCadence(o.code, cad);
    });
  }

  function payMethodCompatibleWithCadence(payCode, cadence) {
    var cad = normalizeEnrolmentCadence(cadence);
    if (!cad) return true;
    if (cad === "whole_year") {
      return payCode === "bank_transfer" || payCode === "gocardless";
    }
    /* Term by term: bank, GoCardless, or own arrangement. */
    return (
      payCode === "bank_transfer" ||
      payCode === "gocardless" ||
      payCode === "own_way_flexible"
    );
  }

  function defaultScheduleForPayAndCadence(payCode, cadence) {
    var cad = normalizeEnrolmentCadence(cadence);
    if (cad === "whole_year") {
      if (payCode === "gocardless") return "monthly_10";
      return "yearly_1off";
    }
    if (cad === "term_by_term") {
      if (payCode === "own_way_flexible") return "own_term";
      if (payCode === "gocardless") return "term_3";
      return "term_3";
    }
    return defaultScheduleForPay(payCode);
  }

  /** Minimum prepaid balance: 2 × pricePerSession for each kept service (summed). */
  function ownArrangementAdvanceBuffer(data) {
    var slots = keptWeeklySlots(data);
    var lines = [];
    var total = 0;
    slots.forEach(function (slot) {
      var price = Number(slot && slot.pricePerSession);
      if (!Number.isFinite(price) || price <= 0) return;
      var line = price * RE_OWN_ADVANCE_SESSIONS;
      total += line;
      lines.push({
        label: slotLabel(slot) || "Service",
        sessions: RE_OWN_ADVANCE_SESSIONS,
        price_per_session: price,
        amount: line,
      });
    });
    return { total: Math.round(total * 100) / 100, lines: lines };
  }

  function initBilling2627State(data) {
    var cur = fundingCurrent2526(data);
    var fundCode = normalizeFundingChoice(mapFundingCode(cur.funding));
    var payCode = normalizePayMethodChoice(mapPrivatePayMethodCode(cur.payment_method, cur.funding));
    if (!payMethodAllowedForFunding(payCode, fundCode)) payCode = "bank_transfer";
    state.billing2627 = {
      fundCode: fundCode,
      payCode: payCode,
      editing: false,
    };
  }

  function billing2526FundingLabel(cur) {
    var raw = String((cur && cur.funding) || "").trim();
    if (raw) return raw;
    return fundingLabel(normalizeFundingChoice(mapFundingCode(cur && cur.funding)), "—");
  }

  function billing2627ChangedFrom2526(data) {
    var cur = fundingCurrent2526(data);
    var b = state.billing2627 || {};
    return (
      normalizeFundingChoice(b.fundCode) !== normalizeFundingChoice(mapFundingCode(cur.funding)) ||
      normalizePayMethodChoice(b.payCode) !==
        normalizePayMethodChoice(mapPrivatePayMethodCode(cur.payment_method, cur.funding))
    );
  }

  function renderBilling2627DefaultView() {
    var b = state.billing2627 || {};
    var fundText = fundingLabel(b.fundCode) || "—";
    var payText = privatePayMethodLabel(b.payCode) || "—";
    return (
      '<div class="re-funding-current">' +
      '<h4><svg class="re-funding-current__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="14" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 9.5h19" stroke="currentColor" stroke-width="1.8"/><path d="M6 14.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Your funding &amp; payment for 2026/27</span></h4>' +
      '<ul class="re-billing-ref-list">' +
      "<li>" +
      '<span class="re-billing-ref-label">Funding</span>' +
      '<span class="re-billing-ref-value">' +
      esc(fundText) +
      "</span></li>" +
      "<li>" +
      '<span class="re-billing-ref-label">Payment method</span>' +
      '<span class="re-billing-ref-value">' +
      esc(payText) +
      "</span></li>" +
      "</ul>" +
      '<p class="re-muted re-billing-ref-note">Pre-filled from your club record. Edit only if something needs to change for 2026/27.</p>' +
      '<button type="button" class="re-btn re-btn--billing-edit-inline" id="reBillingEditBtn">Edit</button>' +
      "</div>"
    );
  }

  function renderFeesNoticeHtml() {
    return (
      '<p class="re-billing-ref-note re-billing-ref-fee" id="reFeesNotice" role="note">' +
      "<strong>Fees:</strong> standard plans (bank transfer or Card / Apple Pay on or before due dates) have <strong>no admin fee</strong>. " +
      "Direct Payment (GoCardless) adds " +
      money(RE_ADMIN_FEE_GC_PER_INSTALLMENT) +
      " per instalment. " +
      "<strong>Own arrangement</strong> (cannot meet our payment dates) is term-only and adds " +
      money(RE_ADMIN_FEE_OWN) +
      " each term, plus a minimum prepaid balance of two sessions per service." +
      "</p>"
    );
  }

  function renderCancelNoticeHtml() {
    return (
      '<p class="re-billing-ref-note re-billing-ref-fee re-cadence-cancel-note" id="reCancelNotice" role="note">' +
      "<strong>Cancelling your bookings:</strong> The same rules apply to <strong>whole year (auto re-enrol)</strong> and <strong>term by term</strong>. " +
      "If you cancel a place after we have already collected payment, we refund unused fees minus an admin charge of " +
      "<strong>10% of the unused amount being refunded</strong> " +
      "(minimum <strong>£25</strong>, maximum <strong>£100</strong>), so the charge stays fair for smaller and larger programmes." +
      "</p>"
    );
  }

  function renderBillingArrangementSection(data) {
    var b = state.billing2627 || {};
    var editing = !!b.editing;
    return (
      '<div id="reBillingArrangementWrap" class="re-billing-arrangement">' +
      '<div id="reBillingArrangementView"' +
      (editing ? " hidden" : "") +
      ">" +
      renderBilling2627DefaultView() +
      "</div>" +
      '<div id="reBillingArrangementEdit"' +
      (editing ? "" : " hidden") +
      ">" +
      '<p class="re-muted re-billing-edit-intro">Update funding or payment method for 2026/27, then save.</p>' +
      '<fieldset class="re-choice-fieldset re-funding-field">' +
      '<legend class="re-label">Funding 2026/27</legend>' +
      renderFundingRadios(b.fundCode) +
      "</fieldset>" +
      '<fieldset class="re-choice-fieldset re-funding-field">' +
      '<legend class="re-label">Payment method 2026/27</legend>' +
      renderPrivatePayMethodRadios(b.payCode, b.fundCode) +
      "</fieldset>" +
      '<div class="re-billing-edit-actions">' +
      '<button type="button" class="re-btn re-btn--primary" id="reBillingSaveBtn">Save</button>' +
      '<button type="button" class="re-btn re-btn--ghost" id="reBillingCancelBtn">Cancel</button>' +
      "</div></div></div>"
    );
  }

  function refreshBillingPaySection(data) {
    var b = state.billing2627 || {};
    if (b.editing) return;
    var payCode = normalizePayMethodChoice(b.payCode);
    if (!payMethodAllowedForFunding(payCode, b.fundCode)) {
      payCode = "bank_transfer";
      b.payCode = payCode;
    }
    if (!payMethodCompatibleWithCadence(payCode, state.enrolmentCadence)) {
      payCode = "bank_transfer";
      b.payCode = payCode;
    }
    var scheduleDefault = defaultScheduleForPayAndCadence(payCode, state.enrolmentCadence);
    var schedWrap = $("rePayScheduleWrap");
    if (schedWrap) schedWrap.innerHTML = renderPayScheduleFieldset(payCode, scheduleDefault);
    syncPrivatePayPanels();
    syncPaymentSchedulePreview();
  }

  function setBillingPayExtrasHidden(hidden) {
    ["rePayScheduleWrap", "reBillingPlanIntro", "rePaySchedulePreview", "reAdminFeeNote", "reOwnWayNote", "reDirectPayFailNote", "reFeesNotice", "reCancelNotice"].forEach(
      function (id) {
        var el = $(id);
        if (!el) return;
        if (hidden) {
          el.hidden = true;
          return;
        }
        if (id === "rePaySchedulePreview") {
          el.hidden = !el.innerHTML;
          return;
        }
        if (id === "reAdminFeeNote") {
          var b = state.billing2627 || {};
          el.hidden = !adminFeeApplies(normalizePayMethodChoice(b.payCode));
          return;
        }
        if (id === "reOwnWayNote") {
          el.hidden = normalizePayMethodChoice((state.billing2627 || {}).payCode) !== "own_way_flexible";
          return;
        }
        if (id === "reDirectPayFailNote") {
          el.hidden = normalizePayMethodChoice((state.billing2627 || {}).payCode) !== "gocardless";
          return;
        }
        if (id === "reFeesNotice" || id === "reCancelNotice") {
          el.hidden = false;
          return;
        }
        el.hidden = false;
      },
    );
  }

  function syncPayAfterCadenceVisibility() {
    var el = $("rePayAfterCadence");
    if (!el) return;
    el.hidden = !normalizeEnrolmentCadence(state.enrolmentCadence);
  }

  function refreshBillingArrangementUI() {
    var wrap = $("reBillingArrangementWrap");
    if (!wrap || !state.lookup) return;
    var tmp = document.createElement("div");
    tmp.innerHTML = renderBillingArrangementSection(state.lookup);
    var next = tmp.firstElementChild;
    if (next) wrap.replaceWith(next);
    var editing = !!(state.billing2627 && state.billing2627.editing);
    setBillingPayExtrasHidden(editing);
    if (!editing) refreshBillingPaySection(state.lookup);
  }

  function funderShortLabel(cur) {
    var s = String((cur && cur.funding) || "").toLowerCase();
    if (s.indexOf("nhs") >= 0) return "NHS";
    return "Local Authority";
  }

  function renderFunderPaidBilling2627Block(data, fundCode, cur, annualTotal) {
    return (
      '<div class="re-funding-2627 re-funding-2627--funder" data-annual-total="' +
      esc(String(annualTotal)) +
      '">' +
      renderEnrolmentCadenceSection() +
      '<div id="rePayEverything">' +
      '<div class="re-funder-paid">' +
      '<p class="re-funder-paid__lead"><strong>This place is funded by your ' +
      esc(funderShortLabel(cur)) +
      ".</strong> There is nothing for you to pay us directly — we invoice your funder.</p>" +
      renderFundedInvoicePanel(data, fundCode, cur, annualTotal) +
      '<p class="re-muted re-funding-foot">If your funding changes for 2026/27, contact info@clubsensational.org so we can update your record before term.</p>' +
      "</div></div>" +
      renderReenrolFarewellHtml(data) +
      "</div>"
    );
  }

  function renderEnrolmentCadenceSection() {
    var selected = normalizeEnrolmentCadence(state.enrolmentCadence);
    var opts = [
      {
        code: "term_by_term",
        title: "Term by term",
        hint:
          "Confirm term by term. We will ask you again before each term whether you want to continue. Invoices / Direct Payments are created for the current term only.",
      },
      {
        code: "whole_year",
        title: "Whole year (auto re-enrol)",
        hint:
          "Confirm once for 2026/27. We treat you as continuing each term automatically — we will not ask again unless you tell us otherwise.",
      },
    ];
    return (
      '<div class="re-cadence-block" id="reCadenceBlock">' +
      '<p class="re-billing-plan-newnote"><strong>New for 2026/27:</strong> you can confirm the <strong>whole year</strong> in one go. We then treat you as continuing each term automatically — we will not ask again unless you tell us otherwise. Term-by-term options are still available.</p>' +
      '<fieldset class="re-choice-fieldset re-funding-field re-cadence-fieldset">' +
      '<legend class="re-label">How would you like to re-enrol? <span class="re-req" aria-hidden="true">*</span></legend>' +
      '<p class="re-muted re-cadence-intro">Please choose one — this tells us whether to auto re-enrol you each term or ask again term by term.</p>' +
      '<div class="re-cadence-options" role="radiogroup" aria-label="Re-enrolment cadence">' +
      opts
        .map(function (o) {
          var checked = selected === o.code ? " checked" : "";
          var spotlight = o.code === "whole_year" ? " re-radio--schedule-spotlight" : "";
          return (
            '<label class="re-radio re-radio--schedule re-radio--cadence' +
            spotlight +
            '">' +
            '<input type="radio" name="re_enrolment_cadence" value="' +
            esc(o.code) +
            '"' +
            checked +
            " required />" +
            '<span class="re-radio--schedule__body">' +
            '<span class="re-radio--schedule__title">' +
            esc(o.title) +
            (o.code === "whole_year"
              ? '<span class="re-schedule-new-badge">New</span>'
              : "") +
            "</span>" +
            '<span class="re-radio--schedule__hint">' +
            esc(o.hint) +
            "</span></span></label>"
          );
        })
        .join("") +
      "</div></fieldset></div>"
    );
  }

  function renderBilling2627Block(data) {
    initBilling2627State(data);
    var annualTotal = resolveAnnualWeeklyTotal(data);
    var cur = fundingCurrent2526(data);
    var rawFundCode = mapFundingCode(cur.funding);
    if (isFunderPaid(rawFundCode)) {
      return renderFunderPaidBilling2627Block(data, rawFundCode, cur, annualTotal);
    }
    var b = state.billing2627;
    var payCode = normalizePayMethodChoice(b.payCode);
    if (!payMethodCompatibleWithCadence(payCode, state.enrolmentCadence)) {
      payCode = "bank_transfer";
      b.payCode = payCode;
    }
    var scheduleDefault = defaultScheduleForPayAndCadence(payCode, state.enrolmentCadence);
    var hasCadence = !!normalizeEnrolmentCadence(state.enrolmentCadence);
    var editing = !!b.editing;

    return (
      '<div class="re-funding-2627" data-annual-total="' +
      esc(String(annualTotal)) +
      '">' +
      renderEnrolmentCadenceSection() +
      '<div id="rePayEverything">' +
      '<div id="rePayAfterCadence"' +
      (hasCadence ? "" : " hidden") +
      ">" +
      '<p class="re-funding-total">' +
      estimatedBillingTotalHtml(data) +
      "</p>" +
      '<div id="reBillingPaySection">' +
      '<div id="rePanelPrivate" class="re-funding-panel">' +
      renderBillingArrangementSection(data) +
      '<div id="rePayScheduleWrap" class="re-pay-schedule-wrap"' +
      (editing ? " hidden" : "") +
      ">" +
      renderPayScheduleFieldset(payCode, scheduleDefault) +
      "</div>" +
      '<p class="re-muted re-billing-plan-intro" id="reBillingPlanIntro"' +
      (editing ? " hidden" : "") +
      ">" +
      (normalizeEnrolmentCadence(state.enrolmentCadence) === "term_by_term"
        ? "The total above is for the <strong>current term only</strong> (term-by-term). Later terms are billed when you reconfirm. "
        : "The total above covers your confirmed sessions for the year. ") +
      "<strong>Bank Transfer / Card / Apple Pay</strong> uses fixed due dates (pay each invoice from the parent portal — no admin fee if on time). <strong>Direct Payment (GoCardless)</strong> is collected automatically once we set up your mandate. <strong>Own arrangement</strong> is only for privately funded families who cannot meet those dates (+ £50 / term) — not available with LA Direct Payments funding.</p>" +
      '<div id="rePaySchedulePreview" class="re-pay-preview-host"' +
      (editing ? " hidden" : "") +
      "></div>" +
      '<div id="reAdminFeeNote" class="re-funding-fee"' +
      (editing || !adminFeeApplies(payCode) ? " hidden" : "") +
      ">" +
      "<strong>Admin fee</strong>" +
      '<span id="reAdminFeeAmount"></span>' +
      "</div>" +
      '<div id="reOwnWayNote" class="re-funding-fee re-funding-fee--own"' +
      (editing || payCode !== "own_way_flexible" ? " hidden" : "") +
      ">" +
      "<strong>Own arrangement</strong>" +
      "Only if you cannot pay the full amount on our published due dates. " +
      "Term by term only (+ " +
      money(RE_ADMIN_FEE_OWN) +
      " each term). You must always keep at least <strong>two sessions paid in advance for each service</strong> " +
      "(e.g. two services → two sessions of each). If the balance falls below that, we may pause sessions or move you to a standard plan. " +
      "Paying on time on Bank Transfer / Card / Apple Pay has <strong>no</strong> £50 fee. Overpayments are kept as credit." +
      "</div>" +
      '<div id="reDirectPayFailNote" class="re-funding-fee re-funding-fee--fail"' +
      (editing || payCode !== "gocardless" ? " hidden" : "") +
      ">" +
      "<strong>If a Direct Payment fails</strong>" +
      "If a GoCardless collection fails (for example insufficient funds or a cancelled mandate), you must pay within " +
      "<strong>7 days</strong> by bank transfer or Card / Apple Pay from the parent portal, including any GoCardless failure charge. " +
      "After <strong>two failed attempts in the same term</strong>, Direct Payment is withdrawn for the rest of the academic year — remaining instalments must be paid by bank transfer / Card / Apple Pay." +
      "</div>" +
      renderFeesNoticeHtml() +
      renderCancelNoticeHtml() +
      "</div></div>" +
      '<p class="re-muted re-funding-foot">Re-enrolment closes ' +
      esc(RE_ENROL_DEADLINE_LABEL) +
      ". First bank / Card / Apple Pay due dates from mid-August; Direct Payment collections from September once your mandate is set up — see schedule above.</p>" +
      "</div></div>" +
      renderReenrolFarewellHtml(data) +
      "</div>"
    );
  }

  function normalizeFundingChoice(code) {
    if (code === "la_nhs") return "la_direct_payments";
    if (code === "la_direct_payments" || code === "privately_funded") return code;
    return "privately_funded";
  }

  function normalizePayMethodChoice(code) {
    if (code === "gocardless") return "gocardless";
    if (code === "own_way_flexible") return "own_way_flexible";
    return "bank_transfer";
  }

  function vatLabelForFunding(fundCode) {
    return isDirectPayments(fundCode) ? "EXEMPT VAT" : "20% VAT included";
  }

  var RE_PRIVATE_PAY_METHODS = [
    {
      code: "bank_transfer",
      label: "Bank Transfer / Card / Apple Pay (fixed due dates)",
    },
    {
      code: "gocardless",
      label: "Direct Payment (GoCardless)",
    },
    {
      code: "own_way_flexible",
      label: "Own arrangement — cannot meet payment dates (+ £50 / term)",
    },
  ];

  var RE_FUNDING_OPTIONS = [
    { code: "privately_funded", label: "Privately" },
    {
      code: "la_direct_payments",
      label: "Using funds from LA (Direct Payments from your EHCP care package)",
    },
  ];

  var RE_SCHEDULE_OPTIONS = {
    bank_transfer: [
      { code: "yearly_1off", label: "All year — one payment" },
      { code: "term_3", label: "Pay each term — one payment" },
      { code: "term_flexi", label: "Flexi term — 2 payments per term" },
      {
        code: "monthly_10",
        label: "Regular monthly — 10 payments (4 / 3 / 3 by term)",
      },
    ],
    gocardless: [
      { code: "term_3", label: "Pay each term — one payment" },
      { code: "term_flexi", label: "Flexi term — 2 payments per term" },
      {
        code: "monthly_10",
        label: "Regular monthly — 10 payments (4 / 3 / 3 by term)",
      },
    ],
    own_way_flexible: [
      {
        code: "own_term",
        label: "Term by term — own payment timing (+ £50 each term)",
      },
    ],
  };

  function scheduleOptionHint(code, payCode, cadence) {
    var isGc = payCode === "gocardless";
    var termOnly = normalizeEnrolmentCadence(cadence) === "term_by_term";
    var termLabel = reenrolTermDisplayLabel(currentReenrolBillingTerm());
    if (code === "own_term") {
      return termOnly
        ? "Only if you cannot meet our fixed due dates. We invoice " +
            termLabel +
            " only for now (programme + £50 admin); later terms when you reconfirm. Keep at least two sessions paid in advance for every service."
        : "Only if you cannot meet our fixed due dates. Term by term on your own timing. £50 admin fee each term. Keep at least two sessions paid in advance for every service. On the parent portal you can still pay each amount by bank transfer or Card / Apple Pay when an invoice is ready.";
    }
    if (code === "yearly_1off") {
      return "One payment for the full academic year — due by 15 August 2026. Pay from the parent portal by bank transfer (no fee) or Card / Apple Pay (small processing fee). Same programme total. Not available with Direct Payment (GoCardless).";
    }
    if (code === "monthly_10") {
      if (termOnly) {
        return isGc
          ? "Term-by-term: monthly Direct Payments for " +
              termLabel +
              " only (Autumn 4 / Spring 3 / Summer 3). Later terms when you reconfirm. £1.50 fee per instalment."
          : "Term-by-term: monthly invoices for " +
              termLabel +
              " only (Autumn 4 / Spring 3 / Summer 3). Later terms when you reconfirm.";
      }
      return isGc
        ? "Regular plan: ten Direct Payments — Autumn 4, Spring 3, Summer 3 (September–June). We set up GoCardless before the first collection; then on the 1st of each month. Same programme total; £1.50 fee per instalment."
        : "Regular plan: ten invoices — Autumn 4, Spring 3, Summer 3 (September–June). Pay each month from the parent portal by bank transfer (no fee) or Card / Apple Pay (small fee). Same programme total; no admin fee if you pay on time.";
    }
    if (code === "monthly_term") {
      return "One payment per month of each term — Autumn 4, Spring 3, Summer 4 (11 across the year).";
    }
    if (code === "term_flexi") {
      if (termOnly) {
        return isGc
          ? "Term-by-term: two Direct Payments for " +
              termLabel +
              " only. Later terms when you reconfirm. £1.50 fee per instalment."
          : "Term-by-term: two invoices for " +
              termLabel +
              " only. Later terms when you reconfirm.";
      }
      return isGc
        ? "Six Direct Payments over the year — two per term. First half on the 1st of each term month (1 September, 1 January, 1 April); second half in half-term week. Same programme total; £1.50 fee per instalment."
        : "Six payments over the year — two per term. First half due on the 1st (1 September, 1 January, 1 April); second half during half-term week. Pay each invoice from the parent portal by bank transfer or Card / Apple Pay — no admin fee if you pay on time.";
    }
    if (code === "term_3") {
      if (termOnly) {
        return isGc
          ? "Term-by-term: one Direct Payment for " +
              termLabel +
              " only. Later terms when you reconfirm. £1.50 fee on that payment."
          : "Term-by-term: one invoice for " +
              termLabel +
              " only. Later terms when you reconfirm.";
      }
      return isGc
        ? "Three Direct Payments — one per term. We set up GoCardless before the first collection. Same programme total; £1.50 fee per instalment."
        : "Three payments — one per term (first due by 15 August 2026, then December and March). Pay each invoice from the parent portal by bank transfer or Card / Apple Pay — no admin fee if you pay on time.";
    }
    return "";
  }

  function mapPrivatePayMethodCode(raw, fundingRaw) {
    var s = String(raw || "").toLowerCase();
    if (!s) return "bank_transfer";
    var compact = s.replace(/[\s_\-]+/g, "");
    if (
      compact.includes("gocardless") ||
      s.includes("direct debit") ||
      s.includes("direct payment") ||
      compact.includes("directdebit") ||
      s.includes("monthly") ||
      s.includes("installment")
    ) {
      return "gocardless";
    }
    return "bank_transfer";
  }

  function defaultScheduleForPay(payCode) {
    if (payCode === "gocardless") return "monthly_10";
    if (payCode === "own_way_flexible") return "own_term";
    if (payCode === "bank_transfer") return "term_flexi";
    return "term_3";
  }

  function isAllYearScheduleCode(code) {
    return code === "monthly_term" || code === "monthly_10" || code === "yearly_1off";
  }

  function mapScheduleCode(rawPay, fundingRaw) {
    var pay = mapPrivatePayMethodCode(rawPay, fundingRaw);
    var s = String(rawPay || "").toLowerCase();
    if (pay === "gocardless") {
      return "monthly_term";
    }
    if (s.includes("whole year") || s.includes("1 off") || s.includes("one invoice") || s.includes("yearly")) {
      return "yearly_1off";
    }
    if (s.includes("flexi") || s.includes("2 payment") || s.includes("half term") || s.includes("halves")) {
      return "term_flexi";
    }
    return "term_3";
  }

  function mapFundedPayMethodCode(cur) {
    var s = String((cur && cur.payment_method) || "").toLowerCase();
    if (s.includes("nhs") || s.includes("po")) return "nhs_invoice";
    return "la_invoice";
  }

  function mapFundingCode(raw) {
    var s = String(raw || "").toLowerCase();
    if (!s) return "privately_funded";
    if (s.includes("direct payment") || s.includes("direct payments")) return "la_direct_payments";
    if (s.includes("local authority") || s.includes("nhs") || s.includes("la-funded")) {
      return "la_nhs";
    }
    if (s.includes("privately") || s.includes("private") || s === "parent") return "privately_funded";
    return "privately_funded";
  }

  function privatePayMethodLabel(code) {
    for (var i = 0; i < RE_PRIVATE_PAY_METHODS.length; i++) {
      if (RE_PRIVATE_PAY_METHODS[i].code === code) return RE_PRIVATE_PAY_METHODS[i].label;
    }
    return code;
  }

  function fundedPayMethodLabel(code) {
    if (code === "nhs_invoice") return "NHS invoice (PO)";
    return "LA invoice (BACS)";
  }

  function scheduleLabel(code) {
    var all = []
      .concat(RE_SCHEDULE_OPTIONS.bank_transfer || [])
      .concat(RE_SCHEDULE_OPTIONS.gocardless || [])
      .concat(RE_SCHEDULE_OPTIONS.own_way_flexible || []);
    for (var i = 0; i < all.length; i++) {
      if (all[i].code === code) return all[i].label;
    }
    return code;
  }

  function renderPrivatePayMethodRadios(defaultCode, fundCode) {
    var methods = privatePayMethodsForFunding(fundCode);
    var selected = normalizePayMethodChoice(defaultCode);
    if (!payMethodAllowedForFunding(selected, fundCode)) {
      selected = "bank_transfer";
    }
    if (!methods.some(function (o) {
      return o.code === selected;
    })) {
      selected = methods.length ? methods[0].code : "bank_transfer";
    }
    return methods.map(function (o) {
      var checked = o.code === selected ? " checked" : "";
      var hint =
        o.code === "own_way_flexible"
          ? "Term only (+ £50 each term). Keep 2 sessions prepaid per service. Prefer Bank Transfer / Card / Apple Pay on a standard plan if you can meet due dates."
          : o.code === "bank_transfer"
            ? "Fixed due dates. Pay each invoice in the parent portal by bank transfer (no fee) or Card / Apple Pay (small fee)."
            : "Automatic Direct Debit once we set up your GoCardless mandate. Choose term, flexi or monthly below. £1.50 per instalment.";
      return (
        '<label class="re-radio re-radio--pay-method">' +
        '<input type="radio" name="re_pay_2627" value="' +
        esc(o.code) +
        '"' +
        checked +
        " />" +
        '<span class="re-radio--schedule__body">' +
        '<span class="re-radio--schedule__title">' +
        esc(o.label) +
        "</span>" +
        '<span class="re-radio--schedule__hint">' +
        esc(hint) +
        "</span></span></label>"
      );
    }).join("");
  }

  function renderPayScheduleFieldset(payCode, scheduleDefault) {
    var cadence = normalizeEnrolmentCadence(state.enrolmentCadence);
    if (!cadence) {
      return '<p class="re-muted re-cadence-wait">Choose <strong>whole year</strong> or <strong>term by term</strong> above first — then your payment options will appear.</p>';
    }
    if (!payMethodCompatibleWithCadence(payCode, cadence)) {
      return (
        '<p class="re-muted re-cadence-wait">' +
        (cadence === "whole_year"
          ? "Whole-year re-enrolment works with <strong>Bank Transfer</strong> or <strong>Direct Payment (GoCardless)</strong>. Edit payment method above if needed."
          : "Term-by-term re-enrolment works with <strong>Bank Transfer</strong>, <strong>Direct Payment (GoCardless)</strong> or <strong>Own arrangement</strong> (private funding only). Edit payment method above if needed.") +
        "</p>"
      );
    }
    var opts = schedulesForPayAndCadence(payCode, cadence);
    if (!opts || !opts.length) {
      return '<p class="re-muted re-cadence-wait">No payment schedules match this choice — edit funding/payment method above.</p>';
    }
    var validDefault = opts.some(function (o) {
      return o.code === scheduleDefault;
    })
      ? scheduleDefault
      : opts[0].code;
    var title = "How would you like to pay?";
    return (
      '<fieldset class="re-choice-fieldset re-funding-field re-pay-schedule">' +
      '<legend class="re-label">' +
      esc(title) +
      "</legend>" +
      '<div class="re-schedule-options">' +
      opts
        .map(function (o) {
          var checked = o.code === validDefault ? " checked" : "";
          var hint = scheduleOptionHint(o.code, payCode, cadence);
          var spotlight =
            o.code === "yearly_1off" || o.code === "monthly_10"
              ? " re-radio--schedule-spotlight"
              : "";
          return (
            '<label class="re-radio re-radio--schedule' +
            spotlight +
            '">' +
            '<input type="radio" name="re_pay_schedule_2627" value="' +
            esc(o.code) +
            '"' +
            checked +
            " />" +
            '<span class="re-radio--schedule__body">' +
            '<span class="re-radio--schedule__title">' +
            esc(o.label) +
            (spotlight ? '<span class="re-schedule-new-badge">New</span>' : "") +
            "</span>" +
            (hint
              ? '<span class="re-radio--schedule__hint">' + esc(hint) + "</span>"
              : "") +
            "</span></label>"
          );
        })
        .join("") +
      "</div></fieldset>"
    );
  }

  function renderFundedInvoicePanel(data, fundCode, cur, annualTotal) {
    var payCode = mapFundedPayMethodCode(cur);
    var funderLabel = fundingLabel(fundCode, cur.funding);
    var hasAmount = Number.isFinite(Number(annualTotal)) && Number(annualTotal) > 0;
    return (
      '<div class="re-funded-invoice">' +
      "<h4>Annual invoice total 2026/27</h4>" +
      (hasAmount
        ? '<p class="re-funded-invoice__amount">' + esc(money(annualTotal)) + "</p>"
        : '<p class="re-funded-invoice__amount re-funded-invoice__amount--agreed">Fees agreed with your funder</p>') +
      '<p class="re-muted">For your records — ' +
      (hasAmount
        ? "this is the full-year total we invoice to your LA or NHS funder. "
        : "your fees are agreed directly with your LA or NHS funder. ") +
      "The club bills your funder on our admin schedule; you do not pay us directly.</p>" +
      "</div>" +
      '<dl class="re-dl re-funded-meta">' +
      "<dt>Funder pays</dt><dd>" +
      esc(funderLabel) +
      "</dd>" +
      "<dt>Invoice route</dt><dd>" +
      esc(fundedPayMethodLabel(payCode)) +
      "</dd>" +
      "<dt>Our billing</dt><dd>Annual total to funder · admin monthly internally</dd>" +
      "</dl>"
    );
  }

  function renderFundingRadios(defaultCode) {
    return RE_FUNDING_OPTIONS.map(function (o) {
      var checked = o.code === defaultCode ? " checked" : "";
      return (
        '<label class="re-radio"><input type="radio" name="re_fund_2627" value="' +
        esc(o.code) +
        '"' +
        checked +
        " /> " +
        esc(o.label) +
        "</label>"
      );
    }).join("");
  }

  function fundingLabel(code, fallback) {
    for (var j = 0; j < RE_FUNDING_OPTIONS.length; j++) {
      if (RE_FUNDING_OPTIONS[j].code === code) return RE_FUNDING_OPTIONS[j].label;
    }
    return fallback || code;
  }

  function syncFundingPanels() {
    syncPrivatePayPanels();
    syncPaymentSchedulePreview();
  }

  function syncPrivatePayPanels() {
    var b = state.billing2627 || {};
    var payCode = normalizePayMethodChoice(b.payCode || "bank_transfer");
    var cadence = normalizeEnrolmentCadence(state.enrolmentCadence);
    if (cadence && !payMethodCompatibleWithCadence(payCode, cadence)) {
      payCode = "bank_transfer";
      b.payCode = payCode;
    }
    var schedWrap = $("rePayScheduleWrap");
    if (schedWrap) {
      var prev = document.querySelector('input[name="re_pay_schedule_2627"]:checked');
      var prevVal = prev ? prev.value : null;
      if (payCode === "bank_transfer" || payCode === "gocardless" || payCode === "own_way_flexible") {
        var fallbackSched = defaultScheduleForPayAndCadence(payCode, cadence);
        var opts = schedulesForPayAndCadence(payCode, cadence);
        var keepPrev = opts.some(function (o) {
          return o.code === prevVal;
        });
        schedWrap.innerHTML = renderPayScheduleFieldset(
          payCode,
          keepPrev ? prevVal : fallbackSched,
        );
        schedWrap.hidden = false;
      } else {
        schedWrap.innerHTML = "";
        schedWrap.hidden = true;
      }
    }
    updateAdminFeeAmount();
    var failNote = $("reDirectPayFailNote");
    if (failNote) failNote.hidden = payCode !== "gocardless";
    var ownNote = $("reOwnWayNote");
    if (ownNote) ownNote.hidden = payCode !== "own_way_flexible";
    syncPaymentSchedulePreview();
  }

  function updateAdminFeeAmount() {
    var b = state.billing2627 || {};
    var payCode = normalizePayMethodChoice(b.payCode || "bank_transfer");
    var cadence = normalizeEnrolmentCadence(state.enrolmentCadence);
    var feeNote = $("reAdminFeeNote");
    var feeAmt = $("reAdminFeeAmount");
    var wrap = document.querySelector(".re-funding-2627");
    var annual = wrap ? Number(wrap.getAttribute("data-annual-total")) : 0;
    if (feeNote) feeNote.hidden = !adminFeeApplies(payCode);
    if (!feeAmt) return;
    if (adminFeeApplies(payCode) && annual > 0) {
      var schedEl = document.querySelector('input[name="re_pay_schedule_2627"]:checked');
      var schedCode = schedEl ? schedEl.value : defaultScheduleForPayAndCadence(payCode, cadence);
      var feeTotal = adminFeeTotalForSchedule(payCode, schedCode, cadence);
      if (payCode === "own_way_flexible") {
        var buffer = ownArrangementAdvanceBuffer(state.lookup);
        var ownTerms = cadence === "term_by_term" ? 1 : 3;
        feeAmt.textContent =
          " — " +
          money(RE_ADMIN_FEE_OWN) +
          (ownTerms === 1
            ? " for " + reenrolTermDisplayLabel(currentReenrolBillingTerm()) + " = " + money(feeTotal)
            : " × 3 terms = " + money(feeTotal)) +
          (ownTerms === 1
            ? " (this term)"
            : " (indicative total " + money(annual + feeTotal) + ")") +
          (buffer.total > 0
            ? "; keep at least " + money(buffer.total) + " prepaid (2 sessions × each service)"
            : "");
      } else {
        var n = installmentCountForSchedule(schedCode, cadence);
        feeAmt.textContent =
          " — " +
          money(RE_ADMIN_FEE_GC_PER_INSTALLMENT) +
          " × " +
          n +
          " = " +
          money(feeTotal) +
          (cadence === "term_by_term"
            ? " for " + reenrolTermDisplayLabel(currentReenrolBillingTerm()) + " (term-by-term)"
            : " per year (indicative total " + money(annual + feeTotal) + ")");
      }
    } else {
      feeAmt.textContent = "";
    }
  }

  function refreshProgrammeTotalsFromChoices() {
    var data = state.lookup;
    var wrap = document.querySelector(".re-funding-2627");
    if (wrap && data) {
      var disp = estimatedBillingTotalDisplay(data);
      wrap.setAttribute("data-annual-total", String(disp.annual));
      wrap.setAttribute("data-billing-total", String(disp.amount));
      var totalEl = wrap.querySelector(".re-funding-total");
      if (totalEl) {
        totalEl.innerHTML = estimatedBillingTotalHtml(data);
      }
      var intro = document.getElementById("reBillingPlanIntro");
      if (intro) {
        var cadence = normalizeEnrolmentCadence(state.enrolmentCadence);
        intro.innerHTML =
          (cadence === "term_by_term"
            ? "The total above is for the <strong>current term only</strong> (term-by-term). Later terms are billed when you reconfirm. "
            : "The total above covers your confirmed sessions for the year. ") +
          "<strong>Bank Transfer / Card / Apple Pay</strong> uses fixed due dates (pay each invoice from the parent portal — no admin fee if on time). <strong>Direct Payment (GoCardless)</strong> is collected automatically once we set up your mandate. <strong>Own arrangement</strong> is only for privately funded families who cannot meet those dates (+ £50 / term) — not available with LA Direct Payments funding.";
      }
    }
    updateAdminFeeAmount();
    syncPaymentSchedulePreview();
    syncFarewellVisibility();
  }

  function syncFarewellVisibility() {
    var data = state.lookup;
    if (!data) return;
    var farewell = noSessionsKept(data);
    var payEl = document.getElementById("rePayEverything");
    var byeEl = document.getElementById("reFarewell");
    if (payEl) payEl.hidden = farewell;
    if (byeEl) byeEl.hidden = !farewell;
  }

  function bindFundingHandlers() {
    var host = $("reFormHost");
    if (!host || host.__reBillingBound) {
      syncFundingPanels();
      syncPaymentSchedulePreview();
      return;
    }
    host.__reBillingBound = true;
    host.addEventListener("click", function (e) {
      var editBtn = e.target && e.target.closest ? e.target.closest("#reBillingEditBtn") : null;
      var saveBtn = e.target && e.target.closest ? e.target.closest("#reBillingSaveBtn") : null;
      var cancelBtn = e.target && e.target.closest ? e.target.closest("#reBillingCancelBtn") : null;
      if (editBtn) {
        state.billing2627.editing = true;
        refreshBillingArrangementUI();
        return;
      }
      if (saveBtn) {
        var fundEl = document.querySelector('input[name="re_fund_2627"]:checked');
        var payEl = document.querySelector('input[name="re_pay_2627"]:checked');
        if (fundEl) state.billing2627.fundCode = normalizeFundingChoice(fundEl.value);
        if (payEl) state.billing2627.payCode = normalizePayMethodChoice(payEl.value);
        if (!payMethodAllowedForFunding(state.billing2627.payCode, state.billing2627.fundCode)) {
          state.billing2627.payCode = "bank_transfer";
        }
        state.billing2627.editing = false;
        refreshBillingArrangementUI();
        return;
      }
      if (cancelBtn) {
        state.billing2627.editing = false;
        refreshBillingArrangementUI();
      }
    });
    host.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t && t.name === "re_fund_2627") {
        /* Refresh payment-method radios when funding changes (hide Own arrangement for LA DP). */
        var fundCode = normalizeFundingChoice(t.value);
        var payEl = document.querySelector('input[name="re_pay_2627"]:checked');
        var payCode = payEl ? normalizePayMethodChoice(payEl.value) : "bank_transfer";
        if (!payMethodAllowedForFunding(payCode, fundCode)) payCode = "bank_transfer";
        var payFieldsets = document.querySelectorAll("#reBillingArrangementEdit fieldset.re-funding-field");
        var payFs = payFieldsets.length > 1 ? payFieldsets[1] : null;
        if (payFs) {
          var legend = payFs.querySelector("legend");
          payFs.innerHTML =
            (legend ? legend.outerHTML : '<legend class="re-label">Payment method 2026/27</legend>') +
            renderPrivatePayMethodRadios(payCode, fundCode);
        }
        return;
      }
      if (t && t.name === "re_enrolment_cadence") {
        state.enrolmentCadence = normalizeEnrolmentCadence(t.value);
        var b = state.billing2627 || {};
        if (!payMethodCompatibleWithCadence(b.payCode, state.enrolmentCadence)) {
          b.payCode = "bank_transfer";
        }
        syncPayAfterCadenceVisibility();
        syncPrivatePayPanels();
        refreshProgrammeTotalsFromChoices();
        return;
      }
      if (t && t.name === "re_pay_schedule_2627") {
        syncPaymentSchedulePreview();
        updateAdminFeeAmount();
        return;
      }
      if (t && t.name && t.name.indexOf("choice_") === 0) {
        var card = t.closest ? t.closest(".re-slot-card") : null;
        if (card) {
          var id = card.getAttribute("data-slot-id");
          if (!state.weeklyChoices) state.weeklyChoices = {};
          state.weeklyChoices[id] = t.value;
        }
        refreshProgrammeTotalsFromChoices();
        return;
      }
      if (t && t.name === "dc_choice") {
        refreshProgrammeTotalsFromChoices();
      }
    });
    syncFundingPanels();
    syncPaymentSchedulePreview();
    syncFarewellVisibility();
  }

  function collectBillingChoices(data) {
    var cur = fundingCurrent2526(data);
    var b = state.billing2627 || {};
    var rawFundCode = mapFundingCode(cur.funding);
    var annualTotal = resolveAnnualWeeklyTotal(data);
    var cadence = normalizeEnrolmentCadence(state.enrolmentCadence);
    var cadenceLabel = enrolmentCadenceLabel(cadence);
    if (isFunderPaid(rawFundCode)) {
      var funderPay = mapFundedPayMethodCode(cur);
      var funderAuto = cadence === "whole_year";
      return {
        current_2526: cur,
        choices_2627: {
          billing_mode: "funder_invoice",
          funding_code: rawFundCode,
          funding_label: cur.funding || "LA / NHS funded",
          payment_method_code: funderPay,
          payment_method_label: fundedPayMethodLabel(funderPay),
          payment_schedule_code: null,
          payment_schedule_label: null,
          invoice_type_code: "exempt",
          invoice_type_label: "EXEMPT VAT",
          admin_fee_applies: false,
          admin_fee_total: 0,
          estimated_annual_total: annualTotal,
          estimated_total_with_admin_fee: null,
          billing_schedule: "funder",
          enrolment_cadence: cadence || null,
          enrolment_cadence_label: cadenceLabel || null,
          auto_continue: funderAuto,
          auto_continue_note: funderAuto
            ? "We will treat this place as continuing each term with the same arrangement unless you tell us otherwise."
            : cadence === "term_by_term"
              ? "We will ask you to confirm before each term. Invoices are created for the current term only."
              : null,
        },
      };
    }
    var fundCode = normalizeFundingChoice(b.fundCode || rawFundCode);

    var payCode = normalizePayMethodChoice(
      b.payCode || mapPrivatePayMethodCode(cur.payment_method, cur.funding),
    );
    if (!payMethodAllowedForFunding(payCode, fundCode)) {
      payCode = "bank_transfer";
    }
    if (cadence && !payMethodCompatibleWithCadence(payCode, cadence)) {
      payCode = "bank_transfer";
    }
    var schedEl = document.querySelector('input[name="re_pay_schedule_2627"]:checked');
    var scheduleCode =
      schedEl &&
      (payCode === "bank_transfer" ||
        payCode === "gocardless" ||
        payCode === "own_way_flexible")
        ? schedEl.value
        : defaultScheduleForPayAndCadence(payCode, cadence);
    if (cadence && !scheduleMatchesCadence(scheduleCode, cadence)) {
      scheduleCode = defaultScheduleForPayAndCadence(payCode, cadence);
    }
    /* Whole-year one-off is bank transfer / Card / Apple Pay only. */
    if (payCode === "gocardless" && scheduleCode === "yearly_1off") {
      scheduleCode = defaultScheduleForPayAndCadence(payCode, cadence) || "monthly_10";
    }
    var vatCode = isDirectPayments(fundCode) ? "exempt" : "vat_included";
    var fee = adminFeeApplies(payCode);
    var feeTotal = fee ? adminFeeTotalForSchedule(payCode, scheduleCode, cadence) : 0;
    var autoContinue =
      cadence === "whole_year" ||
      (cadence !== "term_by_term" && isAutoContinueSchedule(payCode, scheduleCode));
    var advanceBuffer =
      payCode === "own_way_flexible" ? ownArrangementAdvanceBuffer(data) : { total: 0, lines: [] };
    return {
      current_2526: cur,
      choices_2627: {
        billing_mode: isDirectPayments(fundCode) ? "direct_payments" : "private",
        funding_code: fundCode,
        funding_label: fundingLabel(fundCode, cur.funding),
        payment_method_code: payCode,
        payment_method_label: privatePayMethodLabel(payCode),
        payment_schedule_code: scheduleCode,
        payment_schedule_label: scheduleCode ? scheduleLabel(scheduleCode) : null,
        invoice_type_code: vatCode,
        invoice_type_label: vatLabelForFunding(fundCode),
        admin_fee_applies: fee,
        admin_fee_total: feeTotal,
        admin_fee_reason:
          payCode === "own_way_flexible"
            ? "own_arrangement_per_term"
            : payCode === "gocardless"
              ? "gocardless_instalment"
              : null,
        enrolment_cadence: cadence || null,
        enrolment_cadence_label: cadenceLabel || null,
        auto_continue: autoContinue,
        auto_continue_note: autoContinue
          ? "We will treat this place as continuing each term with the same arrangement unless you tell us otherwise."
          : cadence === "term_by_term"
            ? "We will ask you to confirm before each term. Invoices are created for the current term only."
            : null,
        advance_buffer_sessions_per_service:
          payCode === "own_way_flexible" ? RE_OWN_ADVANCE_SESSIONS : null,
        advance_buffer_gbp: payCode === "own_way_flexible" ? advanceBuffer.total : null,
        advance_buffer_lines: payCode === "own_way_flexible" ? advanceBuffer.lines : null,
        advance_buffer_note:
          payCode === "own_way_flexible"
            ? "Must keep at least two sessions paid in advance for each service. Below that, sessions may be paused or moved to a standard payment plan."
            : null,
        estimated_annual_total: annualTotal,
        estimated_total_with_admin_fee:
          fee && annualTotal > 0 ? annualTotal + feeTotal : null,
        billing_schedule:
          scheduleCode === "yearly_1off"
            ? "yearly"
            : scheduleCode === "monthly_term" || scheduleCode === "monthly_10"
              ? "monthly"
              : scheduleCode === "term_flexi"
                ? "term_flexi"
                : scheduleCode === "own_term"
                  ? "own_term"
                  : "term",
      },
    };
  }

  function renderWeeklySlots(slots) {
    if (!slots || !slots.length) {
      return '<p class="re-muted">No weekly or weekend activities on file — contact the office if this is wrong.</p>';
    }
    var toneCounter = 0;
    return (
      '<div class="re-slot-list">' +
      slots
        .map(function (slot, idx) {
          var id = esc(slot.id || "slot-" + idx);
          var rawParts = formatWeeklySlotCardParts(slot);
          var tone = null;
          if (rawParts) {
            tone = RE_SERVICE_TONES[toneCounter % RE_SERVICE_TONES.length];
            toneCounter += 1;
          }
          var parts = rawParts || { service: slotLabel(slot), detail: "" };
          var price = slot.pricePerSession != null ? money(slot.pricePerSession) + " / session" : "—";
          var autumn = slot.sessions && slot.sessions.autumn;
          var spring = slot.sessions && slot.sessions.spring;
          var summer = slot.sessions && slot.sessions.summer;
          var annualSessions = slot.sessions && slot.sessions.annual;
          return (
            '<article class="re-slot-card" data-slot-id="' +
            id +
            '">' +
            '<div class="re-slot-col re-slot-col--service">' +
            '<div class="re-slot-intro">' +
            '<p class="re-slot-service-name">' +
            esc(parts.service) +
            (tone
              ? '<span class="re-slot-service-dot" style="background:' +
                tone +
                '" aria-hidden="true"></span>'
              : "") +
            "</p>" +
            (parts.detail ? '<p class="re-slot-service-detail">' + esc(parts.detail) + "</p>" : "") +
            "</div>" +
            '<div class="re-slot-price-wrap">' +
            '<span class="re-slot-price">' +
            esc(price) +
            "</span></div>" +
            "</div>" +
            '<div class="re-slot-col re-slot-col--sessions re-slot-meta">' +
            '<div class="re-slot-meta-block">' +
            '<span class="re-slot-meta-label">Sessions 2026/27</span>' +
            '<span class="re-slot-meta-value">' +
            "Autumn " +
            esc(String(autumn)) +
            " · Spring " +
            esc(String(spring)) +
            " · Summer " +
            esc(String(summer)) +
            "</span>" +
            '<span class="re-slot-meta-sub">' +
            esc(String(annualSessions)) +
            " sessions/year</span></div>" +
            "</div>" +
            '<fieldset class="re-choice-fieldset re-slot-col re-slot-col--choice">' +
            '<legend class="re-sr-only">Choice for ' +
            esc(slot.serviceType || "slot") +
            "</legend>" +
            '<label class="re-radio"><input type="radio" name="choice_' +
            id +
            '" value="keep" checked /> Keep this slot for 2026/27' +
            '<svg class="re-radio__icon re-radio__icon--yes" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#16a34a"/><path d="M7 12.5l3 3 7-7" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
            "</label>" +
            '<label class="re-radio"><input type="radio" name="choice_' +
            id +
            '" value="withdraw" /> Do not continue this activity' +
            '<svg class="re-radio__icon re-radio__icon--no" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#dc2626"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>' +
            "</label>" +
            "</fieldset>" +
            "</article>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderDayCentreBlock(dc) {
    if (!dc || !dc.slots || !dc.slots.length) return "";
    var slots = dc.slots
      .map(function (s) {
        var parts = [];
        if (s.ratio) parts.push(esc(s.ratio));
        if (s.hoursLabel) parts.push(esc(s.hoursLabel));
        if (s.day) parts.push(esc(s.day));
        return "<li>" + (parts.length ? parts.join(" · ") : esc(s.raw || "Day Centre")) + "</li>";
      })
      .join("");
    return (
      '<p class="re-muted">' +
      esc(dc.note || "Fees agreed with your funder — not shown here.") +
      "</p>" +
      '<ul class="re-dc-list">' +
      slots +
      "</ul>" +
      '<fieldset class="re-choice-fieldset">' +
      '<legend class="re-sr-only">Day Centre re-enrolment</legend>' +
      '<label class="re-radio"><input type="radio" name="dc_choice" value="continue" checked /> Continue Day Centre provision for 2026/27 (same pattern unless agreed otherwise)</label>' +
      '<label class="re-radio"><input type="radio" name="dc_choice" value="discuss" /> I need to discuss changes (days, hours or ratio)</label>' +
      '<label class="re-radio"><input type="radio" name="dc_choice" value="withdraw" /> Do not continue Day Centre</label>' +
      "</fieldset>"
    );
  }

  function renderPrimaryServiceSection(data) {
    var hasWeekly = hasWeeklySlots(data);
    var hasDc = hasDayCentreEnrolled(data);
    if (!hasWeekly && hasDc) {
      return (
        '<section class="re-section re-section--services">' +
        reSectionTitle("h3", "services", primaryServiceSectionTitle(data)) +
        '<p class="re-muted">Your weekday Day Centre pattern — fees agreed with your funder.</p>' +
        renderDayCentreBlock(data.day_centre) +
        "</section>"
      );
    }
    var weeklyHtml = hasWeekly
      ? renderWeeklySlots(data.weekly_slots || [])
      : '<p class="re-muted">No weekly or weekend activities on file — contact the office if this is wrong.</p>';
    var dcDecision = hasDc
      ? '<div class="re-offer-block re-offer-block--dc">' +
        "<h4>Your Day Centre (SwimFarm)</h4>" +
        renderDayCentreBlock(data.day_centre) +
        '<button type="button" class="re-btn re-btn--secondary" id="reDayCentreDatesBtn">Day Centre dates 2026/27</button>' +
        "</div>"
      : "";
    return (
      '<section class="re-section re-section--services">' +
      reSectionTitle("h3", "services", primaryServiceSectionTitle(data)) +
      '<p class="re-muted">Your weekly and weekend activities · prices per session · term counts exclude bank holidays.</p>' +
      weeklyHtml +
      dcDecision +
      "</section>"
    );
  }

  function renderTermDatesLead() {
    return (
      '<section class="re-section re-section--dates-lead">' +
      reSectionTitle("h3", "calendar", "ClubSENsational Calendar 2026/27") +
      '<div class="re-dates-lead-grid">' +
      '<div class="re-dates-lead__intro">' +
      '<p class="re-muted">Start here — view term dates, half terms and closures for the year ahead.</p>' +
      '<span class="re-dates-lead__cta-icon" aria-hidden="true">' +
      reIconSvg("calendar") +
      "</span>" +
      '<button type="button" class="re-btn re-btn--primary re-btn--dates-lead" id="reTermDatesBtn">See dates for the whole year</button>' +
      '<p class="re-muted re-dates-lead__hint">Tap to open the full calendar for the whole year — every term, half term and closure.</p>' +
      "</div>" +
      '<div class="re-dates-lead__preview" id="reAutumnPreviewHost" role="button" tabindex="0" aria-label="Preview of Autumn term — open the full calendar">' +
      '<p class="re-cal-loading" role="status">Loading preview…</p>' +
      "</div>" +
      "</div>" +
      "</section>"
    );
  }

  function renderOtherServicesInfoHtml(data) {
    var hasDc = hasDayCentreEnrolled(data);
    var cards = "";
    if (!hasDc) {
      cards +=
        '<div class="re-offer-block">' +
        "<h4>Day Centre (SwimFarm)</h4>" +
        '<p class="re-muted">Weekday provision (Mon–Fri), separate from After-School &amp; Weekends. Contact the office if you would like to add Day Centre.</p>' +
        '<button type="button" class="re-btn re-btn--secondary" id="reDayCentreDatesBtn">Day Centre dates 2026/27</button>' +
        "</div>";
    }
    cards +=
      '<div class="re-offer-block">' +
      "<h4>Summer crash courses · July 2026</h4>" +
      '<p class="re-muted">Climbing (Westway) and Swimming (Acton), Tue–Fri weeks: 21–24 July and 28–31 July. Weekly packs have priority. <strong>Pay in full</strong> to reserve — places are limited (2 climbing / 8 swimming slots per day).</p>' +
      '<div class="re-offer-actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">' +
      '<a class="re-btn re-btn--primary" id="reCrashBookBtn" href="/parent/crash-summer" style="width:auto;flex:1 1 160px;min-width:0;margin-top:0;text-align:center">Book summer crash courses</a>' +
      '<button type="button" class="re-btn re-btn--secondary" id="reCrashDatesBtn" style="flex:1 1 140px;min-width:0;margin-top:0">View dates on calendar</button>' +
      "</div></div>";
    cards +=
      '<div class="re-offer-block">' +
      "<h4>Half-term intensives</h4>" +
      '<p class="re-muted">October, February and May half terms (Mon–Thu). Booking for those weeks opens closer to the dates.</p>' +
      "</div>";
    return (
      '<section class="re-section re-section--offer re-done-offer">' +
      '<h3 class="re-done-offer__title">Other services you might like</h3>' +
      '<p class="re-muted">These run separately from your re-enrolment, on their own dates.</p>' +
      cards +
      "</section>"
    );
  }

  function bindDoneOfferHandlers() {
    var host = $("reDoneOffer");
    if (!host) return;
    var dcBtn = host.querySelector("#reDayCentreDatesBtn");
    if (dcBtn) {
      dcBtn.addEventListener("click", function () {
        openStaffCalendarModal("Day Centre dates 2026/27", "dcCalDayCentrePanel");
      });
    }
    var crashBtn = host.querySelector("#reCrashDatesBtn");
    if (crashBtn) {
      crashBtn.addEventListener("click", function () {
        openStaffCalendarModal("Intensive course dates 2026/27", "dcCalCrashPanel");
      });
    }
  }

  var RE_DAY_CENTRE_DATES_2627 = [
    {
      title: "Autumn Term 2026",
      weeks: "16 weeks",
      lines: [
        "Opens: Tuesday 1 September 2026",
        "Last day: Friday 18 December 2026",
        "Christmas closure: Saturday 19 December 2026 – Sunday 3 January 2027",
      ],
    },
    {
      title: "Spring Term 2027",
      weeks: "11 weeks",
      lines: [
        "Opens: Monday 4 January 2027",
        "Last day: Thursday 25 March 2027",
        "Easter closure: Friday 26 March – Sunday 11 April 2027",
      ],
    },
    {
      title: "Summer Term 2027",
      weeks: "16 weeks",
      lines: [
        "Opens: Monday 12 April 2027",
        "Main term ends: Friday 16 July 2027",
        "Summer provision: Monday 19 July – Friday 30 July 2027",
        "Last Day Centre day: Friday 30 July 2027",
      ],
    },
  ];

  var RE_TERM_DATES_2627 = [
    {
      title: "Autumn Term 2026",
      sessions: "14 weekday · 13 weekend sessions",
      items: [
        { type: "start", date: "Saturday 5 September 2026" },
        {
          type: "half_term",
          date: "Monday 26 – Friday 30 October 2026",
          crashIndex: 2,
        },
        {
          type: "closure",
          label: "Christmas closure",
          date: "Saturday 19 December 2026 – Sunday 3 January 2027",
        },
      ],
    },
    {
      title: "Spring Term 2027",
      sessions: "11 weekday · 9 weekend sessions",
      items: [
        { type: "start", date: "Monday 4 January 2027" },
        {
          type: "half_term",
          date: "Monday 15 – Friday 19 February 2027",
          crashIndex: 3,
        },
        {
          type: "closure",
          label: "Easter closure",
          date: "Friday 26 March – Sunday 11 April 2027",
        },
      ],
    },
    {
      title: "Summer Term 2027",
      sessions: "14 weekday · 12 weekend sessions",
      items: [
        { type: "start", date: "Monday 12 April 2027" },
        {
          type: "half_term",
          date: "Monday 31 May – Friday 4 June 2027",
          crashIndex: 4,
        },
        { type: "last_day", date: "Thursday 22 July 2027" },
      ],
    },
  ];

  var RE_CRASH_DATES_2627 = [
    {
      title: "Summer holiday · Week 1 (July 2026)",
      days: [
        { dow: "Mon", num: "20", off: true },
        { dow: "Tue", num: "21" },
        { dow: "Wed", num: "22" },
        { dow: "Thu", num: "23" },
        { dow: "Fri", num: "24" },
      ],
    },
    {
      title: "Summer holiday · Week 2 (July 2026)",
      days: [
        { dow: "Mon", num: "27", off: true },
        { dow: "Tue", num: "28" },
        { dow: "Wed", num: "29" },
        { dow: "Thu", num: "30" },
        { dow: "Fri", num: "31" },
      ],
    },
    {
      title: "October half term 2026",
      days: [
        { dow: "Mon", num: "26" },
        { dow: "Tue", num: "27" },
        { dow: "Wed", num: "28" },
        { dow: "Thu", num: "29" },
        { dow: "Fri", num: "30", off: true },
      ],
    },
    {
      title: "February half term 2027",
      days: [
        { dow: "Mon", num: "15" },
        { dow: "Tue", num: "16" },
        { dow: "Wed", num: "17" },
        { dow: "Thu", num: "18" },
        { dow: "Fri", num: "19", off: true },
      ],
    },
    {
      title: "May half term 2027",
      days: [
        { dow: "Mon", num: "31", sub: "May" },
        { dow: "Tue", num: "1", sub: "Jun" },
        { dow: "Wed", num: "2", sub: "Jun" },
        { dow: "Thu", num: "3", sub: "Jun" },
        { dow: "Fri", num: "4", sub: "Jun", off: true },
      ],
    },
  ];

  function renderDayCentreDatesModalBody() {
    return (
      '<p class="re-cal-summary">Day Centre runs at SwimFarm on weekdays (Mon–Fri). Bank holidays and closures are excluded from your agreed pattern.</p>' +
      RE_DAY_CENTRE_DATES_2627.map(function (term) {
        return (
          '<div class="re-cal-block">' +
          "<h4>" +
          esc(term.title) +
          "</h4>" +
          '<p class="re-muted" style="margin:0 0 6px;font-size:.84rem">' +
          esc(term.weeks) +
          "</p>" +
          "<ul>" +
          term.lines
            .map(function (line) {
              return "<li>" + esc(line) + "</li>";
            })
            .join("") +
          "</ul></div>"
        );
      }).join("")
    );
  }

  function renderTermDateItem(item) {
    if (!item || !item.type) return "";
    if (item.type === "start") {
      return (
        '<li class="re-cal-line">' +
        reCalIconSvg("termStart") +
        '<div class="re-cal-line__body">' +
        '<span class="re-cal-line__label">Term starts</span>' +
        '<span class="re-cal-line__date">' +
        esc(item.date) +
        "</span></div></li>"
      );
    }
    if (item.type === "half_term") {
      return (
        '<li class="re-cal-line re-cal-line--offer">' +
        reCalIconSvg("halfTerm") +
        '<div class="re-cal-line__body">' +
        '<button type="button" class="re-cal-offer-link" data-crash-idx="' +
        esc(String(item.crashIndex != null ? item.crashIndex : "")) +
        '">' +
        reCalIconSvg("crash") +
        '<span class="re-cal-offer-link__text">' +
        '<span class="re-cal-offer-link__title">Half term offer</span>' +
        '<span class="re-cal-offer-link__hint">Intensive courses · Mon–Thu · view dates</span>' +
        "</span></button>" +
        '<span class="re-cal-line__date">' +
        esc(item.date) +
        "</span></div></li>"
      );
    }
    if (item.type === "closure") {
      return (
        '<li class="re-cal-line">' +
        reCalIconSvg("closure") +
        '<div class="re-cal-line__body">' +
        '<span class="re-cal-line__label">' +
        esc(item.label || "Closure") +
        "</span>" +
        '<span class="re-cal-line__date">' +
        esc(item.date) +
        "</span></div></li>"
      );
    }
    if (item.type === "last_day") {
      return (
        '<li class="re-cal-line">' +
        reCalIconSvg("lastDay") +
        '<div class="re-cal-line__body">' +
        '<span class="re-cal-line__label">Last sessions day</span>' +
        '<span class="re-cal-line__date">' +
        esc(item.date) +
        "</span></div></li>"
      );
    }
    return "";
  }

  function renderTermDatesModalBody() {
    return (
      '<p class="re-cal-summary">Bank holidays are excluded from session counts shown on your activity cards. Term start dates only — no end-of-term date is listed here.</p>' +
      RE_TERM_DATES_2627.map(function (term) {
        return (
          '<div class="re-cal-block">' +
          '<h4 class="re-cal-block__title">' +
          reCalIconSvg("calendar") +
          "<span>" +
          esc(term.title) +
          "</span></h4>" +
          '<p class="re-muted re-cal-block__sessions">' +
          esc(term.sessions) +
          "</p>" +
          '<ul class="re-cal-lines">' +
          (term.items || []).map(renderTermDateItem).join("") +
          "</ul></div>"
        );
      }).join("")
    );
  }

  function renderCrashDatesModalBody(highlightIdx) {
    var hi = highlightIdx != null && !isNaN(Number(highlightIdx)) ? Number(highlightIdx) : -1;
    return (
      '<p class="re-cal-summary">Summer Jul 2026 (Tue–Fri): Climbing at Westway and Swimming at Acton — book after signing in to the family portal; pay in full to confirm. Half-term intensives run Mon–Thu.</p>' +
      '<p class="re-cal-summary"><a class="re-cal-offer-link" href="/parent/crash-summer" style="display:inline-flex;padding:8px 0">Book summer crash courses →</a></p>' +
      RE_CRASH_DATES_2627.map(function (block, i) {
        return (
          '<div class="re-cal-block' +
          (i === hi ? " re-cal-block--highlight" : "") +
          '" id="reCrashBlock' +
          i +
          '">' +
          "<h4>" +
          esc(block.title) +
          "</h4>" +
          '<div class="re-crash-row">' +
          block.days
            .map(function (d) {
              return (
                '<span class="re-crash-pill' +
                (d.off ? " re-crash-pill--off" : "") +
                '">' +
                "<span>" +
                esc(d.dow) +
                "</span>" +
                '<span class="re-crash-pill__num">' +
                esc(d.num) +
                "</span>" +
                (d.sub ? "<span>" + esc(d.sub) + "</span>" : "") +
                "</span>"
              );
            })
            .join("") +
          "</div></div>"
        );
      }).join("")
    );
  }

  function selectStaffCalendarTab(bodyEl, panelId) {
    if (!bodyEl || !panelId) return;
    var section = bodyEl.querySelector(".dc-cal");
    if (!section) return;
    var tab = section.querySelector('.dc-cal-tab[data-dc-cal-target="' + panelId + '"]');
    if (tab) tab.click();
  }

  function setInfoModalFullscreen(on) {
    var modal = $("reInfoModal");
    if (!modal) return;
    var dialog = modal.querySelector(".re-modal");
    if (on) {
      modal.classList.add("re-modal-backdrop--fullscreen");
      if (dialog) dialog.classList.add("re-modal--fullscreen");
      document.body.classList.add("re-modal-open");
    } else {
      modal.classList.remove("re-modal-backdrop--fullscreen");
      if (dialog) dialog.classList.remove("re-modal--fullscreen");
      document.body.classList.remove("re-modal-open");
    }
  }

  function openStaffCalendarModal(title, calendarTab) {
    var modal = ensureInfoModal();
    upgradeInfoModalChrome();
    var titleEl = $("reInfoModalTitle");
    var bodyEl = $("reInfoModalBody");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) {
      bodyEl.innerHTML =
        '<div class="portal-calendar-2026-27-preview" id="reStaffCalendarHost">' +
        '<p class="re-cal-loading" role="status">Loading calendar…</p>' +
        "</div>";
    }
    setInfoModalFullscreen(true);
    modal.hidden = false;
    syncPortalBackUi();
    var host = $("reStaffCalendarHost");
    if (host && typeof global.portalLoadCalendar202627Into === "function") {
      void global.portalLoadCalendar202627Into(host).then(function () {
        patchStaffCalendarPortalBack(host);
        selectStaffCalendarTab(bodyEl, calendarTab || "dcCalSessionsPanel");
      });
    } else if (host) {
      host.innerHTML =
        '<p class="re-muted" style="margin:12px;">Could not load calendar. Please refresh and try again.</p>';
    }
    var backLink = $("reInfoModalPortalBack");
    if (backLink) backLink.focus();
  }

  function openInfoModal(title, bodyHtml, afterOpen) {
    var modal = ensureInfoModal();
    var titleEl = $("reInfoModalTitle");
    var bodyEl = $("reInfoModalBody");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = bodyHtml;
    setInfoModalFullscreen(false);
    modal.hidden = false;
    wireModalBodyLinks();
    if (typeof afterOpen === "function") afterOpen(bodyEl);
    var backLink = $("reInfoModalPortalBack");
    if (backLink) backLink.focus();
  }

  function wireModalBodyLinks() {
    var bodyEl = $("reInfoModalBody");
    if (!bodyEl) return;
    bodyEl.querySelectorAll(".re-cal-offer-link[data-crash-idx]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-crash-idx"));
        openStaffCalendarModal("Half term offer — crash courses", "dcCalCrashPanel");
        requestAnimationFrame(function () {
          var block = $("reInfoModalBody") && $("reInfoModalBody").querySelector("#reCrashBlock" + idx);
          if (block) block.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      });
    });
  }

  function closeInfoModal() {
    var modal = $("reInfoModal");
    if (modal) modal.hidden = true;
    setInfoModalFullscreen(false);
  }

  function ensureInfoModal() {
    var existing = $("reInfoModal");
    if (existing) return existing;
    var backdrop = document.createElement("div");
    backdrop.id = "reInfoModal";
    backdrop.className = "re-modal-backdrop";
    backdrop.hidden = true;
    backdrop.setAttribute("role", "presentation");
    backdrop.innerHTML =
      '<div class="re-modal" role="dialog" aria-modal="true" aria-labelledby="reInfoModalTitle">' +
      '<div class="re-modal-head">' +
      '<a class="re-modal-back-portal" id="reInfoModalPortalBack" href="/parent/app">← Back to Home (Menu)</a>' +
      '<h3 id="reInfoModalTitle"></h3>' +
      "</div>" +
      '<div id="reInfoModalBody"></div>' +
      "</div>";
    document.body.appendChild(backdrop);
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      var modal = $("reInfoModal");
      if (modal && !modal.hidden) closeInfoModal();
    });
    return backdrop;
  }

  function bindInfoPanelHandlers() {
    var termBtn = $("reTermDatesBtn");
    if (termBtn) {
      termBtn.addEventListener("click", function () {
        openStaffCalendarModal("", "dcCalSessionsPanel");
      });
    }
    var previewHost = $("reAutumnPreviewHost");
    if (previewHost && !previewHost.__reBound) {
      previewHost.__reBound = true;
      var openCal = function () {
        openStaffCalendarModal("", "dcCalSessionsPanel");
      };
      previewHost.addEventListener("click", openCal);
      previewHost.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
          ev.preventDefault();
          openCal();
        }
      });
      if (typeof global.portalBuildCalendar202627AutumnPreview === "function") {
        var previewDayColors = reBuildCalendarServiceDayColors(
          (state.lookup && state.lookup.weekly_slots) || [],
        );
        global
          .portalBuildCalendar202627AutumnPreview({ dayColors: previewDayColors })
          .then(function (node) {
            previewHost.innerHTML = "";
            previewHost.appendChild(node);
          })
          .catch(function () {
            previewHost.hidden = true;
          });
      } else {
        previewHost.hidden = true;
      }
    }
    var dcBtn = $("reDayCentreDatesBtn");
    if (dcBtn) {
      dcBtn.addEventListener("click", function () {
        openStaffCalendarModal("Day Centre dates 2026/27", "dcCalDayCentrePanel");
      });
    }
    var crashBtn = $("reCrashDatesBtn");
    if (crashBtn) {
      crashBtn.addEventListener("click", function () {
        openStaffCalendarModal("Intensive course dates 2026/27", "dcCalCrashPanel");
      });
    }
  }

  function renderForm(data) {
    var host = $("reFormHost");
    if (!host) return;

    data.annual_weekly_total = resolveAnnualWeeklyTotal(data);
    state.lookup = data;
    state.enrolmentCadence = null;

    state.avatarUrl = resolveAvatarUrl(data);
    state.pendingPhotoFile = null;
    if (state.pendingPreviewUrl) {
      try {
        URL.revokeObjectURL(state.pendingPreviewUrl);
      } catch (_e) {}
      state.pendingPreviewUrl = "";
    }

    var existing = data.existing_submission
      ? '<div class="re-banner re-banner--info">You already submitted a re-enrolment for this participant. Submitting again will replace your latest choices in our records.</div>'
      : "";

    host.innerHTML =
      existing +
      '<div class="re-form-grid">' +
      '<section class="re-section re-head-section re-form-grid__head">' +
      reSectionTitle("h2", "registers", "Re-enrolment " + esc(ACADEMIC_YEAR.replace("-", "/"))) +
      "</section>" +
      '<div class="re-form-grid__current">' +
      renderCurrentArrangementsSection(data) +
      "</div>" +
      '<div class="re-form-grid__banner">' +
      renderReEnrolDeadlineBanner() +
      "</div>" +
      '<div class="re-form-grid__main">' +
      renderTermDatesLead() +
      renderPrimaryServiceSection(data) +
      '<section class="re-section re-section--billing">' +
      reSectionTitle("h3", "billing", "Funding &amp; billing 2026/27") +
      renderBilling2627Block(data) +
      "</section>" +
      "</div>" +
      '<section class="re-section re-declarations re-form-grid__submit">' +
      reSectionTitle("h3", "submit", "Confirm &amp; submit") +
      '<label class="re-check"><input id="reDeclAccurate" type="checkbox" /> I confirm the choices above are correct for our family.</label>' +
      '<button id="reSubmitBtn" class="re-btn re-btn--primary re-btn--submit" type="button">Submit re-enrolment</button>' +
      "</section>" +
      "</div>";

    host.querySelectorAll(".re-choice-fieldset input[type=radio]").forEach(function (radio) {
      radio.addEventListener("change", function () {
        var card = radio.closest(".re-slot-card");
        if (!card) return;
        var note = card.querySelector(".re-change-note");
        if (!note) return;
        note.hidden = radio.value !== "change";
      });
    });

    var submitBtn = $("reSubmitBtn");
    if (submitBtn) {
      if (!isReEnrolSubmissionOpen()) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Re-enrolment closed";
      }
      submitBtn.addEventListener("click", onSubmit);
    }

    bindFundingHandlers();
    bindInfoPanelHandlers();
  }

  function collectChoices() {
    var out = {
      weekly: {},
      day_centre: null,
      enrolment_cadence: normalizeEnrolmentCadence(state.enrolmentCadence) || null,
      enrolment_cadence_label: enrolmentCadenceLabel(state.enrolmentCadence) || null,
    };
    document.querySelectorAll(".re-slot-card").forEach(function (card) {
      var slotId = card.getAttribute("data-slot-id");
      var picked = card.querySelector('input[type=radio]:checked');
      var val = picked ? picked.value : "keep";
      var alt = "";
      var altInput = card.querySelector(".re-change-input");
      if (altInput && val === "change") alt = String(altInput.value || "").trim();
      out.weekly[slotId] = { choice: val, alternative: alt || null };
    });
    var dc = document.querySelector('input[name="dc_choice"]:checked');
    if (dc) out.day_centre = dc.value;
    return out;
  }

  async function onLookup(ev) {
    if (ev) ev.preventDefault();
    hideNotice($("reNotice"));
    var btn = $("reLookupBtn");
    if (btn) btn.disabled = true;

    var body = {};
    if (state.portalSession && state.contactId) {
      body.contact_id = state.contactId;
    } else {
      body = {
        parent_first_name: String($("reParentFirst").value || "").trim(),
        parent_last_name: String($("reParentLast").value || "").trim(),
        participant_name: String($("reParticipantName").value || "").trim(),
      };
      var ageRaw = String($("reParticipantAge").value || "").trim();
      if (ageRaw) body.participant_age = ageRaw;
    }

    var headers = {
      "Content-Type": "application/json",
      apikey: anonKey(),
      Authorization: "Bearer " + anonKey(),
    };
    if (state.portalSession && state.contactId) {
      headers["x-parent-portal-session"] = state.portalSession;
    }

    try {
      var res = await fetch(fn("portal-reenrolment-lookup"), {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        if (state.fromPortal && state.portalSession) {
          showNotice(
            $("reNotice"),
            "error",
            data.error === "not_found"
              ? "We could not load this participant from your family portal session. Go back and try again, or contact info@clubsensational.org."
              : "Could not load your programme — please try again.",
          );
          if (state.contactId && !queryParams().get("contact_id")) {
            var children = await fetchPortalChildren();
            if (children.length > 1) {
              showPortalParticipantPick(children);
              return;
            }
          }
          showPublicIdentifyForm();
        } else {
          showNotice(
            $("reNotice"),
            "error",
            data.error === "not_found"
              ? "We could not match those details. Check spelling and age, or contact info@clubsensational.org."
              : "Could not load your programme — please try again.",
          );
        }
        return;
      }
      state.lookup = data;
      renderForm(data);
      setStep("form");
      global.scrollTo(0, 0);
    } catch (_e) {
      showNotice($("reNotice"), "error", "Network error — please try again.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function onSubmit() {
    hideNotice($("reFormNotice"));
    if (!isReEnrolSubmissionOpen()) {
      showNotice(
        $("reFormNotice"),
        "error",
        "Re-enrolment closed on " + RE_ENROL_DEADLINE_LABEL + ". Email info@clubsensational.org for help.",
      );
      return;
    }
    if (!$("reDeclAccurate") || !$("reDeclAccurate").checked) {
      showNotice($("reFormNotice"), "error", "Please tick the confirmation box.");
      return;
    }
    if (state.billing2627 && state.billing2627.editing) {
      showNotice(
        $("reFormNotice"),
        "error",
        "Please save your funding and payment choices for 2026/27 before submitting.",
      );
      return;
    }
    if (!normalizeEnrolmentCadence(state.enrolmentCadence)) {
      showNotice(
        $("reFormNotice"),
        "error",
        "Please choose whole year (auto re-enrol) or term by term.",
      );
      var cadenceBlock = $("reCadenceBlock");
      if (cadenceBlock && cadenceBlock.scrollIntoView) {
        cadenceBlock.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    var data = state.lookup;
    if (!data) return;

    var btn = $("reSubmitBtn");
    if (btn) btn.disabled = true;

    var termTotalsPayload = {
      autumn: termProgrammeTotal(data, "autumn"),
      spring: termProgrammeTotal(data, "spring"),
      summer: termProgrammeTotal(data, "summer"),
      annual: resolveAnnualWeeklyTotal(data),
    };
    var payload = {
      source: state.fromPortal ? "parent_portal" : "link",
      parent_first_name: (data.parent && data.parent.first_name) || $("reParentFirst").value || "",
      parent_last_name: (data.parent && data.parent.last_name) || $("reParentLast").value || "",
      participant_name: (data.participant && data.participant.display_name) || "",
      participant_contact_id: (data.participant && data.participant.contact_id) || "",
      parent_person_id: (data.parent && data.parent.parent_person_id) || "",
      client_key: data.client_key || null,
      payment_status: data.payment_status || null,
      outstanding_amount: data.outstanding_amount,
      funding: collectBillingChoices(data),
      weekly_slots: data.weekly_slots,
      day_centre: data.day_centre,
      annual_weekly_total: data.annual_weekly_total,
      term_totals: termTotalsPayload,
      choices: collectChoices(),
      // One confirmation checkbox covers accuracy + terms (edge requires both).
      declarations: { accurate: true, terms: true },
      contact_email: (data.parent && data.parent.email) || null,
      contact_phone: null,
      submitted_from: String(global.location.href || "").slice(0, 500),
    };

    try {
      var res = await fetch(fn("portal-reenrolment-submit"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: "Bearer " + anonKey(),
        },
        body: JSON.stringify(payload),
      });
      var out = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !out.ok) {
        showNotice($("reFormNotice"), "error", "Submit failed — please try again or email info@clubsensational.org.");
        return;
      }
      if ($("reDoneMsg")) {
        $("reDoneMsg").textContent = out.message || "Thank you — your re-enrolment has been sent to the club office.";
      }
      var offerHost = $("reDoneOffer");
      if (offerHost) {
        offerHost.innerHTML = renderOtherServicesInfoHtml(data);
        bindDoneOfferHandlers();
      }
      setStep("done");
      global.scrollTo(0, 0);
    } catch (_e) {
      showNotice($("reFormNotice"), "error", "Network error — please try again.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function tryPortalAutoLoad() {
    var params = queryParams();
    state.contactId = params.get("contact_id") || params.get("contact") || "";
    state.fromPortal = params.get("from") === "portal" || !!state.contactId;
    state.portalSession = readPortalSession();

    if (!state.portalSession) {
      showPublicIdentifyForm();
      return;
    }

    state.fromPortal = true;
    syncPortalBackUi();

    if (state.contactId) {
      $("reIdentifyForm").hidden = true;
      if ($("rePortalPickList")) $("rePortalPickList").hidden = true;
      showNotice($("reNotice"), "info", "Loading your programme…");
      await onLookup(null);
      return;
    }

    var children = await fetchPortalChildren();
    if (!children.length) {
      showPublicIdentifyForm();
      return;
    }

    if (children.length === 1 && children[0].contact_id) {
      state.contactId = String(children[0].contact_id);
      $("reIdentifyForm").hidden = true;
      if ($("rePortalPickList")) $("rePortalPickList").hidden = true;
      showNotice($("reNotice"), "info", "Loading your programme…");
      await onLookup(null);
      return;
    }

    showPortalParticipantPick(children);
  }

  function bind() {
    var form = $("reIdentifyForm");
    if (form) form.addEventListener("submit", onLookup);
    var back = $("reBackLink");
    if (back) {
      back.addEventListener("click", function () {
        if (state.fromPortal) {
          global.location.href = "/parent/app";
        } else {
          setStep("identify");
          showPublicIdentifyForm();
          hideNotice($("reFormNotice"));
        }
      });
    }
  }

  function init() {
    bind();
    syncPortalBackUi();
    if (readPortalSession()) {
      if ($("reIdentifyForm")) $("reIdentifyForm").hidden = true;
      if ($("rePortalPickList")) $("rePortalPickList").hidden = true;
      showNotice($("reNotice"), "info", "Loading your programme…");
      setStep("identify");
    } else {
      setStep("identify");
      showPublicIdentifyForm();
    }
    void tryPortalAutoLoad();
  }

  global.PortalReenrolment202627 = { init: init, state: state };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
