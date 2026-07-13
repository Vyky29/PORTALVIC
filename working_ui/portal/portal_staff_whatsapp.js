/**
 * Staff dashboard — CS WhatsApp thread (under profile name).
 * Available to all signed-in staff.
 */
(function (global) {
  "use strict";

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

  function isStaffWhatsappUser(key) {
    return !!normalizeKey(key);
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
  var pendingAttach = null;
  var recording = false;
  var mediaRecorder = null;
  var recordChunks = [];
  var MAX_ATTACH_BYTES = 4 * 1024 * 1024;
  var fetchFailUntil = 0;
  var fetchInFlight = null;

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
    if (Date.now() < fetchFailUntil) return null;
    var url = supabaseUrl();
    var key = anonKey();
    var token = await accessToken();
    if (!url || !key || !token) return null;
    var staffKey = currentStaffKey();
    var body = {};
    if (staffKey) body.staffUsername = staffKey;
    if (opts.markRead) body.mark_read = true;
    if (opts.unreadOnly) body.unread_only = true;
    try {
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
      if (!res.ok || !data.ok) {
        if (res.status >= 500 || res.status === 0) fetchFailUntil = Date.now() + 30000;
        return null;
      }
      fetchFailUntil = 0;
      return data;
    } catch (_err) {
      /* Network/CORS failures — back off so the console is not spammed every 6s. */
      fetchFailUntil = Date.now() + 45000;
      return null;
    }
  }

  function applyUnreadBadge(count) {
    lastUnreadCount = Math.max(0, Number(count) || 0);
    var btn = document.getElementById("topbarStaffWaBtn");
    if (btn) {
      var inGrid = btn.classList.contains("topbar-tool-btn--staff-wa");
      btn.classList.toggle("topbar-staff-wa-btn--unread", !inGrid && lastUnreadCount > 0);
      btn.classList.toggle("topbar-tool-btn--staff-wa-unread", inGrid && lastUnreadCount > 0);
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
          ? "Open CS WhatsApp, " + lastUnreadCount + " unread"
          : "Open CS WhatsApp"
      );
    }
    var alertsBlock = document.getElementById("portalStaffWaAlertsBlock");
    var alertsStatus = document.getElementById("portalStaffWaAlertsStatus");
    var alertsBtn = document.getElementById("portalStaffWaAlertsOpenBtn");
    var staffKey = currentStaffKey();
    if (alertsBlock) {
      if (!isStaffWhatsappUser(staffKey)) {
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
            lastUnreadCount > 0 ? "Open unread CS WhatsApp" : "Open CS WhatsApp";
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
    if (!isStaffWhatsappUser(staffKey)) {
      applyUnreadBadge(0);
      var block = document.getElementById("portalStaffWaAlertsBlock");
      if (block) block.hidden = true;
      return 0;
    }
    if (fetchInFlight) return fetchInFlight;
    fetchInFlight = (async function () {
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
      } finally {
        fetchInFlight = null;
      }
    })();
    return fetchInFlight;
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
      '<h2 id="portalStaffWaTitle">CS WhatsApp</h2>' +
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

  var ICO_PHOTO =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  var ICO_FILE =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  var ICO_VOICE =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var ICO_CLEAR =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var ICO_STOP =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

  function toolBtnHtml(id, label, iconSvg, hidden) {
    return (
      '<button type="button" class="portal-staff-wa-sheet__tool" id="' +
      id +
      '"' +
      (hidden ? " hidden" : "") +
      ' aria-label="' +
      esc(label) +
      '">' +
      '<span class="portal-staff-wa-sheet__tool-ico" aria-hidden="true">' +
      iconSvg +
      "</span>" +
      '<span class="portal-staff-wa-sheet__tool-label">' +
      esc(label) +
      "</span>" +
      "</button>"
    );
  }

  function setRecordBtnLabel(btn, recording) {
    if (!btn) return;
    btn.innerHTML =
      '<span class="portal-staff-wa-sheet__tool-ico" aria-hidden="true">' +
      (recording ? ICO_STOP : ICO_VOICE) +
      "</span>" +
      '<span class="portal-staff-wa-sheet__tool-label">' +
      (recording ? "Stop" : "Voice") +
      "</span>";
    btn.setAttribute("aria-label", recording ? "Stop" : "Voice");
    btn.classList.toggle("is-recording", !!recording);
  }

  function composerHtml() {
    return (
      '<form class="portal-staff-wa-sheet__composer" id="portalStaffWaForm">' +
      '<div class="portal-staff-wa-sheet__tools">' +
      '<input type="file" id="portalStaffWaFile" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" hidden />' +
      toolBtnHtml("portalStaffWaAttachPhoto", "Photo", ICO_PHOTO, false) +
      toolBtnHtml("portalStaffWaAttachDoc", "File", ICO_FILE, false) +
      toolBtnHtml("portalStaffWaRecord", "Voice", ICO_VOICE, false) +
      toolBtnHtml("portalStaffWaClearAttach", "Clear", ICO_CLEAR, true) +
      "</div>" +
      '<p class="portal-staff-wa-sheet__attach-preview muted" id="portalStaffWaAttachPreview"></p>' +
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

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var raw = String(reader.result || "");
        var comma = raw.indexOf(",");
        resolve(comma >= 0 ? raw.slice(comma + 1) : raw);
      };
      reader.onerror = function () {
        reject(new Error("read_failed"));
      };
      reader.readAsDataURL(file);
    });
  }

  function clearAttach() {
    pendingAttach = null;
    var preview = document.getElementById("portalStaffWaAttachPreview");
    if (preview) preview.textContent = "";
    var fileInput = document.getElementById("portalStaffWaFile");
    if (fileInput) fileInput.value = "";
    var clearBtn = document.getElementById("portalStaffWaClearAttach");
    if (clearBtn) clearBtn.hidden = true;
  }

  function setAttach(fileOrBlob, filename, mime) {
    if (!fileOrBlob) return;
    if ((fileOrBlob.size || 0) > MAX_ATTACH_BYTES) {
      var hint = document.getElementById("portalStaffWaHint");
      if (hint) hint.textContent = "Attachment too large (max 4 MB).";
      return;
    }
    var name = filename || fileOrBlob.name || "attachment";
    var type = mime || fileOrBlob.type || "application/octet-stream";
    void fileToBase64(fileOrBlob).then(function (b64) {
      pendingAttach = { base64: b64, mime: type, filename: name };
      var preview = document.getElementById("portalStaffWaAttachPreview");
      if (preview) preview.textContent = "Attached: " + name;
      var clearBtn = document.getElementById("portalStaffWaClearAttach");
      if (clearBtn) clearBtn.hidden = false;
    });
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
    var fileInput = sheet.querySelector("#portalStaffWaFile");
    var photoBtn = sheet.querySelector("#portalStaffWaAttachPhoto");
    var docBtn = sheet.querySelector("#portalStaffWaAttachDoc");
    var recBtn = sheet.querySelector("#portalStaffWaRecord");
    var clearBtn = sheet.querySelector("#portalStaffWaClearAttach");
    if (photoBtn && fileInput) {
      photoBtn.addEventListener("click", function () {
        fileInput.accept = "image/*";
        fileInput.click();
      });
    }
    if (docBtn && fileInput) {
      docBtn.addEventListener("click", function () {
        fileInput.accept = "image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv";
        fileInput.click();
      });
    }
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var f = fileInput.files && fileInput.files[0];
        if (f) setAttach(f, f.name, f.type || "application/octet-stream");
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        clearAttach();
      });
    }
    if (recBtn) {
      recBtn.addEventListener("click", function () {
        void toggleVoice(recBtn);
      });
    }
  }

  async function toggleVoice(recBtn) {
    if (recording && mediaRecorder) {
      try {
        mediaRecorder.stop();
      } catch (_e) {}
      return;
    }
    if (!global.navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      var hint0 = document.getElementById("portalStaffWaHint");
      if (hint0) hint0.textContent = "Voice recording not supported on this device.";
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var mime = "";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) mime = "audio/ogg;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mime = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mime = "audio/mp4";
      }
      recordChunks = [];
      mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recording = true;
      setRecordBtnLabel(recBtn, true);
      mediaRecorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size) recordChunks.push(ev.data);
      };
      mediaRecorder.onstop = function () {
        recording = false;
        setRecordBtnLabel(recBtn, false);
        try {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
        } catch (_s) {}
        var blobMime = (mediaRecorder && mediaRecorder.mimeType) || mime || "audio/webm";
        var blob = new Blob(recordChunks, { type: blobMime });
        var ext = blobMime.indexOf("ogg") >= 0 ? "ogg" : blobMime.indexOf("mp4") >= 0 ? "m4a" : "webm";
        setAttach(blob, "voice-note." + ext, blobMime);
        mediaRecorder = null;
        recordChunks = [];
      };
      mediaRecorder.start();
    } catch (_e) {
      recording = false;
      setRecordBtnLabel(recBtn, false);
      var hint = document.getElementById("portalStaffWaHint");
      if (hint) hint.textContent = "Microphone permission needed for voice notes.";
    }
  }

  async function sendReply() {
    if (sending) return;
    var draft = document.getElementById("portalStaffWaDraft");
    var hint = document.getElementById("portalStaffWaHint");
    var sendBtn = document.getElementById("portalStaffWaSend");
    var body = draft ? String(draft.value || "").trim() : "";
    if (!body && !pendingAttach) {
      if (hint) hint.textContent = "Type a message or attach a photo/file/voice note.";
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
      var payload = { message: body };
      if (pendingAttach) {
        payload.mediaBase64 = pendingAttach.base64;
        payload.mediaMime = pendingAttach.mime;
        payload.mediaFilename = pendingAttach.filename;
      }
      var res = await fetch(url + "/functions/v1/portal-staff-message-send", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          apikey: key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
      clearAttach();
      if (hint) hint.textContent = "Sent — admin can see it in CS WhatsApp.";
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

  function renderMedia(m) {
    var url = m && m.media_url ? String(m.media_url) : "";
    if (!url) return "";
    var mime = String((m && m.media_mime) || "").toLowerCase();
    var type = String((m && m.message_type) || "").toLowerCase();
    if (mime.indexOf("image") === 0 || type === "image" || type === "sticker") {
      return (
        '<a href="' +
        esc(url) +
        '" target="_blank" rel="noopener"><img class="portal-staff-wa-bubble__img" src="' +
        esc(url) +
        '" alt="Photo" loading="lazy" /></a>'
      );
    }
    if (mime.indexOf("video") === 0 || type === "video") {
      return (
        '<video class="portal-staff-wa-bubble__img" src="' +
        esc(url) +
        '" controls playsinline></video>'
      );
    }
    if (mime.indexOf("audio") === 0 || type === "audio") {
      return (
        '<audio class="portal-staff-wa-bubble__audio" src="' +
        esc(url) +
        '" controls></audio>'
      );
    }
    return (
      '<a class="portal-staff-wa-bubble__file" href="' +
      esc(url) +
      '" target="_blank" rel="noopener">Open attachment</a>'
    );
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
        var bodyStr = String(m.body_text || "");
        var isPlaceholder =
          !!m.media_url && /^\[(sticker|image|video|audio|document)\]$/i.test(bodyStr.trim());
        var mediaHtml = renderMedia(m);
        var bodyHtml =
          bodyStr && !isPlaceholder
            ? '<div class="portal-staff-wa-bubble__body">' + esc(bodyStr) + "</div>"
            : "";
        return (
          '<div class="portal-staff-wa-bubble portal-staff-wa-bubble--' +
          dir +
          '">' +
          '<div class="portal-staff-wa-bubble__meta">' +
          esc(label) +
          " · " +
          esc(formatTime(m.created_at)) +
          (dir === "in"
            ? String(m.reply_source || "").toLowerCase() === "whatsapp"
              ? " · via WhatsApp app"
              : " · via portal"
            : m.delivery_label
              ? " · " + esc(m.delivery_label)
              : "") +
          "</div>" +
          mediaHtml +
          bodyHtml +
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

  var WA_ICO_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.6-.8-1.8-.9-.2-.1-.4-.1-.6.1-.2.3-.7.9-.8 1-.1.1-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.6-1.5-.8-2-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.1.7 2.8.6.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1-.1-.1-.3-.2-.6-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4C8.7 21.5 10.3 22 12 22c5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-3.1.8.8-3-.2-.3C4.4 15 4 13.5 4 12 4 7.6 7.6 4 12 4s8 3.6 8 8-3.6 8-8 8z"/></svg>';

  /** Session tool icons only (excludes CS WhatsApp cell). */
  function countSessionTopbarTools() {
    var grid = document.getElementById("topbarToolsGrid");
    if (!grid) return 0;
    var cells = grid.querySelectorAll(".topbar-tool-cell");
    var n = 0;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      if (cell.id === "topbarToolCellStaffWa") continue;
      if (cell.classList.contains("topbar-tool-cell--staff-wa")) continue;
      if (cell.hidden) continue;
      n++;
    }
    return n;
  }

  function ensureWaGridCell() {
    var grid = document.getElementById("topbarToolsGrid");
    if (!grid) return null;
    var cell = document.getElementById("topbarToolCellStaffWa");
    if (cell) return cell;
    cell = document.createElement("div");
    cell.id = "topbarToolCellStaffWa";
    cell.className = "topbar-tool-cell topbar-tool-cell--staff-wa topbar-tool-cell--span2";
    cell.hidden = true;
    cell.setAttribute("aria-hidden", "true");
    grid.appendChild(cell);
    return cell;
  }

  function styleWaButtonForMode(btn, inGrid) {
    if (!btn) return;
    var lab = btn.querySelector(".topbar-staff-wa-btn__label, .topbar-tool-label");
    var ico = btn.querySelector(".topbar-staff-wa-btn__ico, .topbar-tool-btn__ico");
    if (inGrid) {
      btn.className = "topbar-tool-btn topbar-tool-btn--staff-wa";
      if (ico) ico.className = "topbar-tool-btn__ico";
      if (lab) {
        lab.className = "topbar-tool-label";
        lab.textContent = "CS WhatsApp";
      }
    } else {
      btn.className = "topbar-staff-wa-btn";
      if (ico) ico.className = "topbar-staff-wa-btn__ico";
      if (lab) {
        lab.className = "topbar-staff-wa-btn__label";
        lab.textContent = "CS WhatsApp";
      }
    }
    if (lastUnreadCount > 0) {
      btn.classList.add(inGrid ? "topbar-tool-btn--staff-wa-unread" : "topbar-staff-wa-btn--unread");
    }
  }

  function placeWaUnderPhoto(btn, card) {
    if (!btn || !card) return;
    var leftCol = card.closest(".topbar-left--name") || card.parentNode;
    styleWaButtonForMode(btn, false);
    if (leftCol && leftCol !== card) {
      if (btn.parentNode !== leftCol || card.nextSibling !== btn) {
        leftCol.insertBefore(btn, card.nextSibling);
      }
    } else {
      var nameEl = card.querySelector(".topbar-name") || card.querySelector("#staffName");
      if (nameEl && nameEl.parentNode) {
        nameEl.parentNode.insertBefore(btn, nameEl.nextSibling);
      } else {
        card.appendChild(btn);
      }
    }
  }

  function placeWaInGrid(btn) {
    if (!btn) return;
    var cell = ensureWaGridCell();
    if (!cell) return;
    styleWaButtonForMode(btn, true);
    cell.hidden = false;
    cell.setAttribute("aria-hidden", "false");
    if (btn.parentNode !== cell) cell.appendChild(btn);
  }

  /**
   * 2–4 session icons → CS WhatsApp as double-width grid cell.
   * 5+ icons → keep under photo and shrink photo+name+WA to match grid height.
   * 0–1 icons → under photo, normal size.
   */
  function syncWaTopbarPlacement() {
    var card = document.getElementById("topbarProfileCard");
    var btn = document.getElementById("topbarStaffWaBtn");
    var cell = document.getElementById("topbarToolCellStaffWa");
    var left = card && (card.closest(".topbar-left--name") || card.parentNode);
    var lead = document.querySelector(".topbar-lead");
    var grid = document.getElementById("topbarToolsGrid");
    if (!btn || !card) {
      if (left) {
        left.classList.remove("topbar-left--wa-under", "topbar-left--wa-compact");
      }
      if (lead) lead.classList.remove("topbar-lead--wa-in-grid");
      if (grid) grid.classList.remove("topbar-tools-grid--wa-extra");
      if (cell) {
        cell.hidden = true;
        cell.setAttribute("aria-hidden", "true");
      }
      return;
    }
    var n = countSessionTopbarTools();
    var inGrid = n >= 2 && n <= 4;
    if (inGrid) {
      placeWaInGrid(btn);
      if (left) {
        left.classList.remove("topbar-left--wa-under", "topbar-left--wa-compact");
      }
      if (lead) lead.classList.add("topbar-lead--wa-in-grid");
      if (grid) {
        /* Extra row when session icons already fill 2+ rows (3–4 icons). */
        var needExtra = n >= 3;
        var alreadyTall =
          grid.classList.contains("topbar-tools-grid--lead") ||
          grid.classList.contains("topbar-tools-grid--eight") ||
          grid.classList.contains("topbar-tools-grid--ceo-full");
        /* 4 icons already use 3-row lead grid — WA fills the spare row. */
        if (alreadyTall && n === 4) needExtra = false;
        if (alreadyTall && n === 3) needExtra = false;
        grid.classList.toggle("topbar-tools-grid--wa-extra", needExtra);
      }
    } else {
      if (cell) {
        cell.hidden = true;
        cell.setAttribute("aria-hidden", "true");
      }
      placeWaUnderPhoto(btn, card);
      if (left) {
        left.classList.add("topbar-left--wa-under");
        left.classList.toggle("topbar-left--wa-compact", n >= 5);
      }
      if (lead) lead.classList.remove("topbar-lead--wa-in-grid");
      if (grid) grid.classList.remove("topbar-tools-grid--wa-extra");
    }
    applyUnreadBadge(lastUnreadCount);
  }

  function ensureButton(staffKey) {
    var card = document.getElementById("topbarProfileCard");
    if (!card) return;
    var existing = document.getElementById("topbarStaffWaBtn");
    if (!isStaffWhatsappUser(staffKey)) {
      if (existing) existing.remove();
      var orphanCell = document.getElementById("topbarToolCellStaffWa");
      if (orphanCell) {
        orphanCell.hidden = true;
        orphanCell.setAttribute("aria-hidden", "true");
      }
      syncWaTopbarPlacement();
      return;
    }
    if (existing) {
      existing.setAttribute("aria-label", "Open CS WhatsApp");
      syncWaTopbarPlacement();
      return existing;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "topbarStaffWaBtn";
    btn.className = "topbar-staff-wa-btn";
    btn.setAttribute("aria-label", "Open CS WhatsApp");
    btn.innerHTML =
      '<span class="topbar-staff-wa-btn__ico" aria-hidden="true">' +
      WA_ICO_SVG +
      "</span>" +
      '<span class="topbar-staff-wa-btn__label">CS WhatsApp</span>';
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      openSheet();
    });
    placeWaUnderPhoto(btn, card);
    syncWaTopbarPlacement();
    void refreshUnread();
    return btn;
  }

  function syncForStaffKey(staffKey) {
    ensureButton(staffKey);
    if (isStaffWhatsappUser(staffKey)) void refreshUnread();
    else applyUnreadBadge(0);
  }

  global.portalStaffWaSyncTopbar = syncForStaffKey;
  global.portalStaffWaSyncPlacement = syncWaTopbarPlacement;
  global.portalCountSessionTopbarTools = countSessionTopbarTools;
  global.portalStaffWaOpen = openSheet;
  global.portalStaffWaClose = closeSheet;
  global.portalStaffIsWhatsappLeaderKey = isStaffWhatsappUser;
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
          if (typeof global.portalPushIsForCurrentUser === "function" && !global.portalPushIsForCurrentUser(d)) {
            return;
          }
          /* Admin inbound open is for admin dashboard — not the leader chip toast. */
          if (open === "portal_staff_whatsapp") return;
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
