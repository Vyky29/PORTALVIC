/**
 * Mandatory on-site location permission (staff/lead dashboards).
 * UI lives in alertsNotificationsSheet; tracker starts after grant.
 */

/** @type {'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported' | 'insecure'} */
let _state = "unknown";

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

export function portalLocationPermissionGranted() {
  return _state === "granted";
}

export function markLocationGranted() {
  _state = "granted";
  try {
    sessionStorage.setItem("portal_location_granted_v1", "1");
    sessionStorage.removeItem("portal_location_denied_v1");
  } catch (_) {}
  window.dispatchEvent(
    new CustomEvent("portal:location-permission-change", { detail: { state: "granted" } })
  );
}

export function markLocationDenied() {
  _state = "denied";
  try {
    sessionStorage.setItem("portal_location_denied_v1", "1");
  } catch (_) {}
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
        try {
          sessionStorage.setItem("portal_location_granted_v1", "1");
          sessionStorage.removeItem("portal_location_denied_v1");
        } catch (_) {}
      }
      window.dispatchEvent(
        new CustomEvent("portal:location-permission-change", { detail: { state: _state } })
      );
      portalRefreshLocationUi();
      portalSyncAlertsSettingsChrome();
    };
    if (_state === "granted") {
      try {
        sessionStorage.setItem("portal_location_granted_v1", "1");
      } catch (_) {}
    }
    return _state;
  } catch (_) {
    try {
      if (sessionStorage.getItem("portal_location_granted_v1") === "1") _state = "granted";
      else if (sessionStorage.getItem("portal_location_denied_v1") === "1") _state = "denied";
      else _state = "prompt";
    } catch (_e2) {
      _state = "prompt";
    }
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
      () => {
        markLocationGranted();
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

export function portalMandatoryAlertsSettingsComplete() {
  return portalNotificationsGranted() && portalLocationPermissionGranted();
}

export function portalSyncAlertsSettingsChrome() {
  const btn = document.getElementById("quickMenuAlerts");
  if (!btn) return;
  const sub = btn.querySelector(".menu-btn-sub");
  const notifyOk = portalNotificationsGranted();
  const locOk = portalLocationPermissionGranted();
  const incomplete = !notifyOk || !locOk;
  btn.classList.toggle("menu-btn--settings-alerts-incomplete", incomplete);
  if (!sub) return;
  if (!notifyOk && !locOk) {
    sub.textContent = "Required: notifications and on-site location";
  } else if (!notifyOk) {
    sub.textContent = "Required: turn on browser notifications";
  } else if (!locOk) {
    sub.textContent = "Required: allow on-site location while using the app";
  } else {
    sub.textContent = "Notifications and on-site location enabled";
  }
}

export function portalRefreshLocationUi() {
  const statusEl = document.getElementById("portalLocationStatus");
  const btn = document.getElementById("portalLocationEnableBtn");
  if (!statusEl) return;
  const ctx = locationContextHint();
  const st = _state === "unknown" ? "prompt" : _state;
  if (st === "unsupported") {
    statusEl.textContent = "This browser does not support location." + ctx;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Location not supported";
    }
  } else if (st === "insecure") {
    statusEl.textContent =
      "On-site location requires HTTPS. Open the portal over a secure link on your phone." + ctx;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "HTTPS required for location";
    }
  } else if (st === "granted") {
    statusEl.textContent =
      "Location is allowed. While this app is open, the office can see your position on the live staff map (~10 m when GPS is good; wider circle indoors or with weak signal). Location is not shared in the background.";
    if (btn) {
      btn.textContent = "Location enabled";
      btn.disabled = true;
    }
  } else if (st === "denied") {
    statusEl.textContent =
      "Location is blocked. Allow location for this site in your browser or phone settings so the office can find you on site when needed." +
      ctx;
    if (btn) {
      btn.textContent = "Location blocked — change in browser settings";
      btn.disabled = false;
    }
  } else {
    statusEl.textContent =
      "Allow location while you use the portal so the office can find you on site if you cannot call. Only shared while the app is open (not in the background)." +
      ctx;
    if (btn) {
      btn.textContent = "Allow on-site location";
      btn.disabled = false;
    }
  }
  portalSyncAlertsSettingsChrome();
}

export async function portalRefreshMandatoryAlertsSettingsUi() {
  await probeLocationPermissionState();
  if (typeof window.portalRefreshAlertsNotifyUi === "function") {
    window.portalRefreshAlertsNotifyUi();
  }
  portalRefreshLocationUi();
}

/**
 * @param {{ page?: string, force?: boolean }} [opts]
 */
export async function portalEnsureMandatoryAlertsSettings(opts = {}) {
  const page = String(opts.page || "").toLowerCase();
  if (page === "admin" || page === "ceo" || page === "onboarding") return;

  await probeLocationPermissionState();
  if (portalMandatoryAlertsSettingsComplete()) {
    portalSyncAlertsSettingsChrome();
    return;
  }

  portalSyncAlertsSettingsChrome();

  try {
    if (typeof window.portalAnnouncementSheetLockActive === "function") {
      if (window.portalAnnouncementSheetLockActive()) return;
    }
  } catch (_) {}

  const openAlerts = () => {
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
    void probeLocationPermissionState().then(() => {
      portalRefreshLocationUi();
      if (typeof window.portalRefreshAlertsNotifyUi === "function") {
        window.portalRefreshAlertsNotifyUi();
      }
      if (!portalMandatoryAlertsSettingsComplete()) {
        void portalEnsureMandatoryAlertsSettings();
      }
    });
  });
}

export function bindPortalLocationPermissionUi() {
  const alertsSheet = document.getElementById("alertsNotificationsSheet");
  if (!alertsSheet || alertsSheet.getAttribute("data-portal-location-ui-bound") === "1") {
    return;
  }
  alertsSheet.setAttribute("data-portal-location-ui-bound", "1");
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
