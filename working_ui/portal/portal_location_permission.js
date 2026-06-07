/**
 * Mandatory on-site location permission (staff/lead dashboards).
 * UI lives in alertsNotificationsSheet; tracker starts after grant.
 */

/** @type {'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported' | 'insecure'} */
let _state = "unknown";

/** @type {'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported'} */
let _micState = "unknown";

/** @type {'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported'} */
let _camState = "unknown";

const MIC_ITALIAN_STAFF = { roberto: 1, giuseppe: 1 };
const MIC_SPANISH_STAFF = {
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

function micNormalizeToken(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function micNameTokens(staffName) {
  return micNormalizeToken(staffName)
    .split(/[\s,._-]+/)
    .filter(Boolean);
}

function micNormalizeNationality(nat) {
  return String(nat || "").trim().toLowerCase();
}

function micIsBritishNationality(nat) {
  const n = micNormalizeNationality(nat);
  if (!n) return false;
  return (
    /^(uk|u\.k\.|united kingdom|british|britain|great britain|english|england|scottish|scotland|welsh|wales|northern ireland)$/.test(
      n
    ) ||
    n.includes("british") ||
    n.includes("united kingdom")
  );
}

function micNationalityToRecordingLanguage(nat) {
  const n = micNormalizeNationality(nat);
  if (!n) return null;
  if (n.includes("spanish") || n.includes("spain") || n.includes("espa")) return "Spanish";
  if (n.includes("italian") || n.includes("italy") || n.includes("italia")) return "Italian";
  if (n.includes("portuguese") || n.includes("portugal")) return "Portuguese";
  if (n.includes("french") || n.includes("france")) return "French";
  if (n.includes("polish") || n.includes("poland")) return "Polish";
  if (n.includes("romanian") || n.includes("romania")) return "Romanian";
  const raw = String(nat || "").trim();
  if (/^[A-Z][a-z]+$/.test(raw)) return raw;
  return null;
}

function micResolveStaffVoiceGroup() {
  let tokens = [];
  try {
    const prof =
      typeof window !== "undefined" && window.__PORTAL_SUPABASE__
        ? window.__PORTAL_SUPABASE__.staff_profile
        : null;
    if (prof && prof.nationality) {
      const nat = micNormalizeNationality(prof.nationality);
      if (micIsBritishNationality(prof.nationality)) return { group: "english" };
      if (nat.includes("spanish") || nat.includes("spain") || nat.includes("espa")) {
        return { group: "spanish", lang: "Spanish" };
      }
      if (nat.includes("italian") || nat.includes("italy") || nat.includes("italia")) {
        return { group: "italian", lang: "Italian" };
      }
      const lang = micNationalityToRecordingLanguage(prof.nationality);
      if (lang) return { group: "other", lang };
      return { group: "other", lang: null };
    }
    if (prof) tokens = micNameTokens(prof.full_name || prof.username || "");
  } catch (_) {}
  let i;
  for (i = 0; i < tokens.length; i++) {
    if (MIC_ITALIAN_STAFF[tokens[i]]) return { group: "italian", lang: "Italian" };
  }
  for (i = 0; i < tokens.length; i++) {
    if (MIC_SPANISH_STAFF[tokens[i]]) return { group: "spanish", lang: "Spanish" };
  }
  return { group: "english" };
}

function portalMicSetupHintText() {
  const resolved = micResolveStaffVoiceGroup();
  if (resolved.group === "spanish") {
    return "You can record session feedback in Spanish — we live-transcribe into English for records.";
  }
  if (resolved.group === "italian") {
    return "You can record session feedback in Italian — we live-transcribe into English for records.";
  }
  if (resolved.group === "other") {
    if (resolved.lang) {
      return (
        "You can record session feedback in " +
        resolved.lang +
        " — we live-transcribe into English for records."
      );
    }
    return "You can record session feedback in your official language — we live-transcribe into English for records.";
  }
  return "Optional — for voice session feedback (live-transcribed into English). Not required for calls.";
}

function portalRefreshMicrophoneHint() {
  const hintEl = document.getElementById("portalMicHint");
  if (!hintEl) return;
  hintEl.textContent = portalMicSetupHintText();
}

function locationContextHint() {
  try {
    if (typeof window !== "undefined" && window.self !== window.top) {
      return " If the prompt never appears, open this portal in a normal tab (not embedded in a frame).";
    }
  } catch (_) {}
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    return " Location needs HTTPS on mobile.";
  }
  return "";
}

function isLocalDevHost() {
  try {
    const h = String(location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1";
  } catch (_) {
    return false;
  }
}

/**
 * Remembered permission, persisted across app closes. We use localStorage (not
 * sessionStorage) so that once a worker accepts location on a phone, reopening
 * the app does NOT prompt or nag them again — the grant is remembered until the
 * browser/OS permission itself changes. Falls back silently if storage is off.
 */
function persistGet(key) {
  try {
    var v = localStorage.getItem(key);
    if (v != null) return v;
  } catch (_) {}
  try {
    return sessionStorage.getItem(key);
  } catch (_) {
    return null;
  }
}
function persistSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (_) {}
  try {
    sessionStorage.setItem(key, value);
  } catch (_) {}
}
function persistRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (_) {}
  try {
    sessionStorage.removeItem(key);
  } catch (_) {}
}

