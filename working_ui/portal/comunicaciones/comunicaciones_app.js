import { bootstrapDashboardSupabase, portalLogout } from "/portal/auth-handler.js?v=20260903-comms-1";

const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
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
  pendingFile: null,
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
  return d.toLocaleString("es-ES", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
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
  if (!c) throw new Error("Sin sesion");
  const { data, error } = await c.rpc(name, args || {});
  if (error) throw error;
  return data;
}

function portalHome() {
  const me = state.me || {};
  if (me.is_office_admin) return "office_portal.html";
  if (me.is_ceo) return "ceo_dashboard.html";
  return "staff_dashboard.html";
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

function renderInbox() {
  const direct = $("commsListDirect");
  const groups = $("commsListGroups");
  if (!direct || !groups) return;
  const items = state.inbox.items || [];
  const d = items.filter((it) => it.kind === "admin_staff");
  const g = items.filter((it) => it.kind === "group");
  $("commsKickerDirect").textContent = state.mode === "administration" ? "Trabajadores" : "Mis mensajes";
  direct.innerHTML = d.length
    ? d.map((it) => inboxRow(it)).join("")
    : '<p class="comms-empty">No hay conversaciones.</p>';
  groups.innerHTML = g.length
    ? g.map((it) => inboxRow(it)).join("")
    : '<p class="comms-empty">Sin grupos.</p>';
}

function inboxRow(it) {
  const on = state.open && String(state.open.conversation_id) === String(it.conversation_id) ? " is-on" : "";
  const last = it.last && it.last.body ? it.last.body : "Sin mensajes";
  const unread = Number(it.unread) || 0;
  const closed = it.status === "CLOSED" ? " (cerrado)" : "";
  return (
    '<button type="button" class="comms-item' +
    on +
    '" data-open-conv="' +
    esc(it.conversation_id) +
    '">' +
    avatarHtml(it.avatar_url, commsStaffLabel(it.display_name)) +
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
  const klass = "comms-bubble" + (mine ? " is-mine" : "") + (admin && !mine ? " is-admin" : "");
  let who = esc(m.sender_display || "");
  if (admin && m.performed_by_name) {
    who += " · enviado por " + esc(m.performed_by_name);
  }
  let body = "";
  if (m.message_type === "image" && m.storage_path) {
    body =
      '<a class="comms-file" data-file="' +
      esc(m.storage_path) +
      '" href="#"><img alt="" data-file-img="' +
      esc(m.storage_path) +
      '" /></a>';
  } else if (m.message_type === "file" && m.storage_path) {
    body =
      '<a class="comms-file" data-file="' +
      esc(m.storage_path) +
      '" href="#">' +
      esc(m.file_name || "Archivo") +
      "</a>";
  } else if (m.message_type === "call") {
    body = esc(m.body || "Llamada");
  } else {
    body = esc(m.body || "");
  }
  const read = mine ? (m.read_count > 1 || m.delivered_read ? " · leido" : " · enviado") : "";
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
    el.innerHTML = '<p class="comms-empty">Elige una conversacion a la izquierda.</p>';
    $("commsComposer").hidden = true;
    $("commsChatActions").hidden = true;
    $("commsClosedBanner").hidden = true;
    $("commsPeerName").textContent = "Selecciona una conversacion";
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
    $("commsPeerMeta").textContent = closed ? "Grupo cerrado" : "Grupo";
    $("commsDraft").placeholder = "Escribir en el grupo…";
  } else if (state.mode === "administration") {
    $("commsPeerMeta").textContent = "Conversacion con Administracion";
    $("commsDraft").placeholder = "Escribir como Administracion…";
  } else {
    $("commsPeerMeta").textContent = "Administracion";
    $("commsDraft").placeholder = "Escribir a Administracion…";
  }
  if (!state.messages.length) {
    el.innerHTML = '<p class="comms-empty">Todavia no hay mensajes. Escribe el primero.</p>';
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
        a.href = data.signedUrl;
        a.target = "_blank";
        a.rel = "noopener";
        const img = a.querySelector("[data-file-img]");
        if (img) img.src = data.signedUrl;
      }
    } catch (_e) {}
  }
}

async function loadInbox() {
  const data = await rpc("communication_inbox", { p_mode: state.mode });
  state.inbox = data || { items: [] };
  renderInbox();
}

