/**
 * Coarse geo from the browser egress (+ optional HTML5 location when already allowed).
 * More accurate than Edge Function IP alone; never stores a precise map pin for London.
 */
(function (global) {
  "use strict";

  var CACHE_KEY = "clubsens_client_geo_hint_v1";
  var DENIED_KEY = "clubsens_client_geo_denied_v1";
  var CACHE_MS = 60 * 60 * 1000;
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
    if (!countryCode && !country && !city) return null;
    return {
      country_code: countryCode,
      country: country,
      region: region,
      city: city,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      source: String(raw.source || "browser"),
    };
  }

  function inGreaterLondon(lat, lng) {
    return (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= 51.28 &&
      lat <= 51.7 &&
      lng >= -0.55 &&
      lng <= 0.35
    );
  }

  function applyLondonOverride(hint, lat, lng) {
    var base = hint && typeof hint === "object" ? hint : {};
    return normalizeHint({
      country_code: base.country_code || "GB",
      country: base.country || "United Kingdom",
      region: "Greater London",
      city: "London",
      latitude: lat,
      longitude: lng,
      source: "browser-geo",
    });
  }

  /** UK ISP GeoIP often pins London home broadband on northern HQ cities. */
  function looksLikeUkIspMisfire(hint) {
    if (!hint) return false;
    var cc = String(hint.country_code || "").toUpperCase();
    if (cc && cc !== "GB" && cc !== "UK") return false;
    var city = String(hint.city || "").trim();
    return /^(bradford|leeds|halifax|huddersfield|rochdale|keighley)$/i.test(city);
  }

  function refineWithDeviceLocation(hint) {
    return new Promise(function (resolve) {
      if (!global.navigator || !global.navigator.geolocation || geoDenied()) {
        resolve(hint);
        return;
      }
      var settled = false;
      function finish(h) {
        if (settled) return;
        settled = true;
        resolve(h);
      }
      var timer = global.setTimeout(function () {
        finish(hint);
      }, 3200);

      function onPos(pos) {
        global.clearTimeout(timer);
        try {
          var lat = pos.coords.latitude;
          var lng = pos.coords.longitude;
          if (inGreaterLondon(lat, lng)) {
            var next = applyLondonOverride(hint, lat, lng);
            if (next) writeCache(next);
            finish(next || hint);
            return;
          }
        } catch (_e) {
          /* ignore */
        }
        finish(hint);
      }

      function onErr(err) {
        global.clearTimeout(timer);
        if (err && (err.code === 1 || String(err.message || "").toLowerCase().indexOf("denied") >= 0)) {
          markDenied();
        }
        finish(hint);
      }

      var opts = { enableHighAccuracy: false, timeout: 2600, maximumAge: 600000 };

      function request() {
        global.navigator.geolocation.getCurrentPosition(onPos, onErr, opts);
      }

      function decide(state) {
        if (state === "denied") {
          markDenied();
          global.clearTimeout(timer);
          finish(hint);
          return;
        }
        if (state === "granted" || looksLikeUkIspMisfire(hint)) {
          request();
          return;
        }
        global.clearTimeout(timer);
        finish(hint);
      }

      if (global.navigator.permissions && global.navigator.permissions.query) {
        global.navigator.permissions
          .query({ name: "geolocation" })
          .then(function (p) {
            decide(p && p.state);
          })
          .catch(function () {
            if (looksLikeUkIspMisfire(hint)) request();
            else {
              global.clearTimeout(timer);
              finish(hint);
            }
          });
      } else if (looksLikeUkIspMisfire(hint)) {
        request();
      } else {
        global.clearTimeout(timer);
        finish(hint);
      }
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
        return normalizeHint(j);
      })
      .catch(function () {
        return null;
      });
  }

  function fetchHint() {
    var cached = readCache();
    if (cached && cached.source === "browser-geo") return Promise.resolve(cached);
    if (inflight) return inflight;
    inflight = (cached ? Promise.resolve(cached) : fetchIpHint())
      .then(function (hint) {
        if (hint && hint.source !== "browser-geo") writeCache(hint);
        return refineWithDeviceLocation(hint);
      })
      .then(function (hint) {
        inflight = null;
        return hint;
      });
    return inflight;
  }

  global.PortalClientGeo = {
    getHint: fetchHint,
    peekCached: readCache,
  };
})(typeof window !== "undefined" ? window : globalThis);
