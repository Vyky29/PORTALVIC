/**
 * Parent / booking-service presence geo — device GPS first (like staff live map).
 * Never send Bradford/Leeds-style ISP cities as truth; server also remaps those.
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "clubsens_client_geo_hint_v4";
  var DENIED_KEY = "clubsens_client_geo_denied_v4";
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

  function clearDenied() {
    try {
      global.sessionStorage.removeItem(DENIED_KEY);
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

  function isUkIspMisleadingCity(city) {
    return /^(bradford|leeds|halifax|huddersfield|rochdale|keighley)$/i.test(
      String(city || "").trim(),
    );
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
    // Strip bad ISP cities before they ever leave the browser.
    if (source !== "device-geo" && isUkIspMisleadingCity(city)) {
      city = "London";
      region = "Greater London";
      countryCode = countryCode || "GB";
      country = country || "United Kingdom";
      lat = null;
      lng = null;
      source = "browser-ip-corrected";
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

  function getDevicePosition(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!global.navigator || !global.navigator.geolocation) {
        resolve(null);
        return;
      }
      if (geoDenied() && !opts.force) {
        resolve(null);
        return;
      }
      if (opts.force) clearDenied();

      var settled = false;
      function finish(pos) {
        if (settled) return;
        settled = true;
        resolve(pos);
      }
      var timer = global.setTimeout(function () {
        finish(null);
      }, opts.timeoutMs || 12000);

      // Coarse first — high accuracy often times out indoors on phones.
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
        {
          enableHighAccuracy: !!opts.highAccuracy,
          timeout: opts.timeoutMs || 10000,
          maximumAge: opts.maximumAge != null ? opts.maximumAge : 120000,
        },
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
        var hint = normalizeHint(Object.assign({}, j, { source: "browser-ip" }));
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
    inflight = getDevicePosition({
      force: !!opts.force,
      highAccuracy: false,
      timeoutMs: opts.force ? 15000 : 10000,
    })
      .then(function (pos) {
        if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) {
          var fromDevice = hintFromDeviceCoords(pos.lat, pos.lng, pos.accuracy);
          if (fromDevice) {
            writeCache(fromDevice);
            return fromDevice;
          }
        }
        if (cached && cached.source === "device-geo") return cached;
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

  function warm() {
    return fetchHint({ force: false });
  }

  /** Call from a click/tap so iOS/Android show the permission prompt. */
  function requestFromUserGesture() {
    clearDenied();
    try {
      global.sessionStorage.removeItem(CACHE_KEY);
    } catch (_e) {
      /* ignore */
    }
    return fetchHint({ force: true });
  }

  function hasDeviceFix() {
    var c = readCache();
    return !!(c && c.source === "device-geo");
  }

  global.PortalClientGeo = {
    getHint: fetchHint,
    peekCached: readCache,
    warm: warm,
    requestFromUserGesture: requestFromUserGesture,
    hasDeviceFix: hasDeviceFix,
    isDenied: geoDenied,
  };
})(typeof window !== "undefined" ? window : globalThis);
