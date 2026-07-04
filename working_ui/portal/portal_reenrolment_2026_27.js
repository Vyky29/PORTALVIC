/**
 * Re-enrolment 2026/27 — parent link + family portal.
 * Lookup/submit via Supabase Edge Functions (no full client list in browser).
 */
(function (global) {
  "use strict";

  var ACADEMIC_YEAR = "2026-27";
  var SESSION_KEY = "clubsens_parent_portal_session_v1";

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

  function slotLabel(slot) {
    if (slot.displayLabel) return esc(slot.displayLabel);
    var dur = slot.durationMin ? slot.durationMin + "'" : "";
    var svc = String(slot.serviceType || "")
      .replace(/\bAQUATIC ACTIVITY\b/i, "Aquatic Activity")
      .replace(/\bCLIMBING ACTIVITY\b/i, "Climbing Activity")
      .replace(/\bSW\b/i, "Aquatic Activity")
      .replace(/^[''\s]+|[''\s]+$/g, "");
    var day = slot.day ? " - " + slot.day + (slot.day.endsWith("s") ? "" : "s") : "";
    var time = slot.timeSlot ? " - " + slot.timeSlot + (/\b(am|pm)\b/i.test(slot.timeSlot) ? "" : " pm") : "";
    var venue = slot.venue ? " (" + slot.venue + ")" : "";
    return esc((dur ? dur + " " : "") + svc + day + time + venue);
  }

  function participantDisplayName(data) {
    return (data && data.participant && data.participant.display_name) || "";
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

  function renderPhotoSection(data) {
    var name = participantDisplayName(data);
    var url = currentAvatarPreviewUrl();
    var initials = esc(participantInitials(name));
    var imgHtml = url
      ? '<img class="re-photo-img" src="' +
        esc(url) +
        '" alt="" width="96" height="96" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />' +
        '<span class="re-photo-init" hidden aria-hidden="true">' +
        initials +
        "</span>"
      : '<span class="re-photo-init" aria-hidden="true">' + initials + "</span>";

    return (
      '<section class="re-section re-photo-section">' +
      '<div class="re-photo-row">' +
      '<div class="re-photo-avatar" id="rePhotoAvatar">' +
      imgHtml +
      "</div>" +
      '<div class="re-photo-actions">' +
      reSectionTitle("h3", "photo", "Participant photo") +
      '<p class="re-muted">Used in the family portal and internal records. Previous photos are kept for admin use.</p>' +
      '<input type="file" id="rePhotoInput" accept="image/jpeg,image/png,image/webp,image/*" hidden />' +
      '<div class="re-photo-btns">' +
      '<button type="button" class="re-btn re-btn--secondary" id="rePhotoChooseBtn">Change photo</button>' +
      '<button type="button" class="re-btn re-btn--ghost" id="rePhotoRemoveBtn">Remove</button>' +
      '<button type="button" class="re-btn re-btn--primary re-photo-save" id="rePhotoSaveBtn">Save photo</button>' +
      "</div>" +
      '<p class="re-muted re-photo-status" id="rePhotoStatus" role="status"></p>' +
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
      refreshPhotoAvatarDom();
      setPhotoStatus("Photo saved.", "ok");
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
    if (choose && input) {
      choose.addEventListener("click", function () {
        input.click();
      });
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
          setPhotoStatus("Photo must be under 8 MB.", "error");
          input.value = "";
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
        setPhotoStatus("Preview ready — tap Save photo.", "info");
      });
    }
    if (save) save.addEventListener("click", saveParticipantPhoto);
    if (remove) remove.addEventListener("click", removeParticipantPhoto);
  }

  function renderOutstandingBanner(data) {
    var st = String(data.payment_status || "").toLowerCase();
    var out = Number(data.outstanding_amount);
    if (st.indexOf("outstanding") >= 0 || (Number.isFinite(out) && out > 0)) {
      return (
        '<div class="re-banner re-banner--warn" role="alert">' +
        "<strong>Outstanding balance on file</strong>" +
        (Number.isFinite(out) && out > 0 ? " — " + esc(money(out)) + " due." : ".") +
        " Re-enrolment can still be submitted; the office will contact you about settlement." +
        "</div>"
      );
    }
    return "";
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

  function isPrivateFunding(fundCode) {
    return fundCode === "privately_funded";
  }

  function isFundedFamily(fundCode) {
    return fundCode === "la_direct_payments" || fundCode === "la_nhs";
  }

  function adminFeeApplies(payCode) {
    return payCode === "gocardless" || payCode === "own_way_flexible";
  }

  function moneyWithAdminFee(base) {
    var n = Number(base);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1.025 * 100) / 100;
  }

  function renderFundingBlock(data) {
    var cur = fundingCurrent2526(data);
    var annualTotal = resolveAnnualWeeklyTotal(data);
    var fundDefault = mapFundingCode(cur.funding);
    var payDefault = mapPrivatePayMethodCode(cur.payment_method, cur.funding);
    var scheduleDefault = mapScheduleCode(cur.payment_method, cur.funding);
    var vatDefault = cur.invoice_type_code === "exempt" ? "exempt" : "vat_included";
    if (isFundedFamily(fundDefault)) vatDefault = "exempt";

    var currentRows = [];
    if (cur.payment_method) {
      currentRows.push(
        "<dt>Preferred Payment Method 2025/26</dt><dd>" + esc(cur.payment_method) + "</dd>",
      );
    }
    if (cur.funding) {
      currentRows.push("<dt>Funding</dt><dd>" + esc(cur.funding) + "</dd>");
    }
    if (cur.invoice_type) {
      currentRows.push("<dt>Invoice type</dt><dd>" + esc(cur.invoice_type) + "</dd>");
    }

    var currentHtml = currentRows.length
      ? '<div class="re-funding-current">' +
        "<h4>Your current arrangements (2025/26)</h4>" +
        '<dl class="re-dl">' +
        currentRows.join("") +
        "</dl></div>"
      : '<p class="re-muted">Current payment details were not found on file — choose your 2026/27 preferences below and the office will confirm.</p>';

    return (
      currentHtml +
      '<div class="re-funding-2627" data-annual-total="' +
      esc(String(annualTotal)) +
      '">' +
      "<h4>2026/27 billing preferences</h4>" +
      '<p class="re-funding-total"><strong>Estimated programme total 2026/27:</strong> ' +
      esc(money(annualTotal)) +
      "</p>" +
      '<fieldset class="re-choice-fieldset re-funding-field">' +
      '<legend class="re-label">Funding</legend>' +
      renderFundingRadios(fundDefault) +
      "</fieldset>" +
      '<div id="rePanelPrivate" class="re-funding-panel"' +
      (isPrivateFunding(fundDefault) ? "" : " hidden") +
      ">" +
      '<fieldset class="re-choice-fieldset re-funding-field">' +
      '<legend class="re-label">Preferred payment method</legend>' +
      renderPrivatePayMethodRadios(payDefault) +
      "</fieldset>" +
      '<div id="rePayScheduleWrap" class="re-pay-schedule-wrap">' +
      renderPayScheduleFieldset(payDefault, scheduleDefault) +
      "</div>" +
      '<div id="reAdminFeeNote" class="re-funding-fee"' +
      (adminFeeApplies(payDefault) ? "" : " hidden") +
      ">" +
      "<strong>2.5% admin fees on top of final price</strong>" +
      '<span id="reAdminFeeAmount"></span>' +
      "</div>" +
      '<p id="reOwnWayUpfrontNote" class="re-muted re-funding-note"' +
      (payDefault === "own_way_upfront" ? "" : " hidden") +
      ">You pay ahead of schedule in your own way — no change unless you tell the office.</p>" +
      '<fieldset class="re-choice-fieldset re-funding-field">' +
      '<legend class="re-label">Invoice type</legend>' +
      '<label class="re-radio"><input type="radio" name="re_vat_2627" value="vat_included"' +
      (vatDefault === "vat_included" ? " checked" : "") +
      ' /> 20% VAT included</label>' +
      '<label class="re-radio"><input type="radio" name="re_vat_2627" value="exempt"' +
      (vatDefault === "exempt" ? " checked" : "") +
      ' /> EXEMPT VAT</label>' +
      "</fieldset>" +
      "</div>" +
      '<div id="rePanelFunded" class="re-funding-panel re-funding-panel--funded"' +
      (isFundedFamily(fundDefault) ? "" : " hidden") +
      ">" +
      renderFundedInvoicePanel(data, fundDefault, cur, annualTotal) +
      "</div>" +
      '<p class="re-muted re-funding-foot">The office will confirm your invoice schedule before September 2026.</p>' +
      "</div>"
    );
  }

  var RE_PRIVATE_PAY_METHODS = [
    { code: "bank_transfer", label: "1 · Bank transfer" },
    { code: "gocardless", label: "4 · GoCardless" },
    { code: "own_way_upfront", label: "Own way (upfront — pay ahead)" },
    { code: "own_way_flexible", label: "Flexible payments (when you choose)" },
  ];

  var RE_FUNDING_OPTIONS = [
    { code: "privately_funded", label: "Privately funded" },
    { code: "la_direct_payments", label: "Local authority (Direct Payments)" },
    { code: "la_nhs", label: "Local authority / NHS funded" },
  ];

  var RE_SCHEDULE_OPTIONS = {
    bank_transfer: [
      { code: "yearly_1off", label: "1 off payment (whole year)" },
      { code: "term_3", label: "3 payments (one per term)" },
    ],
    gocardless: [
      { code: "monthly_10", label: "10 payments (one per month)" },
      { code: "term_3", label: "3 payments (one per term)" },
    ],
  };

  function mapPrivatePayMethodCode(raw, fundingRaw) {
    if (isFundedFamily(mapFundingCode(fundingRaw))) return "bank_transfer";
    var s = String(raw || "").toLowerCase();
    if (!s) return "bank_transfer";
    if (s.includes("gocardless")) return "gocardless";
    if (s.includes("flexible") || s.includes("when you") || s.includes("when they")) {
      return "own_way_flexible";
    }
    if (s.includes("own way") || s.includes("upfront") || s.includes("ahead")) {
      return "own_way_upfront";
    }
    if (s.includes("la invoice") || s.includes("bacs") || s.includes("nhs") || s.includes("direct payment")) {
      return "bank_transfer";
    }
    if (s.includes("bank")) return "bank_transfer";
    return "bank_transfer";
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
    return "term_3";
  }

  function mapFundedPayMethodCode(fundCode, cur) {
    var s = String((cur && cur.payment_method) || "").toLowerCase();
    if (fundCode === "la_direct_payments") return "direct_payment";
    if (s.includes("nhs") || s.includes("po")) return "nhs_invoice";
    return "la_invoice";
  }

  function mapFundingCode(raw) {
    var s = String(raw || "").toLowerCase();
    if (!s) return "privately_funded";
    if (s.includes("direct payment")) return "la_direct_payments";
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
    if (code === "direct_payment") return "Direct payment (CWD remittance)";
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
    var title =
      payCode === "bank_transfer"
        ? "Bank transfer — payment schedule"
        : "GoCardless — payment schedule";
    return (
      '<fieldset class="re-choice-fieldset re-funding-field re-pay-schedule">' +
      '<legend class="re-label">' +
      esc(title) +
      "</legend>" +
      opts
        .map(function (o) {
          var checked = o.code === validDefault ? " checked" : "";
          return (
            '<label class="re-radio"><input type="radio" name="re_pay_schedule_2627" value="' +
            esc(o.code) +
            '"' +
            checked +
            " /> " +
            esc(o.label) +
            "</label>"
          );
        })
        .join("") +
      "</fieldset>"
    );
  }

  function renderFundedInvoicePanel(data, fundCode, cur, annualTotal) {
    var payCode = mapFundedPayMethodCode(fundCode, cur);
    var funderLabel = fundingLabel(fundCode, cur.funding);
    return (
      '<div class="re-funded-invoice">' +
      "<h4>Annual invoice total 2026/27</h4>" +
      '<p class="re-funded-invoice__amount">' +
      esc(money(annualTotal)) +
      "</p>" +
      '<p class="re-muted">For your records — this is the full-year programme total we invoice to your funder. Day Centre is excluded if not on your programme.</p>' +
      "</div>" +
      '<dl class="re-dl re-funded-meta">' +
      "<dt>Funder</dt><dd>" +
      esc(funderLabel) +
      "</dd>" +
      "<dt>Invoice route</dt><dd>" +
      esc(fundedPayMethodLabel(payCode)) +
      "</dd>" +
      "<dt>Invoice type</dt><dd>EXEMPT VAT</dd>" +
      "<dt>Our billing</dt><dd>Admin monthly to your funder (you do not choose a payment schedule here)</dd>" +
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
    var fundEl = document.querySelector('input[name="re_fund_2627"]:checked');
    var fundCode = fundEl ? fundEl.value : "privately_funded";
    var privatePanel = $("rePanelPrivate");
    var fundedPanel = $("rePanelFunded");
    if (privatePanel) privatePanel.hidden = !isPrivateFunding(fundCode);
    if (fundedPanel) fundedPanel.hidden = !isFundedFamily(fundCode);
    syncPrivatePayPanels();
  }

  function syncPrivatePayPanels() {
    var payEl = document.querySelector('input[name="re_pay_2627"]:checked');
    var payCode = payEl ? payEl.value : "bank_transfer";
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
    var upfrontNote = $("reOwnWayUpfrontNote");
    var wrap = document.querySelector(".re-funding-2627");
    var annual = wrap ? Number(wrap.getAttribute("data-annual-total")) : 0;
    if (feeNote) feeNote.hidden = !adminFeeApplies(payCode);
    if (feeAmt && adminFeeApplies(payCode) && annual > 0) {
      feeAmt.textContent = " — indicative total with fee: " + money(moneyWithAdminFee(annual));
    } else if (feeAmt) feeAmt.textContent = "";
    if (upfrontNote) upfrontNote.hidden = payCode !== "own_way_upfront";
  }

  function bindFundingHandlers() {
    document.querySelectorAll('input[name="re_fund_2627"]').forEach(function (radio) {
      radio.addEventListener("change", syncFundingPanels);
    });
    document.querySelectorAll('input[name="re_pay_2627"]').forEach(function (radio) {
      radio.addEventListener("change", syncPrivatePayPanels);
    });
    syncFundingPanels();
  }

  function collectBillingChoices(data) {
    var cur = fundingCurrent2526(data);
    var fundEl = document.querySelector('input[name="re_fund_2627"]:checked');
    var fundCode = fundEl ? fundEl.value : mapFundingCode(cur.funding);
    var annualTotal = resolveAnnualWeeklyTotal(data);
    var vatEl = document.querySelector('input[name="re_vat_2627"]:checked');

    if (isFundedFamily(fundCode)) {
      var fundedPay = mapFundedPayMethodCode(fundCode, cur);
      return {
        current_2526: cur,
        choices_2627: {
          billing_mode: "funded",
          funding_code: fundCode,
          funding_label: fundingLabel(fundCode, cur.funding),
          payment_method_code: fundedPay,
          payment_method_label: fundedPayMethodLabel(fundedPay),
          payment_schedule_code: "admin_monthly",
          payment_schedule_label: "Admin monthly (funder invoiced — full year total on record)",
          invoice_type_code: "exempt",
          invoice_type_label: "EXEMPT VAT",
          admin_fee_applies: false,
          estimated_annual_total: annualTotal,
          annual_invoice_total: annualTotal,
        },
      };
    }

    var payEl = document.querySelector('input[name="re_pay_2627"]:checked');
    var schedEl = document.querySelector('input[name="re_pay_schedule_2627"]:checked');
    var payCode = payEl ? payEl.value : mapPrivatePayMethodCode(cur.payment_method, cur.funding);
    var scheduleCode =
      schedEl && (payCode === "bank_transfer" || payCode === "gocardless")
        ? schedEl.value
        : payCode === "gocardless"
          ? "monthly_10"
          : payCode === "bank_transfer"
            ? "term_3"
            : null;
    var vatCode = vatEl ? vatEl.value : cur.invoice_type_code || "vat_included";
    var fee = adminFeeApplies(payCode);
    return {
      current_2526: cur,
      choices_2627: {
        billing_mode: "private",
        funding_code: fundCode,
        funding_label: fundingLabel(fundCode, cur.funding),
        payment_method_code: payCode,
        payment_method_label: privatePayMethodLabel(payCode),
        payment_schedule_code: scheduleCode,
        payment_schedule_label: scheduleCode ? scheduleLabel(scheduleCode) : null,
        invoice_type_code: vatCode,
        invoice_type_label: vatCode === "exempt" ? "EXEMPT VAT" : "20% VAT included",
        admin_fee_applies: fee,
        estimated_annual_total: annualTotal,
        estimated_total_with_admin_fee: fee && annualTotal > 0 ? moneyWithAdminFee(annualTotal) : null,
        billing_schedule:
          scheduleCode === "yearly_1off" ? "yearly" : scheduleCode === "monthly_10" ? "monthly" : "term",
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
          var price = slot.pricePerSession != null ? money(slot.pricePerSession) + " / session" : "—";
          return (
            '<article class="re-slot-card" data-slot-id="' +
            id +
            '">' +
            '<div class="re-slot-head">' +
            "<h4>" +
            slotLabel(slot) +
            "</h4>" +
            '<p class="re-slot-price">' +
            esc(price) +
            "</p>" +
            "</div>" +
            '<p class="re-muted re-slot-sessions">' +
            "Autumn " +
            esc(String(slot.sessions && slot.sessions.autumn)) +
            " · Spring " +
            esc(String(slot.sessions && slot.sessions.spring)) +
            " · Summer " +
            esc(String(slot.sessions && slot.sessions.summer)) +
            " = " +
            esc(String(slot.sessions && slot.sessions.annual)) +
            " sessions/year" +
            "</p>" +
            '<p class="re-slot-total"><strong>Year total:</strong> ' +
            esc(money(slot.termTotals && slot.termTotals.annual)) +
            "</p>" +
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

  function renderDayCentre(dc) {
    var inner = renderDayCentreBlock(dc);
    if (!inner) return "";
    return (
      '<section class="re-section re-section--dc">' +
      reSectionTitle("h3", "daycentre", "Day Centre — SwimFarm") +
      inner +
      "</section>"
    );
  }

  function renderTermDatesLead() {
    return (
      '<section class="re-section re-section--dates-lead">' +
      reSectionTitle("h3", "calendar", "2026/27 dates") +
      '<p class="re-muted">Start here — view term dates, half terms and closures for the year ahead.</p>' +
      '<button type="button" class="re-btn re-btn--primary re-btn--dates-lead" id="reTermDatesBtn">View term dates 2026/27</button>' +
      "</section>"
    );
  }

  function renderExtendedOfferSection(data) {
    var hasDc = !!(data && data.day_centre && data.day_centre.slots && data.day_centre.slots.length);
    var dcBlock = hasDc
      ? '<div class="re-offer-block re-offer-block--dc">' +
        "<h4>Your Day Centre (SwimFarm)</h4>" +
        renderDayCentreBlock(data.day_centre) +
        "</div>"
      : '<div class="re-offer-block">' +
        "<h4>Day Centre (SwimFarm)</h4>" +
        '<p class="re-muted">Weekday provision (Mon–Fri), separate from After-School &amp; Weekends. Contact the office if you would like to add Day Centre.</p>' +
        "</div>";
    return (
      '<section class="re-section re-section--offer">' +
      reSectionTitle("h3", "daycentre", "Day Centre &amp; crash courses") +
      '<p class="re-muted">Many families combine <strong>After-School &amp; Weekends</strong> with weekday Day Centre and/or half-term crash courses. These are optional add-ons — see dates below.</p>' +
      dcBlock +
      '<div class="re-offer-block">' +
      "<h4>Crash courses</h4>" +
      '<p class="re-muted">Intensive swimming at Acton Centre, Monday–Thursday in the half terms. Booking is a separate form (coming soon).</p>' +
      '<div class="re-info-btns">' +
      '<button type="button" class="re-btn re-btn--secondary" id="reDayCentreDatesBtn">Day Centre dates 2026/27</button>' +
      '<button type="button" class="re-btn re-btn--secondary" id="reCrashDatesBtn">Crash course dates</button>' +
      "</div></div>" +
      "</section>"
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
        '<span class="re-cal-offer-link__hint">Crash courses · Mon–Thu · view dates</span>' +
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
      '<p class="re-cal-summary">Crash courses run Monday to Thursday during half terms at Acton Centre. Times TBC — booking is a separate form (coming soon).</p>' +
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

  function openInfoModal(title, bodyHtml, afterOpen) {
    var modal = ensureInfoModal();
    var titleEl = $("reInfoModalTitle");
    var bodyEl = $("reInfoModalBody");
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = bodyHtml;
    modal.hidden = false;
    wireModalBodyLinks();
    if (typeof afterOpen === "function") afterOpen(bodyEl);
    var btn = $("reInfoModalClose");
    if (btn) btn.focus();
  }

  function wireModalBodyLinks() {
    var bodyEl = $("reInfoModalBody");
    if (!bodyEl) return;
    bodyEl.querySelectorAll(".re-cal-offer-link[data-crash-idx]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var idx = Number(btn.getAttribute("data-crash-idx"));
        openInfoModal("Half term offer — crash courses", renderCrashDatesModalBody(idx), function (el) {
          if (!el || isNaN(idx)) return;
          var block = el.querySelector("#reCrashBlock" + idx);
          if (block) block.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      });
    });
  }

  function closeInfoModal() {
    var modal = $("reInfoModal");
    if (modal) modal.hidden = true;
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
      '<div class="re-modal re-modal--wide" role="dialog" aria-modal="true" aria-labelledby="reInfoModalTitle">' +
      '<h3 id="reInfoModalTitle"></h3>' +
      '<div id="reInfoModalBody"></div>' +
      '<div class="re-modal-actions"><button type="button" class="re-btn re-btn--secondary" id="reInfoModalClose">Close</button></div>' +
      "</div>";
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", function (ev) {
      if (ev.target === backdrop) closeInfoModal();
    });
    var closeBtn = $("reInfoModalClose");
    if (closeBtn) closeBtn.addEventListener("click", closeInfoModal);
    return backdrop;
  }

  function bindInfoPanelHandlers() {
    var termBtn = $("reTermDatesBtn");
    if (termBtn) {
      termBtn.addEventListener("click", function () {
        openInfoModal("Term dates 2026/27", renderTermDatesModalBody());
      });
    }
    var dcBtn = $("reDayCentreDatesBtn");
    if (dcBtn) {
      dcBtn.addEventListener("click", function () {
        openInfoModal("Day Centre dates 2026/27", renderDayCentreDatesModalBody());
      });
    }
    var crashBtn = $("reCrashDatesBtn");
    if (crashBtn) {
      crashBtn.addEventListener("click", function () {
        openInfoModal("Crash course dates 2026/27", renderCrashDatesModalBody());
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
      renderOutstandingBanner(data) +
      '<div class="re-form-grid">' +
      '<section class="re-section re-head-section re-form-grid__head">' +
      reSectionTitle("h2", "registers", "Re-enrolment " + esc(ACADEMIC_YEAR.replace("-", "/"))) +
      '<p class="re-participant-name">' +
      esc(participantDisplayName(data)) +
      "</p>" +
      '<p class="re-muted">Review your current programme and confirm for September 2026.</p>' +
      "</section>" +
      '<aside class="re-form-grid__side">' +
      renderTermDatesLead() +
      renderPhotoSection(data) +
      '<section class="re-section re-section--billing">' +
      reSectionTitle("h3", "billing", "Funding &amp; billing") +
      renderFundingBlock(data) +
      "</section>" +
      "</aside>" +
      '<div class="re-form-grid__main">' +
      '<section class="re-section re-section--services">' +
      reSectionTitle("h3", "services", "After-School &amp; Weekends") +
      '<p class="re-muted">Your weekly and weekend activities · prices per session · term counts exclude bank holidays.</p>' +
      renderWeeklySlots(data.weekly_slots || []) +
      (data.annual_weekly_total
        ? '<p class="re-year-total"><strong>Combined weekly/year total:</strong> ' +
          esc(money(data.annual_weekly_total)) +
          ' <span class="re-muted">(excl. Day Centre)</span></p>'
        : "") +
      "</section>" +
      renderExtendedOfferSection(data) +
      "</div>" +
      '<section class="re-section re-declarations re-form-grid__submit">' +
      reSectionTitle("h3", "submit", "Confirm &amp; submit") +
      '<label class="re-check"><input id="reDeclAccurate" type="checkbox" /> I confirm the choices above are correct for our family.</label>' +
      '<label class="re-check"><input id="reDeclTerms" type="checkbox" /> I understand that slot changes are subject to availability and outstanding balances remain payable.</label>' +
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
    if (submitBtn) submitBtn.addEventListener("click", onSubmit);

    bindPhotoHandlers();
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
    if (!$("reDeclAccurate") || !$("reDeclAccurate").checked || !$("reDeclTerms") || !$("reDeclTerms").checked) {
      showNotice($("reFormNotice"), "error", "Please tick both confirmation boxes.");
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
