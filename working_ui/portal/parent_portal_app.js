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
  };

  function mergeParticipantBody(base, patch) {
    if (!patch) return base;
    if (!base) return patch;
    if (Array.isArray(patch.sessions)) base.sessions = patch.sessions;
    if (Array.isArray(patch.achievements)) base.achievements = patch.achievements;
    if (Array.isArray(patch.swim_term_reviews)) base.swim_term_reviews = patch.swim_term_reviews;
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

  function childAvatarHtml(c) {
    var name = c.display_name || "Participant";
    var url = String(c.avatar_url || "").trim();
    if (!url && typeof global.portalParticipantPhotoUrl === "function") {
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
        '" alt="" width="52" height="52" loading="lazy" decoding="async" draggable="false" onerror="this.remove();this.parentElement.classList.remove(\'pp-child-photo--has-img\');" />' +
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
            if (c.in_class) chips.push('<span class="pp-chip pp-chip--ok">In class</span>');
            if (c.on_waiting_list) chips.push('<span class="pp-chip pp-chip--wait">Waiting list</span>');
            var childUnread = unreadCountForContact(c.contact_id);
            if (childUnread > 0) {
              chips.push(unreadBadgeHtml(childUnread, "New messages for " + (c.display_name || "participant")));
            }
            var meta = [];
            if (c.dob_iso) meta.push("DOB " + esc(formatDob(c.dob_iso)));
            if (c.city && c.city !== "—") meta.push(esc(c.city));
            return (
              '<article class="pp-card pp-child-card pp-child-card--link" role="button" tabindex="0" data-contact-id="' +
              esc(String(c.contact_id || "")) +
              '" aria-label="View sessions for ' +
              esc(c.display_name || "Participant") +
              '">' +
              '<div class="pp-child-row">' +
              '<div class="pp-child-main">' +
              '<h3 class="pp-child-name">' +
              esc(c.display_name || "Participant") +
              "</h3>" +
              (meta.length ? '<p class="pp-muted pp-child-meta">' + meta.join(" · ") + "</p>" : "") +
              "</div>" +
              childAvatarHtml(c) +
              '<div class="pp-chip-row pp-child-status">' +
              chips.join("") +
              "</div>" +
              "</div>" +
              '<p class="pp-child-card__cta">Sessions, messages &amp; achievements →</p>' +
              '<a class="pp-reenrol-chip" href="/parent/re-enrolment?from=portal&amp;contact_id=' +
              esc(String(c.contact_id || "")) +
              '" onclick="event.stopPropagation()">Re-enrol 2026/27</a>' +
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

    var reenrolBannerLink = $("ppReenrolBannerLink");
    if (reenrolBannerLink) {
      var reHref = "/parent/re-enrolment?from=portal";
      if (children.length === 1 && children[0].contact_id) {
        reHref +=
          "&contact_id=" + encodeURIComponent(String(children[0].contact_id || ""));
      }
      reenrolBannerLink.setAttribute("href", reHref);
    }
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

  function bindChildCards() {
    var list = $("ppChildList");
    if (!list) return;
    list.addEventListener("click", function (e) {
      var card = e.target && e.target.closest ? e.target.closest("[data-contact-id]") : null;
      if (!card) return;
      var id = card.getAttribute("data-contact-id");
      if (id) void loadParticipantDetail(id);
    });
    list.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target && e.target.closest ? e.target.closest("[data-contact-id]") : null;
      if (!card) return;
      e.preventDefault();
      var id = card.getAttribute("data-contact-id");
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
    if (loadStoredSession()) {
      var ok = await loadHome();
      if (!ok) setStep("identify");
    } else {
      setStep("identify");
    }
  }

  global.ParentPortalApp = { bootstrap: bootstrap };
})(typeof window !== "undefined" ? window : globalThis);