export function portalLocationPermissionGranted() {
  return _state === "granted";
}

export function markLocationGranted() {
  _state = "granted";
  persistSet("portal_location_granted_v1", "1");
  persistRemove("portal_location_denied_v1");
  window.dispatchEvent(
    new CustomEvent("portal:location-permission-change", { detail: { state: "granted" } })
  );
}

export function markLocationDenied() {
  _state = "denied";
  persistSet("portal_location_denied_v1", "1");
  window.dispatchEvent(
    new CustomEvent("portal:location-permission-change", { detail: { state: "denied" } })
  );
}

/**
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unsupported' | 'insecure'>}
 */
/**
 * Browsers without Permissions API (some iOS): detect grant via one geolocation read.
 * @returns {Promise<boolean>}
 */
export function tryProbeLocationGrantedViaGeolocation() {
  return new Promise((resolve) => {
    if (portalLocationPermissionGranted()) {
      resolve(true);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(false);
      return;
    }
    if (
      typeof location !== "undefined" &&
      location.protocol !== "https:" &&
      !isLocalDevHost()
    ) {
      resolve(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => {
        markLocationGranted();
        resolve(true);
      },
      () => resolve(false),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 }
    );
  });
}

export async function probeLocationPermissionState() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    _state = "unsupported";
    return _state;
  }
  if (
    typeof location !== "undefined" &&
    location.protocol !== "https:" &&
    !isLocalDevHost()
  ) {
    _state = "insecure";
    return _state;
  }
  try {
    const perm = await navigator.permissions.query({ name: "geolocation" });
    _state =
      perm.state === "granted" || perm.state === "denied" || perm.state === "prompt"
        ? perm.state
        : "prompt";
    perm.onchange = () => {
      _state =
        perm.state === "granted" || perm.state === "denied" || perm.state === "prompt"
          ? perm.state
          : "prompt";
      if (_state === "granted") {
        persistSet("portal_location_granted_v1", "1");
        persistRemove("portal_location_denied_v1");
      } else if (_state === "denied") {
        persistRemove("portal_location_granted_v1");
      }
      window.dispatchEvent(
        new CustomEvent("portal:location-permission-change", { detail: { state: _state } })
      );
      portalRefreshLocationUi();
      portalSyncAlertsSettingsChrome();
    };
    if (_state === "granted") {
      persistSet("portal_location_granted_v1", "1");
    } else if (_state === "prompt") {
      // Permissions API says "prompt", but if this device already granted once
      // (remembered), trust that so we don't nag again on reopen. iOS Safari in
      // particular reports prompt/unsupported even after a real grant.
      if (persistGet("portal_location_granted_v1") === "1") _state = "granted";
    }
    return _state;
  } catch (_) {
    if (persistGet("portal_location_granted_v1") === "1") _state = "granted";
    else if (persistGet("portal_location_denied_v1") === "1") _state = "denied";
    else _state = "prompt";
    return _state;
  }
}

/**
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unsupported' | 'insecure'>}
 */
export function requestLocationPermission() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      _state = "unsupported";
      resolve("unsupported");
      return;
    }
    if (
      typeof location !== "undefined" &&
      location.protocol !== "https:" &&
      !isLocalDevHost()
    ) {
      _state = "insecure";
      resolve("insecure");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        markLocationGranted();
        if (pos && typeof window.portalUploadLocationFromPosition === "function") {
          void window.portalUploadLocationFromPosition(pos);
        }
        if (typeof window.portalRestartLocationTracker === "function") {
          void window.portalRestartLocationTracker();
        }
        resolve("granted");
      },
      (err) => {
        if (err && err.code === 1) markLocationDenied();
        else _state = "prompt";
        resolve(_state);
      },
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
    );
  });
}

