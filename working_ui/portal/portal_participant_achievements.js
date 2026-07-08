/**
 * Participant achievements — in-app photos & short videos per participant (staff/lead).
 * Not saved to device gallery; screenshot guard overlay while viewing.
 */
(function (global) {
  "use strict";

  var BUCKET = "participant-achievements";
  var LEAD_INBOX_CLIENT_ID = "_inbox";
  var LEAD_INBOX_CLIENT_NAME = "Inbox";
  /** Legacy export; capture is unlimited — feedback submit attaches all session photos for the day. */
  var MAX_PHOTOS = null;
  var MAX_EDGE_PX = 3840;
  var JPEG_QUALITY = 0.92;
  var MAX_VIDEO_MS = 60000;
  var MIN_VIDEO_MS = 800;

  function deviceIsIos() {
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || "");
      if (/iPhone|iPod|iPad/i.test(ua)) return true;
      if (String(global.navigator.platform || "") === "MacIntel" && Number(global.navigator.maxTouchPoints || 0) > 1) {
        return true;
      }
    } catch (_e) {}
    return false;
  }

  function deviceIsStandalonePwa() {
    try {
      if (global.navigator && global.navigator.standalone === true) return true;
      if (global.matchMedia && global.matchMedia("(display-mode: standalone)").matches) return true;
    } catch (_e) {}
    return false;
  }

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
  var ICON_UPLOAD =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
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
    captureMode: "hub",
    cameraMode: "photo",
    viewerIndex: -1,
    facingMode: "environment",
    zoomScale: 1,
    videoRecorder: null,
    videoChunks: [],
    isRecordingVideo: false,
    recordingStartedAt: 0,
    recordingTimer: null,
    feedbackGalleryReview: false,
    feedbackSessionDate: null,
  };

  var signedUrlCache = Object.create(null);
  var footerThumbObjectUrl = "";
  var cameraTapLockUntil = 0;
  /** iOS: snapshot participant when opening gallery picker (page may suspend while picker is open). */
  var pendingGalleryUploadParticipant = null;

  function styleOffscreenFileInput(inp) {
    if (!inp) return;
    inp.className = "portal-achievements-file-input-offscreen";
    inp.setAttribute("tabindex", "-1");
    inp.setAttribute("aria-hidden", "true");
  }

  /** FileList is live — copy before clearing input.value (iOS Safari clears the list). */
  function copyInputFiles(inp) {
    return Array.prototype.slice.call((inp && inp.files) || []);
  }

  function resolveGalleryUploadParticipant() {
    if (state.participant && state.participant.clientId) return state.participant;
    if (pendingGalleryUploadParticipant && pendingGalleryUploadParticipant.clientId) {
      state.participant = pendingGalleryUploadParticipant;
      return state.participant;
    }
    return null;
  }

  function guardCameraTap(fn) {
    return function (ev) {
      if (ev && ev.type === "touchend") ev.preventDefault();
      var now = Date.now();
      if (now < cameraTapLockUntil) return;
      cameraTapLockUntil = now + 420;
      fn(ev);
    };
  }

  function ensureCameraLayerOnBody() {
    var fs = getCameraFullscreenEl();
    if (!fs || fs.parentNode === document.body) return;
    document.body.appendChild(fs);
  }

  function revokeFooterThumbObjectUrl() {
    if (!footerThumbObjectUrl) return;
    try {
      URL.revokeObjectURL(footerThumbObjectUrl);
    } catch (_revoke) {}
    footerThumbObjectUrl = "";
  }

  function setFooterGalleryThumbFromBlob(blob) {
    var btn = document.getElementById("portalAchievementsFsGallery");
    if (!btn || !blob) return;
    revokeFooterThumbObjectUrl();
    footerThumbObjectUrl = URL.createObjectURL(blob);
    btn.classList.add("has-thumb");
    btn.innerHTML =
      '<img src="' +
      esc(footerThumbObjectUrl) +
      '" alt="" class="portal-ach-cam-gallery__thumb portal-screenshot-protected portal-achievement-protected" draggable="false" />';
  }

  function waitForCameraVideoReady(video, maxMs) {
    maxMs = maxMs == null ? 5000 : maxMs;
    return new Promise(function (resolve) {
      if (!video) {
        resolve(false);
        return;
      }
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("loadeddata", onMeta);
        resolve(!!ok);
      }
      function onMeta() {
        if (video.videoWidth > 0 && video.videoHeight > 0) finish(true);
      }
      if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) {
        finish(true);
        return;
      }
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("loadeddata", onMeta);
      var start = Date.now();
      (function poll() {
        if (done) return;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          finish(true);
          return;
        }
        if (Date.now() - start >= maxMs) {
          finish(false);
          return;
        }
        global.setTimeout(poll, 80);
      })();
    });
  }

  async function ensureCameraVideoPlaying(video) {
    if (!video) return false;
    try {
      if (video.paused) await video.play();
    } catch (_play) {}
    return waitForCameraVideoReady(video, 5000);
  }

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
    if (options.resolveParticipantPhotoUrl) cfg.resolveParticipantPhotoUrl = options.resolveParticipantPhotoUrl;
  }

  function resolveParticipantPhotoUrl(name, clientId) {
    try {
      if (typeof cfg.resolveParticipantPhotoUrl === "function") {
        var fromCfg = String(cfg.resolveParticipantPhotoUrl(name, clientId) || "").trim();
        if (fromCfg) return fromCfg;
      }
    } catch (_e) {}
    if (typeof global.portalParticipantPhotoUrl === "function") {
      return String(global.portalParticipantPhotoUrl(name) || "").trim();
    }
    return "";
  }

  function participantAvatarHtml(name, clientId) {
    var avatarFile = resolveParticipantPhotoUrl(name, clientId);
    if (typeof global.portalParticipantAvatarInnerHtml === "function") {
      return global.portalParticipantAvatarInnerHtml(name, clientId, {
        esc: esc,
        avatarFile: avatarFile,
        className: "portal-roster-avatar portal-achievements-participant__avatar",
      });
    }
    return '<span class="portal-roster-avatar portal-achievements-participant__avatar" aria-hidden="true">' + esc(String(name || "?").slice(0, 2)) + "</span>";
  }

  function isLeadInboxMode() {
    try {
      return !!cfg.isLeadInboxMode();
    } catch (_e) {
      return false;
    }
  }

  /** Leaders only — pick existing photos/videos from phone or computer gallery. */
  function canUploadFromDeviceGallery() {
    return isLeadInboxMode();
  }

  /** Victor / Raúl / Javi — gallery + inbox mode (email works before staff_profile hydrates). */
  function resolveExecGalleryAccess() {
    try {
      if (
        typeof global.portalStaffHasLeadPhotoInboxAccess === "function" &&
        global.portalStaffHasLeadPhotoInboxAccess()
      ) {
        return true;
      }
      var box = global.__PORTAL_SUPABASE__ || {};
      var prof = box.staff_profile;
      var em = String((box.session && box.session.user && box.session.user.email) || "").trim();
      if (typeof global.portalCanAccessCeoDashboard === "function") {
        if (global.portalCanAccessCeoDashboard(prof, em)) return true;
      }
      if (typeof global.__portalCanAccessCeoDashboard === "function") {
        if (global.__portalCanAccessCeoDashboard(prof, em)) return true;
      }
      if (typeof global.portalInferStaffKey === "function") {
        var k = String(global.portalInferStaffKey(prof, em) || "")
          .trim()
          .toLowerCase();
        if (k === "victor" || k === "javi" || k === "raul") return true;
      }
      if (String((prof && prof.app_role) || "").trim().toLowerCase() === "ceo") return true;
    } catch (_e) {}
    return false;
  }

  /** Programme leads when profile hydration is still pending (Berta/John/Michelle). */
  function resolveProgrammeLeadGalleryAccess() {
    if (canUploadFromDeviceGallery()) return true;
    try {
      var keys = { berta: 1, john: 1, michelle: 1 };
      var sid = String(
        (global.STAFF_DASHBOARD_ID ||
          (global.dashboardData && global.dashboardData.staffId) ||
          "") + "",
      )
        .trim()
        .toLowerCase();
      if (keys[sid]) return true;
      var box = global.__PORTAL_SUPABASE__ || {};
      var prof = box.staff_profile;
      var em = String((box.session && box.session.user && box.session.user.email) || "")
        .trim()
        .toLowerCase();
      if (em.indexOf("traperocasado") >= 0) return true;
      if (em.indexOf("johnnyosti") >= 0 || em.indexOf("john.osti") >= 0) return true;
      if (em.indexOf("michelle@youtimecounselling") >= 0) return true;
      if (typeof global.portalInferStaffKey === "function") {
        var rk = String(global.portalInferStaffKey(prof, em) || "")
          .trim()
          .toLowerCase();
        if (keys[rk]) return true;
      }
      var un = String((prof && prof.username) || "")
        .trim()
        .toLowerCase();
      if (keys[un] || un === "stf012" || un === "stf006") return true;
    } catch (_e) {}
    return false;
  }

  function canUploadFromDeviceGalleryResolved() {
    if (typeof global.portalStaffCanUploadAchievementFromGallery === "function") {
      try {
        if (global.portalStaffCanUploadAchievementFromGallery()) return true;
      } catch (_e) {}
    }
    return (
      canUploadFromDeviceGallery() ||
      resolveProgrammeLeadGalleryAccess() ||
      resolveExecGalleryAccess()
    );
  }

  function isLeadSessionPhotosMode() {
    if (typeof global.portalStaffCanUploadAchievementFromGallery === "function") {
      try {
        if (global.portalStaffCanUploadAchievementFromGallery()) return true;
      } catch (_e) {}
    }
    return (
      isLeadInboxMode() ||
      resolveProgrammeLeadGalleryAccess() ||
      resolveExecGalleryAccess()
    );
  }

  function handleCameraRetryTap() {
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
  }

  function bindAchievementStatusActions() {
    var statusEl = document.getElementById("portalAchievementsStatus");
    if (!statusEl || statusEl.getAttribute("data-portal-status-actions-bound") === "1") return;
    statusEl.setAttribute("data-portal-status-actions-bound", "1");
    function onStatusAction(e) {
      var btn = e.target && e.target.closest ? e.target.closest("button") : null;
      if (!btn || !statusEl.contains(btn)) return;
      if (btn.id === "portalAchievementsCamRetryBtn") {
        e.preventDefault();
        handleCameraRetryTap();
      } else if (btn.id === "portalAchievementsGalleryUploadBtn") {
        e.preventDefault();
        openGalleryUploadPicker();
      } else if (btn.id === "portalAchievementsNativeCamBtn") {
        e.preventDefault();
        openNativePhotoPicker();
      }
    }
    statusEl.addEventListener("click", onStatusAction);
    statusEl.addEventListener("touchend", onStatusAction, { passive: false });
  }

  /** Unlimited capture per participant/day; feedback submit caps attachments separately. */
  function maxPhotosForCurrentParticipant() {
    return null;
  }

  function isAtPhotoLimit() {
    var max = maxPhotosForCurrentParticipant();
    if (max == null) return false;
    return state.photos.length >= max;
  }

  function photoLimitMessage() {
    var max = maxPhotosForCurrentParticipant();
    if (max == null) return "";
    return "Maximum " + max + " photos/videos for this participant today. Delete one to add another.";
  }

  function rowMediaType(row) {
    if (row && String(row.media_type || "").toLowerCase() === "video") return "video";
    var path = String((row && row.storage_path) || "");
    if (/\.(webm|mp4|mov|m4v)$/i.test(path)) return "video";
    return "photo";
  }

  function formatDurationMs(ms) {
    var sec = Math.max(0, Math.round(Number(ms || 0) / 1000));
    if (sec < 60) return sec + "s";
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function pickVideoMime() {
    if (typeof MediaRecorder === "undefined") return "";
    var types = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (var i = 0; i < types.length; i++) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return "";
  }

  function fileExtForMime(mime) {
    var m = String(mime || "").toLowerCase();
    if (m.indexOf("mp4") >= 0 || m.indexOf("quicktime") >= 0) return "mp4";
    return "webm";
  }

  function streamHasAudio(stream) {
    return !!(stream && stream.getAudioTracks && stream.getAudioTracks().length);
  }

  function updateRecordingUi() {
    var snapBtn = document.getElementById("portalAchievementsSnap");
    var wrap = document.getElementById("portalAchievementsCameraShutterWrap");
    if (snapBtn) {
      snapBtn.classList.toggle("is-recording", !!state.isRecordingVideo);
      snapBtn.setAttribute(
        "aria-label",
        state.cameraMode === "video"
          ? state.isRecordingVideo
            ? "Stop recording"
            : "Start recording"
          : "Take photo"
      );
    }
    if (wrap) wrap.classList.toggle("is-recording", !!state.isRecordingVideo);
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
    } else {
      setCaptureMode("hub");
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
    if (/mime|content type|file size|payload too large|invalid mime/i.test(msg)) {
      return "File type or size not allowed. Videos must be under 50 MB — try a shorter clip.";
    }
    if (/row-level security|rls|policy|forbidden|not_authenticated/i.test(msg)) {
      return (
        "Could not be saved (portal permissions). Sign out and sign in again with your club email. " +
        "If it still fails, tell ops — run migration 20260701170000_portal_achievement_upload_rls_reassert.sql on Supabase Portal."
      );
    }
    if (/media_type|duration_ms|column.*does not exist/i.test(msg)) {
      return (
        "Video support is not fully enabled on the database yet. Tell ops to run migration " +
        "20260626200000_portal_achievement_videos.sql on Supabase Portal."
      );
    }
    return msg || "Could not save";
  }

  function mediaThumbInnerHtml(url, row) {
    var who = String((row && row.staff_display_name) || "").trim();
    var whoHtml = who ? '<span class="portal-achievements-thumb__by">' + esc(who) + "</span>" : "";
    if (rowMediaType(row) === "video") {
      var dur = row && row.duration_ms ? formatDurationMs(row.duration_ms) : "";
      return (
        '<video src="' +
        esc(url) +
        '" muted playsinline preload="metadata" draggable="false" class="portal-screenshot-protected portal-achievement-protected"></video>' +
        '<span class="portal-achievements-thumb__video-badge" aria-hidden="true">' +
        ICON_VIDEO +
        (dur ? " " + esc(dur) : "") +
        "</span>" +
        whoHtml
      );
    }
    return (
      '<img src="' +
      esc(url) +
      '" alt="" draggable="false" class="portal-screenshot-protected portal-achievement-protected" />' +
      whoHtml
    );
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
      if (deviceIsIos() && deviceIsStandalonePwa()) {
        return "Camera blocked in the staff app. Tap Use phone camera below — that opens the iPhone camera. To allow live preview later: iPhone Settings → clubSENsational Staff → Camera → Allow.";
      }
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

  async function acquireCameraStream(facingMode, opts) {
    opts = opts || {};
    var wantAudio = !!opts.audio;
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
          v === true ? { audio: wantAudio, video: true } : { audio: wantAudio, video: v };
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("camera_unavailable");
  }

  async function ensureCameraStreamForMode() {
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video) return;
    var wantAudio = state.cameraMode === "video";
    if (wantAudio && !streamHasAudio(state.stream)) {
      pushCameraMediaBypass();
      stopCameraTracksOnly();
      state.stream = await acquireCameraStream(state.facingMode, { audio: true });
      video.srcObject = state.stream;
      video.hidden = false;
      applyVideoZoom();
    }
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

  function deviceOrientationAngle() {
    try {
      if (
        global.screen &&
        global.screen.orientation &&
        typeof global.screen.orientation.angle === "number"
      ) {
        return ((global.screen.orientation.angle % 360) + 360) % 360;
      }
    } catch (_e) {}
    if (typeof global.orientation === "number" && !isNaN(global.orientation)) {
      return ((global.orientation % 360) + 360) % 360;
    }
    return null;
  }

  /** Draw video frame upright — matches preview, including iOS landscape capture. */
  function drawVideoFrameToCanvas(video, vw, vh, rotDeg, mirrorFront) {
    rotDeg = ((Math.round(Number(rotDeg) || 0) % 360) + 360) % 360;
    var canvas = document.createElement("canvas");
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (rotDeg === 90 || rotDeg === 270) {
      canvas.width = vh;
      canvas.height = vw;
    } else {
      canvas.width = vw;
      canvas.height = vh;
    }
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotDeg * Math.PI) / 180);
    if (mirrorFront) ctx.scale(-1, 1);
    ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
    return canvas;
  }

  function captureRotationDegrees(video) {
    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (!vw || !vh) return 0;

    var videoLandscape = vw > vh;
    var screenLandscape = deviceIsLandscape();
    var angle = deviceOrientationAngle();

    if (deviceIsIos()) {
      if (angle === 0) return videoLandscape ? 270 : 0;
      if (angle === 90) return videoLandscape ? 90 : 0;
      if (angle === 180) return videoLandscape ? 90 : 180;
      if (angle === 270) return videoLandscape ? 270 : 0;
      if (videoLandscape && !screenLandscape) return 270;
      if (!videoLandscape && screenLandscape) return 90;
      return 0;
    }

    if (screenLandscape && !videoLandscape) return 90;
    if (!screenLandscape && videoLandscape) return 270;
    return 0;
  }

  /** Draw video frame respecting how the user is holding the phone. */
  function captureCanvasFromVideo(video) {
    var vw = video.videoWidth;
    var vh = video.videoHeight;
    if (!vw || !vh) return null;
    var front = state.facingMode === "user";
    return drawVideoFrameToCanvas(video, vw, vh, captureRotationDegrees(video), front);
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
      photoBtn.disabled = !!state.isRecordingVideo;
    }
    if (videoBtn) {
      videoBtn.classList.toggle("is-active", !isPhoto);
      videoBtn.setAttribute("aria-pressed", !isPhoto ? "true" : "false");
      videoBtn.disabled = !!state.isRecordingVideo;
    }
    updateRecordingUi();
  }

  async function switchCameraMode(mode) {
    if (state.isRecordingVideo) return;
    var next = mode === "video" ? "video" : "photo";
    if (state.cameraMode === next) return;
    state.cameraMode = next;
    setCameraFooterMode();
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (next === "video") {
      setStatus("Tap the white button to start recording, tap again to stop.");
      try {
        await ensureCameraStreamForMode();
      } catch (err) {
        console.error(err);
        setStatus(cameraErrorMessage(err), true);
      }
      return;
    }
    setStatus("");
    if (!streamHasAudio(state.stream)) return;
    try {
      pushCameraMediaBypass();
      stopCameraTracksOnly();
      state.stream = await acquireCameraStream(state.facingMode, { audio: false });
      if (video) {
        video.srcObject = state.stream;
        video.hidden = false;
      }
      applyVideoZoom();
    } catch (err) {
      console.error(err);
      setStatus(cameraErrorMessage(err), true);
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
    if (rowMediaType(last) === "video") {
      btn.innerHTML =
        '<video src="' +
        esc(url) +
        '" muted playsinline preload="metadata" class="portal-ach-cam-gallery__thumb portal-screenshot-protected portal-achievement-protected" draggable="false"></video>';
    } else {
      btn.innerHTML =
        '<img src="' + esc(url) + '" alt="" class="portal-ach-cam-gallery__thumb portal-screenshot-protected portal-achievement-protected" draggable="false" />';
    }
  }

  async function flipCamera() {
    if (state.isRecordingVideo) return;
    state.facingMode = state.facingMode === "user" ? "environment" : "user";
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video) return;
    pushCameraMediaBypass();
    stopCameraTracksOnly();
    try {
      state.stream = await acquireCameraStream(state.facingMode, { audio: state.cameraMode === "video" });
      video.srcObject = state.stream;
      video.hidden = false;
      applyVideoZoom();
    } catch (err) {
      console.error(err);
      setStatus(cameraErrorMessage(err), true);
    }
  }

  function stopCameraTracksOnly() {
    if (state.isRecordingVideo) {
      void stopVideoRecordingInternal(true);
    }
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
    ensureCameraLayerOnBody();
    pushCameraMediaBypass();
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

  function handleNativePhotoInputSelected(files) {
    var file = files && files[0];
    if (!file) return;
    var participant = resolveGalleryUploadParticipant();
    if (!participant) {
      setStatus("Session expired — close and reopen Session photos, then try again.", true);
      return;
    }
    setStatus("Saving…");
    void uploadGalleryFile(file)
      .then(function () {
        return loadGalleryPhotos();
      })
      .then(function () {
        pendingGalleryUploadParticipant = null;
        setStatus("Photo saved.");
        syncGalleryUiAfterPhotosChanged();
      })
      .catch(function (e) {
        setStatus(esc(uploadErrorMessage(e)), true);
      });
  }

  function handleGalleryUploadInputSelected(files) {
    if (!files || !files.length) return;
    if (!canUploadFromDeviceGalleryResolved()) {
      setStatus("Only leaders can upload from your photo gallery.", true);
      return;
    }
    var participant = resolveGalleryUploadParticipant();
    if (!participant) {
      setStatus("Session expired — close and reopen Session photos, then try Upload again.", true);
      return;
    }
    setStatus("Uploading 1 of " + files.length + "…");
    void uploadGalleryFiles(files).finally(function () {
      pendingGalleryUploadParticipant = null;
    });
  }

  function bindFileInputChange(inp, onSelected) {
    if (!inp || inp.getAttribute("data-portal-file-bound") === "1") return;
    inp.setAttribute("data-portal-file-bound", "1");
    inp.addEventListener("change", function () {
      var files = copyInputFiles(inp);
      inp.value = "";
      onSelected(files);
    });
  }

  function ensureNativePhotoInput() {
    var inp = document.getElementById("portalAchievementsNativePhotoInput");
    if (!inp) {
      inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*";
      inp.setAttribute("capture", "environment");
      inp.id = "portalAchievementsNativePhotoInput";
      document.body.appendChild(inp);
    }
    styleOffscreenFileInput(inp);
    bindFileInputChange(inp, handleNativePhotoInputSelected);
    return inp;
  }

  function ensureGalleryUploadInput() {
    var inp = document.getElementById("portalAchievementsGalleryUploadInput");
    if (!inp) {
      inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "image/*,video/*,.heic,.heif";
      inp.multiple = true;
      inp.id = "portalAchievementsGalleryUploadInput";
      document.body.appendChild(inp);
    }
    styleOffscreenFileInput(inp);
    bindFileInputChange(inp, handleGalleryUploadInputSelected);
    return inp;
  }

  function openGalleryUploadPicker() {
    if (!canUploadFromDeviceGalleryResolved()) {
      setStatus("Only leaders can upload from your photo gallery.", true);
      return;
    }
    if (!state.participant) {
      setStatus("Choose a participant first.", true);
      return;
    }
    if (isAtPhotoLimit()) {
      setStatus(photoLimitMessage(), true);
      return;
    }
    pendingGalleryUploadParticipant = {
      clientId: state.participant.clientId,
      clientName: state.participant.clientName,
      portalSessionKey: state.participant.portalSessionKey || null,
    };
    ensureGalleryUploadInput().click();
  }

  function loadVideoFileMetadata(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = function () {
        var out = {
          durationMs: Math.max(0, Math.round(Number(video.duration || 0) * 1000)),
          width: video.videoWidth || null,
          height: video.videoHeight || null,
        };
        URL.revokeObjectURL(url);
        resolve(out);
      };
      video.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("video_load_failed"));
      };
      video.src = url;
    });
  }

  function isGalleryUploadVideoFile(file) {
    var type = String((file && file.type) || "").toLowerCase();
    if (type.indexOf("video/") === 0) return true;
    var name = String((file && file.name) || "").toLowerCase();
    return /\.(webm|mp4|mov|m4v)$/i.test(name);
  }

  async function uploadGalleryFile(file) {
    if (!file) return;
    if (isGalleryUploadVideoFile(file)) {
      var meta = await loadVideoFileMetadata(file);
      var fakeEl = { videoWidth: meta.width, videoHeight: meta.height };
      await uploadVideoBlob(file, file.type || "video/mp4", meta.durationMs, fakeEl);
      return;
    }
    await uploadPhotoBlob(file);
  }

  async function uploadGalleryFiles(fileList) {
    if (!canUploadFromDeviceGalleryResolved()) {
      setStatus("Only leaders can upload from your photo gallery.", true);
      return;
    }
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var uploadBtn = document.getElementById("portalAchievementsUploadFromPhone");
    if (uploadBtn) uploadBtn.disabled = true;
    var ok = 0;
    var lastErr = null;
    for (var i = 0; i < files.length; i++) {
      setStatus("Uploading " + (i + 1) + " of " + files.length + "…");
      try {
        await uploadGalleryFile(files[i]);
        ok++;
      } catch (e) {
        console.error(e);
        lastErr = e;
      }
    }
    if (uploadBtn) uploadBtn.disabled = false;
    if (ok === files.length) {
      var dest = isInboxParticipant(state.participant) ? "Inbox" : "portal";
      setStatus(
        ok === 1
          ? "1 item saved to " + dest + "."
          : ok + " items saved to " + dest + ".",
        false
      );
    } else if (ok > 0) {
      setStatus(
        ok + " of " + files.length + " saved. " + esc(uploadErrorMessage(lastErr)),
        true
      );
    } else {
      setStatus(esc(uploadErrorMessage(lastErr)), true);
    }
    await loadGalleryPhotos();
    syncGalleryUiAfterPhotosChanged();
  }

  function openNativePhotoPicker() {
    if (!state.participant) {
      setStatus("Choose a participant first.", true);
      return;
    }
    if (isAtPhotoLimit()) {
      setStatus(photoLimitMessage(), true);
      return;
    }
    pendingGalleryUploadParticipant = {
      clientId: state.participant.clientId,
      clientName: state.participant.clientName,
      portalSessionKey: state.participant.portalSessionKey || null,
    };
    ensureNativePhotoInput().click();
  }

  function showCameraFailure(err) {
    var name = String((err && err.name) || "").trim();
    var msg = esc(cameraErrorMessage(err));
    var html = msg;
    if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
      html += '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;min-width:0">';
      html +=
        '<button type="button" class="btn btn--pri btn--sm" id="portalAchievementsCamRetryBtn">Allow camera now</button>';
      if (canUploadFromDeviceGalleryResolved()) {
        html +=
          '<button type="button" class="btn btn--sec btn--sm" id="portalAchievementsGalleryUploadBtn">Upload from gallery</button>';
      }
      html +=
        '<button type="button" class="btn btn--sec btn--sm" id="portalAchievementsNativeCamBtn">Use phone camera</button>';
      html += "</div>";
      if (canUploadFromDeviceGalleryResolved()) {
        html +=
          '<p class="muted" style="margin:8px 0 0;font-size:12px;line-height:1.4">Camera blocked — tap <strong>Upload from gallery</strong> to add photos from your phone or computer.</p>';
      }
    }
    setStatus(html, true);
    if (global.portalMarkCameraDenied) global.portalMarkCameraDenied();
  }

  function noteCameraGranted() {
    if (typeof global.portalMarkCameraGranted === "function") {
      global.portalMarkCameraGranted();
    }
  }

  function encodeCanvasToJpeg(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(
        function (out) {
          if (!out) {
            reject(new Error("encode_failed"));
            return;
          }
          resolve({ blob: out, width: canvas.width, height: canvas.height });
        },
        "image/jpeg",
        JPEG_QUALITY
      );
    });
  }

  function drawSourceToJpegCanvas(source, srcW, srcH) {
    var w = Number(srcW) || 0;
    var h = Number(srcH) || 0;
    if (!(w > 0 && h > 0)) throw new Error("image_load_failed");
    var scale = 1;
    if (Math.max(w, h) > MAX_EDGE_PX) scale = MAX_EDGE_PX / Math.max(w, h);
    var cw = Math.max(1, Math.round(w * scale));
    var ch = Math.max(1, Math.round(h * scale));
    var canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, cw, ch);
    return encodeCanvasToJpeg(canvas);
  }

  function loadOrientedImageSource(blob) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(blob, { imageOrientation: "from-image" })
        .catch(function () {
          return createImageBitmap(blob);
        })
        .catch(function () {
          return resizeBlobToJpegViaImageElement(blob);
        });
    }
    return resizeBlobToJpegViaImageElement(blob);
  }

  function resizeBlobToJpegViaImageElement(blob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        resolve(img);
        URL.revokeObjectURL(url);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("image_load_failed"));
      };
      img.src = url;
    });
  }

  function resizeBlobToJpeg(blob) {
    return loadOrientedImageSource(blob).then(function (source) {
      var w = Number(source.width || source.naturalWidth) || 0;
      var h = Number(source.height || source.naturalHeight) || 0;
      return drawSourceToJpegCanvas(source, w, h).finally(function () {
        try {
          if (source && typeof source.close === "function") source.close();
        } catch (_close) {}
      });
    });
  }

  async function captureFromCamera() {
    if (!state.participant) {
      setStatus("Choose a participant first.", true);
      return;
    }
    if (isAtPhotoLimit()) {
      setStatus(photoLimitMessage(), true);
      return;
    }
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video) return;

    try {
      setStatus("");
      state.cameraMode = "photo";
      setCameraFooterMode();
      pushCameraMediaBypass();
      state.stream = await acquireCameraStream(state.facingMode, { audio: state.cameraMode === "video" });
      noteCameraGranted();
      openCameraFullscreen();
      showCameraLiveUi();
      video.srcObject = state.stream;
      video.hidden = false;
      applyVideoZoom();
      var ready = await ensureCameraVideoPlaying(video);
      if (!ready) {
        setStatus("Camera loading… tap the white button when the preview is sharp.", true);
      }
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

  function stopVideoRecordingInternal(cancel) {
    if (state.recordingTimer) {
      clearTimeout(state.recordingTimer);
      state.recordingTimer = null;
    }
    var rec = state.videoRecorder;
    state.videoRecorder = null;
    if (!rec || rec.state === "inactive") {
      state.isRecordingVideo = false;
      state.videoChunks = [];
      updateRecordingUi();
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      rec.onstop = function () {
        var chunks = state.videoChunks || [];
        state.videoChunks = [];
        state.isRecordingVideo = false;
        updateRecordingUi();
        setCameraFooterMode();
        if (cancel || !chunks.length) {
          resolve(null);
          return;
        }
        var mime = rec.mimeType || pickVideoMime() || "video/webm";
        resolve({
          blob: new Blob(chunks, { type: String(mime).split(";")[0] }),
          mime: mime,
        });
      };
      try {
        rec.stop();
      } catch (_stop) {
        state.isRecordingVideo = false;
        updateRecordingUi();
        resolve(null);
      }
    });
  }

  async function toggleVideoRecording() {
    if (!state.participant) {
      setStatus("Choose a participant first.", true);
      return;
    }
    if (isAtPhotoLimit()) {
      setStatus(photoLimitMessage(), true);
      return;
    }
    if (state.isRecordingVideo) {
      var snapBtnStop = document.getElementById("portalAchievementsSnap");
      if (snapBtnStop) snapBtnStop.disabled = true;
      try {
        var durationMs = Date.now() - (state.recordingStartedAt || Date.now());
        var result = await stopVideoRecordingInternal(false);
        if (!result || !result.blob || !result.blob.size) {
          setStatus("Recording failed.", true);
          return;
        }
        if (durationMs < MIN_VIDEO_MS) {
          setStatus("Recording too short — hold for at least one second.", true);
          return;
        }
        var videoEl = document.getElementById("portalAchievementsCameraVideo");
        setStatus("Saving…");
        await uploadVideoBlob(result.blob, result.mime, durationMs, videoEl);
        setStatus("Video saved.");
        void updateFooterGalleryThumb();
        showCameraLiveUi();
      } catch (e) {
        console.error(e);
        setStatus(esc(uploadErrorMessage(e)), true);
      } finally {
        if (snapBtnStop) snapBtnStop.disabled = false;
      }
      return;
    }
    await ensureCameraStreamForMode();
    var mime = pickVideoMime();
    if (!mime || typeof MediaRecorder === "undefined" || !state.stream) {
      setStatus("Video recording is not supported in this browser.", true);
      return;
    }
    state.videoChunks = [];
    var recorder = new MediaRecorder(state.stream, { mimeType: mime });
    recorder.ondataavailable = function (ev) {
      if (ev.data && ev.data.size) state.videoChunks.push(ev.data);
    };
    recorder.onerror = function () {
      setStatus("Recording failed.", true);
      void stopVideoRecordingInternal(true);
    };
    state.videoRecorder = recorder;
    state.isRecordingVideo = true;
    state.recordingStartedAt = Date.now();
    recorder.start(1000);
    state.recordingTimer = global.setTimeout(function () {
      void toggleVideoRecording();
    }, MAX_VIDEO_MS);
    setStatus(
      "Recording… tap again to stop (max " + Math.round(MAX_VIDEO_MS / 1000) + " seconds)."
    );
    updateRecordingUi();
    setCameraFooterMode();
  }

  async function snapPhoto() {
    if (!state.participant) {
      setStatus("Choose a participant first.", true);
      return;
    }
    if (state.cameraMode === "video") {
      await toggleVideoRecording();
      return;
    }
    if (isAtPhotoLimit()) {
      setStatus(photoLimitMessage(), true);
      return;
    }
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video) return;
    var snapBtn = document.getElementById("portalAchievementsSnap");
    if (snapBtn) snapBtn.disabled = true;
    try {
      var ready = await ensureCameraVideoPlaying(video);
      if (!ready || !video.videoWidth) {
        setStatus("Camera not ready yet — wait a second and tap again.", true);
        return;
      }
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
      setFooterGalleryThumbFromBlob(blob);
      setStatus("Saving…");
      await uploadPhotoBlob(blob);
      setStatus("Photo saved.");
      syncGalleryUiAfterPhotosChanged();
      revokeFooterThumbObjectUrl();
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
    var verifyPhoto = await client.storage.from(BUCKET).download(path);
    if (verifyPhoto.error) {
      try {
        await client.storage.from(BUCKET).remove([path]);
      } catch (_rm) {}
      throw verifyPhoto.error;
    }

    var staffName = "";
    try {
      var prof = await client
        .from("staff_profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .maybeSingle();
      staffName = String((prof.data && (prof.data.full_name || prof.data.username)) || "").trim();
    } catch (_e) {}

    var ins = await client
      .from("portal_participant_achievement_photos")
      .insert([
        {
          staff_user_id: user.id,
          staff_display_name: staffName,
          client_id: cid,
          client_name: String(p.clientName || "").trim() || cid,
          session_date: day,
          portal_session_key: p.portalSessionKey || null,
          storage_path: path,
          status: "draft",
          media_type: "photo",
          width: encoded.width,
          height: encoded.height,
          byte_size: encoded.blob.size,
        },
      ])
      .select(DRAFT_PHOTO_SELECT);
    if (ins.error) {
      try {
        await client.storage.from(BUCKET).remove([path]);
      } catch (_rm) {}
      throw ins.error;
    }

    if (ins.data && ins.data[0]) mergeUploadedPhotoRow(ins.data[0]);
    else await loadGalleryPhotos();
    setStatus("");
  }

  async function uploadVideoBlob(blob, mime, durationMs, videoEl) {
    var client = cfg.getClient();
    if (!client) throw new Error("Sign in required.");
    var {
      data: { user },
    } = await client.auth.getUser();
    if (!user || !user.id) throw new Error("Sign in required.");

    var p = state.participant;
    var day = londonTodayIso();
    var cid = normalizeClientId(p.clientId);
    var photoId = global.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    var ext = fileExtForMime(mime);
    var path = user.id + "/" + day + "/" + cid + "/" + photoId + "." + ext;
    var contentType = String(mime || "video/webm").split(";")[0];

    setStatus("Uploading…");
    var up = await client.storage.from(BUCKET).upload(path, blob, {
      contentType: contentType,
      upsert: false,
    });
    if (up.error) throw up.error;
    var verifyVideo = await client.storage.from(BUCKET).download(path);
    if (verifyVideo.error) {
      try {
        await client.storage.from(BUCKET).remove([path]);
      } catch (_rm) {}
      throw verifyVideo.error;
    }

    var staffName = "";
    try {
      var prof = await client
        .from("staff_profiles")
        .select("full_name, username")
        .eq("id", user.id)
        .maybeSingle();
      staffName = String((prof.data && (prof.data.full_name || prof.data.username)) || "").trim();
    } catch (_e) {}

    var vw = videoEl && videoEl.videoWidth ? videoEl.videoWidth : null;
    var vh = videoEl && videoEl.videoHeight ? videoEl.videoHeight : null;

    var ins = await client
      .from("portal_participant_achievement_photos")
      .insert([
        {
          staff_user_id: user.id,
          staff_display_name: staffName,
          client_id: cid,
          client_name: String(p.clientName || "").trim() || cid,
          session_date: day,
          portal_session_key: p.portalSessionKey || null,
          storage_path: path,
          status: "draft",
          media_type: "video",
          duration_ms: Math.max(0, Math.round(Number(durationMs || 0))),
          width: vw,
          height: vh,
          byte_size: blob.size,
        },
      ])
      .select(DRAFT_PHOTO_SELECT);
    if (ins.error) {
      try {
        await client.storage.from(BUCKET).remove([path]);
      } catch (_rm) {}
      throw ins.error;
    }

    if (ins.data && ins.data[0]) mergeUploadedPhotoRow(ins.data[0]);
    else await loadGalleryPhotos();
    setStatus("");
  }

  async function signedUrlFor(path) {
    if (signedUrlCache[path]) return signedUrlCache[path];
    var client = cfg.getClient();
    if (!client) return "";
    var res = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (res.error || !res.data) return "";
    var url = String(res.data.signedUrl || res.data.signedURL || "").trim();
    if (url) signedUrlCache[path] = url;
    return url;
  }

  function appendMediaThumb(parent, url, row) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
    var who = String((row && row.staff_display_name) || "").trim();
    if (!url) {
      var empty = document.createElement("span");
      empty.className = "portal-achievements-thumb__empty muted";
      empty.textContent = "No preview";
      parent.appendChild(empty);
      return;
    }
    if (rowMediaType(row) === "video") {
      var video = document.createElement("video");
      video.src = url;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.preload = "metadata";
      video.draggable = false;
      video.className = "portal-screenshot-protected portal-achievement-protected";
      video.addEventListener("error", function () {
        while (parent.firstChild) parent.removeChild(parent.firstChild);
        var miss = document.createElement("span");
        miss.className = "portal-achievements-thumb__empty muted";
        miss.textContent = "Video unavailable";
        parent.appendChild(miss);
      });
      parent.appendChild(video);
      var badge = document.createElement("span");
      badge.className = "portal-achievements-thumb__video-badge";
      badge.setAttribute("aria-hidden", "true");
      badge.innerHTML = ICON_VIDEO + (row && row.duration_ms ? " " + esc(formatDurationMs(row.duration_ms)) : "");
      parent.appendChild(badge);
    } else {
      var img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.draggable = false;
      img.className = "portal-screenshot-protected portal-achievement-protected";
      img.addEventListener("error", function () {
        while (parent.firstChild) parent.removeChild(parent.firstChild);
        var miss = document.createElement("span");
        miss.className = "portal-achievements-thumb__empty muted";
        miss.textContent = "File missing";
        parent.appendChild(miss);
      });
      parent.appendChild(img);
    }
    if (who) {
      var whoEl = document.createElement("span");
      whoEl.className = "portal-achievements-thumb__by";
      whoEl.textContent = who;
      parent.appendChild(whoEl);
    }
  }

  var DRAFT_PHOTO_SELECT =
    "id, storage_path, created_at, width, height, staff_user_id, staff_display_name, media_type, duration_ms, client_id";

  function mergeDraftPhotoRows(primary, extra) {
    var seen = Object.create(null);
    var out = [];
    (primary || []).concat(extra || []).forEach(function (r) {
      if (!r || !r.id || seen[r.id]) return;
      seen[r.id] = true;
      out.push(r);
    });
    out.sort(function (a, b) {
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
    return out;
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
      .select(DRAFT_PHOTO_SELECT)
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
          .select(DRAFT_PHOTO_SELECT)
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

  function mergeUploadedPhotoRow(row) {
    if (!row || !row.id) return;
    var exists = state.photos.some(function (p) {
      return p.id === row.id;
    });
    if (!exists) state.photos.push(row);
    state.photos.sort(function (a, b) {
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
  }

  async function loadGalleryPhotos() {
    if (!state.participant) {
      state.photos = [];
      return;
    }
    try {
      state.photos = await fetchDraftPhotosForParticipant(
        state.participant,
        resolveGallerySessionDate()
      );
    } catch (e) {
      console.error(e);
      state.photos = [];
      if (/does not exist|relation/i.test(e.message || "")) {
        setStatus("Run database migration 20260603160000_portal_achievement_photos_shared_drafts.sql", true);
      } else {
        setStatus(esc(e.message || "Could not load photos"), true);
      }
    }
  }

  function syncGalleryUiAfterPhotosChanged() {
    showStep(state.participant ? "capture" : "pick");
    if (state.captureMode === "gallery") {
      renderGallery();
    } else {
      var host = document.getElementById("portalAchievementsGallery");
      if (host) host.innerHTML = "";
    }
    if (isAchievementCameraOpen()) void updateFooterGalleryThumb();
    syncAchievementScreenshotGuard();
  }

  async function refreshGallery() {
    await loadGalleryPhotos();
    if (state.captureMode === "gallery") {
      setStatus("");
    }
    syncGalleryUiAfterPhotosChanged();
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
      var nm = String(p.clientName || p.name || cid).trim();
      var mergeKey = cid;
      if (typeof global.portalDedupeParticipantListEntries === "function") {
        mergeKey =
          typeof global.portalCanonicalParticipantClientId === "function"
            ? global.portalCanonicalParticipantClientId(nm) ||
              global.portalCanonicalParticipantClientId(cid) ||
              cid
            : cid;
      } else if (typeof global.portalCanonicalParticipantClientId === "function") {
        mergeKey = global.portalCanonicalParticipantClientId(nm) || global.portalCanonicalParticipantClientId(cid) || cid;
      }
      if (!mergeKey || seen[mergeKey]) return;
      seen[mergeKey] = true;
      uniq.push({
        clientId: cid || mergeKey,
        clientName: nm,
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
      hintEl.textContent = isLeadSessionPhotosMode()
        ? "Upload old photos from your phone into Inbox (unassigned). Admin downloads them and assigns each child. You can also take new photos or pick a participant from today."
        : "Same participants as your Today list (A–Z). Take photos in-app with the camera — gallery upload is for leaders only.";
    }
    if (!host) return;
    var uniq = getTodayParticipantList();
    var html = "";
    if (isLeadSessionPhotosMode()) {
      html +=
        '<button type="button" class="portal-achievements-participant portal-achievements-participant--inbox" data-ach-inbox="1" aria-label="Inbox — no participant. Admin assigns to the right client later">' +
        '<span class="portal-achievements-participant__text">' +
        '<span class="portal-achievements-participant__name">Inbox</span>' +
        '<span class="portal-achievements-participant__sub muted">No participant</span>' +
        "</span>" +
        '<span class="portal-achievements-participant__chev" aria-hidden="true">›</span></button>';
    }
    if (!uniq.length && !isLeadSessionPhotosMode()) {
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
          '">' +
          participantAvatarHtml(p.clientName, p.clientId) +
          '<span class="portal-achievements-participant__name">' +
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
    void loadGalleryPhotos().then(syncGalleryUiAfterPhotosChanged);
  }

  /** Topbar photo tool: lead inbox hub (upload or camera), or auto-start when one Today participant. */
  function openCameraDirect() {
    bindSheet();
    if (isLeadSessionPhotosMode()) {
      selectInboxParticipant({ openCamera: false });
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
    if (!isGallery) {
      var host = document.getElementById("portalAchievementsGallery");
      if (host) host.innerHTML = "";
    }
    if (camBtn) camBtn.classList.toggle("is-active", isCamera);
    if (galBtn) galBtn.classList.toggle("is-active", isGallery);
  }

  function refreshLeadInboxUi(opts) {
    opts = opts || {};
    syncLeadInboxUi();
    var titleEl = document.getElementById("achievementsSheetTitle");
    if (titleEl) {
      titleEl.textContent = isLeadSessionPhotosMode() ? "Session photos" : "Participant achievements";
    }
    var backBtn = document.getElementById("portalAchievementsBackParticipants");
    if (backBtn) {
      backBtn.textContent = isLeadSessionPhotosMode() ? "Change" : "Participants";
    }
    if (opts.full) {
      var pick = document.getElementById("portalAchievementsStepPick");
      if (pick && !pick.hidden) renderParticipantPicker();
    }
  }

  function syncLeadInboxUi() {
    var note = document.getElementById("portalAchievementsIntroNote");
    if (note) {
      var leadGallery = canUploadFromDeviceGalleryResolved();
      note.textContent = leadGallery
        ? "Upload photos or videos from your phone into Inbox (unassigned). Admin downloads them, assigns each child, and you can delete them from your phone once they are safe in the portal."
        : "Photos and short videos stay in the portal only (not your phone gallery). Use Take photo — gallery upload is for leaders only.";
    }
    var actions = document.getElementById("portalAchievementsIconActions");
    if (actions) {
      var showUpload = canUploadFromDeviceGalleryResolved();
      actions.classList.toggle("portal-achievements-icon-actions--triple", showUpload);
      actions.classList.toggle(
        "portal-achievements-icon-actions--lead-inbox",
        !!(state.participant && isInboxParticipant(state.participant))
      );
    }
    var uploadBtn = document.getElementById("portalAchievementsUploadFromPhone");
    if (uploadBtn) {
      uploadBtn.hidden = !canUploadFromDeviceGalleryResolved();
      if (canUploadFromDeviceGalleryResolved()) {
        uploadBtn.querySelector(".portal-achievements-icon-btn__label").textContent = "Upload";
      }
    }
  }

  function showStep(step) {
    var pick = document.getElementById("portalAchievementsStepPick");
    var cap = document.getElementById("portalAchievementsStepCapture");
    if (pick) pick.hidden = step !== "pick";
    if (cap) cap.hidden = step !== "capture";
    var nameEl = document.getElementById("portalAchievementsSelectedName");
    if (nameEl && state.participant) {
      if (isInboxParticipant(state.participant)) {
        nameEl.innerHTML =
          '<span class="portal-achievements-selected-name__label">Inbox</span>';
        nameEl.classList.add("portal-achievements-selected-name--inbox");
        nameEl.setAttribute("title", "No participant — admin assigns later");
      } else {
        var selName = state.participant.clientName || state.participant.clientId;
        nameEl.innerHTML =
          participantAvatarHtml(selName, state.participant.clientId) +
          '<span class="portal-achievements-selected-name__label">' +
          esc(selName) +
          "</span>";
        nameEl.classList.remove("portal-achievements-selected-name--inbox");
        nameEl.removeAttribute("title");
      }
    } else if (nameEl) {
      nameEl.innerHTML = "";
      nameEl.classList.remove("portal-achievements-selected-name--inbox");
      nameEl.removeAttribute("title");
    }
    var backBtn = document.getElementById("portalAchievementsBackParticipants");
    if (backBtn) {
      backBtn.textContent = isLeadSessionPhotosMode() ? "Change" : "Participants";
    }
    var countEl = document.getElementById("portalAchievementsCount");
    if (countEl) {
      var max = maxPhotosForCurrentParticipant();
      countEl.textContent =
        max == null
          ? state.photos.length + " item" + (state.photos.length === 1 ? "" : "s") + " (high quality, in-app only)"
          : state.photos.length + " / " + max + " photos/videos (high quality, in-app only)";
    }
    syncLeadInboxUi();
  }

  function closeGalleryViewer() {
    var viewer = document.getElementById("portalAchievementsGalleryViewer");
    if (viewer) {
      viewer.hidden = true;
      viewer.setAttribute("aria-hidden", "true");
    }
    var img = document.getElementById("portalAchievementsViewerImg");
    if (img) {
      img.hidden = false;
      img.removeAttribute("src");
    }
    var stage = viewer && viewer.querySelector(".portal-achievements-viewer__stage");
    if (stage) {
      var vid = stage.querySelector("video.portal-achievements-viewer__video");
      if (vid) {
        try {
          vid.pause();
        } catch (_p) {}
        vid.removeAttribute("src");
        vid.hidden = true;
      }
    }
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
    var viewer = document.getElementById("portalAchievementsGalleryViewer");
    var stage = viewer && viewer.querySelector(".portal-achievements-viewer__stage");
    var img = document.getElementById("portalAchievementsViewerImg");
    var isVideo = rowMediaType(row) === "video";
    if (stage) {
      var vid = stage.querySelector("video.portal-achievements-viewer__video");
      if (isVideo) {
        if (!vid) {
          vid = document.createElement("video");
          vid.className =
            "portal-achievements-viewer__video portal-screenshot-protected portal-achievement-protected";
          vid.controls = true;
          vid.playsInline = true;
          vid.muted = false;
          vid.setAttribute("playsinline", "");
          stage.appendChild(vid);
        }
        if (img) {
          img.hidden = true;
          img.removeAttribute("src");
        }
        vid.hidden = false;
        vid.muted = false;
        vid.src = url;
        try {
          vid.load();
        } catch (_ld) {}
      } else {
        if (vid) {
          try {
            vid.pause();
          } catch (_p) {}
          vid.hidden = true;
          vid.removeAttribute("src");
        }
        if (img) {
          img.hidden = false;
          img.src = url;
        }
      }
    } else if (img) {
      img.src = url;
    }
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
        var rm = await client.storage.from(BUCKET).remove([row.storage_path]);
        if (rm.error) throw rm.error;
      }
      var rpc = await client.rpc("portal_delete_achievement_draft", { p_photo_id: row.id });
      if (rpc.error) {
        if (/does not exist|portal_delete_achievement_draft/i.test(rpc.error.message || "")) {
          var del = await client.from("portal_participant_achievement_photos").delete().eq("id", row.id);
          if (del.error) throw del.error;
        } else {
          throw rpc.error;
        }
      }
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
      notifyFeedbackPhotoSummaryChanged();
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
          ? "No inbox photos or videos yet for today."
          : "No photos or videos yet for this participant.") +
        "</p>";
      return;
    }
    host.innerHTML =
      '<div class="portal-achievements-gallery-grid portal-achievement-protected"></div>';
    var grid = host.querySelector(".portal-achievements-gallery-grid");
    for (var i = 0; i < state.photos.length; i++) {
      (function (row, index) {
        void signedUrlFor(row.storage_path).then(function (url) {
          var pw = Number(row.width) || 0;
          var ph = Number(row.height) || 0;
          var wrap = document.createElement("div");
          wrap.className = "portal-achievements-thumb";
          if (pw > 0 && ph > 0) {
            wrap.style.aspectRatio = pw + " / " + ph;
            wrap.classList.add(pw >= ph ? "is-landscape" : "is-portrait");
          }
          wrap.setAttribute("data-ach-photo-index", String(index));
          var who = String(row.staff_display_name || "").trim();
          var cell = document.createElement("button");
          cell.type = "button";
          cell.className = "portal-achievements-thumb__open";
          cell.setAttribute(
            "aria-label",
            (rowMediaType(row) === "video" ? "View video " : "View photo ") +
              (index + 1) +
              " of " +
              state.photos.length
          );
          appendMediaThumb(cell, url, row);
          var delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "portal-achievements-thumb__delete";
          delBtn.setAttribute("aria-label", "Delete photo " + (index + 1));
          delBtn.textContent = "×";
          wrap.appendChild(cell);
          wrap.appendChild(delBtn);
          cell.addEventListener("click", function () {
            void openGalleryViewer(index);
          });
          delBtn.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            void deletePhotoById(row);
          });
          grid.appendChild(wrap);
        });
      })(state.photos[i], i);
    }
    if (state.viewerIndex >= 0 && state.viewerIndex < state.photos.length) {
      void openGalleryViewer(state.viewerIndex);
    }
    if (isAchievementCameraOpen()) void updateFooterGalleryThumb();
    syncAchievementScreenshotGuard();
  }

  function closeAchievementsSheet() {
    if (state.feedbackGalleryReview) {
      closeFeedbackGalleryReview();
      return;
    }
    if (isAchievementGalleryViewerOpen()) {
      closeGalleryViewer();
      return;
    }
    if (isAchievementCameraOpen()) {
      exitCameraToHub();
      return;
    }
    closeGalleryViewer();
    closeCameraFullscreen();
    stopCamera();
    state.participant = null;
    state.photos = [];
    state.captureMode = "hub";
    pendingGalleryUploadParticipant = null;
    setStatus("");
    if (typeof global.closeSheet === "function") {
      global.closeSheet({ bypassAnnouncementLock: true });
      return;
    }
    var sheet = global.document.getElementById("achievementsSheet");
    if (sheet) sheet.classList.remove("open");
    var backdrop = global.document.getElementById("backdrop");
    if (backdrop) backdrop.classList.remove("open");
    global.document.body.style.overflow = "";
  }

  function ensureSheetChrome() {
    var root = document.getElementById("achievementsSheet");
    if (!root) return;
    var head = root.querySelector(".portal-achievements-sheet-head");
    if (!head) return;
    if (!head.querySelector(".sheet-handle")) {
      var handle = document.createElement("div");
      handle.className = "sheet-handle";
      handle.setAttribute("role", "button");
      handle.setAttribute("tabindex", "0");
      handle.setAttribute("aria-label", "Close session photos");
      var title = head.querySelector("h3");
      if (title) head.insertBefore(handle, title);
      else head.appendChild(handle);
    }
    var backBtn = document.getElementById("portalAchievementsSheetBack");
    if (!backBtn) {
      backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "portal-achievements-sheet-back";
      backBtn.id = "portalAchievementsSheetBack";
      backBtn.setAttribute("aria-label", "Back to dashboard");
      backBtn.textContent = "← Back";
      head.insertBefore(backBtn, head.firstChild);
    }
    if (backBtn.getAttribute("data-portal-back-bound") !== "1") {
      backBtn.setAttribute("data-portal-back-bound", "1");
      backBtn.addEventListener("click", function () {
        closeAchievementsSheet();
      });
    }
  }

  function syncAchievementsSheetBackLabel() {
    var backBtn = document.getElementById("portalAchievementsSheetBack");
    if (!backBtn) return;
    if (state.feedbackGalleryReview) {
      backBtn.textContent = "← Done";
      backBtn.setAttribute("aria-label", "Done reviewing photos");
      return;
    }
    backBtn.textContent = "← Back";
    backBtn.setAttribute("aria-label", "Back to dashboard");
  }

  function bindSheet() {
    ensureSheetChrome();
    var root = document.getElementById("achievementsSheet");
    if (!root || root.getAttribute("data-portal-achievements-bound") === "1") return;
    root.setAttribute("data-portal-achievements-bound", "1");
    bindAchievementStatusActions();
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
        if (state.feedbackGalleryReview) {
          closeFeedbackGalleryReview();
          return;
        }
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
      var onSnap = guardCameraTap(function () {
        void snapPhoto();
      });
      snapBtn.addEventListener("click", onSnap);
      snapBtn.addEventListener("touchend", onSnap, { passive: false });
    }

    var fsGallery = document.getElementById("portalAchievementsFsGallery");
    if (fsGallery) {
      var onGallery = guardCameraTap(function () {
        exitCameraToParticipant();
      });
      fsGallery.addEventListener("click", onGallery);
      fsGallery.addEventListener("touchend", onGallery, { passive: false });
    }

    var fsExit = document.getElementById("portalAchievementsFsExit");
    if (fsExit) {
      var onExit = guardCameraTap(function () {
        exitCameraToHub();
      });
      fsExit.addEventListener("click", onExit);
      fsExit.addEventListener("touchend", onExit, { passive: false });
    }

    var fsPhoto = document.getElementById("portalAchievementsFsPhoto");
    if (fsPhoto) {
      var onPhotoMode = guardCameraTap(function () {
        void switchCameraMode("photo");
      });
      fsPhoto.addEventListener("click", onPhotoMode);
      fsPhoto.addEventListener("touchend", onPhotoMode, { passive: false });
    }

    var fsVideo = document.getElementById("portalAchievementsFsVideo");
    if (fsVideo) {
      var onVideoMode = guardCameraTap(function () {
        void switchCameraMode("video");
      });
      fsVideo.addEventListener("click", onVideoMode);
      fsVideo.addEventListener("touchend", onVideoMode, { passive: false });
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
      var onFlip = guardCameraTap(function () {
        void flipCamera();
      });
      fsFlip.addEventListener("click", onFlip);
      fsFlip.addEventListener("touchend", onFlip, { passive: false });
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
        if (state.captureMode === "gallery") {
          setCaptureMode("hub");
          return;
        }
        setCaptureMode("gallery");
        void refreshGallery();
      });
    }

    var uploadBtn = document.getElementById("portalAchievementsUploadFromPhone");
    if (uploadBtn) {
      uploadBtn.addEventListener("click", function () {
        openGalleryUploadPicker();
      });
    }

    if (!global.__portalAchievementsGallerySyncBound) {
      global.__portalAchievementsGallerySyncBound = true;
      document.addEventListener("visibilitychange", function () {
        if (document.hidden || !state.participant) return;
        if (state.captureMode !== "gallery" && !isAchievementCameraOpen()) return;
        void refreshGallery();
      });
    }
  }

  function openSheet(opts) {
    opts = opts || {};
    bindSheet();
    ensureSheetChrome();
    syncAchievementsSheetBackLabel();
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
      titleEl.textContent = isLeadSessionPhotosMode() ? "Session photos" : "Participant achievements";
    }
    syncLeadInboxUi();
    if (isLeadSessionPhotosMode() && opts.inboxMode !== false) {
      selectInboxParticipant({ openCamera: opts.openCamera === true });
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
      '<button type="button" class="portal-achievements-sheet-back" id="portalAchievementsSheetBack" aria-label="Back to dashboard">← Back</button>' +
      '<div class="sheet-handle" role="button" tabindex="0" aria-label="Close session photos"></div>' +
      '<h3 id="achievementsSheetTitle">Participant achievements</h3>' +
      "</div>" +
      '<div class="sheet-body portal-achievements-sheet-body">' +
      '<p class="portal-achievements-note" id="portalAchievementsIntroNote">Photos and short videos stay in the portal only (not your phone gallery). On this device, screen captures show black while you view them here.</p>' +
      '<div id="portalAchievementsStatus" class="portal-achievements-status" role="status"></div>' +
      '<div id="portalAchievementsStepPick">' +
      '<p class="portal-achievements-step-title">Today — <span id="portalAchievementsDayLabel"></span></p>' +
      '<p class="muted portal-achievements-pick-hint" id="portalAchievementsPickHint">Same participants as your Today list (A–Z).</p>' +
      '<div id="portalAchievementsParticipantList" class="portal-achievements-participant-list"></div>' +
      "</div>" +
      '<div id="portalAchievementsStepCapture" hidden>' +
      '<div class="portal-achievements-capture-head">' +
      '<button type="button" class="portal-achievements-participants-chip" id="portalAchievementsBackParticipants">Participants</button>' +
      '<div class="portal-achievements-selected-name" id="portalAchievementsSelectedName"></div>' +
      "</div>" +
      '<p class="muted portal-achievements-count" id="portalAchievementsCount"></p>' +
      '<div class="portal-achievements-icon-actions" id="portalAchievementsIconActions">' +
      '<button type="button" class="portal-achievements-icon-btn portal-achievements-icon-btn--upload" id="portalAchievementsUploadFromPhone" aria-label="Upload from phone gallery">' +
      '<span class="portal-achievements-icon-btn__ico" aria-hidden="true">' +
      ICON_UPLOAD +
      "</span>" +
      '<span class="portal-achievements-icon-btn__label">Upload</span></button>' +
      '<button type="button" class="portal-achievements-icon-btn portal-achievements-icon-btn--camera" id="portalAchievementsOpenCamera" aria-label="Take photo">' +
      '<span class="portal-achievements-icon-btn__ico" aria-hidden="true">' +
      ICON_CAMERA +
      "</span>" +
      '<span class="portal-achievements-icon-btn__label">Take photo</span></button>' +
      '<button type="button" class="portal-achievements-icon-btn" id="portalAchievementsShowGallery" aria-label="Saved in portal today">' +
      '<span class="portal-achievements-icon-btn__ico" aria-hidden="true">' +
      ICON_GALLERY +
      "</span>" +
      '<span class="portal-achievements-icon-btn__label">Saved today</span></button>' +
      "</div>" +
      '<div id="portalAchievementsGalleryPanel" hidden>' +
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
      '<div class="portal-achievements-camera-fs__viewport">' +
      '<button type="button" class="portal-ach-cam-exit-btn" id="portalAchievementsFsExit" aria-label="Exit camera">Exit</button>' +
      '<video id="portalAchievementsCameraVideo" playsinline autoplay muted class="portal-achievements-camera-fs__video"></video>' +
      '<div id="portalAchievementsCameraFlash" class="portal-achievements-camera-fs__flash" aria-hidden="true"></div>' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__chrome">' +
      '<div class="portal-achievements-camera-fs__zoom" id="portalAchievementsCameraZoom" role="group" aria-label="Zoom">' +
      '<button type="button" class="portal-ach-cam-zoom-btn is-active" data-portal-ach-zoom="1" aria-pressed="true">1×</button>' +
      '<button type="button" class="portal-ach-cam-zoom-btn" data-portal-ach-zoom="1.5" aria-pressed="false">1.5×</button>' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__footer">' +
      '<div class="portal-achievements-camera-fs__mode-row" role="tablist" aria-label="Photo or video">' +
      '<button type="button" class="portal-ach-cam-mode portal-ach-cam-mode--segment is-active" id="portalAchievementsFsPhoto" role="tab" aria-label="Photo mode" aria-pressed="true">' +
      '<span class="portal-ach-cam-mode__ico" aria-hidden="true">' +
      ICON_CAMERA +
      '</span><span class="portal-ach-cam-mode__label">Photo</span></button>' +
      '<button type="button" class="portal-ach-cam-mode portal-ach-cam-mode--segment" id="portalAchievementsFsVideo" role="tab" aria-label="Video mode" aria-pressed="false">' +
      '<span class="portal-ach-cam-mode__ico" aria-hidden="true">' +
      ICON_VIDEO +
      '</span><span class="portal-ach-cam-mode__label">Video</span></button></div>' +
      '<div class="portal-achievements-camera-fs__controls-row">' +
      '<button type="button" class="portal-ach-cam-gallery" id="portalAchievementsFsGallery" aria-label="View today\'s photos (tap Exit to leave camera)">' +
      '<span class="portal-ach-cam-gallery__placeholder" aria-hidden="true">' +
      ICON_GALLERY +
      "</span></button>" +
      '<div class="portal-achievements-camera-fs__shutter-wrap" id="portalAchievementsCameraShutterWrap">' +
      '<button type="button" class="portal-achievements-camera-fs__shutter" id="portalAchievementsSnap" aria-label="Take photo"><span class="portal-achievements-camera-fs__shutter-inner"></span></button>' +
      "</div>" +
      '<button type="button" class="portal-ach-cam-flip" id="portalAchievementsFsFlip" aria-label="Rotate camera">' +
      ICON_FLIP +
      "</button></div></div></div></div></section>"
    );
  }

  /** Feedback form: load draft thumbnails for attach picker. */
  async function listDraftsForFeedback(clientId, sessionDate, portalSessionKey) {
    if (!clientId || !sessionDate) return [];
    if (normalizeClientId(clientId) === LEAD_INBOX_CLIENT_ID) {
      try {
        return await fetchInboxDraftPhotos(sessionDate);
      } catch (_inbox) {
        return [];
      }
    }
    try {
      var rows = await fetchDraftPhotosForParticipant(
        {
          clientId: clientId,
          portalSessionKey: portalSessionKey || null,
        },
        sessionDate
      );
      rows = mergeDraftPhotoRows(rows, await fetchInboxDraftPhotos(sessionDate));
      return rows;
    } catch (_e) {
      return [];
    }
  }

  function inboxAssignNewPath(storagePath, clientId) {
    var cid = normalizeClientId(clientId);
    var from = String(storagePath || "").trim();
    if (!from || !cid || cid === LEAD_INBOX_CLIENT_ID) return from;
    var next = from.replace("/_inbox/", "/" + cid + "/");
    if (next !== from) return next;
    var parts = from.split("/");
    var idx = parts.indexOf("_inbox");
    if (idx >= 0) {
      parts[idx] = cid;
      return parts.join("/");
    }
    return from;
  }

  async function storageObjectExists(client, path) {
    path = String(path || "").trim();
    if (!path || !client) return false;
    var res = await client.storage.from(BUCKET).download(path);
    return !res.error;
  }

  async function moveAchievementStorage(client, fromPath, toPath) {
    fromPath = String(fromPath || "").trim();
    toPath = String(toPath || "").trim();
    if (!fromPath || !toPath || fromPath === toPath) return;
    if (typeof client.storage.from(BUCKET).move === "function") {
      var mv = await client.storage.from(BUCKET).move(fromPath, toPath);
      if (!mv.error) return;
    }
    var dl = await client.storage.from(BUCKET).download(fromPath);
    if (dl.error) throw dl.error;
    var blob = dl.data;
    var contentType =
      blob && blob.type ? blob.type : /\.webm$/i.test(fromPath) ? "video/webm" : "image/jpeg";
    var up = await client.storage.from(BUCKET).upload(toPath, blob, {
      contentType: contentType,
      upsert: true,
    });
    if (up.error) throw up.error;
    var rm = await client.storage.from(BUCKET).remove([fromPath]);
    if (rm.error) {
      console.warn("[achievements] storage remove after copy", rm.error);
    }
  }

  async function reassignInboxDraftsBeforeFinalize(attachedIds, clientId, clientName) {
    var client = cfg.getClient();
    if (!client || !attachedIds || !attachedIds.length) return;
    var cid = normalizeClientId(clientId);
    var cname = String(clientName || "").trim();
    if (!cid || cid === LEAD_INBOX_CLIENT_ID || !cname) return;
    var userRes = await client.auth.getUser();
    var uid = userRes.data && userRes.data.user && userRes.data.user.id;
    if (!uid) return;
    var res = await client
      .from("portal_participant_achievement_photos")
      .select("id, storage_path, client_id, staff_user_id, status")
      .in("id", attachedIds)
      .eq("status", "draft");
    if (res.error) {
      console.warn("[achievements] inbox reassign load", res.error);
      return;
    }
    var rows = (res.data || []).filter(function (r) {
      return (
        r &&
        normalizeClientId(r.client_id) === LEAD_INBOX_CLIENT_ID &&
        String(r.staff_user_id || "") === String(uid)
      );
    });
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var fromPath = String(row.storage_path || "").trim();
      var newPath = inboxAssignNewPath(fromPath, cid);
      if (!fromPath || !newPath || newPath === fromPath) continue;
      try {
        await moveAchievementStorage(client, fromPath, newPath);
        if (!(await storageObjectExists(client, newPath))) {
          throw new Error("storage_move_failed");
        }
        var rpc = await client.rpc("portal_staff_reassign_inbox_achievement_draft", {
          p_photo_id: row.id,
          p_client_id: cid,
          p_client_name: cname,
          p_new_storage_path: newPath,
        });
        if (rpc.error) {
          try {
            if (await storageObjectExists(client, newPath)) {
              await client.storage.from(BUCKET).remove([newPath]);
            }
          } catch (_rollback) {}
          throw rpc.error;
        }
      } catch (e) {
        console.warn("[achievements] inbox reassign", row.id, e);
      }
    }
  }

  function resolveGallerySessionDate() {
    var fromState = state.feedbackSessionDate
      ? String(state.feedbackSessionDate).trim().slice(0, 10)
      : "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromState)) return fromState;
    if (typeof cfg.getWorkingDateIso === "function") {
      var w = String(cfg.getWorkingDateIso() || "").trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
    }
    return londonTodayIso();
  }

  function notifyFeedbackPhotoSummaryChanged() {
    try {
      global.dispatchEvent(new CustomEvent("portal:feedback-photo-summary-changed"));
    } catch (_e) {}
  }

  function closeFeedbackGalleryReview() {
    var sheet = global.document.getElementById("achievementsSheet");
    var backdrop = global.document.getElementById("portalFeedbackAchievementsBackdrop");
    if (sheet) sheet.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
    global.document.body.style.overflow = "";
    state.feedbackGalleryReview = false;
    state.feedbackSessionDate = null;
    syncFeedbackGalleryReviewUi();
    notifyFeedbackPhotoSummaryChanged();
  }

  function syncFeedbackGalleryReviewUi() {
    var review = !!state.feedbackGalleryReview;
    var iconActions = global.document.getElementById("portalAchievementsIconActions");
    var backBtn = global.document.getElementById("portalAchievementsBackParticipants");
    if (iconActions) iconActions.hidden = review;
    if (backBtn) backBtn.textContent = review ? "Done" : isLeadSessionPhotosMode() ? "Change" : "Participants";
    syncAchievementsSheetBackLabel();
  }

  function ensureAchievementsSheetMounted() {
    bindSheet();
    if (global.document.getElementById("achievementsSheet")) return;
    var backdrop = global.document.getElementById("portalFeedbackAchievementsBackdrop");
    if (!backdrop) {
      backdrop = global.document.createElement("div");
      backdrop.id = "portalFeedbackAchievementsBackdrop";
      backdrop.className = "sheet-backdrop portal-feedback-achievements-backdrop";
      backdrop.addEventListener("click", function () {
        if (state.feedbackGalleryReview) closeFeedbackGalleryReview();
      });
      global.document.body.appendChild(backdrop);
    }
    var mount = global.document.getElementById("portalAchievementsSheetMount");
    if (!mount) {
      mount = global.document.createElement("div");
      mount.id = "portalAchievementsSheetMount";
      global.document.body.appendChild(mount);
    }
    mount.insertAdjacentHTML("beforeend", sheetHtml());
    bindSheet();
  }

  /** Max achievement photos/videos attachable to one session feedback. */
  var FEEDBACK_MAX_ATTACH = null;

  var feedbackPhotoSummaryState = {
    clientId: "",
    clientName: "",
    sessionDate: "",
    portalSessionKey: null,
    photoIds: [],
    count: 0,
  };

  function feedbackPhotoCountLabel(count) {
    var n = Number(count) || 0;
    if (n === 0) return "No photos today";
    if (n === 1) return "1 photo today";
    return n + " photos today";
  }

  async function renderFeedbackPhotoSummary(clientId, sessionDate, portalSessionKey, clientName) {
    var host = global.document.getElementById("portalFeedbackAchievementsPanel");
    if (!host) return [];
    var cid = normalizeClientId(clientId);
    var day = String(sessionDate || "").trim().slice(0, 10);
    if (!cid || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      host.hidden = true;
      host.innerHTML = "";
      feedbackPhotoSummaryState = {
        clientId: "",
        clientName: "",
        sessionDate: "",
        portalSessionKey: null,
        photoIds: [],
        count: 0,
      };
      return [];
    }
    host.hidden = false;
    host.innerHTML =
      '<p class="portal-achievements-feedback-label">Session photos</p>' +
      '<div class="portal-feedback-photo-chip-row">' +
      '<span class="portal-feedback-photo-chip" id="portalFeedbackPhotoChip" aria-live="polite">Loading…</span>' +
      "</div>" +
      '<p class="portal-feedback-photo-note muted">Photos save to the participant folder automatically. Check before submit if you want to remove any.</p>';

    var rows = [];
    try {
      rows = await listDraftsForFeedback(cid, day, portalSessionKey);
    } catch (_load) {
      rows = [];
    }
    var participantRows = rows.filter(function (r) {
      return r && normalizeClientId(r.client_id) !== LEAD_INBOX_CLIENT_ID;
    });
    var ids = participantRows
      .map(function (r) {
        return String(r.id || "").trim();
      })
      .filter(Boolean);
    feedbackPhotoSummaryState = {
      clientId: cid,
      clientName: String(clientName || feedbackPhotoSummaryState.clientName || "").trim(),
      sessionDate: day,
      portalSessionKey: portalSessionKey || null,
      photoIds: ids,
      count: ids.length,
    };

    var chip = host.querySelector("#portalFeedbackPhotoChip");
    var rowEl = host.querySelector(".portal-feedback-photo-chip-row");
    if (chip) {
      chip.textContent = feedbackPhotoCountLabel(ids.length);
      chip.classList.toggle("portal-feedback-photo-chip--empty", ids.length === 0);
    }
    if (rowEl) {
      var existingBtn = rowEl.querySelector("#portalFeedbackPhotoCheckBtn");
      if (existingBtn) existingBtn.remove();
      if (ids.length > 0) {
        var btn = global.document.createElement("button");
        btn.type = "button";
        btn.className = "btnGhost portal-feedback-photo-check-btn";
        btn.id = "portalFeedbackPhotoCheckBtn";
        btn.textContent = "Check photos";
        btn.addEventListener("click", function () {
          void openFeedbackPhotoGallery({
            clientId: cid,
            clientName: feedbackPhotoSummaryState.clientName || cid,
            sessionDate: day,
            portalSessionKey: portalSessionKey || null,
          });
        });
        rowEl.appendChild(btn);
      }
    }
    return rows;
  }

  async function openFeedbackPhotoGallery(opts) {
    opts = opts || {};
    var cid = normalizeClientId(opts.clientId);
    var day = String(opts.sessionDate || "").trim().slice(0, 10);
    if (!cid || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    feedbackPhotoSummaryState.clientName = String(opts.clientName || "").trim();
    ensureAchievementsSheetMounted();
    state.feedbackGalleryReview = true;
    state.feedbackSessionDate = day;
    syncFeedbackGalleryReviewUi();
    closeGalleryViewer();
    closeCameraFullscreen();
    stopCamera();
    selectParticipant({
      clientId: cid,
      clientName: opts.clientName || cid,
      portalSessionKey: opts.portalSessionKey || null,
    });
    setCaptureMode("gallery");
    await loadGalleryPhotos();
    renderGallery();
    var sheet = global.document.getElementById("achievementsSheet");
    var backdrop = global.document.getElementById("portalFeedbackAchievementsBackdrop");
    if (sheet) sheet.classList.add("open");
    if (backdrop) backdrop.classList.add("open");
    global.document.body.style.overflow = "hidden";
  }

  /** @deprecated use renderFeedbackPhotoSummary */
  async function renderFeedbackAttachPanel(clientId, sessionDate, portalSessionKey, clientName) {
    return renderFeedbackPhotoSummary(clientId, sessionDate, portalSessionKey, clientName);
  }

  function getSelectedFeedbackPhotoIds() {
    return (feedbackPhotoSummaryState.photoIds || []).slice();
  }

  function getFeedbackPhotoCount() {
    return Number(feedbackPhotoSummaryState.count) || 0;
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
    try {
      await reassignInboxDraftsBeforeFinalize(ids, opts.clientId, opts.clientName);
    } catch (_prep) {}
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
    renderFeedbackPhotoSummary: renderFeedbackPhotoSummary,
    renderFeedbackAttachPanel: renderFeedbackAttachPanel,
    openFeedbackPhotoGallery: openFeedbackPhotoGallery,
    getSelectedFeedbackPhotoIds: getSelectedFeedbackPhotoIds,
    getFeedbackPhotoCount: getFeedbackPhotoCount,
    finalizeOnFeedbackSubmit: finalizeOnFeedbackSubmit,
    syncScreenshotGuard: syncAchievementScreenshotGuard,
    refreshLeadInboxUi: refreshLeadInboxUi,
    MAX_PHOTOS: MAX_PHOTOS,
  };
})(typeof window !== "undefined" ? window : globalThis);
