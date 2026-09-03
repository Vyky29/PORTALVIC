import { bootstrapDashboardSupabase, portalLogout } from "/portal/auth-handler.js?v=20260903-comms-1";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];
const MAX_FILE = 15 * 1024 * 1024;
const MAX_VOICE_MS = 180000;

const state = {
  me: null,
  mode: "personal",
  inbox: { items: [] },
  open: null,
  messages: [],
  loadingOlder: false,
  oldestAt: null,
  channels: [],
  pc: null,
  localStream: null,
  remoteStream: null,
  call: null,
  pendingSignals: [],
  iceQueues: {},
  pcs: {},
  remoteDescSet: {},
  presence: { administration: "offline", people: {} },
  typing: {},
  typingChannel: null,
  pendingFile: null,
  recording: false,
  mediaRecorder: null,
  recordChunks: [],
  recordTimer: null,
  recordStarted: 0,
  recordStream: null,
  voiceStopping: false,
  recordSend: false,
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

/** CEO Javi Palankas (username Javi) — never instructor Javier. */
function commsStaffLabel(name) {
  const n = String(name || "").trim();
  if (/^administraci[oó]n$/i.test(n) || /^admin$/i.test(n)) return "ADMIN";
  if (/palankas/i.test(n) && !/\bjavi\b/i.test(n)) return "Javi Palankas";
  return n;
}

function client() {
  return window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
}

function initials(name) {
  const parts = String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

function avatarHtml(url, name, cls) {
  const klass = cls || "comms-item-av";
  if (url) {
    return (
      '<span class="' +
      klass +
      '"><img src="' +
      esc(url) +
      '" alt="" /></span>'
    );
  }
  return '<span class="' + klass + '">' + esc(initials(name)) + "</span>";
}

async function rpc(name, args) {
  const c = client();
  if (!c) throw new Error("No session");
  const { data, error } = await c.rpc(name, args || {});
  if (error) throw error;
  return data;
}

function portalHome() {
  const FROM_PAGE = {
    admin: "admin_dashboard.html",
    ceo: "ceo_dashboard.html",
    staff: "staff_dashboard.html",
    office: "office_portal.html",
  };
  function pageForFrom(raw) {
    const k = String(raw || "")
      .trim()
      .toLowerCase();
    return FROM_PAGE[k] || "";
  }
  try {
    const sp = new URLSearchParams(String(window.location.search || "").replace(/^\?/, ""));
    const fromQ = pageForFrom(sp.get("from") || sp.get("portal"));
    if (fromQ) {
      try {
        sessionStorage.setItem("portal_comms_from", String(sp.get("from") || sp.get("portal") || "").trim().toLowerCase());
      } catch (_s) {}
      return fromQ;
    }
  } catch (_q) {}
  try {
    const stored = pageForFrom(sessionStorage.getItem("portal_comms_from"));
    if (stored) return stored;
  } catch (_st) {}
  try {
    const ref = String(document.referrer || "");
    if (ref) {
      const u = new URL(ref, window.location.href);
      if (u.origin === window.location.origin) {
        const path = String(u.pathname || "").toLowerCase();
        if (path.indexOf("admin_dashboard") >= 0) return FROM_PAGE.admin;
        if (path.indexOf("ceo_dashboard") >= 0) return FROM_PAGE.ceo;
        if (path.indexOf("office_portal") >= 0) return FROM_PAGE.office;
        if (path.indexOf("staff_dashboard") >= 0) return FROM_PAGE.staff;
      }
    }
  } catch (_r) {}
  const me = state.me || {};
  if (me.is_office_admin) return FROM_PAGE.office;
  if (me.is_ceo) return FROM_PAGE.ceo;
  return FROM_PAGE.staff;
}

function setBoot(msg) {
  const el = $("commsBoot");
  if (el) el.innerHTML = "<p>" + esc(msg) + "</p>";
}

function showShell() {
  $("commsBoot").hidden = true;
  $("commsShell").hidden = false;
}

function applyModeButtons() {
  document.querySelectorAll("[data-comms-mode]").forEach((btn) => {
    btn.classList.toggle("is-on", btn.getAttribute("data-comms-mode") === state.mode);
  });
}

function itemByConversation(id) {
  return (state.inbox.items || []).find((it) => String(it.conversation_id) === String(id));
}

function recencyTs(it) {
  const at = it && it.last && it.last.at;
  const t = at ? Date.parse(at) : 0;
  return Number.isFinite(t) ? t : 0;
}

function byRecentThenName(a, b) {
  const d = recencyTs(b) - recencyTs(a);
  if (d) return d;
  return String(commsStaffLabel(a.display_name) || "").localeCompare(
    String(commsStaffLabel(b.display_name) || ""),
    "en",
    { sensitivity: "base" }
  );
}

function inboxPreview(it) {
  const last = it && it.last;
  if (!last) return "No messages";
  const t = String(last.type || "");
  if (t === "audio") return "Voice note";
  if (t === "image") return "Photo";
  if (t === "call") return last.body || "Call";
  if (t === "file") return last.body || last.file_name || "File";
  return last.body || "No messages";
}

function renderInbox() {
  const direct = $("commsListDirect");
  const groups = $("commsListGroups");
  if (!direct || !groups) return;
  const items = state.inbox.items || [];
  const d = items.filter((it) => it.kind === "admin_staff" || it.kind === "ceo_peer").slice().sort(byRecentThenName);
  const g = items.filter((it) => it.kind === "group").slice().sort(byRecentThenName);
  $("commsKickerDirect").textContent = state.mode === "administration" ? "Workers" : "My messages";
  direct.innerHTML = d.length
    ? d.map((it) => inboxRow(it)).join("")
    : '<p class="comms-empty">No conversations.</p>';
  groups.innerHTML = g.length
    ? g.map((it) => inboxRow(it)).join("")
    : '<p class="comms-empty">No groups.</p>';
}

function inboxRow(it) {
  const on = state.open && String(state.open.conversation_id) === String(it.conversation_id) ? " is-on" : "";
  const last = inboxPreview(it);
  const unread = Number(it.unread) || 0;
  const closed = it.status === "CLOSED" ? " (closed)" : "";
  return (
    '<button type="button" class="comms-item' +
    on +
    '" data-open-conv="' +
    esc(it.conversation_id) +
    '">' +
    '<span class="comms-item-av-wrap">' +
    avatarHtml(it.avatar_url, commsStaffLabel(it.display_name)) +
    presenceDot(presenceOfItem(it)) +
    "</span>" +
    '<span class="comms-item-text"><strong>' +
    esc(commsStaffLabel(it.display_name)) +
    closed +
    "</strong><span>" +
    esc(last) +
    "</span></span>" +
    (unread ? '<span class="comms-badge">' + (unread > 9 ? "9+" : unread) + "</span>" : "") +
    "</button>"
  );
}

function bubbleHtml(m) {
  const mine = String(m.performed_by_user_id) === String(state.me.id);
  const admin = m.sender_context === "ADMINISTRATION";
  let klass = "comms-bubble" + (mine ? " is-mine" : "") + (admin && !mine ? " is-admin" : "");
  let who = esc(m.sender_display || "");
  if (admin && m.performed_by_name) {
    who += " · sent by " + esc(m.performed_by_name);
  }
  let body = "";
  if (m.message_type === "image" && m.storage_path) {
    body =
      '<a class="comms-file" data-file="' +
      esc(m.storage_path) +
      '" href="#"><img alt="" data-file-img="' +
      esc(m.storage_path) +
      '" /></a>';
  } else if (m.message_type === "audio" && m.storage_path) {
    body =
      '<audio class="comms-audio" controls preload="metadata" data-file="' +
      esc(m.storage_path) +
      '"></audio>';
  } else if (m.message_type === "file" && m.storage_path) {
    body =
      '<a class="comms-file" data-file="' +
      esc(m.storage_path) +
      '" href="#">' +
      esc(m.file_name || "File") +
      "</a>";
  } else if (m.message_type === "call") {
    klass = "comms-bubble is-call";
    who = "";
    body = esc(m.body || "Call");
  } else {
    body = esc(m.body || "");
  }
  const read =
    m.message_type === "call" ? "" : mine ? (m.read_count > 1 || m.delivered_read ? " · read" : " · sent") : "";
  return (
    '<article class="' +
    klass +
    '" data-msg="' +
    esc(m.id) +
    '"><div class="comms-bubble-who">' +
    who +
    "</div><div>" +
    body +
    '</div><p class="comms-bubble-meta">' +
    esc(fmtTime(m.created_at)) +
    read +
    "</p></article>"
  );
}

function renderThread() {
  const el = $("commsThread");
  if (!el) return;
  if (!state.open) {
    el.innerHTML = '<p class="comms-empty">Choose a conversation on the left.</p>';
    $("commsComposer").hidden = true;
    $("commsChatActions").hidden = true;
    $("commsClosedBanner").hidden = true;
    $("commsPeerName").textContent = "Select a conversation";
    $("commsPeerMeta").textContent = "";
    $("commsPeerAvatar").innerHTML = "";
    return;
  }
  const it = itemByConversation(state.open.conversation_id) || state.open;
  $("commsPeerName").textContent = commsStaffLabel(it.display_name) || "Chat";
  $("commsPeerAvatar").innerHTML = avatarHtml(it.avatar_url, commsStaffLabel(it.display_name), "comms-avatar").replace(
    "comms-item-av",
    "comms-avatar"
  );
  const closed = it.status === "CLOSED";
  $("commsClosedBanner").hidden = !closed;
  $("commsComposer").hidden = closed;
  $("commsChatActions").hidden = false;
  $("commsGroupManage").hidden = it.kind !== "group" || !state.me.can_manage_groups;
  $("commsCallAudio").disabled = closed;
  $("commsCallVideo").disabled = closed;
  if (it.kind === "group") {
    $("commsPeerMeta").textContent = closed ? "Closed group" : "Group";
    $("commsDraft").placeholder = "Write in the group...";
  } else if (it.kind === "ceo_peer") {
    $("commsPeerMeta").textContent = "Direct";
    $("commsDraft").placeholder = "Write to " + (commsStaffLabel(it.display_name) || "them") + "...";
  } else if (state.mode === "administration") {
    $("commsPeerMeta").textContent = "Conversation with ADMIN";
    $("commsDraft").placeholder = "Write as ADMIN...";
  } else {
    $("commsPeerMeta").textContent = "ADMIN";
    $("commsDraft").placeholder = "Write to ADMIN...";
  }
  if (!state.messages.length) {
    el.innerHTML = '<p class="comms-empty">No messages yet. Send the first one.</p>';
  } else {
    el.innerHTML = state.messages.map(bubbleHtml).join("");
    hydrateFiles(el);
  }
  el.scrollTop = el.scrollHeight;
}

async function hydrateFiles(root) {
  const c = client();
  if (!c) return;
  const nodes = root.querySelectorAll("[data-file]");
  for (const a of nodes) {
    const path = a.getAttribute("data-file");
    try {
      const { data } = await c.storage.from("communication-files").createSignedUrl(path, 3600);
      if (data && data.signedUrl) {
        if (a.tagName === "AUDIO") {
          a.src = data.signedUrl;
        } else {
          a.href = data.signedUrl;
          a.target = "_blank";
          a.rel = "noopener";
          const img = a.querySelector("[data-file-img]");
          if (img) img.src = data.signedUrl;
        }
      }
    } catch (_e) {}
  }
}

async function loadInbox() {
  const data = await rpc("communication_inbox", { p_mode: state.mode });
  state.inbox = data || { items: [] };
  try {
    const snap = await rpc("communication_presence_snapshot");
    if (snap) state.presence = snap;
  } catch (_e) {}
  renderInbox();
}

function presenceOfItem(it) {
  if (!it || it.kind === "group") return "";
  if (it.kind === "ceo_peer" && it.employee_id) {
    const peer = state.presence && state.presence.people && state.presence.people[it.employee_id];
    return (peer && peer.status) || "offline";
  }
  if (it.kind === "admin_staff" && state.mode !== "administration") {
    return (state.presence && state.presence.administration) || "offline";
  }
  if (it.kind === "admin_staff" && it.employee_id) {
    const p = state.presence && state.presence.people && state.presence.people[it.employee_id];
    return (p && p.status) || "offline";
  }
  return "offline";
}

function presenceDot(status) {
  const st = String(status || "").trim();
  if (!st) return "";
  return '<span class="comms-presence comms-presence--' + esc(st) + '" title="' + esc(st) + '"></span>';
}

function typingLabel() {
  const now = Date.now();
  const names = [];
  Object.keys(state.typing || {}).forEach(function (id) {
    const row = state.typing[id];
    if (!row || row.until < now) {
      delete state.typing[id];
      return;
    }
    if (String(id) === String(state.me && state.me.id)) return;
    names.push(row.name || "Someone");
  });
  return names.length ? names.join(", ") + (names.length === 1 ? " is typing..." : " are typing...") : "";
}

function paintTyping() {
  const el = $("commsTyping");
  if (!el) return;
  const t = typingLabel();
  el.textContent = t;
  el.hidden = !t;
}

function sendTypingPing() {
  if (!state.typingChannel || !state.open || !state.me) return;
  try {
    state.typingChannel.send({
      type: "broadcast",
      event: "typing",
      payload: {
        user_id: state.me.id,
        name:
          state.mode === "administration"
            ? "ADMIN"
            : commsStaffLabel(state.me.full_name),
      },
    });
  } catch (_e) {}
}

function bindTypingChannel(conversationId) {
  const c = client();
  if (!c) return;
  if (state.typingChannel) {
    try {
      c.removeChannel(state.typingChannel);
    } catch (_e) {}
    state.typingChannel = null;
  }
  state.typing = {};
  paintTyping();
  if (!conversationId) return;
  const ch = c.channel("comms-typing-" + conversationId, { config: { broadcast: { self: false } } });
  ch.on("broadcast", { event: "typing" }, function (ev) {
    const p = (ev && ev.payload) || {};
    const id = String(p.user_id || "");
    if (!id || id === String(state.me && state.me.id)) return;
    state.typing[id] = { name: p.name || "Someone", until: Date.now() + 3500 };
    paintTyping();
  });
  ch.subscribe();
  state.typingChannel = ch;
}

function sortMessagesOldestFirst(rows) {
  return (rows || []).slice().sort(function (a, b) {
    const ta = Date.parse(a && a.created_at) || 0;
    const tb = Date.parse(b && b.created_at) || 0;
    if (ta !== tb) return ta - tb;
    return String((a && a.id) || "").localeCompare(String((b && b.id) || ""));
  });
}

function chatPaneOnScreen() {
  const shell = $("commsShell");
  if (!shell || shell.hidden) return false;
  try {
    if (window.matchMedia && window.matchMedia("(max-width: 860px)").matches) {
      return shell.classList.contains("is-chat");
    }
  } catch (_e) {}
  return true;
}

function shouldMarkConversationRead(conversationId, silent) {
  if (!conversationId) return false;
  try {
    if (document.visibilityState !== "visible") return false;
  } catch (_e) {
    return false;
  }
  if (!silent) return true;
  if (!state.open || String(state.open.conversation_id) !== String(conversationId)) return false;
  return chatPaneOnScreen();
}

async function openConversation(id, extra, opts) {
  const silent = !!(opts && opts.silent);
  if (!silent && state.recording) await stopVoice(false);
  const it = itemByConversation(id) || extra || { conversation_id: id };
  state.open = it;
  state.messages = [];
  state.oldestAt = null;
  if (!silent) $("commsShell").classList.add("is-chat");
  bindTypingChannel(id);
  renderInbox();
  const payload = await rpc("communication_list_messages", {
    p_conversation_id: id,
    p_before: null,
    p_limit: 40,
  });
  const rows = (payload && payload.messages) || [];
  state.messages = sortMessagesOldestFirst(rows);
  if (state.messages[0]) state.oldestAt = state.messages[0].created_at;
  renderThread();
  try {
    if (shouldMarkConversationRead(id, silent)) {
      await rpc("communication_mark_read", { p_conversation_id: id });
    }
    if (
      !silent &&
      state.me &&
      state.me.can_act_as_administration &&
      it.kind === "admin_staff" &&
      it.employee_id
    ) {
      await rpc("communication_open_staff_thread", { p_employee_id: it.employee_id });
    }
  } catch (_e) {}
  await loadInbox();
  renderInbox();
}

function mimeAllowed(mime) {
  const m = String(mime || "")
    .toLowerCase()
    .split(";")[0]
    .trim();
  if (!m) return false;
  if (m.startsWith("image/") || m.startsWith("audio/")) return true;
  return ALLOWED_MIME.indexOf(m) !== -1;
}

function messageTypeForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  return "file";
}

function fmtVoiceClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(1, "0");
  const ss = String(s % 60).padStart(2, "0");
  return mm + ":" + ss;
}

