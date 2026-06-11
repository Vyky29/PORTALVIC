/**
 * Internal chat Web Push — open thread from notification (staff/lead/CEO on staff dashboard).
 */
(function (global) {
  "use strict";

  function parseChatOpenQuery() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      if (q.get("portal_open") !== "internal_chat") return null;
      return {
        threadId: String(q.get("portal_chat_thread") || "").trim(),
        groupId: String(q.get("portal_chat_group") || "").trim(),
      };
    } catch (_e) {
      return null;
    }
  }

  function clearChatOpenQuery() {
    try {
      var q = new URLSearchParams(String(global.location.search || ""));
      if (q.get("portal_open") !== "internal_chat") return;
      q.delete("portal_open");
      q.delete("portal_chat_thread");
      q.delete("portal_chat_group");
      var next =
        global.location.pathname +
        (q.toString() ? "?" + q.toString() : "") +
        (global.location.hash || "");
      global.history.replaceState(null, "", next);
    } catch (_e2) {}
  }

  async function portalOpenInternalChatFromPush(chat) {
    if (global.__PORTAL_CHAT_PUSH_OPENING__) return;
    global.__PORTAL_CHAT_PUSH_OPENING__ = true;
    chat = chat || {};
    var threadId = String(chat.threadId || chat.thread_id || "").trim();
    var groupId = String(chat.groupId || chat.group_id || "").trim();
    try {
      if (typeof global.closeSheet === "function") {
        global.closeSheet({ bypassAnnouncementLock: true });
      }
    } catch (_c) {}
    global.__PORTAL_INTERNAL_CHAT_UI = global.__PORTAL_INTERNAL_CHAT_UI || {};
    if (groupId) {
      global.__PORTAL_INTERNAL_CHAT_UI.groupId = groupId;
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = null;
    } else if (threadId) {
      global.__PORTAL_INTERNAL_CHAT_UI.threadId = threadId;
      global.__PORTAL_INTERNAL_CHAT_UI.groupId = null;
      global.__PORTAL_INTERNAL_CHAT_UI.skipResetThreadOnNextSheetOpen = true;
    }
    try {
      if (typeof global.openSheet === "function") {
        global.openSheet("internalChatSheet", {
          bypassAnnouncementLock: true,
          skipInternalChatRender: true,
        });
      }
      if (typeof global.syncPortalInternalChatImmersive === "function") {
        global.syncPortalInternalChatImmersive();
      } else if (typeof global.portalSyncInternalChatMobileViewport === "function") {
        global.portalSyncInternalChatMobileViewport();
      }
      if (typeof global.portalStaffDmAckInboxOpened === "function") {
        await global.portalStaffDmAckInboxOpened();
      }
      if (typeof global.portalRenderInternalChatSheet === "function") {
        await global.portalRenderInternalChatSheet();
      }
    } finally {
      global.__PORTAL_CHAT_PUSH_OPENING__ = false;
    }
  }

  function portalStaffToast(msg) {
    if (typeof document === "undefined" || !document.body) return;
    var host = document.getElementById("portalStaffToastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "portalStaffToastHost";
      host.setAttribute("aria-live", "polite");
      host.style.cssText =
        "position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:9600;pointer-events:none;display:flex;flex-direction:column;gap:8px;max-width:520px;margin:0 auto;";
      document.body.appendChild(host);
    }
    var el = document.createElement("button");
    el.type = "button";
    el.className = "portal-staff-toast";
    el.style.cssText =
      "pointer-events:auto;width:100%;margin:0;padding:12px 14px;border:0;border-radius:14px;background:#0f172a;color:#f8fafc;font:inherit;font-size:14px;font-weight:600;line-height:1.35;text-align:left;box-shadow:0 8px 24px rgba(15,23,42,.28);cursor:pointer;min-width:0;overflow-wrap:break-word;";
    el.textContent = String(msg || "New message");
    el.addEventListener("click", function () {
      try {
        el.remove();
      } catch (_r) {}
      if (typeof global.portalOpenInternalChatFromHeaderQuickMenu === "function") {
        global.portalOpenInternalChatFromHeaderQuickMenu();
      }
    });
    host.appendChild(el);
    setTimeout(function () {
      try {
        el.remove();
      } catch (_t) {}
    }, 8000);
  }

  function portalStaffShowChatPushToast(title, body) {
    var msg = String(body || "").trim()
      ? String(title || "New message").trim() + " — " + String(body || "").trim()
      : String(title || "New message").trim();
    portalStaffToast(msg);
  }

  var CHAT_LOGO_ICON = "/portal/app-icon/icon-192.png?v=20260624-push-icon";

  function portalShowChatLogoAlert(title, body, opts) {
    opts = opts || {};
    if (typeof document === "undefined" || !document.body) return;
    var now = Date.now();
    global.__PORTAL_CHAT_LOGO_ALERT_LAST__ = global.__PORTAL_CHAT_LOGO_ALERT_LAST__ || 0;
    if (now - global.__PORTAL_CHAT_LOGO_ALERT_LAST__ < 1200) return;
    global.__PORTAL_CHAT_LOGO_ALERT_LAST__ = now;
    title = String(title || "New message").trim();
    body = String(body || "").trim();
    var hostId = opts.hostId || "portalChatLogoAlertHost";
    var host = document.getElementById(hostId);
    if (!host) {
      host = document.createElement("div");
      host.id = hostId;
      host.setAttribute("aria-live", "polite");
      host.style.cssText =
        "position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:9700;pointer-events:none;display:flex;flex-direction:column;gap:8px;max-width:420px;margin:0 auto;";
      document.body.appendChild(host);
    }
    var el = document.createElement("button");
    el.type = "button";
    el.className = "portal-chat-logo-alert";
    el.style.cssText =
      "pointer-events:auto;width:100%;margin:0;padding:10px 12px;border:0;border-radius:16px;background:#fff;color:#0f172a;font:inherit;font-size:14px;line-height:1.35;text-align:left;box-shadow:0 10px 28px rgba(15,23,42,.22);cursor:pointer;display:flex;align-items:flex-start;gap:10px;min-width:0;";
    var img = document.createElement("img");
    img.src = CHAT_LOGO_ICON;
    img.alt = "";
    img.width = 40;
    img.height = 40;
    img.style.cssText = "width:40px;height:40px;border-radius:10px;flex:0 0 auto;object-fit:cover;";
    var copy = document.createElement("span");
    copy.style.cssText = "min-width:0;flex:1 1 auto;overflow-wrap:break-word;";
    copy.innerHTML =
      "<strong style=\"display:block;font-size:14px;margin:0 0 2px;\">" +
      title.replace(/&/g, "&amp;").replace(/</g, "&lt;") +
      "</strong>" +
      (body
        ? "<span style=\"display:block;font-size:13px;color:#475569;\">" +
          body.replace(/&/g, "&amp;").replace(/</g, "&lt;") +
          "</span>"
        : "");
    el.appendChild(img);
    el.appendChild(copy);
    el.addEventListener("click", function () {
      try {
        el.remove();
      } catch (_r) {}
      if (typeof opts.onClick === "function") {
        opts.onClick();
      } else if (typeof global.portalOpenInternalChatFromHeaderQuickMenu === "function") {
        global.portalOpenInternalChatFromHeaderQuickMenu();
      } else if (typeof global.portalAdminNavigateToCsCliq === "function") {
        void global.portalAdminNavigateToCsCliq();
      }
    });
    host.appendChild(el);
    setTimeout(function () {
      try {
        el.remove();
      } catch (_t) {}
    }, opts.ms || 7000);
  }

  function primeChatAlertAudio() {
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (Ctx && !global.__PORTAL_CHAT_AUDIO_CTX__) {
        global.__PORTAL_CHAT_AUDIO_CTX__ = new Ctx();
      }
      var ctx = global.__PORTAL_CHAT_AUDIO_CTX__;
      if (ctx && ctx.state === "suspended") {
        void ctx.resume();
      }
    } catch (_c) {}
    if (
      global.portalStaffChatCalls &&
      typeof global.portalStaffChatCalls.primeCallRingAudio === "function"
    ) {
      global.portalStaffChatCalls.primeCallRingAudio();
    }
  }

  function bindChatAlertAudioPrime() {
    if (global.__PORTAL_CHAT_AUDIO_PRIME_BOUND__) return;
    global.__PORTAL_CHAT_AUDIO_PRIME_BOUND__ = true;
    var once = function () {
      primeChatAlertAudio();
      try {
        global.document.removeEventListener("pointerdown", once, true);
        global.document.removeEventListener("touchstart", once, true);
      } catch (_u) {}
    };
    try {
      global.document.addEventListener("pointerdown", once, true);
      global.document.addEventListener("touchstart", once, true);
    } catch (_b) {}
  }

  function chatAlertBeepBlobUrl() {
    if (global.__PORTAL_CHAT_ALERT_BEEP_URL__) return global.__PORTAL_CHAT_ALERT_BEEP_URL__;
    try {
      var sampleRate = 8000;
      var samples = Math.floor(sampleRate * 0.34);
      var data = new Float32Array(samples);
      for (var i = 0; i < samples; i++) {
        var t = i / sampleRate;
        var tone = t < 0.12 ? 880 : 1174.66;
        var env = t < 0.12 ? 1 : t < 0.28 ? 1 : 0;
        data[i] = Math.sin(2 * Math.PI * tone * t) * env * 0.42;
      }
      var numChannels = 1;
      var bytesPerSample = 2;
      var blockAlign = numChannels * bytesPerSample;
      var dataSize = samples * blockAlign;
      var buffer = new ArrayBuffer(44 + dataSize);
      var view = new DataView(buffer);
      var offset = 0;
      function writeStr(s) {
        for (var j = 0; j < s.length; j++) view.setUint8(offset++, s.charCodeAt(j));
      }
      writeStr("RIFF");
      view.setUint32(offset, 36 + dataSize, true);
      offset += 4;
      writeStr("WAVEfmt ");
      view.setUint32(offset, 16, true);
      offset += 4;
      view.setUint16(offset, 1, true);
      offset += 2;
      view.setUint16(offset, numChannels, true);
      offset += 2;
      view.setUint32(offset, sampleRate, true);
      offset += 4;
      view.setUint32(offset, sampleRate * blockAlign, true);
      offset += 4;
      view.setUint16(offset, blockAlign, true);
      offset += 2;
      view.setUint16(offset, 16, true);
      offset += 2;
      writeStr("data");
      view.setUint32(offset, dataSize, true);
      offset += 4;
      for (var k = 0; k < samples; k++) {
        var s = Math.max(-1, Math.min(1, data[k]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
      global.__PORTAL_CHAT_ALERT_BEEP_URL__ = URL.createObjectURL(
        new Blob([buffer], { type: "audio/wav" })
      );
      return global.__PORTAL_CHAT_ALERT_BEEP_URL__;
    } catch (_blob) {
      return "";
    }
  }

  function playChatMessageAlertSoundHtml5() {
    try {
      var el = global.__PORTAL_CHAT_ALERT_AUDIO__;
      if (!el && typeof global.Audio !== "undefined") {
        el = new global.Audio();
        el.preload = "auto";
        el.setAttribute("playsinline", "true");
        el.setAttribute("webkit-playsinline", "true");
        el.volume = 0.9;
        global.__PORTAL_CHAT_ALERT_AUDIO__ = el;
      }
      if (!el) return false;
      var src = chatAlertBeepBlobUrl();
      if (!src) return false;
      if (el.src !== src) el.src = src;
      el.currentTime = 0;
      var p = el.play();
      if (p && typeof p.then === "function") {
        p.then(function () {
          global.__PORTAL_CHAT_SOUND_PLAYED__ = true;
        }).catch(function () {});
      } else {
        global.__PORTAL_CHAT_SOUND_PLAYED__ = true;
      }
      return true;
    } catch (_e) {
      return false;
    }
  }

  function portalChatAlertIsMobile() {
    try {
      if (global.matchMedia && global.matchMedia("(pointer: coarse)").matches) return true;
      return /iphone|ipad|ipod|android/i.test(String(global.navigator.userAgent || ""));
    } catch (_m) {
      return false;
    }
  }

  function playChatMessageAlertSound() {
    primeChatAlertAudio();
    global.__PORTAL_CHAT_SOUND_PLAYED__ = false;
    playChatMessageAlertSoundHtml5();
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return false;
      var ctx = global.__PORTAL_CHAT_AUDIO_CTX__ || new Ctx();
      global.__PORTAL_CHAT_AUDIO_CTX__ = ctx;
      function chirp() {
        var gain = ctx.createGain();
        gain.gain.value = 0.52;
        gain.connect(ctx.destination);
        function beep(freq, start, dur) {
          var osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = freq;
          osc.connect(gain);
          osc.start(start);
          osc.stop(start + dur);
        }
        var t = ctx.currentTime;
        beep(880, t, 0.11);
        beep(1174.66, t + 0.13, 0.15);
        setTimeout(function () {
          global.__PORTAL_CHAT_SOUND_PLAYED__ = true;
        }, 300);
      }
      if (ctx.state === "suspended") {
        void ctx
          .resume()
          .then(chirp)
          .catch(function () {
            playChatMessageAlertSoundHtml5();
          });
      } else {
        chirp();
      }
      setTimeout(function () {
        if (!global.__PORTAL_CHAT_SOUND_PLAYED__) playChatMessageAlertSoundHtml5();
      }, 120);
      return true;
    } catch (_e) {
      playChatMessageAlertSoundHtml5();
      return false;
    }
  }

  function portalStaffNotifyIncomingChat(title, preview, row, notifyOpts) {
    notifyOpts = notifyOpts || {};
    var authorId = String((row && row.author_id) || "").trim();
    if (
      authorId &&
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.isSelfUserId === "function" &&
      global.portalChatActorIdentity.isSelfUserId(authorId)
    ) {
      return;
    }
    title = String(title || "Admin").trim();
    preview = String(preview || "New message").trim();
    var dedupeKey = String((row && row.id) || title + "|" + preview).trim();
    var dedupeMap = global.__PORTAL_CHAT_NOTIFY_DEDUPE__ || {};
    var dedupeAt = dedupeMap[dedupeKey] || 0;
    if (dedupeKey && dedupeAt && Date.now() - dedupeAt < 5000) return;
    if (dedupeKey) {
      dedupeMap[dedupeKey] = Date.now();
      global.__PORTAL_CHAT_NOTIFY_DEDUPE__ = dedupeMap;
    }
    if (typeof global.portalStaffDmBumpUnreadOptimistic === "function") {
      global.portalStaffDmBumpUnreadOptimistic();
    }
    if (notifyOpts.suppressSound !== true) {
      playChatMessageAlertSound();
    }
    if (notifyOpts.suppressVibrate !== true && global.navigator && global.navigator.vibrate) {
      try {
        global.navigator.vibrate([120, 55, 120, 55, 160]);
      } catch (_v) {}
    }
    var appVisible =
      global.document && String(global.document.visibilityState || "") === "visible";
    var tag = "portal-chat-live-" + String((row && row.id) || Date.now());
    if (appVisible && notifyOpts.suppressVisual !== true) {
      portalShowChatLogoAlert(title, preview);
    } else if (!appVisible && notifyOpts.fromServerPush) {
      /* Background/killed: service worker owns OS notifications — do not duplicate from the page. */
    } else if (!appVisible && typeof global.portalStaffNotifyOsWhiteTile === "function") {
      global.portalStaffNotifyOsWhiteTile(title, preview, tag);
    }
    if (typeof global.syncPortalHeaderAlertChrome === "function") {
      global.syncPortalHeaderAlertChrome(
        typeof global.portalReminderState === "function" ? global.portalReminderState() : null
      );
    }
    if (typeof global.portalStaffDmSyncUnreadChrome === "function") {
      void global.portalStaffDmSyncUnreadChrome();
    }
  }

  function portalChatPushShouldIgnore(data) {
    data = data || {};
    var senderId = String(data.senderUserId || data.authorId || "").trim();
    var targetUserId = String(data.targetUserId || "").trim();
    if (
      global.portalChatActorIdentity &&
      typeof global.portalChatActorIdentity.isSelfUserId === "function"
    ) {
      if (senderId && global.portalChatActorIdentity.isSelfUserId(senderId)) {
        return true;
      }
      if (targetUserId && !global.portalChatActorIdentity.isSelfUserId(targetUserId)) {
        return true;
      }
    }
    return false;
  }

  function handleChatPushMessage(data, opts) {
    opts = opts || {};
    if (!data || data.portalOpen !== "chat") return;
    if (portalChatPushShouldIgnore(data)) return;
    var chat = data.chat || {};
    var threadId = String(chat.threadId || chat.thread_id || "").trim();
    var groupId = String(chat.groupId || chat.group_id || "").trim();
    if (!threadId && !groupId) {
      if (opts.fromNotificationClick) {
        if (typeof global.portalOpenInternalChatFromHeaderQuickMenu === "function") {
          global.portalOpenInternalChatFromHeaderQuickMenu();
        }
      }
      return;
    }
    if (!opts.fromNotificationClick) {
      portalStaffNotifyIncomingChat(
        data.title,
        data.body,
        { id: data.tag || "" },
        { fromServerPush: true }
      );
      return;
    }
    void portalOpenInternalChatFromPush(chat);
  }

  function bindChatPushMessages() {
    if (!("serviceWorker" in global.navigator)) return;
    if (global.__PORTAL_CHAT_PUSH_BOUND__) return;
    global.__PORTAL_CHAT_PUSH_BOUND__ = true;
    try {
      global.navigator.serviceWorker.addEventListener("message", function (ev) {
        try {
          var d = ev.data;
          if (!d || !d.type) return;
          if (d.type === "portal-push-received" && d.portalOpen === "chat") {
            handleChatPushMessage(d, { fromNotificationClick: false });
            return;
          }
          if (d.type === "portal-notification-click" && d.portalOpen === "chat") {
            handleChatPushMessage(d, { fromNotificationClick: true });
          }
        } catch (_e) {}
      });
    } catch (_e2) {}
  }

  function consumeChatOpenQueryOnReady() {
    var parsed = parseChatOpenQuery();
    if (!parsed) return;
    clearChatOpenQuery();
    var run = function () {
      void portalOpenInternalChatFromPush(parsed);
    };
    if (global.__PORTAL_SUPABASE__ && global.__PORTAL_SUPABASE__.client) {
      run();
      return;
    }
    global.addEventListener("portal:supabase-ready", run, { once: true });
  }

  global.portalOpenInternalChatFromPush = portalOpenInternalChatFromPush;
  global.portalStaffToast = portalStaffToast;
  global.portalStaffShowChatPushToast = portalStaffShowChatPushToast;
  global.portalShowChatLogoAlert = portalShowChatLogoAlert;
  global.portalStaffNotifyIncomingChat = portalStaffNotifyIncomingChat;
  global.portalPlayChatMessageAlertSound = playChatMessageAlertSound;
  global.portalPrimeChatAlertAudio = primeChatAlertAudio;
  global.portalBindChatPushMessages = bindChatPushMessages;
  global.portalConsumeChatPushQuery = consumeChatOpenQueryOnReady;

  bindChatAlertAudioPrime();
  bindChatPushMessages();
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", consumeChatOpenQueryOnReady);
    } else {
      consumeChatOpenQueryOnReady();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
