/**
 * CEO portal — direct messages (same tables as admin/staff internal chat).
 * Inboxes: staff & leads (picker) vs operations admin only (first active `app_role = admin`, no picker).
 */

function $(id) {
  return typeof document !== "undefined" ? document.getElementById(id) : null;
}

function esc(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

function portalDmCanonThreadParticipantsGuess(me, peer) {
  const m = String(me || "").trim();
  const p = String(peer || "").trim();
  const ml = m.toLowerCase();
  const pl = p.toLowerCase();
  if (ml < pl) return { participant_a: m, participant_b: p };
  if (pl < ml) return { participant_a: p, participant_b: m };
  return { participant_a: m, participant_b: p };
}

function portalDmIsCheckOrderedPairError(err) {
  if (!err) return false;
  const c = err.code;
  if (c === "23514" || c === 23514 || String(c) === "23514") return true;
  const msg = String(err.message || err.details || err.hint || "").toLowerCase();
  return msg.indexOf("check constraint") !== -1 && (msg.indexOf("ordered_pair") !== -1 || msg.indexOf("portal_staff_dm_threads_ordered") !== -1);
}

function portalDmPeerIdForThread(me, row) {
  const a = String(row && row.participant_a || "");
  const b = String(row && row.participant_b || "");
  return a === me ? b : a;
}

function ceoDmMe() {
  const box = window.__PORTAL_SUPABASE__;
  return String((box && box.staff_profile && box.staff_profile.id) || (box && box.session && box.session.user && box.session.user.id) || "").trim();
}

function ceoDmChannel() {
  return String(window.__PORTAL_CEO_DM_CHANNEL || "staff_lead").trim() === "ceo_exec" ? "ceo_exec" : "staff_lead";
}

function ceoDmShortName(row) {
  const t = String((row && (row.full_name || row.username)) || "").trim();
  if (!t) return "";
  const parts = t.split(/\s+/);
  return parts[0] || t;
}

/** Line above bubble — ops accounts show as Admin; CEOs by first name in exec lane. */
function ceoDmMsgAuthorChip(ch, mine, peerRole, authorRow) {
  if (mine) return "";
  const ar = String((authorRow && authorRow.app_role) || "").toLowerCase();
  if (ch === "ceo_exec") {
    if (ar === "admin") return "Admin";
    if (ar === "ceo") return ceoDmShortName(authorRow) || "CEO";
    return ceoDmShortName(authorRow) || "";
  }
  if (ch === "staff_lead" && (peerRole === "staff" || peerRole === "lead")) {
    if (ar === "admin" || ar === "ceo") return "Admin";
    return ceoDmShortName(authorRow) || "Team";
  }
  return ceoDmShortName(authorRow) || "";
}

function ceoDmProfileMatchesChannel(profileRow) {
  const ch = ceoDmChannel();
  const role = String(profileRow && profileRow.app_role || "").toLowerCase();
  if (ch === "staff_lead") return role === "staff" || role === "lead";
  /** CEO portal “operations admin” inbox: only threads with an admin peer (not other CEOs). */
  return role === "admin";
}

/** First active `app_role = admin` by name — single lane to the admin dashboard. */
async function ceoDmResolveOperationsAdmin() {
  const client = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
  if (!client) return null;
  const q = await client
    .from("staff_profiles")
    .select("id,full_name,username,app_role,is_active")
    .eq("app_role", "admin")
    .order("full_name", { ascending: true })
    .limit(60);
  if (q.error || !Array.isArray(q.data)) return null;
  const row = q.data.find((r) => r && r.is_active !== false);
  if (!row || !row.id) return null;
  const id = String(row.id).trim();
  const label = ((row.full_name || row.username || "").trim() || id.slice(0, 8));
  return { id, label };
}

function ceoDmPrepareStaffLeadCompose() {
  const wrap = $("ceoPortalDmPeerPickWrap");
  const stat = $("ceoPortalDmPeerStatic");
  if (wrap) wrap.hidden = false;
  if (stat) {
    stat.hidden = true;
    stat.textContent = "";
  }
  ceoDmUi().opsAdminPeerId = "";
}

async function ceoDmPrepareOpsAdminCompose() {
  const errEl = $("ceoPortalDmComposeErr");
  const wrap = $("ceoPortalDmPeerPickWrap");
  const stat = $("ceoPortalDmPeerStatic");
  const sel = $("ceoPortalDmPeerSelect");
  if (errEl) errEl.textContent = "";
  if (wrap) wrap.hidden = true;
  if (stat) stat.hidden = false;
  if (sel) {
    sel.innerHTML = "";
    sel.value = "";
  }
  ceoDmUi().opsAdminPeerId = "";
  const r = await ceoDmResolveOperationsAdmin();
  if (!r) {
    if (stat) stat.textContent = "No operations admin profile was found. Contact support.";
    if (errEl) errEl.textContent = "Cannot send: no admin account in the directory.";
    return;
  }
  ceoDmUi().opsAdminPeerId = r.id;
  if (stat) {
    stat.textContent = "You are writing to the operations admin: " + r.label + ".";
  }
}

function ceoDmUi() {
  window.__PORTAL_CEO_DM_UI = window.__PORTAL_CEO_DM_UI || { panel: "list", threadId: "" };
  return window.__PORTAL_CEO_DM_UI;
}

function ceoDmTogglePanels(panel) {
  const ui = ceoDmUi();
  ui.panel = panel;
  const L = $("ceoPortalDmListPanel");
  const C = $("ceoPortalDmComposePanel");
  const T = $("ceoPortalDmThreadPanel");
  if (L) L.hidden = panel !== "list";
  if (C) C.hidden = panel !== "compose";
  if (T) T.hidden = panel !== "thread";
}

function ceoDmPickThreadIdFromRows(rows) {
  const row0 = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return row0 && row0.id ? String(row0.id) : "";
}

function ceoDmSetOpen(open) {
  const bd = $("ceoPortalDmBackdrop");
  const sh = $("ceoPortalDmSheet");
  if (bd) {
    bd.hidden = !open;
    bd.style.display = open ? "block" : "none";
    bd.setAttribute("aria-hidden", open ? "false" : "true");
  }
  if (sh) {
    sh.hidden = !open;
    sh.style.display = open ? "flex" : "none";
    sh.setAttribute("aria-hidden", open ? "false" : "true");
  }
  try {
    document.documentElement.style.overflow = open ? "hidden" : "";
  } catch (_e) {}
}

async function ceoDmRenderList() {
  const host = $("ceoPortalDmListHost");
  const client = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
  const me = ceoDmMe();
  if (!host) return;
  if (!client || !me) {
    host.innerHTML =
      '<p style="margin:0;font-size:13px;color:var(--muted);min-width:0;overflow-wrap:break-word">Sign in to load conversations.</p>';
    return;
  }
  host.innerHTML = '<p style="margin:0;font-size:13px;color:var(--muted)">Loading…</p>';
  const res = await client
    .from("portal_staff_dm_threads")
    .select("id,participant_a,participant_b,updated_at")
    .or("participant_a.eq." + me + ",participant_b.eq." + me)
    .order("updated_at", { ascending: false });
  if (res.error) {
    host.innerHTML =
      '<p style="margin:0;font-size:13px;color:#b91c1c;min-width:0;overflow-wrap:break-word">' +
      esc(String(res.error.message || res.error)) +
      "</p>";
    return;
  }
  let rows = Array.isArray(res.data) ? res.data : [];
  if (!rows.length) {
    host.innerHTML =
      '<p style="margin:0;font-size:13px;color:var(--muted);min-width:0;overflow-wrap:break-word">No conversations yet. Use <strong>New message</strong>.</p>';
    return;
  }
  const peerIds = rows.map((r) => portalDmPeerIdForThread(me, r)).filter(Boolean);
  const names = {};
  const profBy = {};
  if (peerIds.length) {
    const pr = await client.from("staff_profiles").select("id,full_name,username,app_role").in("id", peerIds);
    if (!pr.error && Array.isArray(pr.data)) {
      pr.data.forEach((p) => {
        const id0 = String(p.id || "");
        profBy[id0] = p;
        names[id0] = ((p.full_name || p.username || "").trim() || id0.slice(0, 8));
      });
    }
  }
  rows = rows.filter((r) => {
    const pid = portalDmPeerIdForThread(me, r);
    return ceoDmProfileMatchesChannel(profBy[pid] || {});
  });
  if (!rows.length) {
    host.innerHTML =
      '<p style="margin:0;font-size:13px;color:var(--muted);min-width:0;overflow-wrap:break-word">' +
      (ceoDmChannel() === "ceo_exec"
        ? "No conversation with the operations admin yet. Use <strong>New message</strong>."
        : "No staff or lead threads yet. Start one with <strong>New message</strong>.") +
      "</p>";
    return;
  }
  host.innerHTML = "";
  rows.forEach((r) => {
    const id = String(r.id || "");
    const peer = portalDmPeerIdForThread(me, r);
    const label = names[peer] || "Chat · " + peer.slice(0, 8);
    let when = "";
    try {
      if (r.updated_at)
        when = new Date(r.updated_at).toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
    } catch (_d) {}
    const btn = document.createElement("button");
    btn.type = "button";
    btn.style.cssText =
      "display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;max-width:100%;box-sizing:border-box;text-align:left;padding:12px 14px;margin:0 0 8px;border:1px solid var(--line);border-radius:12px;background:#fff;cursor:pointer;font:inherit;min-width:0";
    btn.setAttribute("data-ceo-dm-thread", id);
    btn.innerHTML =
      '<span style="font-weight:700;color:var(--ink);min-width:0;overflow-wrap:break-word;max-width:100%">' +
      esc(label) +
      "</span>" +
      '<span style="font-size:12px;color:var(--muted)">' +
      esc(when || "Conversation") +
      "</span>";
    btn.addEventListener("click", () => {
      void ceoDmOpenThread(id);
    });
    host.appendChild(btn);
  });
}

async function ceoDmOpenThread(tid) {
  tid = String(tid || "").trim();
  if (!tid) return;
  const ui = ceoDmUi();
  ui.threadId = tid;
  ceoDmTogglePanels("thread");
  const me = ceoDmMe();
  const client = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
  const peerEl = $("ceoPortalDmThreadPeer");
  let peerLabel = "";
  if (client && me) {
    const tres = await client.from("portal_staff_dm_threads").select("participant_a,participant_b").eq("id", tid).maybeSingle();
    const peerId = portalDmPeerIdForThread(me, tres && tres.data ? tres.data : {});
    if (peerId) {
      const pr2 = await client.from("staff_profiles").select("full_name,username").eq("id", peerId).maybeSingle();
      if (!pr2.error && pr2.data) {
        peerLabel = (pr2.data.full_name || pr2.data.username || "").trim() || peerId;
      } else peerLabel = peerId;
    }
  }
  if (peerEl) peerEl.textContent = peerLabel || "Conversation";
  const inp = $("ceoPortalDmReplyBody");
  if (inp) inp.value = "";
  const errB = $("ceoPortalDmThreadErr");
  if (errB) errB.textContent = "";
  await ceoDmLoadMessages();
}

async function ceoDmLoadMessages() {
  const msgsBox = $("ceoPortalDmMsgs");
  const client = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
  const me = ceoDmMe();
  const tid = String(ceoDmUi().threadId || "").trim();
  if (!msgsBox || !client || !tid) {
    if (msgsBox) msgsBox.innerHTML = '<p style="margin:0;font-size:13px;color:var(--muted)">Not available.</p>';
    return;
  }
  msgsBox.innerHTML = '<p style="margin:0;font-size:13px;color:var(--muted)">Loading…</p>';
  const mres = await client
    .from("portal_staff_dm_messages")
    .select("id,author_id,body,created_at")
    .eq("thread_id", tid)
    .order("created_at", { ascending: true });
  if (mres.error) {
    msgsBox.innerHTML =
      '<p style="margin:0;font-size:13px;color:#b91c1c;min-width:0;overflow-wrap:break-word">' +
      esc(String(mres.error.message || mres.error)) +
      "</p>";
    return;
  }
  msgsBox.innerHTML = "";
  const arr = mres.data || [];
  const ch = ceoDmChannel();
  let peerRole = "";
  const tres0 = await client
    .from("portal_staff_dm_threads")
    .select("participant_a,participant_b")
    .eq("id", tid)
    .maybeSingle();
  const peerId0 = portalDmPeerIdForThread(me, tres0 && tres0.data ? tres0.data : {});
  if (peerId0) {
    const prp = await client.from("staff_profiles").select("app_role").eq("id", peerId0).maybeSingle();
    if (!prp.error && prp.data) peerRole = String(prp.data.app_role || "").toLowerCase();
  }
  const authorIds = [];
  arr.forEach((m) => {
    const x = String(m.author_id || "").trim();
    if (x && authorIds.indexOf(x) === -1) authorIds.push(x);
  });
  const authorBy = {};
  if (authorIds.length) {
    const ap = await client.from("staff_profiles").select("id,full_name,username,app_role").in("id", authorIds);
    if (!ap.error && Array.isArray(ap.data)) {
      ap.data.forEach((p) => {
        if (p && p.id) authorBy[String(p.id)] = p;
      });
    }
  }
  if (!arr.length) {
    const ph = document.createElement("p");
    ph.style.cssText = "margin:0;font-size:13px;color:var(--muted)";
    ph.textContent = "No messages yet.";
    msgsBox.appendChild(ph);
  } else {
    arr.forEach((m) => {
      const mine = String(m.author_id || "") === me;
      const aid = String(m.author_id || "").trim();
      const arow = authorBy[aid] || {};
      const chip = ceoDmMsgAuthorChip(ch, mine, peerRole, arow);
      const div = document.createElement("div");
      div.className = "ceo-portal-dm-msg " + (mine ? "ceo-portal-dm-msg--mine" : "ceo-portal-dm-msg--them");
      let tline = "";
      try {
        if (m.created_at)
          tline = new Date(m.created_at).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          });
      } catch (_t) {}
      const chipHtml = chip ? `<div class="ceo-portal-dm-msg-by">${esc(chip)}</div>` : "";
      div.innerHTML =
        chipHtml +
        '<div style="white-space:pre-wrap;min-width:0;overflow-wrap:break-word">' +
        esc(String(m.body || "")) +
        "</div>" +
        (tline ? '<div class="ceo-portal-dm-msg-time">' + esc(tline) + "</div>" : "");
      msgsBox.appendChild(div);
    });
  }
  msgsBox.scrollTop = msgsBox.scrollHeight;
}