function setRecordUi(on) {
  const btn = $("commsRecordBtn");
  const status = $("commsRecordStatus");
  const form = $("commsComposer");
  if (btn) {
    btn.classList.toggle("is-on", !!on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Stop and send voice note" : "Record voice note");
  }
  if (form) form.classList.toggle("is-recording", !!on);
  if (status) {
    status.hidden = !on;
    if (!on) status.textContent = "";
  }
}

function stopVoiceTracks() {
  try {
    if (state.recordStream) state.recordStream.getTracks().forEach((t) => t.stop());
  } catch (_e) {}
  state.recordStream = null;
  if (state.recordTimer) {
    window.clearInterval(state.recordTimer);
    state.recordTimer = null;
  }
}

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const opts = ["audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
  for (let i = 0; i < opts.length; i++) {
    try {
      if (MediaRecorder.isTypeSupported(opts[i])) return opts[i];
    } catch (_e) {}
  }
  return "";
}

function voiceExt(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.indexOf("ogg") >= 0) return "ogg";
  if (m.indexOf("mp4") >= 0 || m.indexOf("m4a") >= 0 || m.indexOf("aac") >= 0) return "m4a";
  if (m.indexOf("mpeg") >= 0 || m.indexOf("mp3") >= 0) return "mp3";
  return "webm";
}

