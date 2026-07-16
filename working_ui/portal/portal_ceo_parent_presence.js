/**
 * CEO - Family portal presence (who's signed in + what they're opening).
 * Connection place = server IP geo only (no parent GPS, no live map).
 */
(function (global) {
  "use strict";

  var POLL_MS = 30000;
  var timer = null;
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

  function placeItemHtml(p, nameKey) {
    var name = p[nameKey] || (nameKey === "visitor_label" ? "Visitor" : "Parent");
    return (
      "<li><strong>" +
      esc(name) +
      "</strong> — " +
      esc(p.label || "Unknown") +
      (p.online ? " — online" : "") +
      "</li>"
    );
  }

  function renderPlaces(data) {
    var points = (data && data.map && data.map.points) || [];
    var outside = (data && data.map && data.map.outside) || [];
    var londonHost = $("cppLondonList");
    var outHost = $("cppOutsideList");
    if (londonHost) {
      londonHost.innerHTML = points.length
        ? points.map(function (p) {
            return placeItemHtml(p, "parent_name");
          }).join("")
        : '<li class="cpp-empty" style="border:0;background:transparent;padding:4px 0">Nobody connecting from London in the last 24h (or place not known yet).</li>';
    }
    if (outHost) {
      outHost.innerHTML = outside.length
        ? outside.map(function (o) {
            return placeItemHtml(o, "parent_name");
          }).join("")
        : '<li class="cpp-empty" style="border:0;background:transparent;padding:4px 0">Nobody connecting from outside London in the last 24h (or place not known yet).</li>';
    }

    var g = (data && data.summary && data.summary.geo) || {};
    var note = $("cppGeoNote");
    if (note) {
      note.textContent =
        "Approx. place from connection IP (not phone GPS). London " +
        (g.london != null ? g.london : 0) +
        " | Outside London " +
        ((g.england || 0) + (g.outside || 0)) +
        " | Unknown " +
        (g.unknown != null ? g.unknown : 0) +
        ". Your own QA logins show here with their connection place.";
    }
  }

  function parentRowHtml(p, tone) {
    var kids = Array.isArray(p.children) ? p.children.join(", ") : "";
    var focus = p.child_focus ? " - looking at " + p.child_focus : "";
    var locRaw =
      p.geo_label ||
      [p.geo_city, p.geo_region, p.geo_country].filter(Boolean).join(", ") ||
      "";
    var loc =
      p.geo_bucket === "london"
        ? locRaw || "London"
        : p.geo_bucket === "england" || p.geo_bucket === "outside"
          ? (locRaw ? "Outside London · " + locRaw : "Outside London")
          : locRaw;
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
      esc(p.parent_name || "Parent") +
      "</strong>" +
      '<span class="cpp-row__meta">' +
      esc(kids || "-") +
      esc(focus) +
      "</span>" +
      "</div>" +
      '<div class="cpp-row__side">' +
      '<span class="cpp-pill cpp-pill--loc" title="Approx. place from connection IP">' +
      esc(loc || "Place ?") +
      "</span>" +
      '<span class="cpp-pill cpp-pill--device">' +
      esc(device || "Device ?") +
      "</span>" +
      '<span class="cpp-pill cpp-pill--' +
      (p.alerts_on ? "alerts-on" : "alerts-off") +
      '" title="' +
      (p.alerts_on ? "Family alerts enabled" : "Family alerts not enabled yet") +
      '">' +
      esc(p.alerts_on ? "Alerts on" : "Alerts off") +
      "</span>" +
      '<span class="cpp-pill">' +
      esc(p.last_surface_label || "Signed in") +
      "</span>" +
      '<span class="cpp-row__ago">' +
      esc(ago(p.last_used_at)) +
      "</span>" +
      "</div></li>"
    );
  }

  function alertParentRowHtml(p, tone) {
    var kids = p.children_label || (Array.isArray(p.children) ? p.children.join(", ") : "");
    var when = p.last_subscribed_at ? ago(p.last_subscribed_at) : "";
    var devices =
      p.alerts_on && p.devices > 1 ? p.devices + " devices" : p.alerts_on ? "1 device" : "";
    return (
      '<li class="cpp-row cpp-row--' +
      esc(tone) +
      '">' +
      '<div class="cpp-row__main">' +
      '<strong class="cpp-row__name">' +
      esc(p.parent_name || "Parent") +
      "</strong>" +
      '<span class="cpp-row__meta">' +
      esc(kids || "—") +
      "</span>" +
      "</div>" +
      '<div class="cpp-row__side">' +
      '<span class="cpp-pill cpp-pill--' +
      (p.alerts_on ? "alerts-on" : "alerts-off") +
      '">' +
      esc(p.alerts_on ? "On" : "Off") +
      "</span>" +
      (devices
        ? '<span class="cpp-row__ago">' + esc(devices) + "</span>"
        : "") +
      (when ? '<span class="cpp-row__ago">' + esc(when) + "</span>" : "") +
      "</div></li>"
    );
  }

  function render(data) {
    var sum = (data && data.summary) || {};
    var onlineEl = $("cppOnlineCount");
    var dayEl = $("cppDayCount");
    var activeEl = $("cppActiveCount");
    var alertsOnEl = $("cppAlertsOnCount");
    var alertsOffEl = $("cppAlertsOffCount");
    if (onlineEl) onlineEl.textContent = String(sum.online_now != null ? sum.online_now : "-");
    if (dayEl) dayEl.textContent = String(sum.sign_ins_today != null ? sum.sign_ins_today : "-");
    if (activeEl) activeEl.textContent = String(sum.active_last_24h != null ? sum.active_last_24h : "-");
    if (alertsOnEl) alertsOnEl.textContent = String(sum.alerts_on != null ? sum.alerts_on : "-");
    if (alertsOffEl) alertsOffEl.textContent = String(sum.alerts_off != null ? sum.alerts_off : "-");

    var online = (data && data.online) || [];
    var recent = (data && data.recent) || [];
    var activity = (data && data.activity) || [];
    var actions = (data && data.actions) || [];
    var alerts = (data && data.alerts) || {};
    var alertsOn = alerts.on || [];
    var alertsOff = alerts.off || [];

    var onHead = $("cppAlertsOnHeading");
    var offHead = $("cppAlertsOffHeading");
    if (onHead) onHead.textContent = "Alerts on (" + alertsOn.length + ")";
    if (offHead) offHead.textContent = "Alerts off (" + alertsOff.length + ")";

    var onHost = $("cppAlertsOnList");
    if (onHost) {
      onHost.innerHTML = alertsOn.length
        ? alertsOn
            .map(function (p) {
              return alertParentRowHtml(p, "online");
            })
            .join("")
        : '<li class="cpp-empty">Nobody has turned on Family alerts yet.</li>';
    }
    var offHost = $("cppAlertsOffList");
    if (offHost) {
      offHost.innerHTML = alertsOff.length
        ? alertsOff
            .map(function (p) {
              return alertParentRowHtml(p, "recent");
            })
            .join("")
        : '<li class="cpp-empty">All linked parents have alerts on.</li>';
    }
    var onlineHost = $("cppOnlineList");
    if (onlineHost) {
      onlineHost.innerHTML = online.length
        ? online
            .map(function (p) {
              return parentRowHtml(p, "online");
            })
            .join("")
        : '<li class="cpp-empty">Nobody active in the last ' +
          esc(String((data && data.online_window_minutes) || 5)) +
          " minutes.</li>";
    }

    var recentHost = $("cppRecentList");
    if (recentHost) {
      recentHost.innerHTML = recent.length
        ? recent
            .map(function (p) {
              return parentRowHtml(p, "recent");
            })
            .join("")
        : '<li class="cpp-empty">No other sessions in the last 24 hours.</li>';
    }

    var actHost = $("cppActivityList");
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
                esc(a.parent_name) +
                "</strong>" +
                (a.child_name ? "  - " + esc(a.child_name) : "") +
                '<div class="cpp-feed__what">' +
                esc(a.event_label) +
                (a.detail ? " - " + esc(a.detail) : "") +
                "</div></div></li>"
              );
            })
            .join("")
        : '<li class="cpp-empty">No hub surface pings yet - parents need to open a child hub after this deploy.</li>';
    }

    var actionHost = $("cppActionsList");
    if (actionHost) {
      actionHost.innerHTML = actions.length
        ? actions
            .map(function (a) {
              return (
                '<li class="cpp-feed">' +
                '<span class="cpp-feed__when">' +
                esc(ago(a.at)) +
                "</span>" +
                "<div><strong>" +
                esc(a.label) +
                "</strong>" +
                (a.detail
                  ? '<div class="cpp-feed__what">' + esc(a.detail) + "</div>"
                  : "") +
                "</div></li>"
              );
            })
            .join("")
        : '<li class="cpp-empty">No absences, portal messages, or paid invoices in the last 24 hours.</li>';
    }

    renderPlaces(data);

    var stamp = $("cppStamp");
    if (stamp) {
      stamp.textContent =
        data && data.generated_at ? "Updated " + ago(data.generated_at) : "";
    }
  }

  async function load() {
    var status = $("cppStatus");
    var token = await authToken();
    if (!token) {
      if (status) status.textContent = "Sign in required.";
      return;
    }
    if (status) status.textContent = "Refreshing...";
    try {
      var res = await fetch(baseUrl() + "/functions/v1/portal-ceo-parent-portal-presence", {
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
    void load();
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      void load();
    }, POLL_MS);
    var btn = $("cppRefresh");
    if (btn && !btn.getAttribute("data-bound")) {
      btn.setAttribute("data-bound", "1");
      btn.addEventListener("click", function () {
        void load();
      });
    }
  }

  global.PortalCeoParentPresence = {
    configure: configure,
    start: start,
    load: load,
  };
})(typeof window !== "undefined" ? window : globalThis);
