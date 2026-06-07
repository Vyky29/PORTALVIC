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

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function formatCallEndLabel(kind, durationSec) {
    var kindLabel = humanLabel(String(kind || "video"), "");
    return kindLabel + " ? " + formatCallDuration(durationSec);
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

  function buildRoomName(threadId, kind) {
    var tid = slugPart(String(threadId || "thread").slice(0, 8));
    var k = slugPart(kind || "call");
    return ROOM_PREFIX + tid + "-" + k + "-" + randomSuffix();
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
      callerId: String(ctx.me || "").trim(),
      callerName: callerDisplayName(),
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

  function getContext() {
    var box = global.__PORTAL_SUPABASE__;
    var ui = global.__PORTAL_INTERNAL_CHAT_UI || {};
    return {
      client: box && box.client,
      threadId: String(ui.threadId || "").trim(),
      me: String(
        (box && box.staff_profile && box.staff_profile.id) ||
          (box && box.session && box.session.user && box.session.user.id) ||
          ""
      ).trim(),
      peerLabel: String(ui.peerLabel || "").trim(),
    };
  }

  function shortDisplayName(value) {
    var t = String(value == null ? "" : value).trim();
    if (!t) return "";
    var parts = t.split(/\s+/).filter(Boolean);
    return parts[0] || t;
  }

  function callerDisplayName() {
    var box = global.__PORTAL_SUPABASE__;
    var p = box && box.staff_profile;
    var nm = shortDisplayName((p && p.full_name) || (p && p.username) || "");
    if (nm) return nm;
    try {
      nm = shortDisplayName(global.dashboardData && global.dashboardData.staffName);
    } catch (_d) {}
    return nm || "Staff";
  }

  function incomingCallerLabelFromProfile(prof) {
    if (!prof) return "Team chat";
    var nm = shortDisplayName(prof.full_name || prof.username);
    return nm || "Team chat";
  }

  function isOwnCallAuthor(authorId) {
    authorId = String(authorId || "").trim().toLowerCase();
    if (!authorId) return false;
    var box = global.__PORTAL_SUPABASE__;
    var candidates = [
      box && box.staff_profile && box.staff_profile.id,
      box && box.session && box.session.user && box.session.user.id,
    ];
    for (var i = 0; i < candidates.length; i++) {
      var id = candidates[i];
      if (id && String(id).trim().toLowerCase() === authorId) return true;
    }
    return false;
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
      ".portal-incoming-call__icon{font-size:52px;line-height:1;margin:0 0 12px}" +
      ".portal-incoming-call__title{margin:0 0 6px;font-size:18px;font-weight:800}" +
      ".portal-incoming-call__sub{margin:0 0 16px;font-size:14px;color:rgba(255,255,255,.78)}" +
      ".portal-incoming-call__actions{display:flex;gap:10px}" +
      ".portal-incoming-call__btn{flex:1;padding:12px 10px;border-radius:999px;border:0;font:inherit;font-size:14px;font-weight:800;cursor:pointer}" +
      ".portal-incoming-call__btn--decline{background:rgba(255,255,255,.12);color:#fff}" +
      ".portal-incoming-call__btn--answer{background:#16a34a;color:#fff}" +
      ".portal-dm-call-end-row{display:flex;justify-content:center;width:100%;padding:6px 12px;box-sizing:border-box}" +
      ".portal-dm-call-end{display:inline-flex;align-items:center;justify-content:center;gap:6px;max-width:min(100%,22rem);padding:6px 12px;border-radius:999px;background:rgba(23,50,71,.08);color:#667781;font-size:12px;font-weight:600;line-height:1.35;text-align:center}" +
      ".portal-dm-call-end-icon{font-size:14px;line-height:1;opacity:.92;flex-shrink:0}";
    document.head.appendChild(st);
  }

  function meUserId() {
    var box = global.__PORTAL_SUPABASE__;
    return String(
      (box && box.staff_profile && box.staff_profile.id) ||
        (box && box.session && box.session.user && box.session.user.id) ||
        ""
    ).trim();
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

  function fetchDmRowForIncoming(row, attempt, cb) {
    attempt = attempt || 0;
    cb = typeof cb === "function" ? cb : function () {};
    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    if (!client || !row || !row.id) {
      cb(null);
      return;
    }
    client
      .from("portal_staff_dm_messages")
      .select("id,author_id,body,thread_id,created_at")
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
        '<div class="portal-incoming-call__icon" id="portalIncomingCallIcon" aria-hidden="true">??</div>' +
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

    if (data && data.callerName) {
      cb(shortDisplayName(data.callerName) || String(data.callerName).trim());
      return;
    }

    var box = global.__PORTAL_SUPABASE__;
    var client = box && box.client;
    var authorId = String(
      (data && data.callerId) || (row && row.author_id) || ""
    ).trim();
    if (!client || !authorId) {
      cb("Team chat");
      return;
    }
    client
      .from("staff_profiles")
      .select("full_name,username,app_role,staff_role")
      .eq("id", authorId)
      .maybeSingle()
      .then(function (res) {
        cb(incomingCallerLabelFromProfile(res && res.data));
      })
      .catch(function () {
        cb("Team chat");
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
      fetchDmRowForIncoming(row, attempt, function (full) {
        if (full) processIncomingCallRow(full, incomingRowRetryMax);
      });
      return;
    }
    if (!isRecentLiveCall(data, row)) return;
    var rowId = row.id ? String(row.id) : "";
    if (rowId && incomingHandledIds[rowId]) return;
    if (rowId) incomingHandledIds[rowId] = true;
    startIncomingCallAlert(data, row);
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
    if (icon) icon.textContent = kind === "video" ? "\uD83D\uDCF9" : "\uD83D\uDCDE";
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
      '<button type="button" class="portal-inapp-call-flip" id="portalInAppCallFlip" hidden title="Switch camera">Flip</button>' +
      '<button type="button" class="portal-inapp-call-leave" id="portalInAppCallLeave">Leave</button>' +
      "</div></div>" +
      '<div class="portal-inapp-call-host" id="portalInAppCallHost">' +
      '<div class="portal-inapp-call-loading" id="portalInAppCallLoading">Connecting...</div>' +
      "</div>";

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

    if (!shell.dataset.portalEscBound) {
      shell.dataset.portalEscBound = "1";
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && shell && !shell.hidden) closeInAppCall();
      });
    }

    return shell;
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

  async function recentCallEndExists(client, threadId, room) {
    if (!client || !threadId || !room) return false;
    try {
      var res = await client
        .from("portal_staff_dm_messages")
        .select("body,created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(8);
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
    var threadId = String(session.threadId || ctx.threadId || "").trim();
    if (!ctx.client || !threadId) return;

    if (await recentCallEndExists(ctx.client, threadId, session.room)) {
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
      var ins = await ctx.client
        .from("portal_staff_dm_messages")
        .insert([{ thread_id: threadId, body: body, message_type: "text" }]);
      if (ins.error) throw ins.error;
      if (typeof global.portalRenderInternalChatSheet === "function") {
        await global.portalRenderInternalChatSheet();
      }
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
    var data = parseCallEndPayload(m && m.body);
    if (!data) return null;
    var kind = String(data.kind || "video");
    var icon =
      kind === "meeting" ? "\uD83D\uDCC5" : kind === "video" ? "\uD83D\uDCF9" : "\uD83D\uDCDE";
    var row = document.createElement("div");
    row.className = "portal-dm-call-end-row";
    row.setAttribute("role", "status");
    row.innerHTML =
      '<div class="portal-dm-call-end">' +
      '<span class="portal-dm-call-end-icon" aria-hidden="true">' +
      esc(icon) +
      "</span>" +
      "<span>" +
      esc(formatCallEndLabel(kind, data.durationSec)) +
      "</span></div>";
    return row;
  }

  function renderCallCard(host, data, mine) {
    var kind = String(data.kind || "video");
    var title = String(data.title || "").trim();
    var label = humanLabel(kind, title);
    var when = data.scheduledAt ? formatWhen(data.scheduledAt) : "";
    var icon = kind === "meeting" ? "\uD83D\uDCC5" : kind === "video" ? "\uD83D\uDCF9" : "\uD83D\uDCDE";
    var live = !when;

    var card = document.createElement("div");
    card.className =
      "portal-dm-call-card" + (mine ? " portal-dm-call-card--mine" : " portal-dm-call-card--them");

    card.innerHTML =
      '<div class="portal-dm-call-card-head">' +
      '<span class="portal-dm-call-card-icon" aria-hidden="true">' +
      esc(icon) +
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
    var kind = String(opts.kind || "video");
    var title = String(opts.title || "").trim();
    var scheduledAt = opts.scheduledAt ? String(opts.scheduledAt) : "";
    if (!client || !threadId) throw new Error("Not available.");

    var room = buildRoomName(threadId, kind);
    var payload = buildCallPayload({
      kind: kind,
      room: room,
      title: title,
      scheduledAt: scheduledAt || null,
    });
    var body = encodeCallBody(payload);
    var ins = await client
      .from("portal_staff_dm_messages")
      .insert([{ thread_id: threadId, body: body, message_type: "text" }])
      .select("id");
    if (ins.error) throw ins.error;
    if (ins.data && ins.data[0] && ins.data[0].id) {
      incomingHandledIds[String(ins.data[0].id)] = true;
    }
    return payload;
  }

  async function startCall(kind) {
    var ctx = getContext();
    var errEl = resolveErrEl();
    if (errEl) errEl.textContent = "";
    if (!ctx.client || !ctx.threadId) {
      if (errEl) errEl.textContent = "Open a conversation first.";
      return;
    }
    var ui = resolveCallUi();
    var bar = document.getElementById(ui.barId);
    if (bar) bar.setAttribute("aria-busy", "true");
    try {
      var payload = await sendCallInvite({
        client: ctx.client,
        threadId: ctx.threadId,
        kind: kind,
      });
      await openInAppCall({
        room: payload.room,
        kind: payload.kind,
        title: ctx.peerLabel ? "Call with " + ctx.peerLabel : humanLabel(kind, ""),
        asModerator: true,
      });
      if (typeof global.portalRenderInternalChatSheet === "function") {
        await global.portalRenderInternalChatSheet();
      }
    } catch (e) {
      if (errEl) errEl.textContent = String((e && e.message) || e || "Could not start call");
    } finally {
      if (bar) bar.removeAttribute("aria-busy");
    }
  }

  function ensureMeetingPanel() {
    var existing = document.getElementById("portalStaffChatMeetingPanel");
    if (existing) return existing;

    var panel = document.createElement("div");
    panel.id = "portalStaffChatMeetingPanel";
    panel.className = "portal-dm-meeting-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "portalStaffChatMeetingTitle");
    panel.innerHTML =
      '<div class="portal-dm-meeting-panel-card">' +
      '<h4 id="portalStaffChatMeetingTitle">Schedule meeting</h4>' +
      '<p class="portal-dm-meeting-panel-sub">Everyone gets a join button in this chat. The meeting opens inside the portal.</p>' +
      '<label class="portal-dm-meeting-field"><span>Title</span><input type="text" id="portalStaffChatMeetingTitleInput" maxlength="120" placeholder="e.g. Weekly handover" /></label>' +
      '<label class="portal-dm-meeting-field"><span>Date</span><input type="date" id="portalStaffChatMeetingDateInput" /></label>' +
      '<label class="portal-dm-meeting-field"><span>Time</span><input type="time" id="portalStaffChatMeetingTimeInput" /></label>' +
      '<p id="portalStaffChatMeetingErr" class="portal-dm-meeting-err" hidden></p>' +
      '<div class="portal-dm-meeting-actions">' +
      '<button type="button" class="portal-dm-btn portal-dm-btn--ghost" id="portalStaffChatMeetingCancelBtn">Cancel</button>' +
      '<button type="button" class="portal-dm-btn portal-dm-btn--primary" id="portalStaffChatMeetingSendBtn">Send invite</button>' +
      "</div></div>";

    var threadWrap = document.getElementById(resolveCallUi().threadWrapId);
    if (threadWrap) threadWrap.appendChild(panel);
    else document.body.appendChild(panel);

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
          var title = titleInp ? String(titleInp.value || "").trim() : "";
          var dateVal = dateInp ? String(dateInp.value || "").trim() : "";
          var timeVal = timeInp ? String(timeInp.value || "").trim() : "";
          if (!title) {
            if (err) {
              err.textContent = "Enter a meeting title.";
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
          if (!ctx.client || !ctx.threadId) {
            if (err) {
              err.textContent = "Not available.";
              err.hidden = false;
            }
            return;
          }
          sendBtn.disabled = true;
          try {
            await sendCallInvite({
              client: ctx.client,
              threadId: ctx.threadId,
              kind: "meeting",
              title: title,
              scheduledAt: scheduledAt,
            });
            panel.hidden = true;
            if (typeof global.portalRenderInternalChatSheet === "function") {
              await global.portalRenderInternalChatSheet();
            }
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

  function openMeetingPanel() {
    var panel = ensureMeetingPanel();
    var titleInp = document.getElementById("portalStaffChatMeetingTitleInput");
    var dateInp = document.getElementById("portalStaffChatMeetingDateInput");
    var timeInp = document.getElementById("portalStaffChatMeetingTimeInput");
    var err = document.getElementById("portalStaffChatMeetingErr");
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    if (titleInp) titleInp.value = "";
    var now = new Date();
    now.setMinutes(now.getMinutes() + 30 - (now.getMinutes() % 15));
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

  function bindCallButtons(root) {
    if (!root || root.dataset.portalCallsBound) return;
    root.dataset.portalCallsBound = "1";
    root.querySelectorAll("[data-portal-call-kind]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = String(btn.getAttribute("data-portal-call-kind") || "").trim();
        if (kind === "meeting") {
          openMeetingPanel();
          return;
        }
        if (kind === "audio" || kind === "video") {
          void startCall(kind);
        }
      });
    });
  }

  function bindCallBar() {
    bindCallButtons(document.getElementById("internalChatCallBar"));
    bindCallButtons(document.getElementById("csCliqHeadCallBar"));
    bindCallButtons(document.getElementById("csCliqPhoneCallBar"));
  }

  function syncCallBar(opts) {
    opts = opts || {};
    var inThread = !!opts.inThread;
    var workerInboxOnly =
      typeof global.portalInternalChatOfficeRestricted === "function" &&
      global.portalInternalChatOfficeRestricted();
    var showBar = inThread && !workerInboxOnly;
    var ui = resolveCallUi();
    var bar = document.getElementById(ui.barId);
    if (csCliqCallsActive()) {
      hideLegacyCallBarsExcept(showBar ? ui.barId : "");
    }
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
    openInAppCall: openInAppCall,
    closeInAppCall: closeInAppCall,
    buildRoomName: buildRoomName,
    onDmMessageInsert: onDmMessageInsert,
    processIncomingCallRow: processIncomingCallRow,
    scanThreadForIncomingCall: function (lastMsg) {
      processIncomingCallRow(lastMsg, 0);
    },
    stopIncomingCallAlert: hideIncomingCallOverlay,
    primeCallRingAudio: primeCallRingAudio,
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