async function finishVoiceBlob(blob, mime) {
  if (!blob || blob.size < 800) return;
  const base = String(mime || blob.type || "audio/webm")
    .split(";")[0]
    .trim();
  const file = new File([blob], "voice-note." + voiceExt(base), { type: base || "audio/webm" });
  state.pendingFile = file;
  await sendMessage();
}

async function stopVoice(sendIt) {
  if (state.voiceStopping) return;
  if (!state.recording && !state.mediaRecorder) return;
  state.voiceStopping = true;
  state.recordSend = !!sendIt;
  const rec = state.mediaRecorder;
  state.recording = false;
  setRecordUi(false);
  try {
    if (rec && rec.state !== "inactive") rec.stop();
    else {
      stopVoiceTracks();
      state.mediaRecorder = null;
      state.voiceStopping = false;
    }
  } catch (_e) {
    stopVoiceTracks();
    state.mediaRecorder = null;
    state.voiceStopping = false;
  }
}

async function startVoice() {
  if (state.call) {
    window.alert("Finish the call before recording a voice note.");
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
    window.alert("Voice notes are not supported on this device.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = pickRecorderMime();
    state.recordChunks = [];
    state.recordStream = stream;
    state.mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    state.recording = true;
    state.recordSend = true;
    state.voiceStopping = false;
    state.recordStarted = Date.now();
    setRecordUi(true);
    const status = $("commsRecordStatus");
    if (status) status.textContent = "Recording 0:00 - tap the mic to send";
    state.recordTimer = window.setInterval(function () {
      const elapsed = Date.now() - state.recordStarted;
      if (status) status.textContent = "Recording " + fmtVoiceClock(elapsed) + " - tap the mic to send";
      if (elapsed >= MAX_VOICE_MS) void stopVoice(true);
    }, 250);
    state.mediaRecorder.ondataavailable = function (ev) {
      if (ev.data && ev.data.size) state.recordChunks.push(ev.data);
    };
    state.mediaRecorder.onstop = function () {
      const chunks = state.recordChunks.slice();
      const recMime = (state.mediaRecorder && state.mediaRecorder.mimeType) || mime || "audio/webm";
      const elapsed = Date.now() - state.recordStarted;
      const shouldSend = state.recordSend;
      stopVoiceTracks();
      state.mediaRecorder = null;
      state.recordChunks = [];
      state.recording = false;
      state.voiceStopping = false;
      setRecordUi(false);
      if (!shouldSend || elapsed < 400 || !chunks.length) return;
      const blob = new Blob(chunks, { type: recMime.split(";")[0] || "audio/webm" });
      void finishVoiceBlob(blob, recMime);
    };
    state.mediaRecorder.start();
  } catch (_e) {
    stopVoiceTracks();
    state.recording = false;
    setRecordUi(false);
    window.alert("Microphone permission is needed for voice notes.");
  }
}

async function toggleVoice() {
  if (state.recording) {
    await stopVoice(true);
    return;
  }
  await startVoice();
}
async function sendMessage(ev) {
  if (ev) ev.preventDefault();
  if (!state.open) return;
  const body = String($("commsDraft").value || "").trim();
  const file = state.pendingFile;
  if (!body && !file) return;
  $("commsSendBtn").disabled = true;
  try {
    let type = "text";
    let path = null;
    let mime = null;
    let name = null;
    let size = null;
    if (file) {
      if (file.size > MAX_FILE) throw new Error("File is larger than 15 MB.");
      mime = String(file.type || "application/octet-stream")
        .split(";")[0]
        .trim();
      if (!mimeAllowed(mime)) {
        throw new Error("This file type is not allowed.");
      }
      type = messageTypeForMime(mime);
      const safe = String(file.name || "file").replace(/[^\w.\-]+/g, "_");
      path = state.open.conversation_id + "/" + crypto.randomUUID() + "_" + safe;
      const up = await client().storage.from("communication-files").upload(path, file, {
        contentType: mime,
        upsert: false,
      });
      if (up.error) throw up.error;
      name = file.name;
      size = file.size;
    }
    await rpc("communication_send_message", {
      p_conversation_id: state.open.conversation_id,
      p_body: body || (type === "audio" ? "Voice note" : name),
      p_sender_context: state.mode === "administration" ? "ADMINISTRATION" : "PERSONAL",
      p_message_type: type,
      p_storage_path: path,
      p_mime_type: mime,
      p_file_name: name,
      p_file_size: size,
    });
    $("commsDraft").value = "";
    state.pendingFile = null;
    $("commsAttachBtn").textContent = "📎";
    await openConversation(state.open.conversation_id, state.open, { silent: true });
  } catch (err) {
    window.alert(err.message || "Could not send.");
  } finally {
    $("commsSendBtn").disabled = false;
  }
}

function subscribeRealtime() {
  const c = client();
  if (!c) return;
  state.channels.forEach((ch) => {
    try {
      c.removeChannel(ch);
    } catch (_e) {}
  });
  state.channels = [];
  const msgs = c
    .channel("comms-messages")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "communication_messages" },
      async (payload) => {
        const row = payload.new || {};
        if (state.open && String(row.conversation_id) === String(state.open.conversation_id)) {
          await openConversation(state.open.conversation_id, state.open, { silent: true });
        } else {
          await loadInbox();
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "communication_messages" },
      async (payload) => {
        const row = payload.new || {};
        if (state.open && String(row.conversation_id) === String(state.open.conversation_id)) {
          await openConversation(state.open.conversation_id, state.open, { silent: true });
        } else {
          await loadInbox();
        }
      }
    )
    .subscribe();
  const calls = c
    .channel("comms-calls")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "communication_calls" },
      async (payload) => {
        const row = payload.new || {};
        if (String(row.initiated_by) === String(state.me.id)) return;
        if (row.status !== "calling") return;
        incomingCall(row);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "communication_calls" },
      (payload) => {
        const row = payload.new || {};
        if (state.call && String(state.call.id) === String(row.id) && row.status !== "calling" && row.status !== "answered") {
          tearDownCall(false);
        }
      }
    )
    .subscribe();
  const sig = c
    .channel("comms-signals")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "communication_call_signals" },
      async (payload) => {
        const row = payload.new || {};
        if (!state.call || String(row.call_id) !== String(state.call.id)) return;
        if (String(row.sender_id) === String(state.me.id)) return;
        await handleSignal(row.payload || {}, row.sender_id);
      }
    )
    .subscribe();
  state.channels.push(msgs, calls, sig);
}

