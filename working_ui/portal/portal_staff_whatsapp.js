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
  var lastUnreadCount = 0;
  var knownUnreadBaseline = false;

  function showStaffWaToast(msg, opts) {
    opts = opts || {};
    var text = String(msg || "").trim();
    if (!text) return;
    var el = document.getElementById("portalStaffWaToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "portalStaffWaToast";
      el.className = "portal-staff-wa-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
      el.addEventListener("click", function () {
        el.classList.remove("is-on");
        openSheet();
      });
    }
    el.textContent = text;
    el.classList.add("is-on");
    if (opts.playCue !== false && typeof global.portalPlayAlertCue === "function") {
      global.portalPlayAlertCue();
    }
    clearTimeout(showStaffWaToast._tm);
    showStaffWaToast._tm = global.setTimeout(function () {
      el.classList.remove("is-on");
    }, opts.ms || 5000);
  }

  function currentStaffKey() {
    try {
      if (typeof global.resolveTopbarStaffKey === "function") {
        var k = normalizeKey(global.resolveTopbarStaffKey() || "");
        if (k) return k;
      }
      if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.staff_profile) {
        return normalizeKey(global.__PORTAL_SUPABASE__.staff_profile.username || "");
      }
    } catch (_e) {}
    return "";
  }

  async function fetchMessagesPayload(opts) {
    opts = opts || {};
    var url = supabaseUrl();
    var key = anonKey();
    var token = await accessToken();
    if (!url || !key || !token) return null;
    var staffKey = currentStaffKey();
    var body = {};
    if (staffKey) body.staffUsername = staffKey;
    if (opts.markRead) body.mark_read = true;
    if (opts.unreadOnly) body.unread_only = true;
    var res = await fetch(url + "/functions/v1/portal-staff-messages-list", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !data.ok) return null;
    return data;
  }

  function applyUnreadBadge(count) {
    lastUnreadCount = Math.max(0, Number(count) || 0);
    var btn = document.getElementById("topbarStaffWaBtn");
    if (btn) {
      btn.classList.toggle("topbar-staff-wa-btn--unread", lastUnreadCount > 0);
      var badge = btn.querySelector(".topbar-staff-wa-btn__badge");
      if (lastUnreadCount > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "topbar-staff-wa-btn__badge";
          badge.setAttribute("aria-hidden", "true");
          btn.appendChild(badge);
        }
        badge.textContent = lastUnreadCount > 9 ? "9+" : String(lastUnreadCount);
      } else if (badge) {
        badge.remove();
      }
      btn.setAttribute(
        "aria-label",
        lastUnreadCount > 0
          ? "Open Portal WhatsApp messages, " + lastUnreadCount + " unread"
          : "Open Portal WhatsApp messages"
      );
    }
    var alertsBlock = document.getElementById("portalStaffWaAlertsBlock");
    var alertsStatus = document.getElementById("portalStaffWaAlertsStatus");
    var alertsBtn = document.getElementById("portalStaffWaAlertsOpenBtn");
    var staffKey = currentStaffKey();
    if (alertsBlock) {
      if (!isLeaderKey(staffKey)) {
        alertsBlock.hidden = true;
      } else {
        alertsBlock.hidden = false;
        alertsBlock.classList.toggle("portal-alerts-block--wa-unread", lastUnreadCount > 0);
        if (alertsStatus) {
          alertsStatus.textContent =
            lastUnreadCount > 0
              ? lastUnreadCount === 1
                ? "1 unread message from the club"
                : lastUnreadCount + " unread messages from the club"
              : "No unread messages";
        }
        if (alertsBtn) {
          alertsBtn.textContent =
            lastUnreadCount > 0 ? "Open unread WhatsApp" : "Open WhatsApp messages";
        }
      }
    }
    var qm = document.getElementById("quickMenuAlerts");
    if (qm) {
      qm.classList.toggle("menu-btn--settings-alerts-wa-unread", lastUnreadCount > 0);
      var sub = qm.querySelector(".menu-btn-sub");
      if (sub && lastUnreadCount > 0) {
        sub.setAttribute("data-wa-unread", String(lastUnreadCount));
      }
    }
  }

  async function refreshUnread(opts) {
    opts = opts || {};
    var staffKey = currentStaffKey();
    if (!isLeaderKey(staffKey)) {
      applyUnreadBadge(0);
      var block = document.getElementById("portalStaffWaAlertsBlock");
      if (block) block.hidden = true;
      return 0;
    }
    try {
      var prev = lastUnreadCount;
      var data = await fetchMessagesPayload({ unreadOnly: true });
      if (!data) return lastUnreadCount;
      var next = Math.max(0, Number(data.unread_messages_count) || 0);
      applyUnreadBadge(next);
      if (knownUnreadBaseline && next > prev) {
        var nNew = next - prev;
        showStaffWaToast(
          nNew === 1
            ? "New Portal WhatsApp from the club — tap to open"
            : nNew + " new Portal WhatsApp messages — tap to open"
        );
        try {
          global.dispatchEvent(
            new CustomEvent("portal:staff-wa-unread", { detail: { count: next } })
          );
        } catch (_e) {}
      }
      knownUnreadBaseline = true;
      return lastUnreadCount;
    } catch (_e) {
      return lastUnreadCount;
    }
  }

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
    try {
      var data = await fetchMessagesPayload({ markRead: true });
      if (!data) {
        if (host) {
          host.innerHTML =
            '<p class="portal-staff-wa-sheet__empty">Sign in again to view messages.</p>';
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
      applyUnreadBadge(0);
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
    void refreshUnread();
    return btn;
  }

  function syncForStaffKey(staffKey) {
    ensureButton(staffKey);
    if (isLeaderKey(staffKey)) void refreshUnread();
    else applyUnreadBadge(0);
  }

  global.portalStaffWaSyncTopbar = syncForStaffKey;
  global.portalStaffWaOpen = openSheet;
  global.portalStaffWaClose = closeSheet;
  global.portalStaffIsWhatsappLeaderKey = isLeaderKey;
  global.portalStaffWaRefreshUnread = refreshUnread;

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
    global.addEventListener("portal:supabase-ready", function () {
      boot();
      void refreshUnread();
    });
  } catch (_e2) {}
  if (!global.__PORTAL_STAFF_WA_UNREAD_POLL__) {
    global.__PORTAL_STAFF_WA_UNREAD_POLL__ = true;
    global.setInterval(function () {
      try {
        if (document.visibilityState === "visible") void refreshUnread();
      } catch (_p) {}
    }, 6000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") void refreshUnread();
    });
  }

  if (!global.__PORTAL_STAFF_WA_PUSH_MSG__ && global.navigator && global.navigator.serviceWorker) {
    global.__PORTAL_STAFF_WA_PUSH_MSG__ = true;
    try {
      global.navigator.serviceWorker.addEventListener("message", function (ev) {
        var d = ev && ev.data;
        if (!d) return;
        var open = String(d.portalOpen || "");
        if (d.type === "portal-push-received" && (open === "staff_whatsapp" || open === "portal_staff_whatsapp")) {
          showStaffWaToast(
            String(d.body || d.title || "New Portal WhatsApp from the club — tap to open")
          );
          void refreshUnread({ fromPush: true });
          return;
        }
        if (d.type === "portal-notification-click" && (open === "staff_whatsapp" || open === "portal_staff_whatsapp")) {
          openSheet();
        }
      });
    } catch (_m) {}
  }

  try {
    var q = new URLSearchParams(String(global.location && global.location.search || ""));
    if (q.get("portalOpen") === "staff_whatsapp" || q.get("portalOpen") === "portal_staff_whatsapp") {
      global.setTimeout(function () {
        openSheet();
      }, 600);
    }
  } catch (_q) {}
})(typeof window !== "undefined" ? window : globalThis);
