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

  function queryParams() {
    try {
      return new URLSearchParams(global.location.search || "");
    } catch (_e) {
      return new URLSearchParams();
    }
  }

  function slotLabel(slot) {
    var dur = slot.durationMin ? slot.durationMin + "'" : "";
    var day = slot.day ? " (" + slot.day + ")" : "";
    return esc(dur + " " + (slot.serviceType || "") + day);
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
      "<h3>Participant photo</h3>" +
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

  function renderFundingBlock(data) {
    var f = data.funding || {};
    var rows = [];
    if (f.method) rows.push("<dt>Funding</dt><dd>" + esc(f.method) + "</dd>");
    if (f.vat && f.vat !== "—") rows.push("<dt>Invoice type</dt><dd>" + esc(f.vat) + "</dd>");
    if (f.invoice && f.invoice !== "—") rows.push("<dt>Last invoice ref</dt><dd>" + esc(f.invoice) + "</dd>");
    if (!rows.length) {
      return '<p class="re-muted">Funding details will be confirmed by the office if not on file.</p>';
    }
    return '<dl class="re-dl">' + rows.join("") + "</dl>";
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

  function renderDayCentre(dc) {
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
      '<section class="re-section re-section--dc">' +
      "<h3>Day Centre — SwimFarm</h3>" +
      '<p class="re-muted">' +
      esc(dc.note || "Fees agreed with your funder — not shown here.") +
      "</p>" +
      "<ul class=\"re-dc-list\">" +
      slots +
      "</ul>" +
      '<fieldset class="re-choice-fieldset">' +
      '<legend class="re-sr-only">Day Centre re-enrolment</legend>' +
      '<label class="re-radio"><input type="radio" name="dc_choice" value="continue" checked /> Continue Day Centre provision for 2026/27 (same pattern unless agreed otherwise)</label>' +
      '<label class="re-radio"><input type="radio" name="dc_choice" value="discuss" /> I need to discuss changes (days, hours or ratio)</label>' +
      '<label class="re-radio"><input type="radio" name="dc_choice" value="withdraw" /> Do not continue Day Centre</label>' +
      "</fieldset>" +
      "</section>"
    );
  }

  function renderInfoPanel(data) {
    var crash = data.crash_info || {};
    var prices = crash.indicativePrices || {};
    return (
      '<section class="re-section re-section--info">' +
      "<h3>Calendar &amp; crash courses</h3>" +
      '<p class="re-muted">Term dates and session counts for 2026/27:</p>' +
      '<p><a class="re-link" href="' +
      esc(data.calendar_url || "/portal/day-centre-calendar-2026-27-section.html") +
      '" target="_blank" rel="noopener">Open calendar 2026/27</a></p>' +
      "<p>" +
      esc(crash.note || "") +
      "</p>" +
      (prices["30min"] != null
        ? '<p class="re-muted">Indicative crash prices: 30\' ' +
          esc(money(prices["30min"])) +
          " · 60' " +
          esc(money(prices["60min"])) +
          " · " +
          esc(crash.venue || "Acton Centre") +
          "</p>"
        : "") +
      '<p class="re-muted"><em>Crash course booking is a separate form — coming soon.</em></p>' +
      "</section>"
    );
  }

  function renderForm(data) {
    var host = $("reFormHost");
    if (!host) return;

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
      '<section class="re-section re-head-section">' +
      "<h2>Re-enrolment " +
      esc(ACADEMIC_YEAR.replace("-", "/")) +
      "</h2>" +
      '<p class="re-participant-name">' +
      esc(participantDisplayName(data)) +
      "</p>" +
      '<p class="re-muted">Review your current programme and confirm for September 2026.</p>' +
      "</section>" +
      renderPhotoSection(data) +
      '<section class="re-section">' +
      "<h3>Funding &amp; billing</h3>" +
      renderFundingBlock(data) +
      "</section>" +
      '<section class="re-section">' +
      "<h3>Weekly &amp; weekend activities</h3>" +
      '<p class="re-muted">Prices per session · term session counts already exclude bank holidays.</p>' +
      renderWeeklySlots(data.weekly_slots || []) +
      (data.annual_weekly_total
        ? '<p class="re-year-total"><strong>Combined weekly/year total:</strong> ' +
          esc(money(data.annual_weekly_total)) +
          " <span class=\"re-muted\">(excl. Day Centre)</span></p>"
        : "") +
      "</section>" +
      renderDayCentre(data.day_centre) +
      renderInfoPanel(data) +
      '<section class="re-section">' +
      "<h3>Contact for this submission</h3>" +
      '<label class="re-label">Email (optional)</label>' +
      '<input id="reContactEmail" class="re-input" type="email" maxlength="200" autocomplete="email" />' +
      '<label class="re-label">Mobile (optional)</label>' +
      '<input id="reContactPhone" class="re-input" type="tel" maxlength="40" autocomplete="tel" />' +
      "</section>" +
      '<section class="re-section re-declarations">' +
      "<h3>Confirm &amp; submit</h3>" +
      '<label class="re-check"><input id="reDeclAccurate" type="checkbox" /> I confirm the choices above are correct for our family.</label>' +
      '<label class="re-check"><input id="reDeclTerms" type="checkbox" /> I understand that slot changes are subject to availability and outstanding balances remain payable.</label>' +
      '<button id="reSubmitBtn" class="re-btn re-btn--primary" type="button">Submit re-enrolment</button>' +
      "</section>";

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

    var preEmail = (data.parent && data.parent.email) || "";
    var emailEl = $("reContactEmail");
    if (emailEl && preEmail) emailEl.value = preEmail;
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
        showNotice(
          $("reNotice"),
          "error",
          data.error === "not_found"
            ? "We could not match those details. Check spelling and age, or contact info@clubsensational.org."
            : "Could not load your programme — please try again.",
        );
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
      funding: data.funding,
      weekly_slots: data.weekly_slots,
      day_centre: data.day_centre,
      annual_weekly_total: data.annual_weekly_total,
      choices: collectChoices(),
      declarations: { accurate: true, terms: true },
      contact_email: String($("reContactEmail") && $("reContactEmail").value || "").trim(),
      contact_phone: String($("reContactPhone") && $("reContactPhone").value || "").trim(),
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

    if (state.fromPortal && state.portalSession && state.contactId) {
      $("reStepIdentify").hidden = true;
      showNotice($("reNotice"), "info", "Loading your programme…");
      await onLookup(null);
    }
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
          hideNotice($("reFormNotice"));
        }
      });
    }
  }

  function init() {
    bind();
    setStep("identify");
    tryPortalAutoLoad();
  }

  global.PortalReenrolment202627 = { init: init, state: state };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(typeof window !== "undefined" ? window : globalThis);