function showModal(html) {
  $("commsModalCard").innerHTML = html;
  $("commsModal").hidden = false;
}

function hideModal() {
  $("commsModal").hidden = true;
  $("commsModalCard").innerHTML = "";
}

async function openNewGroup() {
  let staff = [];
  try {
    const data = await rpc("communication_staff_picker");
    staff = (data && data.staff) || [];
  } catch (err) {
    window.alert(err.message || "Could not load the directory.");
    return;
  }
  showModal(
    "<h2>New group</h2>" +
      '<label>Name<input id="gName" maxlength="80" /></label>' +
      '<label>Description<input id="gDesc" maxlength="200" /></label>' +
      '<p class="comms-peer-meta">Members</p><div class="comms-pick" id="gPick">' +
      staff
        .filter((s) => String(s.id) !== String(state.me.id))
        .map(
          (s) =>
            '<label><input type="checkbox" value="' +
            esc(s.id) +
            '" /> ' +
            esc(commsStaffLabel(s.full_name)) +
            "</label>"
        )
        .join("") +
      "</div>" +
      '<div class="comms-modal-actions"><button type="button" data-comms-modal-close="1">Cancel</button>' +
      '<button type="button" class="comms-primary" id="gCreate">Create</button></div>'
  );
  $("gCreate").onclick = async function () {
    const name = String($("gName").value || "").trim();
    const ids = Array.from(document.querySelectorAll("#gPick input:checked")).map((el) => el.value);
    try {
      const out = await rpc("communication_create_group", {
        p_name: name,
        p_description: String($("gDesc").value || "").trim(),
        p_member_ids: ids,
      });
      hideModal();
      await loadInbox();
      if (out && out.conversation_id) {
        await openConversation(out.conversation_id, {
          conversation_id: out.conversation_id,
          kind: "group",
          display_name: name,
          group_id: out.group_id,
        });
      }
    } catch (err) {
      window.alert(err.message || "Could not create.");
    }
  };
}

