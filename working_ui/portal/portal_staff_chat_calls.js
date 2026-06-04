/**
 * Staff internal chat - in-portal voice/video calls (embedded Jitsi, no new tab).
 * Call invites are stored as text DM bodies with an embedded payload.
 */
(function (global) {
  "use strict";

  var CALL_TAG = "[[portal-staff-call:";
  var CALL_TAG_END = "]]";
  /** meet.jit.si requires OAuth for moderators ù unusable in embedded iframe. */
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
  };

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
    return {
      v: 2,
      kind: kind === "meeting" ? "meeting" : kind,
      room: room,
      url: "https://" + JITSI_JAAS_DOMAIN + "/" + encodeURIComponent(room),
      title: String(opts.title || "").trim(),
      scheduledAt: opts.scheduledAt || null,
      createdAt: new Date().toISOString(),
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

  function callerDisplayName() {
    var box = global.__PORTAL_SUPABASE__;
    var p = box && box.staff_profile;
    var nm = String((p && p.full_name) || (p && p.username) || "").trim();
    if (nm) return nm;
    try {
      nm = String((global.dashboardData && global.dashboardData.staffName) || "").trim();
    } catch (_d) {}
    return nm || "Staff";
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
      ".portal-inapp-call-leave{flex-shrink:0;padding:8px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:rgba(220,38,38,.92);color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}" +
      ".portal-inapp-call-leave:hover{filter:brightness(1.05)}" +
      ".portal-inapp-call-host{flex:1;min-height:0;position:relative;background:#000}" +
      ".portal-inapp-call-host iframe{border:0;width:100%!important;height:100%!important}" +
      ".portal-inapp-call-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;color:rgba(255,255,255,.85);background:#0f172a;z-index:2}" +
      ".portal-inapp-call-loading[hidden]{display:none!important}";
    document.head.appendChild(st);
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
      '<button type="button" class="portal-inapp-call-leave" id="portalInAppCallLeave">Leave</button>' +
      "</div>" +
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
            moderator: opts.asModerator !== false,
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
    disposeCallApi();
    var shell = callState.shell || document.getElementById("portalInAppCallShell");
    var host = callState.host || (shell && shell.querySelector("#portalInAppCallHost"));
    if (host) {
      host.innerHTML =
        '<div class="portal-inapp-call-loading" id="portalInAppCallLoading">Connecting...</div>';
    }
    if (shell) shell.hidden = true;
    document.body.classList.remove("portal-inapp-call-open");
  }

  async function openInAppCall(opts) {
    opts = opts || {};
    var room = String(opts.room || "").trim();
    if (!room) return;

    var kind = String(opts.kind || "video");
    var title = String(opts.title || opts.label || humanLabel(kind, opts.meetingTitle || "")).trim();
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
      var session = await resolveCallSession(room, { asModerator: opts.asModerator !== false });
      var JitsiMeetExternalAPI = await loadJitsiApi(session.apiSrc);
      host = callState.host;
      if (!host) throw new Error("Call panel missing");

      host.innerHTML = "";
      var audioOnly = kind === "audio";
      var displayName = callerDisplayName();
      var apiOptions = {
        roomName: session.roomName,
        parentNode: host,
        userInfo: { displayName: displayName },
        lang: "en",
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: audioOnly,
          startAudioOnly: audioOnly,
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
          TOOLBAR_BUTTONS: [
            "microphone",
            "camera",
            "closedcaptions",
            "desktop",
            "fullscreen",
            "hangup",
            "tileview",
          ],
        },
      };
      if (session.jwt) apiOptions.jwt = session.jwt;
      var api = new JitsiMeetExternalAPI(session.domain, apiOptions);

      callState.api = api;

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

      api.addEventListener("videoConferenceJoined", hideCallLoading);
      api.addEventListener("prejoinScreenLoaded", function () {
        autoJoinFromPrejoin();
        setTimeout(autoJoinFromPrejoin, 120);
        setTimeout(autoJoinFromPrejoin, 420);
      });
      api.addEventListener("readyToClose", closeInAppCall);
      api.addEventListener("videoConferenceLeft", closeInAppCall);

      setTimeout(hideCallLoading, 4500);
    } catch (e) {
      closeInAppCall();
      var errEl = document.getElementById("internalChatErr");
      if (errEl) {
        errEl.textContent = String((e && e.message) || e || "Could not start call");
      }
      throw e;
    }
  }

  function openCallFromPayload(data) {
    if (!data) return;
    void openInAppCall({
      room: data.room,
      kind: data.kind,
      title: humanLabel(data.kind, data.title),
      meetingTitle: data.title,
      asModerator: false,
    });
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
    return payload;
  }

  async function startCall(kind) {
    var ctx = getContext();
    var errEl = document.getElementById("internalChatErr");
    if (errEl) errEl.textContent = "";
    if (!ctx.client || !ctx.threadId) {
      if (errEl) errEl.textContent = "Open a conversation first.";
      return;
    }
    var bar = document.getElementById("internalChatCallBar");
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

    var threadWrap = document.getElementById("internalChatThreadWrap");
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

  function bindCallBar() {
    var bar = document.getElementById("internalChatCallBar");
    if (!bar || bar.dataset.portalCallsBound) return;
    bar.dataset.portalCallsBound = "1";

    var voiceBtn = document.getElementById("internalChatVoiceCallBtn");
    var videoBtn = document.getElementById("internalChatVideoCallBtn");
    var meetBtn = document.getElementById("internalChatMeetingBtn");

    if (voiceBtn) {
      voiceBtn.addEventListener("click", function () {
        void startCall("audio");
      });
    }
    if (videoBtn) {
      videoBtn.addEventListener("click", function () {
        void startCall("video");
      });
    }
    if (meetBtn) {
      meetBtn.addEventListener("click", function () {
        openMeetingPanel();
      });
    }
  }

  function syncCallBar(opts) {
    opts = opts || {};
    var inThread = !!opts.inThread;
    var workerInboxOnly =
      typeof global.portalInternalChatOfficeRestricted === "function" &&
      global.portalInternalChatOfficeRestricted();
    var showBar = inThread && !workerInboxOnly;
    var bar = document.getElementById("internalChatCallBar");
    if (!bar) return;
    bar.hidden = !showBar;
    bar.setAttribute("aria-hidden", showBar ? "false" : "true");
    if (showBar) bindCallBar();
    var panel = document.getElementById("portalStaffChatMeetingPanel");
    if (panel && !inThread) panel.hidden = true;
  }

  global.portalStaffChatCalls = {
    CALL_TAG: CALL_TAG,
    parseCallPayload: parseCallPayload,
    previewText: previewText,
    fillMessageBody: fillMessageBody,
    sendCallInvite: sendCallInvite,
    startCall: startCall,
    openMeetingPanel: openMeetingPanel,
    syncCallBar: syncCallBar,
    openInAppCall: openInAppCall,
    closeInAppCall: closeInAppCall,
    buildRoomName: buildRoomName,
  };
})(typeof window !== "undefined" ? window : globalThis);
