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
  var heldStream = null;
  var warmupApi = null;
  var warmupHost = null;
  var warmupRoom = "hold" + String(Math.random()).replace(".", "").slice(2, 12);
  var warmupPromise = null;
  var warmupReady = false;

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

  function attachHeldStream(stream) {
    if (!stream || !document.body) return;
    var el = document.getElementById("portalCommsHeldMedia");
    if (!el) {
      el = document.createElement("video");
      el.id = "portalCommsHeldMedia";
      el.muted = true;
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      el.setAttribute("aria-hidden", "true");
      el.style.cssText =
        "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;bottom:0";
      document.body.appendChild(el);
    }
    el.srcObject = stream;
    var play = el.play();
    if (play && play.catch) play.catch(function () {});
  }

  async function holdLocalDevices() {
    if (!global.navigator || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      return null;
    }
    if (heldStream && heldStream.active) {
      attachHeldStream(heldStream);
      return heldStream;
    }
    heldStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 360 } },
    });
    try {
      heldStream.getVideoTracks().forEach(function (t) {
        t.enabled = false;
      });
    } catch (_v) {}
    attachHeldStream(heldStream);
    try {
      if (typeof global.markMicrophoneGranted === "function") global.markMicrophoneGranted();
      if (typeof global.markCameraGranted === "function") global.markCameraGranted();
    } catch (_m) {}
    return heldStream;
  }

  function ensureWarmupHost() {
    if (warmupHost && warmupHost.parentNode) return warmupHost;
    warmupHost = document.createElement("div");
    warmupHost.id = "portalCommsJitsiWarmup";
    warmupHost.setAttribute("aria-hidden", "true");
    warmupHost.style.cssText =
      "position:fixed;left:-9999px;top:0;width:280px;height:160px;opacity:0;pointer-events:none;overflow:hidden";
    (document.body || document.documentElement).appendChild(warmupHost);
    return warmupHost;
  }

  function muteWarmup() {
    if (!warmupApi) return;
    try {
      warmupApi.isAudioMuted().then(function (muted) {
        if (!muted) warmupApi.executeCommand("toggleAudio");
      });
    } catch (_a) {
      try {
        warmupApi.executeCommand("toggleAudio");
      } catch (_a2) {}
    }
    try {
      warmupApi.isVideoMuted().then(function (muted) {
        if (!muted) warmupApi.executeCommand("toggleVideo");
      });
    } catch (_v) {
      try {
        warmupApi.executeCommand("toggleVideo");
      } catch (_v2) {}
    }
  }

  function warmup(opts) {
    opts = opts || {};
    if (warmupReady && warmupApi) return Promise.resolve(true);
    if (warmupPromise) return warmupPromise;
    warmupPromise = (async function () {
      try {
        await holdLocalDevices();
      } catch (_gum) {}
      preload();
      if (warmupApi) {
        warmupReady = true;
        return true;
      }
      if (!opts.client) return true;
      try {
        var token = await mint(opts.client, {
          room: warmupRoom,
          displayName: opts.displayName || "Staff",
        });
        var domain = String(token.domain || "8x8.vc");
        await loadJitsiScript("https://" + domain + "/external_api.js");
        var host = ensureWarmupHost();
        var Jitsi = global.JitsiMeetExternalAPI;
        warmupApi = new Jitsi(domain, {
          roomName: String(token.roomName),
          jwt: String(token.jwt),
          parentNode: host,
          width: 280,
          height: 160,
          lang: "en",
          userInfo: { displayName: String(opts.displayName || "Staff").slice(0, 80) },
          configOverwrite: {
            prejoinPageEnabled: false,
            prejoinConfig: { enabled: false },
            startWithVideoMuted: false,
            startWithAudioMuted: false,
            startAudioOnly: false,
            disableDeepLinking: true,
            deeplinking: { disabled: true },
            disableInviteFunctions: true,
            enableNoAudioDetection: false,
            enableNoisyMicDetection: false,
            toolbarButtons: [],
          },
          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            SHOW_JITSI_WATERMARK: false,
          },
          onload: function () {
            decorateIframe(host);
          },
        });
        decorateIframe(host);
        warmupApi.addListener("videoConferenceJoined", function () {
          warmupReady = true;
          muteWarmup();
        });
        await new Promise(function (resolve) {
          var done = false;
          function finish() {
            if (done) return;
            done = true;
            resolve(true);
          }
          warmupApi.addListener("videoConferenceJoined", finish);
          global.setTimeout(finish, 8000);
        });
        muteWarmup();
        warmupReady = true;
      } catch (_w) {}
      return true;
    })().then(function (ok) {
      warmupPromise = null;
      return ok;
    });
    return warmupPromise;
  }

  function stopHeldDevices() {
    if (heldStream) {
      try {
        heldStream.getTracks().forEach(function (t) {
          t.stop();
        });
      } catch (_s) {}
      heldStream = null;
    }
    var el = document.getElementById("portalCommsHeldMedia");
    if (el) {
      try {
        el.srcObject = null;
      } catch (_e) {}
    }
    if (warmupApi) {
      try {
        warmupApi.dispose();
      } catch (_d) {}
      warmupApi = null;
    }
    warmupReady = false;
    warmupPromise = null;
  }

  function dispose() {
    joinGen += 1;
    if (!jitsiApi) return;
    var api = jitsiApi;
    jitsiApi = null;
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
    await warmup({
      client: opts.client,
      displayName: opts.displayName,
    });
    if (gen !== joinGen) return null;
    if (jitsiApi) {
      try {
        jitsiApi.dispose();
      } catch (_d) {}
      jitsiApi = null;
    }
    var token = opts.token || preparedToken(opts);
    if (!token) token = await mint(opts.client, opts);
    if (gen !== joinGen) return null;
    var domain = String(token.domain || "8x8.vc");
    await loadJitsiScript("https://" + domain + "/external_api.js");
    if (gen !== joinGen) return null;
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
    holdLocalDevices: holdLocalDevices,
    warmup: warmup,
    prepare: prepare,
    preparedToken: preparedToken,
    mint: mint,
    join: join,
    dispose: dispose,
    isLive: isLive,
  };
})(typeof window !== "undefined" ? window : this);
