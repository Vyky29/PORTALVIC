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

  /** Bank transfer · flexi term: 2 payments per term (before half term + half-term week). */
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
        state.fromPortal || state.portalSession ? "← Back to portal" : "← Back";
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
        '<a class="re-modal-back-portal" id="reInfoModalPortalBack" href="/parent/app">← Back to portal</a>',
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
    if (t.includes("MULTI")) return "Multi-Activity";
    if (t.includes("CLIMB") || t === "CL") return "Climbing Activity";
    if (t.includes("PHYSICAL") || t.includes("FITNESS")) return "Physical Activity";
    if (t.includes("BESPOKE")) return "Bespoke Programme";
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
    if (s.includes("gocardless") || s.includes("direct debit") || s.includes("direct payment")) {
      return "Direct Payment (GoCardless)";
    }
    if (s.includes("bank")) return "Bank Transfer";
    return String(raw).trim();
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
      var items = [];
      (slots || []).forEach(function (slot) {
        var parts = formatCurrentServiceParts(slot);
        if (parts) items.push(parts);
      });
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
    var slots = (data && data.weekly_slots) || [];
    if (term === "annual") return resolveAnnualWeeklyTotal(data);
    return slots.reduce(function (sum, s) {
      var t = s.termTotals && s.termTotals[term];
      return sum + (Number.isFinite(Number(t)) ? Number(t) : 0);
    }, 0);
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
        "</strong> — payments follow from September." +
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

  function paymentPreviewNote(payCode, schedCode) {
    if (payCode === "bank_transfer" && schedCode === "term_flexi") {
      return "Same programme total — two bank transfers per term: one before half term starts, one during half-term week before the second half. The office confirms your final invoice plan.";
    }
    if (payCode === "bank_transfer") {
      return "Same programme total — bank transfers due on the 1st of each month from September 2026. The office confirms your final invoice plan before term starts.";
    }
    return "Same programme total — compare due dates below. The office confirms your final invoice plan before September 2026.";
  }

  function renderPaymentSchedulePreviewHtml(data) {
    var payEl = document.querySelector('input[name="re_pay_2627"]:checked');
    var schedEl = document.querySelector('input[name="re_pay_schedule_2627"]:checked');
    var fundEl = document.querySelector('input[name="re_fund_2627"]:checked');
    var fundCode = fundEl ? fundEl.value : "privately_funded";
    if (!isParentPaysPanel(fundCode)) return "";
    var payCode = payEl ? payEl.value : "bank_transfer";
    var schedCode = schedEl ? schedEl.value : null;
    if (payCode !== "bank_transfer" && payCode !== "gocardless") return "";
    if (!schedCode) return "";
    var annual = resolveAnnualWeeklyTotal(data);
    var fee = adminFeeApplies(payCode);
    function amt(base) {
      var n = Number(base);
      if (!Number.isFinite(n) || n <= 0) return "—";
      return money(fee ? moneyWithAdminFee(n) : n);
    }
    var rows = [];
    if (schedCode === "yearly_1off") {
      rows.push({
        label: "Full year (1 payment)",
        due: dueOnFirst("September 2026"),
        amount: amt(annual),
      });
    } else if (schedCode === "term_3") {
      rows.push({
        label: "Autumn term",
        due: dueOnFirst("September 2026"),
        amount: amt(termProgrammeTotal(data, "autumn")),
      });
      rows.push({
        label: "Spring term",
        due: dueOnFirst("December 2026"),
        amount: amt(termProgrammeTotal(data, "spring")),
      });
      rows.push({
        label: "Summer term",
        due: dueOnFirst("March 2027"),
        amount: amt(termProgrammeTotal(data, "summer")),
      });
    } else if (schedCode === "term_flexi") {
      RE_PAY_FLEXI_TERM.forEach(function (t) {
        var termTotal = termProgrammeTotal(data, t.term);
        var halfAmt = termTotal / 2;
        t.halves.forEach(function (h) {
          rows.push({
            label: t.termLabel + " · " + h.halfLabel,
            due: h.due,
            amount: amt(halfAmt),
          });
        });
      });
    } else if (schedCode === "monthly_10") {
      var monthly = annual / 10;
      var months = [
        "September 2026",
        "October 2026",
        "November 2026",
        "December 2026",
        "January 2027",
        "February 2027",
        "March 2027",
        "April 2027",
        "May 2027",
        "June 2027",
      ];
      months.forEach(function (label, i) {
        rows.push({
          label: "Payment " + (i + 1) + " · " + label,
          due: dueOnFirst(label),
          amount: amt(monthly),
        });
      });
    }
    if (!rows.length) return "";
    return (
      '<div class="re-pay-preview">' +
      '<h4 class="re-pay-preview__title">Indicative payment schedule</h4>' +
      '<p class="re-muted re-pay-preview__note">' +
      esc(paymentPreviewNote(payCode, schedCode)) +
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
    var ageLine = participantAgeLabel(data);
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
      (ageLine ? '<p class="re-participant-age">' + esc(ageLine) + "</p>" : "") +
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

  function resolveAnnualWeeklyTotal(data) {
    var fromSlots = sumAnnualWeeklyTotal(data && data.weekly_slots);
    if (fromSlots > 0) return fromSlots;
    var api = data && data.annual_weekly_total;
    if (api != null && Number(api) > 0) return Number(api);
    return fromSlots;
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

  function adminFeeApplies(payCode) {
    return payCode === "gocardless" || payCode === "own_way_flexible";
  }

  function moneyWithAdminFee(base) {
    var n = Number(base);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1.025 * 100) / 100;
  }

  function initBilling2627State(data) {
    var cur = fundingCurrent2526(data);
    state.billing2627 = {
      fundCode: normalizeFundingChoice(mapFundingCode(cur.funding)),
      payCode: normalizePayMethodChoice(mapPrivatePayMethodCode(cur.payment_method, cur.funding)),
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

  function renderBilling2526Reference(cur) {
    var fundText = billing2526FundingLabel(cur);
    var payText = formatCurrentPaymentMethodLabel(cur.payment_method) || "—";
    return (
      '<div class="re-funding-current">' +
      "<h4>Funding &amp; payment on file (2025/26)</h4>" +
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
      '<p class="re-billing-ref-note re-billing-ref-note--alert">This continues for 2026/27 unless you edit below.</p>' +
      '<button type="button" class="re-btn re-btn--billing-edit-inline" id="reBillingEditBtn">Edit for 2026/27</button>' +
      "</div>"
    );
  }

  function renderBilling2627SummaryIfChanged(data) {
    if (!billing2627ChangedFrom2526(data)) return "";
    var b = state.billing2627 || {};
    return (
      '<div class="re-billing-2627-saved">' +
      '<p class="re-billing-ref-label">Your choice for 2026/27</p>' +
      '<p class="re-billing-2627-saved__value">' +
      esc(fundingLabel(b.fundCode)) +
      " · " +
      esc(privatePayMethodLabel(b.payCode)) +
      "</p></div>"
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
      renderBilling2526Reference(fundingCurrent2526(data)) +
      renderBilling2627SummaryIfChanged(data) +
      "</div>" +
      '<div id="reBillingArrangementEdit"' +
      (editing ? "" : " hidden") +
      ">" +
      '<p class="re-muted re-billing-edit-intro">Change funding or payment method for 2026/27, then save before choosing how you would like to pay.</p>' +
      '<fieldset class="re-choice-fieldset re-funding-field">' +
      '<legend class="re-label">Funding 2026/27</legend>' +
      renderFundingRadios(b.fundCode) +
      "</fieldset>" +
      '<fieldset class="re-choice-fieldset re-funding-field">' +
      '<legend class="re-label">Payment method 2026/27</legend>' +
      renderPrivatePayMethodRadios(b.payCode) +
      "</fieldset>" +
      '<div class="re-billing-edit-actions">' +
      '<button type="button" class="re-btn re-btn--primary" id="reBillingSaveBtn">Save for 2026/27</button>' +
      '<button type="button" class="re-btn re-btn--ghost" id="reBillingCancelBtn">Cancel</button>' +
      "</div></div></div>"
    );
  }

  function refreshBillingPaySection(data) {
    var b = state.billing2627 || {};
    if (b.editing) return;
    var cur = fundingCurrent2526(data);
    var payCode = normalizePayMethodChoice(b.payCode);
    var scheduleDefault = defaultScheduleForPay(payCode);
    var schedWrap = $("rePayScheduleWrap");
    if (schedWrap) schedWrap.innerHTML = renderPayScheduleFieldset(payCode, scheduleDefault);
    syncPrivatePayPanels();
    syncPaymentSchedulePreview();
  }

  function refreshBillingArrangementUI() {
    var wrap = $("reBillingArrangementWrap");
    if (!wrap || !state.lookup) return;
    var tmp = document.createElement("div");
    tmp.innerHTML = renderBillingArrangementSection(state.lookup);
    var next = tmp.firstElementChild;
    if (next) wrap.replaceWith(next);
    var paySec = $("reBillingPaySection");
    if (paySec) paySec.hidden = !!(state.billing2627 && state.billing2627.editing);
    if (!state.billing2627 || !state.billing2627.editing) refreshBillingPaySection(state.lookup);
  }

  function renderBilling2627Block(data) {
    initBilling2627State(data);
    var annualTotal = resolveAnnualWeeklyTotal(data);
    var b = state.billing2627;
    var payCode = normalizePayMethodChoice(b.payCode);
    var scheduleDefault = defaultScheduleForPay(payCode);

    return (
      '<div class="re-funding-2627" data-annual-total="' +
      esc(String(annualTotal)) +
      '">' +
      '<p class="re-funding-total"><strong>Estimated programme total 2026/27:</strong> ' +
      esc(money(annualTotal)) +
      "</p>" +
      renderBillingArrangementSection(data) +
      '<div id="reBillingPaySection"' +
      (b.editing ? " hidden" : "") +
      ">" +
      '<p class="re-muted re-billing-plan-intro">The total above covers your confirmed sessions for the year. Choose how you would like invoices timed — the programme total stays the same.</p>' +
      '<div id="rePanelPrivate" class="re-funding-panel">' +
      '<div id="rePayScheduleWrap" class="re-pay-schedule-wrap">' +
      renderPayScheduleFieldset(payCode, scheduleDefault) +
      "</div>" +
      '<div id="rePaySchedulePreview" class="re-pay-preview-host" hidden></div>' +
      '<div id="reAdminFeeNote" class="re-funding-fee"' +
      (adminFeeApplies(payCode) ? "" : " hidden") +
      ">" +
      "<strong>2.5% admin fees on top of final price</strong>" +
      '<span id="reAdminFeeAmount"></span>' +
      "</div>" +
      '<div id="reDirectPayFailNote" class="re-funding-fee re-funding-fee--fail"' +
      (payCode === "gocardless" ? "" : " hidden") +
      ">" +
      "<strong>If a direct debit fails</strong>" +
      "If a payment fails (for example insufficient funds or a cancelled mandate), you must pay within " +
      "<strong>7 days</strong> by bank transfer, including any GoCardless failure charge. " +
      "After <strong>two failed attempts in the same term</strong>, direct payment is withdrawn for the rest of the academic year — remaining instalments must be paid by bank transfer." +
      "</div></div></div>" +
      '<p class="re-muted re-funding-foot">Re-enrolment closes ' +
      esc(RE_ENROL_DEADLINE_LABEL) +
      ". First payments from September — see schedule above.</p>" +
      "</div>"
    );
  }

  function normalizeFundingChoice(code) {
    if (code === "la_nhs") return "la_direct_payments";
    if (code === "la_direct_payments" || code === "privately_funded") return code;
    return "privately_funded";
  }

  function normalizePayMethodChoice(code) {
    return code === "gocardless" ? "gocardless" : "bank_transfer";
  }

  function vatLabelForFunding(fundCode) {
    return isDirectPayments(fundCode) ? "EXEMPT VAT" : "20% VAT included";
  }

  var RE_PRIVATE_PAY_METHODS = [
    { code: "bank_transfer", label: "Bank Transfer" },
    { code: "gocardless", label: "Direct Payment (GoCardless)" },
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
    ],
    gocardless: [
      { code: "monthly_10", label: "All year — 10 monthly payments" },
      { code: "term_3", label: "Flexible — pay each term" },
    ],
  };

  function scheduleOptionHint(code, payCode) {
    if (code === "yearly_1off") {
      return "Confirm the full academic year in one step. One bank transfer on 1 September 2026 — same programme total.";
    }
    if (code === "monthly_10") {
      return "Year agreement with 10 payments on the 1st of each month, September–June, by direct payment — same programme total.";
    }
    if (code === "term_flexi") {
      return "Six bank transfers over the year — two per term: before half term starts, and during half-term week before the second half. Same programme total.";
    }
    if (code === "term_3" && payCode === "gocardless") {
      return "Three term payments on 1 September, 1 December and 1 March by direct payment — same programme total over the year.";
    }
    if (code === "term_3") {
      return "Three bank transfers on 1 September, 1 December and 1 March — one invoice per term, same programme total over the year.";
    }
    return "";
  }

  function mapPrivatePayMethodCode(raw, fundingRaw) {
    var s = String(raw || "").toLowerCase();
    if (!s) return "bank_transfer";
    if (
      s.includes("gocardless") ||
      s.includes("direct debit") ||
      s.includes("direct payment") ||
      s.includes("monthly") ||
      s.includes("installment")
    ) {
      return "gocardless";
    }
    return "bank_transfer";
  }

  function defaultScheduleForPay(payCode) {
    if (payCode === "gocardless") return "term_3";
    if (payCode === "bank_transfer") return "term_flexi";
    return "term_3";
  }

  function isAllYearScheduleCode(code) {
    return code === "monthly_10" || code === "yearly_1off";
  }

  function mapScheduleCode(rawPay, fundingRaw) {
    var pay = mapPrivatePayMethodCode(rawPay, fundingRaw);
    var s = String(rawPay || "").toLowerCase();
    if (pay === "gocardless") {
      if (s.includes("month") || s.includes("10")) return "monthly_10";
      return "term_3";
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
    var all = (RE_SCHEDULE_OPTIONS.bank_transfer || []).concat(RE_SCHEDULE_OPTIONS.gocardless || []);
    for (var i = 0; i < all.length; i++) {
      if (all[i].code === code) return all[i].label;
    }
    return code;
  }

  function renderPrivatePayMethodRadios(defaultCode) {
    return RE_PRIVATE_PAY_METHODS.map(function (o) {
      var checked = o.code === defaultCode ? " checked" : "";
      return (
        '<label class="re-radio"><input type="radio" name="re_pay_2627" value="' +
        esc(o.code) +
        '"' +
        checked +
        " /> " +
        esc(o.label) +
        "</label>"
      );
    }).join("");
  }

  function renderPayScheduleFieldset(payCode, scheduleDefault) {
    var opts = RE_SCHEDULE_OPTIONS[payCode];
    if (!opts || !opts.length) return "";
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
          var hint = scheduleOptionHint(o.code, payCode);
          var spotlight = isAllYearScheduleCode(o.code) ? " re-radio--schedule-spotlight" : "";
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
    return (
      '<div class="re-funded-invoice">' +
      "<h4>Annual invoice total 2026/27</h4>" +
      '<p class="re-funded-invoice__amount">' +
      esc(money(annualTotal)) +
      "</p>" +
      '<p class="re-muted">For your records — this is the full-year total we invoice to your LA or NHS funder. The club bills your funder monthly on our admin schedule; you do not pay us directly.</p>' +
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
    var schedWrap = $("rePayScheduleWrap");
    if (schedWrap) {
      var prev = document.querySelector('input[name="re_pay_schedule_2627"]:checked');
      var prevVal = prev ? prev.value : null;
      if (payCode === "bank_transfer" || payCode === "gocardless") {
        var fallbackSched = payCode === "gocardless" ? "monthly_10" : "term_3";
        schedWrap.innerHTML = renderPayScheduleFieldset(payCode, prevVal || fallbackSched);
        schedWrap.hidden = false;
      } else {
        schedWrap.innerHTML = "";
        schedWrap.hidden = true;
      }
    }
    var feeNote = $("reAdminFeeNote");
    var feeAmt = $("reAdminFeeAmount");
    var wrap = document.querySelector(".re-funding-2627");
    var annual = wrap ? Number(wrap.getAttribute("data-annual-total")) : 0;
    if (feeNote) feeNote.hidden = !adminFeeApplies(payCode);
    if (feeAmt && adminFeeApplies(payCode) && annual > 0) {
      feeAmt.textContent = " — indicative total with fee: " + money(moneyWithAdminFee(annual));
    } else if (feeAmt) feeAmt.textContent = "";
    var failNote = $("reDirectPayFailNote");
    if (failNote) failNote.hidden = payCode !== "gocardless";
    syncPaymentSchedulePreview();
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
      if (t && t.name === "re_pay_schedule_2627") syncPaymentSchedulePreview();
    });
    syncFundingPanels();
    syncPaymentSchedulePreview();
  }

  function collectBillingChoices(data) {
    var cur = fundingCurrent2526(data);
    var b = state.billing2627 || {};
    var fundCode = normalizeFundingChoice(b.fundCode || mapFundingCode(cur.funding));
    var annualTotal = resolveAnnualWeeklyTotal(data);

    var payCode = normalizePayMethodChoice(
      b.payCode || mapPrivatePayMethodCode(cur.payment_method, cur.funding),
    );
    var schedEl = document.querySelector('input[name="re_pay_schedule_2627"]:checked');
    var scheduleCode =
      schedEl && (payCode === "bank_transfer" || payCode === "gocardless")
        ? schedEl.value
        : payCode === "gocardless"
          ? "monthly_10"
          : payCode === "bank_transfer"
            ? "term_3"
            : null;
    var vatCode = isDirectPayments(fundCode) ? "exempt" : "vat_included";
    var fee = adminFeeApplies(payCode);
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
        estimated_annual_total: annualTotal,
        estimated_total_with_admin_fee: fee && annualTotal > 0 ? moneyWithAdminFee(annualTotal) : null,
        billing_schedule:
          scheduleCode === "yearly_1off"
            ? "yearly"
            : scheduleCode === "monthly_10"
              ? "monthly"
              : scheduleCode === "term_flexi"
                ? "term_flexi"
                : "term",
      },
    };
  }

  function renderWeeklySlots(slots) {
    if (!slots || !slots.length) {
      return '<p class="re-muted">No weekly or weekend activities on file — contact the office if this is wrong.</p>';
    }
    return (
      '<div class="re-slot-list">' +
      slots
        .map(function (slot, idx) {
          var id = esc(slot.id || "slot-" + idx);
          var parts = formatWeeklySlotCardParts(slot) || { service: slotLabel(slot), detail: "" };
          var price = slot.pricePerSession != null ? money(slot.pricePerSession) + " / session" : "—";
          var autumn = slot.sessions && slot.sessions.autumn;
          var spring = slot.sessions && slot.sessions.spring;
          var summer = slot.sessions && slot.sessions.summer;
          var annualSessions = slot.sessions && slot.sessions.annual;
          return (
            '<article class="re-slot-card" data-slot-id="' +
            id +
            '">' +
            '<div class="re-slot-intro">' +
            '<p class="re-slot-service-name">' +
            esc(parts.service) +
            "</p>" +
            (parts.detail ? '<p class="re-slot-service-detail">' + esc(parts.detail) + "</p>" : "") +
            "</div>" +
            '<div class="re-slot-price-wrap">' +
            '<span class="re-slot-price">' +
            esc(price) +
            "</span></div>" +
            '<div class="re-slot-meta">' +
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
            '<p class="re-slot-total"><strong>Year total:</strong> ' +
            esc(money(slot.termTotals && slot.termTotals.annual)) +
            "</p></div>" +
            '<fieldset class="re-choice-fieldset">' +
            '<legend class="re-sr-only">Choice for ' +
            esc(slot.serviceType || "slot") +
            "</legend>" +
            '<label class="re-radio"><input type="radio" name="choice_' +
            id +
            '" value="keep" checked /> Keep this slot for 2026/27</label>' +
            '<label class="re-radio"><input type="radio" name="choice_' +
            id +
            '" value="change" /> Request a different day/time (limited availability)</label>' +
            '<label class="re-radio"><input type="radio" name="choice_' +
            id +
            '" value="withdraw" /> Do not continue this activity</label>' +
            '<div class="re-change-note" hidden>' +
            '<label class="re-label">Preferred alternative (if any)</label>' +
            '<input type="text" class="re-input re-change-input" data-slot-id="' +
            id +
            '" maxlength="200" placeholder="e.g. Thursday 4pm — subject to availability" />' +
            '<p class="re-muted re-warn-inline">If you release a slot, it may be taken by another family before a move is confirmed.</p>' +
            "</div>" +
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
    return (
      '<section class="re-section re-section--services">' +
      reSectionTitle("h3", "services", primaryServiceSectionTitle(data)) +
      '<p class="re-muted">Your weekly and weekend activities · prices per session · term counts exclude bank holidays.</p>' +
      weeklyHtml +
      "</section>"
    );
  }

  function renderTermDatesLead() {
    return (
      '<section class="re-section re-section--dates-lead">' +
      reSectionTitle("h3", "calendar", "ClubSENsational Calendar 2026/27") +
      '<p class="re-muted">Start here — view term dates, half terms and closures for the year ahead.</p>' +
      '<button type="button" class="re-btn re-btn--primary re-btn--dates-lead" id="reTermDatesBtn">Open ClubSENsational Calendar 2026/27</button>' +
      "</section>"
    );
  }

  function renderExtendedOfferSection(data) {
    var hasDc = hasDayCentreEnrolled(data);
    var hasWeekly = hasWeeklySlots(data);
    var dcBlock;
    if (hasDc && hasWeekly) {
      dcBlock =
        '<div class="re-offer-block re-offer-block--dc">' +
        "<h4>Your Day Centre (SwimFarm)</h4>" +
        renderDayCentreBlock(data.day_centre) +
        '<button type="button" class="re-btn re-btn--secondary" id="reDayCentreDatesBtn">Day Centre dates 2026/27</button>' +
        "</div>";
    } else if (hasDc && !hasWeekly) {
      dcBlock =
        '<div class="re-offer-block">' +
        "<h4>Day Centre (SwimFarm)</h4>" +
        '<p class="re-muted">Weekday provision (Mon–Fri) at SwimFarm. Your 2026/27 choices are above.</p>' +
        '<button type="button" class="re-btn re-btn--secondary" id="reDayCentreDatesBtn">Day Centre dates 2026/27</button>' +
        "</div>";
    } else {
      dcBlock =
        '<div class="re-offer-block">' +
        "<h4>Day Centre (SwimFarm)</h4>" +
        '<p class="re-muted">Weekday provision (Mon–Fri), separate from After-School &amp; Weekends. Contact the office if you would like to add Day Centre.</p>' +
        '<button type="button" class="re-btn re-btn--secondary" id="reDayCentreDatesBtn">Day Centre dates 2026/27</button>' +
        "</div>";
    }
    return (
      '<section class="re-section re-section--offer">' +
      dcBlock +
      '<div class="re-offer-block">' +
      "<h4>Intensive courses and camps</h4>" +
      '<p class="re-muted">Intensive swimming at Acton Centre, Monday–Thursday in the half terms. Booking is a separate form (coming soon).</p>' +
      '<button type="button" class="re-btn re-btn--secondary" id="reCrashDatesBtn">Intensive course dates</button>' +
      "</div></section>"
    );
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
          crashIndex: 0,
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
          crashIndex: 1,
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
      sessions: "13 weekday · 11 weekend sessions",
      items: [
        { type: "start", date: "Monday 12 April 2027" },
        {
          type: "half_term",
          date: "Monday 31 May – Friday 4 June 2027",
          crashIndex: 2,
        },
        { type: "last_day", date: "Friday 16 July 2027" },
      ],
    },
  ];

  var RE_CRASH_DATES_2627 = [
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
      '<p class="re-cal-summary">Intensive courses and camps run Monday to Thursday during half terms at Acton Centre. Times TBC — booking is a separate form (coming soon).</p>' +
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
      '<a class="re-modal-back-portal" id="reInfoModalPortalBack" href="/parent/app">← Back to portal</a>' +
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
        openStaffCalendarModal("Term dates 2026/27", "dcCalSessionsPanel");
      });
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
      renderExtendedOfferSection(data) +
      "</div>" +
      '<section class="re-section re-declarations re-form-grid__submit">' +
      reSectionTitle("h3", "submit", "Confirm &amp; submit") +
      '<label class="re-check"><input id="reDeclAccurate" type="checkbox" /> I confirm the choices above are correct for our family.</label>' +
      '<label class="re-check"><input id="reDeclTerms" type="checkbox" /> I understand that slot changes are subject to availability and club terms apply.</label>' +
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
    var out = { weekly: {}, day_centre: null };
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
    if (!$("reDeclAccurate") || !$("reDeclAccurate").checked || !$("reDeclTerms") || !$("reDeclTerms").checked) {
      showNotice($("reFormNotice"), "error", "Please tick both confirmation boxes.");
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

    var data = state.lookup;
    if (!data) return;

    var btn = $("reSubmitBtn");
    if (btn) btn.disabled = true;

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
      choices: collectChoices(),
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
