/**
 * Admin — Leader WhatsApp threads (staff leaders only).
 * Parallel to Family messages; uses portal_staff_* tables.
 * Unread = inbound from leader newer than localStorage seen cursor (per username).
 */
(function (global) {
  "use strict";

  var SEEN_STORE_KEY = "portalStaffWaAdminSeenV1";

  var state = {
    directory: [],
    selected: "",
    messages: [],
    loading: false,
    sending: false,
    draft: "",
    pollTimer: null,
  };

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
    toast: function () {},
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
  };

  function esc(s) {
    return cfg.esc(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function readSeenMap() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(SEEN_STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function markThreadSeen(username, iso) {
    var key = String(username || "").trim().toLowerCase();
    if (!key) return;
    try {
      var map = readSeenMap();
      var prev = map[key] || "";
      var next = String(iso || "");
      if (!next || next > prev) {
        map[key] = next || prev || new Date().toISOString();
        if (global.localStorage) {
          global.localStorage.setItem(SEEN_STORE_KEY, JSON.stringify(map));
        }
        try {
          global.dispatchEvent(new CustomEvent("portal:staff-wa-seen"));
        } catch (_ev) {}
      }
    } catch (_e) {}
  }

  function isLeaderUnread(l) {
    if (!l || !l.lastInboundAt) return false;
    var key = String(l.username || "").trim().toLowerCase();
    var seen = readSeenMap()[key] || "";
    return String(l.lastInboundAt) > String(seen);
  }

  function unreadLeadersCount(directory) {
    var n = 0;
    (directory || state.directory || []).forEach(function (l) {
      if (isLeaderUnread(l)) n += 1;
    });
    return n;
  }

  async function authHeaders() {
    var client = cfg.getClient();
    var token = "";
    try {
      if (client && client.auth && client.auth.getSession) {
        var res = await client.auth.getSession();
        token = (res && res.data && res.data.session && res.data.session.access_token) || "";
      }
    } catch (_e) {}
    return {
      Authorization: "Bearer " + token,
      apikey: cfg.getAnonKey(),
      "Content-Type": "application/json",
    };
  }

  async function api(path, body) {
    var url = String(cfg.getSupabaseUrl() || "").replace(/\/$/, "") + "/functions/v1/" + path;
    var res = await fetch(url, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(body || {}),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    return { ok: res.ok && !!data.ok, status: res.status, data: data };
  }

  function viewHtml() {
    return (
      '<div class="portal-staff-wa-admin" id="portalStaffWaAdmin">' +
      '<p class="page-intro">WhatsApp with programme leaders (Berta, John, Michelle, Raúl, Victor, Javi). Messages also appear on their staff dashboard.</p>' +
      '<p class="portal-staff-wa-admin__count muted" id="portalStaffWaCount"></p>' +
      '<div class="portal-staff-wa-admin__layout">' +
      '<aside class="portal-staff-wa-admin__list" id="portalStaffWaDir"></aside>' +
      '<section class="portal-staff-wa-admin__chat">' +
      '<div class="portal-staff-wa-admin__chat-head" id="portalStaffWaHead">Select a leader</div>' +
      '<div class="portal-staff-wa-admin__thread" id="portalStaffWaMsgs"></div>' +
      '<form class="portal-staff-wa-admin__composer" id="portalStaffWaForm">' +
      '<textarea id="portalStaffWaDraft" rows="3" placeholder="Message…" maxlength="4000"></textarea>' +
      '<button type="submit" class="btn" id="portalStaffWaSend">Send WhatsApp</button>' +
      "</form>" +
      "</section>" +
      "</div>" +
      "</div>"
    );
  }

  function renderCount() {
    var el = document.getElementById("portalStaffWaCount");
    if (!el) return;
    var unread = unreadLeadersCount();
    var total = state.directory.length;
    el.textContent =
      total +
      " leader" +
      (total === 1 ? "" : "s") +
      (unread ? " · " + unread + " unread" : "");
    el.classList.toggle("portal-staff-wa-admin__count--has-unread", unread > 0);
  }

  function renderDirectory() {
    var host = document.getElementById("portalStaffWaDir");
    if (!host) return;
    if (!state.directory.length) {
      host.innerHTML = '<p class="muted">No leaders found.</p>';
      renderCount();
      return;
    }
    // Unread first, then name.
    var sorted = state.directory.slice().sort(function (a, b) {
      var ua = isLeaderUnread(a) ? 1 : 0;
      var ub = isLeaderUnread(b) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return String(a.displayName || a.username).localeCompare(
        String(b.displayName || b.username),
        undefined,
        { sensitivity: "base" }
      );
    });
    host.innerHTML = sorted
      .map(function (l) {
        var active = state.selected === l.username ? " is-active" : "";
        var unread = isLeaderUnread(l);
        var phone = l.hasPhone
          ? '<span class="muted">WhatsApp on file</span>'
          : '<span class="portal-staff-wa-admin__warn">No phone</span>';
        var preview = unread && l.lastInboundPreview
          ? '<span class="portal-staff-wa-admin__preview">' +
            esc(l.lastInboundPreview) +
            "</span>"
          : "";
        return (
          '<button type="button" class="portal-staff-wa-admin__person' +
          active +
          (unread ? " portal-staff-wa-admin__person--unread" : "") +
          '" data-staff-wa-user="' +
          esc(l.username) +
          '">' +
          '<span class="portal-staff-wa-admin__person-row">' +
          "<strong>" +
          esc(l.displayName || l.username) +
          "</strong>" +
          (unread
            ? '<span class="portal-staff-wa-admin__unread-chip">Unread</span>'
            : "") +
          "</span>" +
          phone +
          preview +
          "</button>"
        );
      })
      .join("");
    renderCount();
  }

  function formatTime(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return "";
    }
  }

  function latestInboundAt(messages) {
    var max = "";
    (messages || []).forEach(function (m) {
      if (m && m.direction === "inbound" && String(m.created_at || "") > max) {
        max = String(m.created_at);
      }
    });
    return max;
  }

  function renderMessages() {
    var host = document.getElementById("portalStaffWaMsgs");
    var head = document.getElementById("portalStaffWaHead");
    if (head) {
      var lead = state.directory.find(function (l) {
        return l.username === state.selected;
      });
      head.textContent = lead
        ? (lead.displayName || lead.username) + (lead.hasPhone ? "" : " — add phone_e164 first")
        : "Select a leader";
    }
    if (!host) return;
    if (!state.selected) {
      host.innerHTML = '<p class="muted">Choose a leader on the left.</p>';
      return;
    }
    if (state.loading) {
      host.innerHTML = '<p class="muted">Loading…</p>';
      return;
    }
    if (!state.messages.length) {
      host.innerHTML = '<p class="muted">No messages yet.</p>';
      return;
    }
    host.innerHTML = state.messages
      .map(function (m) {
        var dir = m.direction === "inbound" ? "in" : "out";
        var who = dir === "in" ? "Leader" : "Admin";
        return (
          '<div class="portal-staff-wa-admin__bubble portal-staff-wa-admin__bubble--' +
          dir +
          '">' +
          '<div class="portal-staff-wa-admin__meta">' +
          esc(who) +
          " · " +
          esc(formatTime(m.created_at)) +
          (m.whatsapp_status ? " · " + esc(m.whatsapp_status) : "") +
          "</div>" +
          '<div class="portal-staff-wa-admin__body">' +
          esc(m.body_text || "") +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    host.scrollTop = host.scrollHeight;
  }

  async function loadDirectory(opts) {
    opts = opts || {};
    var prevUnread = unreadLeadersCount();
    var res = await api("portal-staff-messages-list", { directory: true });
    if (!res.ok) {
      if (!opts.silent) {
        cfg.toast("Could not load leaders: " + ((res.data && res.data.error) || res.status));
      }
      return;
    }
    state.directory = Array.isArray(res.data.directory) ? res.data.directory : [];
    // If the open thread is selected, keep it marked seen up to latest known inbound.
    if (state.selected) {
      var open = state.directory.find(function (l) {
        return l.username === state.selected;
      });
      if (open && open.lastInboundAt) {
        markThreadSeen(state.selected, open.lastInboundAt);
      }
    }
    renderDirectory();
    var nextUnread = unreadLeadersCount();
    if (opts.notifyNew && nextUnread > prevUnread) {
      var names = state.directory
        .filter(isLeaderUnread)
        .map(function (l) {
          return l.displayName || l.username;
        })
        .slice(0, 3);
      cfg.toast(
        "New Leader WhatsApp" +
          (names.length ? ": " + names.join(", ") : "")
      );
      if (typeof global.portalPlayAlertCue === "function") {
        global.portalPlayAlertCue();
      }
      try {
        global.dispatchEvent(
          new CustomEvent("portal:staff-wa-unread", { detail: { count: nextUnread } })
        );
      } catch (_e) {}
    }
  }

  async function loadThread(username, opts) {
    opts = opts || {};
    state.selected = String(username || "");
    if (!opts.keepLoadingQuiet) {
      state.loading = true;
      renderDirectory();
      renderMessages();
    }
    var res = await api("portal-staff-messages-list", { staffUsername: state.selected });
    state.loading = false;
    if (!res.ok) {
      if (!opts.silent) {
        cfg.toast("Could not load thread: " + ((res.data && res.data.error) || res.status));
      }
      state.messages = [];
      renderMessages();
      return;
    }
    state.messages = Array.isArray(res.data.messages) ? res.data.messages : [];
    var lastIn = latestInboundAt(state.messages);
    if (lastIn) markThreadSeen(state.selected, lastIn);
    // Keep directory lastInboundAt in sync for the open thread.
    state.directory = state.directory.map(function (l) {
      if (l.username !== state.selected) return l;
      return Object.assign({}, l, {
        lastInboundAt: lastIn || l.lastInboundAt || null,
      });
    });
    renderDirectory();
    renderMessages();
  }

  async function sendMessage(ev) {
    if (ev) ev.preventDefault();
    if (state.sending || !state.selected) return;
    var draftEl = document.getElementById("portalStaffWaDraft");
    var body = draftEl ? String(draftEl.value || "").trim() : "";
    if (!body) {
      cfg.toast("Write a message first");
      return;
    }
    var lead = state.directory.find(function (l) {
      return l.username === state.selected;
    });
    if (lead && !lead.hasPhone) {
      cfg.toast("This leader has no phone_e164 on staff_profiles yet");
      return;
    }
    state.sending = true;
    var btn = document.getElementById("portalStaffWaSend");
    if (btn) btn.disabled = true;
    var res = await api("portal-staff-notify-send", {
      staffUsername: state.selected,
      body: body,
      kind: "staff_message",
    });
    state.sending = false;
    if (btn) btn.disabled = false;
    if (!res.ok) {
      cfg.toast("Send failed: " + ((res.data && res.data.error) || res.status));
      return;
    }
    if (draftEl) draftEl.value = "";
    cfg.toast("WhatsApp sent");
    await loadThread(state.selected);
  }

  function startLiveRefresh() {
    stopLiveRefresh();
    state.pollTimer = global.setInterval(function () {
      if (!document.getElementById("portalStaffWaAdmin")) {
        stopLiveRefresh();
        return;
      }
      if (document.visibilityState && document.visibilityState !== "visible") return;
      void loadDirectory({ silent: true, notifyNew: true }).then(function () {
        if (state.selected) {
          void loadThread(state.selected, { silent: true, keepLoadingQuiet: true });
        }
      });
    }, 5000);
  }

  function stopLiveRefresh() {
    if (state.pollTimer) {
      global.clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function bind() {
    var root = document.getElementById("portalStaffWaAdmin");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-staff-wa-user]") : null;
      if (!btn) return;
      void loadThread(btn.getAttribute("data-staff-wa-user"));
    });
    var form = document.getElementById("portalStaffWaForm");
    if (form) form.addEventListener("submit", sendMessage);
    void loadDirectory().then(function () {
      startLiveRefresh();
    });
  }

  function configure(opts) {
    opts = opts || {};
    if (typeof opts.esc === "function") cfg.esc = opts.esc;
    if (typeof opts.getClient === "function") cfg.getClient = opts.getClient;
    if (typeof opts.toast === "function") cfg.toast = opts.toast;
    if (typeof opts.getSupabaseUrl === "function") cfg.getSupabaseUrl = opts.getSupabaseUrl;
    if (typeof opts.getAnonKey === "function") cfg.getAnonKey = opts.getAnonKey;
  }

  async function fetchUnreadCount() {
    try {
      var res = await api("portal-staff-messages-list", { directory: true });
      if (!res.ok) return 0;
      var dir = Array.isArray(res.data.directory) ? res.data.directory : [];
      return unreadLeadersCount(dir);
    } catch (_e) {
      return 0;
    }
  }

  global.PortalStaffWhatsappAdmin = {
    configure: configure,
    viewHtml: viewHtml,
    bind: bind,
    refresh: function () {
      return loadDirectory({ silent: true, notifyNew: false });
    },
    openStaff: function (username) {
      if (!username) return loadDirectory();
      return loadDirectory().then(function () {
        return loadThread(String(username).toLowerCase());
      });
    },
    unreadCount: fetchUnreadCount,
    stopLiveRefresh: stopLiveRefresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
