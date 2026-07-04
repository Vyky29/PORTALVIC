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
    if (Array.isArray(patch.swim_term_reviews)) {
      base.swim_term_reviews = patch.swim_term_reviews;
      if (patch.swim_term_reviews.length) base.swim_term_review_available = true;
    }
    if (patch.swim_term_review_available != null) {
      base.swim_term_review_available = !!patch.swim_term_review_available;
    }
    if (patch.reenrolment) base.reenrolment = patch.reenrolment;
    if (patch.pending_review_count != null) base.pending_review_count = patch.pending_review_count;
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
    };
  }

  function renderParticipantView(host, body, contactId) {
    if (global.ParentPortalParticipant && typeof global.ParentPortalParticipant.render === "function") {
      global.ParentPortalParticipant.render(host, body, participantRenderOpts(contactId));
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

  function childPhotoMissingNoticeHtml() {
    return (
      '<p class="pp-child-photo-missing" role="status">' +
      "<strong>No photo on file.</strong> " +
      "Please add a photo using <strong>Add photo</strong> below so instructors can identify them at sessions. " +
      "Shared with club staff only · stored in line with GDPR." +
      "</p>"
    );
  }

  function childAvatarImgHtml(c, urlOverride) {
    var name = c.display_name || "Participant";
    var url = urlOverride != null ? String(urlOverride || "").trim() : String(c.avatar_url || "").trim();
    if (!url && c.has_avatar !== false && typeof global.portalParticipantPhotoUrl === "function") {
      url = global.portalParticipantPhotoUrl(name, "", c.contact_id) || "";
    }
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
        '" alt="" width="80" height="80" loading="lazy" decoding="async" draggable="false" onerror="this.remove();this.parentElement.classList.remove(\'pp-child-photo--has-img\');" />' +
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
    return c.has_avatar !== false;
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
      fd.append("source", "parent_portal_home");
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
    return (
      '<button type="button" class="pp-child-action-btn pp-child-sessions-btn" data-contact-id="' +
      esc(String(c.contact_id || "")) +
      '">' +
      '<span class="pp-child-action-ico" aria-hidden="true">' +
      ppChildActionIcon("messages") +
      "</span>" +
      '<span class="pp-child-action-label">Messages, general info, sessions overview</span>' +
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
            if (c.on_waiting_list) chips.push('<span class="pp-chip pp-chip--wait">Waiting list</span>');
            var childUnread = unreadCountForContact(c.contact_id);
            if (childUnread > 0) {
              chips.push(unreadBadgeHtml(childUnread, "New messages for " + (c.display_name || "participant")));
            }
            var photoMissing = c.has_avatar === false;
            var dobLine = c.dob_iso
              ? '<p class="pp-muted pp-child-dob">DOB ' + esc(formatDob(c.dob_iso)) + "</p>"
              : "";
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
              dobLine +
              (chips.length ? '<div class="pp-chip-row pp-child-status">' + chips.join("") + "</div>" : "") +
              "</div>" +
              '<div class="pp-child-actions">' +
              childSessionsBtnHtml(c) +
              childReenrolBtnHtml(c) +
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

  async function loadParticipantDetail(contactId) {
    var host = $("ppParticipantDetail");
    var title = $("ppParticipantTitle");
    if (!host || !contactId) return;
    host.innerHTML = '<p class="pcso-loading" role="status">Loading…</p>';
    setStep("participant");
    state.participant = { contactId: contactId, data: null, loaded: {} };

    try {
      var body = await fetchParticipantSections(contactId, ["general"]);
      state.participant.data = body;
      state.participant.loaded.general = true;

      var p = body.participant || {};
      if (p.avatar_url && typeof global.portalRegisterParticipantStorageAvatar === "function") {
        global.portalRegisterParticipantStorageAvatar(p.contact_id, p.display_name, p.avatar_url);
      }
      if (title) title.textContent = p.display_name || "Participant";
      var refreshBtn = $("ppParticipantRefresh");
      if (refreshBtn) refreshBtn.setAttribute("data-contact-id", contactId);

      renderParticipantView(host, body, contactId);
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        clearSession();
        setStep("identify");
        showNotice($("ppNotice"), "error", "Your session expired. Please sign in again.");
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

  function bindChildPhotoHandlers() {
    var list = $("ppChildList");
    if (!list) return;
    list.addEventListener("click", function (e) {
      var addBtn = e.target && e.target.closest ? e.target.closest(".pp-child-photo-add") : null;
      var editBtn = e.target && e.target.closest ? e.target.closest(".pp-child-photo-edit") : null;
      var saveBtn = e.target && e.target.closest ? e.target.closest(".pp-child-photo-save") : null;
      if (!addBtn && !editBtn && !saveBtn) return;
      e.stopPropagation();
      var block = (addBtn || editBtn || saveBtn).closest(".pp-child-photo-block");
      if (!block) return;
      var cid = block.getAttribute("data-contact-id") || "";
      var c = childFromHome(cid);
      if (!c) return;
      if (saveBtn) {
        var pending = state.childPhotoPending[cid];
        if (pending && pending.file) void saveChildPhoto(block, c, pending.file);
        return;
      }
      var input = block.querySelector(".pp-child-photo-input");
      if (input) input.click();
    });
    list.addEventListener("change", function (e) {
      var input =
        e.target && e.target.classList && e.target.classList.contains("pp-child-photo-input") ? e.target : null;
      if (!input) return;
      var block = input.closest(".pp-child-photo-block");
      if (!block) return;
      var cid = block.getAttribute("data-contact-id") || "";
      var c = childFromHome(cid);
      if (!c) return;
      var file = input.files && input.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type || "")) {
        setChildPhotoStatus(block, "Please choose a photo (JPG or PNG).", "error");
        input.value = "";
        return;
      }
      var hasSaved = block.getAttribute("data-has-photo") === "1";
      if (state.childPhotoPending[cid] && state.childPhotoPending[cid].previewUrl) {
        try {
          URL.revokeObjectURL(state.childPhotoPending[cid].previewUrl);
        } catch (_e) {}
      }
      var previewUrl = URL.createObjectURL(file);
      state.childPhotoPending[cid] = { file: file, previewUrl: previewUrl };
      refreshChildPhotoHost(block, c);
      setChildPhotoStatus(block, "", "");
      if (hasSaved) {
        void saveChildPhoto(block, c, file);
      } else {
        var saveEl = block.querySelector(".pp-child-photo-save");
        if (saveEl) saveEl.hidden = false;
      }
    });
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

  async function loadHome() {
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
    setStep("home");
    hideNotice($("ppNotice"));
    return true;
  }

  function normalizeDobInput(raw) {
    return String(raw || "").replace(/\D/g, "");
  }

  async function signIn() {
    hideNotice($("ppNotice"));
    var parentFirstName = String($("ppParentFirstName").value || "").trim();
    var parentLastName = String($("ppParentLastName").value || "").trim();
    var dobRaw = normalizeDobInput($("ppParticipantDob").value);
    if (!parentFirstName || !parentLastName || dobRaw.length !== 8) {
      showNotice(
        $("ppNotice"),
        "error",
        "Enter your first name, last name, and oldest participant date of birth as 8 digits (DDMMYYYY).",
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
          parent_first_name: parentFirstName,
          parent_last_name: parentLastName,
          login_dob: dobRaw,
        }),
      });
      var body = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !body.ok || !body.session_token) {
        showNotice(
          $("ppNotice"),
          "error",
          "We could not sign you in. Check your name and the oldest child&apos;s date of birth, then try again.",
        );
        return;
      }
      state.session.token = String(body.session_token);
      state.session.expiresAt = body.expires_at
        ? new Date(body.expires_at).getTime()
        : Date.now() + 24 * 60 * 60 * 1000;
      saveSession();
      await loadHome();
    } catch (_e) {
      showNotice($("ppNotice"), "error", "Network error — please try again.");
    } finally {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
    }
  }

  function bindEvents() {
    $("ppIdentifyForm").addEventListener("submit", function (e) {
      e.preventDefault();
      void signIn();
    });

    $("ppParticipantDob").addEventListener("input", function (e) {
      var el = e.target;
      if (!el) return;
      el.value = normalizeDobInput(el.value).slice(0, 8);
    });

    $("ppSignOut").addEventListener("click", function () {
      clearSession();
      setStep("identify");
      hideNotice($("ppNotice"));
    });

    $("ppRefresh").addEventListener("click", function () {
      void loadHome();
    });

    var back = $("ppBackToHome");
    if (back) {
      back.addEventListener("click", function () {
        hideNotice($("ppParticipantNotice"));
        setStep("home");
        if (state.home) {
          renderHome(
            Object.assign({}, state.home, {
              unread_messages_count: state.messaging.unreadTotal,
              unread_by_contact_id: Object.assign({}, state.messaging.unreadByContact),
            }),
          );
        }
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

  async function bootstrap() {
    initBrand();
    bindEvents();
    bindChildCards();
    bindChildPhotoHandlers();
    if (loadStoredSession()) {
      var ok = await loadHome();
      if (!ok) setStep("identify");
    } else {
      setStep("identify");
    }
  }

  global.ParentPortalApp = { bootstrap: bootstrap };
})(typeof window !== "undefined" ? window : globalThis);
