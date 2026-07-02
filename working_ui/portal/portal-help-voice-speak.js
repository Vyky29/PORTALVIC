/**
 * Portal help voice — ElevenLabs TTS via portal-help-voice-speak Edge Function.
 * iOS: unlock + Blob URLs + visible audio fallback when autoplay blocked.
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
  var blobUrlCache = [];
  var voiceEl = null;
  var audioUnlocked = false;
  var audioCtx = null;

  var SILENT_WAV =
    "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA";

  function ensureVoiceEl() {
    if (!voiceEl && typeof global.Audio === "function") {
      voiceEl = new global.Audio();
      try {
        voiceEl.setAttribute("playsinline", "");
        voiceEl.setAttribute("webkit-playsinline", "true");
      } catch (_p) {}
      voiceEl.preload = "auto";
      voiceEl.playsInline = true;
    }
    return voiceEl;
  }

  function revokeBlobUrls() {
    for (var i = 0; i < blobUrlCache.length; i++) {
      try {
        URL.revokeObjectURL(blobUrlCache[i]);
      } catch (_r) {}
    }
    blobUrlCache = [];
  }

  function base64ToBlobUrl(base64, mime) {
    var bin = atob(String(base64 || ""));
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    var blob = new Blob([bytes], { type: mime || "audio/mpeg" });
    var url = URL.createObjectURL(blob);
    blobUrlCache.push(url);
    return url;
  }

  function resumeAudioContext() {
    try {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === "suspended") {
        var p = audioCtx.resume();
        if (p && typeof p.catch === "function") p.catch(function () {});
      }
    } catch (_e) {}
  }

  function unlockAudio() {
    resumeAudioContext();
    if (audioUnlocked) return;
    var el = ensureVoiceEl();
    if (!el) return;
    try {
      el.muted = true;
      el.src = SILENT_WAV;
      el.playsInline = true;
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
    try {
      if (global.speechSynthesis) {
        var warm = new global.SpeechSynthesisUtterance(" ");
        warm.volume = 0.01;
        global.speechSynthesis.speak(warm);
        global.speechSynthesis.cancel();
      }
    } catch (_w) {}
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
    if (!session || !session.access_token) {
      try {
        var refreshResp = await client.auth.refreshSession();
        session = refreshResp && refreshResp.data && refreshResp.data.session;
      } catch (_rf) {}
    }
    return session && session.access_token ? session.access_token : null;
  }

  function stopPlayback() {
    try {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio = null;
      }
    } catch (_a) {}
    revokeBlobUrls();
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

  function waitForVoices() {
    return new Promise(function (resolve) {
      if (!global.speechSynthesis) {
        resolve([]);
        return;
      }
      var voices = global.speechSynthesis.getVoices();
      if (voices && voices.length) {
        resolve(voices);
        return;
      }
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve(global.speechSynthesis.getVoices() || []);
      }
      global.speechSynthesis.onvoiceschanged = finish;
      setTimeout(finish, 400);
    });
  }

  function speakWithBrowser(text) {
    return new Promise(function (resolve) {
      if (!global.speechSynthesis) {
        resolve({ ok: false, error: "no_speech" });
        return;
      }
      var t = String(text || "").trim();
      if (!t) {
        resolve({ ok: false, error: "missing_text" });
        return;
      }
      waitForVoices().then(function (voices) {
        var started = false;
        var finished = false;
        function finish(ok, source) {
          if (finished) return;
          finished = true;
          resolve(ok ? { ok: true, source: source || "browser" } : { ok: false, error: "browser_speech_failed" });
        }
        var utt = new global.SpeechSynthesisUtterance(t);
        utt.lang = /[áéíóúñ¿¡]/i.test(t) ? "es-ES" : "en-GB";
        for (var i = 0; i < voices.length; i++) {
          var v = voices[i];
          if (v && v.lang && v.lang.indexOf("en-GB") === 0) {
            utt.voice = v;
            break;
          }
        }
        utt.onstart = function () {
          started = true;
        };
        utt.onend = function () {
          finish(started, "browser");
        };
        utt.onerror = function () {
          finish(false);
        };
        try {
          global.speechSynthesis.speak(utt);
        } catch (_e) {
          finish(false);
          return;
        }
        setTimeout(function () {
          if (!started && !global.speechSynthesis.speaking) finish(false);
        }, 800);
      });
    });
  }

  function playAudioSrc(src) {
    return new Promise(function (resolve) {
      var audio = ensureVoiceEl() || new global.Audio();
      audio.muted = false;
      audio.playsInline = true;
      audio.src = src;
      activeAudio = audio;
      var settled = false;
      function finish(ok) {
        if (settled) return;
        settled = true;
        resolve(!!ok);
      }
      audio.onended = function () {
        if (activeAudio === audio) activeAudio = null;
        finish(true);
      };
      audio.onerror = function () {
        finish(false);
      };
      var started = false;
      function tryPlay() {
        var p = audio.play();
        if (p && typeof p.then === "function") {
          p.then(function () {
            started = true;
          }).catch(function () {
            finish(false);
          });
        } else {
          started = true;
        }
      }
      audio.addEventListener(
        "canplaythrough",
        function () {
          tryPlay();
        },
        { once: true }
      );
      try {
        audio.load();
      } catch (_l) {
        tryPlay();
      }
      tryPlay();
      var maxMs = Math.min(120000, Math.max(8000, (audio.duration || 0) * 1000 + 4000));
      setTimeout(function () {
        if (!started && audio.paused) finish(false);
      }, 4000);
      setTimeout(function () {
        if (activeAudio === audio) finish(started || !audio.paused);
      }, maxMs);
    });
  }

  async function fetchElevenLabsAudio(text) {
    var token = await authToken();
    if (!token) return null;
    var res = await fetch(baseUrl() + "/functions/v1/portal-help-voice-speak", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
        apikey: cfg.getAnonKey(),
      },
      body: JSON.stringify({ text: String(text || "").trim() }),
    });
    var j = null;
    try {
      j = await res.json();
    } catch (_e) {
      j = null;
    }
    if (!res.ok || !j || !j.ok || !j.audioBase64) {
      return { error: (j && j.error) || "elevenlabs_failed", status: res.status };
    }
    var mime = j.mime ? String(j.mime) : "audio/mpeg";
    return { url: base64ToBlobUrl(j.audioBase64, mime) };
  }

  async function speakStaticUrl(url) {
    var u = String(url || "").trim();
    if (!u) return { ok: false, error: "missing_audio" };
    stopPlayback();
    unlockAudio();
    var played = await playAudioSrc(u);
    return played ? { ok: true, source: "static" } : { ok: false, error: "static_play_failed", audioUrl: u };
  }

  async function speak(text, opts) {
    opts = opts || {};
    var t = String(text || "").trim();
    if (!t && !opts.staticUrl) return { ok: false, error: "missing_text" };

    stopPlayback();
    unlockAudio();

    var staticUrl = String(opts.staticUrl || "").trim();
    if (staticUrl && opts.preferStatic) {
      var staticFirst = await speakStaticUrl(staticUrl);
      if (staticFirst.ok) return staticFirst;
    }

    var token = await authToken();
    if (!token) {
      if (staticUrl) return speakStaticUrl(staticUrl);
      if (opts.fallbackBrowser === false) {
        return { ok: false, error: "session_expired" };
      }
      return speakWithBrowser(t);
    }

    try {
      var fetched = await fetchElevenLabsAudio(t);
      var blobUrl = fetched && fetched.url ? fetched.url : null;
      if (blobUrl) {
        var played = await playAudioSrc(blobUrl);
        if (played) return { ok: true, source: "elevenlabs" };
        if (staticUrl) {
          var afterPlayFail = await speakStaticUrl(staticUrl);
          if (afterPlayFail.ok) return afterPlayFail;
        }
        return { ok: false, error: "elevenlabs_play_failed", audioUrl: blobUrl };
      }
      if (staticUrl) {
        var afterFetchFail = await speakStaticUrl(staticUrl);
        if (afterFetchFail.ok) return afterFetchFail;
      }
      if (fetched && fetched.error) {
        return { ok: false, error: fetched.error };
      }
    } catch (_fetch) {
      if (staticUrl) {
        var afterErr = await speakStaticUrl(staticUrl);
        if (afterErr.ok) return afterErr;
      }
    }

    if (opts.fallbackBrowser === false) {
      return { ok: false, error: "elevenlabs_unavailable" };
    }
    return speakWithBrowser(t);
  }

  async function speakSequence(lines, onStep, stepOpts) {
    var list = Array.isArray(lines) ? lines : [];
    if (!list.length) return { ok: false, error: "missing_text" };
    stepOpts = stepOpts || [];
    for (var i = 0; i < list.length; i++) {
      var line = String(list[i] || "").trim();
      if (!line) continue;
      if (typeof onStep === "function") {
        try {
          onStep(i, line);
        } catch (_s) {}
      }
      var opt = stepOpts[i] && typeof stepOpts[i] === "object" ? stepOpts[i] : {};
      var res = await speak(line, opt);
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
    speakStaticUrl: speakStaticUrl,
    stop: stopPlayback,
    unlock: unlockAudio,
    transcribe: transcribe,
  };
})(typeof window !== "undefined" ? window : globalThis);
