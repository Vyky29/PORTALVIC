/**
 * Participant achievements — in-app photos per participant (staff/lead).
 * Not saved to device gallery; screenshot guard overlay while viewing.
 */
(function (global) {
  "use strict";

  var BUCKET = "participant-achievements";
  var MAX_PHOTOS = 10;
  var MAX_EDGE_PX = 3840;
  var JPEG_QUALITY = 0.92;

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
    getTodayParticipants: function () {
      return [];
    },
    getWorkingDateIso: function () {
      return new Date().toISOString().slice(0, 10);
    },
  };

  var ICON_CAMERA =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  var ICON_GALLERY =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';

  var state = {
    participant: null,
    photos: [],
    stream: null,
    guardBound: false,
    captureMode: "gallery",
    pendingPreviewUrl: null,
    pendingPreviewBlob: null,
  };

  var signedUrlCache = Object.create(null);

  function esc(s) {
    return cfg.esc(s);
  }

  function londonTodayIso() {
    try {
      if (typeof cfg.getWorkingDateIso === "function") {
        var d = String(cfg.getWorkingDateIso() || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      }
    } catch (_e) {}
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      var y = "";
      var m = "";
      var day = "";
      parts.forEach(function (p) {
        if (p.type === "year") y = p.value;
        if (p.type === "month") m = p.value;
        if (p.type === "day") day = p.value;
      });
      if (y && m && day) return y + "-" + m + "-" + day;
    } catch (_e2) {}
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeClientId(id) {
    return String(id || "")
      .trim()
      .toLowerCase();
  }

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getTodayParticipants) cfg.getTodayParticipants = options.getTodayParticipants;
    if (options.getWorkingDateIso) cfg.getWorkingDateIso = options.getWorkingDateIso;
  }

  function ensureCaptureGuard() {
    var el = document.getElementById("portalAchievementCaptureGuard");
    if (!el) {
      el = document.createElement("div");
      el.id = "portalAchievementCaptureGuard";
      el.className = "portal-achievement-capture-guard";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    if (state.guardBound) return;
    state.guardBound = true;

    function flashBlack(ms) {
      el.classList.add("is-active");
      global.clearTimeout(flashBlack._t);
      flashBlack._t = global.setTimeout(function () {
        el.classList.remove("is-active");
      }, ms || 2400);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden && isAchievementSurfaceOpen()) flashBlack(2800);
    });
    global.addEventListener("blur", function () {
      if (isAchievementSurfaceOpen()) flashBlack(1800);
    });
    document.addEventListener("keyup", function (e) {
      if (!isAchievementSurfaceOpen()) return;
      if (e.key === "PrintScreen" || (e.ctrlKey && e.shiftKey && (e.key === "s" || e.key === "S"))) {
        flashBlack(3000);
      }
    });
    document.addEventListener("contextmenu", function (e) {
      if (e.target && e.target.closest && e.target.closest(".portal-achievement-protected")) {
        e.preventDefault();
      }
    });
  }

  function isAchievementSurfaceOpen() {
    var fs = document.getElementById("portalAchievementsCameraFullscreen");
    if (fs && !fs.hidden) return true;
    var sheet = document.getElementById("achievementsSheet");
    if (sheet && sheet.classList.contains("open")) return true;
    var fb = document.getElementById("portalFeedbackAchievementsPanel");
    return !!(fb && !fb.hidden);
  }

  function clearPendingPreview() {
    if (state.pendingPreviewUrl) {
      try {
        URL.revokeObjectURL(state.pendingPreviewUrl);
      } catch (_e) {}
    }
    state.pendingPreviewUrl = null;
    state.pendingPreviewBlob = null;
    var preview = document.getElementById("portalAchievementsCameraPreview");
    if (preview) {
      preview.removeAttribute("src");
      preview.hidden = true;
    }
  }

  function getCameraFullscreenEl() {
    return document.getElementById("portalAchievementsCameraFullscreen");
  }

  function showCameraLiveUi() {
    var video = document.getElementById("portalAchievementsCameraVideo");
    var liveBar = document.getElementById("portalAchievementsCameraFsControlsLive");
    var previewBar = document.getElementById("portalAchievementsCameraFsControlsPreview");
    if (video) video.hidden = false;
    if (liveBar) liveBar.hidden = false;
    if (previewBar) previewBar.hidden = true;
    clearPendingPreview();
  }

  function showCameraPreviewUi(blob) {
    stopCameraTracksOnly();
    var video = document.getElementById("portalAchievementsCameraVideo");
    var preview = document.getElementById("portalAchievementsCameraPreview");
    var liveBar = document.getElementById("portalAchievementsCameraFsControlsLive");
    var previewBar = document.getElementById("portalAchievementsCameraFsControlsPreview");
    if (video) video.hidden = true;
    clearPendingPreview();
    state.pendingPreviewBlob = blob;
    state.pendingPreviewUrl = URL.createObjectURL(blob);
    if (preview) {
      preview.src = state.pendingPreviewUrl;
      preview.hidden = false;
    }
    if (liveBar) liveBar.hidden = true;
    if (previewBar) previewBar.hidden = false;
  }

  function stopCameraTracksOnly() {
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (video) video.srcObject = null;
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) {
        t.stop();
      });
      state.stream = null;
    }
  }

  function openCameraFullscreen() {
    var fs = getCameraFullscreenEl();
    if (fs) {
      fs.hidden = false;
      fs.setAttribute("aria-hidden", "false");
      document.body.classList.add("portal-achievements-camera-open");
    }
    showCameraLiveUi();
  }

  function closeCameraFullscreen() {
    stopCameraTracksOnly();
    clearPendingPreview();
    showCameraLiveUi();
    var fs = getCameraFullscreenEl();
    if (fs) {
      fs.hidden = true;
      fs.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("portal-achievements-camera-open");
  }

  function setStatus(html, isError) {
    var el = document.getElementById("portalAchievementsStatus");
    if (!el) return;
    el.className = "portal-achievements-status" + (isError ? " is-error" : "");
    el.innerHTML = html || "";
  }

  function resizeBlobToJpeg(blob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          var scale = 1;
          if (Math.max(w, h) > MAX_EDGE_PX) {
            scale = MAX_EDGE_PX / Math.max(w, h);
          }
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, cw, ch);
          canvas.toBlob(
            function (out) {
              URL.revokeObjectURL(url);
              if (!out) {
                reject(new Error("encode_failed"));
                return;
              }
              resolve({ blob: out, width: cw, height: ch });
            },
            "image/jpeg",
            JPEG_QUALITY
          );
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("image_load_failed"));
      };
      img.src = url;
    });
  }

  async function captureFromCamera() {
    if (!state.participant) {
      setStatus("Choose a participant first.", true);
      return;
    }
    if (state.photos.length >= MAX_PHOTOS) {
      setStatus("Maximum " + MAX_PHOTOS + " photos for this participant today.", true);
      return;
    }
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video) return;

    try {
      closeCameraFullscreen();
      setCaptureMode("camera");
      setStatus("");
      openCameraFullscreen();
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      });
      video.srcObject = state.stream;
      video.hidden = false;
    } catch (err) {
      console.error(err);
      closeCameraFullscreen();
      setCaptureMode("gallery");
      setStatus("Could not open camera. Check browser permissions.", true);
    }
  }

  function stopCamera() {
    closeCameraFullscreen();
  }

  function snapPhoto() {
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video || !video.videoWidth) return;
    var canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      function (blob) {
        if (!blob) return;
        showCameraPreviewUi(blob);
      },
      "image/jpeg",
      JPEG_QUALITY
    );
  }

  async function savePendingPhoto() {
    if (!state.pendingPreviewBlob) return;
    try {
      setStatus("Uploading…");
      await uploadPhotoBlob(state.pendingPreviewBlob);
      closeCameraFullscreen();
      setCaptureMode("gallery");
      void refreshGallery();
    } catch (e) {
      console.error(e);
      setStatus(esc(e.message || "Upload failed"), true);
    }
  }

  async function retakePendingPhoto() {
    clearPendingPreview();
    showCameraLiveUi();
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video) return;
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      });
      video.srcObject = state.stream;
      video.hidden = false;
    } catch (err) {
      console.error(err);
      closeCameraFullscreen();
      setCaptureMode("gallery");
      setStatus("Could not open camera. Check browser permissions.", true);
    }
  }

  function exitCameraToParticipant() {
    closeCameraFullscreen();
    setCaptureMode("gallery");
    setStatus("");
    void refreshGallery();
  }

  async function uploadPhotoBlob(blob) {
    var client = cfg.getClient();
    if (!client) throw new Error("Sign in required.");
    var {
      data: { user },
    } = await client.auth.getUser();
    if (!user || !user.id) throw new Error("Sign in required.");

    var encoded = await resizeBlobToJpeg(blob);
    var p = state.participant;
    var day = londonTodayIso();
    var cid = normalizeClientId(p.clientId);
    var photoId = global.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    var path =
      user.id + "/" + day + "/" + encodeURIComponent(cid) + "/" + photoId + ".jpg";

    setStatus("Uploading…");
    var up = await client.storage.from(BUCKET).upload(path, encoded.blob, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (up.error) throw up.error;

    var staffName = "";
    try {
      var prof = await client
        .from("staff_profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .maybeSingle();
      staffName = String((prof.data && (prof.data.full_name || prof.data.username)) || "").trim();
    } catch (_e) {}

    var ins = await client.from("portal_participant_achievement_photos").insert([
      {
        staff_user_id: user.id,
        staff_display_name: staffName,
        client_id: cid,
        client_name: String(p.clientName || "").trim() || cid,
        session_date: day,
        portal_session_key: p.portalSessionKey || null,
        storage_path: path,
        status: "draft",
        width: encoded.width,
        height: encoded.height,
        byte_size: encoded.blob.size,
      },
    ]);
    if (ins.error) throw ins.error;

    setStatus("");
    await refreshGallery();
  }

  async function signedUrlFor(path) {
    if (signedUrlCache[path]) return signedUrlCache[path];
    var client = cfg.getClient();
    if (!client) return "";
    var res = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (res.error || !res.data || !res.data.signedUrl) return "";
    signedUrlCache[path] = res.data.signedUrl;
    return res.data.signedUrl;
  }

  async function refreshGallery() {
    if (!state.participant) {
      state.photos = [];
      renderGallery();
      return;
    }
    var client = cfg.getClient();
    if (!client) return;
    var cid = normalizeClientId(state.participant.clientId);
    var day = londonTodayIso();
    var res = await client
      .from("portal_participant_achievement_photos")
      .select("id, storage_path, created_at, width, height")
      .eq("session_date", day)
      .eq("client_id", cid)
      .eq("status", "draft")
      .order("created_at", { ascending: true });
    if (res.error) {
      if (/does not exist|relation/i.test(res.error.message || "")) {
        setStatus("Run database migration 20260531150000_portal_participant_achievement_photos.sql", true);
      } else {
        setStatus(esc(res.error.message), true);
      }
      return;
    }
    state.photos = res.data || [];
    renderGallery();
  }

  function formatWorkingDayLabel() {
    var iso = londonTodayIso();
    try {
      var d = new Date(iso + "T12:00:00");
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "short",
        });
      }
    } catch (_e) {}
    return iso;
  }

  function getTodayParticipantList() {
    var list = [];
    try {
      list = cfg.getTodayParticipants() || [];
    } catch (_e) {
      list = [];
    }
    var seen = Object.create(null);
    var uniq = [];
    list.forEach(function (p) {
      var cid = normalizeClientId(p.clientId);
      if (!cid || seen[cid]) return;
      seen[cid] = true;
      uniq.push({
        clientId: cid,
        clientName: String(p.clientName || p.name || cid).trim(),
        portalSessionKey: p.portalSessionKey || p.sessionKey || null,
      });
    });
    uniq.sort(function (a, b) {
      return a.clientName.localeCompare(b.clientName, "en", { sensitivity: "base" });
    });
    return uniq;
  }

  function renderParticipantPicker() {
    var host = document.getElementById("portalAchievementsParticipantList");
    var dayEl = document.getElementById("portalAchievementsDayLabel");
    if (dayEl) {
      dayEl.textContent = formatWorkingDayLabel();
    }
    if (!host) return;
    var uniq = getTodayParticipantList();
    if (!uniq.length) {
      host.innerHTML =
        '<p class="muted portal-achievements-empty">No participants on your <strong>Today</strong> list for this day. Open the dashboard for that day first, or check your rota.</p>';
      return;
    }
    host.innerHTML = uniq
      .map(function (p) {
        return (
          '<button type="button" class="portal-achievements-participant" data-ach-client="' +
          esc(p.clientId) +
          '" data-ach-name="' +
          esc(p.clientName) +
          '" data-ach-key="' +
          esc(p.portalSessionKey || "") +
          '"><span class="portal-achievements-participant__name">' +
          esc(p.clientName) +
          '</span><span class="portal-achievements-participant__chev" aria-hidden="true">›</span></button>'
        );
      })
      .join("");
    host.querySelectorAll("[data-ach-client]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.participant = {
          clientId: btn.getAttribute("data-ach-client"),
          clientName: btn.getAttribute("data-ach-name"),
          portalSessionKey: btn.getAttribute("data-ach-key") || null,
        };
        signedUrlCache = Object.create(null);
        state.captureMode = "gallery";
        showStep("capture");
        setCaptureMode("gallery");
        void refreshGallery();
      });
    });
  }

  function setCaptureMode(mode) {
    state.captureMode = mode === "camera" ? "camera" : "gallery";
    var galPanel = document.getElementById("portalAchievementsGalleryPanel");
    var camBtn = document.getElementById("portalAchievementsOpenCamera");
    var galBtn = document.getElementById("portalAchievementsShowGallery");
    if (mode !== "camera") {
      closeCameraFullscreen();
      if (galPanel) galPanel.hidden = false;
    } else if (galPanel) {
      galPanel.hidden = true;
    }
    if (camBtn) camBtn.classList.toggle("is-active", mode === "camera");
    if (galBtn) galBtn.classList.toggle("is-active", mode === "gallery");
  }

  function showStep(step) {
    var pick = document.getElementById("portalAchievementsStepPick");
    var cap = document.getElementById("portalAchievementsStepCapture");
    if (pick) pick.hidden = step !== "pick";
    if (cap) cap.hidden = step !== "capture";
    var nameEl = document.getElementById("portalAchievementsSelectedName");
    if (nameEl && state.participant) {
      nameEl.textContent = state.participant.clientName || state.participant.clientId;
    } else if (nameEl) {
      nameEl.textContent = "";
    }
    var countEl = document.getElementById("portalAchievementsCount");
    if (countEl) {
      countEl.textContent =
        state.photos.length + " / " + MAX_PHOTOS + " photos (high quality, in-app only)";
    }
  }

  async function renderGallery() {
    var host = document.getElementById("portalAchievementsGallery");
    if (!host) return;
    showStep(state.participant ? "capture" : "pick");
    if (!state.photos.length) {
      host.innerHTML = '<p class="muted portal-achievements-empty">No photos yet for this participant.</p>';
      return;
    }
    host.innerHTML =
      '<div class="portal-achievements-gallery-grid portal-achievement-protected"></div>';
    var grid = host.querySelector(".portal-achievements-gallery-grid");
    for (var i = 0; i < state.photos.length; i++) {
      var row = state.photos[i];
      var url = await signedUrlFor(row.storage_path);
      var cell = document.createElement("div");
      cell.className = "portal-achievements-thumb";
      cell.innerHTML =
        '<img src="' +
        esc(url) +
        '" alt="" draggable="false" class="portal-achievement-protected" />';
      grid.appendChild(cell);
    }
  }

  function bindSheet() {
    var root = document.getElementById("achievementsSheet");
    if (!root || root.getAttribute("data-portal-achievements-bound") === "1") return;
    root.setAttribute("data-portal-achievements-bound", "1");
    ensureCaptureGuard();

    var backBtn = document.getElementById("portalAchievementsBackParticipants");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        closeCameraFullscreen();
        state.participant = null;
        state.photos = [];
        state.captureMode = "gallery";
        showStep("pick");
        renderParticipantPicker();
      });
    }

    var camBtn = document.getElementById("portalAchievementsOpenCamera");
    if (camBtn) {
      camBtn.addEventListener("click", function () {
        void captureFromCamera();
      });
    }

    var snapBtn = document.getElementById("portalAchievementsSnap");
    if (snapBtn) {
      snapBtn.addEventListener("click", function () {
        snapPhoto();
      });
    }

    var fsClose = document.getElementById("portalAchievementsFsClose");
    if (fsClose) {
      fsClose.addEventListener("click", function () {
        exitCameraToParticipant();
      });
    }

    var previewSave = document.getElementById("portalAchievementsPreviewSave");
    if (previewSave) {
      previewSave.addEventListener("click", function () {
        void savePendingPhoto();
      });
    }

    var previewRetake = document.getElementById("portalAchievementsPreviewRetake");
    if (previewRetake) {
      previewRetake.addEventListener("click", function () {
        void retakePendingPhoto();
      });
    }

    var previewClose = document.getElementById("portalAchievementsPreviewClose");
    if (previewClose) {
      previewClose.addEventListener("click", function () {
        exitCameraToParticipant();
      });
    }

    var galBtn = document.getElementById("portalAchievementsShowGallery");
    if (galBtn) {
      galBtn.addEventListener("click", function () {
        setCaptureMode("gallery");
        void refreshGallery();
      });
    }
  }

  function openSheet() {
    bindSheet();
    state.participant = null;
    state.photos = [];
    state.captureMode = "gallery";
    signedUrlCache = Object.create(null);
    stopCamera();
    renderParticipantPicker();
    showStep("pick");
    setStatus("");
    setCaptureMode("gallery");
  }

  function sheetHtml() {
    return (
      '<section class="sheet sheet--fullscreen sheet--mobile-frame" id="achievementsSheet" aria-labelledby="achievementsSheetTitle">' +
      '<div class="sheet-head portal-achievements-sheet-head">' +
      '<h3 id="achievementsSheetTitle">Participant achievements</h3>' +
      "</div>" +
      '<div class="sheet-body portal-achievements-sheet-body">' +
      '<p class="portal-achievements-note">Photos stay in the portal only (not your phone gallery). Screenshots are blocked while you view them here.</p>' +
      '<div id="portalAchievementsStatus" class="portal-achievements-status" role="status"></div>' +
      '<div id="portalAchievementsStepPick">' +
      '<p class="portal-achievements-step-title">Today — <span id="portalAchievementsDayLabel"></span></p>' +
      '<p class="muted portal-achievements-pick-hint">Same participants as your Today list (A–Z).</p>' +
      '<div id="portalAchievementsParticipantList" class="portal-achievements-participant-list"></div>' +
      "</div>" +
      '<div id="portalAchievementsStepCapture" hidden>' +
      '<div class="portal-achievements-capture-head">' +
      '<button type="button" class="portal-achievements-participants-chip" id="portalAchievementsBackParticipants">Participants</button>' +
      '<p class="portal-achievements-selected-name" id="portalAchievementsSelectedName"></p>' +
      "</div>" +
      '<p class="muted portal-achievements-count" id="portalAchievementsCount"></p>' +
      '<div class="portal-achievements-icon-actions">' +
      '<button type="button" class="portal-achievements-icon-btn" id="portalAchievementsOpenCamera" aria-label="Take photo">' +
      '<span class="portal-achievements-icon-btn__ico" aria-hidden="true">' +
      ICON_CAMERA +
      "</span>" +
      '<span class="portal-achievements-icon-btn__label">Take photo</span></button>' +
      '<button type="button" class="portal-achievements-icon-btn is-active" id="portalAchievementsShowGallery" aria-label="Gallery of the day">' +
      '<span class="portal-achievements-icon-btn__ico" aria-hidden="true">' +
      ICON_GALLERY +
      "</span>" +
      '<span class="portal-achievements-icon-btn__label">Gallery</span></button>' +
      "</div>" +
      '<div id="portalAchievementsGalleryPanel">' +
      '<div id="portalAchievementsGallery" class="portal-achievements-gallery portal-achievement-protected"></div>' +
      "</div></div></div>" +
      '<div id="portalAchievementsCameraFullscreen" class="portal-achievements-camera-fs" hidden aria-hidden="true">' +
      '<div class="portal-achievements-camera-fs__media portal-achievement-protected">' +
      '<video id="portalAchievementsCameraVideo" playsinline autoplay muted class="portal-achievements-camera-fs__video"></video>' +
      '<img id="portalAchievementsCameraPreview" class="portal-achievements-camera-fs__preview" alt="" hidden draggable="false" />' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__top">' +
      '<button type="button" class="portal-achievements-camera-fs__text-btn" id="portalAchievementsFsClose">Close</button>' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__bottom" id="portalAchievementsCameraFsControlsLive">' +
      '<button type="button" class="portal-achievements-camera-fs__shutter" id="portalAchievementsSnap" aria-label="Take photo"><span class="portal-achievements-camera-fs__shutter-inner"></span></button>' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__bottom portal-achievements-camera-fs__bottom--preview" id="portalAchievementsCameraFsControlsPreview" hidden>' +
      '<button type="button" class="btn btn--pri portal-achievements-camera-fs__action" id="portalAchievementsPreviewSave">Save</button>' +
      '<button type="button" class="btn btn--ghost portal-achievements-camera-fs__action" id="portalAchievementsPreviewRetake">Take another</button>' +
      '<button type="button" class="btn btn--ghost portal-achievements-camera-fs__action" id="portalAchievementsPreviewClose">Close</button>' +
      "</div></div></section>"
    );
  }

  /** Feedback form: load draft thumbnails for attach picker. */
  async function listDraftsForFeedback(clientId, sessionDate) {
    var client = cfg.getClient();
    if (!client) return [];
    var cid = normalizeClientId(clientId);
    var day = String(sessionDate || "").trim().slice(0, 10);
    if (!cid || !day) return [];
    var res = await client
      .from("portal_participant_achievement_photos")
      .select("id, storage_path, created_at")
      .eq("client_id", cid)
      .eq("session_date", day)
      .eq("status", "draft")
      .order("created_at", { ascending: true });
    if (res.error) return [];
    return res.data || [];
  }

  async function renderFeedbackAttachPanel(clientId, sessionDate) {
    var host = document.getElementById("portalFeedbackAchievementsPanel");
    if (!host) return [];
    host.hidden = false;
    var rows = await listDraftsForFeedback(clientId, sessionDate);
    if (!rows.length) {
      host.innerHTML =
        '<p class="muted" style="margin:0">No achievement photos for this participant. Add some from Quick menu → Participant achievements.</p>';
      return [];
    }
    var html =
      '<p class="portal-achievements-feedback-label">Attach achievement photos (optional)</p>' +
      '<div class="portal-achievements-feedback-grid portal-achievement-protected">';
    rows.forEach(function (r) {
      html +=
        '<label class="portal-achievements-feedback-pick"><input type="checkbox" name="achievementPhoto" value="' +
        esc(r.id) +
        '" /><span class="portal-achievements-feedback-thumb" data-path="' +
        esc(r.storage_path) +
        '">…</span></label>';
    });
    html += "</div>";
    host.innerHTML = html;
    var picks = host.querySelectorAll(".portal-achievements-feedback-thumb");
    for (var i = 0; i < picks.length; i++) {
      (function (el, path) {
        void signedUrlFor(path).then(function (url) {
          el.innerHTML =
            '<img src="' +
            esc(url) +
            '" alt="" draggable="false" class="portal-achievement-protected" />';
        });
      })(picks[i], picks[i].getAttribute("data-path"));
    }
    ensureCaptureGuard();
    return rows;
  }

  function getSelectedFeedbackPhotoIds() {
    var host = document.getElementById("portalFeedbackAchievementsPanel");
    if (!host) return [];
    return Array.from(host.querySelectorAll('input[name="achievementPhoto"]:checked')).map(function (inp) {
      return inp.value;
    });
  }

  async function finalizeOnFeedbackSubmit(opts) {
    var client = cfg.getClient();
    if (!client) return;
    var ids = (opts && opts.attachedIds) || [];
    var payload = {
      p_attached_ids: ids,
      p_client_id: opts.clientId || null,
      p_session_date: opts.sessionDate || null,
    };
    if (opts.feedbackId) payload.p_feedback_id = opts.feedbackId;
    var res = await client.rpc("portal_finalize_achievement_photos", payload);
    if (res.error) {
      console.warn("[achievements] finalize", res.error);
    }
  }

  global.PortalParticipantAchievements = {
    configure: configure,
    sheetHtml: sheetHtml,
    bindSheet: bindSheet,
    openSheet: openSheet,
    stopCamera: stopCamera,
    listDraftsForFeedback: listDraftsForFeedback,
    renderFeedbackAttachPanel: renderFeedbackAttachPanel,
    getSelectedFeedbackPhotoIds: getSelectedFeedbackPhotoIds,
    finalizeOnFeedbackSubmit: finalizeOnFeedbackSubmit,
    MAX_PHOTOS: MAX_PHOTOS,
  };
})(typeof window !== "undefined" ? window : globalThis);
