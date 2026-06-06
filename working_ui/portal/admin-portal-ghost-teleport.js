/**
 * Admin dashboard teleport — open worker dashboards in read-only ghost view.
 */
(function (global) {
  "use strict";

  var POLL_MS = 45000;
  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
    toast: function (_msg, _type) {},
  };

  var state = {
    rows: [],
    onlineByUserId: Object.create(null),
    visitByUserId: Object.create(null),
    loading: false,
    pollTimer: null,
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function supabaseBase() {
    return String(cfg.getSupabaseUrl() || "").replace(/\/$/, "");
  }

  async function authToken() {
    var client = cfg.getClient();
    if (!client || !client.auth) return null;
    var sessResp = await client.auth.getSession();
    var session = sessResp && sessResp.data && sessResp.data.session;
    return session && session.access_token ? session.access_token : null;
  }

  function londonTodayIso() {
    try {
      var parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      var y = parts.find(function (p) {
        return p.type === "year";
      });
      var m = parts.find(function (p) {
        return p.type === "month";
      });
      var d = parts.find(function (p) {
        return p.type === "day";
      });
      if (y && m && d) return y.value + "-" + m.value + "-" + d.value;
    } catch (_e) {}
    return new Date().toISOString().slice(0, 10);
  }

  function formatAgo(iso) {
    if (!iso) return "";
    var ms = Date.now() - new Date(iso).getTime();
    if (ms < 60000) return Math.round(ms / 1000) + "s ago";
    if (ms < 3600000) return Math.round(ms / 60000) + "m ago";
    return Math.round(ms / 3600000) + "h ago";
  }

  function dashboardHref(surface) {
    return surface === "lead" ? "lead_dashboard.html" : "staff_dashboard.html";
  }

  function setStatus(html, isError) {
    var el = document.getElementById("portalGhostTeleportStatus");
    if (!el) return;
    el.className = "portal-forms-status" + (isError ? " is-error" : "");
    el.innerHTML = html || "";
  }

  async function fetchOnlineMap(client) {
    state.onlineByUserId = Object.create(null);
    var rpc = await client.rpc("portal_admin_fetch_online_staff", { p_visit_stale_seconds: 90 });
    if (!rpc.error && Array.isArray(rpc.data)) {
      rpc.data.forEach(function (row) {
        if (row && row.staff_user_id) {
          state.onlineByUserId[row.staff_user_id] = row.at || null;
        }
      });
    }
  }

  async function fetchVisitSessions(client) {
    state.visitByUserId = Object.create(null);
    var day = londonTodayIso();
    var stale = new Date(Date.now() - 90 * 1000).toISOString();
    var res = await client
      .from("portal_staff_visit_sessions")
      .select("staff_user_id, last_seen_at, last_page_label, staff_surface, still_open")
      .eq("session_date", day)
      .eq("still_open", true)
      .gte("last_seen_at", stale)
      .order("last_seen_at", { ascending: false });
    if (res.error) return;
    (res.data || []).forEach(function (row) {
      if (!row || !row.staff_user_id || state.visitByUserId[row.staff_user_id]) return;
      state.visitByUserId[row.staff_user_id] = row;
    });
  }

  function surfaceForProfile(p) {
    var route = String((p && p.dashboard_route) || "").toLowerCase();
    if (route.indexOf("lead") >= 0) return "lead";
    return "staff";
  }

  function renderList() {
    var host = document.getElementById("portalGhostTeleportList");
    var count = document.getElementById("portalGhostTeleportCount");
    if (!host) return;

    var rows = state.rows || [];
    if (count) {
      count.textContent = rows.length ? rows.length + " staff" : "No staff found";
    }
    if (!rows.length) {
      host.innerHTML = '<p class="muted">No active staff profiles.</p>';
      return;
    }

    host.innerHTML =
      '<div class="portal-ghost-teleport-list">' +
      rows
        .map(function (p) {
          var id = p.id;
          var name = p.full_name || p.username || "Staff";
          var surface = surfaceForProfile(p);
          var onlineAt = state.onlineByUserId[id];
          var visit = state.visitByUserId[id];
          var isOnline = !!(onlineAt || visit);
          var page = visit && visit.last_page_label ? visit.last_page_label : "";
          var meta = isOnline
            ? "Online" + (page ? " · " + page : "") + (visit && visit.last_seen_at ? " · " + formatAgo(visit.last_seen_at) : "")
            : "Offline";
          var badgeCls = isOnline ? "is-online" : "is-offline";
          return (
            '<div class="portal-ghost-teleport-row" data-staff-id="' +
            esc(id) +
            '">' +
            '<div class="portal-ghost-teleport-row__main">' +
            '<div class="portal-ghost-teleport-row__name">' +
            esc(name) +
            "</div>" +
            '<div class="portal-ghost-teleport-row__meta muted">' +
            esc(p.username || "") +
            (p.staff_role ? " · " + esc(p.staff_role) : "") +
            "</div>" +
            '<span class="portal-ghost-teleport-row__badge ' +
            badgeCls +
            '">' +
            esc(meta) +
            "</span>" +
            "</div>" +
            '<div class="portal-ghost-teleport-row__actions">' +
            '<button type="button" class="btn btn--sec btn--sm" data-ghost-open="' +
            esc(id) +
            '" data-ghost-surface="' +
            esc(surface) +
            '">View dashboard</button>' +
            "</div></div>"
          );
        })
        .join("") +
      "</div>";

    host.querySelectorAll("[data-ghost-open]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var staffId = btn.getAttribute("data-ghost-open");
        var surface = btn.getAttribute("data-ghost-surface") || "staff";
        void openGhostDashboard(staffId, surface, btn);
      });
    });
  }

  async function openGhostDashboard(targetStaffUserId, surface, btn) {
    var token = await authToken();
    if (!token) {
      cfg.toast("Sign in required.", "error");
      return;
    }
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(supabaseBase() + "/functions/v1/portal-admin-ghost-start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          apikey: cfg.getAnonKey(),
        },
        body: JSON.stringify({
          targetStaffUserId: targetStaffUserId,
          surface: surface,
        }),
      });
      var j = null;
      try {
        j = await res.json();
      } catch (_e) {
        j = null;
      }
      if (!res.ok || !j || !j.ok || !j.ghostToken) {
        cfg.toast("Could not start ghost view.", "error");
        return;
      }
      var href =
        dashboardHref(surface) +
        "?ghostToken=" +
        encodeURIComponent(j.ghostToken);
      global.open(href, "_blank", "noopener,noreferrer");
      cfg.toast("Ghost view opened in new tab.", "ok");
    } catch (err) {
      cfg.toast("Ghost view failed.", "error");
      console.warn("[ghost-teleport]", err);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function refresh(opts) {
    var quiet = opts && opts.quiet;
    var client = cfg.getClient();
    if (!client) {
      setStatus("<strong>Sign in required.</strong>", true);
      return;
    }
    if (!quiet) setStatus("<strong>Loading…</strong>");
    state.loading = true;

    var q = await client
      .from("staff_profiles")
      .select("id, full_name, username, staff_role, dashboard_route, app_role, is_active")
      .or("is_active.is.null,is_active.eq.true")
      .order("full_name", { ascending: true })
      .limit(200);

    if (q.error) {
      state.loading = false;
      setStatus("<strong>Error</strong> " + esc(q.error.message || String(q.error)), true);
      state.rows = [];
      renderList();
      return;
    }

    state.rows = (q.data || []).filter(function (p) {
      var app = String(p.app_role || "").toLowerCase();
      return app !== "admin" && app !== "ceo";
    });

    await Promise.all([fetchOnlineMap(client), fetchVisitSessions(client)]);

    state.loading = false;
    setStatus("");
    renderList();
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(function () {
      void refresh({ quiet: true });
    }, POLL_MS);
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function bindModule() {
    var root = document.getElementById("portalGhostTeleportRoot");
    if (!root || root.getAttribute("data-bound") === "1") return;
    root.setAttribute("data-bound", "1");

    var btn = document.getElementById("portalGhostTeleportRefresh");
    if (btn) {
      btn.addEventListener("click", function () {
        void refresh();
      });
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        stopPolling();
        return;
      }
      startPolling();
      void refresh({ quiet: true });
    });

    startPolling();
    void refresh();
  }

  function destroyModule() {
    stopPolling();
  }

  function viewHtml() {
    return (
      '<div id="portalGhostTeleportRoot" class="portal-day-ops-embed">' +
      '<div class="portal-staff-map-header">' +
      '<div class="portal-staff-map-title-row">' +
      '<h1 class="page-title">Dashboard teleport</h1>' +
      '<div class="portal-staff-map-toolbar">' +
      '<button type="button" class="btn btn--sec btn--sm" id="portalGhostTeleportRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="staff_live_map">Staff live map</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="portal_activity">Portal activity</button>' +
      "</div></div>" +
      '<p class="page-intro">Open a worker dashboard in <strong>read-only ghost view</strong> — same roster and TODAY data, without their PIN and without logging them out. Online status and current page come from visit sessions.</p>' +
      "</div>" +
      '<div id="portalGhostTeleportStatus" class="portal-forms-status" role="status"></div>' +
      '<p class="muted" id="portalGhostTeleportCount">Loading…</p>' +
      '<div id="portalGhostTeleportList"></div>' +
      "</div>"
    );
  }

  global.PortalGhostTeleport = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    destroyModule: destroyModule,
    refresh: refresh,
    openForUserId: openGhostDashboard,
  };
})(typeof window !== "undefined" ? window : globalThis);