export function portalNotificationsGranted() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export function portalMicrophonePermissionGranted() {
  return _micState === "granted" || persistGet("portal_mic_granted_v1") === "1";
}

export function portalCameraPermissionGranted() {
  if (_camState === "denied") return false;
  if (_camState === "granted") return true;
  if (persistGet("portal_cam_denied_v1") === "1") return false;
  return persistGet("portal_cam_granted_v1") === "1";
}

/** Default portal setup complete: alerts (+ location when role requires it). Mic/camera are optional. */
export function portalCommsMediaPermissionsGranted() {
  return true;
}

export function markMicrophoneGranted() {
  _micState = "granted";
  persistSet("portal_mic_granted_v1", "1");
  persistRemove("portal_mic_denied_v1");
  window.dispatchEvent(
    new CustomEvent("portal:microphone-permission-change", { detail: { state: "granted" } })
  );
}

export function markMicrophoneDenied() {
  _micState = "denied";
  persistSet("portal_mic_denied_v1", "1");
  window.dispatchEvent(
    new CustomEvent("portal:microphone-permission-change", { detail: { state: "denied" } })
  );
}

export function markCameraGranted() {
  _camState = "granted";
  persistSet("portal_cam_granted_v1", "1");
  persistRemove("portal_cam_denied_v1");
  window.dispatchEvent(
    new CustomEvent("portal:camera-permission-change", { detail: { state: "granted" } })
  );
}

export function markCameraDenied() {
  _camState = "denied";
  persistSet("portal_cam_denied_v1", "1");
  persistRemove("portal_cam_granted_v1");
  window.dispatchEvent(
    new CustomEvent("portal:camera-permission-change", { detail: { state: "denied" } })
  );
}

function stopMediaStream(stream) {
  if (!stream || !stream.getTracks) return;
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch (_) {}
  });
}

export async function probeMicrophonePermissionState() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    _micState = "unsupported";
    return _micState;
  }
  if (persistGet("portal_mic_granted_v1") === "1") {
    _micState = "granted";
    return _micState;
  }
  if (persistGet("portal_mic_denied_v1") === "1") {
    _micState = "denied";
    return _micState;
  }
  try {
    const perm = await navigator.permissions.query({ name: "microphone" });
    _micState =
      perm.state === "granted" || perm.state === "denied" || perm.state === "prompt"
        ? perm.state
        : "prompt";
    if (_micState === "granted") {
      persistSet("portal_mic_granted_v1", "1");
      persistRemove("portal_mic_denied_v1");
    } else if (_micState === "denied") {
      persistSet("portal_mic_denied_v1", "1");
    }
    perm.onchange = () => {
      _micState =
        perm.state === "granted" || perm.state === "denied" || perm.state === "prompt"
          ? perm.state
          : "prompt";
      if (_micState === "granted") {
        persistSet("portal_mic_granted_v1", "1");
        persistRemove("portal_mic_denied_v1");
      } else if (_micState === "denied") {
        persistSet("portal_mic_denied_v1", "1");
      }
      window.dispatchEvent(
        new CustomEvent("portal:microphone-permission-change", { detail: { state: _micState } })
      );
      portalRefreshMicrophoneUi();
      portalSyncAlertsSettingsChrome();
    };
    return _micState;
  } catch (_) {
    _micState = persistGet("portal_mic_denied_v1") === "1" ? "denied" : "prompt";
    return _micState;
  }
}

/**
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unsupported'>}
 */
export function requestMicrophonePermission() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      _micState = "unsupported";
      resolve("unsupported");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stopMediaStream(stream);
        markMicrophoneGranted();
        resolve("granted");
      })
      .catch((err) => {
        if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          markMicrophoneDenied();
          resolve("denied");
          return;
        }
        _micState = "prompt";
        resolve("prompt");
      });
  });
}

