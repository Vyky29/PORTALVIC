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
  }

  function isAchievementGalleryViewerOpen() {
    var viewer = document.getElementById("portalAchievementsGalleryViewer");
    if (viewer && !viewer.hidden) return true;
    var fb = document.getElementById("portalFeedbackAchievementsPanel");
    if (fb && !fb.hidden && fb.querySelector("img")) return true;
    var gal = document.getElementById("portalAchievementsGallery");
    if (gal && gal.querySelector(".portal-achievements-gallery-grid img")) return true;
    return false;
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
    if (typeof g.pushStrict === "function" && typeof g.popStrict === "function") {
      if (isAchievementGalleryViewerOpen()) g.pushStrict("participant-achievements");
      else g.popStrict("participant-achievements");
    }
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

  function applyVideoZoom() {
    var video = document.getElementById("portalAchievementsCameraVideo");
    var z = Number(state.zoomScale) || 1;
    if (video) {
      video.style.transform = "scale(" + z + ")";
      video.style.transformOrigin = "center center";
    }
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
      '<img src="' + esc(url) + '" alt="" class="portal-ach-cam-gallery__thumb portal-achievement-protected" draggable="false" />';
  }

  async function flipCamera() {
    state.facingMode = state.facingMode === "user" ? "environment" : "user";
    var video = document.getElementById("portalAchievementsCameraVideo");
    if (!video) return;
    stopCameraTracksOnly();
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: state.facingMode },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      });
      video.srcObject = state.stream;
      video.hidden = false;
      applyVideoZoom();
    } catch (err) {
      console.error(err);
      setStatus("Could not switch camera.", true);
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
      openCameraFullscreen();
      showCameraLiveUi();
      state.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: state.facingMode },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      });
      video.srcObject = state.stream;
      video.hidden = false;
      applyVideoZoom();
      void updateFooterGalleryThumb();
    } catch (err) {
      console.error(err);
      closeCameraFullscreen();
      setCaptureMode("hub");
      setStatus("Could not open camera. Check browser permissions.", true);
    }
  }

  function stopCamera() {
    closeCameraFullscreen();
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
      var canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
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
      setStatus("");
      void updateFooterGalleryThumb();
      showCameraLiveUi();
    } catch (e) {
      console.error(e);
      setStatus(esc(e.message || "Could not save photo"), true);
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

  async function fetchDraftPhotosForParticipant(participant, sessionDate) {
    var client = cfg.getClient();
    if (!client || !participant) return [];
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
        closeGalleryViewer();
        closeCameraFullscreen();
        showStep("capture");
        setCaptureMode("hub");
        void refreshGallery();
      });
    });
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

  async function deleteViewerPhoto() {
    if (state.viewerIndex < 0 || !state.photos.length) return;
    var row = state.photos[state.viewerIndex];
    if (!row || !row.id) return;
    var client = cfg.getClient();
    if (!client) {
      setStatus("Sign in required.", true);
      return;
    }
    var delBtn = document.getElementById("portalAchievementsViewerDelete");
    if (delBtn) delBtn.disabled = true;
    try {
      setStatus("Deleting…");
      if (row.storage_path) {
        await client.storage.from(BUCKET).remove([row.storage_path]);
      }
      var del = await client.from("portal_participant_achievement_photos").delete().eq("id", row.id);
      if (del.error) throw del.error;
      delete signedUrlCache[row.storage_path];
      var removedIdx = state.viewerIndex;
      state.viewerIndex = -1;
      await refreshGallery();
      setStatus("");
      if (!state.photos.length) {
        closeGalleryViewer();
        return;
      }
      var nextIdx = Math.min(removedIdx, state.photos.length - 1);
      void openGalleryViewer(nextIdx);
    } catch (e) {
      console.error(e);
      setStatus(esc(e.message || "Could not delete photo"), true);
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
      host.innerHTML = '<p class="muted portal-achievements-empty">No photos yet for this participant.</p>';
      return;
    }
    host.innerHTML =
      '<div class="portal-achievements-gallery-grid portal-achievement-protected"></div>';
    var grid = host.querySelector(".portal-achievements-gallery-grid");
    for (var i = 0; i < state.photos.length; i++) {
      var row = state.photos[i];
      var url = await signedUrlFor(row.storage_path);
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "portal-achievements-thumb";
      cell.setAttribute("data-ach-photo-index", String(i));
      var who = String(row.staff_display_name || "").trim();
      cell.setAttribute("aria-label", "View photo " + (i + 1) + " of " + state.photos.length);
      cell.innerHTML =
        '<img src="' +
        esc(url) +
        '" alt="" draggable="false" class="portal-achievement-protected" />' +
        (who
          ? '<span class="portal-achievements-thumb__by">' + esc(who) + "</span>"
          : "");
      cell.addEventListener("click", function () {
        var idx = Number(cell.getAttribute("data-ach-photo-index"));
        if (!Number.isFinite(idx)) return;
        void openGalleryViewer(idx);
      });
      grid.appendChild(cell);
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

  function openSheet() {
    bindSheet();
    closeGalleryViewer();
    closeCameraFullscreen();
    state.participant = null;
    state.photos = [];
    state.captureMode = "hub";
    state.cameraMode = "photo";
    signedUrlCache = Object.create(null);
    stopCamera();
    renderParticipantPicker();
    showStep("pick");
    setStatus("");
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
      '<div class="portal-achievements-camera-fs__viewport portal-screenshot-protected portal-achievement-protected">' +
      '<video id="portalAchievementsCameraVideo" playsinline autoplay muted class="portal-achievements-camera-fs__video"></video>' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__chrome">' +
      '<div class="portal-achievements-camera-fs__zoom" id="portalAchievementsCameraZoom" role="group" aria-label="Zoom">' +
      '<button type="button" class="portal-ach-cam-zoom-btn is-active" data-portal-ach-zoom="1" aria-pressed="true">1×</button>' +
      '<button type="button" class="portal-ach-cam-zoom-btn" data-portal-ach-zoom="1.5" aria-pressed="false">1.5×</button>' +
      "</div>" +
      '<div class="portal-achievements-camera-fs__footer">' +
      '<div class="portal-achievements-camera-fs__shutter-wrap" id="portalAchievementsCameraShutterWrap">' +
      '<button type="button" class="portal-achievements-camera-fs__shutter" id="portalAchievementsSnap" aria-label="Take photo"><span class="portal-achievements-camera-fs__shutter-inner"></span></button>' +
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
    syncScreenshotGuard: syncAchievementScreenshotGuard,
    MAX_PHOTOS: MAX_PHOTOS,
  };
})(typeof window !== "undefined" ? window : globalThis);
