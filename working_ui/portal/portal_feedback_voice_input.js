/**
 * Session feedback voice — Web Speech (English) or Whisper (Español/Italiano → English).
 */
(function (global) {
  "use strict";

  var LANG_KEY = "portalFbVoiceLang_v1";
  var WHISPER_FN = "portal-feedback-voice-transcribe";
  var MAX_TRANSLATE_CHUNK = 450;
  var SILENCE_STOP_MS = 2800;
  var SILENCE_STOP_TRANSLATE_MS = 3600;
  var MAX_RECORD_MS = 90000;
  var TRANSLATE_DEBOUNCE_MS = 700;

  var ALL_LANGS = [
    { value: "en-GB", label: "English", translate: false, whisperCode: "en" },
    { value: "es-ES", label: "Español", translate: true, code: "es", whisperCode: "es" },
    { value: "it-IT", label: "Italiano", translate: true, code: "it", whisperCode: "it" },
  ];

  var ITALIAN_STAFF = { roberto: 1, giuseppe: 1 };
  var SPANISH_STAFF = {
    aurora: 1,
    javier: 1,
    javi: 1,
    angel: 1,
    victor: 1,
    sandra: 1,
    raul: 1,
    carlos: 1,
    andres: 1,
  };

  var activeRec = null;
  var session = null;
  var whisperAvailable = false;
  var whisperProbeDone = false;

  var ui = {
    bar: null,
    label: null,
    select: null,
    hint: null,
    allowedLangs: ALL_LANGS.slice(0, 1),
    staffGroup: "english",
    staffName: "",
  };

  function getSpeechRecognition() {
    return global.SpeechRecognition || global.webkitSpeechRecognition || null;
  }

  function injectStyles() {
    if (document.getElementById("portal-fb-voice-styles")) return;
    var st = document.createElement("style");
    st.id = "portal-fb-voice-styles";
    st.textContent =
      ".portal-fb-voice-lang{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 14px;padding:12px 14px;border-radius:14px;border:1px solid rgba(180,145,90,.28);background:linear-gradient(180deg,#faf9f6 0%,#f5f2ec 100%);min-width:0}" +
      ".portal-fb-voice-lang--single .portal-fb-voice-lang-label,.portal-fb-voice-lang--single .portal-fb-voice-lang-select{display:none}" +
      ".portal-fb-voice-lang-label{font-size:13px;font-weight:700;color:rgba(11,18,32,.88);flex-shrink:0}" +
      ".portal-fb-voice-lang-select{min-width:0;max-width:100%;font-size:13px;padding:8px 10px;border-radius:10px;border:1px solid rgba(180,145,90,.38);background:#fff;color:#0b1220}" +
      ".portal-fb-voice-lang-hint{flex:1 1 100%;margin:0;font-size:12px;line-height:1.45;color:#5b6473;min-width:0;overflow-wrap:break-word}" +
      ".portal-fb-voice-wrap{display:flex;flex-direction:column;gap:8px;min-width:0;width:100%}" +
      ".portal-fb-voice-wrap textarea{min-width:0;width:100%}" +
      ".portal-fb-voice-wrap--live textarea{outline:2px solid rgba(220,38,38,.25)}" +
      ".portal-fb-voice-bar{display:flex;align-items:center;gap:10px;min-width:0;width:100%}" +
      ".portal-fb-voice-mic{flex-shrink:0;width:44px;height:44px;border-radius:50%;border:1px solid rgba(180,145,90,.38);background:#fff;color:#6b4a18;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;line-height:1}" +
      ".portal-fb-voice-mic:hover{background:#faf9f6}" +
      ".portal-fb-voice-mic:disabled{opacity:.5;cursor:not-allowed}" +
      ".portal-fb-voice-mic--rec{background:#fee2e2;border-color:#fca5a5;color:#b91c1c;animation:portal-fb-voice-pulse 1s ease infinite}" +
      "@keyframes portal-fb-voice-pulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.35)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}" +
      ".portal-fb-voice-status{flex:1;min-width:0;font-size:12px;line-height:1.4;color:#5b6473;overflow-wrap:break-word}";
    document.head.appendChild(st);
  }

  function normalizeToken(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function nameTokens(staffName) {
    var raw = String(staffName || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return raw
      .split(/[\s,._-]+/)
      .map(normalizeToken)
      .filter(Boolean);
  }

  function resolveStaffVoiceGroup(staffName) {
    var tokens = nameTokens(staffName);
    var i;
    for (i = 0; i < tokens.length; i++) {
      if (ITALIAN_STAFF[tokens[i]]) return "italian";
    }
    for (i = 0; i < tokens.length; i++) {
      if (SPANISH_STAFF[tokens[i]]) return "spanish";
    }
    return "english";
  }

  function langsForGroup(group) {
    if (group === "italian") return [ALL_LANGS[2], ALL_LANGS[0]];
    if (group === "spanish") return [ALL_LANGS[1], ALL_LANGS[0]];
    return [ALL_LANGS[0]];
  }

  function defaultLangForGroup(group) {
    if (group === "italian") return "it-IT";
    if (group === "spanish") return "es-ES";
    return "en-GB";
  }

  function getLangConfig(langValue) {
    var i;
    for (i = 0; i < ALL_LANGS.length; i++) {
      if (ALL_LANGS[i].value === langValue) return ALL_LANGS[i];
    }
    return ALL_LANGS[0];
  }

  function langAllowed(langValue) {
    var i;
    for (i = 0; i < ui.allowedLangs.length; i++) {
      if (ui.allowedLangs[i].value === langValue) return true;
    }
    return false;
  }

  function getStoredLang() {
    try {
      var v = sessionStorage.getItem(LANG_KEY);
      if (v) return v;
    } catch (_) {}
    return "";
  }

  function storeLang(v) {
    try {
      sessionStorage.setItem(LANG_KEY, v);
    } catch (_) {}
  }

  function hintForGroup(group) {
    if (group === "italian") {
      if (whisperAvailable) {
        return "Italiano: tap mic, speak clearly, tap again. We convert to English (best quality). English option uses live text.";
      }
      return "Tap mic, speak in Italiano or English. For Italiano we translate finished phrases to English — speak slowly. Or pick English if easier.";
    }
    if (group === "spanish") {
      if (whisperAvailable) {
        return "Español: tap mic, speak clearly, tap again. We convert to English (best quality). English option uses live text.";
      }
      return "Tap mic, speak in Español or English. For Español we translate finished phrases to English — speak slowly. Or pick English if easier.";
    }
    return "Tap mic and speak in English. Text updates as you talk. Tap mic again or pause to stop.";
  }

  function refreshHint() {
    if (!ui.hint) return;
    ui.hint.textContent = hintForGroup(ui.staffGroup);
    if (!getSpeechRecognition() && !whisperAvailable) {
      ui.hint.textContent +=
        " Voice works best in Chrome (Android or desktop). You can still type below.";
    }
  }

  function applyStaffLanguages(staffName) {
    if (!ui.select || !ui.bar) return;
    ui.staffName = String(staffName || "");
    var group = resolveStaffVoiceGroup(ui.staffName);
    ui.staffGroup = group;
    ui.allowedLangs = langsForGroup(group);

    var stored = getStoredLang();
    var pick = langAllowed(stored) ? stored : defaultLangForGroup(group);
    storeLang(pick);

    ui.select.replaceChildren();
    ui.allowedLangs.forEach(function (l) {
      var opt = document.createElement("option");
      opt.value = l.value;
      opt.textContent = l.label;
      ui.select.appendChild(opt);
    });
    ui.select.value = pick;

    if (group === "english") {
      ui.bar.classList.add("portal-fb-voice-lang--single");
    } else {
      ui.bar.classList.remove("portal-fb-voice-lang--single");
    }

    refreshHint();
  }

  function supabaseFnUrl() {
    var base = String(
      (global.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co").replace(/\/$/, "")
    );
    return base + "/functions/v1/" + WHISPER_FN;
  }

  function getAnonKey() {
    return String(global.SUPABASE_ANON_KEY || "").trim();
  }

  function probeWhisperAvailability() {
    if (whisperProbeDone) return Promise.resolve(whisperAvailable);
    whisperProbeDone = true;
    var key = getAnonKey();
    if (!key) return Promise.resolve(false);
    return fetch(supabaseFnUrl(), {
      method: "GET",
      headers: { apikey: key },
    })
      .then(function (res) {
        if (!res.ok) return false;
        return res.json();
      })
      .then(function (data) {
        whisperAvailable = !!(data && data.whisper);
        refreshHint();
        return whisperAvailable;
      })
      .catch(function () {
        whisperAvailable = false;
        return false;
      });
  }

  function getAuthHeaders() {
    var key = getAnonKey();
    if (!key) return Promise.resolve(null);
    var sharedBase =
      global.PORTAL_SHARED_JS_BASE ||
      (typeof location !== "undefined" ? location.origin + "/portal-shared-js" : "/portal-shared-js");
    var modUrl = String(sharedBase).replace(/\/$/, "") + "/supabase-client.js";
    return import(modUrl)
      .then(function (mod) {
        var client = mod.getSupabaseClient();
        return client.auth.getSession().then(function (res) {
          var tok = res && res.data && res.data.session && res.data.session.access_token;
          if (!tok) return null;
          return { apikey: key, Authorization: "Bearer " + tok };
        });
      })
      .catch(function () {
        return null;
      });
  }

  function whisperTranscribe(blob, mime, whisperCode) {
    return getAuthHeaders().then(function (headers) {
      if (!headers) throw new Error("not_signed_in");
      var fd = new FormData();
      fd.append("file", blob, "feedback.webm");
      fd.append("language", whisperCode || "en");
      return fetch(supabaseFnUrl(), {
        method: "POST",
        headers: headers,
        body: fd,
      }).then(function (res) {
        return res.json().then(function (data) {
          if (res.status === 503 && data && data.fallback === "webspeech") {
            throw new Error("no_openai");
          }
          if (!res.ok || !data || !data.ok) throw new Error("transcribe_failed");
          return String(data.english || "").trim();
        });
      });
    });
  }

  function pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    var types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/ogg"];
    for (var i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  function chunkText(text, maxLen) {
    var parts = [];
    var rest = String(text || "").trim();
    while (rest.length > maxLen) {
      var cut = rest.lastIndexOf(" ", maxLen);
      if (cut < Math.floor(maxLen * 0.45)) cut = maxLen;
      parts.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) parts.push(rest);
    return parts;
  }

  function translateChunk(text, fromCode) {
    var url =
      "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) +
      "&langpair=" +
      encodeURIComponent(fromCode + "|en");
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("translate_http");
        return res.json();
      })
      .then(function (data) {
        if (data.responseStatus && Number(data.responseStatus) !== 200) {
          throw new Error(String(data.responseDetails || "translate_failed"));
        }
        return String((data.responseData && data.responseData.translatedText) || text).trim();
      });
  }

  function translateToEnglish(text, fromCode) {
    var parts = chunkText(text, MAX_TRANSLATE_CHUNK);
    if (!parts.length) return Promise.resolve("");
    var out = [];
    var chain = Promise.resolve();
    parts.forEach(function (part) {
      chain = chain.then(function () {
        return translateChunk(part, fromCode).then(function (t) {
          out.push(t);
        });
      });
    });
    return chain.then(function () {
      return out.join(" ").replace(/\s+/g, " ").trim();
    });
  }

  function composePrefix(prefix, live) {
    var p = String(prefix || "").trim();
    var l = String(live || "").replace(/\s+/g, " ").trim();
    if (!l) return p;
    if (!p) return l;
    return p + (p.slice(-1).match(/[.!?]/) ? " " : ". ") + l;
  }

  function dispatchInput(ta) {
    try {
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (_) {}
  }

  function clearSessionTimers(s) {
    if (!s) return;
    if (s.silenceTimer) {
      clearTimeout(s.silenceTimer);
      s.silenceTimer = null;
    }
    if (s.maxTimer) {
      clearTimeout(s.maxTimer);
      s.maxTimer = null;
    }
    if (s.translateTimer) {
      clearTimeout(s.translateTimer);
      s.translateTimer = null;
    }
  }

  function pickBestTranscript(result) {
    if (!result || !result.length) return "";
    var best = result[0].transcript;
    var bestConf = typeof result[0].confidence === "number" ? result[0].confidence : 0;
    for (var j = 1; j < result.length; j++) {
      var conf = typeof result[j].confidence === "number" ? result[j].confidence : 0;
      if (conf > bestConf) {
        bestConf = conf;
        best = result[j].transcript;
      }
    }
    return String(best || "").trim();
  }

  function syncResultsFromEvent(s, results) {
    var finals = [];
    var interim = "";
    var i;
    for (i = 0; i < results.length; i++) {
      var text = pickBestTranscript(results[i]);
      if (!text) continue;
      if (results[i].isFinal) finals.push(text);
      else interim = text;
    }
    s.finalChunks = finals;
    s.interimText = interim;
  }

  function finalSourceText(s) {
    return s.finalChunks.join(" ").replace(/\s+/g, " ").trim();
  }

  function liveSourceText(s) {
    var finals = finalSourceText(s);
    var interim = String(s.interimText || "").replace(/\s+/g, " ").trim();
    if (finals && interim) return finals + " " + interim;
    return finals || interim;
  }

  function setLiveTextarea(s, liveEnglish) {
    if (!s || !s.textarea) return;
    s.textarea.value = composePrefix(s.prefix, liveEnglish);
    dispatchInput(s.textarea);
  }

  function silenceMsFor(s) {
    return s && s.needsTranslate ? SILENCE_STOP_TRANSLATE_MS : SILENCE_STOP_MS;
  }

  function bumpSilenceTimer(s) {
    if (!s || s.stopRequested) return;
    if (s.silenceTimer) clearTimeout(s.silenceTimer);
    s.silenceTimer = setTimeout(function () {
      requestStop(s, "pause");
    }, silenceMsFor(s));
  }

  function scheduleLiveTranslate(s) {
    if (!s || !s.needsTranslate) return;
    if (s.translateTimer) clearTimeout(s.translateTimer);
    s.translateTimer = setTimeout(function () {
      runLiveTranslate(s);
    }, TRANSLATE_DEBOUNCE_MS);
  }

  function runLiveTranslate(s) {
    if (!s || s.stopRequested) return;
    var source = finalSourceText(s);
    if (!source) return;

    s.translateSeq += 1;
    var seq = s.translateSeq;

    translateToEnglish(source, s.translateCode)
      .then(function (english) {
        if (!session || session !== s || seq !== s.translateSeq) return;
        setLiveTextarea(s, english || source);
        if (s.statusEl && !s.stopRequested) {
          var heard = s.interimText ? ' Heard: "' + s.interimText + '"' : "";
          s.statusEl.textContent = "Listening… English updates when you pause." + heard;
        }
      })
      .catch(function () {
        if (!session || session !== s || seq !== s.translateSeq) return;
        if (s.statusEl && !s.stopRequested) {
          s.statusEl.textContent = "Listening… (translation slow — keep speaking)";
        }
      });
  }

  function pushLivePreview(s) {
    if (!s.needsTranslate) {
      var all = liveSourceText(s);
      if (!all) return;
      setLiveTextarea(s, all);
      if (s.statusEl) s.statusEl.textContent = "Listening… text updates live.";
      return;
    }

    var interim = String(s.interimText || "").trim();
    if (interim && s.statusEl) {
      s.statusEl.textContent = 'Listening… heard: "' + interim + '"';
    }

    if (finalSourceText(s)) scheduleLiveTranslate(s);
  }

  function requestStop(s, reason) {
    if (!s || s.stopRequested) return;
    s.stopRequested = true;
    clearSessionTimers(s);
    if (s.statusEl) {
      s.statusEl.textContent =
        reason === "pause" ? "Stopped — paused." : "Stopping…";
    }

    if (s.mode === "whisper") {
      if (s.recorder && s.recorder.state === "recording") {
        try {
          s.recorder.stop();
        } catch (_) {
          finishWhisperSession(s);
        }
      } else {
        finishWhisperSession(s);
      }
      return;
    }

    if (s.rec) {
      try {
        s.rec.stop();
      } catch (_) {
        finishWebSpeechSession(s);
      }
    } else {
      finishWebSpeechSession(s);
    }
  }

  function resetMicButton(btn) {
    if (!btn) return;
    btn.classList.remove("portal-fb-voice-mic--rec");
    btn.setAttribute("aria-label", "Start voice input");
    btn.setAttribute("aria-pressed", "false");
    btn.disabled = false;
  }

  function cleanupSessionUi(s) {
    clearSessionTimers(s);
    var wrap = s.textarea && s.textarea.closest(".portal-fb-voice-wrap");
    if (wrap) wrap.classList.remove("portal-fb-voice-wrap--live");
    if (s.stream) {
      s.stream.getTracks().forEach(function (t) {
        try {
          t.stop();
        } catch (_) {}
      });
    }
    resetMicButton(s.btn);
    if (activeRec === s.rec) activeRec = null;
    if (session === s) session = null;
  }

  function finishWebSpeechSession(s) {
    if (!s) return;

    var source = finalSourceText(s);
    var hadSpeech = source.length > 0 || String(s.interimText || "").trim().length > 0;
    if (!hadSpeech) {
      hadSpeech = liveSourceText(s).length > 0;
      source = liveSourceText(s);
    }

    function wrapUp() {
      cleanupSessionUi(s);
      if (!hadSpeech) {
        if (s.textarea) s.textarea.value = s.prefix;
        if (s.statusEl) {
          s.statusEl.textContent = "No speech detected — tap mic and try again.";
        }
      } else if (s.statusEl) {
        s.statusEl.textContent = "Done — edit if needed before submit.";
      }
    }

    if (hadSpeech && s.needsTranslate) {
      if (s.statusEl) s.statusEl.textContent = "Translating to English…";
      translateToEnglish(source, s.translateCode)
        .then(function (english) {
          setLiveTextarea(s, english || source);
          wrapUp();
        })
        .catch(function () {
          setLiveTextarea(s, source);
          wrapUp();
        });
      return;
    }

    if (hadSpeech && !s.needsTranslate) {
      setLiveTextarea(s, source);
    }
    wrapUp();
  }

  function finishWhisperSession(s) {
    if (!s) return;
    clearSessionTimers(s);

    var wrap = s.textarea && s.textarea.closest(".portal-fb-voice-wrap");
    if (wrap) wrap.classList.remove("portal-fb-voice-wrap--live");

    var chunks = s.audioChunks || [];
    if (!chunks.length) {
      cleanupSessionUi(s);
      if (s.textarea) s.textarea.value = s.prefix;
      if (s.statusEl) s.statusEl.textContent = "No audio recorded — tap mic and try again.";
      return;
    }

    var mime = s.mime || "audio/webm";
    var blob = new Blob(chunks, { type: mime });
    if (s.statusEl) s.statusEl.textContent = "Converting speech to English…";
    if (s.btn) s.btn.disabled = true;

    whisperTranscribe(blob, mime, s.whisperCode)
      .then(function (english) {
        if (english) setLiveTextarea(s, english);
        cleanupSessionUi(s);
        if (s.statusEl) {
          s.statusEl.textContent = english
            ? "Done — edit if needed before submit."
            : "No speech detected — tap mic and try again.";
        }
      })
      .catch(function (err) {
        cleanupSessionUi(s);
        if (s.textarea) s.textarea.value = s.prefix;
        var msg = "Could not transcribe — try English or type manually.";
        if (err && err.message === "not_signed_in") {
          msg = "Sign in to the portal to use voice in Español.";
        } else if (err && err.message === "no_openai") {
          msg = "Español voice needs server setup — use English or type for now.";
        }
        if (s.statusEl) s.statusEl.textContent = msg;
      });
  }

  function stopActiveSession() {
    if (session) requestStop(session, "manual");
  }

  function shouldUseWhisper(cfg) {
    return !!(whisperAvailable && cfg && cfg.translate);
  }

  function startWhisperCapture(textarea, btn, statusEl, langValue) {
    if (session && session.btn === btn) {
      requestStop(session, "manual");
      return;
    }
    if (session) stopActiveSession();

    var lang = langAllowed(langValue) ? langValue : defaultLangForGroup(ui.staffGroup);
    var cfg = getLangConfig(lang);
    if (!cfg.translate) {
      startWebSpeechCapture(textarea, btn, statusEl, langValue);
      return;
    }

    var mime = pickMime();
    if (!mime || typeof MediaRecorder === "undefined") {
      startWebSpeechCapture(textarea, btn, statusEl, langValue);
      return;
    }

    var s = {
      mode: "whisper",
      btn: btn,
      statusEl: statusEl,
      textarea: textarea,
      prefix: String(textarea.value || ""),
      whisperCode: cfg.whisperCode || cfg.code || "es",
      audioChunks: [],
      mime: mime,
      recorder: null,
      stream: null,
      stopRequested: false,
      maxTimer: null,
    };
    session = s;

    var wrap = textarea.closest(".portal-fb-voice-wrap");
    if (wrap) wrap.classList.add("portal-fb-voice-wrap--live");

    btn.classList.add("portal-fb-voice-mic--rec");
    btn.setAttribute("aria-label", "Stop voice input");
    btn.setAttribute("aria-pressed", "true");
    if (statusEl) {
      statusEl.textContent = "Recording… speak clearly, tap mic when finished.";
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (stream) {
        if (session !== s) {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
          return;
        }
        s.stream = stream;
        var rec = new MediaRecorder(stream, { mimeType: mime });
        s.recorder = rec;
        rec.ondataavailable = function (ev) {
          if (ev.data && ev.data.size) s.audioChunks.push(ev.data);
        };
        rec.onstop = function () {
          if (session === s) finishWhisperSession(s);
        };
        rec.start(250);
        s.maxTimer = setTimeout(function () {
          requestStop(s, "max");
        }, MAX_RECORD_MS);
      })
      .catch(function () {
        if (statusEl) statusEl.textContent = "Microphone blocked — allow mic in settings.";
        cleanupSessionUi(s);
      });
  }

  function startWebSpeechCapture(textarea, btn, statusEl, langValue) {
    var Rec = getSpeechRecognition();
    if (!Rec) {
      if (statusEl) {
        statusEl.textContent =
          "Voice not supported in this browser — try Chrome on Android or desktop.";
      }
      return;
    }

    if (session && session.btn === btn) {
      requestStop(session, "manual");
      return;
    }

    if (session) stopActiveSession();

    var lang = langAllowed(langValue) ? langValue : defaultLangForGroup(ui.staffGroup);
    var cfg = getLangConfig(lang);

    var s = {
      mode: "webspeech",
      rec: null,
      btn: btn,
      statusEl: statusEl,
      textarea: textarea,
      prefix: String(textarea.value || ""),
      lang: lang,
      needsTranslate: !!cfg.translate,
      translateCode: cfg.code || "",
      finalChunks: [],
      interimText: "",
      stopRequested: false,
      silenceTimer: null,
      maxTimer: null,
      translateTimer: null,
      translateSeq: 0,
    };
    session = s;

    var wrap = textarea.closest(".portal-fb-voice-wrap");
    if (wrap) wrap.classList.add("portal-fb-voice-wrap--live");

    btn.classList.add("portal-fb-voice-mic--rec");
    btn.setAttribute("aria-label", "Stop voice input");
    btn.setAttribute("aria-pressed", "true");
    if (statusEl) {
      statusEl.textContent = s.needsTranslate
        ? "Listening… English updates when you finish each phrase."
        : "Listening… text updates as you speak.";
    }

    var rec = new Rec();
    s.rec = rec;
    activeRec = rec;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;

    rec.onresult = function (e) {
      if (s.stopRequested) return;
      syncResultsFromEvent(s, e.results);
      bumpSilenceTimer(s);
      pushLivePreview(s);
    };

    rec.onerror = function (e) {
      if (s.stopRequested) return;
      if (e.error === "aborted") return;
      var msg = "Voice error — try again.";
      if (e.error === "not-allowed") {
        msg = "Microphone blocked — allow mic in browser settings.";
      } else if (e.error === "no-speech") {
        requestStop(s, "pause");
        return;
      } else if (e.error === "network") {
        msg = "Network error — check connection and try again.";
      }
      if (statusEl) statusEl.textContent = msg;
      if (e.error !== "no-speech") requestStop(s, "error");
    };

    rec.onend = function () {
      if (session !== s) return;
      finishWebSpeechSession(s);
    };

    s.maxTimer = setTimeout(function () {
      requestStop(s, "max");
    }, MAX_RECORD_MS);

    try {
      rec.start();
    } catch (_) {
      if (statusEl) statusEl.textContent = "Could not start microphone.";
      finishWebSpeechSession(s);
    }
  }

  function startCapture(textarea, btn, statusEl, langValue) {
    var lang = langAllowed(langValue) ? langValue : defaultLangForGroup(ui.staffGroup);
    var cfg = getLangConfig(lang);
    if (shouldUseWhisper(cfg)) {
      startWhisperCapture(textarea, btn, statusEl, langValue);
    } else {
      startWebSpeechCapture(textarea, btn, statusEl, langValue);
    }
  }

  function wrapTextarea(ta) {
    if (!ta || ta.dataset.portalFbVoiceWired === "1") return;
    ta.dataset.portalFbVoiceWired = "1";

    var wrap = document.createElement("div");
    wrap.className = "portal-fb-voice-wrap";
    ta.parentNode.insertBefore(wrap, ta);
    wrap.appendChild(ta);

    var bar = document.createElement("div");
    bar.className = "portal-fb-voice-bar";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "portal-fb-voice-mic";
    btn.setAttribute("aria-label", "Start voice input");
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">' +
      '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z"/>' +
      "</svg>";

    var statusEl = document.createElement("span");
    statusEl.className = "portal-fb-voice-status";
    statusEl.setAttribute("role", "status");
    statusEl.setAttribute("aria-live", "polite");

    bar.appendChild(btn);
    bar.appendChild(statusEl);
    wrap.appendChild(bar);

    btn.addEventListener("click", function () {
      var lang = ui.select ? ui.select.value : defaultLangForGroup(ui.staffGroup);
      startCapture(ta, btn, statusEl, lang);
    });
  }

  function createLangBar(insertBeforeEl) {
    var bar = document.createElement("div");
    bar.className = "portal-fb-voice-lang";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Voice input language");

    var label = document.createElement("label");
    label.className = "portal-fb-voice-lang-label";
    label.setAttribute("for", "portalFbVoiceLang");
    label.textContent = "Voice language";

    var sel = document.createElement("select");
    sel.id = "portalFbVoiceLang";
    sel.className = "portal-fb-voice-lang-select";
    sel.addEventListener("change", function () {
      storeLang(sel.value);
    });

    var hint = document.createElement("p");
    hint.className = "portal-fb-voice-lang-hint";

    bar.appendChild(label);
    bar.appendChild(sel);
    bar.appendChild(hint);

    if (insertBeforeEl && insertBeforeEl.parentNode) {
      insertBeforeEl.parentNode.insertBefore(bar, insertBeforeEl);
    }

    ui.bar = bar;
    ui.label = label;
    ui.select = sel;
    ui.hint = hint;

    return bar;
  }

  var initDone = false;

  function init(opts) {
    opts = opts || {};
    if (initDone) {
      if (opts.staffName) applyStaffLanguages(opts.staffName);
      return;
    }
    injectStyles();
    var fieldIds = opts.fields || [];
    if (!fieldIds.length) return;

    var firstEl = document.getElementById(fieldIds[0]);
    if (!firstEl) return;

    var anchor = firstEl.closest(".field") || firstEl;
    createLangBar(anchor);

    fieldIds.forEach(function (id) {
      wrapTextarea(document.getElementById(id));
    });

    initDone = true;
    applyStaffLanguages(opts.staffName || "");
    probeWhisperAvailability();
  }

  function setStaffName(staffName) {
    if (!initDone) return;
    applyStaffLanguages(staffName || "");
  }

  global.PortalFeedbackVoiceInput = {
    init: init,
    setStaffName: setStaffName,
  };
})(typeof window !== "undefined" ? window : this);
