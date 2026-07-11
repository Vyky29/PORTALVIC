/**
 * Admin — Leader WhatsApp threads (staff leaders only).
 * Parallel to Family messages; uses portal_staff_* tables.
 */
(function (global) {
  "use strict";

  var state = {
    directory: [],
    selected: "",
    messages: [],
    loading: false,
    sending: false,
    draft: "",
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

  function renderDirectory() {
    var host = document.getElementById("portalStaffWaDir");
    if (!host) return;
    if (!state.directory.length) {
      host.innerHTML = '<p class="muted">No leaders found.</p>';
      return;
    }
    host.innerHTML = state.directory
      .map(function (l) {
        var active = state.selected === l.username ? " is-active" : "";
        var phone = l.hasPhone
          ? '<span class="muted">WhatsApp on file</span>'
          : '<span class="portal-staff-wa-admin__warn">No phone</span>';
        return (
          '<button type="button" class="portal-staff-wa-admin__person' +
          active +
          '" data-staff-wa-user="' +
          esc(l.username) +
          '">' +
          "<strong>" +
          esc(l.displayName || l.username) +
          "</strong>" +
          phone +
          "</button>"
        );
      })
      .join("");
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

  async function loadDirectory() {
    var res = await api("portal-staff-messages-list", { directory: true });
    if (!res.ok) {
      cfg.toast("Could not load leaders: " + ((res.data && res.data.error) || res.status));
      return;
    }
    state.directory = Array.isArray(res.data.directory) ? res.data.directory : [];
    renderDirectory();
  }

  async function loadThread(username) {
    state.selected = String(username || "");
    state.loading = true;
    renderDirectory();
    renderMessages();
    var res = await api("portal-staff-messages-list", { staffUsername: state.selected });
    state.loading = false;
    if (!res.ok) {
      cfg.toast("Could not load thread: " + ((res.data && res.data.error) || res.status));
      state.messages = [];
      renderMessages();
      return;
    }
    state.messages = Array.isArray(res.data.messages) ? res.data.messages : [];
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
    void loadDirectory();
  }

  function configure(opts) {
    opts = opts || {};
    if (typeof opts.esc === "function") cfg.esc = opts.esc;
    if (typeof opts.getClient === "function") cfg.getClient = opts.getClient;
    if (typeof opts.toast === "function") cfg.toast = opts.toast;
    if (typeof opts.getSupabaseUrl === "function") cfg.getSupabaseUrl = opts.getSupabaseUrl;
    if (typeof opts.getAnonKey === "function") cfg.getAnonKey = opts.getAnonKey;
  }

  global.PortalStaffWhatsappAdmin = {
    configure: configure,
    viewHtml: viewHtml,
    bind: bind,
    refresh: loadDirectory,
  };
})(typeof window !== "undefined" ? window : globalThis);
