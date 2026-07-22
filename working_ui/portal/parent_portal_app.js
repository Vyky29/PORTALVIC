/**
 * Parent portal — sign in with parent name + participant DOB (DDMMYYYY).
 */
(function (global) {
  "use strict";

  var SESSION_KEY = "clubsens_parent_portal_session_v1";

  var state = {
    step: "identify",
    session: { token: "", expiresAt: 0 },
    home: null,
    messaging: { unreadTotal: 0, unreadByContact: {} },
    participant: { contactId: "", data: null, loaded: {} },
    childPhotoPending: {},
  };

  function mergeParticipantBody(base, patch) {
    if (!patch) return base;
    if (!base) return patch;
    if (Array.isArray(patch.sessions)) base.sessions = patch.sessions;
    if (Array.isArray(patch.achievements)) base.achievements = patch.achievements;
    if (Array.isArray(patch.team)) base.team = patch.team;
    if (Array.isArray(patch.swim_term_reviews)) {
      base.swim_term_reviews = patch.swim_term_reviews;
      if (patch.swim_term_reviews.length) base.swim_term_review_available = true;
    }
    if (patch.swim_term_review_available != null) {
      base.swim_term_review_available = !!patch.swim_term_review_available;
    }
    if (patch.reenrolment) base.reenrolment = patch.reenrolment;
    if (patch.pending_review_count != null) base.pending_review_count = patch.pending_review_count;
    if (patch.attendance_summary) base.attendance_summary = patch.attendance_summary;
    if (Array.isArray(patch.weekly_notes)) base.weekly_notes = patch.weekly_notes;
    if (patch.weekly_note_latest !== undefined) base.weekly_note_latest = patch.weekly_note_latest;
    if (Array.isArray(patch.club_announcements)) base.club_announcements = patch.club_announcements;
    if (patch.general && base.general) {
      Object.assign(base.general, patch.general);
    }
    if (patch.participant && base.participant) {
      Object.assign(base.participant, patch.participant);
    }
    return base;
  }

  async function fetchParticipantSections(contactId, sections) {
    var res = await fetch(fn("parent-portal-participant-detail"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        Authorization: "Bearer " + anonKey(),
        "x-parent-portal-session": state.session.token,
      },
      body: JSON.stringify({ contact_id: contactId, sections: sections }),
    });
    var body = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !body.ok) {
      var err = new Error("participant_load_failed");
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function applyMessagingCounts(payload) {
    var total = payload && payload.unread_messages_count != null
      ? Number(payload.unread_messages_count) || 0
      : 0;
    var byContact = (payload && payload.unread_by_contact_id) || {};
    state.messaging.unreadTotal = total;
    state.messaging.unreadByContact = Object.assign({}, byContact);
  }

  function clearMessagingCounts() {
    state.messaging.unreadTotal = 0;
    state.messaging.unreadByContact = {};
  }

  function unreadCountForContact(contactId) {
    var id = String(contactId || "");
    if (!id) return 0;
    return Number(state.messaging.unreadByContact[id]) || 0;
  }

  function unreadBadgeHtml(count, labelPrefix) {
    var n = Number(count) || 0;
    if (n <= 0) return "";
    var text = n > 99 ? "99+" : String(n);
    var aria = (labelPrefix || "Unread messages") + ": " + text;
    return (
      '<span class="pp-unread-badge" aria-label="' +
      esc(aria) +
      '">' +
      esc(text) +
      "</span>"
    );
  }

  function participantRenderOpts(contactId) {
    return {
      contactId: contactId,
      childHasPhoto: function (cid) {
        var homeChild = childFromHome(cid);
        if (homeChild && childHasSavedPhoto(homeChild)) return true;
        var p =
          state.participant &&
          state.participant.data &&
          state.participant.data.participant;
        if (p && String(p.contact_id) === String(cid)) {
          if (p.has_avatar === true || p.avatar_url) return true;
        }
        return false;
      },
      activityPing: function (surface, detail) {
        void pingActivity(surface, contactId, detail);
      },
      siblings: function () {
        return ((state.home && state.home.children) || []).slice();
      },
      switchChild: function (nextId) {
        var id = String(nextId || "").trim();
        if (!id || id === String(contactId)) return;
        void loadParticipantDetail(id);
      },
      openContactDetails: function () {
        void loadHome({ skipAutoHub: true }).then(function () {
          var contactCard = $("ppContactBlock");
          if (!contactCard) return;
          try {
            contactCard.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch (_e) {
            contactCard.scrollIntoView();
          }
        });
      },
      saveGeneralInfo: function (fields) {
        return fetch(fn("parent-portal-general-info-save"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({ contact_id: contactId, fields: fields }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("save_failed");
            return j;
          });
        });
      },
      downloadAchievement: function (photoId) {
        return fetch(fn("parent-portal-achievement-download"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({ contact_id: contactId, photo_id: photoId }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("download_failed");
            return j;
          });
        });
      },
      isSectionLoaded: function (section) {
        return !!state.participant.loaded[section];
      },
      loadSection: function (section) {
        if (state.participant.loaded[section]) {
          return Promise.resolve(state.participant.data);
        }
        return fetchParticipantSections(contactId, [section]).then(function (patch) {
          state.participant.data = mergeParticipantBody(state.participant.data, patch);
          state.participant.loaded[section] = true;
          if (section === "sessions" && patch.pending_review_count > 0) {
            showNotice(
              $("ppParticipantNotice"),
              "info",
              "Some session summaries are still being prepared. Refresh in a minute to see them.",
            );
          }
          return state.participant.data;
        });
      },
      onSectionError: function () {
        showNotice(
          $("ppParticipantNotice"),
          "error",
          "Could not load this section — please try again.",
        );
      },
      loadMessages: function (opts) {
        opts = opts && typeof opts === "object" ? opts : {};
        return fetch(fn("parent-portal-messages-list"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({
            contact_id: contactId,
            mark_read: !!opts.markRead,
          }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("messages_load_failed");
            if (opts.markRead || j.unread_messages_count === 0) {
              clearMessagingCounts();
            } else {
              applyMessagingCounts(j);
            }
            return j;
          });
        });
      },
      unreadMessagesTotal: function () {
        return state.messaging.unreadTotal || 0;
      },
      unreadForContact: function (cid) {
        return unreadCountForContact(cid);
      },
      unreadBadgeHtml: unreadBadgeHtml,
      sendMessage: function (message) {
        return fetch(fn("parent-portal-message-send"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({ contact_id: contactId, message: message }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("message_send_failed");
            return j;
          });
        });
      },
      listAbsences: function () {
        return fetch(fn("parent-portal-absence-list"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({ contact_id: contactId }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("absence_list_failed");
            return j;
          });
        });
      },
      submitAbsence: function (payload) {
        payload = payload || {};
        return fetch(fn("parent-portal-absence-submit"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({
            contact_id: contactId,
            session_date: payload.session_date,
            service_label: payload.service_label,
            session_time: payload.session_time || "",
            reason_code: payload.reason_code || "",
            reason_text: payload.reason_text || "",
            can_prove: !!payload.can_prove,
          }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) {
              var err = new Error("absence_submit_failed");
              err.code = (j && j.error) || "save_failed";
              throw err;
            }
            return j;
          });
        });
      },
      uploadAbsenceProof: function (reportId, file) {
        var fd = new FormData();
        fd.append("report_id", String(reportId || ""));
        fd.append("file", file);
        return fetch(fn("parent-portal-absence-proof-upload"), {
          method: "POST",
          headers: {
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: fd,
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) {
              var err = new Error("absence_proof_failed");
              err.code = (j && j.error) || "upload_failed";
              err.messageText = (j && j.message) || "";
              throw err;
            }
            return j;
          });
        });
      },
      listMakeups: function () {
        return fetch(fn("parent-portal-makeup-list"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({ contact_id: contactId }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("makeup_list_failed");
            return j;
          });
        });
      },
      listCredits: function () {
        return fetch(fn("parent-portal-credits-list"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({ contact_id: contactId }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("credits_list_failed");
            return j;
          });
        });
      },
      listDocuments: function () {
        return fetch(fn("parent-portal-documents-list"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({ contact_id: contactId }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("documents_list_failed");
            return j;
          });
        });
      },
      loadConsents: function () {
        return fetch(fn("parent-portal-consents-load"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({ contact_id: contactId }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("consents_load_failed");
            return j;
          });
        });
      },
      saveConsents: function (payload) {
        payload = payload && typeof payload === "object" ? payload : {};
        return fetch(fn("parent-portal-consents-save"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({
            contact_id: contactId,
            photo_consent: payload.photo_consent,
            photo_consent_signed_by_name: payload.photo_consent_signed_by_name,
            medication_at_centre_needed: payload.medication_at_centre_needed,
            medication_at_centre_details: payload.medication_at_centre_details,
            medication_at_centre_signed_by_name: payload.medication_at_centre_signed_by_name,
            emergency_treatment_consent: payload.emergency_treatment_consent,
            emergency_treatment_signed_by_name: payload.emergency_treatment_signed_by_name,
            emergency_contact_name: payload.emergency_contact_name,
            emergency_contact_phone: payload.emergency_contact_phone,
            community_walk_consent: payload.community_walk_consent,
            public_transport_consent: payload.public_transport_consent,
            taxi_home_transport_consent: payload.taxi_home_transport_consent,
            offsite_transport_signed_by_name: payload.offsite_transport_signed_by_name,
          }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) {
              var err = new Error("consents_save_failed");
              err.code = (j && j.error) || "save_failed";
              throw err;
            }
            return j;
          });
        });
      },
      consentsPendingCount: function () {
        return Number(state.participant && state.participant.consentsPending) || 0;
      },
      setConsentsPendingCount: function (n) {
        if (!state.participant) state.participant = { contactId: contactId, data: null, loaded: {} };
        state.participant.consentsPending = Math.max(0, Number(n) || 0);
      },
      parentDisplayName: function () {
        var parent = (state.home && state.home.parent) || {};
        return String(parent.display_name || "").trim();
      },
      listInvoices: function () {
        return fetch(fn("parent-portal-invoices-list"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({ contact_id: contactId }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) throw new Error("invoices_list_failed");
            return j;
          });
        });
      },
      reportInvoicePaid: function (invoiceId, payload) {
        payload = payload && typeof payload === "object" ? payload : {};
        return fetch(fn("parent-portal-invoice-report-paid"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({
            contact_id: contactId,
            invoice_id: invoiceId,
            payment_ref: payload.payment_ref || "",
            method: payload.method || "bank_transfer",
            notes: payload.notes || "",
          }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) {
              var err = new Error("report_paid_failed");
              err.code = (j && j.error) || "report_paid_failed";
              err.messageText = (j && j.message) || "";
              throw err;
            }
            return j;
          });
        });
      },
      startInvoiceCheckout: function (invoiceId) {
        return fetch(fn("parent-portal-invoice-checkout"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({
            contact_id: contactId,
            invoice_id: invoiceId,
            return_origin: global.location && global.location.origin ? global.location.origin : "",
          }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) {
              var err = new Error("checkout_failed");
              err.code = (j && j.error) || "checkout_failed";
              err.messageText = (j && j.message) || "";
              throw err;
            }
            return j;
          });
        });
      },
      startGocardlessSetup: function (invoiceId) {
        return fetch(fn("parent-portal-gocardless-setup"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({
            contact_id: contactId,
            invoice_id: invoiceId || "",
            return_origin: global.location && global.location.origin ? global.location.origin : "",
          }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) {
              var err = new Error("gocardless_setup_failed");
              err.code = (j && j.error) || "gocardless_setup_failed";
              err.messageText = (j && j.message) || "";
              throw err;
            }
            return j;
          });
        });
      },
      applyCreditToInvoice: function (invoiceId, creditId) {
        return fetch(fn("parent-portal-credit-apply-invoice"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({
            contact_id: contactId,
            invoice_id: invoiceId,
            credit_id: creditId,
          }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) {
              var err = new Error("credit_apply_failed");
              err.code = (j && j.error) || "credit_apply_failed";
              err.messageText = (j && j.message) || "";
              throw err;
            }
            return j;
          });
        });
      },
      respondMakeup: function (offerId, action, declineReason) {
        return fetch(fn("parent-portal-makeup-respond"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey(),
            Authorization: "Bearer " + anonKey(),
            "x-parent-portal-session": state.session.token,
          },
          body: JSON.stringify({
            offer_id: offerId,
            action: action,
            decline_reason: declineReason || "",
          }),
        }).then(function (res) {
          return res.json().then(function (j) {
            if (!res.ok || !j.ok) {
              var err = new Error("makeup_respond_failed");
              err.code = (j && j.error) || "respond_failed";
              err.messageText = (j && j.message) || "";
              throw err;
            }
            return j;
          });
        });
      },
    };
  }

  function renderParticipantView(host, body, contactId) {
    if (global.ParentPortalParticipant && typeof global.ParentPortalParticipant.render === "function") {
      global.ParentPortalParticipant.render(host, body, participantRenderOpts(contactId));
      void pingActivity("hub", contactId);
      if (body.pending_review_count > 0) {
        showNotice(
          $("ppParticipantNotice"),
          "info",
          "Some session summaries are still being prepared. Refresh in a minute to see them.",
        );
      } else {
        hideNotice($("ppParticipantNotice"));
      }
      return;
    }
    host.innerHTML = '<p class="pp-muted">Participant view is unavailable in this browser.</p>';
  }

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

  function showNotice(el, type, msg) {
    if (!el) return;
    el.hidden = false;
    el.className = "pp-notice pp-notice--" + (type || "info");
    el.textContent = msg || "";
  }

  function hideNotice(el) {
    if (!el) el = $("ppNotice");
    if (el) {
      el.hidden = true;
      el.textContent = "";
    }
  }

  function setStep(step) {
    state.step = step;
    if ($("ppStepIdentify")) $("ppStepIdentify").hidden = step !== "identify";
    if ($("ppStepHome")) $("ppStepHome").hidden = step !== "home";
    if ($("ppStepParticipant")) $("ppStepParticipant").hidden = step !== "participant";
    if (document.body) {
      document.body.classList.toggle("pp-step-participant", step === "participant");
      document.body.classList.toggle("pp-step-home", step === "home");
      document.body.classList.toggle("pp-step-identify", step === "identify");
    }
    if (step !== "participant") {
      var menuBtn = $("ppHubMenuBtn");
      var menuSheet = $("ppHubMenuSheet");
      if (menuBtn) {
        menuBtn.hidden = true;
        menuBtn.setAttribute("aria-expanded", "false");
      }
      if (menuSheet) menuSheet.hidden = true;
      document.body.classList.remove("pp-hub-menu-open");
    }
    if (step === "home" && state.session.token) {
      void pingActivity("home", null);
    }
  }

  var _pingLast = { surface: "", at: 0 };
  function pingActivity(surface, contactId, detail) {
    var s = String(surface || "").trim().toLowerCase();
    if (!s || !state.session.token) return Promise.resolve();
    var now = Date.now();
    if (_pingLast.surface === s && now - _pingLast.at < 20000) return Promise.resolve();
    _pingLast = { surface: s, at: now };
    return fetch(fn("parent-portal-activity-ping"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        Authorization: "Bearer " + anonKey(),
        "x-parent-portal-session": state.session.token,
      },
      body: JSON.stringify({
        surface: s,
        contact_id: contactId || state.participant.contactId || null,
        detail: detail || null,
      }),
    }).catch(function () {
      /* presence ping is best-effort */
    });
  }

  function saveSession() {
    try {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          token: state.session.token,
          expiresAt: state.session.expiresAt,
        }),
      );
    } catch (_e) {}
  }

  function loadStoredSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return false;
      var j = JSON.parse(raw);
      if (!j || !j.token || !j.expiresAt) return false;
      if (Number(j.expiresAt) <= Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return false;
      }
      state.session.token = String(j.token);
      state.session.expiresAt = Number(j.expiresAt);
      return true;
    } catch (_e) {
      return false;
    }
  }

  function clearSession() {
    state.session.token = "";
    state.session.expiresAt = 0;
    state.home = null;
    clearMessagingCounts();
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (_e) {}
    if (typeof global.portalFamilyWebPushClear === "function") {
      global.portalFamilyWebPushClear();
    }
  }

  function syncFamilyWebPush() {
    if (typeof global.portalFamilyWebPushOnSession !== "function") return;
    if (!state.session.token) {
      global.portalFamilyWebPushClear && global.portalFamilyWebPushClear();
      return;
    }
    global.portalFamilyWebPushOnSession(state.session.token);
  }

  function formatDob(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    } catch (_e) {
      return String(iso);
    }
  }

  function ageFromDobIso(iso) {
    if (!iso) return null;
    try {
      var s = String(iso).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      var p = s.split("-").map(Number);
      var dob = new Date(p[0], p[1] - 1, p[2]);
      var now = new Date();
      var age = now.getFullYear() - dob.getFullYear();
      var m = now.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
      if (age < 0) return null;
      return age;
    } catch (_e) {
      return null;
    }
  }

  function childIdentityMetaHtml(c) {
    if (!c || !c.dob_iso) return "";
    var age = ageFromDobIso(c.dob_iso);
    return (
      '<p class="pp-muted pp-child-dob">D.O.B: ' +
      esc(formatDob(c.dob_iso)) +
      "</p>" +
      (age != null ? '<p class="pp-muted pp-child-age">Age: ' + esc(String(age)) + "</p>" : "")
    );
  }

  function childPhotoMissingNoticeHtml() {
    return (
      '<p class="pp-child-photo-missing" role="status">' +
      "<strong>No photo on file.</strong> " +
      "Please add a photo using <strong>Add photo</strong> below so instructors can identify them at sessions. " +
      "Shared with club staff only · stored in line with GDPR." +
      "</p>"
    );
  }

  function childPhotoCandidates(c, urlOverride) {
    var name = c.display_name || "Participant";
    var contactId = c.contact_id || "";
    if (urlOverride != null) {
      var pending = String(urlOverride || "").trim();
      return pending ? [pending] : [];
    }
    if (c.avatar_url && typeof global.portalRegisterParticipantStorageAvatar === "function") {
      global.portalRegisterParticipantStorageAvatar(contactId, name, c.avatar_url);
    }
    if (typeof global.portalParticipantPhotoPathCandidates === "function") {
      return global.portalParticipantPhotoPathCandidates(name, c.avatar_url || "", contactId);
    }
    if (typeof global.portalParticipantPhotoUrl === "function") {
      var one = global.portalParticipantPhotoUrl(name, c.avatar_url || "", contactId);
      return one ? [one] : [];
    }
    return c.avatar_url ? [String(c.avatar_url)] : [];
  }

  function childHasResolvedPhoto(c) {
    return childPhotoCandidates(c).length > 0;
  }

  function childAvatarImgHtml(c, urlOverride) {
    var name = c.display_name || "Participant";
    var candidates = childPhotoCandidates(c, urlOverride);
    var url = candidates.length ? candidates[0] : "";
    var fallbacks = candidates.slice(1).join("|");
    var initials =
      typeof global.portalParticipantInitials === "function"
        ? global.portalParticipantInitials(name)
        : name.slice(0, 2).toUpperCase();
    var gCls =
      typeof global.portalParticipantGenderClass === "function"
        ? global.portalParticipantGenderClass(name, "pp-child-photo--")
        : "";
    if (url) {
      return (
        '<div class="pp-child-photo pp-child-photo--has-img' +
        gCls +
        '">' +
        '<img src="' +
        esc(url) +
        '" alt="" width="80" height="80" loading="lazy" decoding="async" draggable="false"' +
        (fallbacks ? ' data-photo-fallbacks="' + esc(fallbacks) + '"' : "") +
        ' onerror="if(window.portalParticipantPhotoTryFallback){window.portalParticipantPhotoTryFallback(this);}else{this.remove();this.parentElement.classList.remove(\'pp-child-photo--has-img\');}" />' +
        '<span class="pp-child-photo__init" aria-hidden="true">' +
        esc(initials) +
        "</span></div>"
      );
    }
    return (
      '<div class="pp-child-photo pp-child-photo--init' +
      gCls +
      '" aria-hidden="true">' +
      esc(initials) +
      "</div>"
    );
  }

  function childHasSavedPhoto(c) {
    if (c.has_avatar === true || c.avatar_url) return true;
    return childHasResolvedPhoto(c);
  }

  function childPhotoBlockHtml(c) {
    var cid = String(c.contact_id || "");
    var hasSaved = childHasSavedPhoto(c);
    return (
      '<div class="pp-child-photo-block" data-contact-id="' +
      esc(cid) +
      '" data-has-photo="' +
      (hasSaved ? "1" : "0") +
      '">' +
      '<div class="pp-child-photo-host">' +
      childAvatarImgHtml(c, state.childPhotoPending[cid] && state.childPhotoPending[cid].previewUrl) +
      "</div>" +
      '<button type="button" class="pp-child-photo-edit"' +
      (hasSaved ? "" : " hidden") +
      '>Edit</button>' +
      '<div class="pp-child-photo-tools"' +
      (hasSaved ? " hidden" : "") +
      ">" +
      '<button type="button" class="pp-child-photo-add">Add photo</button>' +
      '<button type="button" class="pp-child-photo-save" hidden>Save photo</button>' +
      "</div>" +
      '<input type="file" class="pp-child-photo-input" accept="image/jpeg,image/png,image/webp,image/*" hidden />' +
      '<p class="pp-child-photo-status pp-muted" role="status" hidden></p>' +
      "</div>"
    );
  }

  function setChildPhotoStatus(block, msg, type) {
    if (!block) return;
    var el = block.querySelector(".pp-child-photo-status");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.className = "pp-child-photo-status pp-muted" + (type ? " pp-child-photo-status--" + type : "");
  }

  function syncChildPhotoBlockUi(block, hasSaved) {
    if (!block) return;
    block.setAttribute("data-has-photo", hasSaved ? "1" : "0");
    var edit = block.querySelector(".pp-child-photo-edit");
    var tools = block.querySelector(".pp-child-photo-tools");
    if (edit) edit.hidden = !hasSaved;
    if (tools) tools.hidden = !!hasSaved;
    if (hasSaved) {
      var save = block.querySelector(".pp-child-photo-save");
      if (save) save.hidden = true;
      setChildPhotoStatus(block, "", "");
    }
  }

  function refreshChildPhotoHost(block, c) {
    if (!block) return;
    var host = block.querySelector(".pp-child-photo-host");
    if (!host) return;
    var cid = String(c.contact_id || "");
    var pending = state.childPhotoPending[cid];
    var override = pending && pending.previewUrl ? pending.previewUrl : null;
    var tmp = document.createElement("div");
    tmp.innerHTML = childAvatarImgHtml(c, override);
    host.innerHTML = "";
    if (tmp.firstChild) host.appendChild(tmp.firstChild);
  }

  async function saveChildPhoto(block, c, file) {
    var cid = String(c.contact_id || "");
    var saveBtn = block.querySelector(".pp-child-photo-save");
    if (saveBtn) saveBtn.disabled = true;
    setChildPhotoStatus(block, "Saving…", "info");
    try {
      var fd = new FormData();
      fd.append("contact_id", cid);
      fd.append("source", "parent_portal");
      fd.append("photo", file, file.name || "photo.jpg");
      var res = await fetch(fn("portal-participant-avatar-save"), {
        method: "POST",
        headers: {
          apikey: anonKey(),
          Authorization: "Bearer " + anonKey(),
          "x-parent-portal-session": state.session.token,
        },
        body: fd,
      });
      var out = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !out.ok) {
        setChildPhotoStatus(block, "Could not save photo — try again.", "error");
        return;
      }
      var newUrl = out.avatar_url || "";
      if (newUrl) {
        // The backend overwrites the same storage path (<cid>/avatar.jpg via
        // upsert), so the returned URL is identical every time and the browser
        // would keep showing the cached (old) image. Bust the cache so the
        // freshly uploaded photo actually loads.
        newUrl += (newUrl.indexOf("?") >= 0 ? "&" : "?") + "v=" + Date.now();
      }
      c.has_avatar = true;
      c.avatar_url = newUrl;
      if (state.home && state.home.children) {
        state.home.children.forEach(function (ch) {
          if (String(ch.contact_id) === cid) {
            ch.has_avatar = true;
            ch.avatar_url = newUrl;
          }
        });
      }
      if (
        state.participant &&
        state.participant.data &&
        state.participant.data.participant &&
        String(state.participant.data.participant.contact_id) === cid
      ) {
        state.participant.data.participant.has_avatar = true;
        state.participant.data.participant.avatar_url = newUrl;
      }
      if (state.childPhotoPending[cid] && state.childPhotoPending[cid].previewUrl) {
        try {
          URL.revokeObjectURL(state.childPhotoPending[cid].previewUrl);
        } catch (_e) {}
      }
      delete state.childPhotoPending[cid];
      var input = block.querySelector(".pp-child-photo-input");
      if (input) input.value = "";
      refreshChildPhotoHost(block, c);
      syncChildPhotoBlockUi(block, true);
      var card = block.closest(".pp-child-card");
      if (card) card.classList.remove("pp-child-card--no-photo");
      var notice = card && card.querySelector(".pp-child-photo-missing");
      if (notice) notice.remove();
      var hero = block.closest(".pp-hub-hero");
      if (hero) {
        hero.classList.remove("pp-hub-hero--needs-photo");
        var hubNotice = hero.querySelector(".pp-child-photo-missing");
        if (hubNotice) hubNotice.remove();
        var hubCta = hero.querySelector(".pp-hub-photo-cta");
        if (hubCta) hubCta.remove();
        void loadParticipantDetail(cid);
        return;
      }
      if (typeof global.portalRegisterParticipantStorageAvatar === "function" && newUrl) {
        global.portalRegisterParticipantStorageAvatar(cid, c.display_name, newUrl);
      }
      setChildPhotoStatus(block, "", "");
    } catch (_e) {
      setChildPhotoStatus(block, "Network error saving photo.", "error");
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function childAvatarHtml(c) {
    return childPhotoBlockHtml(c);
  }

  function ppChildActionIcon(kind) {
    if (kind === "reenrol") {
      return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>' +
        "</svg>"
      );
    }
    if (kind === "hub") {
      return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>' +
        "</svg>"
      );
    }
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a4 4 0 01-4 4H8l-5 3V7a4 4 0 014-4h10a4 4 0 014 4z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/>' +
      "</svg>"
    );
  }

  function childReenrolBtnHtml(c) {
    var cid = String(c.contact_id || "");
    var href = "/parent/re-enrolment?from=portal&contact_id=" + encodeURIComponent(cid);
    var submitted = !!(c.reenrolment && c.reenrolment.submitted);
    var label = submitted ? "Re-enrol 2026/27 · Saved" : "Re-enrol 2026/27";
    return (
      '<a class="pp-child-action-btn pp-child-reenrol-btn' +
      (submitted ? " pp-child-reenrol-btn--saved" : "") +
      '" href="' +
      esc(href) +
      '">' +
      '<span class="pp-child-action-ico" aria-hidden="true">' +
      ppChildActionIcon("reenrol") +
      "</span>" +
      '<span class="pp-child-action-label">' +
      esc(label) +
      "</span>" +
      (submitted
        ? '<span class="pp-child-action-sub">Tap to edit — office notified</span>'
        : "") +
      "</a>"
    );
  }

  function childSessionsBtnHtml(c) {
    var childUnread = unreadCountForContact(c.contact_id);
    var sub = childUnread > 0 ? childUnread + " new message" + (childUnread === 1 ? "" : "s") : "";
    var fullName = String((c && (c.display_name || c.name)) || "Participant").trim() || "Participant";
    var first = fullName.split(/\s+/)[0] || "Participant";
    var label = first + "'s Hub";
    return (
      '<button type="button" class="pp-child-action-btn pp-child-sessions-btn" data-contact-id="' +
      esc(String(c.contact_id || "")) +
      '" aria-label="' +
      esc(label) +
      '">' +
      '<span class="pp-child-action-ico" aria-hidden="true">' +
      ppChildActionIcon("hub") +
      "</span>" +
      '<span class="pp-child-action-label">' +
      esc(label) +
      "</span>" +
      (sub ? '<span class="pp-child-action-sub">' + esc(sub) + "</span>" : "") +
      "</button>"
    );
  }

  function renderHome(data) {
    state.home = data;
    applyMessagingCounts(data);
    var parent = (data && data.parent) || {};
    var children = (data && data.children) || [];
    var unreadTotal = state.messaging.unreadTotal || 0;

    var firstName = parent.display_name ? parent.display_name.split(" ")[0] : "";
    var greetEl = $("ppHomeGreeting");
    if (greetEl) {
      greetEl.textContent = firstName ? "Hello, " + firstName : "Hello";
      var wrap = greetEl.parentElement;
      if (wrap) {
        wrap.querySelectorAll(".pp-unread-badge").forEach(function (el) {
          el.remove();
        });
        if (unreadTotal > 0) {
          wrap.insertAdjacentHTML("beforeend", unreadBadgeHtml(unreadTotal, "New club messages"));
        }
      }
    }

    var childList = $("ppChildList");
    if (childList) {
      if (!children.length) {
        childList.innerHTML =
          '<p class="pp-muted">No linked participants found. Contact the office if this looks wrong.</p>';
      } else {
        childList.innerHTML = children
          .map(function (c) {
            if (c.avatar_url && typeof global.portalRegisterParticipantStorageAvatar === "function") {
              global.portalRegisterParticipantStorageAvatar(c.contact_id, c.display_name, c.avatar_url);
            }
            var chips = [];
            if (c.portal_access === "former" || c.in_class === false) {
              chips.push('<span class="pp-chip pp-chip--former">Former client</span>');
            } else if (c.on_waiting_list) {
              chips.push('<span class="pp-chip pp-chip--wait">Waiting list</span>');
            }
            var childUnread = unreadCountForContact(c.contact_id);
            if (childUnread > 0) {
              chips.push(unreadBadgeHtml(childUnread, "New messages for " + (c.display_name || "participant")));
            }
            var photoMissing = !childHasResolvedPhoto(c) && !c.avatar_url;
            var identityMeta = childIdentityMetaHtml(c);
            return (
              '<article class="pp-card pp-child-card' +
              (photoMissing ? " pp-child-card--no-photo" : "") +
              '" data-contact-id="' +
              esc(String(c.contact_id || "")) +
              '">' +
              '<div class="pp-child-layout">' +
              '<div class="pp-child-identity">' +
              childAvatarHtml(c) +
              '<h3 class="pp-child-name">' +
              esc(c.display_name || "Participant") +
              "</h3>" +
              identityMeta +
              (chips.length ? '<div class="pp-chip-row pp-child-status">' + chips.join("") + "</div>" : "") +
              "</div>" +
              '<div class="pp-child-actions">' +
              childSessionsBtnHtml(c) +
              "</div></div>" +
              (photoMissing ? childPhotoMissingNoticeHtml() : "") +
              "</article>"
            );
          })
          .join("");
      }
    }

    var addr = parent.address || {};
    var addrParts = [addr.line1, addr.line2, addr.city, addr.postcode].filter(function (p) {
      p = String(p || "").trim();
      return p && p !== "—";
    });
    $("ppContactBlock").innerHTML =
      '<p class="pp-muted">Contact on file</p>' +
      (parent.email ? '<p class="pp-contact-line">' + esc(parent.email) + "</p>" : "") +
      (parent.mobile && parent.mobile !== "—"
        ? '<p class="pp-contact-line">' + esc(parent.mobile) + "</p>"
        : "") +
      (addrParts.length
        ? '<p class="pp-contact-line">' + esc(addrParts.join(", ")) + "</p>"
        : "") +
      '<p class="pp-muted pp-contact-note">To update your details, reply to a club message or email info@clubsensational.org.</p>';
  }

  async function loadParticipantDetail(contactId, openView) {
    var host = $("ppParticipantDetail");
    var title = $("ppParticipantTitle");
    if (!host || !contactId) return;
    host.innerHTML = '<p class="pcso-loading" role="status">Loading…</p>';
    setStep("participant");
    state.participant = { contactId: contactId, data: null, loaded: {} };

    try {
      var body = await fetchParticipantSections(contactId, ["general", "weekly_notes"]);
      state.participant.data = body;
      state.participant.loaded.general = true;
      state.participant.loaded.weekly_notes = true;
      rememberContactId(contactId);

      var p = body.participant || {};
      if (p.avatar_url && typeof global.portalRegisterParticipantStorageAvatar === "function") {
        global.portalRegisterParticipantStorageAvatar(p.contact_id, p.display_name, p.avatar_url);
      }
      if (title) title.textContent = (p.display_name || "Participant") + "\u2019s Hub";
      var refreshBtn = $("ppParticipantRefresh");
      if (refreshBtn) refreshBtn.setAttribute("data-contact-id", contactId);
      updateParticipantChrome(contactId);

      if (
        openView &&
        global.ParentPortalParticipant &&
        typeof global.ParentPortalParticipant.openView === "function"
      ) {
        global.ParentPortalParticipant.openView(host, body, participantRenderOpts(contactId), openView);
      } else {
        renderParticipantView(host, body, contactId);
      }
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        // Stay signed in on participant ACL miss — show home instead of killing the session.
        setStep("home");
        showNotice(
          $("ppNotice"),
          "error",
          "We could not open that participant hub. Try another child from the list, or sign in again.",
        );
        void loadHome({ skipAutoHub: true });
        return;
      }
      host.innerHTML =
        '<p class="pp-muted">We could not load this participant right now. Try again in a moment.</p>';
    }
  }

  function childFromHome(contactId) {
    var children = (state.home && state.home.children) || [];
    for (var i = 0; i < children.length; i++) {
      if (String(children[i].contact_id) === String(contactId)) return children[i];
    }
    return null;
  }

  function childRecordForPhoto(contactId) {
    var home = childFromHome(contactId);
    if (home) return home;
    var p =
      state.participant &&
      state.participant.data &&
      state.participant.data.participant;
    if (p && String(p.contact_id) === String(contactId)) {
      return {
        contact_id: p.contact_id,
        display_name: p.display_name,
        has_avatar: !!p.has_avatar,
        avatar_url: p.avatar_url || "",
      };
    }
    return {
      contact_id: contactId,
      display_name: "Participant",
      has_avatar: false,
      avatar_url: "",
    };
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        resolve(fr.result);
      };
      fr.onerror = function () {
        reject(fr.error || new Error("read error"));
      };
      fr.readAsDataURL(file);
    });
  }

  function loadImageEl(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error("image error"));
      };
      img.src = src;
    });
  }

  // Circular crop/reposition step so the parent can place the face inside the
  // circle before upload. Resolves with a square JPEG File, or null if cancelled.
  function openPhotoCropper(file) {
    return new Promise(function (resolve) {
      readFileAsDataUrl(file)
        .then(loadImageEl)
        .then(function (img) {
          buildPhotoCropper(img, file, resolve);
        })
        .catch(function () {
          resolve(file);
        });
    });
  }

  function buildPhotoCropper(img, file, done) {
    var V = 264;
    var OUT = 512;
    var natW = img.naturalWidth || img.width || 1;
    var natH = img.naturalHeight || img.height || 1;
    var minScale = Math.max(V / natW, V / natH);
    var maxScale = minScale * 4;
    var scale = minScale;
    var ox = (V - natW * scale) / 2;
    var oy = (V - natH * scale) / 2;

    var overlay = document.createElement("div");
    overlay.className = "pp-crop-overlay";
    overlay.innerHTML =
      '<div class="pp-crop-modal" role="dialog" aria-modal="true" aria-label="Position the face in the circle">' +
      '<h3 class="pp-crop-title">Position the face</h3>' +
      '<p class="pp-crop-hint">Drag to move and use the slider to zoom. Put the face inside the circle — the rest is cropped out.</p>' +
      '<div class="pp-crop-stage"><div class="pp-crop-viewport"><img class="pp-crop-img" alt="" draggable="false" /><div class="pp-crop-ring" aria-hidden="true"></div></div></div>' +
      '<input type="range" class="pp-crop-zoom" min="1" max="4" step="0.01" value="1" aria-label="Zoom" />' +
      '<div class="pp-crop-actions"><button type="button" class="pp-btn pp-btn--ghost pp-crop-cancel">Cancel</button><button type="button" class="pp-btn pp-crop-use">Use photo</button></div>' +
      "</div>";
    document.body.appendChild(overlay);

    var imgEl = overlay.querySelector(".pp-crop-img");
    var vp = overlay.querySelector(".pp-crop-viewport");
    var zoom = overlay.querySelector(".pp-crop-zoom");
    vp.style.width = V + "px";
    vp.style.height = V + "px";
    imgEl.src = img.src;

    function clamp() {
      var dw = natW * scale;
      var dh = natH * scale;
      var minOx = Math.min(0, V - dw);
      var minOy = Math.min(0, V - dh);
      if (ox > 0) ox = 0;
      if (ox < minOx) ox = minOx;
      if (oy > 0) oy = 0;
      if (oy < minOy) oy = minOy;
    }
    function apply() {
      imgEl.style.width = natW * scale + "px";
      imgEl.style.height = natH * scale + "px";
      imgEl.style.transform = "translate(" + ox + "px," + oy + "px)";
    }
    clamp();
    apply();

    var dragging = false;
    var sx0 = 0;
    var sy0 = 0;
    var ox0 = 0;
    var oy0 = 0;
    function ptDown(e) {
      dragging = true;
      var p = e.touches ? e.touches[0] : e;
      sx0 = p.clientX;
      sy0 = p.clientY;
      ox0 = ox;
      oy0 = oy;
      if (e.cancelable) e.preventDefault();
    }
    function ptMove(e) {
      if (!dragging) return;
      var p = e.touches ? e.touches[0] : e;
      ox = ox0 + (p.clientX - sx0);
      oy = oy0 + (p.clientY - sy0);
      clamp();
      apply();
      if (e.cancelable) e.preventDefault();
    }
    function ptUp() {
      dragging = false;
    }
    vp.addEventListener("mousedown", ptDown);
    window.addEventListener("mousemove", ptMove);
    window.addEventListener("mouseup", ptUp);
    vp.addEventListener("touchstart", ptDown, { passive: false });
    window.addEventListener("touchmove", ptMove, { passive: false });
    window.addEventListener("touchend", ptUp);

    zoom.addEventListener("input", function () {
      var mult = parseFloat(zoom.value) || 1;
      var newScale = minScale * mult;
      if (newScale < minScale) newScale = minScale;
      if (newScale > maxScale) newScale = maxScale;
      var cx = V / 2;
      var cy = V / 2;
      var relX = (cx - ox) / scale;
      var relY = (cy - oy) / scale;
      scale = newScale;
      ox = cx - relX * scale;
      oy = cy - relY * scale;
      clamp();
      apply();
    });

    function cleanup() {
      window.removeEventListener("mousemove", ptMove);
      window.removeEventListener("mouseup", ptUp);
      window.removeEventListener("touchmove", ptMove);
      window.removeEventListener("touchend", ptUp);
      overlay.remove();
    }

    overlay.querySelector(".pp-crop-cancel").addEventListener("click", function () {
      cleanup();
      done(null);
    });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) {
        cleanup();
        done(null);
      }
    });
    overlay.querySelector(".pp-crop-use").addEventListener("click", function () {
      try {
        var srcX = -ox / scale;
        var srcY = -oy / scale;
        var srcSize = V / scale;
        var canvas = document.createElement("canvas");
        canvas.width = OUT;
        canvas.height = OUT;
        var ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUT, OUT);
        canvas.toBlob(
          function (blob) {
            cleanup();
            if (!blob) {
              done(file);
              return;
            }
            var name = String(file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
            var out;
            try {
              out = new File([blob], name, { type: "image/jpeg" });
            } catch (_e) {
              out = blob;
              try {
                out.name = name;
              } catch (_e2) {}
            }
            done(out);
          },
          "image/jpeg",
          0.9,
        );
      } catch (_e) {
        cleanup();
        done(file);
      }
    });
  }

  var _photoHandlersBound = false;
  function bindChildPhotoHandlers(root) {
    // Document-level once: home cards + hub photo CTA share the same controls.
    if (_photoHandlersBound) return;
    _photoHandlersBound = true;
    var scope = document;
    scope.addEventListener("click", function (e) {
      var addBtn = e.target && e.target.closest ? e.target.closest(".pp-child-photo-add") : null;
      var editBtn = e.target && e.target.closest ? e.target.closest(".pp-child-photo-edit") : null;
      var saveBtn = e.target && e.target.closest ? e.target.closest(".pp-child-photo-save") : null;
      if (!addBtn && !editBtn && !saveBtn) return;
      e.stopPropagation();
      var block = (addBtn || editBtn || saveBtn).closest(".pp-child-photo-block");
      if (!block) return;
      var cid = block.getAttribute("data-contact-id") || "";
      var c = childRecordForPhoto(cid);
      if (!c) return;
      if (saveBtn) {
        var pending = state.childPhotoPending[cid];
        if (pending && pending.file) void saveChildPhoto(block, c, pending.file);
        return;
      }
      var input = block.querySelector(".pp-child-photo-input");
      if (input) input.click();
    });
    scope.addEventListener("change", function (e) {
      var input =
        e.target && e.target.classList && e.target.classList.contains("pp-child-photo-input") ? e.target : null;
      if (!input) return;
      var block = input.closest(".pp-child-photo-block");
      if (!block) return;
      var cid = block.getAttribute("data-contact-id") || "";
      var c = childRecordForPhoto(cid);
      if (!c) return;
      var file = input.files && input.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type || "")) {
        setChildPhotoStatus(block, "Please choose a photo (JPG or PNG).", "error");
        input.value = "";
        return;
      }
      var hasSaved = block.getAttribute("data-has-photo") === "1";
      input.value = "";
      setChildPhotoStatus(block, "", "");
      openPhotoCropper(file).then(function (finalFile) {
        if (!finalFile) return;
        if (state.childPhotoPending[cid] && state.childPhotoPending[cid].previewUrl) {
          try {
            URL.revokeObjectURL(state.childPhotoPending[cid].previewUrl);
          } catch (_e) {}
        }
        var previewUrl = URL.createObjectURL(finalFile);
        state.childPhotoPending[cid] = { file: finalFile, previewUrl: previewUrl };
        refreshChildPhotoHost(block, c);
        setChildPhotoStatus(block, "", "");
        if (hasSaved) {
          void saveChildPhoto(block, c, finalFile);
        } else {
          var saveEl = block.querySelector(".pp-child-photo-save");
          if (saveEl) saveEl.hidden = false;
        }
      });
    });
    void root;
  }

  function bindChildCards() {
    var list = $("ppChildList");
    if (!list) return;
    list.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".pp-child-sessions-btn") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-contact-id");
      if (id) void loadParticipantDetail(id);
    });
  }

  function preferredContactId(children) {
    children = Array.isArray(children) ? children : [];
    if (!children.length) return "";
    try {
      var last = String(localStorage.getItem("pp_last_contact_id") || "").trim();
      if (last) {
        for (var i = 0; i < children.length; i++) {
          if (String(children[i].contact_id || "") === last) return last;
        }
      }
    } catch (_e) {}
    return String(children[0].contact_id || "").trim();
  }

  function rememberContactId(contactId) {
    var id = String(contactId || "").trim();
    if (!id) return;
    try {
      localStorage.setItem("pp_last_contact_id", id);
    } catch (_e) {}
  }

  function updateParticipantChrome(contactId) {
    var children = (state.home && state.home.children) || [];
    var multi = children.length > 1;
    var back = $("ppBackToHome");
    if (back) {
      if (multi) {
        back.hidden = false;
        back.setAttribute("aria-label", "All children");
        var label = back.querySelector("span");
        if (label) label.textContent = "All children";
      } else {
        /* Single child: no family landing — Sign out lives on the hub chrome. */
        back.hidden = true;
      }
    }
    var signOutOnHub = $("ppParticipantSignOut");
    if (signOutOnHub) signOutOnHub.hidden = multi;
  }

  async function loadHome(opts) {
    opts = opts || {};
    var skipAutoHub = !!opts.skipAutoHub;
    var res = await fetch(fn("parent-portal-home-load"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        Authorization: "Bearer " + anonKey(),
        "x-parent-portal-session": state.session.token,
      },
      body: "{}",
    });
    var body = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !body.ok) {
      clearSession();
      setStep("identify");
      showNotice($("ppNotice"), "error", "Your session expired. Please sign in again.");
      return false;
    }
    if (body.session && body.session.expires_at) {
      state.session.expiresAt = new Date(body.session.expires_at).getTime();
      saveSession();
    }
    renderHome(body);
    hideNotice($("ppNotice"));
    syncFamilyWebPush();

    var children = (body && body.children) || [];
    if (!skipAutoHub && children.length) {
      var prefer = String(opts.preferredContactId || "").trim();
      var openId =
        (prefer &&
          children.some(function (c) {
            return String(c.contact_id) === prefer;
          }) &&
          prefer) ||
        preferredContactId(children);
      if (openId) {
        await loadParticipantDetail(openId);
        return true;
      }
    }
    setStep("home");
    return true;
  }

  function normalizePinInput(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  async function signIn() {
    hideNotice($("ppNotice"));
    var firstName = String($("ppParticipantFirstName").value || "").trim();
    var pinRaw = normalizePinInput($("ppLoginPin").value);
    if (!firstName || (pinRaw.length !== 4 && pinRaw.length !== 6)) {
      showNotice(
        $("ppNotice"),
        "error",
        "Enter the participant first name and your 4-digit family PIN.",
      );
      return;
    }

    var btn = $("ppSignInBtn");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    try {
      var res = await fetch(fn("parent-portal-sign-in"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: "Bearer " + anonKey(),
        },
        body: JSON.stringify({
          participant_first_name: firstName,
          login_pin: pinRaw,
        }),
      });
      var body = await res.json().catch(function () {
        return {};
      });
      if (res.status === 429) {
        showNotice(
          $("ppNotice"),
          "error",
          "Too many attempts. Please wait a little and try again.",
        );
        return;
      }
      if (!res.ok || !body.ok || !body.session_token) {
        var errCode = body && body.error;
        showNotice(
          $("ppNotice"),
          "error",
          errCode === "former_client"
            ? "Family portal access has ended for this place. Use the booking portal to book again, or contact admin."
            : errCode === "ambiguous_name"
              ? "That first name matches more than one family. Contact the office."
              : "We could not sign you in. Check the first name and PIN, then try again.",
        );
        return;
      }
      state.session.token = String(body.session_token);
      state.session.expiresAt = body.expires_at
        ? new Date(body.expires_at).getTime()
        : Date.now() + 24 * 60 * 60 * 1000;
      saveSession();
      await loadHome({
        preferredContactId: body.preferred_contact_id || "",
      });
    } catch (_e) {
      showNotice($("ppNotice"), "error", "Network error — please try again.");
    } finally {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }

  async function changePin() {
    hideNotice($("ppNotice"));
    var cur = normalizePinInput($("ppPinCurrent") && $("ppPinCurrent").value);
    var n1 = normalizePinInput($("ppPinNew") && $("ppPinNew").value);
    var n2 = normalizePinInput($("ppPinNew2") && $("ppPinNew2").value);
    if (cur.length !== 4 || n1.length !== 4 || n2.length !== 4) {
      showNotice($("ppNotice"), "error", "PINs must be exactly 4 digits.");
      return;
    }
    if (n1 !== n2) {
      showNotice($("ppNotice"), "error", "New PIN and confirmation do not match.");
      return;
    }
    if (!state.session.token) {
      showNotice($("ppNotice"), "error", "Please sign in again.");
      return;
    }
    var btn = $("ppChangePinBtn");
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
    }
    try {
      var res = await fetch(fn("parent-portal-change-pin"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: "Bearer " + anonKey(),
          "x-parent-portal-session": state.session.token,
        },
        body: JSON.stringify({ current_pin: cur, new_pin: n1 }),
      });
      var body = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !body.ok) {
        var msg = "Could not update PIN.";
        if (body.error === "current_pin_invalid") msg = "Current PIN is incorrect.";
        if (body.error === "pin_weak") msg = "Choose a less obvious PIN (not 0000 or 1234).";
        showNotice($("ppNotice"), "error", msg);
        return;
      }
      if ($("ppPinCurrent")) $("ppPinCurrent").value = "";
      if ($("ppPinNew")) $("ppPinNew").value = "";
      if ($("ppPinNew2")) $("ppPinNew2").value = "";
      showNotice($("ppNotice"), "ok", "Family PIN updated.");
    } catch (_e) {
      showNotice($("ppNotice"), "error", "Network error — please try again.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
      }
    }
  }

  function bindEvents() {
    $("ppIdentifyForm").addEventListener("submit", function (e) {
      e.preventDefault();
      void signIn();
    });

    var pinInput = $("ppLoginPin");
    if (pinInput) {
      pinInput.addEventListener("input", function (e) {
        var el = e.target;
        if (!el) return;
        el.value = normalizePinInput(el.value).slice(0, 6);
      });
    }

    var changePinForm = $("ppChangePinForm");
    if (changePinForm) {
      changePinForm.addEventListener("submit", function (e) {
        e.preventDefault();
        void changePin();
      });
      ["ppPinCurrent", "ppPinNew", "ppPinNew2"].forEach(function (id) {
        var el = $(id);
        if (!el) return;
        el.addEventListener("input", function (ev) {
          var t = ev.target;
          if (!t) return;
          t.value = normalizePinInput(t.value).slice(0, 4);
        });
      });
    }

    function doSignOut() {
      clearSession();
      setStep("identify");
      hideNotice($("ppNotice"));
      hideNotice($("ppParticipantNotice"));
    }
    $("ppSignOut").addEventListener("click", doSignOut);
    var hubSignOut = $("ppParticipantSignOut");
    if (hubSignOut) hubSignOut.addEventListener("click", doSignOut);

    $("ppRefresh").addEventListener("click", function () {
      void loadHome();
    });

    var helpBtn = $("ppHelpBtn");
    var helpPanel = $("ppHelpPanel");
    if (helpBtn && helpPanel) {
      helpBtn.addEventListener("click", function () {
        var open = helpPanel.hasAttribute("hidden");
        if (open) helpPanel.removeAttribute("hidden");
        else helpPanel.setAttribute("hidden", "");
        helpBtn.setAttribute("aria-expanded", open ? "true" : "false");
      });
    }

    var back = $("ppBackToHome");
    if (back) {
      back.addEventListener("click", function () {
        hideNotice($("ppParticipantNotice"));
        /* Multi-child: family list without auto-opening a hub again. */
        void loadHome({ skipAutoHub: true });
      });
    }

    var partRefresh = $("ppParticipantRefresh");
    if (partRefresh) {
      partRefresh.addEventListener("click", function () {
        var id = partRefresh.getAttribute("data-contact-id");
        if (id) void loadParticipantDetail(id);
      });
    }
  }

  function initBrand() {
    var img = $("ppBrandLogo");
    if (img && typeof global.portalBrandApplyLogoImg === "function") {
      global.portalBrandApplyLogoImg(img);
    }
  }

  function readParticipantDeepLink() {
    try {
      return new URLSearchParams(global.location.search || "");
    } catch (_e) {
      return new URLSearchParams();
    }
  }

  function maybeOpenParticipantFromUrl() {
    var params = readParticipantDeepLink();
    var contactId = params.get("contact_id") || params.get("contact") || "";
    var invoicePaid = params.get("invoice_paid") === "1";
    var invoiceCancel = params.get("invoice_cancel") === "1";
    var invoiceId = params.get("invoice") || "";
    var gcParam = params.get("gocardless") || "";
    var view = params.get("view") || "";
    if (invoicePaid && invoiceId) {
      try {
        sessionStorage.setItem("pp_invoice_return_pending", String(invoiceId));
        sessionStorage.setItem("pp_invoice_return_tries", "0");
      } catch (_eFlash) {}
    }
    if (gcParam === "1" || gcParam === "cancel") {
      try {
        sessionStorage.setItem("pp_gocardless_flash", String(gcParam));
      } catch (_eGc) {}
    }
    if (!contactId && (view === "messages" || view === "alerts")) {
      var kids = (state.home && state.home.children) || [];
      contactId = preferredContactId(kids) || "";
      if (!view) view = "messages";
    }
    if (!contactId) return;
    if ((invoicePaid || invoiceCancel || gcParam) && !view) view = "invoices";
    void loadParticipantDetail(contactId, view || "");
    try {
      var clean = new URL(global.location.href);
      clean.searchParams.delete("contact_id");
      clean.searchParams.delete("contact");
      clean.searchParams.delete("view");
      clean.searchParams.delete("invoice_paid");
      clean.searchParams.delete("invoice_cancel");
      clean.searchParams.delete("invoice");
      clean.searchParams.delete("gocardless");
      global.history.replaceState({}, "", clean.pathname + clean.search + clean.hash);
    } catch (_e2) {}
  }

  async function bootstrap() {
    initBrand();
    bindEvents();
    bindChildCards();
    bindChildPhotoHandlers();
    if (loadStoredSession()) {
      var params = readParticipantDeepLink();
      var deepId = params.get("contact_id") || params.get("contact") || "";
      var ok = await loadHome(deepId ? { skipAutoHub: true } : {});
      if (!ok) setStep("identify");
      else maybeOpenParticipantFromUrl();
    } else {
      setStep("identify");
    }
  }

  global.ParentPortalApp = {
    bootstrap: bootstrap,
    photo: {
      missingNoticeHtml: childPhotoMissingNoticeHtml,
      blockHtml: childPhotoBlockHtml,
      bindOn: bindChildPhotoHandlers,
      hasSaved: childHasSavedPhoto,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
