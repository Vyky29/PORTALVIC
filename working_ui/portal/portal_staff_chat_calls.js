/**
 * Staff internal chat - in-portal voice/video calls (embedded Jitsi, no new tab).
 * Call invites are stored as text DM bodies with an embedded payload.
 */
(function (global) {
  "use strict";

  var CALL_TAG = "[[portal-staff-call:";
  var CALL_END_TAG = "[[portal-staff-call-end:";
  var CALL_TAG_END = "]]";
  /** meet.jit.si requires OAuth for moderators ? unusable in embedded iframe. */
  var JITSI_JAAS_DOMAIN = "8x8.vc";
  var JITSI_JAAS_API_SRC = "https://8x8.vc/external_api.js";
  var JITSI_FALLBACK_DOMAIN = "meet.ffmuc.net";
  var JITSI_FALLBACK_API_SRC = "https://" + JITSI_FALLBACK_DOMAIN + "/external_api.js";
  var ROOM_PREFIX = "cs-portal-";

  var callState = {
    api: null,
    shell: null,
    host: null,
    loading: false,
    apiSrc: "",
    activeSession: null,
    participants: Object.create(null),
    rosterOpen: false,
  };

  var incomingState = {
    active: false,
    payload: null,
    ringTimer: null,
    vibrateTimer: null,
    autoStopTimer: null,
    audioCtx: null,
    oscNodes: null,
    ringEl: null,
    audioPrimed: false,
    notification: null,
    overlay: null,
  };

  var INCOMING_CALL_MAX_AGE_MS = 120000;
  var incomingRowRetryMax = 8;
  var incomingHandledIds = Object.create(null);
  var threadParticipantCache = Object.create(null);

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function dmIconForKind(kind) {
    var ic = global.portalDmIcons;
    if (ic && typeof ic.forKind === "function") return ic.forKind(kind);
    return "";
  }

  function slugPart(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
  }

  function randomSuffix() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    }
    return Math.random().toString(36).slice(2, 12);
  }

  function parseCallEndPayload(body) {
    var raw = String(body || "");
    var start = raw.indexOf(CALL_END_TAG);
    if (start < 0) return null;
    var end = raw.indexOf(CALL_TAG_END, start);
    if (end < 0) return null;
    var json = raw.slice(start + CALL_END_TAG.length, end);
    try {
      var data = JSON.parse(json);
      if (!data || data.durationSec == null) return null;
      data.durationSec = Math.max(0, Math.round(Number(data.durationSec) || 0));
      data.kind = String(data.kind || "video");
      return data;
    } catch (_e) {
      return null;
    }
  }

  function formatCallDuration(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    if (sec < 60) return sec + " sec";
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    if (m < 60) return m + ":" + String(s).padStart(2, "0");
    var h = Math.floor(m / 60);
    m = m % 60;
    return h + " hr" + (m ? " " + m + " min" : "");
  }

  function formatCallEndParts(kind, durationSec) {
    var kindLabel = humanLabel(String(kind || "video"), "");
    var duration = formatCallDuration(durationSec);
    var line = kindLabel + " ended " + duration;
    return {
      kind: kindLabel,
      duration: duration,
      title: line,
      summary: line,
    };
  }

  function formatCallEndLabel(kind, durationSec) {
    return formatCallEndParts(kind, durationSec).summary;
  }

  function encodeCallEndBody(data) {
    return (
      formatCallEndLabel(data.kind, data.durationSec) +
      "\n" +
      CALL_END_TAG +
      JSON.stringify(data) +
      CALL_TAG_END
    );
  }

  function parseCallPayload(body) {
    var raw = String(body || "");
    var start = raw.indexOf(CALL_TAG);
    if (start < 0) return null;
    var end = raw.indexOf(CALL_TAG_END, start);
    if (end < 0) return null;
    var json = raw.slice(start + CALL_TAG.length, end);
    try {
      var data = JSON.parse(json);
      if (!data || !data.kind) return null;
      if (!data.room && data.url) {
        try {
          var u = new URL(String(data.url));
          var pathRoom = decodeURIComponent(u.pathname.replace(/^\//, ""));
          var slash = pathRoom.indexOf("/");
          data.room = slash >= 0 ? pathRoom.slice(slash + 1) : pathRoom;
        } catch (_u) {}
      }
      if (data.room) {
        var r = String(data.room);
        var ix = r.indexOf("/");
        if (ix >= 0) data.room = r.slice(ix + 1);
      }
      if (!data.room) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  function humanLabel(kind, title) {
    if (kind === "meeting") return title ? "Meeting: " + title : "Scheduled meeting";
    if (kind === "video") return "Video call";
    return "Voice call";
  }

  function previewText(body) {
    var endData = parseCallEndPayload(body);
    if (endData) return formatCallEndLabel(endData.kind, endData.durationSec);
    var data = parseCallPayload(body);
    if (!data) return null;
    return humanLabel(String(data.kind || ""), String(data.title || ""));
  }

  function buildRoomName(id, kind, opts) {
    opts = opts || {};
    var scope = opts.group ? "grp" : "dm";
    var key = slugPart(String(id || "thread").slice(0, 8));
    var k = slugPart(kind || "call");
    return ROOM_PREFIX + scope + "-" + key + "-" + k + "-" + randomSuffix();
  }

  function buildCallPayload(opts) {
    opts = opts || {};
    var kind = String(opts.kind || "video");
    var room = String(opts.room || "").trim();
    var ctx = getContext();
    return {
      v: 3,
      kind: kind === "meeting" ? "meeting" : kind,
      room: room,
      url: "https://" + JITSI_JAAS_DOMAIN + "/" + encodeURIComponent(room),
      title: String(opts.title || "").trim(),
      scheduledAt: opts.scheduledAt || null,
      createdAt: new Date().toISOString(),
      callerId: String(opts.callerId || authUserId() || ctx.me || "").trim(),
      callerName: String(opts.callerName || callerDisplayName()).trim(),
    };
  }

  function encodeCallBody(data) {
    var label = humanLabel(data.kind, data.title);
    return label + " - tap Join\n" + CALL_TAG + JSON.stringify(data) + CALL_TAG_END;
  }

  function formatWhen(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function authUserId() {
    if (global.portalChatActorIdentity && typeof global.portalChatActorIdentity.actorId === "function") {
      return global.portalChatActorIdentity.actorId();
    }
    var box = global.__PORTAL_SUPABASE__;
    return String(
      (box && box.session && box.session.user && box.session.user.id) ||
        (box && box.staff_profile && box.staff_profile.id) ||
        ""
    ).trim();
  }

  function isPortalAdminModerator() {
    var role = String(
      (global.__PORTAL_SUPABASE__ &&
        global.__PORTAL_SUPABASE__.staff_profile &&
        global.__PORTAL_SUPABASE__.staff_profile.app_role) ||
        ""
    ).toLowerCase();
    return role === "admin" || role === "ceo";
  }

  function dmThreadPairGuess(me, peer) {
    if (typeof global.portalDmCanonThreadParticipantsGuess === "function") {
      return global.portalDmCanonThreadParticipantsGuess(me, peer);
    }
    me = String(me || "").trim();
    peer = String(peer || "").trim();
    return me < peer
      ? { participant_a: me, participant_b: peer }
      : { participant_a: peer, participant_b: me };
  }

  async function ensureDmThreadId(client, me, peerId) {
    if (!client || !me || !peerId || peerId === me) return "";
    var guess = dmThreadPairGuess(me, peerId);
    var a = guess.participant_a;
    var b = guess.participant_b;
    function pickId(rows) {
      var row0 = Array.isArray(rows) && rows[0] ? rows[0] : null;
      return row0 && row0.id ? String(row0.id) : "";
    }
    var r = await client
      .from("portal_staff_dm_threads")
      .select("id")
      .eq("participant_a", a)
      .eq("participant_b", b)
      .maybeSingle();
    if (r.error) return "";
    var tid = r.data && r.data.id ? String(r.data.id) : "";
    if (tid) return tid;
    var ins = await client
      .from("portal_staff_dm_threads")
      .insert([{ participant_a: a, participant_b: b }])
      .select("id");
    tid = pickId(ins.data);
    if (!tid && ins.error && global.portalDmIsCheckOrderedPairError && global.portalDmIsCheckOrderedPairError(ins.error)) {
      ins = await client
        .from("portal_staff_dm_threads")
        .insert([{ participant_a: b, participant_b: a }])
        .select("id");
      tid = pickId(ins.data);
    }
    return tid;
  }

  function isCsCliqUiActive() {
    return !!(
      global.__PORTAL_CS_CLIQ_ACTIVE ||
      global.__PORTAL_CS_CLIQ_EMBED_OPEN ||
      document.getElementById("csCliqRoot")
    );
  }

  function getContext() {
    var box = global.__PORTAL_SUPABASE__;
    var adminUi = global.__PORTAL_ADMIN_DM_UI || {};
    var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
    var cliq = isCsCliqUiActive();
    var threadId = "";
    var groupId = "";
    var peerLabel = "";
    if (cliq) {
      threadId = String(adminUi.threadId || "").trim();
      groupId = String(adminUi.groupId || "").trim();
      peerLabel = String(adminUi.peerLabel || "").trim();
    } else {
      threadId = String(ui.threadId || "").trim();
      groupId = String(adminUi.groupId || "").trim();
      peerLabel = String(ui.peerLabel || adminUi.peerLabel || "").trim();
    }
    if (groupId) threadId = "";
    return {
      client: box && box.client,
      threadId: threadId,
      groupId: groupId,
      me: authUserId(),
      peerLabel: peerLabel,
    };
  }

  async function isIncomingDmForMe(row) {
    var me = meUserId();
    if (!me || !row) return false;
    var tid = String(row.thread_id || "").trim();
    if (!tid) return false;
    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    if (!client) return false;
    var cached = threadParticipantCache[tid];
    if (cached && Date.now() - cached.ts < 120000) {
      return cached.a === me || cached.b === me;
    }
    try {
      var res = await client
        .from("portal_staff_dm_threads")
        .select("participant_a,participant_b")
        .eq("id", tid)
        .maybeSingle();
      if (res.error || !res.data) return false;
      var a = String(res.data.participant_a || "");
      var b = String(res.data.participant_b || "");
      threadParticipantCache[tid] = { a: a, b: b, ts: Date.now() };
      return a === me || b === me;
    } catch (_part) {
      return false;
    }
  }

  async function refreshThreadAfterCall() {
    if (typeof global.__PORTAL_DM_REFRESH_THREAD === "function") {
      try {
        await global.__PORTAL_DM_REFRESH_THREAD();
        return;
      } catch (_adm) {}
    }
    if (typeof global.portalRenderInternalChatSheet === "function") {
      await global.portalRenderInternalChatSheet();
    }
  }

  function shortDisplayName(value) {
    var t = String(value == null ? "" : value).trim();
    if (!t) return "";
    var parts = t.split(/\s+/).filter(Boolean);
    return parts[0] || t;
  }

  function callerDisplayName() {
    if (global.portalChatActorIdentity && typeof global.portalChatActorIdentity.displayName === "function") {
      return global.portalChatActorIdentity.displayName();
    }
    var box = global.__PORTAL_SUPABASE__;
    var sessionId = authUserId();
    var p = box && box.staff_profile;
    var nm = "";
    if (p && sessionId && String(p.id || "") === String(sessionId)) {
      nm = shortDisplayName(p.full_name || p.username);
      if (nm) return nm;
    }
    var email = box && box.session && box.session.user && box.session.user.email;
    if (email) {
      var local = String(email).split("@")[0] || "";
      local = local.replace(/[._+-]+/g, " ").trim();
      nm = shortDisplayName(local);
      if (nm) return nm;
    }
    try {
      nm = shortDisplayName(global.dashboardData && global.dashboardData.staffName);
    } catch (_d) {}
    return nm || "Staff";
  }

  async function resolveCallerIdentity(client) {
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.resolveCallerIdentity === "function"
    ) {
      return global.portalChatActorIdentity.resolveCallerIdentity(client);
    }
    var uid = authUserId();
    var name = callerDisplayName();
    if (client && uid) {
      try {
        var res = await client
          .from("staff_profiles")
          .select("full_name,username")
          .eq("id", uid)
          .maybeSingle();
        if (res.data) name = incomingCallerLabelFromProfile(res.data);
      } catch (_e) {}
    }
    return { id: uid, name: name };
  }

  function incomingCallerLabelFromProfile(prof) {
    if (!prof) return "Team chat";
    var nm = shortDisplayName(prof.full_name || prof.username);
    return nm || "Team chat";
  }

  function isOwnCallAuthor(authorId) {
    if (global.portalChatActorIdentity && typeof global.portalChatActorIdentity.isSelfUserId === "function") {
      return global.portalChatActorIdentity.isSelfUserId(authorId);
    }
    authorId = String(authorId || "").trim().toLowerCase();
    if (!authorId) return false;
    var me = authUserId().toLowerCase();
    if (me && me === authorId) return true;
    var box = global.__PORTAL_SUPABASE__;
    var profId = box && box.staff_profile && box.staff_profile.id;
    return !!(profId && String(profId).trim().toLowerCase() === authorId);
  }

  function injectStyles() {
    if (document.getElementById("portal-inapp-call-styles")) return;
    var st = document.createElement("style");
    st.id = "portal-inapp-call-styles";
    st.textContent =
      "body.portal-inapp-call-open{overflow:hidden}" +
      ".portal-inapp-call-shell{position:fixed;inset:0;z-index:12050;display:flex;flex-direction:column;background:#0f172a;color:#fff}" +
      ".portal-inapp-call-shell[hidden]{display:none!important}" +
      ".portal-inapp-call-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:max(10px,env(safe-area-inset-top)) 14px 10px;background:linear-gradient(180deg,#173247,#0f2435);border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0}" +
      ".portal-inapp-call-title{font-size:15px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".portal-inapp-call-actions{display:flex;gap:8px;flex-shrink:0;align-items:center}" +
      ".portal-inapp-call-flip{padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}" +
      ".portal-inapp-call-flip[hidden]{display:none!important}" +
      ".portal-inapp-call-leave{flex-shrink:0;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(220,38,38,.92);color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}" +
      ".portal-inapp-call-leave:hover{filter:brightness(1.05)}" +
      ".portal-inapp-call-host{flex:1;min-height:0;position:relative;background:#000}" +
      ".portal-inapp-call-host iframe{border:0;width:100%!important;height:100%!important}" +
      ".portal-inapp-call-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;color:rgba(255,255,255,.85);background:#0f172a;z-index:2}" +
      ".portal-inapp-call-loading[hidden]{display:none!important}" +
      ".portal-incoming-call{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));background:rgba(5,12,20,.94);backdrop-filter:blur(10px)}" +
      ".portal-incoming-call[hidden]{display:none!important}" +
      "body.portal-incoming-call-active{overflow:hidden}" +
      ".portal-incoming-call__card{width:100%;max-width:24rem;padding:28px 22px 22px;border-radius:24px;background:linear-gradient(165deg,#173247,#0c1f2e);border:1px solid rgba(255,255,255,.16);box-shadow:0 24px 64px rgba(0,0,0,.55);color:#fff;text-align:center;animation:portalIncomingPulse .9s ease-in-out infinite alternate}" +
      "@keyframes portalIncomingPulse{from{transform:scale(1)}to{transform:scale(1.02)}}" +
      ".portal-incoming-call__icon{display:flex;align-items:center;justify-content:center;color:#5a9fc4;margin:0 0 12px}" +
      ".portal-incoming-call__title{margin:0 0 6px;font-size:18px;font-weight:800}" +
      ".portal-incoming-call__sub{margin:0 0 16px;font-size:14px;color:rgba(255,255,255,.78)}" +
      ".portal-incoming-call__actions{display:flex;gap:10px}" +
      ".portal-incoming-call__btn{flex:1;padding:12px 10px;border-radius:999px;border:0;font:inherit;font-size:14px;font-weight:800;cursor:pointer}" +
      ".portal-incoming-call__btn--decline{background:rgba(255,255,255,.12);color:#fff}" +
      ".portal-incoming-call__btn--answer{background:#16a34a;color:#fff}" +
      ".portal-dm-call-end-row{display:flex;justify-content:center;width:100%;padding:6px 12px;box-sizing:border-box}" +
      ".portal-dm-call-end{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;max-width:min(100%,22rem);padding:8px 14px;border-radius:14px;background:rgba(23,50,71,.07);border:1px solid rgba(23,50,71,.08);color:#667781;font-size:12px;line-height:1.35;text-align:left;min-width:0}" +
      ".portal-dm-call-end-icon{display:inline-flex;align-items:center;justify-content:center;color:#64748b;flex-shrink:0}" +
      ".portal-dm-call-end-copy{display:inline;min-width:0;font-size:12px;font-weight:700;color:#334155;overflow-wrap:break-word}" +
      ".portal-dm-call-end-title{font-size:12px;font-weight:700;color:#334155;overflow-wrap:break-word}" +
      ".portal-dm-call-end-dur{font-size:12px;font-weight:600;color:#64748b;letter-spacing:.02em}" +
      ".portal-inapp-call-manage{padding:8px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}" +
      ".portal-inapp-call-manage[hidden]{display:none!important}" +
      ".portal-inapp-call-roster{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:rgba(15,23,42,.97);padding:12px 14px max(12px,env(safe-area-inset-bottom));box-sizing:border-box}" +
      ".portal-inapp-call-roster[hidden]{display:none!important}" +
      ".portal-inapp-call-roster__head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;min-width:0}" +
      ".portal-inapp-call-roster__title{font-size:15px;font-weight:800;min-width:0;overflow-wrap:break-word}" +
      ".portal-inapp-call-roster__close{padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font:inherit;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0}" +
      ".portal-inapp-call-roster__section{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.65);margin:8px 0 6px}" +
      ".portal-inapp-call-roster__list{display:flex;flex-direction:column;gap:6px;overflow:auto;min-height:0;flex:1}" +
      ".portal-inapp-call-roster__row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06);min-width:0}" +
      ".portal-inapp-call-roster__name{font-size:13px;font-weight:600;min-width:0;overflow-wrap:break-word;flex:1}" +
      ".portal-inapp-call-roster__btn{padding:6px 10px;border-radius:999px;border:0;font:inherit;font-size:12px;font-weight:700;cursor:pointer;flex-shrink:0}" +
      ".portal-inapp-call-roster__btn--invite{background:#2563eb;color:#fff}" +
      ".portal-inapp-call-roster__btn--kick{background:#dc2626;color:#fff}";
    document.head.appendChild(st);
  }

  function meUserId() {
    return authUserId();
  }

  function isInActiveCall() {
    var shell = callState.shell || document.getElementById("portalInAppCallShell");
    return !!(shell && !shell.hidden);
  }

  function isRecentLiveCall(data, row) {
    if (!data || data.scheduledAt) return false;
    if (!row || !row.created_at) return true;
    try {
      return Date.now() - new Date(row.created_at).getTime() <= INCOMING_CALL_MAX_AGE_MS;
    } catch (_e) {
      return true;
    }
  }

  function fetchIncomingRowForRetry(row, attempt, cb) {
    attempt = attempt || 0;
    cb = typeof cb === "function" ? cb : function () {};
    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    if (!client || !row || !row.id) {
      cb(null);
      return;
    }
    var table = row.group_id ? "portal_ceo_group_message" : "portal_staff_dm_messages";
    var select =
      table === "portal_ceo_group_message"
        ? "id,author_id,body,group_id,created_at"
        : "id,author_id,body,thread_id,created_at";
    client
      .from(table)
      .select(select)
      .eq("id", row.id)
      .maybeSingle()
      .then(function (res) {
        cb(res && res.data ? res.data : null);
      })
      .catch(function () {
        cb(null);
      });
  }

  function applyJitsiIframeAllow(host) {
    if (!host) return;
    function apply() {
      var iframe = host.querySelector("iframe");
      if (!iframe) return;
      iframe.setAttribute(
        "allow",
        "camera; microphone; display-capture; autoplay; fullscreen; clipboard-write"
      );
      iframe.setAttribute("allowfullscreen", "true");
    }
    apply();
    try {
      var obs = new MutationObserver(apply);
      obs.observe(host, { childList: true, subtree: true });
      setTimeout(function () {
        try {
          obs.disconnect();
        } catch (_d) {}
      }, 20000);
    } catch (_o) {}
  }

  function stopIncomingRingtone() {
    if (incomingState.ringTimer) {
      clearInterval(incomingState.ringTimer);
      incomingState.ringTimer = null;
    }
    if (incomingState.vibrateTimer) {
      clearInterval(incomingState.vibrateTimer);
      incomingState.vibrateTimer = null;
    }
    if (incomingState.autoStopTimer) {
      clearTimeout(incomingState.autoStopTimer);
      incomingState.autoStopTimer = null;
    }
    try {
      if (incomingState.oscNodes) {
        incomingState.oscNodes.forEach(function (n) {
          try {
            if (n.stop) n.stop();
            if (n.disconnect) n.disconnect();
          } catch (_s) {}
        });
      }
    } catch (_o) {}
    incomingState.oscNodes = null;
    try {
      if (incomingState.audioCtx && incomingState.audioCtx.state !== "closed") {
        void incomingState.audioCtx.close();
      }
    } catch (_c) {}
    incomingState.audioCtx = null;
    try {
      if (incomingState.notification) incomingState.notification.close();
    } catch (_n) {}
    incomingState.notification = null;
    try {
      if (incomingState.ringEl) {
        incomingState.ringEl.pause();
        incomingState.ringEl.currentTime = 0;
      }
    } catch (_re) {}
    try {
      if (navigator.vibrate) navigator.vibrate(0);
    } catch (_v) {}
    try {
      document.body.classList.remove("portal-incoming-call-active");
    } catch (_b) {}
  }

  function hideIncomingCallOverlay() {
    stopIncomingRingtone();
    incomingState.active = false;
    incomingState.payload = null;
    var ov = incomingState.overlay || document.getElementById("portalIncomingCallOverlay");
    if (ov) ov.hidden = true;
  }

  /** Unlock ring audio after a user tap (required on iOS). Call from Continue / first interaction. */
  function primeCallRingAudio() {
    if (incomingState.audioPrimed) return;
    incomingState.audioPrimed = true;
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (Ctx && !incomingState.audioCtx) {
        incomingState.audioCtx = new Ctx();
        void incomingState.audioCtx.resume();
      }
    } catch (_c) {}
    playIncomingRingtoneWebAudio(true);
  }

  function playIncomingRingtoneWebAudio(silentPrime) {
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      var ctx = incomingState.audioCtx || new Ctx();
      incomingState.audioCtx = ctx;
      var gain = ctx.createGain();
      gain.gain.value = 0.22;
      gain.connect(ctx.destination);

      function beep(freq, start, dur) {
        var osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + dur);
        if (!incomingState.oscNodes) incomingState.oscNodes = [];
        incomingState.oscNodes.push(osc);
      }

      function pattern() {
        if (!silentPrime && !incomingState.active) return;
        if (!incomingState.audioCtx) return;
        var t = ctx.currentTime;
        var vol = silentPrime ? 0.001 : 0.28;
        gain.gain.value = vol;
        beep(523.25, t, 0.18);
        beep(659.25, t + 0.22, 0.18);
        beep(783.99, t + 0.44, 0.24);
      }

      if (ctx.state === "suspended") {
        void ctx.resume().then(pattern).catch(function () {});
      } else {
        pattern();
      }
      if (!silentPrime) {
        incomingState.ringTimer = setInterval(pattern, 2200);
      }
    } catch (_e) {}
  }

  function playIncomingRingtone() {
    playIncomingRingtoneWebAudio(false);
  }

  function ensureIncomingCallOverlay() {
    injectStyles();
    if (incomingState.overlay) return incomingState.overlay;
    var ov = document.getElementById("portalIncomingCallOverlay");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "portalIncomingCallOverlay";
      ov.className = "portal-incoming-call";
      ov.hidden = true;
      ov.setAttribute("role", "alertdialog");
      ov.setAttribute("aria-modal", "true");
      ov.setAttribute("aria-label", "Incoming call");
      ov.innerHTML =
        '<div class="portal-incoming-call__card">' +
        '<div class="portal-incoming-call__icon" id="portalIncomingCallIcon" aria-hidden="true"></div>' +
        '<h2 class="portal-incoming-call__title" id="portalIncomingCallTitle">Incoming call</h2>' +
        '<p class="portal-incoming-call__sub" id="portalIncomingCallSub">Team chat</p>' +
        '<div class="portal-incoming-call__actions">' +
        '<button type="button" class="portal-incoming-call__btn portal-incoming-call__btn--decline" id="portalIncomingCallDecline">Decline</button>' +
        '<button type="button" class="portal-incoming-call__btn portal-incoming-call__btn--answer" id="portalIncomingCallAnswer">Answer</button>' +
        "</div></div>";
      document.body.appendChild(ov);
      var decline = ov.querySelector("#portalIncomingCallDecline");
      var answer = ov.querySelector("#portalIncomingCallAnswer");
      if (decline) {
        decline.addEventListener("click", function () {
          hideIncomingCallOverlay();
        });
      }
      if (answer) {
        answer.addEventListener("click", function () {
          answerIncomingCall();
        });
      }
    }
    incomingState.overlay = ov;
    return ov;
  }

  function resolveIncomingCallerLabel(row, data, cb) {
    cb = typeof cb === "function" ? cb : function () {};
    data = data || parseCallPayload(row && row.body);

    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    var authorId = String((row && row.author_id) || "").trim();
    if (!authorId && data) authorId = String(data.callerId || "").trim();

    function fallbackName() {
      if (data && data.callerName) {
        cb(shortDisplayName(data.callerName) || String(data.callerName).trim());
        return;
      }
      cb("Team chat");
    }

    if (
      data &&
      data.callerName &&
      authorId &&
      String(data.callerId || "").trim() === authorId
    ) {
      cb(shortDisplayName(data.callerName) || String(data.callerName).trim());
      return;
    }

    if (!client || !authorId) {
      fallbackName();
      return;
    }

    client
      .from("staff_profiles")
      .select("full_name,username,app_role,staff_role")
      .eq("id", authorId)
      .maybeSingle()
      .then(function (res) {
        if (res && res.data) {
          cb(incomingCallerLabelFromProfile(res.data));
          return;
        }
        fallbackName();
      })
      .catch(function () {
        fallbackName();
      });
  }

  function showIncomingCallNotification(kind, callerLabel) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      if (incomingState.notification) incomingState.notification.close();
    } catch (_c) {}
    try {
      incomingState.notification = new Notification(
        kind === "video" ? "Incoming video call" : "Incoming voice call",
        {
          body: String(callerLabel || "Team chat") + " ? tap to answer",
          tag: "portal-incoming-call",
          requireInteraction: true,
          silent: false,
        }
      );
      incomingState.notification.onclick = function () {
        try {
          global.focus();
        } catch (_f) {}
        answerIncomingCall();
      };
    } catch (_n) {}
  }

  function processIncomingCallRow(row, attempt) {
    if (!row) return;
    attempt = attempt || 0;
    var me = meUserId();
    if (!me) {
      if (attempt < incomingRowRetryMax) {
        setTimeout(function () {
          processIncomingCallRow(row, attempt + 1);
        }, 400);
      }
      return;
    }
    if (isOwnCallAuthor(row.author_id)) return;
    if (isInActiveCall()) return;

    var body = String(row.body || "");
    var data = parseCallPayload(body);
    if (data && data.callerId && isOwnCallAuthor(data.callerId)) return;
    if (!data) {
      if (!row.id || attempt >= incomingRowRetryMax) return;
      fetchIncomingRowForRetry(row, attempt, function (full) {
        if (full) processIncomingCallRow(full, incomingRowRetryMax);
      });
      return;
    }
    if (!isRecentLiveCall(data, row)) return;
    var rowId = row.id ? String(row.id) : "";
    if (rowId && incomingHandledIds[rowId]) return;
    var tid = row.thread_id ? String(row.thread_id).trim() : "";
    void (async function () {
      if (tid) {
        var mine = await isIncomingDmForMe(row);
        if (!mine) return;
      }
      if (isInActiveCall()) return;
      if (rowId && incomingHandledIds[rowId]) return;
      if (rowId) incomingHandledIds[rowId] = true;
      startIncomingCallAlert(data, row);
    })();
  }

  function startIncomingCallAlert(data, row) {
    if (!data || !data.room) return;
    if (data.scheduledAt) return;
    var kind = String(data.kind || "video");
    hideIncomingCallOverlay();
    incomingState.active = true;
    incomingState.payload = data;

    var ov = ensureIncomingCallOverlay();
    var icon = ov.querySelector("#portalIncomingCallIcon");
    var title = ov.querySelector("#portalIncomingCallTitle");
    var sub = ov.querySelector("#portalIncomingCallSub");
    var label = "Team chat";
    if (icon) icon.innerHTML = dmIconForKind(kind);
    if (title) {
      title.textContent = kind === "video" ? "Incoming video call" : "Incoming voice call";
    }
    if (sub) sub.textContent = label;
    resolveIncomingCallerLabel(row, data, function (nm) {
      if (!incomingState.active) return;
      if (sub) sub.textContent = nm;
      showIncomingCallNotification(kind, nm);
    });
    try {
      document.body.appendChild(ov);
    } catch (_mv) {}
    ov.hidden = false;
    document.body.classList.add("portal-incoming-call-active");

    try {
      if (typeof global.focus === "function") global.focus();
    } catch (_f) {}

    if (navigator.vibrate) {
      navigator.vibrate([500, 180, 500, 180, 700]);
      incomingState.vibrateTimer = setInterval(function () {
        if (incomingState.active) navigator.vibrate([500, 180, 500, 180, 700]);
      }, 2400);
    }

    playIncomingRingtone();
    incomingState.autoStopTimer = setTimeout(hideIncomingCallOverlay, 50000);
  }

  function answerIncomingCall() {
    var data = incomingState.payload;
    hideIncomingCallOverlay();
    if (!data) return;
    openCallFromPayload(data);
  }

  function onDmMessageInsert(row) {
    processIncomingCallRow(row, 0);
  }

  function onGroupMessageInsert(row) {
    processIncomingCallRow(row, 0);
  }

  function bindCallLayout(api, audioOnly) {
    if (!api || !api.addListener || audioOnly) return;
    api.addListener("videoConferenceJoined", function () {
      try {
        api.executeCommand("setTileView", false);
      } catch (_tv) {}
    });
    api.addListener("participantJoined", function () {
      try {
        api.executeCommand("setTileView", false);
      } catch (_tv) {}
    });
  }

  function flipCallCamera() {
    var api = callState.api;
    if (!api) return;
    try {
      api.executeCommand("toggleCamera");
      return;
    } catch (_a) {}
    try {
      api.executeCommand("toggle-camera");
    } catch (_b) {}
  }

  function syncCallFlipButton(audioOnly) {
    var btn = document.getElementById("portalInAppCallFlip");
    if (!btn) return;
    btn.hidden = !!audioOnly;
  }

  function ensureCallShell() {
    injectStyles();
    if (callState.shell && callState.host) return callState.shell;

    var shell = document.createElement("div");
    shell.id = "portalInAppCallShell";
    shell.className = "portal-inapp-call-shell";
    shell.hidden = true;
    shell.setAttribute("role", "dialog");
    shell.setAttribute("aria-modal", "true");
    shell.setAttribute("aria-label", "In-portal call");
    shell.innerHTML =
      '<div class="portal-inapp-call-head">' +
      '<span class="portal-inapp-call-title" id="portalInAppCallTitle">Call</span>' +
      '<div class="portal-inapp-call-actions">' +
      '<button type="button" class="portal-inapp-call-manage" id="portalInAppCallManage" hidden title="Add or remove people">People</button>' +
      '<button type="button" class="portal-inapp-call-flip" id="portalInAppCallFlip" hidden title="Switch camera">Flip</button>' +
      '<button type="button" class="portal-inapp-call-leave" id="portalInAppCallLeave">Leave</button>' +
      "</div></div>" +
      '<div class="portal-inapp-call-host" id="portalInAppCallHost">' +
      '<div class="portal-inapp-call-loading" id="portalInAppCallLoading">Connecting...</div>' +
      '<div class="portal-inapp-call-roster" id="portalInAppCallRoster" hidden aria-hidden="true">' +
      '<div class="portal-inapp-call-roster__head">' +
      '<span class="portal-inapp-call-roster__title">People on this call</span>' +
      '<button type="button" class="portal-inapp-call-roster__close" id="portalInAppCallRosterClose">Done</button>' +
      "</div>" +
      '<p class="portal-inapp-call-roster__section">In the call now</p>' +
      '<div class="portal-inapp-call-roster__list" id="portalInAppCallRosterLive"></div>' +
      '<p class="portal-inapp-call-roster__section">Invite staff or lead</p>' +
      '<div class="portal-inapp-call-roster__list" id="portalInAppCallRosterInvite"></div>' +
      "</div></div>";

    document.body.appendChild(shell);
    callState.shell = shell;
    callState.host = shell.querySelector("#portalInAppCallHost");

    var leaveBtn = shell.querySelector("#portalInAppCallLeave");
    if (leaveBtn) {
      leaveBtn.addEventListener("click", function () {
        closeInAppCall();
      });
    }
    var flipBtn = shell.querySelector("#portalInAppCallFlip");
    if (flipBtn) {
      flipBtn.addEventListener("click", function () {
        flipCallCamera();
      });
    }
    var manageBtn = shell.querySelector("#portalInAppCallManage");
    if (manageBtn) {
      manageBtn.addEventListener("click", function () {
        void toggleCallRoster(true);
      });
    }
    var rosterClose = shell.querySelector("#portalInAppCallRosterClose");
    if (rosterClose) {
      rosterClose.addEventListener("click", function () {
        toggleCallRoster(false);
      });
    }

    if (!shell.dataset.portalEscBound) {
      shell.dataset.portalEscBound = "1";
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && shell && !shell.hidden) closeInAppCall();
      });
    }

    return shell;
  }

  function syncCallManageButton() {
    var btn = document.getElementById("portalInAppCallManage");
    if (!btn) return;
    var show = isPortalAdminModerator() && !!callState.activeSession;
    btn.hidden = !show;
  }

  function toggleCallRoster(open) {
    var panel = document.getElementById("portalInAppCallRoster");
    if (!panel) return;
    callState.rosterOpen = !!open;
    panel.hidden = !open;
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) void renderCallRosterPanel();
  }

  function renderCallRosterLiveList() {
    var host = document.getElementById("portalInAppCallRosterLive");
    if (!host) return;
    host.innerHTML = "";
    var ids = Object.keys(callState.participants || {});
    if (!ids.length) {
      host.innerHTML =
        '<p class="muted" style="margin:0;font-size:13px;color:rgba(255,255,255,.7);min-width:0;overflow-wrap:break-word">Waiting for people to join?</p>';
      return;
    }
    ids.forEach(function (pid) {
      var p = callState.participants[pid] || {};
      var row = document.createElement("div");
      row.className = "portal-inapp-call-roster__row";
      var nm = document.createElement("span");
      nm.className = "portal-inapp-call-roster__name";
      nm.textContent = String(p.displayName || "Guest");
      row.appendChild(nm);
      if (pid && pid !== "local" && isPortalAdminModerator()) {
        var kick = document.createElement("button");
        kick.type = "button";
        kick.className = "portal-inapp-call-roster__btn portal-inapp-call-roster__btn--kick";
        kick.textContent = "Remove";
        kick.addEventListener("click", function () {
          try {
            if (callState.api) callState.api.executeCommand("kickParticipant", pid);
          } catch (_k) {}
        });
        row.appendChild(kick);
      }
      host.appendChild(row);
    });
  }

  async function renderCallRosterInviteList() {
    var host = document.getElementById("portalInAppCallRosterInvite");
    if (!host) return;
    host.innerHTML =
      '<p class="muted" style="margin:0;font-size:13px;color:rgba(255,255,255,.7);min-width:0">Loading?</p>';
    var session = callState.activeSession;
    if (!session || !session.room) {
      host.textContent = "No active call.";
      return;
    }
    var ctx = getContext();
    if (!ctx.client) {
      host.textContent = "Not signed in.";
      return;
    }
    var me = authUserId();
    var ui = global.window && global.window.__PORTAL_ADMIN_DM_UI;
    var leadsOnly =
      ui && String(ui.groupSlug || "").trim() === "session_leads";
    var res = leadsOnly
      ? await ctx.client
          .from("staff_profiles")
          .select("id,full_name,username,app_role,is_active")
          .eq("app_role", "lead")
          .or("is_active.is.null,is_active.eq.true")
          .order("full_name", { ascending: true })
          .limit(200)
      : await ctx.client
          .from("staff_profiles")
          .select("id,full_name,username,app_role,is_active")
          .in("app_role", ["staff", "lead"])
          .or("is_active.is.null,is_active.eq.true")
          .order("full_name", { ascending: true })
          .limit(200);
    if (res.error || !Array.isArray(res.data)) {
      host.textContent = "Could not load directory.";
      return;
    }
    host.innerHTML = "";
    res.data.forEach(function (row) {
      if (!row || !row.id) return;
      var id = String(row.id);
      if (me && id === me) return;
      var label = String(row.full_name || row.username || id.slice(0, 8)).trim();
      var item = document.createElement("div");
      item.className = "portal-inapp-call-roster__row";
      var nm = document.createElement("span");
      nm.className = "portal-inapp-call-roster__name";
      nm.textContent = label;
      item.appendChild(nm);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "portal-inapp-call-roster__btn portal-inapp-call-roster__btn--invite";
      btn.textContent = "Invite";
      btn.addEventListener("click", function () {
        btn.disabled = true;
        btn.textContent = "Sending?";
        void inviteWorkerToActiveCall(id, session).finally(function () {
          btn.disabled = false;
          btn.textContent = "Invite";
        });
      });
      host.appendChild(item);
    });
    if (!host.children.length) {
      host.innerHTML =
        '<p class="muted" style="margin:0;font-size:13px;color:rgba(255,255,255,.7);min-width:0">No staff or leads found.</p>';
    }
  }

  async function renderCallRosterPanel() {
    renderCallRosterLiveList();
    await renderCallRosterInviteList();
  }

  async function inviteWorkerToActiveCall(workerId, session) {
    session = session || callState.activeSession;
    if (!session || !session.room) throw new Error("No active call.");
    var ctx = getContext();
    var me = authUserId();
    if (!ctx.client || !me) throw new Error("Not signed in.");
    workerId = String(workerId || "").trim();
    if (!workerId || workerId === me) throw new Error("Invalid recipient.");
    var tid = await ensureDmThreadId(ctx.client, me, workerId);
    if (!tid) throw new Error("Could not open chat.");
    var caller = await resolveCallerIdentity(ctx.client);
    var payload = buildCallPayload({
      kind: session.kind || "video",
      room: session.room,
      title: "",
      scheduledAt: null,
      callerId: caller.id,
      callerName: caller.name,
    });
    var body = encodeCallBody(payload);
    var ins = await ctx.client
      .from("portal_staff_dm_messages")
      .insert([{ thread_id: tid, author_id: caller.id, body: body, message_type: "text" }])
      .select("id");
    if (ins.error) throw ins.error;
    if (session.groupId) {
      await ctx.client
        .from("portal_ceo_group_message")
        .insert([
          {
            group_id: session.groupId,
            author_id: caller.id,
            body: body,
            message_type: "text",
          },
        ]);
    }
  }

  function stripRoomSlug(room) {
    room = String(room || "").trim();
    var ix = room.indexOf("/");
    return ix >= 0 ? room.slice(ix + 1) : room;
  }

  async function resolveCallSession(room, opts) {
    opts = opts || {};
    room = stripRoomSlug(room);
    var displayName = callerDisplayName();
    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;

    if (client && typeof client.functions.invoke === "function") {
      try {
        var res = await client.functions.invoke("portal-jitsi-jaas-token", {
          body: {
            room: room,
            displayName: displayName,
            moderator: true,
          },
        });
        var data = res && res.data;
        if (data && data.ok && data.jwt && data.roomName) {
          return {
            domain: String(data.domain || JITSI_JAAS_DOMAIN),
            roomName: String(data.roomName),
            jwt: String(data.jwt),
            apiSrc: "https://" + String(data.domain || JITSI_JAAS_DOMAIN) + "/external_api.js",
            backend: "jaas",
          };
        }
      } catch (_jaas) {}
    }

    return {
      domain: JITSI_FALLBACK_DOMAIN,
      roomName: room,
      jwt: null,
      apiSrc: JITSI_FALLBACK_API_SRC,
      backend: "community",
    };
  }

  function loadJitsiApi(apiSrc) {
    apiSrc = String(apiSrc || JITSI_JAAS_API_SRC).trim();
    if (global.JitsiMeetExternalAPI && callState.apiSrc === apiSrc) {
      return Promise.resolve(global.JitsiMeetExternalAPI);
    }
    if (callState.loading && callState.apiSrc === apiSrc) {
      return new Promise(function (resolve, reject) {
        var tries = 0;
        var t = setInterval(function () {
          tries++;
          if (global.JitsiMeetExternalAPI) {
            clearInterval(t);
            resolve(global.JitsiMeetExternalAPI);
          } else if (tries > 80) {
            clearInterval(t);
            reject(new Error("Call service did not load"));
          }
        }, 125);
      });
    }

    var prev = document.querySelector('script[data-portal-jitsi-api="1"]');
    if (prev && callState.apiSrc && callState.apiSrc !== apiSrc) {
      prev.remove();
      try {
        delete global.JitsiMeetExternalAPI;
      } catch (_d) {
        global.JitsiMeetExternalAPI = undefined;
      }
    }

    callState.apiSrc = apiSrc;
    callState.loading = true;
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-portal-jitsi-api="1"]');
      if (existing) {
        if (existing.getAttribute("src") !== apiSrc) {
          existing.remove();
          existing = null;
        }
      }
      if (existing) {
        existing.addEventListener("load", function () {
          callState.loading = false;
          resolve(global.JitsiMeetExternalAPI);
        });
        existing.addEventListener("error", function () {
          callState.loading = false;
          reject(new Error("Could not load call service"));
        });
        if (global.JitsiMeetExternalAPI) {
          callState.loading = false;
          resolve(global.JitsiMeetExternalAPI);
        }
        return;
      }
      var s = document.createElement("script");
      s.src = apiSrc;
      s.async = true;
      s.dataset.portalJitsiApi = "1";
      s.onload = function () {
        callState.loading = false;
        if (global.JitsiMeetExternalAPI) resolve(global.JitsiMeetExternalAPI);
        else reject(new Error("Call service unavailable"));
      };
      s.onerror = function () {
        callState.loading = false;
        reject(new Error("Could not load call service"));
      };
      document.head.appendChild(s);
    });
  }

  function disposeCallApi() {
    if (!callState.api) return;
    try {
      callState.api.dispose();
    } catch (_e) {}
    callState.api = null;
  }

  function closeInAppCall() {
    var session = callState.activeSession;
    hideIncomingCallOverlay();
    disposeCallApi();
    callState.participants = Object.create(null);
    callState.rosterOpen = false;
    toggleCallRoster(false);
    var shell = callState.shell || document.getElementById("portalInAppCallShell");
    var host = callState.host || (shell && shell.querySelector("#portalInAppCallHost"));
    if (host) {
      host.innerHTML =
        '<div class="portal-inapp-call-loading" id="portalInAppCallLoading">Connecting...</div>';
    }
    if (shell) shell.hidden = true;
    document.body.classList.remove("portal-inapp-call-open");
    callState.activeSession = null;
    void postCallEndedMessage(session);
  }

  async function recentCallEndExists(client, scopeId, room, opts) {
    opts = opts || {};
    if (!client || !scopeId || !room) return false;
    var table = opts.group ? "portal_ceo_group_message" : "portal_staff_dm_messages";
    try {
      var q = client.from(table).select("body,created_at").order("created_at", { ascending: false }).limit(8);
      q = opts.group ? q.eq("group_id", scopeId) : q.eq("thread_id", scopeId);
      var res = await q;
      if (res.error || !Array.isArray(res.data)) return false;
      var cutoff = Date.now() - 15000;
      for (var i = 0; i < res.data.length; i++) {
        var row = res.data[i];
        var data = parseCallEndPayload(row && row.body);
        if (!data) continue;
        if (String(data.room || "") !== String(room)) continue;
        try {
          if (row.created_at && new Date(row.created_at).getTime() >= cutoff) return true;
        } catch (_d) {
          return true;
        }
      }
    } catch (_e) {}
    return false;
  }

  async function postCallEndedMessage(session) {
    if (!session || session.endedPosted || !session.joinedAt) return;
    var durationSec = Math.max(0, Math.round((Date.now() - session.joinedAt) / 1000));
    if (durationSec < 1) return;

    var ctx = getContext();
    var me = authUserId();
    var threadId = String(session.threadId || ctx.threadId || "").trim();
    var groupId = String(session.groupId || ctx.groupId || "").trim();
    if (!ctx.client || (!threadId && !groupId)) return;

    if (await recentCallEndExists(ctx.client, groupId || threadId, session.room, { group: !!groupId })) {
      session.endedPosted = true;
      return;
    }

    session.endedPosted = true;
    var payload = {
      v: 1,
      kind: String(session.kind || "video"),
      durationSec: durationSec,
      room: String(session.room || ""),
      endedAt: new Date().toISOString(),
    };
    var body = encodeCallEndBody(payload);
    try {
      if (groupId) {
        var insG = await ctx.client
          .from("portal_ceo_group_message")
          .insert([{ group_id: groupId, author_id: me, body: body, message_type: "text" }]);
        if (insG.error) throw insG.error;
      } else {
        var ins = await ctx.client
          .from("portal_staff_dm_messages")
          .insert([
            {
              thread_id: threadId,
              author_id: me,
              body: body,
              message_type: "text",
            },
          ]);
        if (ins.error) throw ins.error;
      }
      await refreshThreadAfterCall();
    } catch (_e) {}
  }

  async function openInAppCall(opts) {
    opts = opts || {};
    var room = String(opts.room || "").trim();
    if (!room) return;

    var kind = String(opts.kind || "video");
    var title = String(opts.title || opts.label || humanLabel(kind, opts.meetingTitle || "")).trim();
    var ctx = getContext();
    callState.activeSession = {
      kind: kind,
      threadId: String(ctx.threadId || "").trim(),
      groupId: String(ctx.groupId || "").trim(),
      room: stripRoomSlug(room),
      joinedAt: null,
      endedPosted: false,
    };
    var shell = ensureCallShell();
    var host = callState.host;
    var loading = shell.querySelector("#portalInAppCallLoading");
    var titleEl = shell.querySelector("#portalInAppCallTitle");

    if (titleEl) titleEl.textContent = title || "Call";
    if (loading) loading.hidden = false;
    shell.hidden = false;
    document.body.classList.add("portal-inapp-call-open");
    callState.participants = Object.create(null);
    syncCallManageButton();

    disposeCallApi();
    if (host) host.innerHTML = '<div class="portal-inapp-call-loading" id="portalInAppCallLoading">Connecting...</div>';
    loading = shell.querySelector("#portalInAppCallLoading");

    try {
      var session = await resolveCallSession(room, { asModerator: true });
      var JitsiMeetExternalAPI = await loadJitsiApi(session.apiSrc);
      host = callState.host;
      if (!host) throw new Error("Call panel missing");

      host.innerHTML = "";
      applyJitsiIframeAllow(host);
      var audioOnly = kind === "audio";
      var displayName = callerDisplayName();
      var micReady =
        typeof global.portalMicrophonePermissionGranted === "function" &&
        global.portalMicrophonePermissionGranted();
      var camReady =
        typeof global.portalCameraPermissionGranted === "function" &&
        global.portalCameraPermissionGranted();
      var skipJitsiGum = audioOnly ? micReady : micReady && camReady;
      var apiOptions = {
        roomName: session.roomName,
        parentNode: host,
        userInfo: { displayName: displayName },
        lang: "en",
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: audioOnly,
          startAudioOnly: audioOnly,
          disableInitialGUM: !!skipJitsiGum,
          prejoinPageEnabled: false,
          prejoinConfig: {
            enabled: false,
            hideExtraJoinButtons: true,
          },
          disableDeepLinking: true,
          enableWelcomePage: false,
          enableClosePage: false,
          requireDisplayName: false,
          enableLobby: false,
          hideConferenceSubject: true,
          channelLastN: -1,
          disableSelfView: false,
          disableFilmstrip: false,
          disableLocalVideoFlip: false,
          startSilent: false,
          constraints: {
            video: {
              height: { ideal: 720, max: 1080, min: 180 },
              facingMode: "user",
            },
          },
        },
        interfaceConfigOverwrite: {
          APP_NAME: "clubSENsational",
          NATIVE_APP_NAME: "clubSENsational Portal",
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          MOBILE_APP_PROMO: false,
          DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
          DISPLAY_WELCOME_PAGE_CONTENT: false,
          DISPLAY_WELCOME_FOOTER: false,
          HIDE_INVITE_MORE_HEADER: true,
          VERTICAL_FILMSTRIP: true,
          FILM_STRIP_MAX_HEIGHT: 140,
          TOOLBAR_ALWAYS_VISIBLE: true,
          TOOLBAR_BUTTONS: [
            "microphone",
            "camera",
            "toggle-camera",
            "settings",
            "fullscreen",
            "hangup",
            "tileview",
          ],
        },
      };
      if (session.jwt) apiOptions.jwt = session.jwt;
      var api = new JitsiMeetExternalAPI(session.domain, apiOptions);

      callState.api = api;
      applyJitsiIframeAllow(host);
      bindCallLayout(api, audioOnly);
      syncCallFlipButton(audioOnly);
      hideIncomingCallOverlay();

      function hideCallLoading() {
        var loadEl = shell.querySelector("#portalInAppCallLoading");
        if (loadEl) loadEl.hidden = true;
      }

      function autoJoinFromPrejoin() {
        try {
          api.executeCommand("displayName", displayName);
        } catch (_dn) {}
        try {
          api.executeCommand("submit", { displayName: displayName });
        } catch (_sub) {}
        try {
          api.executeCommand("joinConference");
        } catch (_join) {}
      }

      api.addEventListener("videoConferenceJoined", function () {
        hideCallLoading();
        applyJitsiIframeAllow(host);
        if (callState.activeSession) callState.activeSession.joinedAt = Date.now();
        if (skipJitsiGum) {
          try {
            api.executeCommand("toggleAudio", false);
          } catch (_au) {}
          if (!audioOnly && camReady) {
            try {
              api.executeCommand("toggleVideo", false);
            } catch (_vi) {}
          }
        }
      });
      api.addEventListener("participantJoined", function (participant) {
        if (!participant) return;
        var pid = String(participant.id || participant.participantId || "").trim();
        if (!pid) return;
        callState.participants[pid] = {
          displayName: String(participant.displayName || participant.formattedDisplayName || "Guest"),
        };
        if (callState.rosterOpen) renderCallRosterLiveList();
      });
      api.addEventListener("participantLeft", function (participant) {
        if (!participant) return;
        var pid = String(participant.id || participant.participantId || "").trim();
        if (pid) delete callState.participants[pid];
        if (callState.rosterOpen) renderCallRosterLiveList();
      });
      api.addEventListener("prejoinScreenLoaded", function () {
        applyJitsiIframeAllow(host);
        autoJoinFromPrejoin();
        setTimeout(autoJoinFromPrejoin, 120);
        setTimeout(autoJoinFromPrejoin, 420);
      });
      api.addEventListener("readyToClose", closeInAppCall);
      api.addEventListener("videoConferenceLeft", closeInAppCall);

      setTimeout(hideCallLoading, 4500);
    } catch (e) {
      closeInAppCall();
      var errEl = resolveErrEl();
      if (errEl) {
        errEl.textContent = String((e && e.message) || e || "Could not start call");
      }
      throw e;
    }
  }

  function openCallFromPayload(data) {
    if (!data) return;
    hideIncomingCallOverlay();
    void openInAppCall({
      room: data.room,
      kind: data.kind,
      title: humanLabel(data.kind, data.title),
      meetingTitle: data.title,
      asModerator: true,
    });
  }

  function renderCallEndRow(m) {
    injectStyles();
    var data = parseCallEndPayload(m && m.body);
    if (!data) return null;
    var kind = String(data.kind || "video");
    var iconHtml = dmIconForKind(kind);
    var parts = formatCallEndParts(kind, data.durationSec);
    var row = document.createElement("div");
    row.className = "portal-dm-call-end-row";
    row.setAttribute("role", "status");
    row.innerHTML =
      '<div class="portal-dm-call-end">' +
      '<span class="portal-dm-call-end-icon" aria-hidden="true">' +
      iconHtml +
      "</span>" +
      '<span class="portal-dm-call-end-copy">' +
      esc(parts.title) +
      "</span></div>";
    return row;
  }

  function renderCallCard(host, data, mine) {
    var kind = String(data.kind || "video");
    var title = String(data.title || "").trim();
    var label = humanLabel(kind, title);
    var when = data.scheduledAt ? formatWhen(data.scheduledAt) : "";
    var iconHtml = dmIconForKind(kind);
    var live = !when;

    var card = document.createElement("div");
    card.className =
      "portal-dm-call-card" + (mine ? " portal-dm-call-card--mine" : " portal-dm-call-card--them");

    card.innerHTML =
      '<div class="portal-dm-call-card-head">' +
      '<span class="portal-dm-call-card-icon" aria-hidden="true">' +
      iconHtml +
      "</span>" +
      '<div class="portal-dm-call-card-titles">' +
      '<div class="portal-dm-call-card-label">' +
      esc(label) +
      "</div>" +
      (when
        ? '<div class="portal-dm-call-card-when">' + esc(when) + "</div>"
        : '<div class="portal-dm-call-card-when portal-dm-call-card-when--live">Tap Join - opens inside the portal</div>') +
      "</div></div>" +
      '<button type="button" class="portal-dm-call-join-btn">' +
      (live ? "Join now" : "Join") +
      "</button>";

    var joinBtn = card.querySelector(".portal-dm-call-join-btn");
    if (joinBtn) {
      joinBtn.addEventListener("click", function () {
        openCallFromPayload(data);
      });
    }
    host.appendChild(card);
  }

  async function fillMessageBody(host, m, client, escFn, meId) {
    escFn = escFn || esc;
    host.innerHTML = "";
    var body = String((m && m.body) || "");
    if (parseCallEndPayload(body)) {
      var endRow = renderCallEndRow(m);
      if (endRow) {
        host.appendChild(endRow.firstElementChild || endRow);
      }
      return;
    }
    var callData = parseCallPayload(body);
    if (callData) {
      var me =
        meId ||
        String(
          (global.__PORTAL_SUPABASE__ &&
            global.__PORTAL_SUPABASE__.staff_profile &&
            global.__PORTAL_SUPABASE__.staff_profile.id) ||
            (global.__PORTAL_SUPABASE__ &&
              global.__PORTAL_SUPABASE__.session &&
              global.__PORTAL_SUPABASE__.session.user &&
              global.__PORTAL_SUPABASE__.session.user.id) ||
            ""
        );
      var mine =
        String((m && m.author_id) || "").toLowerCase() === String(me || "").toLowerCase();
      renderCallCard(host, callData, mine);
      return;
    }
    if (global.portalDmAttachments && (global.portalDmAttachments.isImageMsg(m) || global.portalDmAttachments.isFileMsg(m))) {
      await global.portalDmAttachments.fillMessageBody(host, m, client, escFn);
      return;
    }
    if (global.portalDmVoice && global.portalDmVoice.fillMessageBody) {
      await global.portalDmVoice.fillMessageBody(host, m, client, escFn);
      return;
    }
    var text = document.createElement("div");
    text.style.whiteSpace = "pre-wrap";
    text.style.minWidth = "0";
    text.style.overflowWrap = "break-word";
    text.textContent = body;
    host.appendChild(text);
  }

  async function sendCallInvite(opts) {
    opts = opts || {};
    var client = opts.client;
    var threadId = String(opts.threadId || "").trim();
    var groupId = String(opts.groupId || "").trim();
    var kind = String(opts.kind || "video");
    var title = String(opts.title || "").trim();
    var scheduledAt = opts.scheduledAt ? String(opts.scheduledAt) : "";
    if (!client || (!threadId && !groupId)) throw new Error("Not available.");

    var room = String(opts.room || "").trim();
    if (!room) {
      room = buildRoomName(groupId || threadId, kind, { group: !!groupId });
    }
    var caller = await resolveCallerIdentity(client);
    var payload = buildCallPayload({
      kind: kind,
      room: room,
      title: title,
      scheduledAt: scheduledAt || null,
      callerId: caller.id,
      callerName: caller.name,
    });
    var body = encodeCallBody(payload);
    var ins;
    if (groupId) {
      ins = await client
        .from("portal_ceo_group_message")
        .insert([{ group_id: groupId, author_id: caller.id, body: body, message_type: "text" }])
        .select("id");
    } else {
      ins = await client
        .from("portal_staff_dm_messages")
        .insert([
          {
            thread_id: threadId,
            author_id: caller.id,
            body: body,
            message_type: "text",
          },
        ])
        .select("id");
    }
    if (ins.error) throw ins.error;
    if (ins.data && ins.data[0] && ins.data[0].id) {
      incomingHandledIds[String(ins.data[0].id)] = true;
    }
    return payload;
  }

  function callTitleForContext(ctx, kind, meetingTitle) {
    ctx = ctx || getContext();
    if (ctx.groupId) {
      return ctx.peerLabel ? "Group call ? " + ctx.peerLabel : humanLabel(kind, meetingTitle || "");
    }
    return ctx.peerLabel ? "Call with " + ctx.peerLabel : humanLabel(kind, meetingTitle || "");
  }

  async function startCall(kind) {
    var ctx = getContext();
    var errEl = resolveErrEl();
    if (errEl) errEl.textContent = "";
    if (!ctx.client || (!ctx.threadId && !ctx.groupId)) {
      if (errEl) errEl.textContent = "Open a conversation first.";
      return;
    }
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.ensureSessionProfile === "function"
    ) {
      await global.portalChatActorIdentity.ensureSessionProfile(ctx.client);
    }
    var ui = resolveCallUi();
    var bar = document.getElementById(ui.barId);
    if (bar) bar.setAttribute("aria-busy", "true");
    try {
      var payload = await sendCallInvite({
        client: ctx.client,
        threadId: ctx.threadId,
        groupId: ctx.groupId,
        kind: kind,
      });
      await openInAppCall({
        room: payload.room,
        kind: payload.kind,
        title: callTitleForContext(ctx, kind, ""),
        asModerator: true,
      });
      await refreshThreadAfterCall();
    } catch (e) {
      if (errEl) errEl.textContent = String((e && e.message) || e || "Could not start call");
    } finally {
      if (bar) bar.removeAttribute("aria-busy");
    }
  }

  function meetingPanelHost() {
    if (global.__PORTAL_CS_CLIQ_ACTIVE || global.__PORTAL_CS_CLIQ_EMBED_OPEN) {
      return document.body;
    }
    var root = document.getElementById("csCliqRoot");
    if (root) return root;
    return document.getElementById(resolveCallUi().threadWrapId) || document.body;
  }

  function mountMeetingPanel(panel) {
    if (!panel) return;
    var host = meetingPanelHost();
    if (panel.parentElement !== host) host.appendChild(panel);
    var onBody = host === document.body;
    panel.classList.toggle("portal-dm-meeting-panel--hub", !onBody && host.id === "csCliqRoot");
    panel.classList.toggle("portal-dm-meeting-panel--global", onBody);
  }

  function dispatchMeetingCreated(detail) {
    try {
      global.dispatchEvent(new CustomEvent("portal-cs-cliq-meeting-created", { detail: detail || {} }));
    } catch (_ev) {}
  }

  function meetingPanelMarkup() {
    return (
      '<div class="portal-dm-meeting-panel-card">' +
      '<h4 id="portalStaffChatMeetingTitle">Schedule meeting</h4>' +
      '<p class="portal-dm-meeting-panel-sub" id="portalStaffChatMeetingSub">Set date, time and attendees. Invites appear in chat when a conversation is open.</p>' +
      '<label class="portal-dm-meeting-field"><span>Meeting title</span><input type="text" id="portalStaffChatMeetingTitleInput" maxlength="120" placeholder="e.g. Weekly handover" /></label>' +
      '<label class="portal-dm-meeting-field"><span>Participants</span><input type="text" id="portalStaffChatMeetingParticipantsInput" placeholder="Name or team" /></label>' +
      '<label class="portal-dm-meeting-field"><span>Date</span><input type="date" id="portalStaffChatMeetingDateInput" /></label>' +
      '<label class="portal-dm-meeting-field"><span>Time</span><input type="time" id="portalStaffChatMeetingTimeInput" /></label>' +
      '<label class="portal-dm-meeting-field"><span>Duration</span><select id="portalStaffChatMeetingDurationInput"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option></select></label>' +
      '<label class="portal-dm-meeting-field"><span>Meeting type</span><select id="portalStaffChatMeetingTypeInput"><option value="video">Video</option><option value="voice">Voice</option></select></label>' +
      '<label class="portal-dm-meeting-field"><span>Notes</span><textarea id="portalStaffChatMeetingNotesInput" rows="3" maxlength="500" placeholder="Optional context for attendees"></textarea></label>' +
      '<p id="portalStaffChatMeetingErr" class="portal-dm-meeting-err" hidden></p>' +
      '<div class="portal-dm-meeting-actions">' +
      '<button type="button" class="portal-dm-btn portal-dm-btn--ghost" id="portalStaffChatMeetingCancelBtn">Cancel</button>' +
      '<button type="button" class="portal-dm-btn portal-dm-btn--primary" id="portalStaffChatMeetingSendBtn">Create meeting</button>' +
      "</div></div>"
    );
  }

  function ensureMeetingPanel() {
    var existing = document.getElementById("portalStaffChatMeetingPanel");
    if (existing && !existing.querySelector("#portalStaffChatMeetingTypeInput")) {
      existing.remove();
      existing = null;
    }
    if (existing) {
      mountMeetingPanel(existing);
      return existing;
    }

    var panel = document.createElement("div");
    panel.id = "portalStaffChatMeetingPanel";
    panel.className = "portal-dm-meeting-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "portalStaffChatMeetingTitle");
    panel.innerHTML = meetingPanelMarkup();

    mountMeetingPanel(panel);

    panel.addEventListener("click", function (ev) {
      if (ev.target === panel) panel.hidden = true;
    });

    var cancelBtn = panel.querySelector("#portalStaffChatMeetingCancelBtn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", function () {
        panel.hidden = true;
      });
    }

    var sendBtn = panel.querySelector("#portalStaffChatMeetingSendBtn");
    if (sendBtn) {
      sendBtn.addEventListener("click", function () {
        void (async function () {
          var err = panel.querySelector("#portalStaffChatMeetingErr");
          if (err) {
            err.hidden = true;
            err.textContent = "";
          }
          var titleInp = document.getElementById("portalStaffChatMeetingTitleInput");
          var dateInp = document.getElementById("portalStaffChatMeetingDateInput");
          var timeInp = document.getElementById("portalStaffChatMeetingTimeInput");
          var durationInp = document.getElementById("portalStaffChatMeetingDurationInput");
          var typeInp = document.getElementById("portalStaffChatMeetingTypeInput");
          var participantsInp = document.getElementById("portalStaffChatMeetingParticipantsInput");
          var notesInp = document.getElementById("portalStaffChatMeetingNotesInput");
          var title = titleInp ? String(titleInp.value || "").trim() : "";
          var dateVal = dateInp ? String(dateInp.value || "").trim() : "";
          var timeVal = timeInp ? String(timeInp.value || "").trim() : "";
          var duration = durationInp ? String(durationInp.value || "30").trim() : "30";
          var meetingType = typeInp ? String(typeInp.value || "video").trim() : "video";
          var participants = participantsInp ? String(participantsInp.value || "").trim() : "";
          var notes = notesInp ? String(notesInp.value || "").trim() : "";
          if (!title) {
            if (err) {
              err.textContent = "Enter a meeting title.";
              err.hidden = false;
            }
            return;
          }
          if (!participants) {
            if (err) {
              err.textContent = "Enter at least one participant.";
              err.hidden = false;
            }
            return;
          }
          if (!dateVal || !timeVal) {
            if (err) {
              err.textContent = "Choose date and time.";
              err.hidden = false;
            }
            return;
          }
          var scheduledAt = "";
          try {
            scheduledAt = new Date(dateVal + "T" + timeVal + ":00").toISOString();
          } catch (_d) {
            if (err) {
              err.textContent = "Invalid date or time.";
              err.hidden = false;
            }
            return;
          }
          var ctx = getContext();
          var hasThread = !!(ctx.threadId || ctx.groupId);
          var isStaffRequest =
            global.portalCsCliqHubRoles &&
            typeof global.portalCsCliqHubRoles.canScheduleMeetings === "function" &&
            !global.portalCsCliqHubRoles.canScheduleMeetings();
          var meetingDetail = {
            id: "mtg-" + Date.now(),
            title: title,
            participants: participants,
            scheduledAt: scheduledAt,
            duration: duration + " min",
            type: meetingType === "voice" ? "voice" : "video",
            notes: notes,
          };
          sendBtn.disabled = true;
          try {
            if (isStaffRequest) {
              if (global.portalCsCliqSupport && typeof global.portalCsCliqSupport.submitMeetingRequest === "function") {
                global.portalCsCliqSupport.submitMeetingRequest({
                  with: participants,
                  title: title,
                  scheduledAt: scheduledAt,
                  duration: duration + " min",
                  notes: notes,
                  meetingType: meetingType,
                });
              }
              panel.hidden = true;
              return;
            }
            if (hasThread && ctx.client) {
              var meetingTitle = title;
              if (duration) meetingTitle += " (" + duration + " min)";
              if (meetingType === "voice") meetingTitle = "[Voice] " + meetingTitle;
              if (notes) meetingTitle += " ? " + notes;
              await sendCallInvite({
                client: ctx.client,
                threadId: ctx.threadId,
                groupId: ctx.groupId,
                kind: "meeting",
                title: meetingTitle,
                scheduledAt: scheduledAt,
              });
              await refreshThreadAfterCall();
            }
            dispatchMeetingCreated(meetingDetail);
            panel.hidden = true;
          } catch (e) {
            if (err) {
              err.textContent = String((e && e.message) || e || "Could not schedule meeting");
              err.hidden = false;
            }
          } finally {
            sendBtn.disabled = false;
          }
        })();
      });
    }

    return panel;
  }

  function openMeetingPanel(opts) {
    opts = opts || {};
    var panel = ensureMeetingPanel();
    mountMeetingPanel(panel);
    bindCallBar();
    var titleEl = document.getElementById("portalStaffChatMeetingTitle");
    var subEl = document.getElementById("portalStaffChatMeetingSub");
    var titleInp = document.getElementById("portalStaffChatMeetingTitleInput");
    var dateInp = document.getElementById("portalStaffChatMeetingDateInput");
    var timeInp = document.getElementById("portalStaffChatMeetingTimeInput");
    var durationInp = document.getElementById("portalStaffChatMeetingDurationInput");
    var typeInp = document.getElementById("portalStaffChatMeetingTypeInput");
    var participantsInp = document.getElementById("portalStaffChatMeetingParticipantsInput");
    var notesInp = document.getElementById("portalStaffChatMeetingNotesInput");
    var sendBtn = document.getElementById("portalStaffChatMeetingSendBtn");
    var err = document.getElementById("portalStaffChatMeetingErr");
    var adminUi = global.__PORTAL_ADMIN_DM_UI || {};
    var internalUi = global.__PORTAL_INTERNAL_CHAT_UI || {};
    var peerLabel = String(adminUi.peerLabel || internalUi.peerLabel || "").trim();
    var hasChat = !!(
      String(adminUi.threadId || internalUi.threadId || "").trim() ||
      String(adminUi.groupId || "").trim()
    );
    var contextual = !!opts.contextual && hasChat && !!peerLabel;
    var prefill = opts.prefill || null;
    var isStaffRequest =
      global.portalCsCliqHubRoles &&
      typeof global.portalCsCliqHubRoles.canScheduleMeetings === "function" &&
      !global.portalCsCliqHubRoles.canScheduleMeetings();
    if (titleEl) titleEl.textContent = isStaffRequest ? "Request meeting" : "Schedule meeting";
    if (subEl) {
      subEl.textContent = isStaffRequest
        ? "Ask a Lead or Management user to arrange a meeting."
        : "Set date, time and attendees. Invites appear in chat when a conversation is open.";
    }
    if (sendBtn) sendBtn.textContent = isStaffRequest ? "Request meeting" : "Create meeting";
    if (participantsInp) {
      if (prefill && prefill.participants) {
        participantsInp.value = prefill.participants;
        participantsInp.readOnly = false;
      } else if (contextual && peerLabel) {
        participantsInp.value = peerLabel;
        participantsInp.readOnly = true;
      } else {
        participantsInp.value = "";
        participantsInp.readOnly = false;
      }
      participantsInp.placeholder = "Name or team";
    }
    if (notesInp) notesInp.value = prefill && prefill.notes ? prefill.notes : "";
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    if (titleInp) titleInp.value = prefill && prefill.title ? prefill.title : "";
    if (durationInp) {
      var durVal = prefill && prefill.duration ? String(prefill.duration).replace(/\D/g, "") : "30";
      durationInp.value = durVal || "30";
    }
    if (typeInp) {
      typeInp.value = prefill && prefill.type === "voice" ? "voice" : "video";
    }
    var now = new Date();
    now.setMinutes(now.getMinutes() + 30 - (now.getMinutes() % 15));
    if (prefill && prefill.scheduledAt) {
      try {
        var preDate = new Date(prefill.scheduledAt);
        if (dateInp) {
          dateInp.value =
            preDate.getFullYear() +
            "-" +
            String(preDate.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(preDate.getDate()).padStart(2, "0");
        }
        if (timeInp) {
          timeInp.value =
            String(preDate.getHours()).padStart(2, "0") + ":" + String(preDate.getMinutes()).padStart(2, "0");
        }
      } catch (_pd) {
        prefill = null;
      }
    }
    if (!prefill || !prefill.scheduledAt) {
      if (dateInp) {
        dateInp.value =
          now.getFullYear() +
          "-" +
          String(now.getMonth() + 1).padStart(2, "0") +
          "-" +
          String(now.getDate()).padStart(2, "0");
      }
      if (timeInp) {
        timeInp.value =
          String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
      }
    }
    panel.hidden = false;
    if (titleInp) titleInp.focus();
  }

  function csCliqCallsActive() {
    return !!(global.__PORTAL_CS_CLIQ_ACTIVE && document.getElementById("csCliqHeadCallBar"));
  }

  function resolveCallUi() {
    if (csCliqCallsActive()) {
      return {
        barId: "csCliqHeadCallBar",
        errId: "csCliqErr",
        threadWrapId: "csCliqThreadPanel",
      };
    }
    return {
      barId: "internalChatCallBar",
      errId: "internalChatErr",
      threadWrapId: "internalChatThreadWrap",
    };
  }

  function resolveErrEl() {
    var ui = resolveCallUi();
    return document.getElementById(ui.errId);
  }

  function hideLegacyCallBarsExcept(activeBarId) {
    ["internalChatCallBar", "csCliqHeadCallBar", "csCliqPhoneCallBar"].forEach(function (id) {
      if (id === activeBarId) return;
      var el = document.getElementById(id);
      if (!el) return;
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
    });
  }

  function handleCallButtonClick(kind) {
    kind = String(kind || "").trim();
    if (kind === "meeting") {
      openMeetingPanel();
      return;
    }
    if (kind === "audio" || kind === "video") {
      void startCall(kind);
    }
  }

  function bindOneCallButton(btn, kind) {
    if (!btn || btn.dataset.portalCallBound === "1") return;
    btn.dataset.portalCallBound = "1";
    btn.addEventListener("click", function () {
      handleCallButtonClick(kind);
    });
  }

  function bindCallButtons(root) {
    if (!root || root.dataset.portalCallsBound) return;
    root.dataset.portalCallsBound = "1";
    root.querySelectorAll("[data-portal-call-kind]").forEach(function (btn) {
      bindOneCallButton(btn, btn.getAttribute("data-portal-call-kind"));
    });
    if (!root.querySelector("[data-portal-call-kind]")) {
      bindOneCallButton(root.querySelector("#internalChatVoiceCallBtn"), "audio");
      bindOneCallButton(root.querySelector("#internalChatVideoCallBtn"), "video");
      bindOneCallButton(root.querySelector("#internalChatMeetingBtn"), "meeting");
    }
  }

  function bindCallBar() {
    bindCallButtons(document.getElementById("internalChatCallBar"));
    bindCallButtons(document.getElementById("csCliqHeadCallBar"));
    bindCallButtons(document.getElementById("csCliqPhoneCallBar"));
  }

  function syncCallBar(opts) {
    opts = opts || {};
    var inThread = !!opts.inThread;
    // Workers only see office/admin threads in inbox; when a thread is open, calls are allowed.
    var showBar = inThread;
    var ui = resolveCallUi();
    var bar = document.getElementById(ui.barId);
    if (csCliqCallsActive()) {
      hideLegacyCallBarsExcept(showBar ? ui.barId : "");
    }
    if (document.getElementById("csCliqRoot")) bindCallBar();
    if (!bar) return;
    bar.hidden = !showBar;
    bar.setAttribute("aria-hidden", showBar ? "false" : "true");
    if (showBar) bindCallBar();
    if (csCliqCallsActive()) {
      var legacyBar = document.getElementById("internalChatCallBar");
      if (legacyBar) {
        legacyBar.hidden = true;
        legacyBar.setAttribute("aria-hidden", "true");
      }
      if (global.PortalAdminCsCliq && typeof global.PortalAdminCsCliq.syncPhonePaneContext === "function") {
        global.PortalAdminCsCliq.syncPhonePaneContext();
      }
    }
    var panel = document.getElementById("portalStaffChatMeetingPanel");
    if (panel && !inThread) panel.hidden = true;
  }

  function ensureLeadsCallPickerModal() {
    var existing = document.getElementById("portalLeadsCallPickerModal");
    if (existing) return existing;
    var modal = document.createElement("div");
    modal.id = "portalLeadsCallPickerModal";
    modal.className = "portal-leads-call-picker";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "portalLeadsCallPickerTitle");
    modal.innerHTML =
      '<div class="portal-leads-call-picker__backdrop" data-portal-leads-call-close="1"></div>' +
      '<div class="portal-leads-call-picker__card">' +
      '<div class="portal-leads-call-picker__head">' +
      '<h3 id="portalLeadsCallPickerTitle">Call selected leads</h3>' +
      '<button type="button" class="portal-leads-call-picker__close" data-portal-leads-call-close="1" aria-label="Close">?</button>' +
      "</div>" +
      '<p class="portal-leads-call-picker__sub">Choose who gets a join invite. Only selected leads are rung ? not the whole channel.</p>' +
      '<div class="portal-leads-call-picker__tools">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalLeadsCallPickerAll">Select all</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalLeadsCallPickerNone">Clear</button>' +
      "</div>" +
      '<div id="portalLeadsCallPickerList" class="portal-leads-call-picker__list"></div>' +
      '<p id="portalLeadsCallPickerErr" class="portal-leads-call-picker__err" hidden></p>' +
      '<div class="portal-leads-call-picker__actions">' +
      '<button type="button" class="btn btn--sec" data-portal-leads-call-close="1">Cancel</button>' +
      '<button type="button" class="btn btn--sec" id="portalLeadsCallPickerVoice">Voice call</button>' +
      '<button type="button" class="btn btn--pri" id="portalLeadsCallPickerVideo">Video call</button>' +
      "</div></div>";
    document.body.appendChild(modal);
    if (!document.getElementById("portalLeadsCallPickerStyles")) {
      var st = document.createElement("style");
      st.id = "portalLeadsCallPickerStyles";
      st.textContent =
        ".portal-leads-call-picker{position:fixed;inset:0;z-index:12050;display:grid;place-items:center;padding:16px}" +
        ".portal-leads-call-picker[hidden]{display:none!important}" +
        ".portal-leads-call-picker__backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45)}" +
        ".portal-leads-call-picker__card{position:relative;z-index:1;width:min(100%,420px);max-height:min(88vh,640px);overflow:auto;background:#fff;border-radius:16px;padding:16px;box-shadow:0 24px 60px rgba(15,23,42,.22);min-width:0}" +
        ".portal-leads-call-picker__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}" +
        ".portal-leads-call-picker__head h3{margin:0;font-size:17px;min-width:0;overflow-wrap:break-word}" +
        ".portal-leads-call-picker__close{border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:#667781;padding:0 4px}" +
        ".portal-leads-call-picker__sub{margin:8px 0 12px;font-size:13px;line-height:1.45;color:#667781;overflow-wrap:break-word}" +
        ".portal-leads-call-picker__tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}" +
        ".portal-leads-call-picker__list{display:flex;flex-direction:column;gap:6px;max-height:min(42vh,320px);overflow:auto;min-width:0}" +
        ".portal-leads-call-picker__row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(23,50,71,.08);border-radius:10px;min-width:0}" +
        ".portal-leads-call-picker__row label{flex:1;min-width:0;font-size:14px;line-height:1.35;overflow-wrap:break-word;cursor:pointer}" +
        ".portal-leads-call-picker__err{margin:10px 0 0;font-size:13px;color:#b42318;overflow-wrap:break-word}" +
        ".portal-leads-call-picker__actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px}";
      document.head.appendChild(st);
    }
    modal.addEventListener("click", function (ev) {
      if (ev.target && ev.target.getAttribute("data-portal-leads-call-close") === "1") {
        modal.hidden = true;
      }
    });
    return modal;
  }

  function normalizeRole(row) {
    return String((row && row.app_role) || "staff").trim().toLowerCase() || "staff";
  }

  function personLabel(row) {
    return String((row && row.full_name) || (row && row.username) || (row && row.id) || "").trim();
  }

  function ensureLeadsChannelPickerModal() {
    var existing = document.getElementById("portalLeadsChannelPickerModal");
    if (existing) return existing;
    var modal = document.createElement("div");
    modal.id = "portalLeadsChannelPickerModal";
    modal.className = "portal-leads-call-picker portal-leads-channel-picker";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "portalLeadsChannelPickerTitle");
    modal.innerHTML =
      '<div class="portal-leads-call-picker__backdrop" data-portal-leads-channel-close="1"></div>' +
      '<div class="portal-leads-call-picker__card portal-leads-channel-picker__card">' +
      '<div class="portal-leads-call-picker__head">' +
      '<h3 id="portalLeadsChannelPickerTitle">Open channel</h3>' +
      '<button type="button" class="portal-leads-call-picker__close" data-portal-leads-channel-close="1" aria-label="Close">?</button>' +
      "</div>" +
      '<p class="portal-leads-call-picker__sub">Choose who is in this channel. One person opens a direct chat; several leads open the Session leads channel; staff, leads and CEOs can use the ops channel.</p>' +
      '<div class="portal-leads-channel-picker__presets">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalLeadsChannelPresetLeads">Leads only</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalLeadsChannelPresetStaff">Staff only</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalLeadsChannelPresetAll">Staff + leads + CEOs</button>' +
      "</div>" +
      '<div class="portal-leads-call-picker__tools">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalLeadsChannelPickerAll">Select all</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="portalLeadsChannelPickerNone">Clear</button>' +
      "</div>" +
      '<div id="portalLeadsChannelPickerList" class="portal-leads-call-picker__list"></div>' +
      '<p id="portalLeadsChannelPickerErr" class="portal-leads-call-picker__err" hidden></p>' +
      '<div class="portal-leads-call-picker__actions">' +
      '<button type="button" class="btn btn--sec" data-portal-leads-channel-close="1">Cancel</button>' +
      '<button type="button" class="btn btn--pri" id="portalLeadsChannelPickerOpen">Open channel</button>' +
      "</div></div>";
    document.body.appendChild(modal);
    if (!document.getElementById("portalLeadsChannelPickerStyles")) {
      var st = document.createElement("style");
      st.id = "portalLeadsChannelPickerStyles";
      st.textContent =
        ".portal-leads-channel-picker__card{max-height:min(90vh,680px)}" +
        ".portal-leads-channel-picker__presets{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;min-width:0}" +
        ".portal-leads-channel-picker__section{margin:10px 0 4px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b;min-width:0}";
      document.head.appendChild(st);
    }
    modal.addEventListener("click", function (ev) {
      if (ev.target && ev.target.getAttribute("data-portal-leads-channel-close") === "1") {
        modal.hidden = true;
      }
    });
    return modal;
  }

  async function loadChannelPickerPeople(client) {
    if (!client) throw new Error("Not signed in.");
    var res = await client
      .from("staff_profiles")
      .select("id,full_name,username,app_role,is_active")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(300);
    if (res.error || !Array.isArray(res.data)) throw new Error("Could not load directory.");
    return res.data.filter(function (row) {
      if (!row || !row.id) return false;
      var role = normalizeRole(row);
      return role === "staff" || role === "lead" || role === "ceo" || role === "admin";
    });
  }

  async function openChannelForSelection(selectedIds, peopleById) {
    selectedIds = (selectedIds || [])
      .map(function (id) {
        return String(id || "").trim();
      })
      .filter(Boolean);
    if (!selectedIds.length) throw new Error("Select at least one person.");
    var ctx = getContext();
    if (!ctx.client) throw new Error("Not signed in.");

    if (selectedIds.length === 1) {
      if (typeof global.portalAdminDmEnsureDmThreadAndOpen === "function") {
        await global.portalAdminDmEnsureDmThreadAndOpen(selectedIds[0]);
        return;
      }
      throw new Error("Chat is not ready.");
    }

    var roles = selectedIds.map(function (id) {
      return normalizeRole(peopleById[id] || {});
    });
    var allLeads = roles.every(function (r) {
      return r === "lead";
    });

    if (allLeads) {
      var gidLeads =
        typeof global.portalAdminDmResolveSessionLeadsGroupId === "function"
          ? await global.portalAdminDmResolveSessionLeadsGroupId(ctx.client)
          : "";
      if (gidLeads && typeof global.portalAdminDmOpenGroupThread === "function") {
        await global.portalAdminDmOpenGroupThread(gidLeads);
        return;
      }
    }

    var gidOps =
      typeof global.portalAdminDmResolveStaffLeadsOpsGroupId === "function"
        ? await global.portalAdminDmResolveStaffLeadsOpsGroupId(ctx.client)
        : "";
    if (gidOps && typeof global.portalAdminDmOpenGroupThread === "function") {
      await global.portalAdminDmOpenGroupThread(gidOps);
      return;
    }

    if (typeof global.portalAdminDmEnsureDmThreadAndOpen === "function") {
      await global.portalAdminDmEnsureDmThreadAndOpen(selectedIds[0]);
      return;
    }
    throw new Error("Could not open channel.");
  }

  async function openLeadsChannelPicker() {
    var modal = ensureLeadsChannelPickerModal();
    var list = document.getElementById("portalLeadsChannelPickerList");
    var errEl = document.getElementById("portalLeadsChannelPickerErr");
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    if (list) {
      list.innerHTML =
        '<p class="muted" style="margin:0;font-size:13px;min-width:0">Loading people?</p>';
    }
    modal.hidden = false;
    var people = [];
    var peopleById = {};
    try {
      var ctx = getContext();
      people = await loadChannelPickerPeople(ctx.client);
      people.forEach(function (row) {
        peopleById[String(row.id)] = row;
      });
      if (!list) return;
      list.innerHTML = "";
      if (!people.length) {
        list.innerHTML =
          '<p class="muted" style="margin:0;font-size:13px;min-width:0">No staff or leads found.</p>';
        return;
      }
      var sections = [
        { key: "lead", title: "Leads" },
        { key: "staff", title: "Staff" },
        { key: "ceo", title: "CEOs" },
        { key: "admin", title: "Admins" },
      ];
      sections.forEach(function (sec) {
        var rows = people.filter(function (row) {
          return normalizeRole(row) === sec.key;
        });
        if (!rows.length) return;
        var head = document.createElement("p");
        head.className = "portal-leads-channel-picker__section";
        head.textContent = sec.title;
        list.appendChild(head);
        rows.forEach(function (row) {
          var id = String(row.id);
          var safe = id.replace(/[^a-zA-Z0-9_-]/g, "");
          var rowEl = document.createElement("div");
          rowEl.className = "portal-leads-call-picker__row";
          rowEl.innerHTML =
            '<input type="checkbox" id="portalLeadsChan_' +
            safe +
            '" value="' +
            id +
            '" data-portal-role="' +
            normalizeRole(row) +
            '" />' +
            '<label for="portalLeadsChan_' +
            safe +
            '">' +
            personLabel(row) +
            "</label>";
          list.appendChild(rowEl);
        });
      });
    } catch (e) {
      if (list) {
        list.innerHTML =
          '<p class="muted" style="margin:0;font-size:13px;color:#b42318;min-width:0;overflow-wrap:break-word">' +
          String((e && e.message) || e || "Could not load people.") +
          "</p>";
      }
    }

    function selectedIds() {
      if (!list) return [];
      return Array.prototype.slice
        .call(list.querySelectorAll('input[type="checkbox"]:checked'))
        .map(function (inp) {
          return String(inp.value || "").trim();
        })
        .filter(Boolean);
    }

    function setChecks(filterFn, on) {
      if (!list) return;
      list.querySelectorAll('input[type="checkbox"]').forEach(function (inp) {
        var id = String(inp.value || "");
        if (filterFn(peopleById[id] || {})) inp.checked = !!on;
      });
    }

    function wirePreset(id, filterFn) {
      var btn = document.getElementById(id);
      if (!btn || btn.dataset.portalLeadsChannelPresetBound === "1") return;
      btn.dataset.portalLeadsChannelPresetBound = "1";
      btn.addEventListener("click", function () {
        setChecks(filterFn, true);
      });
    }
    wirePreset("portalLeadsChannelPresetLeads", function (row) {
      return normalizeRole(row) === "lead";
    });
    wirePreset("portalLeadsChannelPresetStaff", function (row) {
      return normalizeRole(row) === "staff";
    });
    wirePreset("portalLeadsChannelPresetAll", function () {
      return true;
    });

    var allBtn = document.getElementById("portalLeadsChannelPickerAll");
    if (allBtn && allBtn.dataset.portalLeadsChannelBound !== "1") {
      allBtn.dataset.portalLeadsChannelBound = "1";
      allBtn.addEventListener("click", function () {
        setChecks(function () {
          return true;
        }, true);
      });
    }
    var noneBtn = document.getElementById("portalLeadsChannelPickerNone");
    if (noneBtn && noneBtn.dataset.portalLeadsChannelBound !== "1") {
      noneBtn.dataset.portalLeadsChannelBound = "1";
      noneBtn.addEventListener("click", function () {
        setChecks(function () {
          return true;
        }, false);
      });
    }
    var openBtn = document.getElementById("portalLeadsChannelPickerOpen");
    if (openBtn && openBtn.dataset.portalLeadsChannelOpenBound !== "1") {
      openBtn.dataset.portalLeadsChannelOpenBound = "1";
      openBtn.addEventListener("click", function () {
        void (async function () {
          if (errEl) {
            errEl.hidden = true;
            errEl.textContent = "";
          }
          var ids = selectedIds();
          if (!ids.length) {
            if (errEl) {
              errEl.textContent = "Select at least one person.";
              errEl.hidden = false;
            }
            return;
          }
          openBtn.disabled = true;
          try {
            modal.hidden = true;
            await openChannelForSelection(ids, peopleById);
          } catch (e2) {
            modal.hidden = false;
            if (errEl) {
              errEl.textContent = String((e2 && e2.message) || e2 || "Could not open channel.");
              errEl.hidden = false;
            }
          } finally {
            openBtn.disabled = false;
          }
        })();
      });
    }
  }

  async function loadActiveLeadsForPicker() {
    var ctx = getContext();
    if (!ctx.client) throw new Error("Not signed in.");
    var res = await ctx.client
      .from("staff_profiles")
      .select("id,full_name,username,app_role,is_active")
      .eq("app_role", "lead")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(200);
    if (res.error || !Array.isArray(res.data)) throw new Error("Could not load leads.");
    return res.data.filter(function (row) {
      return row && row.id;
    });
  }

  async function startSelectedLeadsCall(leadIds, kind) {
    kind = String(kind || "video").trim();
    leadIds = (leadIds || []).map(function (id) {
      return String(id || "").trim();
    }).filter(Boolean);
    if (!leadIds.length) throw new Error("Select at least one lead.");
    var ctx = getContext();
    var me = authUserId();
    if (!ctx.client || !me) throw new Error("Not signed in.");
    var caller = await resolveCallerIdentity(ctx.client);
    var room = buildRoomName("leads-pick-" + me.slice(0, 8), kind, { group: false });
    var payload = buildCallPayload({
      kind: kind,
      room: room,
      title: "Leads call",
      scheduledAt: null,
      callerId: caller.id,
      callerName: caller.name,
    });
    await openInAppCall({
      room: payload.room,
      kind: payload.kind,
      title: "Leads call",
      asModerator: true,
    });
    var session = callState.activeSession;
    if (!session) throw new Error("Could not start call.");
    for (var i = 0; i < leadIds.length; i++) {
      try {
        await inviteWorkerToActiveCall(leadIds[i], session);
      } catch (_one) {}
    }
    await refreshThreadAfterCall();
  }

  async function openLeadsCallPicker() {
    var modal = ensureLeadsCallPickerModal();
    var list = document.getElementById("portalLeadsCallPickerList");
    var errEl = document.getElementById("portalLeadsCallPickerErr");
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    if (list) {
      list.innerHTML =
        '<p class="muted" style="margin:0;font-size:13px;min-width:0">Loading leads?</p>';
    }
    modal.hidden = false;
    try {
      var rows = await loadActiveLeadsForPicker();
      if (!list) return;
      list.innerHTML = "";
      if (!rows.length) {
        list.innerHTML =
          '<p class="muted" style="margin:0;font-size:13px;min-width:0">No active leads found.</p>';
        return;
      }
      rows.forEach(function (row) {
        var id = String(row.id);
        var label = String(row.full_name || row.username || id.slice(0, 8)).trim();
        var rowEl = document.createElement("div");
        rowEl.className = "portal-leads-call-picker__row";
        rowEl.innerHTML =
          '<input type="checkbox" id="portalLeadsPick_' +
          id.replace(/[^a-zA-Z0-9_-]/g, "") +
          '" value="' +
          id +
          '" />' +
          '<label for="portalLeadsPick_' +
          id.replace(/[^a-zA-Z0-9_-]/g, "") +
          '">' +
          label +
          "</label>";
        list.appendChild(rowEl);
      });
    } catch (e) {
      if (list) {
        list.innerHTML =
          '<p class="muted" style="margin:0;font-size:13px;color:#b42318;min-width:0;overflow-wrap:break-word">' +
          String((e && e.message) || e || "Could not load leads.") +
          "</p>";
      }
    }
    function selectedLeadIds() {
      if (!list) return [];
      return Array.prototype.slice
        .call(list.querySelectorAll('input[type="checkbox"]:checked'))
        .map(function (inp) {
          return String(inp.value || "").trim();
        })
        .filter(Boolean);
    }
    function wirePickerBtn(id, kind) {
      var btn = document.getElementById(id);
      if (!btn || btn.dataset.portalLeadsPickerBound === "1") return;
      btn.dataset.portalLeadsPickerBound = "1";
      btn.addEventListener("click", function () {
        void (async function () {
          if (errEl) {
            errEl.hidden = true;
            errEl.textContent = "";
          }
          var ids = selectedLeadIds();
          if (!ids.length) {
            if (errEl) {
              errEl.textContent = "Select at least one lead.";
              errEl.hidden = false;
            }
            return;
          }
          btn.disabled = true;
          try {
            modal.hidden = true;
            await startSelectedLeadsCall(ids, kind);
          } catch (e2) {
            modal.hidden = false;
            if (errEl) {
              errEl.textContent = String((e2 && e2.message) || e2 || "Could not start call.");
              errEl.hidden = false;
            }
          } finally {
            btn.disabled = false;
          }
        })();
      });
    }
    wirePickerBtn("portalLeadsCallPickerVoice", "audio");
    wirePickerBtn("portalLeadsCallPickerVideo", "video");
    var allBtn = document.getElementById("portalLeadsCallPickerAll");
    if (allBtn && allBtn.dataset.portalLeadsPickerBound !== "1") {
      allBtn.dataset.portalLeadsPickerBound = "1";
      allBtn.addEventListener("click", function () {
        if (!list) return;
        list.querySelectorAll('input[type="checkbox"]').forEach(function (inp) {
          inp.checked = true;
        });
      });
    }
    var noneBtn = document.getElementById("portalLeadsCallPickerNone");
    if (noneBtn && noneBtn.dataset.portalLeadsPickerBound !== "1") {
      noneBtn.dataset.portalLeadsPickerBound = "1";
      noneBtn.addEventListener("click", function () {
        if (!list) return;
        list.querySelectorAll('input[type="checkbox"]').forEach(function (inp) {
          inp.checked = false;
        });
      });
    }
  }

  global.portalStaffChatCalls = {
    CALL_TAG: CALL_TAG,
    CALL_END_TAG: CALL_END_TAG,
    parseCallPayload: parseCallPayload,
    parseCallEndPayload: parseCallEndPayload,
    previewText: previewText,
    fillMessageBody: fillMessageBody,
    renderCallEndRow: renderCallEndRow,
    formatCallEndLabel: formatCallEndLabel,
    sendCallInvite: sendCallInvite,
    startCall: startCall,
    openMeetingPanel: openMeetingPanel,
    syncCallBar: syncCallBar,
    bindCallBar: bindCallBar,
    openInAppCall: openInAppCall,
    closeInAppCall: closeInAppCall,
    buildRoomName: buildRoomName,
    onDmMessageInsert: onDmMessageInsert,
    onGroupMessageInsert: onGroupMessageInsert,
    processIncomingCallRow: processIncomingCallRow,
    scanThreadForIncomingCall: function (lastMsg) {
      processIncomingCallRow(lastMsg, 0);
    },
    stopIncomingCallAlert: hideIncomingCallOverlay,
    primeCallRingAudio: primeCallRingAudio,
    openLeadsCallPicker: openLeadsCallPicker,
    openLeadsChannelPicker: openLeadsChannelPicker,
    startSelectedLeadsCall: startSelectedLeadsCall,
  };

  if (typeof document !== "undefined") {
    document.addEventListener(
      "click",
      function primeOnce() {
        primeCallRingAudio();
      },
      { once: true, capture: true }
    );
  }
})(typeof window !== "undefined" ? window : globalThis);