async function openGroupManage() {
  if (!state.open || !state.open.group_id) return;
  let members = [];
  let staff = [];
  try {
    const m = await rpc("communication_group_members_list", { p_group_id: state.open.group_id });
    members = (m && m.members) || [];
    const s = await rpc("communication_staff_picker");
    staff = (s && s.staff) || [];
  } catch (err) {
    window.alert(err.message || "Could not load.");
    return;
  }
  const memberIds = new Set(members.map((x) => String(x.id)));
  showModal(
    "<h2>Members</h2><div class='comms-pick'>" +
      members.map((x) => "<div>" + esc(commsStaffLabel(x.full_name)) + "</div>").join("") +
      "</div><p class='comms-peer-meta'>Add</p><div class='comms-pick' id='gAdd'>" +
      staff
        .filter((s) => !memberIds.has(String(s.id)))
        .map(
          (s) =>
            '<label><input type="checkbox" value="' +
            esc(s.id) +
            '" /> ' +
            esc(commsStaffLabel(s.full_name)) +
            "</label>"
        )
        .join("") +
      "</div><p class='comms-peer-meta'>Remove</p><div class='comms-pick' id='gDel'>" +
      members
        .map(
          (s) =>
            '<label><input type="checkbox" value="' +
            esc(s.id) +
            '" /> ' +
            esc(commsStaffLabel(s.full_name)) +
            "</label>"
        )
        .join("") +
      "</div>" +
      '<div class="comms-modal-actions"><button type="button" data-comms-modal-close="1">Close</button>' +
      (state.open.status === "CLOSED"
        ? ""
        : '<button type="button" id="gSave">Save</button><button type="button" class="comms-hang" id="gClose">Close group</button>') +
      "</div>"
  );
  const save = $("gSave");
  if (save) {
    save.onclick = async function () {
      const add = Array.from(document.querySelectorAll("#gAdd input:checked")).map((el) => el.value);
      const remove = Array.from(document.querySelectorAll("#gDel input:checked")).map((el) => el.value);
      try {
        await rpc("communication_set_group_members", {
          p_group_id: state.open.group_id,
          p_add_ids: add,
          p_remove_ids: remove,
        });
        hideModal();
        await loadInbox();
      } catch (err) {
        window.alert(err.message || "Could not update.");
      }
    };
  }
  const closeBtn = $("gClose");
  if (closeBtn) {
    closeBtn.onclick = async function () {
      if (!window.confirm("Close this group? History is kept.")) return;
      try {
        await rpc("communication_close_group", { p_group_id: state.open.group_id });
        hideModal();
        await loadInbox();
        await openConversation(state.open.conversation_id, state.open);
      } catch (err) {
        window.alert(err.message || "Could not close.");
      }
    };
  }
}

async function openSearch(q) {
  if (!state.me.can_act_as_administration) return;
  if (String(q || "").trim().length < 2) return;
  try {
    const data = await rpc("communication_search", { p_q: q, p_limit: 30 });
    const people = data.people || [];
    const groups = data.groups || [];
    const messages = data.messages || [];
    showModal(
      "<h2>Search</h2>" +
        people
          .map(
            (p) =>
              '<button type="button" class="comms-item" data-search-person="' +
              esc(p.id) +
              '">' +
              avatarHtml(p.avatar_url, commsStaffLabel(p.full_name)) +
              '<span class="comms-item-text"><strong>' +
              esc(commsStaffLabel(p.full_name)) +
              "</strong></span></button>"
          )
          .join("") +
        groups
          .map(
            (g) =>
              '<p class="comms-peer-meta">' +
              esc(g.name) +
              " · " +
              esc(g.status) +
              "</p>"
          )
          .join("") +
        messages
          .map(
            (m) =>
              '<button type="button" class="comms-item" data-search-msg="' +
              esc(m.conversation_id) +
              '"><span class="comms-item-text"><strong>' +
              esc(m.body) +
              "</strong><span>" +
              esc(fmtTime(m.created_at)) +
              "</span></span></button>"
          )
          .join("") +
        '<div class="comms-modal-actions"><button type="button" data-comms-modal-close="1">Close</button></div>'
    );
  } catch (err) {
    window.alert(err.message || "Search is not available.");
  }
}

async function openAudit() {
  try {
    const data = await rpc("communication_audit_list", { p_limit: 80 });
    const rows = (data && data.rows) || [];
    showModal(
      "<h2>Audit</h2><div class='comms-pick'>" +
        rows
          .map(
            (r) =>
              "<div><strong>" +
              esc(r.action) +
              "</strong> · " +
              esc(r.actor_name) +
              "<div class='comms-peer-meta'>" +
              esc(fmtTime(r.created_at)) +
              "</div></div>"
          )
          .join("") +
        "</div><div class='comms-modal-actions'><button type='button' data-comms-modal-close='1'>Close</button></div>"
    );
  } catch (err) {
    window.alert(err.message || "Could not load the audit log.");
  }
}

function setCallUi(phase) {
  $("commsCallOverlay").hidden = false;
  $("commsAnswer").hidden = phase !== "incoming";
  $("commsReject").hidden = phase !== "incoming";
  $("commsHang").hidden = phase === "incoming";
  $("commsMuteMic").hidden = phase === "incoming";
  $("commsMuteCam").hidden = phase === "incoming" || (state.call && state.call.type !== "VIDEO");
  void playVideoEl($("commsLocalVideo"));
  layoutRemoteGrid();
}

