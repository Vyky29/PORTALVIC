/**
 * Communications audio/video: JaaS (Jitsi) for media, portal rows for ringing.
 * Homemade WebRTC failed on iPhone, NAT and office-to-staff labels.
 */
(function (global) {
  "use strict";

  var convCache = {};
  var jitsiApi = null;
  var jitsiScriptSrc = "";
  var jitsiScriptLoading = null;
  var leaving = false;
  var RING_MS = 45000;

  function roomSlug(callId) {
    return "comms-" + String(callId || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 80);
  }

  function loadConversation(client, id) {
    if (!id) return Promise.resolve(null);
    if (Object.prototype.hasOwnProperty.call(convCache, id)) {
      return Promise.resolve(convCache[id]);
    }
    if (!client || typeof client.from !== "function") return Promise.resolve(null);
    return client
      .from("communication_conversations")
      .select("id,type,employee_id,peer_a,peer_b,group_id")
      .eq("id", id)
      .maybeSingle()
      .then(function (res) {
        convCache[id] = (res && res.data) || null;
        return convCache[id];
      })
      .catch(function () {
        convCache[id] = null;
        return null;
      });
  }

  function describeIncoming(row, meId, conv) {
    var uid = String(meId || "");
    if (!uid || !row || !row.id) return { forMe: false };
    if (String(row.initiated_by || "") === uid) return { forMe: false };
    if (!conv) return { forMe: false };
    var t = String(conv.type || "").toUpperCase();
    var employee = String(conv.employee_id || "");
    var initiated = String(row.initiated_by || "");
    var video = String(row.type || "").toUpperCase() === "VIDEO";
    var title = video ? "Incoming video call" : "Incoming call";
    if (t === "ADMIN_STAFF") {
      if (employee === uid) {
        return {
          forMe: true,
          mode: "personal",
          title: title,
          subtitle: "ADMIN is calling you",
          peerLabel: "ADMIN",
        };
      }
      if (initiated && initiated === employee) {
        return {
          forMe: true,
          mode: "administration",
          title: title,
          subtitle: "Worker calling ADMIN",
          peerLabel: "Worker",
        };
      }
      return { forMe: false };
    }
    if (t === "PEER" || t === "CEO_PEER") {
      var a = String(conv.peer_a || "");
      var b = String(conv.peer_b || "");
      if (a !== uid && b !== uid) return { forMe: false };
      return { forMe: true, mode: "personal", title: title, subtitle: "Communications", peerLabel: "Incoming call" };
    }
    if (t === "GROUP") {
      return {
        forMe: true,
        mode: "personal",
        title: video ? "Incoming video call" : "Incoming group call",
        subtitle: "Group call",
        peerLabel: "Group",
      };
    }
    return { forMe: false };
  }

  async function describeIncomingAsync(client, row, meId) {
    var conv = await loadConversation(client, row && row.conversation_id);
    return describeIncoming(row, meId, conv);
  }

  function loadJitsiScript(src) {
    src = String(src || "").trim();
    if (global.JitsiMeetExternalAPI && jitsiScriptSrc === src) {
      return Promise.resolve(global.JitsiMeetExternalAPI);
    }
    if (jitsiScriptLoading && jitsiScriptSrc === src) return jitsiScriptLoading;
    jitsiScriptSrc = src;
    jitsiScriptLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.dataset.portalJitsiApi = "1";
      s.onload = function () {
        jitsiScriptLoading = null;
        if (global.JitsiMeetExternalAPI) resolve(global.JitsiMeetExternalAPI);
        else reject(new Error("Call service unavailable"));
      };
      s.onerror = function () {
        jitsiScriptLoading = null;
        reject(new Error("Could not load call service"));
      };
      document.head.appendChild(s);
    });
    return jitsiScriptLoading;
  }

  function preload() {
    loadJitsiScript("https://8x8.vc/external_api.js").catch(function () {});
  }

  function dispose() {
    leaving = true;
    if (!jitsiApi) {
      leaving = false;
      return;
    }
    try {
      jitsiApi.dispose();
    } catch (_e) {}
    jitsiApi = null;
    leaving = false;
  }

  function isLive() {
    return !!jitsiApi;
  }

  async function mint(client, callId, displayName) {
    if (!client || typeof client.functions !== "object" || typeof client.functions.invoke !== "function") {
      throw new Error("Could not start the call service.");
    }
    var res = await client.functions.invoke("portal-jitsi-jaas-token", {
      body: {
        room: roomSlug(callId),
        displayName: displayName || "Staff",
        moderator: true,
      },
    });
    if (res && res.error) {
      var msg = res.error.message || res.error;
      throw new Error(typeof msg === "string" ? msg : "Could not start the call service.");
    }
    var data = res && res.data;
    if (data && data.error === "jaas_not_configured") {
      throw new Error("Call service is not configured.");
    }
    if (!data || !data.ok || !data.jwt || !data.roomName) {
      throw new Error((data && data.error) || "Could not start the call service.");
    }
    return data;
  }

  async function join(opts) {
    opts = opts || {};
    var parent = opts.parent;
    if (!parent) throw new Error("Call screen missing.");
    dispose();
    leaving = false;
    var token = await mint(opts.client, opts.callId, opts.displayName);
    var domain = String(token.domain || "8x8.vc");
    await loadJitsiScript("https://" + domain + "/external_api.js");
    parent.innerHTML = "";
    var Jitsi = global.JitsiMeetExternalAPI;
    jitsiApi = new Jitsi(domain, {
      roomName: String(token.roomName),
      jwt: String(token.jwt),
      parentNode: parent,
      width: "100%",
      height: "100%",
      lang: "en",
      userInfo: { displayName: String(opts.displayName || "Staff").slice(0, 80) },
      configOverwrite: {
        prejoinPageEnabled: false,
        prejoinConfig: { enabled: false },
        startWithVideoMuted: opts.video !== true,
        startWithAudioMuted: false,
        disableDeepLinking: true,
        disableInviteFunctions: true,
        disableProfile: true,
        toolbarButtons: ["microphone", "camera", "hangup", "toggle-camera", "tileview"],
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        MOBILE_APP_PROMO: false,
      },
    });
    jitsiApi.addListener("readyToClose", function () {
      if (leaving) return;
      if (typeof opts.onHangup === "function") opts.onHangup();
    });
    jitsiApi.addListener("videoConferenceLeft", function () {
      if (leaving) return;
      if (typeof opts.onHangup === "function") opts.onHangup();
    });
    if (typeof opts.onJoined === "function") {
      jitsiApi.addListener("videoConferenceJoined", function () {
        opts.onJoined();
      });
    }
    return jitsiApi;
  }

  global.PortalCommsCalls = {
    RING_MS: RING_MS,
    roomSlug: roomSlug,
    loadConversation: loadConversation,
    describeIncoming: describeIncoming,
    describeIncomingAsync: describeIncomingAsync,
    preload: preload,
    join: join,
    dispose: dispose,
    isLive: isLive,
  };
})(typeof window !== "undefined" ? window : this);
