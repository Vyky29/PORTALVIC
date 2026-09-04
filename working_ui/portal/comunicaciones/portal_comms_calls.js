/**
 * Communications audio/video: JaaS (Jitsi) for media, portal rows for ringing.
 * Homemade WebRTC failed on iPhone, NAT and office-to-staff labels.
 */
(function (global) {
  "use strict";

  var convCache = {};
  var prepareCache = {};
  var jitsiApi = null;
  var jitsiScriptSrc = "";
  var jitsiScriptLoading = null;
  var joinGen = 0;
  var RING_MS = 45000;
  var CLUB_LOGO = "/portal/F-02-1.png";
  var PHONE_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92z"/></svg>';
  var VIDEO_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';

  function stripId(raw) {
    return String(raw || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 80);
  }

  function roomSlug(opts) {
    opts = opts || {};
    if (opts.room) {
      var custom = String(opts.room).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 80);
      if (custom) return custom.indexOf("comms-") === 0 ? custom : "comms-" + custom;
    }
    var key = stripId(opts.conversationId || opts.callId);
    return key ? "comms-" + key : "";
  }

  function loadConversation(client, id) {
    if (!id) return Promise.resolve(null);
    if (convCache[id]) return Promise.resolve(convCache[id]);
    if (!client || typeof client.from !== "function") return Promise.resolve(null);
    return client
      .from("communication_conversations")
      .select("id,type,employee_id,peer_a,peer_b,group_id")
      .eq("id", id)
      .maybeSingle()
      .then(function (res) {
        if (res && res.data) {
          convCache[id] = res.data;
          return res.data;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function describeIncoming(row, meId, conv) {
    var uid = String(meId || "");
    if (!row || !row.id) return { forMe: false };
    if (uid && String(row.initiated_by || "") === uid) return { forMe: false };
    var video = String(row.type || "").toUpperCase() === "VIDEO";
    var title = video ? "Incoming video call" : "Incoming call";
    if (row.ring_mode) {
      return {
        forMe: true,
        mode: row.ring_mode === "administration" ? "administration" : "personal",
        title: row.ring_title || title,
        subtitle: row.ring_subtitle || "Communications",
        peerLabel: row.ring_mode === "administration" ? "Worker" : "Incoming call",
      };
    }
    if (!conv) return { forMe: false, pending: true };
    if (!uid) return { forMe: false, pending: true };
    var t = String(conv.type || "").toUpperCase();
    var employee = String(conv.employee_id || "");
    var initiated = String(row.initiated_by || "");
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
    if (row && row.ring_mode) return describeIncoming(row, meId, null);
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

  function sizeHost(parent) {
    if (!parent) return { width: 320, height: 480 };
    var rect = parent.getBoundingClientRect();
    var w = Math.max(Math.floor(rect.width || 0), parent.clientWidth || 0, 280);
    var h = Math.max(Math.floor(rect.height || 0), parent.clientHeight || 0, window.innerHeight || 480, 360);
    parent.style.width = "100%";
    parent.style.height = h + "px";
    parent.style.minHeight = "360px";
    return { width: w, height: h };
  }

  function decorateIframe(parent) {
    if (!parent) return;
    var iframe = parent.querySelector("iframe");
    if (!iframe) return;
    iframe.setAttribute(
      "allow",
      "camera *; microphone *; display-capture *; autoplay *; clipboard-write; fullscreen"
    );
    iframe.setAttribute("allowfullscreen", "true");
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.minHeight = "360px";
    iframe.style.border = "0";
    iframe.style.display = "block";
  }

  async function readInvokeError(res) {
    var data = res && res.data;
    if (data && data.error === "jaas_not_configured") return "Call service is not configured.";
    if (data && data.error) return String(data.error);
    var err = res && res.error;
    if (!err) return "";
    try {
      var ctx = err.context;
      if (ctx && typeof ctx.json === "function") {
        var body = await ctx.json();
        if (body && body.error === "jaas_not_configured") return "Call service is not configured.";
        if (body && body.error) return String(body.error);
      }
    } catch (_e) {}
    return err.message || "Could not start the call service.";
  }

  async function mint(client, opts) {
    opts = opts || {};
    var slug = roomSlug(opts);
    if (!slug) throw new Error("Could not start the call service.");
    if (!client || typeof client.functions !== "object" || typeof client.functions.invoke !== "function") {
      throw new Error("Could not start the call service.");
    }
    var res = await client.functions.invoke("portal-jitsi-jaas-token", {
      body: {
        room: slug,
        displayName: opts.displayName || "Staff",
        moderator: true,
      },
    });
    var msg = await readInvokeError(res);
    var data = res && res.data;
    if (msg && (!data || !data.ok)) throw new Error(msg);
    if (!data || !data.ok || !data.jwt || !data.roomName) {
      throw new Error((data && data.error) || "Could not start the call service.");
    }
    return data;
  }

  function prepareKey(opts) {
    return roomSlug(opts) || String((opts && (opts.callId || opts.conversationId)) || "");
  }

  function prepare(opts) {
    opts = opts || {};
    var key = prepareKey(opts);
    if (!key) return Promise.resolve(null);
    if (prepareCache[key] && prepareCache[key].promise) return prepareCache[key].promise;
    preload();
    var promise = mint(opts.client, opts)
      .then(function (token) {
        prepareCache[key] = { token: token, promise: Promise.resolve(token), at: Date.now() };
        return token;
      })
      .catch(function (err) {
        delete prepareCache[key];
        throw err;
      });
    prepareCache[key] = { token: null, promise: promise, at: Date.now() };
    return promise;
  }

  function preparedToken(opts) {
    var key = prepareKey(opts);
    var hit = key && prepareCache[key];
    if (hit && hit.token && Date.now() - hit.at < 50 * 60 * 1000) return hit.token;
    return null;
  }

  function isVideoType(type) {
    return String(type || "").toUpperCase() === "VIDEO";
  }

  function incomingBrandHtml(type) {
    var video = isVideoType(type);
    return (
      '<div class="portal-comms-call-brand">' +
      '<div class="portal-comms-call-logo-aura">' +
      '<img class="portal-comms-call-logo" src="' +
      CLUB_LOGO +
      '" alt="" width="88" height="88" />' +
      "</div>" +
      '<span class="portal-comms-call-kind" data-kind="' +
      (video ? "video" : "audio") +
      '" aria-hidden="true">' +
      (video ? VIDEO_ICON : PHONE_ICON) +
      "</span></div>"
    );
  }

  function stopTracksOn(el) {
    if (!el) return;
    try {
      var stream = el.srcObject;
      if (stream && stream.getTracks) {
        stream.getTracks().forEach(function (t) {
          try {
            t.stop();
          } catch (_t) {}
        });
      }
      el.srcObject = null;
    } catch (_e) {}
    try {
      el.querySelectorAll("video, audio").forEach(stopTracksOn);
    } catch (_q) {}
  }

  function removeLegacyHoldNodes() {
    ["portalCommsHeldMedia", "portalCommsJitsiWarmup"].forEach(function (id) {
      var node = document.getElementById(id);
      if (!node) return;
      stopTracksOn(node);
      try {
        if (node.parentNode) node.parentNode.removeChild(node);
      } catch (_r) {}
    });
  }

  function dispose() {
    joinGen += 1;
    removeLegacyHoldNodes();
    var api = jitsiApi;
    jitsiApi = null;
    if (!api) return;
    try {
      api.executeCommand("hangup");
    } catch (_h) {}
    try {
      api.dispose();
    } catch (_e) {}
  }

  function isLive() {
    return !!jitsiApi;
  }

  async function join(opts) {
    opts = opts || {};
    var parent = opts.parent;
    if (!parent) throw new Error("Call screen missing.");
    var gen = ++joinGen;
    removeLegacyHoldNodes();
    if (gen !== joinGen) return null;
    if (jitsiApi) {
      try {
        jitsiApi.executeCommand("hangup");
      } catch (_h) {}
      try {
        jitsiApi.dispose();
      } catch (_d) {}
      jitsiApi = null;
    }
    stopTracksOn(parent);
    var token = opts.token || preparedToken(opts);
    if (!token) token = await mint(opts.client, opts);
    if (gen !== joinGen) return null;
    var domain = String(token.domain || "8x8.vc");
    await loadJitsiScript("https://" + domain + "/external_api.js");
    if (gen !== joinGen) return null;
    stopTracksOn(parent);
    parent.innerHTML = "";
    var size = sizeHost(parent);
    var Jitsi = global.JitsiMeetExternalAPI;
    var hangupArmed = false;
    var joined = false;
    var audioOnly = opts.video !== true;
    jitsiApi = new Jitsi(domain, {
      roomName: String(token.roomName),
      jwt: String(token.jwt),
      parentNode: parent,
      width: size.width,
      height: size.height,
      lang: "en",
      userInfo: { displayName: String(opts.displayName || "Staff").slice(0, 80) },
      configOverwrite: {
        prejoinPageEnabled: false,
        prejoinConfig: { enabled: false, hideExtraJoinButtons: true },
        startWithVideoMuted: audioOnly,
        startWithAudioMuted: false,
        startAudioOnly: audioOnly,
        disableDeepLinking: true,
        deeplinking: { disabled: true },
        disableInviteFunctions: true,
        disableProfile: true,
        enableWelcomePage: false,
        requireDisplayName: false,
        enableNoAudioDetection: false,
        enableNoisyMicDetection: false,
        constraints: audioOnly
          ? { audio: true, video: false }
          : { audio: true, video: { height: { ideal: 360, max: 480 }, facingMode: "user" } },
        toolbarButtons: ["microphone", "camera", "hangup", "toggle-camera", "tileview"],
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
        MOBILE_APP_PROMO: false,
        APP_NAME: "Communications",
      },
      onload: function () {
        decorateIframe(parent);
      },
    });
    decorateIframe(parent);
    global.setTimeout(function () {
      decorateIframe(parent);
      sizeHost(parent);
    }, 400);
    function maybeHangup() {
      if (gen !== joinGen) return;
      if (!hangupArmed) return;
      if (typeof opts.onHangup === "function") opts.onHangup();
    }
    jitsiApi.addListener("videoConferenceJoined", function () {
      if (gen !== joinGen) return;
      joined = true;
      hangupArmed = true;
      decorateIframe(parent);
      if (typeof opts.onJoined === "function") opts.onJoined();
    });
    jitsiApi.addListener("videoConferenceLeft", maybeHangup);
    jitsiApi.addListener("readyToClose", maybeHangup);
    return new Promise(function (resolve, reject) {
      var settled = false;
      function finish(ok, err) {
        if (settled || gen !== joinGen) return;
        settled = true;
        global.clearTimeout(t);
        global.clearInterval(poll);
        if (ok) resolve(jitsiApi);
        else reject(err || new Error("Could not connect to the call. Allow microphone and try again."));
      }
      var t = global.setTimeout(function () {
        if (parent && parent.querySelector("iframe")) finish(true);
        else finish(false);
      }, 18000);
      var poll = global.setInterval(function () {
        if (gen !== joinGen) {
          global.clearInterval(poll);
          global.clearTimeout(t);
          return;
        }
        if (joined || (parent && parent.querySelector("iframe"))) {
          hangupArmed = hangupArmed || joined;
          finish(true);
        }
      }, 400);
      jitsiApi.addListener("videoConferenceJoined", function () {
        hangupArmed = true;
        finish(true);
      });
    });
  }

  global.PortalCommsCalls = {
    RING_MS: RING_MS,
    roomSlug: roomSlug,
    loadConversation: loadConversation,
    describeIncoming: describeIncoming,
    describeIncomingAsync: describeIncomingAsync,
    preload: preload,
    isVideoType: isVideoType,
    incomingBrandHtml: incomingBrandHtml,
    prepare: prepare,
    preparedToken: preparedToken,
    mint: mint,
    join: join,
    dispose: dispose,
    stopTracksOn: stopTracksOn,
    isLive: isLive,
  };

  try {
    removeLegacyHoldNodes();
    global.addEventListener("pagehide", function () {
      dispose();
    });
  } catch (_boot) {}
})(typeof window !== "undefined" ? window : this);