export async function probeCameraPermissionState() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    _camState = "unsupported";
    return _camState;
  }
  if (persistGet("portal_cam_granted_v1") === "1") {
    _camState = "granted";
    return _camState;
  }
  if (persistGet("portal_cam_denied_v1") === "1") {
    _camState = "denied";
    return _camState;
  }
  try {
    const perm = await navigator.permissions.query({ name: "camera" });
    _camState =
      perm.state === "granted" || perm.state === "denied" || perm.state === "prompt"
        ? perm.state
        : "prompt";
    if (_camState === "granted") {
      persistSet("portal_cam_granted_v1", "1");
      persistRemove("portal_cam_denied_v1");
    } else if (_camState === "denied") {
      persistSet("portal_cam_denied_v1", "1");
    }
    perm.onchange = () => {
      _camState =
        perm.state === "granted" || perm.state === "denied" || perm.state === "prompt"
          ? perm.state
          : "prompt";
      if (_camState === "granted") {
        persistSet("portal_cam_granted_v1", "1");
        persistRemove("portal_cam_denied_v1");
      } else if (_camState === "denied") {
        persistSet("portal_cam_denied_v1", "1");
      }
      window.dispatchEvent(
        new CustomEvent("portal:camera-permission-change", { detail: { state: _camState } })
      );
      portalRefreshCameraUi();
      portalRefreshEnableAllUi();
      portalSyncAlertsSettingsChrome();
    };
    return _camState;
  } catch (_) {
    _camState = persistGet("portal_cam_denied_v1") === "1" ? "denied" : "prompt";
    return _camState;
  }
}

/**
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unsupported'>}
 */
export function requestCameraPermission() {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      _camState = "unsupported";
      resolve("unsupported");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: true })
      .then((stream) => {
        stopMediaStream(stream);
        markCameraGranted();
        resolve("granted");
      })
      .catch((err) => {
        if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          markCameraDenied();
          resolve("denied");
          return;
        }
        _camState = "prompt";
        resolve("prompt");
      });
  });
}

/**
 * Runtime media for calls — mic only when joining audio; camera for video (no upfront mic for video).
 * @param {{ video?: boolean, audio?: boolean }} [opts]
 * @returns {Promise<{ microphone: string, camera: string }>}
 */
export function requestCallMediaPermissions(opts = {}) {
  const wantVideo = opts.video !== false;
  const wantAudio = opts.audio === true;
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      if (wantAudio) _micState = "unsupported";
      if (wantVideo) _camState = "unsupported";
      resolve({
        microphone: wantAudio ? "unsupported" : "skipped",
        camera: wantVideo ? "unsupported" : "skipped",
      });
      return;
    }
    const constraints = {
      audio: wantAudio,
      video: wantVideo,
    };
    if (!wantAudio && !wantVideo) {
      resolve({ microphone: "skipped", camera: "skipped" });
      return;
    }
    navigator.mediaDevices
      .getUserMedia(constraints)
      .then((stream) => {
        stopMediaStream(stream);
        if (wantAudio) markMicrophoneGranted();
        if (wantVideo) markCameraGranted();
        resolve({
          microphone: wantAudio ? "granted" : "skipped",
          camera: wantVideo ? "granted" : "skipped",
        });
      })
      .catch((err) => {
        if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          if (wantAudio) markMicrophoneDenied();
          if (wantVideo) markCameraDenied();
          resolve({
            microphone: wantAudio ? "denied" : "skipped",
            camera: wantVideo ? "denied" : "skipped",
          });
          return;
        }
        if (wantAudio) _micState = "prompt";
        if (wantVideo) _camState = "prompt";
        resolve({
          microphone: wantAudio ? "prompt" : "skipped",
          camera: wantVideo ? "prompt" : "skipped",
        });
      });
  });
}

/**
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unsupported'>}
 */
