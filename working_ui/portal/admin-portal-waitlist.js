/**
 * Admin — live Booking Portal waitlist (portal_waitlist_entries).
 * Caches mapped rows on window.__PORTAL_WAITLIST_LIVE_ROWS__ for CFK Waiting list.
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    toast: function () {},
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
  };

  var state = {
    loading: false,
    error: "",
    entries: [],
    meta: {},
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.toast) cfg.toast = options.toast;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function accessToken() {
    var client = cfg.getClient && cfg.getClient();
    if (client && client.auth && typeof client.auth.getSession === "function") {
      var sessResp = await client.auth.getSession();
      var session = sessResp && sessResp.data && sessResp.data.session;
      if (session && session.access_token) return session.access_token;
    }
    return null;
  }

  function formatSince(iso) {
    var t = new Date(String(iso || "")).getTime();
    if (!Number.isFinite(t)) return "—";
    try {
      return new Date(t).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (_e) {
      return String(iso).slice(0, 10);
    }
  }

  function mapEntry(e) {
    var slot = [e.day_name, e.time_label]
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean)
      .join(" · ");
    var cont = [e.mobile, e.email]
      .map(function (x) {
        return String(x || "").trim();
      })
      .filter(Boolean)
      .join(" · ");
    return {
      id: "live-" + String(e.id || ""),
      liveId: String(e.id || ""),
      pax: String(e.participant_name || "").trim() || "—",
      service: String(e.service_label || e.service_key || "").trim() || "—",
      slotTime: slot || "—",
      pref: String(e.note || "").trim() || "—",
      ratio: "—",
      loc: String(e.venue || "").trim() || "—",
      pri: "—",
      match: "—",
      cont: cont || "—",
      last: "—",
      since: formatSince(e.created_at),
      parentLine: String(e.parent_name || "").trim(),
      sourceTag: "Booking Portal",
      source: "Booking Portal",
      liveStatus: String(e.status || "active"),
      _live: true,
      created_at: e.created_at,
    };
  }

  function publishRows(entries) {
    var rows = (entries || []).map(mapEntry);
    global.__PORTAL_WAITLIST_LIVE_ROWS__ = rows;
    global.__PORTAL_WAITLIST_LIVE_META__ = state.meta || {};
    return rows;
  }

  async function refresh() {
    state.loading = true;
    state.error = "";
    try {
      var token = await accessToken();
      if (!token) {
        state.error = "Sign in required";
        publishRows([]);
        return { ok: false, error: state.error, rows: [] };
      }
      var base = supabaseBase();
      var anon = String(cfg.getAnonKey() || "").trim();
      if (!base || !anon) {
        state.error = "Missing Supabase config";
        publishRows([]);
        return { ok: false, error: state.error, rows: [] };
      }
      var res = await fetch(base + "/functions/v1/portal-admin-waitlist-list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: anon,
        },
        body: JSON.stringify({ include_offered: true, limit: 300 }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.ok) {
        state.error = (data && data.error) || "load_failed";
        publishRows([]);
        return { ok: false, error: state.error, rows: [] };
      }
      state.entries = data.entries || [];
      state.meta = data.meta || {};
      var rows = publishRows(state.entries);
      return { ok: true, rows: rows, meta: state.meta };
    } catch (err) {
      state.error = (err && err.message) || "network_error";
      publishRows([]);
      return { ok: false, error: state.error, rows: [] };
    } finally {
      state.loading = false;
    }
  }

  global.PortalAdminWaitlist = {
    configure: configure,
    refresh: refresh,
    getCachedRows: function () {
      return Array.isArray(global.__PORTAL_WAITLIST_LIVE_ROWS__)
        ? global.__PORTAL_WAITLIST_LIVE_ROWS__
        : [];
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
