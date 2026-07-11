/**
 * Staff dashboard — leader WhatsApp thread (under profile photo).
 * Leaders: berta, john, michelle, raul, victor, javi.
 */
(function (global) {
  "use strict";

  var LEADER_KEYS = {
    berta: true,
    john: true,
    michelle: true,
    raul: true,
    victor: true,
    javi: true,
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeKey(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function isLeaderKey(key) {
    return !!LEADER_KEYS[normalizeKey(key)];
  }

  function supabaseBox() {
    return global.__PORTAL_SUPABASE__ || null;
  }

  function supabaseUrl() {
    var box = supabaseBox();
    if (box && box.url) return String(box.url).replace(/\/$/, "");
    if (global.SUPABASE_URL) return String(global.SUPABASE_URL).replace(/\/$/, "");
    return "";
  }

  function anonKey() {
    var box = supabaseBox();
    if (box && box.anonKey) return String(box.anonKey);
    if (global.SUPABASE_ANON_KEY) return String(global.SUPABASE_ANON_KEY);
    return "";
  }

  async function accessToken() {
    var box = supabaseBox();
    var session = box && box.session;
    if (session && session.access_token) return String(session.access_token);
    try {
      if (box && box.client && box.client.auth && box.client.auth.getSession) {
        var res = await box.client.auth.getSession();
        var tok = res && res.data && res.data.session && res.data.session.access_token;
        if (tok) return String(tok);
      }
    } catch (_e) {}
    return "";
  }

  var sending = false;

  function ensureSheet() {
    var existing = document.getElementById("portalStaffWaSheet");
    if (existing) {
      if (!document.getElementById("portalStaffWaForm")) {
        injectComposer(existing);
      }
      return existing;
    }
    var sheet = document.createElement("div");
    sheet.id = "portalStaffWaSheet";
    sheet.className = "portal-staff-wa-sheet";
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="portal-staff-wa-sheet__backdrop" data-staff-wa-close="1"></div>' +
      '<div class="portal-staff-wa-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="portalStaffWaTitle">' +
      '<header class="portal-staff-wa-sheet__head">' +
      '<h2 id="portalStaffWaTitle">Portal WhatsApp</h2>' +
      '<button type="button" class="portal-staff-wa-sheet__close" data-staff-wa-close="1" aria-label="Close">×</button>' +
      "</header>" +
      '<p class="portal-staff-wa-sheet__sub">Messages with the club also arrive on your WhatsApp number on file. Reply here or on WhatsApp.</p>' +
      '<div class="portal-staff-wa-sheet__thread" id="portalStaffWaThread" role="log" aria-live="polite"></div>' +
      '<p class="portal-staff-wa-sheet__hint" id="portalStaffWaHint"></p>' +
      composerHtml() +
      "</div>";
    document.body.appendChild(sheet);
    sheet.addEventListener("click", function (ev) {
      var t = ev.target;
      if (t && t.getAttribute && t.getAttribute("data-staff-wa-close") === "1") {
        closeSheet();
      }
    });
    bindComposer(sheet);
    return sheet;
  }

  function composerHtml() {
    return (
      '<form class="portal-staff-wa-sheet__composer" id="portalStaffWaForm">' +
      '<label class="topbar-sr-only" for="portalStaffWaDraft">Your reply</label>' +
      '<textarea id="portalStaffWaDraft" name="message" rows="2" maxlength="4000" placeholder="Type a reply…" enterkeyhint="send" autocomplete="off"></textarea>' +
      '<button type="submit" class="portal-staff-wa-sheet__send" id="portalStaffWaSend">Send</button>' +
      "</form>"
    );
  }

  function injectComposer(sheet) {
    var panel = sheet.querySelector(".portal-staff-wa-sheet__panel");
    if (!panel || document.getElementById("portalStaffWaForm")) return;
    panel.insertAdjacentHTML("beforeend", composerHtml());
    bindComposer(sheet);
  }

  function bindComposer(sheet) {
    var form = sheet.querySelector("#portalStaffWaForm");
    if (!form || form.getAttribute("data-bound") === "1") return;
    form.setAttribute("data-bound", "1");
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      void sendReply();
    });
    var draft = sheet.querySelector("#portalStaffWaDraft");
    if (draft) {
      draft.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          void sendReply();
        }
      });
    }
  }

  async function sendReply() {
    if (sending) return;
    var draft = document.getElementById("portalStaffWaDraft");
    var hint = document.getElementById("portalStaffWaHint");
    var sendBtn = document.getElementById("portalStaffWaSend");
    var body = draft ? String(draft.value || "").trim() : "";
    if (!body) {
      if (hint) hint.textContent = "Type a message first.";
      if (draft) draft.focus();
      return;
    }
    var url = supabaseUrl();
    var key = anonKey();
    var token = await accessToken();
    if (!url || !key || !token) {
      if (hint) hint.textContent = "Sign in again to send.";
      return;
    }
    sending = true;
    if (sendBtn) sendBtn.disabled = true;
    if (hint) hint.textContent = "Sending…";
    try {
      var res = await fetch(url + "/functions/v1/portal-staff-message-send", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: body }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        if (hint) {
          hint.textContent =
            "Could not send (" + esc((data && data.error) || res.status) + ").";
        }
        return;
      }
      if (draft) draft.value = "";
      if (hint) hint.textContent = "Sent — admin can see it in Leader WhatsApp.";
      await loadThread();
      if (draft) draft.focus();
    } catch (_e) {
      if (hint) hint.textContent = "Network error — try again.";
    } finally {
      sending = false;
      if (sendBtn) sendBtn.disabled = false;
    }
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

  function renderMessages(messages) {
    var host = document.getElementById("portalStaffWaThread");
    if (!host) return;
    var list = Array.isArray(messages) ? messages : [];
    if (!list.length) {
      host.innerHTML =
        '<p class="portal-staff-wa-sheet__empty">No messages yet. When admin writes from the portal, it will show here and on WhatsApp.</p>';
      return;
    }
    host.innerHTML = list
      .map(function (m) {
        var dir = m.direction === "inbound" ? "in" : "out";
        var label = dir === "in" ? "You" : "Club";
        return (
          '<div class="portal-staff-wa-bubble portal-staff-wa-bubble--' +
          dir +
          '">' +
          '<div class="portal-staff-wa-bubble__meta">' +
          esc(label) +
          " · " +
          esc(formatTime(m.created_at)) +
          "</div>" +
          '<div class="portal-staff-wa-bubble__body">' +
          esc(m.body_text || "") +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    host.scrollTop = host.scrollHeight;
  }

  async function loadThread() {
    var hint = document.getElementById("portalStaffWaHint");
    var host = document.getElementById("portalStaffWaThread");
    if (host) host.innerHTML = '<p class="portal-staff-wa-sheet__empty">Loading…</p>';
    if (hint) hint.textContent = "";
    var url = supabaseUrl();
    var key = anonKey();
    var token = await accessToken();
    if (!url || !key || !token) {
      if (host) host.innerHTML = '<p class="portal-staff-wa-sheet__empty">Sign in again to view messages.</p>';
      return;
    }
    try {
      var staffKey = "";
      try {
        if (typeof global.resolveTopbarStaffKey === "function") {
          staffKey = normalizeKey(global.resolveTopbarStaffKey() || "");
        }
        if (!staffKey && global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) {
          staffKey = normalizeKey(global.__PORTAL_SUPABASE__.staff_profile.username || "");
        }
      } catch (_k) {}
      var res = await fetch(url + "/functions/v1/portal-staff-messages-list", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(staffKey ? { staffUsername: staffKey } : {}),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        var err = (data && data.error) || "load_failed";
        if (host) {
          host.innerHTML =
            '<p class="portal-staff-wa-sheet__empty">Could not load messages (' +
            esc(err) +
            ").</p>";
        }
        if (err === "missing_staff_phone" || (data.staff && data.staff.hasPhone === false)) {
          if (hint) {
            hint.textContent =
              "Your WhatsApp number is missing on your staff profile. Update it in staff profile self-service.";
          }
        }
        return;
      }
      if (data.directory && !data.messages) {
        if (host) {
          host.innerHTML =
            '<p class="portal-staff-wa-sheet__empty">Could not open your thread. Close and try again.</p>';
        }
        return;
      }
      if (data.staff && data.staff.hasPhone === false && hint) {
        hint.textContent =
          "Add your mobile on your staff profile so WhatsApp and the portal stay in sync.";
      }
      renderMessages(data.messages || []);
    } catch (_e) {
      if (host) host.innerHTML = '<p class="portal-staff-wa-sheet__empty">Network error loading messages.</p>';
    }
  }

  function openSheet() {
    var sheet = ensureSheet();
    sheet.hidden = false;
    document.body.classList.add("portal-staff-wa-open");
    void loadThread().then(function () {
      var draft = document.getElementById("portalStaffWaDraft");
      if (draft) {
        try {
          draft.focus();
        } catch (_f) {}
      }
    });
  }

  function closeSheet() {
    var sheet = document.getElementById("portalStaffWaSheet");
    if (sheet) sheet.hidden = true;
    document.body.classList.remove("portal-staff-wa-open");
  }

  function ensureButton(staffKey) {
    var card = document.getElementById("topbarProfileCard");
    if (!card) return;
    var existing = document.getElementById("topbarStaffWaBtn");
    if (!isLeaderKey(staffKey)) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return existing;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "topbarStaffWaBtn";
    btn.className = "topbar-staff-wa-btn";
    btn.setAttribute("aria-label", "Open Portal WhatsApp messages");
    btn.innerHTML =
      '<span class="topbar-staff-wa-btn__ico" aria-hidden="true">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.1-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.1.7 2.8.6.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.3-.2-.6-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4C8.7 21.5 10.3 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3C4.4 15 4 13.5 4 12 4 7.6 7.6 4 12 4s8 3.6 8 8-3.6 8-8 8z"/></svg>' +
      "</span>" +
      '<span class="topbar-staff-wa-btn__label">WhatsApp</span>';
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      openSheet();
    });
    var nameEl = card.querySelector(".topbar-name") || card.querySelector("#staffName");
    if (nameEl && nameEl.parentNode) {
      nameEl.parentNode.insertBefore(btn, nameEl.nextSibling);
    } else {
      card.appendChild(btn);
    }
    return btn;
  }

  function syncForStaffKey(staffKey) {
    ensureButton(staffKey);
  }

  global.portalStaffWaSyncTopbar = syncForStaffKey;
  global.portalStaffWaOpen = openSheet;
  global.portalStaffWaClose = closeSheet;
  global.portalStaffIsWhatsappLeaderKey = isLeaderKey;

  function boot() {
    try {
      var key = "";
      if (typeof global.resolveTopbarStaffKey === "function") {
        key = global.resolveTopbarStaffKey() || "";
      }
      if (!key && global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) {
        key = normalizeKey(global.__PORTAL_SUPABASE__.staff_profile.username || "");
      }
      syncForStaffKey(key);
    } catch (_e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  try {
    global.addEventListener("portal:staff-profile-ready", boot);
  } catch (_e2) {}
})(typeof window !== "undefined" ? window : globalThis);