export function requestNotificationPermission() {
  return new Promise((resolve) => {
    if (typeof Notification === "undefined") {
      resolve("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      removeNotifyTapBanner();
      if (typeof window.portalEnsureWebPushSubscription === "function") {
        void window.portalEnsureWebPushSubscription();
      }
      resolve("granted");
      return;
    }
    if (Notification.permission === "denied") {
      resolve("denied");
      return;
    }
    Notification.requestPermission()
      .then((r) => {
        if (r === "granted") {
          removeNotifyTapBanner();
          try {
            new Notification("Portal alerts on", {
              body: "Chat, calls, meetings and roster updates on this device.",
            });
          } catch (_) {}
          if (typeof window.portalEnsureWebPushSubscription === "function") {
            void window.portalEnsureWebPushSubscription();
          }
          resolve("granted");
          return;
        }
        resolve(r === "denied" ? "denied" : "prompt");
      })
      .catch(() => resolve("prompt"));
  });
}

/**
 * Default portal setup in one in-app tap: alerts (+ location when role requires it).
 * Microphone and camera stay optional under Advanced settings.
 * @returns {Promise<Record<string, string>>}
 */
export async function requestDefaultPortalPermissions() {
  if (typeof window.portalStaffChatCalls?.primeCallRingAudio === "function") {
    window.portalStaffChatCalls.primeCallRingAudio();
  }
  persistSet("portal_default_perms_requested_v1", "1");
  persistSet("portal_all_perms_requested_v1", "1");

  const results = {
    notifications: "skipped",
    camera: "skipped",
    location: "skipped",
    microphone: "skipped",
  };

  if (!portalNotificationsGranted()) {
    results.notifications = await requestNotificationPermission();
  } else {
    results.notifications = "granted";
  }

  const locRequired = portalLocationRequiredForSetup();
  if (locRequired && !portalLocationPermissionGranted()) {
    results.location = await requestLocationPermission();
  } else if (portalLocationPermissionGranted()) {
    results.location = "granted";
  } else {
    results.location = "not_required";
  }

  refreshDefaultPortalPermissionsUi();

  window.dispatchEvent(
    new CustomEvent("portal:all-permissions-change", { detail: results })
  );

  if (portalMandatoryAlertsSettingsComplete()) {
    persistSet("portal_alerts_prompt_shown_v1", "1");
    removeNotifyTapBanner();
  }

  return results;
}

/** @deprecated Use requestDefaultPortalPermissions — kept for callers. */
export async function requestAllPortalPermissions() {
  return requestDefaultPortalPermissions();
}

function refreshDefaultPortalPermissionsUi() {
  if (typeof window.portalRefreshAlertsNotifyUi === "function") {
    window.portalRefreshAlertsNotifyUi();
  }
  portalRefreshLocationUi();
  portalRefreshMicrophoneUi();
  portalRefreshCameraUi();
  portalRefreshEnableAllUi();
  portalSyncAlertsSettingsChrome();
}

export function portalMicrophoneReadyForSetup() {
  return true;
}

export function portalLocationRequiredForSetup() {
  try {
    if (typeof window !== "undefined" && typeof window.portalLiveMapLocationRequiredForWorker === "function") {
      const box = window.__PORTAL_SUPABASE__ || {};
      return !!window.portalLiveMapLocationRequiredForWorker(box.staff_profile, box.session?.user);
    }
  } catch (_) {}
  return false;
}

export function portalMandatoryAlertsSettingsComplete() {
  const locRequired = portalLocationRequiredForSetup();
  const locOk = !locRequired || portalLocationPermissionGranted();
  return portalNotificationsGranted() && locOk;
}

export function portalSyncAlertsSettingsChrome() {
  const btn = document.getElementById("quickMenuAlerts");
  if (!btn) return;
  const sub = btn.querySelector(".menu-btn-sub");
  const notifyOk = portalNotificationsGranted();
  const locRequired = portalLocationRequiredForSetup();
  const locOk = !locRequired || portalLocationPermissionGranted();
  const incomplete = !notifyOk || !locOk;
  btn.classList.toggle("menu-btn--settings-alerts-incomplete", incomplete);
  if (!sub) return;
  if (incomplete) {
    sub.textContent = notifyOk ? "Location needed for your role" : "Tap once for alerts";
  } else {
    sub.textContent = locRequired ? "Portal features on" : "Portal features on";
  }
  const locBlock = document.getElementById("portalLocationBlock");
  if (locBlock) locBlock.hidden = !locRequired;
  portalRefreshEnableAllUi();
}

export function portalRefreshMicrophoneUi() {
  portalRefreshMicrophoneHint();
  const statusEl = document.getElementById("portalMicStatus");
  const btn = document.getElementById("portalMicEnableBtn");
  if (!statusEl) return;
  const st = _micState === "unknown" ? "prompt" : _micState;
  if (st === "unsupported") {
    statusEl.textContent = "Not supported on this browser.";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Not supported";
    }
  } else if (st === "granted") {
    statusEl.textContent = "On — ready for voice feedback notes.";
    if (btn) {
      btn.textContent = "Microphone on";
      btn.disabled = true;
    }
  } else if (st === "denied") {
    statusEl.textContent = "Blocked — allow microphone for this site in browser settings.";
    if (btn) {
      btn.textContent = "Open browser settings";
      btn.disabled = false;
    }
  } else {
    statusEl.textContent = "Off — optional, for voice feedback notes.";
    if (btn) {
      btn.textContent = "Allow microphone";
      btn.disabled = false;
    }
  }
  portalRefreshEnableAllUi();
  portalSyncAlertsSettingsChrome();
}

