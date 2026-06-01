/**
 * Shares staff/lead GPS with portal_staff_live_locations while the app tab is visible.
 */
import { getSharedSupabaseClient } from "./supabase-client.js";
import { portalPresenceSurface } from "./portal_live_presence.js";
import {
  markLocationGranted,
  markLocationDenied,
  portalLocationPermissionGranted,
  probeLocationPermissionState,
  tryProbeLocationGrantedViaGeolocation,
} from "./portal_location_permission.js?v=20260601-alerts-ask-once";

const MIN_SEND_INTERVAL_MS = 120000;
const MIN_MOVE_M = 25;
const MAX_STALE_SEND_MS = 300000;
const DISPLAY_ACCURACY_CAP_M = 10;

/** @type {number | null} */
let _watchId = null;
/** @type {number | null} */
let _lastSentAt = 0;
/** @type {{ lat: number; lng: number } | null} */
let _lastSentPos = null;
/** @type {import("@supabase/supabase-js").SupabaseClient | null} */
let _client = null;
/** @type {string} */
let _userId = "";
/** @type {string} */
let _displayName = "";
/** @type {string} */
let _surface = "staff";

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function shouldSend(lat, lng) {
  const now = Date.now();
  const since = now - _lastSentAt;
  if (_lastSentPos) {
    const moved = haversineM(_lastSentPos.lat, _lastSentPos.lng, lat, lng);
    if (moved >= MIN_MOVE_M) return true;
  }
  if (!_lastSentAt) return true;
  if (since >= MAX_STALE_SEND_MS) return true;
  if (since >= MIN_SEND_INTERVAL_MS) return true;
  return false;
}

function reportUploadResult(ok, message, lat, lng) {
  if (typeof window === "undefined") return;
  window.__PORTAL_LOCATION_LAST_UPLOAD__ = ok
    ? { ok: true, at: Date.now(), lat, lng }
    : { ok: false, at: Date.now(), message: message || "upload_failed" };
  window.dispatchEvent(
    new CustomEvent("portal:location-upload", {
      detail: window.__PORTAL_LOCATION_LAST_UPLOAD__,
    })
  );
}