function playVideoEl(el) {
  if (!el) return Promise.resolve();
  el.playsInline = true;
  el.setAttribute("playsinline", "");
  el.setAttribute("webkit-playsinline", "");
  const p = el.play();
  if (p && p.catch) {
    return p.catch(function () {
      const wasMuted = el.muted;
      el.muted = true;
      return el.play().then(function () {
        if (!wasMuted) el.muted = wasMuted;
      }).catch(function () {});
    });
  }
  return Promise.resolve();
}

function layoutRemoteGrid() {
  const grid = $("commsRemoteGrid");
  if (!grid) return;
  const n = grid.querySelectorAll("video").length;
  grid.setAttribute("data-count", String(n));
}

function remoteVideoFor(peerId) {
  const grid = $("commsRemoteGrid");
  if (!grid) return null;
  const id = "commsRemote-" + peerId;
  let v = document.getElementById(id);
  if (!v) {
    const wrap = document.createElement("div");
    wrap.className = "comms-remote-tile";
    wrap.setAttribute("data-peer", peerId);
    v = document.createElement("video");
    v.id = id;
    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    const lab = document.createElement("span");
    lab.className = "comms-remote-name";
    lab.textContent = commsStaffLabel((state.callPeers && state.callPeers[peerId]) || "Participant");
    wrap.appendChild(v);
    wrap.appendChild(lab);
    grid.appendChild(wrap);
    layoutRemoteGrid();
  }
  return v;
}

function bindRemoteTrackFor(peerId, track) {
  if (!track || !peerId) return;
  if (!state.remoteStreams) state.remoteStreams = {};
  if (!state.remoteStreams[peerId]) state.remoteStreams[peerId] = new MediaStream();
  const stream = state.remoteStreams[peerId];
  const already = stream.getTracks().some(function (t) {
    return t.id === track.id;
  });
  if (!already) stream.addTrack(track);
  const v = remoteVideoFor(peerId);
  if (v) {
    v.srcObject = stream;
    void playVideoEl(v);
  }
}

function rtcDescFromPayload(payload) {
  const raw = payload && payload.sdp;
  if (raw && typeof raw === "object" && raw.sdp) {
    return new RTCSessionDescription({ type: raw.type || payload.type, sdp: raw.sdp });
  }
  if (typeof raw === "string") {
    return new RTCSessionDescription({ type: payload.type, sdp: raw });
  }
  return new RTCSessionDescription(payload);
}

function sendCallSignal(kind, obj, toUserId) {
  if (!state.call || !state.call.id) return Promise.resolve();
  let payload;
  if (kind === "join" || kind === "leave") {
    payload = { type: kind, from: state.me.id };
  } else if (kind === "ice") {
    payload = {
      type: "ice",
      from: state.me.id,
      to: toUserId,
      candidate: obj && typeof obj.toJSON === "function" ? obj.toJSON() : obj,
    };
  } else {
    payload = {
      type: kind,
      from: state.me.id,
      to: toUserId,
      sdp: { type: obj.type, sdp: obj.sdp },
    };
  }
  return rpc("communication_call_signal", {
    p_call_id: state.call.id,
    p_payload: payload,
  });
}

function iceQueueFor(peerId) {
  if (!state.iceQueues[peerId]) state.iceQueues[peerId] = [];
  return state.iceQueues[peerId];
}

async function flushIceQueue(pc, peerId) {
  const queued = iceQueueFor(peerId).splice(0);
  for (let i = 0; i < queued.length; i++) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(queued[i]));
    } catch (_e) {}
  }
}

async function ensurePcFor(peerId) {
  const key = String(peerId || "");
  if (!key) return null;
  if (state.pcs[key]) return state.pcs[key];
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  state.pcs[key] = pc;
  if (state.localStream) {
    state.localStream.getTracks().forEach(function (t) {
      const sent = pc.getSenders().some(function (s) {
        return s.track && s.track.id === t.id;
      });
      if (!sent) pc.addTrack(t, state.localStream);
    });
  }
  pc.ontrack = function (ev) {
    if (ev.track) bindRemoteTrackFor(key, ev.track);
    if (ev.streams && ev.streams[0]) {
      ev.streams[0].getTracks().forEach(function (t) {
        bindRemoteTrackFor(key, t);
      });
    }
  };
  pc.onicecandidate = function (ev) {
    if (!ev.candidate || !state.call) return;
    sendCallSignal("ice", ev.candidate, key).catch(function () {});
  };
  pc.onconnectionstatechange = function () {
    if (pc.connectionState === "connected") {
      $("commsCallStatus").textContent = "In call";
    }
  };
  return pc;
}

async function attachLocal(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: video ? { facingMode: "user" } : false,
  });
  state.localStream = stream;
  const local = $("commsLocalVideo");
  if (local) {
    local.srcObject = stream;
    local.muted = true;
    local.hidden = !video;
    void playVideoEl(local);
  }
  Object.keys(state.pcs).forEach(function (key) {
    const pc = state.pcs[key];
    stream.getTracks().forEach(function (t) {
      const sent = pc.getSenders().some(function (s) {
        return s.track && s.track.id === t.id;
      });
      if (!sent) pc.addTrack(t, stream);
    });
  });
}

async function offerToPeer(peerId) {
  if (!peerId || String(peerId) === String(state.me.id)) return;
  const pc = await ensurePcFor(peerId);
  if (!pc || pc.signalingState !== "stable") return;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendCallSignal("offer", offer, peerId);
}

async function processQueuedSignals() {
  const queued = state.pendingSignals.splice(0);
  for (let i = 0; i < queued.length; i++) {
    await handleSignal(queued[i].payload, queued[i].senderId);
  }
}

async function pullCallSignals() {
  const c = client();
  if (!c || !state.call) return;
  try {
    const res = await c
      .from("communication_call_signals")
      .select("id, sender_id, payload")
      .eq("call_id", state.call.id)
      .order("created_at", { ascending: true });
    const rows = res && res.data ? res.data : [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (String(row.sender_id) === String(state.me.id)) continue;
      const pl = row.payload || {};
      if (pl.type === "join") continue;
      await handleSignal(pl, row.sender_id);
    }
  } catch (_e) {}
}

