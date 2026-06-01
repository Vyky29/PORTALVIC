/**
 * Session feedback — free voice input (Web Speech API + live MyMemory translate → English).
 */
(function (global) {
  "use strict";

  var LANG_KEY = "portalFbVoiceLang_v1";
  var MAX_TRANSLATE_CHUNK = 450;
  var SILENCE_STOP_MS = 2800;
  var MAX_RECORD_MS = 90000;
  var TRANSLATE_DEBOUNCE_MS = 550;

  var ALL_LANGS = [
    { value: "en-GB", label: "English", translate: false },
    { value: "es-ES", label: "Español", translate: true, code: "es" },
    { value: "it-IT", label: "Italiano", translate: true, code: "it" },
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

  var ui = {
    bar: null,
    label: null,
    select: null,
    hint: null,
    allowedLangs: ALL_LANGS.slice(0, 1),
    staffGroup: "english",
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
      return "Tap mic, speak in Italiano or English. English text updates as you talk. Tap mic again or pause to stop.";
    }
    if (group === "spanish") {
      return "Tap mic, speak in Español or English. English text updates as you talk. Tap mic again or pause to stop.";
    }
    return "Tap mic and speak in English. Text updates as you talk. Tap mic again or pause to stop.";
  }

  function applyStaffLanguages(staffName) {
    if (!ui.select || !ui.bar) return;
    var group = resolveStaffVoiceGroup(staffName);
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

    if (ui.hint) {
      ui.hint.textContent = hintForGroup(group);
      if (!getSpeechRecognition()) {
        ui.hint.textContent +=
          " Voice works best in Chrome (Android or desktop). You can still type below.";
      }
    }
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

  function liveSourceText(s) {
    var finals = s.finalChunks.join(" ").replace(/\s+/g, " ").trim();
    var interim = String(s.interimText || "").replace(/\s+/g, " ").trim();
    if (finals && interim) return finals + " " + interim;
    return finals || interim;
  }

  function setLiveTextarea(s, liveEnglish) {
    if (!s || !s.textarea) return;
    s.textarea.value = composePrefix(s.prefix, liveEnglish);
    dispatchInput(s.textarea);
  }

  function bumpSilenceTimer(s) {
    if (!s || s.stopRequested) return;
    if (s.silenceTimer) clearTimeout(s.silenceTimer);
    s.silenceTimer = setTimeout(function () {
      requestStop(s, "pause");
    }, SILENCE_STOP_MS);
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
    var source = liveSourceText(s);
    if (!source) return;

    s.translateSeq += 1;
    var seq = s.translateSeq;
    if (s.statusEl) s.statusEl.textContent = "Translating as you speak…";

    translateToEnglish(source, s.translateCode)
      .then(function (english) {
        if (!session || session !== s || seq !== s.translateSeq) return;
        setLiveTextarea(s, english || source);
        if (s.statusEl && !s.stopRequested) {
          s.statusEl.textContent = "Listening… English updates live.";
        }
      })
      .catch(function () {
        if (!session || session !== s || seq !== s.translateSeq) return;
        setLiveTextarea(s, source);
        if (s.statusEl && !s.stopRequested) {
          s.statusEl.textContent = "Listening… (translation slow — edit English after)";
        }
      });
  }

  function pushLivePreview(s) {
    var source = liveSourceText(s);
    if (!source) return;

    if (!s.needsTranslate) {
      setLiveTextarea(s, source);
      if (s.statusEl) s.statusEl.textContent = "Listening… text updates live.";
      return;
    }

    scheduleLiveTranslate(s);
  }

  function requestStop(s, reason) {
    if (!s || s.stopRequested) return;
    s.stopRequested = true;
    clearSessionTimers(s);
    if (s.statusEl) {
      s.statusEl.textContent =
        reason === "pause" ? "Stopped — paused." : "Stopping…";
    }
    if (s.rec) {
      try {
        s.rec.stop();
      } catch (_) {
        finishSession(s);
      }
    } else {
      finishSession(s);
    }
  }

  function resetMicButton(btn) {
    if (!btn) return;
    btn.classList.remove("portal-fb-voice-mic--rec");
    btn.setAttribute("aria-label", "Start voice input");
    btn.setAttribute("aria-pressed", "false");
    btn.disabled = false;
  }

  function finishSession(s) {
    if (!s) return;
    clearSessionTimers(s);

    var wrap = s.textarea && s.textarea.closest(".portal-fb-voice-wrap");
    if (wrap) wrap.classList.remove("portal-fb-voice-wrap--live");

    var source = liveSourceText(s);
    var hadSpeech = source.length > 0;

    function wrapUp() {
      if (!hadSpeech) {
        if (s.textarea) s.textarea.value = s.prefix;
        if (s.statusEl) {
          s.statusEl.textContent = "No speech detected — tap mic and try again.";
        }
      } else if (s.statusEl) {
        s.statusEl.textContent = "Done — edit if needed before submit.";
      }
      resetMicButton(s.btn);
      if (activeRec === s.rec) activeRec = null;
      if (session === s) session = null;
    }

    if (hadSpeech && s.needsTranslate) {
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

    wrapUp();
  }

  function stopActiveSession() {
    if (session) requestStop(session, "manual");
  }

  function startRecognition(textarea, btn, statusEl, langValue) {
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
        ? "Listening… English will update as you speak."
        : "Listening… text updates as you speak.";
    }

    var rec = new Rec();
    s.rec = rec;
    activeRec = rec;
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = function (e) {
      if (s.stopRequested) return;
      s.interimText = "";
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) s.finalChunks.push(t);
        else s.interimText = t;
      }
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
      finishSession(s);
    };

    s.maxTimer = setTimeout(function () {
      requestStop(s, "max");
    }, MAX_RECORD_MS);

    try {
      rec.start();
    } catch (_) {
      if (statusEl) statusEl.textContent = "Could not start microphone.";
      finishSession(s);
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
      startRecognition(ta, btn, statusEl, lang);
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
