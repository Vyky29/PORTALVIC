/**
 * CEO — Family portal presence (who's signed in + what they're opening).
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
    if (!iso) return "—";
    var t = new Date(iso).getTime();
    if (!t) return "—";
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

  function parentRowHtml(p, tone) {
    var kids = Array.isArray(p.children) ? p.children.join(", ") : "";
    var focus = p.child_focus ? " · looking at " + p.child_focus : "";
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
      esc(focus) +
      "</span>" +
      "</div>" +
      '<div class="cpp-row__side">' +
      '<span class="cpp-pill">' +
      esc(p.last_surface_label || "Signed in") +
      "</span>" +
      '<span class="cpp-row__ago">' +
      esc(ago(p.last_used_at)) +
      "</span>" +
      "</div></li>"
    );
  }

  function render(data) {
    var sum = (data && data.summary) || {};
    var onlineEl = $("cppOnlineCount");
    var dayEl = $("cppDayCount");
    var activeEl = $("cppActiveCount");
    if (onlineEl) onlineEl.textContent = String(sum.online_now != null ? sum.online_now : "—");
    if (dayEl) dayEl.textContent = String(sum.sign_ins_today != null ? sum.sign_ins_today : "—");
    if (activeEl) activeEl.textContent = String(sum.active_last_24h != null ? sum.active_last_24h : "—");

    var online = (data && data.online) || [];
    var recent = (data && data.recent) || [];
    var activity = (data && data.activity) || [];
    var actions = (data && data.actions) || [];

    var onlineHost = $("cppOnlineList");
    if (onlineHost) {
      onlineHost.innerHTML = online.length
        ? online.map(function (p) {
            return parentRowHtml(p, "online");
          }).join("")
        : '<li class="cpp-empty">Nobody active in the last ' +
          esc(String((data && data.online_window_minutes) || 5)) +
          " minutes.</li>";
    }

    var recentHost = $("cppRecentList");
    if (recentHost) {
      recentHost.innerHTML = recent.length
        ? recent.map(function (p) {
            return parentRowHtml(p, "recent");
          }).join("")
        : '<li class="cpp-empty">No other sessions in the last 24 hours.</li>";
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
                (a.child_name ? " · " + esc(a.child_name) : "") +
                '<div class="cpp-feed__what">' +
                esc(a.event_label) +
                (a.detail ? " — " + esc(a.detail) : "") +
                "</div></div></li>"
              );
            })
            .join("")
        : '<li class="cpp-empty">No hub surface pings yet — parents need to open a child hub after this deploy.</li>';
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
        : '<li class="cpp-empty">No absences or portal messages in the last 24 hours.</li>';
    }

    var stamp = $("cppStamp");
    if (stamp) {
      stamp.textContent = data && data.generated_at
        ? "Updated " + ago(data.generated_at)
        : "";
    }
  }

  async function load() {
    var status = $("cppStatus");
    var token = await authToken();
    if (!token) {
      if (status) status.textContent = "Sign in required.";
      return;
    }
    if (status) status.textContent = "Refreshing…";
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
            "Could not load presence (" + esc(body.error || res.status) + ").";
        }
        return;
      }
      render(body);
      if (status) status.textContent = "Live — refreshes every 30s.";
    } catch (_e) {
      if (status) status.textContent = "Network error — retrying…";
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