export function portalRefreshCameraUi() {
  const statusEl = document.getElementById("portalCamStatus");
  const btn = document.getElementById("portalCamEnableBtn");
  if (!statusEl) return;
  const st = _camState === "unknown" ? "prompt" : _camState;
  if (st === "unsupported") {
    statusEl.textContent = "Not supported on this browser.";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Not supported";
    }
  } else if (st === "granted") {
    statusEl.textContent = "On — ready for video calls and session photos.";
    if (btn) {
      btn.textContent = "Camera on";
      btn.disabled = true;
    }
  } else if (st === "denied") {
    statusEl.textContent = "Blocked — allow camera for this site in browser settings.";
    if (btn) {
      btn.textContent = "Open browser settings";
      btn.disabled = false;
    }
  } else {
    statusEl.textContent = "Off — needed for video calls and achievement photos.";
    if (btn) {
      btn.textContent = "Allow camera";
      btn.disabled = false;
    }
  }
  portalRefreshEnableAllUi();
  portalSyncAlertsSettingsChrome();
}

export function portalRefreshEnableAllUi() {
  const statusEl = document.getElementById("portalEnableAllStatus");
  const btn = document.getElementById("portalEnableAllBtn");
  if (!statusEl && !btn) return;

  const complete = portalMandatoryAlertsSettingsComplete();

  if (statusEl) {
    if (complete) {
      statusEl.textContent = locRequired
        ? "Ready — alerts on, and location when your sessions need it."
        : "Ready — alerts on for calls, chat and roster changes.";
    } else {
      statusEl.textContent = locRequired
        ? "Tap Continue once. The browser may ask for alerts and location — accept each once."
        : "Tap Continue once. The browser may ask for alerts — accept once.";
    }
  }
  if (btn) {
    if (complete) {
      btn.textContent = "Continue";
      btn.disabled = true;
    } else {
      btn.textContent = "Continue";
      btn.disabled = false;
    }
  }
}

export function portalRefreshLocationUi() {
  const statusEl = document.getElementById("portalLocationStatus");
  const btn = document.getElementById("portalLocationEnableBtn");
  if (!statusEl) return;
  const ctx = locationContextHint();
  const st = _state === "unknown" ? "prompt" : _state;
  if (st === "unsupported") {
    statusEl.textContent = "Not supported on this browser." + ctx;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Not supported";
    }
  } else if (st === "insecure") {
    statusEl.textContent = "Needs HTTPS on your phone." + ctx;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "HTTPS required";
    }
  } else if (st === "granted") {
    var upload = typeof window !== "undefined" ? window.__PORTAL_LOCATION_LAST_UPLOAD__ : null;
    if (upload && upload.ok) {
      statusEl.textContent = "On — office can see you on the live map during Bespoke / Day Centre sessions.";
    } else if (upload && upload.ok === false && upload.message) {
      statusEl.textContent = "On — could not send yet. Keep app open or tap Refresh.";
    } else {
      statusEl.textContent = "On — getting GPS…";
    }
    if (btn) {
      btn.textContent = upload && upload.ok ? "Location on" : "Refresh location";
      btn.disabled = false;
    }
  } else if (st === "denied") {
    statusEl.textContent = "Blocked — allow location for this site in browser settings." + ctx;
    if (btn) {
      btn.textContent = "Open browser settings";
      btn.disabled = false;
    }
  } else {
    statusEl.textContent = portalLocationRequiredForSetup()
      ? "Off — required for Bespoke Programme and Day Centre during your session."
      : "Not required for your rota today — only needed for Bespoke Programme and Day Centre staff during sessions.";
    if (btn) {
      btn.textContent = "Allow location";
      btn.disabled = false;
    }
  }
  portalSyncAlertsSettingsChrome();
}

export async function portalRefreshMandatoryAlertsSettingsUi() {
  await Promise.all([
    probeLocationPermissionState(),
    probeMicrophonePermissionState(),
    probeCameraPermissionState(),
  ]);
  if (typeof window.portalRefreshAlertsNotifyUi === "function") {
    window.portalRefreshAlertsNotifyUi();
  }
  portalRefreshLocationUi();
  portalRefreshMicrophoneUi();
  portalRefreshCameraUi();
  portalRefreshEnableAllUi();
}

