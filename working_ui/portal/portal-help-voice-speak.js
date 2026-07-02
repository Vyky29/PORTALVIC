/**
 * Portal help voice — ElevenLabs TTS via portal-help-voice-speak Edge Function.
 */
(function (global) {
  "use strict";

  var cfg = {
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "https://cklpnwhlqsulpmkipmqb.supabase.co";
    },
    getAnonKey: function () {
      return "";
    },
  };

  var availability = {
    checked: false,
    elevenlabs: false,
    voiceId: "",
  };

  var activeAudio = null;

  // Shared audio element reused for every clip. iOS only lets an element play
  // after it was started inside a real user gesture, so we "unlock" this one on
  // the first tap; later async playback (after fetch) then works.
  var voiceEl = null;
  var audioUnlocked = false;
  // 0.05s silent WAV — enough to mark the element as user-activated on iOS.
  var SILENT_WAV =
    "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA";

  function ensureVoiceEl() {
    if (!voiceEl && typeof global.Audio === "function") {
      voiceEl = new global.Audio();
      try {
        voiceEl.setAttribute("playsinline", "");
      } catch (_p) {}
      voiceEl.preload = "auto";
    }
    return voiceEl;
  }

  function unlockAudio() {
    if (audioUnlocked) return;
    var el = ensureVoiceEl();
    if (!el) return;
    try {
      el.src = SILENT_WAV;
      el.muted = true;
      var p = el.play();
      var finish = function () {
        try {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
        } catch (_f) {}
        audioUnlocked = true;
      };
      if (p && typeof p.then === "function") {
        p.then(finish).catch(function () {
          try {
            el.muted = false;
          } catch (_m) {}
        });
      } else {
        finish();
      }
    } catch (_e) {}
  }

  function bindUnlockOnce() {
    if (!global.document || !global.document.addEventListener) return;
    var handler = function () {
      unlockAudio();
    };
    var opts = { passive: true };
    ["pointerdown", "touchend", "click", "keydown"].forEach(function (evt) {
      global.document.addEventListener(evt, handler, opts);
    });
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", bindUnlockOnce, { once: true });
    } else {
      bindUnlockOnce();
    }
  }

  function configure(options) {
    if (!options) return;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
  }

  function baseUrl() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function authToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  function stopPlayback() {
    try {
      if (activeAudio) {
        activeAudio.pause();
        if (activeAudio !== voiceEl) activeAudio.src = "";
        activeAudio = null;
      }
    } catch (_a) {}
    try {
      if (global.speechSynthesis) global.speechSynthesis.cancel();
    } catch (_s) {}
  }

  async function probe(force) {
    if (availability.checked && !force && availability.elevenlabs) {
      return availability;
    }
    try {
      var headers = { apikey: cfg.getAnonKey() };
      var token = await authToken();
      if (token) headers.Authorization = "Bearer " + token;
      var res = await fetch(baseUrl() + "/functions/v1/portal-help-voice-speak", {
        method: "GET",
        headers: headers,
      });
      var j = null;
      try {
        j = await res.json();
      } catch (_e) {
        j = null;
      }
      availability = {
        checked: true,
        elevenlabs: !!(j && j.ok && j.elevenlabs),
        voiceId: j && j.voiceId ? String(j.voiceId) : "",
      };
    } catch (_e2) {
      availability = { checked: true, elevenlabs: false, voiceId: "" };
    }
    return availability;
  }

  function isAvailable() {
    return availability.checked ? availability.elevenlabs : false;
  }

  function speakWithBrowser(text) {
    return new Promise(function (resolve) {
      if (!global.speechSynthesis) {
        resolve(false);
        return;
      }
      var t = String(text || "").trim();
      if (!t) {
        resolve(false);
        return;
      }
      var utt = new global.SpeechSynthesisUtterance(t);
      utt.lang = /[áéíóúñ¿¡]/i.test(t) ? "es-ES" : "en-GB";
      utt.onend = function () {
        resolve(true);
      };
      utt.onerror = function () {
        resolve(false);
      };
      try {
        global.speechSynthesis.speak(utt);
      } catch (_e) {
        resolve(false);
      }
    });
  }

  async function speak(text) {
    var t = String(text || "").trim();
    if (!t) return { ok: false, error: "missing_text" };

    stopPlayback();

    var token = await authToken();
    if (!token) {
      var spoke = await speakWithBrowser(t);
      return spoke ? { ok: true, source: "browser" } : { ok: false, error: "session_expired" };
    }

    try {
      var res = await fetch(baseUrl() + "/functions/v1/portal-help-voice-speak", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
        body: JSON.stringify({ text: t }),
      });
      var j = null;
      try {
        j = await res.json();
      } catch (_e) {
        j = null;
      }
      if (res.ok && j && j.ok && j.audioBase64) {
        var mime = j.mime ? String(j.mime) : "audio/mpeg";
        var src = "data:" + mime + ";base64," + String(j.audioBase64);
        var audio = ensureVoiceEl() || new Audio();
        audio.muted = false;
        audio.src = src;
        activeAudio = audio;
        var played = await new Promise(function (resolvePlay) {
          audio.onended = function () {
            if (activeAudio === audio) activeAudio = null;
            resolvePlay(true);
          };
          audio.onerror = function () {
            resolvePlay(false);
          };
          var p = audio.play();
          if (p && typeof p.then === "function") {
            p.catch(function () {
              resolvePlay(false);
            });
          }
        });
        if (played) return { ok: true, source: "elevenlabs" };
      }
    } catch (_fetch) {}

    var browserOk = await speakWithBrowser(t);
    if (browserOk) {
      return { ok: true, source: "browser" };
    }
    return { ok: false, error: "speak_failed" };
  }

  async function speakSequence(lines, onStep) {
    var list = Array.isArray(lines) ? lines : [];
    if (!list.length) return { ok: false, error: "missing_text" };
    for (var i = 0; i < list.length; i++) {
      var line = String(list[i] || "").trim();
      if (!line) continue;
      if (typeof onStep === "function") {
        try {
          onStep(i, line);
        } catch (_s) {}
      }
      var res = await speak(line);
      if (!res || !res.ok) return res || { ok: false, error: "speak_failed" };
    }
    return { ok: true };
  }

  function extForMime(mime) {
    var m = String(mime || "").toLowerCase();
    if (m.indexOf("ogg") >= 0) return "ogg";
    if (m.indexOf("mp4") >= 0 || m.indexOf("m4a") >= 0 || m.indexOf("aac") >= 0) return "m4a";
    if (m.indexOf("mpeg") >= 0 || m.indexOf("mp3") >= 0) return "mp3";
    if (m.indexOf("wav") >= 0) return "wav";
    return "webm";
  }

  // Send a recorded audio Blob to the existing Whisper Edge Function
  // (portal-feedback-voice-transcribe, verify_jwt disabled) and get text.
  async function transcribe(blob) {
    if (!blob || !blob.size) return { ok: false, error: "empty_audio" };
    var token = await authToken();
    if (!token) return { ok: false, error: "session_expired" };
    try {
      var type = blob.type || "audio/webm";
      var form = new FormData();
      form.append("file", blob, "speech." + extForMime(type));
      form.append("language", "en");
      var res = await fetch(baseUrl() + "/functions/v1/portal-feedback-voice-transcribe", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
        body: form,
      });
      var j = null;
      try {
        j = await res.json();
      } catch (_e) {
        j = null;
      }
      if (res.ok && j && j.ok) {
        var text = String((j.english != null ? j.english : j.text) || "").trim();
        return { ok: true, text: text };
      }
      return { ok: false, error: (j && j.error) || res.statusText || "transcribe_failed" };
    } catch (_f) {
      return { ok: false, error: "network_error" };
    }
  }

  global.PortalHelpVoiceSpeak = {
    configure: configure,
    probe: probe,
    isAvailable: isAvailable,
    speak: speak,
    speakSequence: speakSequence,
    stop: stopPlayback,
    unlock: unlockAudio,
    transcribe: transcribe,
  };
})(typeof window !== "undefined" ? window : globalThis);
