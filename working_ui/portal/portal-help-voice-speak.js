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
        activeAudio.src = "";
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
        var audio = new Audio("data:" + mime + ";base64," + String(j.audioBase64));
        activeAudio = audio;
        audio.onended = function () {
          if (activeAudio === audio) activeAudio = null;
        };
        await audio.play();
        return { ok: true, source: "elevenlabs" };
      }
    } catch (_fetch) {}

    if (speakWithBrowser(t)) {
      return { ok: true, source: "browser" };
    }
    return { ok: false, error: "speak_failed" };
  }

  global.PortalHelpVoiceSpeak = {
    configure: configure,
    probe: probe,
    isAvailable: isAvailable,
    speak: speak,
    stop: stopPlayback,
  };
})(typeof window !== "undefined" ? window : globalThis);