function portalUserActivationActive() {
  try {
    return (
      typeof navigator !== "undefined" &&
      navigator.userActivation &&
      navigator.userActivation.isActive === true
    );
  } catch (_) {
    return false;
  }
}

function ensureNotifyTapBannerStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById("portal-notify-tap-banner-styles")) return;
  const st = document.createElement("style");
  st.id = "portal-notify-tap-banner-styles";
  st.textContent =
    ".portal-notify-tap-banner{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:12040;" +
    "padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,#173247,#0f2435);color:#fff;" +
    "box-shadow:0 12px 32px rgba(0,0,0,.28);font-size:14px;font-weight:700;line-height:1.45;text-align:center;" +
    "pointer-events:none;max-width:28rem;margin:0 auto;min-width:0;overflow-wrap:break-word}";
  document.head.appendChild(st);
}

function removeNotifyTapBanner() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("portalNotifyTapBanner");
  if (el) el.remove();
}

function ensureNotifyTapBanner() {
  if (typeof document === "undefined" || !document.body) return;
  if (portalNotificationsGranted()) {
    removeNotifyTapBanner();
    return;
  }
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "denied") return;
  if (document.getElementById("portalNotifyTapBanner")) return;
  ensureNotifyTapBannerStyles();
  const banner = document.createElement("div");
  banner.id = "portalNotifyTapBanner";
  banner.className = "portal-notify-tap-banner";
  banner.setAttribute("role", "status");
  banner.textContent =
    "Tap anywhere once to turn on call and message alerts on this device.";
  document.body.appendChild(banner);
}

/**
 * First tap/click after login requests notification permission (browser requirement).
 * No need to open Settings → Portal features.
 */
export function bindAutoNotificationOnFirstGesture() {
  if (typeof document === "undefined" || !document.body) return;
  if (document.body.getAttribute("data-portal-notify-gesture-bound") === "1") return;
  document.body.setAttribute("data-portal-notify-gesture-bound", "1");

  if (typeof Notification === "undefined") return;
  if (Notification.permission === "granted") {
    removeNotifyTapBanner();
    if (typeof window.portalEnsureWebPushSubscription === "function") {
      void window.portalEnsureWebPushSubscription();
    }
    return;
  }
  if (Notification.permission === "denied") return;

  ensureNotifyTapBanner();

  function cleanup() {
    document.removeEventListener("click", onGesture, true);
    document.removeEventListener("touchstart", onGesture, true);
  }

  function onGesture() {
    if (typeof Notification === "undefined" || Notification.permission !== "default") {
      cleanup();
      removeNotifyTapBanner();
      return;
    }
    cleanup();
    void requestNotificationPermission().then(() => {
      removeNotifyTapBanner();
      portalSyncAlertsSettingsChrome();
      if (typeof window.portalRefreshAlertsNotifyUi === "function") {
        window.portalRefreshAlertsNotifyUi();
      }
    });
  }

  document.addEventListener("click", onGesture, true);
  document.addEventListener("touchstart", onGesture, true);
}

/** Alerts sheet opened — refresh UI; on a user gesture, prompt notifications if still default. */
export async function portalOnAlertsSheetOpened() {
  if (portalUserActivationActive()) {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      await requestNotificationPermission();
    }
  }
  await portalRefreshMandatoryAlertsSettingsUi();
}

/**
 * @param {{ page?: string, force?: boolean }} [opts]
 */
export async function portalEnsureMandatoryAlertsSettings(opts = {}) {
  const page = String(opts.page || "").toLowerCase();
  if (page === "admin" || page === "ceo" || page === "onboarding") return;

  await Promise.all([
    probeLocationPermissionState(),
    probeMicrophonePermissionState(),
    probeCameraPermissionState(),
  ]);
  if (portalMandatoryAlertsSettingsComplete()) {
    persistSet("portal_alerts_prompt_shown_v1", "1");
    removeNotifyTapBanner();
    portalSyncAlertsSettingsChrome();
    if (typeof window.portalEnsureWebPushSubscription === "function") {
      void window.portalEnsureWebPushSubscription();
    }
    return;
  }

  portalSyncAlertsSettingsChrome();
  bindAutoNotificationOnFirstGesture();
}

