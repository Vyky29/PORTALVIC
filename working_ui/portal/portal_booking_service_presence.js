/**
 * Public Booking Service visitor presence (anonymous new clients).
 */
(function (global) {
  "use strict";

  var SESSION_KEY = "clubsens_booking_service_session_v1";
  var token = "";
  var ready = null;
  var _lastPing = { surface: "", at: 0 };

  function cfg() {
    var staticCfg = global.__PORTAL_STATIC__ || {};
    return {
      url: String(staticCfg.supabaseUrl || global.SUPABASE_URL || "").replace(/\/$/, ""),
      anon: String(staticCfg.supabaseAnonKey || global.SUPABASE_ANON_KEY || "").trim(),
    };
  }

  function loadStored() {
    try {
      var raw = global.localStorage.getItem(SESSION_KEY);
      if (!raw) return "";
      var j = JSON.parse(raw);
      if (!j || !j.token) return "";
      if (j.expiresAt && Number(j.expiresAt) < Date.now()) return "";
      return String(j.token);
    } catch (_e) {
      return "";
    }
  }

  function saveStored(tok, expiresAt) {
    token = String(tok || "");
    try {
      global.localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          token: token,
          expiresAt: expiresAt ? new Date(expiresAt).getTime() : Date.now() + 86400000,
        }),
      );
    } catch (_e) {
      /* ignore */
    }
  }

  function ensureSession() {
    if (ready) return ready;
    ready = (async function () {
      var c = cfg();
      if (!c.url || !c.anon) return "";
      var existing = loadStored();
      try {
        var res = await fetch(c.url + "/functions/v1/portal-booking-service-session-start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + c.anon,
            apikey: c.anon,
            "x-booking-service-session": existing || "",
          },
          body: "{}",
        });
        var body = await res.json().catch(function () {
          return {};
        });
        if (res.ok && body.ok && body.session_token) {
          saveStored(body.session_token, body.expires_at);
          return token;
        }
      } catch (_e) {
        /* ignore */
      }
      return "";
    })();
    return ready;
  }

  function ping(surface, detail) {
    var s = String(surface || "").trim().toLowerCase();
    if (!s) return Promise.resolve();
    var now = Date.now();
    if (_lastPing.surface === s && now - _lastPing.at < 20000) return Promise.resolve();
    _lastPing = { surface: s, at: now };
    return ensureSession().then(function (tok) {
      if (!tok) return;
      var c = cfg();
      return fetch(c.url + "/functions/v1/portal-booking-service-activity-ping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + c.anon,
          apikey: c.anon,
          "x-booking-service-session": tok,
        },
        body: JSON.stringify({
          surface: s,
          detail: detail ? String(detail).slice(0, 160) : null,
        }),
      }).catch(function () {
        /* best-effort */
      });
    });
  }

  function bootOffer() {
    void ensureSession().then(function () {
      void ping("offer");
    });
  }

  function bootRegistration() {
    try {
      var q = new URLSearchParams(global.location.search || "");
      if (String(q.get("from") || "").toLowerCase() !== "bookingservice") return;
    } catch (_e) {
      return;
    }
    void ensureSession().then(function () {
      var detail = "";
      try {
        var q2 = new URLSearchParams(global.location.search || "");
        detail = [q2.get("service_name") || q2.get("service"), q2.get("day"), q2.get("time")]
          .filter(Boolean)
          .join(" · ");
      } catch (_e2) {
        /* ignore */
      }
      void ping("registration", detail || null);
    });
  }

  global.PortalBookingServicePresence = {
    ensureSession: ensureSession,
    ping: ping,
    bootOffer: bootOffer,
    bootRegistration: bootRegistration,
    getToken: function () {
      return token || loadStored();
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
