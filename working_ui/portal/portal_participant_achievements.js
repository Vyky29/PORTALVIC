/**
 * Participant achievements — in-app photos per participant (staff/lead).
 * Not saved to device gallery; screenshot guard overlay while viewing.
 */
(function (global) {
  "use strict";

  var BUCKET = "participant-achievements";
  var LEAD_INBOX_CLIENT_ID = "_inbox";
  var LEAD_INBOX_CLIENT_NAME = "Inbox";
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
    isLeadInboxMode: function () {
      return false;
    },
  };

  var ICON_CAMERA =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  var ICON_GALLERY =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  var ICON_FLIP =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><path d="M15 2l3 3-3 3"/><path d="M9 22l-3-3 3-3"/></svg>';
  var ICON_PREV =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var ICON_NEXT =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
  var ICON_VIDEO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>';
  var ICON_TRASH =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>';

  var state = {
    participant: null,
    photos: [],
    stream: null,
    captureMode: "gallery",
    cameraMode: "photo",
    viewerIndex: -1,
    facingMode: "environment",
    zoomScale: 1,
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
    if (options.isLeadInboxMode) cfg.isLeadInboxMode = options.isLeadInboxMode;
  }

  function isLeadInboxMode() {
    try {
      return !!cfg.isLeadInboxMode();
    } catch (_e) {
      return false;
    }
  }

  function isInboxParticipant(p) {
    return normalizeClientId(p && p.clientId) === LEAD_INBOX_CLIENT_ID;
  }

  function inboxParticipant() {
    return {
      clientId: LEAD_INBOX_CLIENT_ID,
      clientName: LEAD_INBOX_CLIENT_NAME,
      portalSessionKey: null,
      isInbox: true,
    };
  }

  function selectInboxParticipant(opts) {
    opts = opts || {};
    selectParticipant(inboxParticipant());
    if (opts.openCamera) {
      setCaptureMode("camera");
      void captureFromCamera();
    }
  }

  function isAchievementGalleryViewerOpen() {
    var viewer = document.getElementById("portalAchievementsGalleryViewer");
    return !!(viewer && !viewer.hidden);
  }

  function isAchievementCameraOpen() {
    var fs = document.getElementById("portalAchievementsCameraFullscreen");
    return !!(fs && !fs.hidden);
  }

  function isAchievementPhotoSurfaceOpen() {
    return isAchievementGalleryViewerOpen() || isAchievementCameraOpen();
  }

  function syncAchievementScreenshotGuard() {
    var g = global.PortalScreenshotGuard;
    if (!g) return;
    if (typeof g.pushMediaCaptureBypass === "function" && typeof g.popMediaCaptureBypass === "function") {
      if (isAchievementCameraOpen()) g.pushMediaCaptureBypass("participant-achievements-camera");
      else g.popMediaCaptureBypass("participant-achievements-camera");
    }
  }

  function ensureCaptureGuard() {
    syncAchievementScreenshotGuard();
  }

  function getCameraFullscreenEl() {
    return document.getElementById("portalAchievementsCameraFullscreen");
  }

  function syncCameraLandscapeRail() {
    var fs = getCameraFullscreenEl();
    if (!fs || fs.hidden) return;
    var shortSide = Math.min(window.innerWidth || 0, window.innerHeight || 0);
    var landscape = (window.innerWidth || 0) > (window.innerHeight || 0);
    fs.classList.toggle("is-landscape-rail", landscape && shortSide > 0 && shortSide < 520);
  }

  function uploadErrorMessage(err) {
    var msg = String((err && err.message) || err || "").trim();
    if (/row-level security|rls|policy/i.test(msg)) {
      return (
        "Photo could not be saved (permissions). Ask ops to run Supabase migration " +
        "20260602140000_portal_achievement_photos_worker_rls.sql, then sign out and in again."
      );
    }
    return msg || "Could not save photo";
  }

  function pushCameraMediaBypass() {
    var g = global.PortalScreenshotGuard;
    if (g && typeof g.pushMediaCaptureBypass === "function") {
      g.pushMediaCaptureBypass("participant-achievements-camera");
    }
    if (g && typeof g.releaseCaptureUiBlockers === "function") {
      g.releaseCaptureUiBlockers();
    }
    try {
      document.documentElement.classList.remove("portal-screenshot-sensitive-hidden");
      document.documentElement.classList.remove("portal-screenshot-worker-sensitive-hidden");
    } catch (_e) {}
  }

  function cameraErrorMessage(err) {
    var name = String((err && err.name) || "").trim();
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Camera blocked on this device. Tap Allow camera now, or Use phone camera below. If there is no prompt: iPhone Settings → Safari → Camera → Allow (or Settings → the portal site → Camera).";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No camera found on this device.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "Camera is busy (another app may be using it). Close it and try again.";
    }
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
      return "Could not open camera with these settings. Try again or pick from Gallery.";
    }
    if (name === "SecurityError") {
      return "Camera blocked on this page. Open the portal via HTTPS.";
    }
    var msg = String((err && err.message) || "").trim();
    if (/overconstrained|constraint/i.test(msg)) {
      return "Could not open camera with these settings. Try again or pick from Gallery.";
    }
    return "Could not open camera. Check browser permissions.";
  }

  async function acquireCameraStream(facingMode) {
    var fm = facingMode || state.facingMode || "environment";
    var videoAttempts = [
      { facingMode: { ideal: fm }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      { facingMode: { ideal: fm }, width: { ideal: 1280 }, height: { ideal: 720 } },
      { facingMode: { ideal: fm } },
      { facingMode: fm },
      true,
    ];
    var lastErr = null;
    for (var i = 0; i < videoAttempts.length; i++) {
      try {
        var v = videoAttempts[i];
        var constraints =
          v === true ? { audio: false, video: true } : { audio: false, video: v };
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("camera_unavailable");
  }

  function applyVideoZoom() {
    var video = document.getElementById("portalAchievementsCameraVideo");
    var z = Number(state.zoomScale) || 1;
    if (video) {
      video.style.transform = "scale(" + z + ")";
      video.style.transformOrigin = "center center";
    }
  }

  function deviceIsLandscape() {
    try {
      if (global.matchMedia && global.matchMedia("(orientation: landscape)").matches) {
        return true;
      }
    } catch (_e) {}
    return global.innerWidth > global.innerHeight;
  }

  /** Draw video frame respecting how the user is holding the phone. */
  function captureCanvasFromVideo(video) {
    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (!vw || !vh) return null;

    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;

    var videoLandscape = vw > vh;
    var wantLandscape = deviceIsLandscape();
    var front = state.facingMode === "user";

    if (wantLandscape && !videoLandscape) {
      canvas.width = vh;
      canvas.height = vw;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      if (front) ctx.scale(-1, 1);
      ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else if (!wantLandscape && videoLandscape) {
      canvas.width = vh;
      canvas.height = vw;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-Math.PI / 2);
      if (front) ctx.scale(-1, 1);
      ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    } else {
      canvas.width = vw;
      canvas.height = vh;
      if (front) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, vw, vh);
    }
    return canvas;
  }

  function triggerSnapFlash() {
    var flash = document.getElementById("portalAchievementsCameraFlash");
    if (!flash) return;
    flash.classList.remove("is-active");
    void flash.offsetWidth;
    flash.classList.add("is-active");
    global.setTimeout(function () {
      flash.classList.remove("is-active");
    }, 260);
  }

  function pulseShutterButton() {
    var snapBtn = document.getElementById("portalAchievementsSnap");
    if (!snapBtn) return;
    snapBtn.classList.add("is-capturing");
    global.setTimeout(function () {
      snapBtn.classList.remove("is-capturing");
    }, 180);
  }

  function setZoomUi() {
    var z = Number(state.zoomScale) || 1;
    document.querySelectorAll("[data-portal-ach-zoom]").forEach(function (btn) {
      var v = Number(btn.getAttribute("data-portal-ach-zoom"));
      btn.classList.toggle("is-active", v === z);
      btn.setAttribute("aria-pressed", v === z ? "true" : "false");
    });
    applyVideoZoom();
  }

  function setCameraFooterMode() {
    var isPhoto = state.cameraMode !== "video";
    var photoBtn = document.getElementById("portalAchievementsFsPhoto");
    var videoBtn = document.getElementById("portalAchievementsFsVideo");
    if (photoBtn) {
      photoBtn.classList.toggle("is-active", isPhoto);
      photoBtn.setAttribute("aria-pressed", isPhoto ? "true" : "false");
    }
    if (videoBtn) {
      videoBtn.classList.toggle("is-active", !isPhoto);
      videoBtn.setAttribute("aria-pressed", !isPhoto ? "true" : "false");
    }
  }

  function showCameraLiveUi() {
    var video = document.getElementById("portalAchievementsCameraVideo");
    var fs = getCameraFullscreenEl();
    if (fs) fs.classList.remove("is-preview");
    if (video) video.hidden = false;
    setCameraFooterMode();
    setZoomUi();
  }

  async function updateFooterGalleryThumb() {
    var btn = document.getElementById("portalAchievementsFsGallery");
    if (!btn) return;
    var last = state.photos.length ? state.photos[state.photos.length - 1] : null;
    if (!last) {
      btn.innerHTML =
        '<span class="portal-ach-cam-gallery__placeholder" aria-hidden="true">' + ICON_GALLERY + "</span>";
      btn.classList.remove("has-thumb");
      return;
    }
    var url = await signedUrlFor(last.storage_path);
    if (!url) {
      btn.innerHTML =
        '<span class="portal-ach-cam-gallery__placeholder" aria-hidden="true">' + ICON_GALLERY + "</span>";
      btn.classList.remove("has-thumb");
      return;
    }
    btn.classList.add("has-thumb");
    btn.innerHTML =
      '<img src="' + esc(url) + '" alt="" class="portal-ach-cam-gallery__thumb portal-screenshot-protected portal-achievement-protected" draggable="false" />';
  }

  async function flipCamera() {
    state.facingMode = state.facingMode === "user" ? "environment" : "user";
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video) return;
    pushCameraMediaBypass();
    stopCameraTracksOnly();
    try {
      state.stream = await acquireCameraStream(state.facingMode);
      video.srcObject = state.stream;
      video.hidden = false;
      applyVideoZoom();
    } catch (err) {
      console.error(err);
      setStatus(cameraErrorMessage(err), true);
    }
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
      syncCameraLandscapeRail();
    }
    syncAchievementScreenshotGuard();
    showCameraLiveUi();
  }

  function closeCameraFullscreen() {
    stopCameraTracksOnly();
    showCameraLiveUi();
    var fs = getCameraFullscreenEl();
    if (fs) {
      fs.hidden = true;
      fs.setAttribute("aria-hidden", "true");
      fs.classList.remove("is-landscape-rail");
    }
    document.body.classList.remove("portal-achievements-camera-open");
    syncAchievementScreenshotGuard();
  }

  function setStatus(html, isError) {
    var el = document.getElementById("portalAchievementsStatus");
    if (!el) return;
    el.className = "portal-achievements-status" + (isError ? " is-error" : "");
    el.innerHTML = html || "";
  }

  function ensureNativePhotoInput() {
    var inp = document.getElementById("portalAchievementsNativePhotoInput");
    if (inp) return inp;
    inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.setAttribute("capture", "environment");
    inp.id = "portalAchievementsNativePhotoInput";
    inp.hidden = true;
    inp.addEventListener("change", function () {
      var file = inp.files && inp.files[0];
      inp.value = "";
      if (!file || !state.participant) return;
      setStatus("Saving…");
      void uploadPhotoBlob(file)
        .then(function () {
          setStatus("Photo saved.");
          setCaptureMode("gallery");
          void refreshGallery();
        })
        .catch(function (e) {
          setStatus(esc(uploadErrorMessage(e)), true);
        });
    });
    document.body.appendChild(inp);
    return inp;
  }

  function openNativePhotoPicker() {
    if (!state.participant) {
      setStatus("Choose a participant first.", true);
      return;
    }
    if (state.photos.length >= MAX_PHOTOS) {
      setStatus("Maximum " + MAX_PHOTOS + " photos for this participant today.", true);
      return;
    }
    ensureNativePhotoInput().click();
  }

  function showCameraFailure(err) {
    var name = String((err && err.name) || "").trim();
    var msg = esc(cameraErrorMessage(err));
    var html = msg;
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
      html +=
        '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;min-width:0">' +
        '<button type="button" class="btn btn--pri btn--sm" id="portalAchievementsCamRetryBtn">Allow camera now</button>' +
        '<button type="button" class="btn btn--sec btn--sm" id="portalAchievementsNativeCamBtn">Use phone camera</button>' +
        "</div>";
    }
    setStatus(html, true);
    var retry = document.getElementById("portalAchievementsCamRetryBtn");
    if (retry) {
      retry.onclick = function () {
        var req =
          global.portalRequestCameraPermission ||
          (global.window && global.window.portalRequestCameraPermission);
        if (typeof req !== "function") {
          openNativePhotoPicker();
          return;
        }
        setStatus("Waiting for camera permission…");
        void req().then(function (st) {
          if (st === "granted") void captureFromCamera();
          else showCameraFailure({ name: "NotAllowedError" });
        });
      };
    }
    var nat = document.getElementById("portalAchievementsNativeCamBtn");
    if (nat) nat.onclick = function () {
      openNativePhotoPicker();
    };
    if (global.portalMarkCameraDenied) global.portalMarkCameraDenied();
  }

  function noteCameraGranted() {
    if (typeof global.portalMarkCameraGranted === "function") {
      global.portalMarkCameraGranted();
    }
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
      setStatus("");
      state.cameraMode = "photo";
      setCameraFooterMode();
      pushCameraMediaBypass();
      state.stream = await acquireCameraStream(state.facingMode);
      noteCameraGranted();
      openCameraFullscreen();
      showCameraLiveUi();
      video.srcObject = state.stream;
      video.hidden = false;
      applyVideoZoom();
      void updateFooterGalleryThumb();
    } catch (err) {
      console.error(err);
      closeCameraFullscreen();
      setCaptureMode("hub");
      showCameraFailure(err);
    }
  }

  function stopCamera() {
    closeCameraFullscreen();
    syncAchievementScreenshotGuard();
  }

  async function snapPhoto() {
    if (!state.participant) {
      setStatus("Choose a participant first.", true);
      return;
    }
    if (state.cameraMode === "video") {
      setStatus("Video is not available yet.", true);
      return;
    }
    if (state.photos.length >= MAX_PHOTOS) {
      setStatus("Maximum " + MAX_PHOTOS + " photos for this participant today.", true);
      return;
    }
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video || !video.videoWidth) return;
    var snapBtn = document.getElementById("portalAchievementsSnap");
    if (snapBtn) snapBtn.disabled = true;
    try {
      triggerSnapFlash();
      pulseShutterButton();
      var canvas = captureCanvasFromVideo(video);
      if (!canvas) throw new Error("capture_failed");
      var blob = await new Promise(function (resolve, reject) {
        canvas.toBlob(
          function (b) {
            if (!b) reject(new Error("capture_failed"));
            else resolve(b);
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      });
      setStatus("Saving…");
      await uploadPhotoBlob(blob);
      setStatus("Photo saved.");
      void updateFooterGalleryThumb();
      showCameraLiveUi();
    } catch (e) {
      console.error(e);
      setStatus(esc(uploadErrorMessage(e)), true);
    } finally {
      if (snapBtn) snapBtn.disabled = false;
    }
  }

  function exitCameraToParticipant() {
    closeCameraFullscreen();
    setCaptureMode("gallery");
    setStatus("");
    void refreshGallery();
  }

  function exitCameraToHub() {
    closeCameraFullscreen();
    setCaptureMode("hub");
    setStatus("");
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
    var path = user.id + "/" + day + "/" + cid + "/" + photoId + ".jpg";

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
    if (ins.error) {
      try {
        await client.storage.from(BUCKET).remove([path]);
      } catch (_rm) {}
      throw ins.error;
    }

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

  async function fetchInboxDraftPhotos(sessionDate) {
    var client = cfg.getClient();
    if (!client) return [];
    var day = String(sessionDate || londonTodayIso()).trim().slice(0, 10);
    var userRes = await client.auth.getUser();
    var uid = userRes.data && userRes.data.user && userRes.data.user.id;
    if (!uid) return [];
    var res = await client
      .from("portal_participant_achievement_photos")
      .select("id, storage_path, created_at, width, height, staff_user_id, staff_display_name")
      .eq("session_date", day)
      .eq("client_id", LEAD_INBOX_CLIENT_ID)
      .eq("staff_user_id", uid)
      .eq("status", "draft")
      .order("created_at", { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function fetchDraftPhotosForParticipant(participant, sessionDate) {
    var client = cfg.getClient();
    if (!client || !participant) return [];
    if (isInboxParticipant(participant)) {
      return fetchInboxDraftPhotos(sessionDate);
    }
    var cid = normalizeClientId(participant.clientId);
    var day = String(sessionDate || londonTodayIso()).trim().slice(0, 10);
    var sessionKey = participant.portalSessionKey
      ? String(participant.portalSessionKey).trim()
      : null;
    var res = await client.rpc("portal_list_participant_achievement_drafts", {
      p_client_id: cid,
      p_session_date: day,
      p_portal_session_key: sessionKey || null,
    });
    if (res.error) {
      if (/does not exist|portal_list_participant_achievement_drafts/i.test(res.error.message || "")) {
        var fallback = await client
          .from("portal_participant_achievement_photos")
          .select("id, storage_path, created_at, width, height, staff_user_id, staff_display_name")
          .eq("session_date", day)
          .eq("client_id", cid)
          .eq("status", "draft")
          .order("created_at", { ascending: true });
        if (fallback.error) throw fallback.error;
        return fallback.data || [];
      }
      throw res.error;
    }
    return res.data || [];
  }

  async function refreshGallery() {
    if (!state.participant) {
      state.photos = [];
      renderGallery();
      return;
    }
    try {
      state.photos = await fetchDraftPhotosForParticipant(state.participant, londonTodayIso());
      setStatus("");
    } catch (e) {
      console.error(e);
      state.photos = [];
      if (/does not exist|relation/i.test(e.message || "")) {
        setStatus("Run database migration 20260603160000_portal_achievement_photos_shared_drafts.sql", true);
      } else {
        setStatus(esc(e.message || "Could not load photos"), true);
      }
    }
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
    var hintEl = document.getElementById("portalAchievementsPickHint");
    if (dayEl) {
      dayEl.textContent = formatWorkingDayLabel();
    }
    if (hintEl) {
      hintEl.textContent = isLeadInboxMode()
        ? "Take photos for the admin inbox (no participant), or pick someone from Today."
        : "Same participants as your Today list (A–Z).";
    }
    if (!host) return;
    var uniq = getTodayParticipantList();
    var html = "";
    if (isLeadInboxMode()) {
      html +=
        '<button type="button" class="portal-achievements-participant portal-achievements-participant--inbox" data-ach-inbox="1" aria-label="Inbox — no participant. Admin assigns to the right client later">' +
        '<span class="portal-achievements-participant__text">' +
        '<span class="portal-achievements-participant__name">Inbox</span>' +
        '<span class="portal-achievements-participant__sub muted">No participant</span>' +
        "</span>" +
        '<span class="portal-achievements-participant__chev" aria-hidden="true">›</span></button>';
    }
    if (!uniq.length && !isLeadInboxMode()) {
      host.innerHTML =
        '<p class="muted portal-achievements-empty">No participants on your <strong>Today</strong> list for this day. Open the dashboard for that day first, or check your rota.</p>';
      return;
    }
    html += uniq
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
    host.innerHTML = html;
    var inboxBtn = host.querySelector("[data-ach-inbox]");
    if (inboxBtn) {
      inboxBtn.addEventListener("click", function () {
        selectInboxParticipant();
      });
    }
    host.querySelectorAll("[data-ach-client]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectParticipant({
          clientId: btn.getAttribute("data-ach-client"),
          clientName: btn.getAttribute("data-ach-name"),
          portalSessionKey: btn.getAttribute("data-ach-key") || null,
        });
      });
    });
  }

  function selectParticipant(p) {
    if (!p || !p.clientId) return;
    state.participant = {
      clientId: p.clientId,
      clientName: p.clientName || p.clientId,
      portalSessionKey: p.portalSessionKey || null,
    };
    signedUrlCache = Object.create(null);
    closeGalleryViewer();
    closeCameraFullscreen();
    showStep("capture");
    setCaptureMode("hub");
    void refreshGallery();
  }

  /** Topbar camera: lead inbox, or auto-start when exactly one Today participant. */
  function openCameraDirect() {
    bindSheet();
    if (isLeadInboxMode()) {
      selectInboxParticipant({ openCamera: true });
      return;
    }
    var list = getTodayParticipantList();
    if (list.length === 1) {
      selectParticipant(list[0]);
      setCaptureMode("camera");
      void captureFromCamera();
    }
  }

  function setCaptureMode(mode) {
    var isCamera = mode === "camera";
    var isGallery = mode === "gallery";
    state.captureMode = isCamera ? "camera" : isGallery ? "gallery" : "hub";
    var galPanel = document.getElementById("portalAchievementsGalleryPanel");
    var camBtn = document.getElementById("portalAchievementsOpenCamera");
    var galBtn = document.getElementById("portalAchievementsShowGallery");
    if (!isCamera) {
      closeCameraFullscreen();
    }
    if (galPanel) galPanel.hidden = !isGallery;
    if (camBtn) camBtn.classList.toggle("is-active", isCamera);
    if (galBtn) galBtn.classList.toggle("is-active", isGallery);
  }

  function showStep(step) {
    var pick = document.getElementById("portalAchievementsStepPick");
    var cap = document.getElementById("portalAchievementsStepCapture");
    if (pick) pick.hidden = step !== "pick";
    if (cap) cap.hidden = step !== "capture";
    var nameEl = document.getElementById("portalAchievementsSelectedName");
    if (nameEl && state.participant) {
      if (isInboxParticipant(state.participant)) {
        nameEl.textContent = "Inbox";
        nameEl.classList.add("portal-achievements-selected-name--inbox");
        nameEl.setAttribute("title", "No participant — admin assigns later");
      } else {
        nameEl.textContent = state.participant.clientName || state.participant.clientId;
        nameEl.classList.remove("portal-achievements-selected-name--inbox");
        nameEl.removeAttribute("title");
      }
    } else if (nameEl) {
      nameEl.textContent = "";
      nameEl.classList.remove("portal-achievements-selected-name--inbox");
      nameEl.removeAttribute("title");
    }
    var backBtn = document.getElementById("portalAchievementsBackParticipants");
    if (backBtn) {
      backBtn.textContent = isLeadInboxMode() ? "Change" : "Participants";
    }
    var countEl = document.getElementById("portalAchievementsCount");
    if (countEl) {
      countEl.textContent =
        state.photos.length + " / " + MAX_PHOTOS + " photos (high quality, in-app only)";
    }
  }

  function closeGalleryViewer() {
    var viewer = document.getElementById("portalAchievementsGalleryViewer");
    if (viewer) {
      viewer.hidden = true;
      viewer.setAttribute("aria-hidden", "true");
    }
    var img = document.getElementById("portalAchievementsViewerImg");
    if (img) img.removeAttribute("src");
    document.body.classList.remove("portal-achievements-viewer-open");
    state.viewerIndex = -1;
    if (state.participant) showStep("capture");
    syncAchievementScreenshotGuard();
  }

  function updateViewerNavButtons() {
    var prev = document.getElementById("portalAchievementsViewerPrev");
    var next = document.getElementById("portalAchievementsViewerNext");
    if (prev) prev.disabled = state.viewerIndex <= 0;
    if (next) next.disabled = state.viewerIndex >= state.photos.length - 1;
  }

  async function openGalleryViewer(index) {
    if (!state.photos.length) return;
    closeCameraFullscreen();
    var idx = Math.max(0, Math.min(index, state.photos.length - 1));
    state.viewerIndex = idx;
    var row = state.photos[idx];
    var url = await signedUrlFor(row.storage_path);
    var img = document.getElementById("portalAchievementsViewerImg");
    if (img) img.src = url;
    var viewer = document.getElementById("portalAchievementsGalleryViewer");
    if (viewer) {
      viewer.hidden = false;
      viewer.setAttribute("aria-hidden", "false");
    }
    document.body.classList.add("portal-achievements-viewer-open");
    updateViewerNavButtons();
    syncAchievementScreenshotGuard();
  }

  function navigateGalleryViewer(delta) {
    if (state.viewerIndex < 0 || !state.photos.length) return;
    var next = state.viewerIndex + delta;
    if (next < 0 || next >= state.photos.length) return;
    void openGalleryViewer(next);
  }

  async function deletePhotoById(row, opts) {
    opts = opts || {};
    if (!row || !row.id) return false;
    var client = cfg.getClient();
    if (!client) {
      setStatus("Sign in required.", true);
      return false;
    }
    try {
      if (!opts.quiet) setStatus("Deleting…");
      if (row.storage_path) {
        await client.storage.from(BUCKET).remove([row.storage_path]);
      }
      var del = await client.from("portal_participant_achievement_photos").delete().eq("id", row.id);
      if (del.error) throw del.error;
      delete signedUrlCache[row.storage_path];
      await refreshGallery();
      if (!opts.quiet) setStatus("");
      void updateFooterGalleryThumb();
      return true;
    } catch (e) {
      console.error(e);
      setStatus(esc(e.message || "Could not delete photo"), true);
      return false;
    }
  }

  async function deleteViewerPhoto() {
    if (state.viewerIndex < 0 || !state.photos.length) return;
    var row = state.photos[state.viewerIndex];
    var delBtn = document.getElementById("portalAchievementsViewerDelete");
    if (delBtn) delBtn.disabled = true;
    try {
      var removedIdx = state.viewerIndex;
      state.viewerIndex = -1;
      var ok = await deletePhotoById(row, { quiet: true });
      if (!ok) return;
      if (!state.photos.length) {
        closeGalleryViewer();
        return;
      }
      var nextIdx = Math.min(removedIdx, state.photos.length - 1);
      void openGalleryViewer(nextIdx);
    } finally {
      if (delBtn) delBtn.disabled = false;
    }
  }

  async function renderGallery() {
    var host = document.getElementById("portalAchievementsGallery");
    if (!host) return;
    showStep(state.participant ? "capture" : "pick");
    if (state.captureMode !== "gallery") {
      host.innerHTML = "";
      return;
    }
    if (!state.photos.length) {
      closeGalleryViewer();
      host.innerHTML =
        '<p class="muted portal-achievements-empty">' +
        (isInboxParticipant(state.participant)
          ? "No inbox photos yet for today."
          : "No photos yet for this participant.") +
        "</p>";
      return;
    }
    host.innerHTML =
      '<div class="portal-achievements-gallery-grid portal-achievement-protected"></div>';
    var grid = host.querySelector(".portal-achievements-gallery-grid");
    for (var i = 0; i < state.photos.length; i++) {
      var row = state.photos[i];
      var url = await signedUrlFor(row.storage_path);
      var wrap = document.createElement("div");
      var pw = Number(row.width) || 0;
      var ph = Number(row.height) || 0;
      wrap.className = "portal-achievements-thumb";
      if (pw > 0 && ph > 0) {
        wrap.style.aspectRatio = pw + " / " + ph;
        wrap.classList.add(pw >= ph ? "is-landscape" : "is-portrait");
      }
      wrap.setAttribute("data-ach-photo-index", String(i));
      var who = String(row.staff_display_name || "").trim();
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "portal-achievements-thumb__open";
      cell.setAttribute("aria-label", "View photo " + (i + 1) + " of " + state.photos.length);
      cell.innerHTML =
        '<img src="' +
        esc(url) +
        '" alt="" draggable="false" class="portal-screenshot-protected portal-achievement-protected" />' +
        (who
          ? '<span class="portal-achievements-thumb__by">' + esc(who) + "</span>"
          : "");
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "portal-achievements-thumb__delete";
      delBtn.setAttribute("aria-label", "Delete photo " + (i + 1));
      delBtn.textContent = "×";
      wrap.appendChild(cell);
      wrap.appendChild(delBtn);
      cell.addEventListener("click", function () {
        var idx = Number(wrap.getAttribute("data-ach-photo-index"));
        if (!Number.isFinite(idx)) return;
        void openGalleryViewer(idx);
      });
      delBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        void deletePhotoById(row);
      });
      grid.appendChild(wrap);
    }
    if (state.viewerIndex >= 0 && state.viewerIndex < state.photos.length) {
      void openGalleryViewer(state.viewerIndex);
    }
    syncAchievementScreenshotGuard();
  }

  function bindSheet() {
    var root = document.getElementById("achievementsSheet");
    if (!root || root.getAttribute("data-portal-achievements-bound") === "1") return;
    root.setAttribute("data-portal-achievements-bound", "1");
    ensureCaptureGuard();
    if (!global.__portalAchievementsCamLayoutBound) {
      global.__portalAchievementsCamLayoutBound = true;
      var onLayout = function () {
        syncCameraLandscapeRail();
      };
      window.addEventListener("resize", onLayout, { passive: true });
      window.addEventListener("orientationchange", onLayout, { passive: true });
      try {
        var mq = window.matchMedia("(orientation: landscape)");
        if (mq && typeof mq.addEventListener === "function") {
          mq.addEventListener("change", onLayout);
        } else if (mq && typeof mq.addListener === "function") {
          mq.addListener(onLayout);
        }
      } catch (_mq) {}
    }

    var backBtn = document.getElementById("portalAchievementsBackParticipants");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        closeGalleryViewer();
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
        setCaptureMode("camera");
        void captureFromCamera();
      });
    }

    var snapBtn = document.getElementById("portalAchievementsSnap");
    if (snapBtn) {
      snapBtn.addEventListener("click", function () {
        void snapPhoto();
      });
    }

    var fsGallery = document.getElementById("portalAchievementsFsGallery");
    if (fsGallery) {
      fsGallery.addEventListener("click", function () {
        exitCameraToParticipant();
      });
    }

    var fsClose = document.getElementById("portalAchievementsFsClose");
    if (fsClose) {
      fsClose.addEventListener("click", function () {
        exitCameraToHub();
      });
    }

    var fsPhoto = document.getElementById("portalAchievementsFsPhoto");
    if (fsPhoto) {
      fsPhoto.addEventListener("click", function () {
        state.cameraMode = "photo";
        setCameraFooterMode();
        setStatus("");
      });
    }

    var fsVideo = document.getElementById("portalAchievementsFsVideo");
    if (fsVideo) {
      fsVideo.addEventListener("click", function () {
        state.cameraMode = "video";
        setCameraFooterMode();
        setStatus("Video is not available yet.", true);
      });
    }

    var viewerClose = document.getElementById("portalAchievementsViewerClose");
    if (viewerClose) {
      viewerClose.addEventListener("click", function () {
        closeGalleryViewer();
      });
    }

    var viewerPrev = document.getElementById("portalAchievementsViewerPrev");
    if (viewerPrev) {
      viewerPrev.addEventListener("click", function () {
        navigateGalleryViewer(-1);
      });
    }

    var viewerNext = document.getElementById("portalAchievementsViewerNext");
    if (viewerNext) {
      viewerNext.addEventListener("click", function () {
        navigateGalleryViewer(1);
      });
    }

    var viewerDelete = document.getElementById("portalAchievementsViewerDelete");
    if (viewerDelete) {
      viewerDelete.addEventListener("click", function () {
        void deleteViewerPhoto();
      });
    }

    var fsFlip = document.getElementById("portalAchievementsFsFlip");
    if (fsFlip) {
      fsFlip.addEventListener("click", function () {
        void flipCamera();
      });
    }

    document.querySelectorAll("[data-portal-ach-zoom]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = Number(btn.getAttribute("data-portal-ach-zoom"));
        if (!Number.isFinite(v) || v < 1) return;
        state.zoomScale = v;
        setZoomUi();
      });
    });

    var galBtn = document.getElementById("portalAchievementsShowGallery");
    if (galBtn) {
      galBtn.addEventListener("click", function () {
        setCaptureMode("gallery");
        void refreshGallery();
      });
    }
  }

  function openSheet(opts) {
    opts = opts || {};
    bindSheet();
    closeGalleryViewer();
    closeCameraFullscreen();
    state.participant = null;
    state.photos = [];
    state.captureMode = "hub";
    state.cameraMode = "photo";
    signedUrlCache = Object.create(null);
    stopCamera();
    setStatus("");
    var titleEl = document.getElementById("achievementsSheetTitle");
    if (titleEl) {
      titleEl.textContent = isLeadInboxMode() ? "Session photos" : "Participant achievements";
    }
    if (isLeadInboxMode() && opts.inboxMode !== false) {
      selectInboxParticipant({ openCamera: opts.openCamera !== false });
      return;
    }
    renderParticipantPicker();
    showStep("pick");
    setCaptureMode("hub");
    var cap = document.getElementById("portalAchievementsStepCapture");
    if (cap) cap.hidden = true;
    var pick = document.getElementById("portalAchievementsStepPick");
    if (pick) pick.hidden = false;
  }

  function sheetHtml() {
    return (
      '<section class="sheet sheet--fullscreen sheet--mobile-frame" id="achievementsSheet" aria-labelledby="achievementsSheetTitle">' +
      '<div class="sheet-head portal-achievements-sheet-head">' +
      '<h3 id="achievementsSheetTitle">Participant achievements</h3>' +
      "</div>" +
      '<div class="sheet-body portal-achievements-sheet-body">' +
      '<p class="portal-achievements-note">Photos stay in the portal only (not your phone gallery). On this device, screen captures show black while you view photos here.</p>' +
      '<div id="portalAchievementsStatus" class="portal-achievements-status" role="status"></div>' +
      '<div id="portalAchievementsStepPick">' +
      '<p class="portal-achievements-step-title">Today — <span id="portalAchievementsDayLabel"></span></p>' +
      '<p class="muted portal-achievements-pick-hint" id="portalAchievementsPickHint">Same participants as your Today list (A–Z).</p>' +
      '<div id="portalAchievementsParticipantList" class="portal-achievements-participant-list"></div>' +
      "</div>" +
      '<div id="portalAchievementsStepCapture" hidden>' +
      '<div class="portal-achievements-capture-head">' +
      '<button type="button" class="portal-achievements-participants-chip" id="portalAchievementsBackParticipants">Participants</button>' +
      '<p class="portal-achievements-selected-name" id="portalAchievementsSelectedName"></p>' +
      "</div>" +
      '<p class="muted portal-achievements-count" id="portalAchievementsCount"></p>' +
      '<div class="portal-achievements-icon-actions">' +
      '<button type="button" class="portal-achievements-icon-btn portal-achievements-icon-btn--camera" id="portalAchievementsOpenCamera" aria-label="Take photo">' +
      '<span class="portal-achievements-icon-btn__ico" aria-hidden="true">' +
      ICON_CAMERA +
      "</span>" +
      '<span class="portal-achievements-icon-btn__label">Take photo</span></button>' +
      '<button type="button" class="portal-achievements-icon-btn" id="portalAchievementsShowGallery" aria-label="Gallery of the day">' +
      '<span class="portal-achievements-icon-btn__ico" aria-hidden="true">' +
      ICON_GALLERY +
      "</span>" +
      '<span class="portal-achievements-icon-btn__label">Gallery</span></button>' +
      "</div>" +
      '<div id="portalAchievementsGalleryPanel">' +
      '<div id="portalAchievementsGallery" class="portal-achievements-gallery portal-achievement-protected"></div>' +
      "</div></div></div>" +
      '<div id="portalAchievementsGalleryViewer" class="portal-achievements-viewer" hidden aria-hidden="true">' +
      '<button type="button" class="portal-achievements-viewer__close" id="portalAchievementsViewerClose" aria-label="Close">×</button>' +
      '<div class="portal-achievements-viewer__stage portal-screenshot-protected portal-achievement-protected">' +
      '<img id="portalAchievementsViewerImg" alt="" draggable="false" class="portal-achievements-viewer__img portal-screenshot-protected portal-achievement-protected" />' +
      "</div>" +
      '<div class="portal-achievements-viewer__nav" role="group" aria-label="Photo navigation">' +
      '<button type="button" class="portal-achievements-viewer__nav-btn" id="portalAchievementsViewerPrev" aria-label="Previous photo">' +
      ICON_PREV +
      "</button>" +
      '<button type="button" class="portal-achievements-viewer__nav-btn portal-achievements-viewer__nav-btn--delete" id="portalAchievementsViewerDelete" aria-label="Delete photo">' +
      ICON_TRASH +
      "</button>" +
      '<button type="button" class="portal-achievements-viewer__nav-btn" id="portalAchievementsViewerNext" aria-label="Next photo">' +
      ICON_NEXT +
      "</button></div></div>" +
      '<div id="portalAchievementsCameraFullscreen" class="portal-achievements-camera-fs" hidden aria-hidden="true">' +
      '<div class="portal-achievements-camera-fs__viewport portal-achievement-protected">' +
      '<video id="portalAchievementsCameraVideo" playsinline autoplay muted class="portal-achievements-camera-fs__video"></video>' +
      '<div id="portalAchievementsCameraFlash" class="portal-achievements-camera-fs__flash" aria-hidden="true"></div>' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__chrome">' +
      '<div class="portal-achievements-camera-fs__zoom" id="portalAchievementsCameraZoom" role="group" aria-label="Zoom">' +
      '<button type="button" class="portal-ach-cam-zoom-btn is-active" data-portal-ach-zoom="1" aria-pressed="true">1×</button>' +
      '<button type="button" class="portal-ach-cam-zoom-btn" data-portal-ach-zoom="1.5" aria-pressed="false">1.5×</button>' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__footer">' +
      '<div class="portal-achievements-camera-fs__shutter-wrap" id="portalAchievementsCameraShutterWrap">' +
      '<button type="button" class="portal-achievements-camera-fs__shutter" id="portalAchievementsSnap" aria-label="Take photo"><span class="portal-achievements-camera-fs__shutter-inner"></span></button>' +
      '<button type="button" class="portal-ach-cam-close-chip" id="portalAchievementsFsClose" aria-label="Close camera">×</button>' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__bar">' +
      '<div class="portal-ach-cam-bar__side portal-ach-cam-bar__side--left">' +
      '<button type="button" class="portal-ach-cam-gallery" id="portalAchievementsFsGallery" aria-label="Gallery">' +
      '<span class="portal-ach-cam-gallery__placeholder" aria-hidden="true">' +
      ICON_GALLERY +
      "</span></button>" +
      '<button type="button" class="portal-ach-cam-mode is-active" id="portalAchievementsFsPhoto" aria-label="Photo mode" aria-pressed="true">' +
      '<span class="portal-ach-cam-mode__ico" aria-hidden="true">' +
      ICON_CAMERA +
      '</span><span class="portal-ach-cam-mode__label">Photo</span></button></div>' +
      '<div class="portal-ach-cam-bar__side portal-ach-cam-bar__side--right">' +
      '<button type="button" class="portal-ach-cam-mode" id="portalAchievementsFsVideo" aria-label="Video mode" aria-pressed="false">' +
      '<span class="portal-ach-cam-mode__ico" aria-hidden="true">' +
      ICON_VIDEO +
      '</span><span class="portal-ach-cam-mode__label">Video</span></button>' +
      '<button type="button" class="portal-ach-cam-flip" id="portalAchievementsFsFlip" aria-label="Rotate camera">' +
      ICON_FLIP +
      "</button></div></div></div></section>"
    );
  }

  /** Feedback form: load draft thumbnails for attach picker. */
  async function listDraftsForFeedback(clientId, sessionDate, portalSessionKey) {
    if (!clientId || !sessionDate) return [];
    try {
      return await fetchDraftPhotosForParticipant(
        {
          clientId: clientId,
          portalSessionKey: portalSessionKey || null,
        },
        sessionDate
      );
    } catch (_e) {
      return [];
    }
  }

  /** Max achievement photos a worker can attach to one session feedback. */
  var FEEDBACK_MAX_ATTACH = 3;

  /** Enforce the attach cap: once FEEDBACK_MAX_ATTACH are ticked, disable the rest. */
  function syncFeedbackPickLimit(host) {
    if (!host) return;
    var boxes = Array.prototype.slice.call(
      host.querySelectorAll('input[name="achievementPhoto"]')
    );
    var checked = boxes.filter(function (b) {
      return b.checked;
    }).length;
    var atMax = checked >= FEEDBACK_MAX_ATTACH;
    boxes.forEach(function (b) {
      b.disabled = atMax && !b.checked;
      var pick = b.closest(".portal-achievements-feedback-pick");
      if (pick) pick.classList.toggle("is-disabled", b.disabled);
    });
    var note = host.querySelector(".portal-achievements-feedback-count");
    if (note) {
      note.textContent = checked + " / " + FEEDBACK_MAX_ATTACH + " selected";
    }
  }

  async function renderFeedbackAttachPanel(clientId, sessionDate, portalSessionKey) {
    var host = document.getElementById("portalFeedbackAchievementsPanel");
    if (!host) return [];
    host.hidden = false;
    var rows = await listDraftsForFeedback(clientId, sessionDate, portalSessionKey);
    if (!rows.length) {
      host.innerHTML =
        '<p class="muted" style="margin:0">No achievement photos for this participant. Take them from Quick menu → Participant achievements, then come back to attach them.</p>';
      return [];
    }
    var html =
      '<p class="portal-achievements-feedback-label">Attach achievement photos (optional) — up to ' +
      FEEDBACK_MAX_ATTACH +
      ' <span class="portal-achievements-feedback-count">0 / ' +
      FEEDBACK_MAX_ATTACH +
      " selected</span></p>" +
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
            '" alt="" draggable="false" class="portal-screenshot-protected portal-achievement-protected" />';
        });
      })(picks[i], picks[i].getAttribute("data-path"));
    }
    host.querySelectorAll('input[name="achievementPhoto"]').forEach(function (box) {
      box.addEventListener("change", function () {
        syncFeedbackPickLimit(host);
      });
    });
    syncFeedbackPickLimit(host);
    ensureCaptureGuard();
    return rows;
  }

  function getSelectedFeedbackPhotoIds() {
    var host = document.getElementById("portalFeedbackAchievementsPanel");
    if (!host) return [];
    return Array.from(host.querySelectorAll('input[name="achievementPhoto"]:checked'))
      .slice(0, FEEDBACK_MAX_ATTACH)
      .map(function (inp) {
        return inp.value;
      });
  }

  async function finalizeOnFeedbackSubmit(opts) {
    var client = cfg.getClient();
    if (!client) return;
    try {
      var sess = await client.auth.getSession();
      if (!sess || !sess.data || !sess.data.session || !sess.data.session.user) {
        console.warn("[achievements] finalize skipped — sign in required to attach photos");
        return;
      }
    } catch (_auth) {
      return;
    }
    var ids = (opts && opts.attachedIds) || [];
    if (!ids.length) return;
    var payload = {
      p_attached_ids: ids,
      p_client_id: opts.clientId || null,
      p_session_date: opts.sessionDate || null,
    };
    if (opts.feedbackId) payload.p_feedback_id = opts.feedbackId;
    try {
      var res = await Promise.race([
        client.rpc("portal_finalize_achievement_photos", payload),
        new Promise(function (_resolve, reject) {
          setTimeout(function () {
            reject(new Error("finalize_timeout"));
          }, 12000);
        }),
      ]);
      if (res.error) {
        console.warn("[achievements] finalize", res.error);
      }
    } catch (e) {
      console.warn("[achievements] finalize", e);
    }
  }

  global.PortalParticipantAchievements = {
    configure: configure,
    sheetHtml: sheetHtml,
    bindSheet: bindSheet,
    openSheet: openSheet,
    openCameraDirect: openCameraDirect,
    stopCamera: stopCamera,
    listDraftsForFeedback: listDraftsForFeedback,
    renderFeedbackAttachPanel: renderFeedbackAttachPanel,
    getSelectedFeedbackPhotoIds: getSelectedFeedbackPhotoIds,
    finalizeOnFeedbackSubmit: finalizeOnFeedbackSubmit,
    syncScreenshotGuard: syncAchievementScreenshotGuard,
    MAX_PHOTOS: MAX_PHOTOS,
  };
})(typeof window !== "undefined" ? window : globalThis);
