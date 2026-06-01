/**
 * Admin map — staff/lead live locations (OpenStreetMap + Leaflet).
 */
(function (global) {
  "use strict";

  var LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  var LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  var STALE_MINUTES = 20;
  var MAP_POLL_MS = 10000;

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
  };

  /** @type {L.Map | null} */
  var _map = null;
  /** @type {Object<string, L.CircleMarker | L.Circle>} */
  var _markers = {};
  /** @type {ReturnType<typeof setInterval> | null} */
  var _pollTimer = null;
  var _mapFitOnce = false;
  var _lastMarkerCount = 0;

  function esc(s) {
    return cfg.esc(s);
  }

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  function loadLeaflet() {
    return new Promise(function (resolve, reject) {
      if (global.L && global.L.map) {
        resolve(global.L);
        return;
      }
      if (!document.querySelector('link[data-portal-leaflet="1"]')) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = LEAFLET_CSS;
        link.setAttribute("data-portal-leaflet", "1");
        document.head.appendChild(link);
      }
      var existing = document.querySelector('script[data-portal-leaflet="1"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve(global.L);
        });
        return;
      }
      var s = document.createElement("script");
      s.src = LEAFLET_JS;
      s.setAttribute("data-portal-leaflet", "1");
      s.onload = function () {
        resolve(global.L);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function displayRadiusM(accuracy_m) {
    var a = Number(accuracy_m);
    if (!Number.isFinite(a) || a <= 0) return 10;
    if (a <= 10) return 10;
    return Math.min(a, 50);
  }

  function formatAgo(iso) {
    if (!iso) return "—";
    var ms = Date.now() - new Date(iso).getTime();
    if (ms < 60000) return Math.round(ms / 1000) + "s ago";
    if (ms < 3600000) return Math.round(ms / 60000) + "m ago";
    return Math.round(ms / 3600000) + "h ago";
  }

  function staleCutoffIso() {
    return new Date(Date.now() - STALE_MINUTES * 60000).toISOString();
  }

  async function fetchLocations() {
    var client = cfg.getClient();
    if (!client) return [];

    var rpc = await client.rpc("portal_admin_fetch_staff_live_locations", {
      p_stale_minutes: STALE_MINUTES,
    });
    if (!rpc.error && rpc.data != null) {
      if (Array.isArray(rpc.data)) return rpc.data;
      return [];
    }

    var res = await client
      .from("portal_staff_live_locations")
      .select(
        "staff_user_id, staff_display_name, staff_surface, latitude, longitude, accuracy_m, updated_at, is_sharing"
      )
      .eq("is_sharing", true)
      .gte("updated_at", staleCutoffIso())
      .order("updated_at", { ascending: false });
    if (res.error) {
      if (/permission denied|403|42501/i.test(String(res.error.message || res.error))) {
        var err403 = new Error(
          "Map access denied (403). Run migrations 20260601120000 and 20260602120000 on Portal Supabase, then sign out and back in."
        );
        err403.code = "MAP_FORBIDDEN";
        throw err403;
      }
      throw res.error;
    }
    return res.data || [];
  }

  function renderList(rows) {
    var host = document.getElementById("portalStaffMapList");
    if (!host) return;
    if (!rows.length) {
      host.innerHTML =
        '<p class="muted">No staff sharing location right now. GPS is only sent from 15 minutes before their first session until 30 minutes after their last session on rostered days (portal open + location allowed).</p>';
      return;
    }
    host.innerHTML =
      '<p class="portal-staff-map-list-heading">On map</p>' +
      rows
      .map(function (r) {
        return (
          '<button type="button" class="portal-staff-map-list-item" data-map-focus="' +
          esc(r.staff_user_id) +
          '">' +
          "<strong>" +
          esc(r.staff_display_name || "Staff") +
          "</strong>" +
          ' <span class="muted">(' +
          esc(r.staff_surface || "staff") +
          ") · " +
          esc(formatAgo(r.updated_at)) +
          " · ~" +
          esc(String(Math.round(displayRadiusM(r.accuracy_m)))) +
          " m</span></button>"
        );
      })
      .join("");
    host.querySelectorAll("[data-map-focus]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-map-focus");
        var m = _markers[id];
        if (_map && m) {
          _map.setView(m.getLatLng ? m.getLatLng() : m.getBounds().getCenter(), 17);
        }
      });
    });
  }

  function updateMap(rows, L) {
    var mapEl = document.getElementById("portalStaffMapCanvas");
    if (!mapEl || !L) return;

    if (!_map) {
      _map = L.map(mapEl, { zoomControl: true }).setView([51.5074, -0.1278], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(_map);
    }

    var active = Object.create(null);
    rows.forEach(function (r) {
      active[r.staff_user_id] = true;
      var lat = Number(r.latitude);
      var lng = Number(r.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      var radius = displayRadiusM(r.accuracy_m);
      var label = esc(r.staff_display_name || "Staff");
      var popup =
        "<strong>" +
        label +
        "</strong><br>" +
        esc(r.staff_surface || "staff") +
        "<br>Updated " +
        esc(formatAgo(r.updated_at)) +
        "<br>~<strong>" +
        esc(String(Math.round(radius))) +
        " m</strong> radius";

      if (_markers[r.staff_user_id]) {
        _markers[r.staff_user_id].setLatLng([lat, lng]);
        _markers[r.staff_user_id].setRadius(radius);
        _markers[r.staff_user_id].bindPopup(popup);
      } else {
        var circle = L.circle([lat, lng], {
          radius: radius,
          color: "#2d84b3",
          fillColor: "#38bdf8",
          fillOpacity: 0.35,
          weight: 2,
        }).addTo(_map);
        circle.bindPopup(popup);
        _markers[r.staff_user_id] = circle;
      }
    });

    Object.keys(_markers).forEach(function (id) {
      if (!active[id]) {
        _map.removeLayer(_markers[id]);
        delete _markers[id];
      }
    });

    if (rows.length) {
      var bounds = L.latLngBounds(
        rows.map(function (r) {
          return [Number(r.latitude), Number(r.longitude)];
        })
      );
      _map.fitBounds(bounds.pad(0.15));
    }

    setTimeout(function () {
      if (_map) _map.invalidateSize();
    }, 120);
  }

  function mapViewActive() {
    var root = document.getElementById("portalStaffMapRoot");
    return !!(root && root.isConnected && document.visibilityState === "visible");
  }

  function startMapPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(function () {
      if (!mapViewActive()) return;
      void refresh({ quiet: true });
    }, MAP_POLL_MS);
  }

  function stopMapPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  async function refresh(opts) {
    opts = opts || {};
    if (!mapViewActive() && opts.quiet) return;
    var status = document.getElementById("portalStaffMapStatus");
    try {
      if (status && !opts.quiet) status.textContent = "Loading live locations…";
      var L = await loadLeaflet();
      var rows = await fetchLocations();
      if (status) {
        status.textContent =
          rows.length + " on map · updated in last " + STALE_MINUTES + " min";
      }
      renderList(rows);
      updateMap(rows, L);
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : String(err);
      if (/does not exist|relation/i.test(msg) && status) {
        status.textContent =
          "Run migration 20260531160000_portal_staff_live_locations.sql on Portal Supabase.";
      } else if ((/MAP_FORBIDDEN|403|permission denied/i.test(msg) || err.code === "MAP_FORBIDDEN") && status) {
        status.textContent = msg;
      } else if (status && !opts.quiet) {
        status.textContent = "Error: " + msg;
      }
    }
  }

  function bindModule() {
    var root = document.getElementById("portalStaffMapRoot");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");

    var btn = document.getElementById("portalStaffMapRefresh");
    if (btn) {
      btn.addEventListener("click", function () {
        void refresh();
      });
    }

    startMapPolling();
    document.addEventListener("visibilitychange", onMapVisibilityChange);

    void refresh();
  }

  function onMapVisibilityChange() {
    if (!mapViewActive()) {
      stopMapPolling();
      return;
    }
    startMapPolling();
    void refresh({ quiet: true });
  }

  function destroyModule() {
    document.removeEventListener("visibilitychange", onMapVisibilityChange);
    stopMapPolling();
    if (_map) {
      _map.remove();
      _map = null;
    }
    _markers = {};
    _mapFitOnce = false;
    _lastMarkerCount = 0;
  }

  var ICON_REFRESH =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>';
  var ICON_DAY_OPS =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

  function viewHtml() {
    return (
      '<div id="portalStaffMapRoot" class="portal-staff-map-embed portal-day-ops-embed">' +
      '<div class="portal-staff-map-header">' +
      '<div class="portal-staff-map-title-row">' +
      '<h1 class="page-title">Staff live map</h1>' +
      '<div class="portal-staff-map-toolbar">' +
      '<button type="button" class="btn btn--sec btn--sm portal-staff-map-action-btn" id="portalStaffMapRefresh">' +
      '<span class="portal-staff-map-action-btn__ico">' +
      ICON_REFRESH +
      "</span><span>Refresh</span></button>" +
      '<button type="button" class="btn btn--ghost btn--sm portal-staff-map-action-btn" data-view-target="dashboard">' +
      '<span class="portal-staff-map-action-btn__ico">' +
      ICON_DAY_OPS +
      "</span><span>Day operations</span></button>" +
      "</div></div>" +
      '<p id="portalStaffMapStatus" class="portal-staff-map-status muted">Loading…</p>' +
      "</div>" +
      '<div class="portal-staff-map-layout">' +
      '<div class="portal-staff-map-layout__map">' +
      '<div id="portalStaffMapCanvas" class="portal-staff-map-canvas" aria-label="Map"></div>' +
      "</div>" +
      '<aside class="portal-staff-map-layout__side" aria-label="Staff on map">' +
      '<div id="portalStaffMapList" class="portal-staff-map-list"></div>' +
      "</aside></div></div>"
    );
  }

  global.PortalStaffLiveMap = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    destroyModule: destroyModule,
    startMapPolling: startMapPolling,
    stopMapPolling: stopMapPolling,
    refresh: refresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
