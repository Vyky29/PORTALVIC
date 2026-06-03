/**
 * Mandatory on-site location permission (staff/lead dashboards).
 * UI lives in alertsNotificationsSheet; tracker starts after grant.
 */

/** @type {'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported' | 'insecure'} */
let _state = "unknown";

/** @type {'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported'} */
let _micState = "unknown";

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
        stream.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch (_) {}
        });
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
    const missing = [];
    if (!notifyOk) missing.push("notifications");
    if (locRequired && !locOk) missing.push("location");
    sub.textContent = "Turn on " + missing.join(", ");
  } else {
    sub.textContent = locRequired
      ? "Notifications and location on"
      : "Notifications on";
  }
  const locBlock = document.getElementById("portalLocationBlock");
  if (locBlock) locBlock.hidden = !locRequired;
}

export function portalRefreshMicrophoneUi() {
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
    statusEl.textContent = "On — ready for session feedback voice.";
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
    statusEl.textContent = "Off — tap below for voice feedback.";
    if (btn) {
      btn.textContent = "Allow microphone";
      btn.disabled = false;
    }
  }
  portalSyncAlertsSettingsChrome();
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
  await Promise.all([probeLocationPermissionState(), probeMicrophonePermissionState()]);
  if (typeof window.portalRefreshAlertsNotifyUi === "function") {
    window.portalRefreshAlertsNotifyUi();
  }
  portalRefreshLocationUi();
  portalRefreshMicrophoneUi();
}

/**
 * @param {{ page?: string, force?: boolean }} [opts]
 */
export async function portalEnsureMandatoryAlertsSettings(opts = {}) {
  const page = String(opts.page || "").toLowerCase();
  if (page === "admin" || page === "ceo" || page === "onboarding") return;

  await Promise.all([probeLocationPermissionState(), probeMicrophonePermissionState()]);
  if (portalMandatoryAlertsSettingsComplete()) {
    // Fully set up — remember it so we never auto-prompt again, even if the
    // browser later reports a permission as not-granted (iOS quirks).
    persistSet("portal_alerts_prompt_shown_v1", "1");
    portalSyncAlertsSettingsChrome();
    return;
  }

  portalSyncAlertsSettingsChrome();

  // Ask only ONCE, at the beginning. After the alerts sheet has been shown a
  // first time we never auto-open it again on reopen/resume — the quick-menu
  // indicator still lets the worker enable it manually. Stops the re-nagging.
  if (persistGet("portal_alerts_prompt_shown_v1") === "1") return;

  try {
    if (typeof window.portalAnnouncementSheetLockActive === "function") {
      if (window.portalAnnouncementSheetLockActive()) return;
    }
  } catch (_) {}

  const openAlerts = () => {
    persistSet("portal_alerts_prompt_shown_v1", "1");
    if (typeof openSheet === "function") {
      openSheet("alertsNotificationsSheet");
      return;
    }
    const el = document.querySelector('[data-open="alertsNotificationsSheet"]');
    if (el && typeof el.click === "function") el.click();
  };

  requestAnimationFrame(openAlerts);
}

export function bindMandatoryAlertsSettingsResume() {
  if (typeof document === "undefined" || !document.body) return;
  if (document.body.getAttribute("data-portal-alerts-resume-bound") === "1") return;
  document.body.setAttribute("data-portal-alerts-resume-bound", "1");
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void Promise.all([probeLocationPermissionState(), probeMicrophonePermissionState()]).then(
      async () => {
        portalRefreshLocationUi();
        portalRefreshMicrophoneUi();
        if (typeof window.portalRefreshAlertsNotifyUi === "function") {
          window.portalRefreshAlertsNotifyUi();
        }
        if (!portalMandatoryAlertsSettingsComplete()) {
          void portalEnsureMandatoryAlertsSettings();
        }
      }
    );
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
