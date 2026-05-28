/**
 * Shares staff/lead GPS with portal_staff_live_locations while the app tab is visible.
 */
import { getSupabaseClient } from "./supabase-client.js?v=20260531-location";
import { portalPresenceSurface } from "./portal_live_presence.js?v=20260531-location";

const MIN_SEND_INTERVAL_MS = 25000;
const MIN_MOVE_M = 8;
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
  if (now - _lastSentAt < MIN_SEND_INTERVAL_MS) {
    if (_lastSentPos) {
      const moved = haversineM(_lastSentPos.lat, _lastSentPos.lng, lat, lng);
      if (moved < MIN_MOVE_M) return false;
    } else {
      return false;
    }
  }
  return true;
}

async function upsertLocation(pos) {
  if (!_client || !_userId) return;
  const lat = Number(pos.coords.latitude);
  const lng = Number(pos.coords.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (!shouldSend(lat, lng)) return;

  const accuracy = Number(pos.coords.accuracy);
  const accuracy_m = Number.isFinite(accuracy) ? Math.max(accuracy, 3) : 25;

  await _client.from("portal_staff_live_locations").upsert(
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

  _lastSentAt = Date.now();
  _lastSentPos = { lat, lng };
}

async function stopSharing() {
  if (!_client || !_userId) return;
  try {
    await _client
      .from("portal_staff_live_locations")
      .update({ is_sharing: false, updated_at: new Date().toISOString() })
      .eq("staff_user_id", _userId);
  } catch (_) {}
}

function onPosition(pos) {
  void upsertLocation(pos);
}

function onPositionError(err) {
  console.debug("[portal] location", err && err.code);
}

function clearWatch() {
  if (_watchId != null && typeof navigator !== "undefined" && navigator.geolocation) {
    navigator.geolocation.clearWatch(_watchId);
  }
  _watchId = null;
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

  _displayName =
    String(profile.full_name || profile.username || "").trim() ||
    email.split("@")[0] ||
    "Staff";

  try {
    _client = getSupabaseClient();
  } catch (_) {
    return;
  }

  const geoOpts = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000,
  };

  const startWatch = () => {
    clearWatch();
    _watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, geoOpts);
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      startWatch();
    } else {
      clearWatch();
      void stopSharing();
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

export function portalLocationDisplayRadiusM(accuracy_m) {
  const a = Number(accuracy_m);
  if (!Number.isFinite(a) || a <= 0) return DISPLAY_ACCURACY_CAP_M;
  if (a <= DISPLAY_ACCURACY_CAP_M) return DISPLAY_ACCURACY_CAP_M;
  return Math.min(a, 50);
}
