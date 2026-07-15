/**
 * CEO - Booking Service presence (new clients) (who's signed in + what they're opening).
 */
(function (global) {
  "use strict";

  var POLL_MS = 30000;
  var timer = null;
  var map = null;
  var markersLayer = null;
  var cfg = {
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

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function $(id) {
    return document.getElementById(id);
  }

  function configure(opts) {
    if (!opts) return;
    if (opts.getClient) cfg.getClient = opts.getClient;
    if (opts.getSupabaseUrl) cfg.getSupabaseUrl = opts.getSupabaseUrl;
    if (opts.getAnonKey) cfg.getAnonKey = opts.getAnonKey;
  }

  function baseUrl() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function authToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var r = await client.auth.getSession();
    var s = r && r.data && r.data.session;
    return s && s.access_token ? s.access_token : null;
  }

  function ago(iso) {
    if (!iso) return "-";
    var t = new Date(iso).getTime();
    if (!t) return "-";
    var sec = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (sec < 60) return sec + "s ago";
    if (sec < 3600) return Math.round(sec / 60) + " min ago";
    if (sec < 86400) return Math.round(sec / 3600) + " h ago";
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function ensureMap() {
    if (map || typeof global.L === "undefined") return map;
    var el = $("cbsMap");
    if (!el) return null;
    map = global.L.map(el, {
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([52.5, -1.5], 6);
    global.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 12,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    }).addTo(map);
    markersLayer = global.L.layerGroup().addTo(map);
    map.setMaxBounds([
      [49.5, -6.5],
      [56.2, 2.2],
    ]);
    setTimeout(function () {
      try {
        map.invalidateSize();
      } catch (_e) {
        /* ignore */
      }
    }, 80);
    return map;
  }

  function markerColor(bucket) {
    return bucket === "london" ? "#2d84b3" : "#157347";
  }

  function renderMap(data) {
    ensureMap();
    if (!map || !markersLayer) return;
    markersLayer.clearLayers();
    var points = (data && data.map && data.map.points) || [];
    var bounds = [];
    points.forEach(function (p) {
      var lat = Number(p.lat);
      var lng = Number(p.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      var jLat = lat + (Math.random() - 0.5) * 0.04;
      var jLng = lng + (Math.random() - 0.5) * 0.04;
      var color = markerColor(p.bucket);
      var circle = global.L.circleMarker([jLat, jLng], {
        radius: p.online ? 9 : 7,
        color: "#fff",
        weight: 2,
        fillColor: color,
        fillOpacity: p.online ? 0.95 : 0.7,
      });
      var popupHtml =
        "<strong>" +
        esc(p.visitor_label || "Visitor") +
        "</strong><br>" +
        esc(p.label || p.bucket || "") +
        (p.online ? "<br>Online now" : "");
      circle.bindPopup(popupHtml);
      markersLayer.addLayer(circle);
      bounds.push([jLat, jLng]);
    });
    if (bounds.length === 1) {
      map.setView(bounds[0], 9);
    } else if (bounds.length > 1) {
      try {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 10 });
      } catch (_e) {
        map.setView([52.5, -1.5], 6);
      }
    } else {
      map.setView([52.5, -1.5], 6);
    }
    setTimeout(function () {
      try {
        map.invalidateSize();
      } catch (_e2) {
        /* ignore */
      }
    }, 40);

    var outside = (data && data.map && data.map.outside) || [];
    var outHost = $("cbsOutsideList");
    if (outHost) {
      outHost.innerHTML = outside.length
        ? outside
            .map(function (o) {
              return (
                "<li><strong>" +
                esc(o.visitor_label || "Visitor") +
                "</strong> - " +
                esc(o.label || "Outside England") +
                (o.online ? " - online" : "") +
                "</li>"
              );
            })
            .join("")
        : '<li class="cpp-empty" style="border:0;background:transparent;padding:4px 0">Nobody outside England in the last 24h (or location not known yet).</li>';
    }

    var g = (data && data.summary && data.summary.geo) || {};
    var note = $("cbsGeoNote");
    if (note) {
      note.textContent =
        "Approx. from connection IP | London " +
        (g.london != null ? g.london : 0) +
        " | Rest of England " +
        (g.england != null ? g.england : 0) +
        " | Outside " +
        (g.outside != null ? g.outside : 0) +
        " | Unknown " +
        (g.unknown != null ? g.unknown : 0) +
        ". New sign-ins and hub opens fill location.";
    }
  }

  function visitorRowHtml(p, tone) {
    var detail = p.last_detail ? " - " + p.last_detail : "";
    var loc =
      p.geo_label ||
      [p.geo_city, p.geo_region, p.geo_country].filter(Boolean).join(", ") ||
      "";
    var device = p.client_device_label || (p.client_device === "phone"
      ? "Phone"
      : p.client_device === "desktop"
        ? "Desktop"
        : p.client_device === "tablet"
          ? "Tablet"
          : "");
    return (
      '<li class="cpp-row cpp-row--' +
      esc(tone) +
      '">' +
      '<div class="cpp-row__main">' +
      '<strong class="cpp-row__name">' +
      esc(p.visitor_label || "Visitor") +
      "</strong>" +
      '<span class="cpp-row__meta">' +
      esc(p.last_surface_label || "Browsing") +
      esc(detail) +
      "</span>" +
      "</div>" +
      '<div class="cpp-row__side">' +
      '<span class="cpp-pill cpp-pill--loc" title="Connection location (approx. IP)">' +
      esc(loc || "Location ?") +
      "</span>" +
      '<span class="cpp-pill cpp-pill--device">' +
      esc(device || "Device ?") +
      "</span>" +
      '<span class="cpp-row__ago">' +
      esc(ago(p.last_used_at)) +
      "</span>" +
      "</div></li>"
    );
  }

  function render(data) {
    var sum = (data && data.summary) || {};
    var onlineEl = $("cbsOnlineCount");
    var dayEl = $("cbsDayCount");
    var activeEl = $("cbsActiveCount");
    if (onlineEl) onlineEl.textContent = String(sum.online_now != null ? sum.online_now : "-");
    if (dayEl) dayEl.textContent = String(sum.visits_today != null ? sum.visits_today : "-");
    if (activeEl) activeEl.textContent = String(sum.active_last_24h != null ? sum.active_last_24h : "-");

    var online = (data && data.online) || [];
    var recent = (data && data.recent) || [];
    var activity = (data && data.activity) || [];
    var actions = (data && data.actions) || [];

    var onlineHost = $("cbsOnlineList");
    if (onlineHost) {
      onlineHost.innerHTML = online.length
        ? online
            .map(function (p) {
              return visitorRowHtml(p, "online");
            })
            .join("")
        : '<li class="cpp-empty">Nobody browsing Booking Service in the last ' +
          esc(String((data && data.online_window_minutes) || 5)) +
          " minutes.</li>";
    }

    var recentHost = $("cbsRecentList");
    if (recentHost) {
      recentHost.innerHTML = recent.length
        ? recent
            .map(function (p) {
              return visitorRowHtml(p, "recent");
            })
            .join("")
        : '<li class="cpp-empty">No other Booking Service visits in the last 24 hours.</li>';
    }

    var actHost = $("cbsActivityList");
    if (actHost) {
      actHost.innerHTML = activity.length
        ? activity
            .map(function (a) {
              return (
                '<li class="cpp-feed">' +
                '<span class="cpp-feed__when">' +
                esc(ago(a.at)) +
                "</span>" +
                "<div><strong>" +
                esc(a.visitor_label || "Visitor") +
                "</strong>" +
                (a.child_name ? "  - " + esc(a.child_name) : "") +
                '<div class="cpp-feed__what">' +
                esc(a.event_label) +
                (a.detail ? " - " + esc(a.detail) : "") +
                "</div></div></li>"
              );
            })
            .join("")
        : '<li class="cpp-empty">No surface pings yet — visitors need to open /bookingservice after this deploy.</li>';
    }

    var actionHost = $("cbsActionsList");
    if (actionHost) {
      actionHost.innerHTML =
        '<li class="cpp-empty">New-client Booking Service has no Family absences here — use Surfaces for browse / Book / registration.</li>';
    }

    renderMap(data);

    var stamp = $("cbsStamp");
    if (stamp) {
      stamp.textContent =
        data && data.generated_at ? "Updated " + ago(data.generated_at) : "";
    }
  }

  async function load() {
    var status = $("cbsStatus");
    var token = await authToken();
    if (!token) {
      if (status) status.textContent = "Sign in required.";
      return;
    }
    if (status) status.textContent = "Refreshing...";
    try {
      var res = await fetch(baseUrl() + "/functions/v1/portal-ceo-booking-service-presence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: String(cfg.getAnonKey() || ""),
        },
        body: "{}",
      });
      var body = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !body.ok) {
        if (status) {
          status.textContent =
            "Could not load presence (" + String(body.error || res.status) + ").";
        }
        return;
      }
      render(body);
      if (status) status.textContent = "Live - refreshes every 30s.";
    } catch (_e) {
      if (status) status.textContent = "Network error - retrying...";
    }
  }

  function start() {
    ensureMap();
    void load();
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      void load();
    }, POLL_MS);
    var btn = $("cbsRefresh");
    if (btn && !btn.getAttribute("data-bound")) {
      btn.setAttribute("data-bound", "1");
      btn.addEventListener("click", function () {
        void load();
      });
    }
  }

  global.PortalCeoBookingServicePresence = {
    configure: configure,
    start: start,
    load: load,
  };
})(typeof window !== "undefined" ? window : globalThis);