async function openConversation(id, extra, opts) {
  const silent = !!(opts && opts.silent);
  const it = itemByConversation(id) || extra || { conversation_id: id };
  state.open = it;
  state.messages = [];
  state.oldestAt = null;
  $("commsShell").classList.add("is-chat");
  renderInbox();
  const payload = await rpc("communication_list_messages", {
    p_conversation_id: id,
    p_before: null,
    p_limit: 40,
  });
  const rows = (payload && payload.messages) || [];
  state.messages = rows.slice().reverse();
  if (state.messages[0]) state.oldestAt = state.messages[0].created_at;
  renderThread();
  try {
    await rpc("communication_mark_read", { p_conversation_id: id });
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
      if (file.size > MAX_FILE) throw new Error("El archivo supera 15 MB.");
      mime = file.type || "application/octet-stream";
      if (ALLOWED_MIME.indexOf(mime) === -1 && !String(mime).startsWith("image/")) {
        throw new Error("Tipo de archivo no permitido.");
      }
      type = String(mime).startsWith("image/") ? "image" : "file";
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
      p_body: body || name,
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
    window.alert(err.message || "No se pudo enviar.");
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
      (payload) => {
        const row = payload.new || {};
        if (!state.call || String(row.call_id) !== String(state.call.id)) return;
        if (String(row.sender_id) === String(state.me.id)) return;
        handleSignal(row.payload || {});
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
    window.alert(err.message || "No se pudo cargar el directorio.");
    return;
  }
  showModal(
    "<h2>Nuevo grupo</h2>" +
      '<label>Nombre<input id="gName" maxlength="80" /></label>' +
      '<label>Descripcion<input id="gDesc" maxlength="200" /></label>' +
      '<p class="comms-peer-meta">Participantes</p><div class="comms-pick" id="gPick">' +
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
      '<div class="comms-modal-actions"><button type="button" data-comms-modal-close="1">Cancelar</button>' +
      '<button type="button" class="comms-primary" id="gCreate">Crear</button></div>'
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
      window.alert(err.message || "No se pudo crear.");
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
    window.alert(err.message || "No se pudo cargar.");
    return;
  }
  const memberIds = new Set(members.map((x) => String(x.id)));
  showModal(
    "<h2>Participantes</h2><div class='comms-pick'>" +
      members.map((x) => "<div>" + esc(commsStaffLabel(x.full_name)) + "</div>").join("") +
      "</div><p class='comms-peer-meta'>Anadir</p><div class='comms-pick' id='gAdd'>" +
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
      "</div><p class='comms-peer-meta'>Quitar</p><div class='comms-pick' id='gDel'>" +
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
      '<div class="comms-modal-actions"><button type="button" data-comms-modal-close="1">Cerrar</button>' +
      (state.open.status === "CLOSED"
        ? ""
        : '<button type="button" id="gSave">Guardar</button><button type="button" class="comms-hang" id="gClose">Cerrar grupo</button>') +
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
        window.alert(err.message || "No se pudo actualizar.");
      }
    };
  }
  const closeBtn = $("gClose");
  if (closeBtn) {
    closeBtn.onclick = async function () {
      if (!window.confirm("Cerrar este grupo? Se conserva el historial.")) return;
      try {
        await rpc("communication_close_group", { p_group_id: state.open.group_id });
        hideModal();
        await loadInbox();
        await openConversation(state.open.conversation_id, state.open);
      } catch (err) {
        window.alert(err.message || "No se pudo cerrar.");
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
      "<h2>Busqueda</h2>" +
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
        '<div class="comms-modal-actions"><button type="button" data-comms-modal-close="1">Cerrar</button></div>'
    );
  } catch (err) {
    window.alert(err.message || "Busqueda no disponible.");
  }
}

async function openAudit() {
  try {
    const data = await rpc("communication_audit_list", { p_limit: 80 });
    const rows = (data && data.rows) || [];
    showModal(
      "<h2>Auditoria</h2><div class='comms-pick'>" +
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
        "</div><div class='comms-modal-actions'><button type='button' data-comms-modal-close='1'>Cerrar</button></div>"
    );
  } catch (err) {
    window.alert(err.message || "No se pudo cargar la auditoria.");
  }
}

