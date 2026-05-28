/**
 * Admin map — staff/lead live locations (OpenStreetMap + Leaflet).
 */
(function (global) {
  "use strict";

  var LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  var LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
  var STALE_MINUTES = 20;

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
    var res = await client
      .from("portal_staff_live_locations")
      .select(
        "staff_user_id, staff_display_name, staff_surface, latitude, longitude, accuracy_m, updated_at, is_sharing"
      )
      .eq("is_sharing", true)
      .gte("updated_at", staleCutoffIso())
      .order("updated_at", { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  }

  function presenceStaffOnline() {
    try {
      var g = global.__PORTAL_PRESENCE_GROUPED__;
      if (g && Array.isArray(g.staffLeads)) return g.staffLeads;
    } catch (_e) {}
    return [];
  }

  function renderList(rows, onlineWithoutGps) {
    var host = document.getElementById("portalStaffMapList");
    if (!host) return;
    var parts = [];
    if (rows.length) {
      parts.push('<div class="portal-staff-map-list-section"><p class="portal-staff-map-list-heading">On map</p>');
      parts.push(
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
          .join("")
      );
      parts.push("</div>");
    }
    if (onlineWithoutGps && onlineWithoutGps.length) {
      parts.push(
        '<div class="portal-staff-map-list-section"><p class="portal-staff-map-list-heading">Online — location not shared</p>'
      );
      parts.push(
        onlineWithoutGps
          .map(function (p) {
            return (
              '<p class="portal-staff-map-list-item portal-staff-map-list-item--online-only">' +
              "<strong>" +
              esc(p.name || p.email) +
              "</strong>" +
              ' <span class="muted">(' +
              esc(p.email) +
              ") · portal open · allow location in Alerts &amp; notifications</span></p>"
            );
          })
          .join("")
      );
      parts.push("</div>");
    }
    if (!parts.length) {
      host.innerHTML =
        '<p class="muted">No staff online right now. When someone opens the staff portal on their phone and allows location, they appear here.</p>';
      return;
    }
    host.innerHTML = parts.join("");
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

  function onlineWithoutGps(rows) {
    var online = presenceStaffOnline();
    if (!online.length) return [];
    if (!rows.length) return online;
    if (online.length > rows.length) return online;
    return [];
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

  async function refresh() {
    var status = document.getElementById("portalStaffMapStatus");
    try {
      if (status) status.textContent = "Loading live locations…";
      var L = await loadLeaflet();
      var rows = await fetchLocations();
      var onlineOnly = onlineWithoutGps(rows);
      var onlineCount = presenceStaffOnline().length;
      if (status) {
        var bits = [
          rows.length +
            " sharing location (last " +
            STALE_MINUTES +
            " min)",
        ];
        if (onlineCount) bits.push(onlineCount + " staff/lead online in portal");
        if (onlineOnly.length) {
          bits.push(onlineOnly.length + " online without GPS — need location allowed on device");
        }
        status.textContent = bits.join(" · ") + ".";
      }
      renderList(rows, onlineOnly);
      updateMap(rows, L);
    } catch (err) {
      console.error(err);
      var msg = err && err.message ? err.message : String(err);
      if (/does not exist|relation/i.test(msg) && status) {
        status.textContent =
          "Run migration 20260531160000_portal_staff_live_locations.sql on Portal Supabase.";
      } else if (status) {
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

    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = setInterval(function () {
      void refresh();
    }, 30000);

    global.addEventListener("portal:presence-sync", function () {
      void refresh();
    });

    void refresh();
  }

  function destroyModule() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
    if (_map) {
      _map.remove();
      _map = null;
    }
    _markers = {};
  }

  function viewHtml() {
    return (
      '<div id="portalStaffMapRoot" class="portal-staff-map-embed portal-day-ops-embed">' +
      '<h1 class="page-title">Staff live map</h1>' +
      '<p class="page-intro">Staff and leads who have the portal open and allowed location appear here (~10 m radius when GPS is good). Use this to find someone on site who cannot call.</p>' +
      '<div class="portal-staff-map-toolbar">' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalStaffMapRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="dashboard">Day operations</button>' +
      "</div>" +
      '<p id="portalStaffMapStatus" class="portal-staff-map-status muted">Loading…</p>' +
      '<div id="portalStaffMapCanvas" class="portal-staff-map-canvas" aria-label="Map"></div>' +
      '<div id="portalStaffMapList" class="portal-staff-map-list"></div>' +
      "</div>"
    );
  }

  global.PortalStaffLiveMap = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    destroyModule: destroyModule,
    refresh: refresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