async function startCall(type) {
  if (!state.open) return;
  try {
    const out = await rpc("communication_start_call", {
      p_conversation_id: state.open.conversation_id,
      p_type: type,
    });
    state.call = {
      id: out.call_id,
      type: out.type,
      role: "offerer",
      conversation_id: state.open.conversation_id,
    };
    state.pendingSignals = [];
    state.iceQueues = {};
    state.pcs = {};
    state.remoteDescSet = {};
    state.remoteStreams = {};
    state.callPeers = {};
    $("commsCallPeer").textContent =
      commsStaffLabel((itemByConversation(state.open.conversation_id) || {}).display_name) || "";
    $("commsCallStatus").textContent = "Calling...";
    setCallUi("outgoing");
    await attachLocal(type === "VIDEO");
    await sendCallSignal("join");
  } catch (err) {
    window.alert(err.message || "Could not start the call.");
    tearDownCall(true);
  }
}

async function incomingCall(row) {
  if (state.call && String(state.call.id) === String(row.id)) return;
  if (state.call) return;
  state.call = { id: row.id, type: row.type, role: "answerer", conversation_id: row.conversation_id };
  state.pendingSignals = [];
  state.iceQueues = {};
  state.pcs = {};
  state.remoteDescSet = {};
  state.remoteStreams = {};
  const it = itemByConversation(row.conversation_id);
  $("commsCallPeer").textContent = commsStaffLabel((it && it.display_name) || "Incoming call");
  $("commsCallStatus").textContent = row.type === "VIDEO" ? "Video call" : "Audio call";
  setCallUi("incoming");
}

async function acceptCall() {
  if (!state.call) return;
  try {
    await rpc("communication_call_respond", { p_call_id: state.call.id, p_action: "answer" });
    $("commsCallStatus").textContent = "Connecting...";
    setCallUi("outgoing");
    await attachLocal(state.call.type === "VIDEO");
    await sendCallSignal("join");
    await pullCallSignals();
    await processQueuedSignals();
  } catch (err) {
    window.alert(err.message || "Could not answer.");
    tearDownCall(true);
  }
}

function signalForMe(payload) {
  if (!payload) return false;
  if (payload.type === "join" || payload.type === "leave") return true;
  if (!payload.to) return true;
  return String(payload.to) === String(state.me.id);
}

async function handleSignal(payload, senderId) {
  if (!payload || !payload.type) return;
  if (!state.call) return;
  if (!signalForMe(payload)) return;
  const from = String(payload.from || senderId || "");
  if (from && from === String(state.me.id)) return;
  if (payload.type === "join") {
    if (!state.localStream) return;
    if (from) {
      state.callPeers[from] = state.callPeers[from] || "Participant";
      await offerToPeer(from);
    }
    return;
  }
  if (!state.localStream) {
    state.pendingSignals.push({ payload: payload, senderId: senderId });
    return;
  }
  try {
    if (payload.type === "leave") {
      closePeer(from);
      return;
    }
    if (!from) return;
    const pc = await ensurePcFor(from);
    if (payload.type === "offer" && payload.sdp) {
      if (state.remoteDescSet[from]) return;
      await pc.setRemoteDescription(rtcDescFromPayload(payload));
      state.remoteDescSet[from] = true;
      await flushIceQueue(pc, from);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendCallSignal("answer", answer, from);
      $("commsCallStatus").textContent = "In call";
    } else if (payload.type === "answer" && payload.sdp) {
      if (pc.signalingState !== "have-local-offer") return;
      await pc.setRemoteDescription(rtcDescFromPayload(payload));
      state.remoteDescSet[from] = true;
      await flushIceQueue(pc, from);
      $("commsCallStatus").textContent = "In call";
    } else if (payload.type === "ice" && payload.candidate) {
      if (!state.remoteDescSet[from]) {
        iceQueueFor(from).push(payload.candidate);
        return;
      }
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  } catch (_e) {}
}

function closePeer(peerId) {
  const key = String(peerId || "");
  try {
    if (state.pcs[key]) state.pcs[key].close();
  } catch (_e) {}
  delete state.pcs[key];
  delete state.iceQueues[key];
  delete state.remoteDescSet[key];
  delete state.remoteStreams[key];
  const tile = document.querySelector('.comms-remote-tile[data-peer="' + key + '"]');
  if (tile) tile.remove();
  layoutRemoteGrid();
}

async function tearDownCall(notify) {
  const callId = state.call && state.call.id;
  const isGroup = !!(state.open && state.open.kind === "group");
  const peerCount = Object.keys(state.pcs || {}).length;
  try {
    if (notify && callId) {
      const action = isGroup && peerCount >= 1 ? "leave" : "end";
      if (action === "leave") await sendCallSignal("leave");
      await rpc("communication_call_respond", { p_call_id: callId, p_action: action });
    }
  } catch (_e) {}
  try {
    if (state.localStream) state.localStream.getTracks().forEach((t) => t.stop());
  } catch (_e) {}
  Object.keys(state.pcs || {}).forEach(function (k) {
    try {
      state.pcs[k].close();
    } catch (_e2) {}
  });
  state.pcs = {};
  state.localStream = null;
  state.remoteStreams = {};
  state.call = null;
  state.pendingSignals = [];
  state.iceQueues = {};
  state.remoteDescSet = {};
  state.callPeers = {};
  const grid = $("commsRemoteGrid");
  if (grid) grid.innerHTML = "";
  $("commsCallOverlay").hidden = true;
  const local = $("commsLocalVideo");
  if (local) local.srcObject = null;
  try {
    await rpc("communication_heartbeat", { p_status: "available" });
  } catch (_e) {}
}


function bindUi() {
  $("commsBackPortal").href = portalHome();
  document.querySelectorAll("[data-comms-mode]").forEach((btn) => {
    btn.addEventListener("click", async function () {
      state.mode = btn.getAttribute("data-comms-mode");
      applyModeButtons();
      state.open = null;
      $("commsShell").classList.remove("is-chat");
      await loadInbox();
      renderThread();
    });
  });
  $("commsSidebar").addEventListener("click", function (ev) {
    const btn = ev.target.closest("[data-open-conv]");
    if (!btn) return;
    openConversation(btn.getAttribute("data-open-conv"));
  });
  $("commsMobBack").addEventListener("click", function () {
    state.open = null;
    $("commsShell").classList.remove("is-chat");
    renderThread();
    renderInbox();
  });
  $("commsComposer").addEventListener("submit", sendMessage);
  $("commsDraft").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      sendMessage();
    }
  });
  $("commsDraft").addEventListener("input", function () {
    sendTypingPing();
  });
  $("commsAttachBtn").addEventListener("click", function () {
    $("commsFile").click();
  });
  $("commsRecordBtn").addEventListener("click", function () {
    void toggleVoice();
  });
  $("commsFile").addEventListener("change", function () {
    const f = $("commsFile").files && $("commsFile").files[0];
    $("commsFile").value = "";
    if (!f) return;
    state.pendingFile = f;
    $("commsAttachBtn").textContent = "✓";
  });
  $("commsCallAudio").addEventListener("click", function () {
    startCall("AUDIO");
  });
  $("commsCallVideo").addEventListener("click", function () {
    startCall("VIDEO");
  });
  $("commsGroupManage").addEventListener("click", openGroupManage);
  $("commsNewGroupBtn").addEventListener("click", openNewGroup);
  $("commsAuditBtn").addEventListener("click", openAudit);
  $("commsSearch").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      openSearch($("commsSearch").value);
    }
  });
  $("commsModal").addEventListener("click", function (ev) {
    if (ev.target.getAttribute("data-comms-modal-close") === "1") hideModal();
    const person = ev.target.closest("[data-search-person]");
    if (person && state.me.can_act_as_administration) {
      hideModal();
      rpc("communication_open_staff_thread", { p_employee_id: person.getAttribute("data-search-person") })
        .then(async function (out) {
          await loadInbox();
          await openConversation(out.conversation_id, {
            conversation_id: out.conversation_id,
            kind: "admin_staff",
            employee_id: out.employee_id,
            display_name: out.display_name,
          });
        })
        .catch(function (err) {
          window.alert(err.message || "Could not open.");
        });
    }
    const msg = ev.target.closest("[data-search-msg]");
    if (msg) {
      hideModal();
      openConversation(msg.getAttribute("data-search-msg"));
    }
  });
  $("commsHang").addEventListener("click", function () {
    tearDownCall(true);
  });
  $("commsAnswer").addEventListener("click", acceptCall);
  $("commsReject").addEventListener("click", function () {
    tearDownCall(true);
  });
  $("commsMuteMic").addEventListener("click", function () {
    if (!state.localStream) return;
    state.localStream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
  });
  $("commsMuteCam").addEventListener("click", function () {
    if (!state.localStream) return;
    state.localStream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
  });
  $("commsThread").addEventListener("scroll", async function () {
    if ($("commsThread").scrollTop > 40 || state.loadingOlder || !state.open || !state.oldestAt) return;
    state.loadingOlder = true;
    try {
      const payload = await rpc("communication_list_messages", {
        p_conversation_id: state.open.conversation_id,
        p_before: state.oldestAt,
        p_limit: 40,
      });
      const rows = sortMessagesOldestFirst((payload && payload.messages) || []);
      if (rows.length) {
        const keep = $("commsThread").scrollHeight;
        state.messages = rows.concat(state.messages);
        state.oldestAt = state.messages[0].created_at;
        renderThread();
        $("commsThread").scrollTop = $("commsThread").scrollHeight - keep;
      }
    } catch (_e) {
    } finally {
      state.loadingOlder = false;
    }
  });
}