function setCallUi(phase) {
  $("commsCallOverlay").hidden = false;
  $("commsAnswer").hidden = phase !== "incoming";
  $("commsReject").hidden = phase !== "incoming";
  $("commsHang").hidden = phase === "incoming";
  $("commsMuteMic").hidden = phase === "incoming";
  $("commsMuteCam").hidden = phase === "incoming" || (state.call && state.call.type !== "VIDEO");
}

async function ensurePc() {
  if (state.pc) return state.pc;
  const pc = new RTCPeerConnection({ iceServers: STUN });
  state.pc = pc;
  state.remoteStream = new MediaStream();
  $("commsRemoteVideo").srcObject = state.remoteStream;
  pc.ontrack = function (ev) {
    ev.streams[0].getTracks().forEach((t) => state.remoteStream.addTrack(t));
  };
  pc.onicecandidate = function (ev) {
    if (!ev.candidate || !state.call) return;
    rpc("communication_call_signal", {
      p_call_id: state.call.id,
      p_payload: { type: "ice", candidate: ev.candidate },
    }).catch(function () {});
  };
  return pc;
}

async function attachLocal(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: !!video,
  });
  state.localStream = stream;
  $("commsLocalVideo").srcObject = stream;
  $("commsLocalVideo").hidden = !video;
  const pc = await ensurePc();
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
}

async function startCall(type) {
  if (!state.open) return;
  try {
    const out = await rpc("communication_start_call", {
      p_conversation_id: state.open.conversation_id,
      p_type: type,
    });
    state.call = { id: out.call_id, type: out.type, role: "offerer" };
    $("commsCallPeer").textContent =
      commsStaffLabel((itemByConversation(state.open.conversation_id) || {}).display_name) || "";
    $("commsCallStatus").textContent = "Llamando…";
    setCallUi("outgoing");
    await attachLocal(type === "VIDEO");
    const pc = await ensurePc();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await rpc("communication_call_signal", {
      p_call_id: state.call.id,
      p_payload: { type: "offer", sdp: offer },
    });
  } catch (err) {
    window.alert(err.message || "No se pudo iniciar la llamada.");
    tearDownCall(true);
  }
}

async function incomingCall(row) {
  state.call = { id: row.id, type: row.type, role: "answerer", conversation_id: row.conversation_id };
  $("commsCallPeer").textContent = "Llamada entrante";
  $("commsCallStatus").textContent = row.type === "VIDEO" ? "Videollamada" : "Llamada de audio";
  setCallUi("incoming");
}

async function acceptCall() {
  if (!state.call) return;
  try {
    await rpc("communication_call_respond", { p_call_id: state.call.id, p_action: "answer" });
    $("commsCallStatus").textContent = "Conectando…";
    setCallUi("outgoing");
    await attachLocal(state.call.type === "VIDEO");
  } catch (err) {
    window.alert(err.message || "No se pudo aceptar.");
    tearDownCall(true);
  }
}

async function handleSignal(payload) {
  try {
    const pc = await ensurePc();
    if (payload.type === "offer" && payload.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await rpc("communication_call_signal", {
        p_call_id: state.call.id,
        p_payload: { type: "answer", sdp: answer },
      });
      $("commsCallStatus").textContent = "En llamada";
    } else if (payload.type === "answer" && payload.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      $("commsCallStatus").textContent = "En llamada";
    } else if (payload.type === "ice" && payload.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
    }
  } catch (_e) {}
}

async function tearDownCall(notify) {
  try {
    if (notify && state.call && state.call.id) {
      await rpc("communication_call_respond", { p_call_id: state.call.id, p_action: "end" });
    }
  } catch (_e) {}
  try {
    if (state.localStream) state.localStream.getTracks().forEach((t) => t.stop());
  } catch (_e) {}
  try {
    if (state.pc) state.pc.close();
  } catch (_e) {}
  state.pc = null;
  state.localStream = null;
  state.remoteStream = null;
  state.call = null;
  $("commsCallOverlay").hidden = true;
  $("commsRemoteVideo").srcObject = null;
  $("commsLocalVideo").srcObject = null;
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
  $("commsAttachBtn").addEventListener("click", function () {
    $("commsFile").click();
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
          window.alert(err.message || "No se pudo abrir.");
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
      const rows = ((payload && payload.messages) || []).slice().reverse();
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
    }, 25000);
  } catch (err) {
    setBoot((err && err.message) || "No se pudo abrir Comunicaciones. Vuelve al portal.");
    console.warn("[comunicaciones]", err);
  }
}

window.portalLogout = portalLogout;
boot();