async function upsertLocation(pos, opts = {}) {
  if (!_client || !_userId) return false;
  const lat = Number(pos.coords.latitude);
  const lng = Number(pos.coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (!opts.force && !shouldSend(lat, lng)) return false;

  const accuracy = Number(pos.coords.accuracy);
  const accuracy_m = Number.isFinite(accuracy) ? Math.max(accuracy, 3) : 25;

  let ok = false;
  let errMsg = "";

  const { data: rpcData, error: rpcError } = await _client.rpc("portal_upsert_staff_live_location", {
    p_latitude: lat,
    p_longitude: lng,
    p_accuracy_m: accuracy_m,
    p_staff_display_name: _displayName,
    p_staff_surface: _surface,
  });

  if (rpcError) {
    errMsg = String(rpcError.message || rpcError);
    if (/does not exist|42883|portal_upsert_staff_live_location/i.test(errMsg)) {
      const { error: tableError } = await _client.from("portal_staff_live_locations").upsert(
        {
          staff_user_id: _userId,
          staff_display_name: _displayName,
          staff_surface: _surface,
          latitude: lat,
          longitude: lng,
          accuracy_m,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          updated_at: new Date().toISOString(),
          is_sharing: true,
        },
        { onConflict: "staff_user_id" }
      );
      if (tableError) errMsg = String(tableError.message || tableError);
      else ok = true;
    }
  } else if (rpcData && rpcData.ok === false) {
    errMsg = String(rpcData.error || "rpc_rejected");
  } else {
    ok = true;
  }

  if (!ok) {
    console.warn("[portal] live location upload failed:", errMsg);
    reportUploadResult(false, errMsg);
    return false;
  }

  _lastSentAt = Date.now();
  _lastSentPos = { lat, lng };
  reportUploadResult(true, "", lat, lng);
  return true;
}

/** @type {ReturnType<typeof setTimeout> | null} */
let _stopSharingTimer = null;
const STOP_SHARING_DELAY_MS = 90000;

async function stopSharing() {
  if (!_client || !_userId) return;
  try {
    const { error } = await _client.rpc("portal_stop_staff_live_location");
    if (error) {
      await _client
        .from("portal_staff_live_locations")
        .update({ is_sharing: false, updated_at: new Date().toISOString() })
        .eq("staff_user_id", _userId);
    }
  } catch (_) {}
}

function scheduleStopSharing() {
  if (_stopSharingTimer) clearTimeout(_stopSharingTimer);
  _stopSharingTimer = setTimeout(() => {
    _stopSharingTimer = null;
    if (document.visibilityState === "hidden") void stopSharing();
  }, STOP_SHARING_DELAY_MS);
}

function cancelStopSharing() {
  if (_stopSharingTimer) {
    clearTimeout(_stopSharingTimer);
    _stopSharingTimer = null;
  }
}

function onPosition(pos) {
  markLocationGranted();
  void upsertLocation(pos);
}

function onPositionError(err) {
  if (err && err.code === 1) markLocationDenied();
  const code = err && err.code;
  const msg =
    code === 1
      ? "Location blocked on this device."
      : code === 2
        ? "GPS unavailable — try moving near a window."
        : code === 3
          ? "GPS timed out — try again outdoors."
          : "Could not read GPS.";
  reportUploadResult(false, msg);
  console.warn("[portal] location GPS error:", code, err && err.message);
}

function clearWatch() {
  if (_watchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.clearWatch(_watchId);
  }
  _watchId = null;
}

/** @type {((opts: Record<string, unknown>) => void) | null} */
let _pendingStartOpts = null;
let _permissionListenerBound = false;

function bindPermissionResume() {
  if (_permissionListenerBound) return;
  _permissionListenerBound = true;
  document.addEventListener("portal:location-permission-change", (ev) => {
    const st = ev && ev.detail ? ev.detail.state : "";
    if (st !== "granted") return;
    if (_pendingStartOpts) {
      const o = _pendingStartOpts;
      _pendingStartOpts = null;
      void startPortalLocationTracker(o);
      return;
    }
    if (typeof window.portalRestartLocationTracker === "function") {
      void window.portalRestartLocationTracker();
    }
  });
}

/**
 * @param {{ page?: string, profile?: Record<string, unknown> | null, session?: import("@supabase/supabase-js").Session | null }} opts
 */
export async function startPortalLocationTracker(opts = {}) {
  if (typeof window === "undefined" || typeof navigator === "undefined") return;
  if (!navigator.geolocation) return;

  const page = String(opts.page || "").toLowerCase();
  if (page === "admin" || page === "ceo") return;

  const session = opts.session;
  _userId = String(session?.user?.id || "").trim();
  if (!_userId) return;

  const profile = opts.profile || {};
  const email = String(session?.user?.email || "").trim();
  _surface = portalPresenceSurface(page, profile, email);
  if (_surface === "admin" || _surface === "onboarding") return;

  bindPermissionResume();
  await probeLocationPermissionState();
  if (!portalLocationPermissionGranted()) {
    await tryProbeLocationGrantedViaGeolocation();
  }
  if (!portalLocationPermissionGranted()) {
    _pendingStartOpts = opts;
    return;
  }
  _pendingStartOpts = null;

  _displayName =
    String(profile.full_name || profile.username || "").trim() ||
    email.split("@")[0] ||
    "Staff";

  try {
    _client = getSharedSupabaseClient();
  } catch (_) {
    return;
  }

  const geoOpts = {
    enableHighAccuracy: true,
    maximumAge: 60000,
    timeout: 25000,
  };

  const sendCurrentPositionOnce = (force) => {
    if (!portalLocationPermissionGranted() || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        markLocationGranted();
        void upsertLocation(pos, { force: !!force });
      },
      onPositionError,
      geoOpts
    );
  };

  const startWatch = () => {
    if (!portalLocationPermissionGranted()) return;
    cancelStopSharing();
    if (_watchId == null) {
      sendCurrentPositionOnce(true);
      _watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, geoOpts);
      return;
    }
    sendCurrentPositionOnce(false);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      cancelStopSharing();
      void probeLocationPermissionState().then(() => {
        if (portalLocationPermissionGranted()) startWatch();
      });
    } else {
      clearWatch();
      scheduleStopSharing();
    }
  });

  window.addEventListener("pagehide", () => {
    clearWatch();
    void stopSharing();
  });

  if (document.visibilityState === "visible") {
    startWatch();
  }
}

/** Re-run tracker after the user grants location in settings. */
export async function restartPortalLocationTracker(opts = {}) {
  const page = String(opts.page || "").toLowerCase();
  const session = opts.session || window.__PORTAL_SUPABASE__?.session;
  const profile = opts.profile || window.__PORTAL_SUPABASE__?.staff_profile || null;
  clearWatch();
  _lastSentAt = 0;
  _lastSentPos = null;
  await startPortalLocationTracker({ page, profile, session });
}

/** Immediate upload (e.g. right after user taps Allow). */
export async function uploadLocationFromPosition(pos) {
  if (!_client || !_userId) {
    const session = window.__PORTAL_SUPABASE__?.session;
    const profile = window.__PORTAL_SUPABASE__?.staff_profile || null;
    _userId = String(session?.user?.id || "").trim();
    if (!_userId) return false;
    const email = String(session?.user?.email || "").trim();
    _displayName =
      String(profile?.full_name || profile?.username || "").trim() ||
      email.split("@")[0] ||
      "Staff";
    try {
      _client = getSharedSupabaseClient();
    } catch (_) {
      return false;
    }
  }
  return upsertLocation(pos, { force: true });
}

export function portalLocationDisplayRadiusM(accuracy_m) {
  const a = Number(accuracy_m);
  if (!Number.isFinite(a) || a <= 0) return DISPLAY_ACCURACY_CAP_M;
  if (a <= DISPLAY_ACCURACY_CAP_M) return DISPLAY_ACCURACY_CAP_M;
  return Math.min(a, 50);
}
