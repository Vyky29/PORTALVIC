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
    var token = await authToken();
    if (!token) {
      if (!force && availability.checked) return availability;
      availability = { checked: true, elevenlabs: false, voiceId: "" };
      return availability;
    }
    if (availability.checked && !force && availability.elevenlabs) {
      return availability;
    }
    try {
      var res = await fetch(baseUrl() + "/functions/v1/portal-help-voice-speak", {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
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
    if (!global.speechSynthesis) return false;
    var t = String(text || "").trim();
    if (!t) return false;
    var utt = new global.SpeechSynthesisUtterance(t);
    utt.lang = /[áéíóúñ¿¡]/i.test(t) ? "es-ES" : "en-GB";
    try {
      global.speechSynthesis.speak(utt);
      return true;
    } catch (_e) {
      return false;
    }
  }

  async function speak(text) {
    var t = String(text || "").trim();
    if (!t) return { ok: false, error: "missing_text" };

    stopPlayback();

    var token = await authToken();
    if (!token) {
      return speakWithBrowser(t) ? { ok: true, source: "browser" } : { ok: false, error: "session_expired" };
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
        audio.onended = function () {
          if (activeAudio === audio) activeAudio = null;
        };
        try {
          await audio.play();
          return { ok: true, source: "elevenlabs" };
        } catch (_play) {
          // Autoplay blocked (no gesture yet) — fall back to browser speech.
        }
      }
    } catch (_fetch) {}

    if (speakWithBrowser(t)) {
      return { ok: true, source: "browser" };
    }
    return { ok: false, error: "speak_failed" };
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onloadend = function () {
        var result = String(reader.result || "");
        var comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () {
        reject(reader.error || new Error("read_failed"));
      };
      reader.readAsDataURL(blob);
    });
  }

  // Send a recorded audio Blob to OpenAI Whisper (server side) and get text.
  async function transcribe(blob) {
    if (!blob || !blob.size) return { ok: false, error: "empty_audio" };
    var token = await authToken();
    if (!token) return { ok: false, error: "session_expired" };
    var b64;
    try {
      b64 = await blobToBase64(blob);
    } catch (_b) {
      return { ok: false, error: "encode_failed" };
    }
    try {
      var res = await fetch(baseUrl() + "/functions/v1/portal-voice-transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
        body: JSON.stringify({ audioBase64: b64, mime: blob.type || "audio/webm" }),
      });
      var j = null;
      try {
        j = await res.json();
      } catch (_e) {
        j = null;
      }
      if (res.ok && j && j.ok) {
        return { ok: true, text: String(j.text || "").trim() };
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
    stop: stopPlayback,
    unlock: unlockAudio,
    transcribe: transcribe,
  };
})(typeof window !== "undefined" ? window : globalThis);