async function boot() {
  try {
    await bootstrapDashboardSupabase({ page: "comunicaciones" });
  } catch (e) {
    console.warn("[comunicaciones] bootstrap", e);
  }
  if (!client() || !window.__PORTAL_SUPABASE__ || !window.__PORTAL_SUPABASE__.session) {
    const login = new URL("login.html", window.location.href);
    login.searchParams.set("next", window.location.href);
    window.location.replace(login.href);
    return;
  }
  try {
    const data = await rpc("communication_bootstrap");
    state.me = data.me;
    if (state.me.can_act_as_administration) state.mode = "administration";
    $("commsMeName").textContent = state.me.full_name;
    $("commsContextSwitch").hidden = !state.me.can_act_as_administration;
    $("commsSearchWrap").hidden = !state.me.can_act_as_administration;
    $("commsNewGroupBtn").hidden = !state.me.can_manage_groups;
    $("commsAuditBtn").hidden = !state.me.can_act_as_administration;
    applyModeButtons();
    bindUi();
    $("commsCallOverlay").hidden = true;
    await loadInbox();
    renderThread();
    showShell();
    subscribeRealtime();
    rpc("communication_heartbeat", { p_status: "available" }).catch(function () {});
    window.setInterval(function () {
      rpc("communication_heartbeat", { p_status: state.call ? "in_call" : "available" }).catch(function () {});
      loadInbox().catch(function () {});
      paintTyping();
    }, 25000);
    window.setInterval(paintTyping, 1000);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        document.addEventListener(
          "pointerdown",
          function commsAskNotifyOnce() {
            document.removeEventListener("pointerdown", commsAskNotifyOnce, true);
            void Notification.requestPermission().then(function (r) {
              if (r === "granted" && typeof window.portalEnsureWebPushSubscription === "function") {
                void window.portalEnsureWebPushSubscription();
              }
            });
          },
          true
        );
      }
      if (typeof window.portalEnsureWebPushSubscription === "function") {
        void window.portalEnsureWebPushSubscription();
      }
    } catch (_p) {}
    const params = new URLSearchParams(window.location.search);
    const conv = String(params.get("conv") || "").trim();
    const callId = String(params.get("call") || "").trim();
    if (conv) {
      await openConversation(conv);
    }
    if (callId) {
      try {
        const res = await client().from("communication_calls").select("id,type,status,conversation_id,initiated_by").eq("id", callId).maybeSingle();
        const row = res && res.data;
        if (row && String(row.initiated_by) !== String(state.me.id) && (row.status === "calling" || row.status === "answered")) {
          await incomingCall(row);
          await acceptCall();
        }
      } catch (_c) {}
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (!state.open || !state.open.conversation_id) return;
      if (!shouldMarkConversationRead(state.open.conversation_id, true)) return;
      rpc("communication_mark_read", { p_conversation_id: state.open.conversation_id })
        .then(function () {
          return loadInbox();
        })
        .then(function () {
          renderInbox();
        })
        .catch(function () {});
    });
  } catch (err) {
    setBoot((err && err.message) || "Could not open Communications. Return to the portal.");
    console.warn("[comunicaciones]", err);
  }
}

window.portalLogout = portalLogout;
boot();
