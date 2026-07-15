/**
 * Parent / booking-service presence geo — same idea as staff live map: prefer device GPS.
 * Falls back to IP only when geolocation is denied or unavailable.
 * City names for non-London GPS are filled server-side (reverse geocode).
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "clubsens_client_geo_hint_v3";
  var DENIED_KEY = "clubsens_client_geo_denied_v3";
  var CACHE_MS = 30 * 60 * 1000;
  var inflight = null;

  function readCache() {
    try {
      var raw = global.sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var j = JSON.parse(raw);
      if (!j || !j.at || Date.now() - Number(j.at) > CACHE_MS) return null;
      return j.hint || null;
    } catch (_e) {
      return null;
    }
  }

  function writeCache(hint) {
    try {
      global.sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ at: Date.now(), hint: hint }),
      );
    } catch (_e) {
      /* ignore */
    }
  }

  function geoDenied() {
    try {
      return global.sessionStorage.getItem(DENIED_KEY) === "1";
    } catch (_e) {
      return false;
    }
  }

  function markDenied() {
    try {
      global.sessionStorage.setItem(DENIED_KEY, "1");
    } catch (_e) {
      /* ignore */
    }
  }

  function clean(v, max) {
    return String(v == null ? "" : v)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max || 80);
  }

  function normalizeHint(raw) {
    if (!raw || typeof raw !== "object") return null;
    var countryCode = clean(raw.country_code || raw.countryCode, 8);
    var country = clean(raw.country || raw.country_name || raw.countryName, 80);
    var region = clean(raw.region || raw.regionName, 80);
    var city = clean(raw.city, 80);
    var lat = typeof raw.latitude === "number" ? raw.latitude : Number(raw.latitude || raw.lat);
    var lng = typeof raw.longitude === "number" ? raw.longitude : Number(raw.longitude || raw.lng);
    var acc =
      typeof raw.accuracy_m === "number" ? raw.accuracy_m : Number(raw.accuracy_m || raw.accuracy);
    var source = String(raw.source || "browser");
    if (!countryCode && !country && !city && !(Number.isFinite(lat) && Number.isFinite(lng))) {
      return null;
    }
    return {
      country_code: countryCode,
      country: country,
      region: region,
      city: city,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      accuracy_m: Number.isFinite(acc) ? acc : null,
      source: source,
    };
  }

  function hintFromDeviceCoords(lat, lng, accuracy) {
    // Leave city empty so the server reverse-geocodes neighbourhood (Latimer, not borough/IP).
    return normalizeHint({
      country_code: "",
      country: "",
      region: "",
      city: "",
      latitude: lat,
      longitude: lng,
      accuracy_m: accuracy,
      source: "device-geo",
    });
  }

  function getDevicePosition() {
    return new Promise(function (resolve) {
      if (!global.navigator || !global.navigator.geolocation || geoDenied()) {
        resolve(null);
        return;
      }
      var settled = false;
      function finish(pos) {
        if (settled) return;
        settled = true;
        resolve(pos);
      }
      var timer = global.setTimeout(function () {
        finish(null);
      }, 16000);
      global.navigator.geolocation.getCurrentPosition(
        function (pos) {
          global.clearTimeout(timer);
          try {
            finish({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            });
          } catch (_e) {
            finish(null);
          }
        },
        function (err) {
          global.clearTimeout(timer);
          if (
            err &&
            (err.code === 1 || String(err.message || "").toLowerCase().indexOf("denied") >= 0)
          ) {
            markDenied();
          }
          finish(null);
        },
        { enableHighAccuracy: true, timeout: 14000, maximumAge: 60000 },
      );
    });
  }

  function fetchIpHint() {
    return fetch("https://ipwho.is/", { method: "GET", headers: { Accept: "application/json" } })
      .then(function (res) {
        return res.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        if (!j || j.success === false) return null;
        var hint = normalizeHint(j);
        if (hint) hint.source = "browser-ip";
        return hint;
      })
      .catch(function () {
        return null;
      });
  }

  function fetchHint(opts) {
    opts = opts || {};
    var cached = readCache();
    if (!opts.force && cached && cached.source === "device-geo") {
      return Promise.resolve(cached);
    }
    if (inflight && !opts.force) return inflight;
    inflight = getDevicePosition()
      .then(function (pos) {
        if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) {
          var fromDevice = hintFromDeviceCoords(pos.lat, pos.lng, pos.accuracy);
          if (fromDevice) {
            writeCache(fromDevice);
            return fromDevice;
          }
        }
        if (cached) return cached;
        return fetchIpHint().then(function (hint) {
          if (hint) writeCache(hint);
          return hint;
        });
      })
      .then(function (hint) {
        inflight = null;
        return hint;
      })
      .catch(function () {
        inflight = null;
        return cached || null;
      });
    return inflight;
  }

  /** Warm GPS early so the browser permission prompt appears on portal open. */
  function warm() {
    return fetchHint({ force: false });
  }

  global.PortalClientGeo = {
    getHint: fetchHint,
    peekCached: readCache,
    warm: warm,
  };
})(typeof window !== "undefined" ? window : globalThis);