export function bindMandatoryAlertsSettingsResume() {
  if (typeof document === "undefined" || !document.body) return;
  if (document.body.getAttribute("data-portal-alerts-resume-bound") === "1") return;
  document.body.setAttribute("data-portal-alerts-resume-bound", "1");
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void Promise.all([
      probeLocationPermissionState(),
      probeMicrophonePermissionState(),
      probeCameraPermissionState(),
    ]).then(async () => {
      portalRefreshLocationUi();
      portalRefreshMicrophoneUi();
      portalRefreshCameraUi();
      portalRefreshEnableAllUi();
      if (typeof window.portalRefreshAlertsNotifyUi === "function") {
        window.portalRefreshAlertsNotifyUi();
      }
      if (!portalMandatoryAlertsSettingsComplete()) {
        void portalEnsureMandatoryAlertsSettings();
      }
    });
  });
}

export function bindPortalLocationUploadUiRefresh() {
  if (typeof document === "undefined") return;
  if (document.body.getAttribute("data-portal-location-upload-ui") === "1") return;
  document.body.setAttribute("data-portal-location-upload-ui", "1");
  document.addEventListener("portal:location-upload", () => {
    portalRefreshLocationUi();
  });
}

export function bindPortalLocationPermissionUi() {
  const alertsSheet = document.getElementById("alertsNotificationsSheet");
  if (!alertsSheet || alertsSheet.getAttribute("data-portal-location-ui-bound") === "1") {
    return;
  }
  alertsSheet.setAttribute("data-portal-location-ui-bound", "1");
  bindPortalLocationUploadUiRefresh();
  if (alertsSheet.getAttribute("data-portal-enable-all-bound") !== "1") {
    alertsSheet.setAttribute("data-portal-enable-all-bound", "1");
    alertsSheet.addEventListener(
      "click",
      (e) => {
        const t =
          e.target && e.target.closest ? e.target.closest("#portalEnableAllBtn") : null;
        if (!t || !alertsSheet.contains(t)) return;
        e.preventDefault();
        if (t.disabled) return;
        t.disabled = true;
        const prev = t.textContent;
        t.textContent = "Allow when asked…";
        void requestDefaultPortalPermissions().finally(() => {
          portalRefreshEnableAllUi();
          if (!portalMandatoryAlertsSettingsComplete()) {
            t.disabled = false;
            t.textContent = prev;
          }
        });
      },
      true
    );
  }
  if (alertsSheet.getAttribute("data-portal-mic-ui-bound") !== "1") {
    alertsSheet.setAttribute("data-portal-mic-ui-bound", "1");
    alertsSheet.addEventListener(
      "click",
      (e) => {
        const t =
          e.target && e.target.closest ? e.target.closest("#portalMicEnableBtn") : null;
        if (!t || !alertsSheet.contains(t)) return;
        e.preventDefault();
        void requestMicrophonePermission().then(() => {
          portalRefreshMicrophoneUi();
          portalRefreshEnableAllUi();
          portalSyncAlertsSettingsChrome();
        });
      },
      true
    );
  }
  if (alertsSheet.getAttribute("data-portal-cam-ui-bound") !== "1") {
    alertsSheet.setAttribute("data-portal-cam-ui-bound", "1");
    alertsSheet.addEventListener(
      "click",
      (e) => {
        const t =
          e.target && e.target.closest ? e.target.closest("#portalCamEnableBtn") : null;
        if (!t || !alertsSheet.contains(t)) return;
        e.preventDefault();
        void requestCameraPermission().then(() => {
          portalRefreshCameraUi();
          portalRefreshEnableAllUi();
          portalSyncAlertsSettingsChrome();
        });
      },
      true
    );
  }
  alertsSheet.addEventListener(
    "click",
    (e) => {
      const t =
        e.target && e.target.closest
          ? e.target.closest("#portalLocationEnableBtn")
          : null;
      if (!t || !alertsSheet.contains(t)) return;
      e.preventDefault();
      void requestLocationPermission().then(async () => {
        portalRefreshLocationUi();
        portalRefreshMicrophoneUi();
        portalRefreshCameraUi();
        portalRefreshEnableAllUi();
        if (typeof window.portalRefreshAlertsNotifyUi === "function") {
          window.portalRefreshAlertsNotifyUi();
        }
        if (
          portalLocationPermissionGranted() &&
          typeof window.portalRestartLocationTracker === "function"
        ) {
          await window.portalRestartLocationTracker();
        }
      });
    },
    true
  );
}