async function ceoDmSendReply() {
  const client = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
  const tid = String(ceoDmUi().threadId || "").trim();
  const inp = $("ceoPortalDmReplyBody");
  const errB = $("ceoPortalDmThreadErr");
  const sendBtn = $("ceoPortalDmThreadSend");
  const body = inp ? String(inp.value || "").trim() : "";
  if (errB) errB.textContent = "";
  if (!client || !tid) {
    if (errB) errB.textContent = "Not available.";
    return;
  }
  if (!body) {
    if (errB) errB.textContent = "Enter a message.";
    return;
  }
  if (sendBtn) sendBtn.disabled = true;
  try {
    const ins = await client.from("portal_staff_dm_messages").insert([{ thread_id: tid, body }]).select("id");
    if (ins.error) throw ins.error;
    if (inp) inp.value = "";
    await ceoDmLoadMessages();
    await ceoDmRenderList();
  } catch (e) {
    if (errB) errB.textContent = String((e && e.message) || e || "Send failed");
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function ceoDmLoadPeerSelect() {
  const ch = ceoDmChannel();
  if (ch === "ceo_exec") {
    await ceoDmPrepareOpsAdminCompose();
    return;
  }
  ceoDmPrepareStaffLeadCompose();
  const sel = $("ceoPortalDmPeerSelect");
  const client = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
  const me = ceoDmMe();
  if (!sel || !client || !me) return;
  sel.innerHTML = '<option value="">Choose recipient…</option>';
  const q = await client
    .from("staff_profiles")
    .select("id,full_name,username,app_role,is_active")
    .in("app_role", ["staff", "lead"])
    .order("full_name", { ascending: true });
  if (q.error) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Could not load directory";
    sel.appendChild(o);
    return;
  }
  (q.data || []).forEach((row) => {
    if (!row || row.is_active === false) return;
    const id = String(row.id || "").trim();
    if (!id || id === me) return;
    const label = ((row.full_name || row.username || "").trim() || id.slice(0, 8)) + " · " + String(row.app_role || "");
    const o = document.createElement("option");
    o.value = id;
    o.textContent = label;
    sel.appendChild(o);
  });
}

async function ceoDmValidatePeer(peerId) {
  const client = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
  const ch = ceoDmChannel();
  const pr = await client.from("staff_profiles").select("id,app_role").eq("id", peerId).maybeSingle();
  if (pr.error || !pr.data) throw new Error("Recipient not found.");
  const role = String(pr.data.app_role || "").toLowerCase();
  if (ch === "staff_lead") {
    if (role !== "staff" && role !== "lead") throw new Error("This inbox is only for staff and leads.");
  } else if (role !== "admin") {
    throw new Error("This inbox only accepts the operations admin.");
  }
}

async function ceoDmSendFirstMessage() {
  const errEl = $("ceoPortalDmComposeErr");
  if (errEl) errEl.textContent = "";
  const client = window.__PORTAL_SUPABASE__ && window.__PORTAL_SUPABASE__.client;
  const me = ceoDmMe();
  let peer = "";
  if (ceoDmChannel() === "ceo_exec") {
    peer = String(ceoDmUi().opsAdminPeerId || "").trim();
    if (!peer) {
      await ceoDmPrepareOpsAdminCompose();
      peer = String(ceoDmUi().opsAdminPeerId || "").trim();
    }
  } else {
    peer = String($("ceoPortalDmPeerSelect") && $("ceoPortalDmPeerSelect").value || "").trim();
  }
  const body = String($("ceoPortalDmFirstBody") && $("ceoPortalDmFirstBody").value || "").trim();
  const sendBtn = $("ceoPortalDmComposeSend");
  if (!client) {
    if (errEl) errEl.textContent = "Not signed in.";
    return;
  }
  if (!me) {
    if (errEl) errEl.textContent = "Profile not loaded yet.";
    return;
  }
  if (!peer || peer === me) {
    if (errEl)
      errEl.textContent =
        ceoDmChannel() === "ceo_exec"
          ? "The operations admin account is not available. Try again later or contact support."
          : "Choose a staff or lead member.";
    return;
  }
  if (!body) {
    if (errEl) errEl.textContent = "Message cannot be empty.";
    return;
  }
  if (sendBtn) sendBtn.disabled = true;
  try {
    async function dmSelectThreadId(pa, pb) {
      const r = await client.from("portal_staff_dm_threads").select("id").eq("participant_a", pa).eq("participant_b", pb).maybeSingle();
      if (r.error) return { id: "", err: r.error };
      return { id: r.data && r.data.id ? String(r.data.id) : "", err: null };
    }
    async function dmEnsureThreadAndInsert(peerId) {
      const guess = portalDmCanonThreadParticipantsGuess(me, peerId);
      const a = guess.participant_a;
      const b = guess.participant_b;
      let q = await dmSelectThreadId(a, b);
      if (q.err) throw q.err;
      let threadId = q.id;
      if (!threadId) {
        let ins = await client.from("portal_staff_dm_threads").insert([{ participant_a: a, participant_b: b }]).select("id");
        threadId = ceoDmPickThreadIdFromRows(ins.data);
        if (!threadId && ins.error && portalDmIsCheckOrderedPairError(ins.error)) {
          ins = await client.from("portal_staff_dm_threads").insert([{ participant_a: b, participant_b: a }]).select("id");
          threadId = ceoDmPickThreadIdFromRows(ins.data);
        }
        if (!threadId) {
          const r1 = await dmSelectThreadId(a, b);
          if (r1.err) throw r1.err;
          threadId = r1.id;
        }
        if (!threadId) {
          const r2 = await dmSelectThreadId(b, a);
          if (r2.err) throw r2.err;
          threadId = r2.id;
        }
        if (!threadId && ins.error) throw ins.error;
      }
      if (!threadId) throw new Error("Could not resolve thread.");
      const msg = await client.from("portal_staff_dm_messages").insert([{ thread_id: threadId, body }]).select("id");
      if (msg.error) throw msg.error;
      return threadId;
    }
    await ceoDmValidatePeer(peer);
    const threadId = await dmEnsureThreadAndInsert(peer);
    const fb = $("ceoPortalDmFirstBody");
    if (fb) fb.value = "";
    await ceoDmOpenThread(threadId);
  } catch (e) {
    if (errEl) errEl.textContent = String((e && e.message) || e || "Send failed");
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function ceoDmOpenSheet(channel) {
  window.__PORTAL_CEO_DM_CHANNEL = channel === "ceo_exec" ? "ceo_exec" : "staff_lead";
  const title = $("ceoPortalDmTitle");
  const sub = $("ceoPortalDmSub");
  const topErr = $("ceoPortalDmTopErr");
  if (topErr) topErr.textContent = "";
  if (title) {
    title.textContent = channel === "ceo_exec" ? "Operations admin" : "Staff & leads";
  }
  if (sub) {
    sub.textContent =
      channel === "ceo_exec"
        ? "Private line to the admin dashboard team — no recipient picker."
        : "Messages with staff and session leads only.";
  }
  ceoDmUi().threadId = "";
  ceoDmTogglePanels("list");
  ceoDmSetOpen(true);
  await ceoDmRenderList();
}

function ceoDmCloseSheet() {
  ceoDmSetOpen(false);
}

function ceoDmInitRealtimeOnce() {
  try {
    if (window.__PORTAL_CEO_DM_RT_CH) return;
    const box = window.__PORTAL_SUPABASE__;
    if (!box || !box.client || typeof box.client.channel !== "function") return;
    const ch = box.client
      .channel("ceo-portal-dm-" + String(Date.now()))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "portal_staff_dm_messages" },
        () => {
          if (window.__PORTAL_CEO_DM_RT_DEB) clearTimeout(window.__PORTAL_CEO_DM_RT_DEB);
          window.__PORTAL_CEO_DM_RT_DEB = setTimeout(() => {
            window.__PORTAL_CEO_DM_RT_DEB = null;
            const sh = $("ceoPortalDmSheet");
            if (!sh || sh.hidden) return;
            const ui = ceoDmUi();
            if (ui.panel === "thread") void ceoDmLoadMessages();
            else if (ui.panel === "list") void ceoDmRenderList();
          }, 350);
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          try {
            console.warn("[portal] CEO DM realtime", status, err || "");
          } catch (_e) {}
        }
      });
    window.__PORTAL_CEO_DM_RT_CH = ch;
  } catch (e) {
    try {
      console.warn("[portal] ceoDmInitRealtimeOnce", e);
    } catch (_e2) {}
  }
}

