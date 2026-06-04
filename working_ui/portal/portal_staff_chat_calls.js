/**
 * Staff internal chat ù voice/video calls and scheduled meetings via Jitsi Meet.
 * Call invites are stored as text DM bodies with an embedded payload (no DB migration required).
 */
(function (global) {
  "use strict";

  var CALL_TAG = "[[portal-staff-call:";
  var CALL_TAG_END = "]]";
  var JITSI_HOST = "https://meet.jit.si";
  var ROOM_PREFIX = "cs-portal-";

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
      if (!data || !data.url || !data.kind) return null;
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

  function jitsiUrl(room, opts) {
    opts = opts || {};
    var kind = String(opts.kind || "video");
    var url = JITSI_HOST + "/" + encodeURIComponent(room);
    var hash = [];
    if (kind === "audio") {
      hash.push("config.startWithVideoMuted=true");
      hash.push("config.startAudioOnly=true");
    }
    hash.push("config.prejoinPageEnabled=true");
    hash.push("config.disableDeepLinking=true");
    if (hash.length) url += "#" + hash.join("&");
    return url;
  }

  function encodeCallBody(data) {
    var label = humanLabel(data.kind, data.title);
    var line = label + " ù tap Join";
    return line + "\n" + CALL_TAG + JSON.stringify(data) + CALL_TAG_END;
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

  function openJitsi(url) {
    if (!url) return;
    try {
      var w = global.open(url, "_blank", "noopener,noreferrer");
      if (!w) global.location.href = url;
    } catch (_e) {
      global.location.href = url;
    }
  }

  function renderCallCard(host, data, mine) {
    var kind = String(data.kind || "video");
    var title = String(data.title || "").trim();
    var label = humanLabel(kind, title);
    var when = data.scheduledAt ? formatWhen(data.scheduledAt) : "";
    var icon = kind === "meeting" ? "??" : kind === "video" ? "??" : "??";

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
        : '<div class="portal-dm-call-card-when portal-dm-call-card-when--live">Ready to join</div>') +
      "</div></div>" +
      '<button type="button" class="portal-dm-call-join-btn">Join</button>';

    var joinBtn = card.querySelector(".portal-dm-call-join-btn");
    if (joinBtn) {
      joinBtn.addEventListener("click", function () {
        openJitsi(String(data.url || ""));
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
    var url = jitsiUrl(room, { kind: kind === "meeting" ? "video" : kind });
    var payload = {
      v: 1,
      kind: kind === "meeting" ? "meeting" : kind,
      room: room,
      url: url,
      title: title || "",
      scheduledAt: scheduledAt || null,
      createdAt: new Date().toISOString(),
    };
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
      openJitsi(payload.url);
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
      '<p class="portal-dm-meeting-panel-sub">A join link is sent in this chat. Everyone can open it at the scheduled time.</p>' +
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
    var bar = document.getElementById("internalChatCallBar");
    if (!bar) return;
    bar.hidden = !inThread;
    bar.setAttribute("aria-hidden", inThread ? "false" : "true");
    if (inThread) bindCallBar();
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
    openJitsi: openJitsi,
    jitsiUrl: jitsiUrl,
    buildRoomName: buildRoomName,
  };
})(typeof window !== "undefined" ? window : globalThis);
