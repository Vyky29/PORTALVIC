/**
 * Portal internal DM — voice messages (record → Storage → play in thread).
 * Requires migration 20260531120000_portal_dm_voice_messages.sql on Portal Supabase.
 */
(function (global) {
  "use strict";

  var BUCKET = "portal-dm-audio";
  var MAX_RECORD_MS = 300000;
  var MAX_BYTES = 8 * 1024 * 1024;
  var SIGNED_URL_SEC = 3600;
  var MSG_FIELDS =
    "id,author_id,body,created_at,message_type,audio_storage_path,audio_mime,duration_ms";

  var recordState = {
    recorder: null,
    stream: null,
    btn: null,
    startedAt: 0,
    timerId: null,
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function dmIcon(name) {
    var ic = global.portalDmIcons;
    return ic && typeof ic.svg === "function" ? ic.svg(name) : "";
  }

  function setPlayBtnState(btn, playing) {
    if (!btn) return;
    btn.innerHTML = dmIcon(playing ? "pause" : "play");
  }

  function formatDur(ms) {
    ms = Math.max(0, Number(ms) || 0);
    var sec = Math.floor(ms / 1000);
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function extForMime(mime) {
    var m = String(mime || "").toLowerCase();
    if (m.indexOf("ogg") >= 0) return "ogg";
    if (m.indexOf("mp4") >= 0 || m.indexOf("m4a") >= 0) return "m4a";
    if (m.indexOf("mpeg") >= 0 || m.indexOf("mp3") >= 0) return "mp3";
    if (m.indexOf("wav") >= 0) return "wav";
    return "webm";
  }

  function isVoice(m) {
    return String((m && m.message_type) || "text").toLowerCase() === "voice";
  }

  function injectStyles() {
    if (document.getElementById("portal-dm-voice-styles")) return;
    var st = document.createElement("style");
    st.id = "portal-dm-voice-styles";
    st.textContent =
      ".portal-dm-compose-row{display:flex;align-items:flex-end;gap:8px;width:100%;min-width:0;margin-top:10px}" +
      ".portal-dm-compose-row .txa,.portal-dm-compose-row textarea{flex:1;min-width:0;margin-top:0!important}" +
      ".portal-dm-voice-btn{flex-shrink:0;width:44px;height:44px;border-radius:50%;border:1px solid var(--line,#e2e8f0);background:var(--surface,#fff);color:var(--ink,#0f172a);font-size:18px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}" +
      ".portal-dm-voice-btn:hover{background:#f8fafc}" +
      ".portal-dm-voice-btn:disabled{opacity:.5;cursor:not-allowed}" +
      ".portal-dm-voice-btn--rec{background:#fee2e2;border-color:#fca5a5;color:#b91c1c;animation:portal-dm-voice-pulse 1s ease infinite}" +
      "@keyframes portal-dm-voice-pulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.35)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}" +
      ".portal-dm-voice-rec-hint{font-size:11px;color:#b91c1c;margin:4px 0 0;min-width:0}" +
      ".portal-dm-voice-msg{display:flex;align-items:center;gap:8px;min-width:0;max-width:100%;padding:4px 2px}" +
      ".portal-dm-voice-play{flex-shrink:0;width:36px;height:36px;border-radius:50%;border:0;background:rgba(15,23,42,.08);cursor:pointer;font-size:14px;line-height:1}" +
      ".portal-dm-msg--mine .portal-dm-voice-play{background:rgba(255,255,255,.35)}" +
      ".portal-dm-voice-track{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}" +
      ".portal-dm-voice-seek{width:100%;min-width:0;margin:0}" +
      ".portal-dm-voice-dur{font-size:11px;color:var(--muted,#64748b);font-variant-numeric:tabular-nums}" +
      ".portal-dm-voice-caption{margin-top:6px;font-size:13px;line-height:1.4;white-space:pre-wrap;overflow-wrap:break-word}";
    document.head.appendChild(st);
  }

  function pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    var types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      "audio/ogg",
    ];
    for (var i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  function stopRecording() {
    var g = typeof window !== "undefined" && window.PortalScreenshotGuard;
    if (g && typeof g.popMediaCaptureBypass === "function") {
      g.popMediaCaptureBypass("portal-dm-voice");
    }
    if (recordState.timerId) {
      clearTimeout(recordState.timerId);
      recordState.timerId = null;
    }
    if (recordState.recorder && recordState.recorder.state === "recording") {
      try {
        recordState.recorder.requestData();
      } catch (_e) {}
      try {
        recordState.recorder.stop();
      } catch (_e2) {}
    }
    if (recordState.stream) {
      recordState.stream.getTracks().forEach(function (t) {
        try {
          t.stop();
        } catch (_e3) {}
      });
    }
    if (recordState.btn) recordState.btn.classList.remove("portal-dm-voice-btn--rec");
    recordState.recorder = null;
    recordState.stream = null;
    recordState.btn = null;
    recordState.startedAt = 0;
  }

  function setHint(el, text) {
    if (!el) return;
    el.textContent = text || "";
    el.hidden = !text;
  }

  async function signedAudioUrl(client, path) {
    if (!client || !path) return "";
    var res = await client.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SEC);
    if (res.error || !res.data || !res.data.signedUrl) return "";
    return res.data.signedUrl;
  }

  function bindVoicePlayer(wrap, url, durationMs) {
    var audio = wrap.querySelector("audio");
    var playBtn = wrap.querySelector(".portal-dm-voice-play");
    var seek = wrap.querySelector(".portal-dm-voice-seek");
    var durEl = wrap.querySelector(".portal-dm-voice-dur");
    if (!audio || !playBtn || !seek) return;
    if (durEl) durEl.textContent = formatDur(durationMs);
    playBtn.addEventListener("click", function () {
      if (audio.paused) {
        try {
          audio.play();
        } catch (_e) {}
      } else {
        audio.pause();
      }
    });
    audio.addEventListener("play", function () {
      setPlayBtnState(playBtn, true);
    });
    audio.addEventListener("pause", function () {
      setPlayBtnState(playBtn, false);
    });
    audio.addEventListener("ended", function () {
      setPlayBtnState(playBtn, false);
      seek.value = "0";
    });
    audio.addEventListener("loadedmetadata", function () {
      if (durEl && audio.duration && isFinite(audio.duration)) {
        durEl.textContent = formatDur(audio.duration * 1000);
      }
    });
    audio.addEventListener("timeupdate", function () {
      if (!audio.duration || !isFinite(audio.duration)) return;
      seek.value = String(Math.round((audio.currentTime / audio.duration) * 100));
    });
    seek.addEventListener("input", function () {
      if (!audio.duration || !isFinite(audio.duration)) return;
      audio.currentTime = (Number(seek.value) / 100) * audio.duration;
    });
    if (url) audio.src = url;
  }

  async function fillMessageBody(host, m, client, escFn) {
    escFn = escFn || esc;
    var typ = String((m && m.message_type) || "text").toLowerCase();
    if (
      (typ === "image" || typ === "file") &&
      global.portalDmAttachments &&
      typeof global.portalDmAttachments.fillMessageBody === "function"
    ) {
      await global.portalDmAttachments.fillMessageBody(host, m, client, escFn);
      return;
    }
    host.innerHTML = "";
    if (!isVoice(m)) {
      var text = document.createElement("div");
      text.style.whiteSpace = "pre-wrap";
      text.style.minWidth = "0";
      text.style.overflowWrap = "break-word";
      text.textContent = String((m && m.body) || "");
      host.appendChild(text);
      return;
    }
    var path = String((m && m.audio_storage_path) || "").trim();
    var mime = String((m && m.audio_mime) || "audio/webm").split(";")[0];
    var url = path ? await signedAudioUrl(client, path) : "";
    var wrap = document.createElement("div");
    wrap.className = "portal-dm-voice-msg";
    wrap.innerHTML =
      '<button type="button" class="portal-dm-voice-play" title="Play voice message" aria-label="Play voice message">' +
      dmIcon("play") +
      "</button>" +
      '<div class="portal-dm-voice-track">' +
      '<input type="range" class="portal-dm-voice-seek" min="0" max="100" value="0" aria-label="Seek" />' +
      '<span class="portal-dm-voice-dur">' +
      esc(formatDur(m && m.duration_ms)) +
      "</span></div>" +
      '<audio preload="metadata" style="display:none"></audio>';
    if (!url) {
      var miss = document.createElement("p");
      miss.className = "muted";
      miss.style.margin = "0";
      miss.style.fontSize = "12px";
      miss.textContent = "Voice message (audio unavailable — run DM voice migration?)";
      host.appendChild(miss);
      return;
    }
    host.appendChild(wrap);
    bindVoicePlayer(wrap, url, m && m.duration_ms);
    var cap = String((m && m.body) || "").trim();
    if (cap) {
      var capEl = document.createElement("div");
      capEl.className = "portal-dm-voice-caption";
      capEl.textContent = cap;
      host.appendChild(capEl);
    }
  }

  async function sendVoice(opts) {
    opts = opts || {};
    var client = opts.client;
    var blob = opts.blob;
    var mime = String(opts.mime || blob.type || "audio/webm").split(";")[0];
    var durationMs = Number(opts.durationMs) || 0;
    var caption = String(opts.caption || "").trim();
    if (!client || !blob) throw new Error("Voice send not available.");
    if (blob.size > MAX_BYTES) throw new Error("Recording is too large (max 8 MB).");

    var msgId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : "v" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
    var ext = extForMime(mime);
    var path = "";
    var row = {
      id: msgId,
      message_type: "voice",
      body: caption || null,
      audio_storage_path: "",
      audio_mime: mime,
      duration_ms: Math.round(durationMs),
    };

    if (opts.kind === "group") {
      var gid = String(opts.groupId || "").trim();
      if (!gid) throw new Error("No group selected.");
      path = "group/" + gid + "/" + msgId + "." + ext;
      row.group_id = gid;
      row.author_id = String(opts.authorId || "").trim();
      if (!row.author_id) throw new Error("Not signed in.");
    } else {
      var tid = String(opts.threadId || "").trim();
      if (!tid) throw new Error("No conversation selected.");
      path = "thread/" + tid + "/" + msgId + "." + ext;
      row.thread_id = tid;
    }
    row.audio_storage_path = path;

    var up = await client.storage.from(BUCKET).upload(path, blob, {
      contentType: mime,
      upsert: false,
    });
    if (up.error) throw up.error;

    var table =
      opts.kind === "group" ? "portal_ceo_group_message" : "portal_staff_dm_messages";
    var ins = await client.from(table).insert([row]).select("id");
    if (ins.error) throw ins.error;
    return { id: msgId, path: path };
  }

  function attachVoiceButton(opts) {
    opts = opts || {};
    injectStyles();
    var btnId = opts.buttonId;
    var btn = btnId ? document.getElementById(btnId) : opts.button;
    var textarea =
      typeof opts.textareaId === "string"
        ? document.getElementById(opts.textareaId)
        : opts.textarea;
    var hintEl =
      typeof opts.hintId === "string" ? document.getElementById(opts.hintId) : opts.hintEl;
    if (!btn || btn.dataset.portalDmVoiceBound) return;
    btn.dataset.portalDmVoiceBound = "1";
    if (!btn.getAttribute("aria-label")) btn.setAttribute("aria-label", "Record voice message");
    if (!btn.title) btn.title = "Voice message — tap to record, tap again to send";

    btn.addEventListener("click", function () {
      void (async function () {
        if (btn.classList.contains("portal-dm-voice-btn--rec")) {
          if (recordState.recorder && recordState.recorder.state === "recording") {
            try {
              recordState.recorder.requestData();
            } catch (_e) {}
            try {
              recordState.recorder.stop();
            } catch (_e2) {}
          } else {
            stopRecording();
          }
          return;
        }
        if (typeof MediaRecorder === "undefined") {
          alert("Voice messages need a browser with MediaRecorder (Chrome, Edge, Safari recent).");
          return;
        }
        if (typeof opts.getContext !== "function") return;
        var ctx = opts.getContext();
        if (!ctx || !ctx.client) {
          if (opts.onError) opts.onError("Not signed in.");
          return;
        }
        if (!ctx.threadId && !ctx.groupId) {
          if (opts.onError) opts.onError("Open a conversation first.");
          return;
        }
        try {
          var g = typeof window !== "undefined" && window.PortalScreenshotGuard;
          if (g && typeof g.pushMediaCaptureBypass === "function") {
            g.pushMediaCaptureBypass("portal-dm-voice");
          }
          var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          var chosen = pickMime();
          var recorder = new MediaRecorder(stream, chosen ? { mimeType: chosen } : {});
          var chunks = [];
          recorder.ondataavailable = function (e) {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.onstop = function () {
            var usedMime = (recorder.mimeType || chosen || "audio/webm").split(";")[0];
            stream.getTracks().forEach(function (t) {
              try {
                t.stop();
              } catch (_e) {}
            });
            btn.classList.remove("portal-dm-voice-btn--rec");
            setHint(hintEl, "");
            btn.disabled = false;
            var durationMs = recordState.startedAt ? Date.now() - recordState.startedAt : 0;
            recordState.recorder = null;
            recordState.stream = null;
            recordState.btn = null;
            recordState.startedAt = 0;
            if (!chunks.length) return;
            var blob = new Blob(chunks, { type: recorder.mimeType || chosen || "audio/webm" });
            var caption = textarea ? String(textarea.value || "").trim() : "";
            void (async function () {
              try {
                btn.disabled = true;
                setHint(hintEl, "Sending voice…");
                await sendVoice({
                  client: ctx.client,
                  kind: ctx.groupId ? "group" : "thread",
                  threadId: ctx.threadId,
                  groupId: ctx.groupId,
                  authorId: ctx.authorId,
                  blob: blob,
                  mime: usedMime,
                  durationMs: durationMs,
                  caption: caption,
                });
                if (textarea) textarea.value = "";
                setHint(hintEl, "");
                if (typeof opts.onSent === "function") await opts.onSent();
              } catch (err) {
                setHint(hintEl, "");
                if (typeof opts.onError === "function") opts.onError(String((err && err.message) || err));
                else alert(String((err && err.message) || err));
              } finally {
                btn.disabled = false;
              }
            })();
          };
          recorder.start(200);
          recordState.recorder = recorder;
          recordState.stream = stream;
          recordState.btn = btn;
          recordState.startedAt = Date.now();
          btn.classList.add("portal-dm-voice-btn--rec");
          setHint(hintEl, "Recording… tap mic again to send");
          recordState.timerId = setTimeout(function () {
            if (recordState.recorder && recordState.recorder.state === "recording") {
              try {
                recordState.recorder.stop();
              } catch (_e) {}
            }
          }, MAX_RECORD_MS);
        } catch (err) {
          stopRecording();
          if (typeof opts.onError === "function") opts.onError("Microphone access is required.");
          else alert("Microphone access is required to record.");
        }
      })();
    });
  }

  function ensureMicButtonBefore(textarea, buttonId) {
    if (!textarea || !textarea.parentNode) return null;
    injectStyles();
    var parent = textarea.parentNode;
    if (!parent.classList.contains("portal-dm-compose-row")) {
      var row = document.createElement("div");
      row.className = "portal-dm-compose-row";
      parent.insertBefore(row, textarea);
      row.appendChild(textarea);
      parent = row;
    }
    var existing = document.getElementById(buttonId);
    if (existing) {
      if (!existing.querySelector(".portal-dm-ico")) existing.innerHTML = dmIcon("mic");
      return existing;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = buttonId;
    btn.className = "portal-dm-voice-btn";
    btn.innerHTML = dmIcon("mic");
    parent.insertBefore(btn, textarea);
    var hint = document.createElement("p");
    hint.className = "portal-dm-voice-rec-hint";
    hint.id = buttonId + "Hint";
    hint.hidden = true;
    parent.parentNode.insertBefore(hint, parent.nextSibling);
    return btn;
  }

  global.portalDmVoice = {
    BUCKET: BUCKET,
    MSG_FIELDS: MSG_FIELDS,
    isVoice: isVoice,
    fillMessageBody: fillMessageBody,
    sendVoice: sendVoice,
    attachVoiceButton: attachVoiceButton,
    ensureMicButtonBefore: ensureMicButtonBefore,
    formatDur: formatDur,
  };
})(typeof window !== "undefined" ? window : globalThis);