export function mountPortalCeoDm() {
  if (typeof document === "undefined") return;
  ceoDmSetOpen(false);
  const box = window.__PORTAL_SUPABASE__;
  const role = String((box && box.staff_profile && box.staff_profile.app_role) || "").toLowerCase();
  if (role !== "ceo") {
    const b1 = $("ceoPortalDmBtnStaffLead");
    const b2 = $("ceoPortalDmBtnExec");
    if (b1) b1.hidden = true;
    if (b2) b2.hidden = true;
    ceoDmSetOpen(false);
    return;
  }

  ceoDmInitRealtimeOnce();

  const btnStaff = $("ceoPortalDmBtnStaffLead");
  const btnExec = $("ceoPortalDmBtnExec");
  if (btnStaff) btnStaff.addEventListener("click", () => void ceoDmOpenSheet("staff_lead"));
  if (btnExec) btnExec.addEventListener("click", () => void ceoDmOpenSheet("ceo_exec"));

  const closeBtn = $("ceoPortalDmClose");
  const backdrop = $("ceoPortalDmBackdrop");
  if (closeBtn) {
    closeBtn.addEventListener("click", (ev) => {
      try {
        ev.preventDefault();
        ev.stopPropagation();
      } catch (_e) {}
      ceoDmCloseSheet();
    });
  }
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) ceoDmCloseSheet();
    });
  }

  const newBtn = $("ceoPortalDmNewBtn");
  if (newBtn) {
    newBtn.addEventListener("click", () => {
      ceoDmTogglePanels("compose");
      const fb = $("ceoPortalDmFirstBody");
      if (fb) fb.value = "";
      const ce = $("ceoPortalDmComposeErr");
      if (ce) ce.textContent = "";
      if (ceoDmChannel() === "ceo_exec") void ceoDmPrepareOpsAdminCompose();
      else {
        ceoDmPrepareStaffLeadCompose();
        void ceoDmLoadPeerSelect();
      }
    });
  }
  const composeBack = $("ceoPortalDmComposeBack");
  if (composeBack) composeBack.addEventListener("click", () => {
    ceoDmTogglePanels("list");
    void ceoDmRenderList();
  });
  const composeSend = $("ceoPortalDmComposeSend");
  if (composeSend) composeSend.addEventListener("click", () => void ceoDmSendFirstMessage());

  const threadBack = $("ceoPortalDmThreadBack");
  if (threadBack) {
    threadBack.addEventListener("click", () => {
      ceoDmUi().threadId = "";
      ceoDmTogglePanels("list");
      void ceoDmRenderList();
    });
  }
  const threadSend = $("ceoPortalDmThreadSend");
  if (threadSend) threadSend.addEventListener("click", () => void ceoDmSendReply());
}
