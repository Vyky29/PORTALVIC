/**
 * Admin — Staff push devices: who has Web Push registered (background alerts).
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
    getClient: function () {
      return null;
    },
  };

  var state = {
    rows: [],
    deviceRows: [],
    loading: false,
    filter: "all",
    tab: "by_staff",
  };

  function esc(s) {
    return cfg.esc(s);
  }

  function formatLondon(iso) {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso));
    } catch (_) {
      return String(iso);
    }
  }

  function formatAgo(iso) {
    if (!iso) return "";
    var ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "just now";
    if (ms < 60000) return Math.round(ms / 1000) + "s ago";
    if (ms < 3600000) return Math.round(ms / 60000) + "m ago";
    if (ms < 86400000) return Math.round(ms / 3600000) + "h ago";
    return Math.round(ms / 86400000) + "d ago";
  }

  function endpointPlatform(endpoint) {
    var e = String(endpoint || "").toLowerCase();
    if (e.indexOf("web.push.apple.com") >= 0) return "Apple Safari";
    if (e.indexOf("fcm.googleapis.com") >= 0) return "Android / Chrome";
    if (e.indexOf("notify.windows.com") >= 0) return "Windows";
    if (e.indexOf("mozilla") >= 0) return "Firefox";
    return "Browser";
  }

  function endpointShort(endpoint) {
    var e = String(endpoint || "").trim();
    if (!e) return "—";
    if (e.length <= 48) return e;
    return e.slice(0, 22) + "…" + e.slice(-18);
  }

  function statusBadge(kind, label) {
    var cls =
      kind === "ok"
        ? "chip--ok"
        : kind === "warn"
          ? "chip--pend"
          : kind === "bad"
            ? "portal-sready-chip--bad"
            : "chip--info";
    return '<span class="chip ' + cls + ' portal-sready-badge">' + esc(label) + "</span>";
  }

  function setStatus(html, isError) {
    var el = document.getElementById("portalPushDevicesStatus");
    if (!el) return;
    el.innerHTML = html || "";
    el.classList.toggle("is-error", !!isError);
  }

  function mergeRows(profiles, subs, setupRows) {
    var subsByUser = Object.create(null);
    (subs || []).forEach(function (sub) {
      if (!sub || !sub.user_id) return;
      if (!subsByUser[sub.user_id]) subsByUser[sub.user_id] = [];
      subsByUser[sub.user_id].push(sub);
    });

    var setupByUser = Object.create(null);
    (setupRows || []).forEach(function (s) {
      if (!s || !s.staff_user_id) return;
      setupByUser[s.staff_user_id] = s;
    });

    var deviceRows = [];
    (subs || []).forEach(function (sub) {
      var prof = (profiles || []).find(function (p) {
        return p && p.id === sub.user_id;
      });
      deviceRows.push({
        userId: sub.user_id,
        name: prof
          ? String(prof.full_name || prof.username || "Staff").trim()
          : "Unknown",
        username: prof ? String(prof.username || "").trim() : "",
        appRole: prof ? String(prof.app_role || "").trim() : "",
        platform: endpointPlatform(sub.endpoint),
        endpoint: String(sub.endpoint || ""),
        updatedAt: sub.updated_at || sub.created_at || null,
      });
    });
    deviceRows.sort(function (a, b) {
      var ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      var tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });

    var rows = (profiles || []).map(function (p) {
      var devices = subsByUser[p.id] || [];
      devices.sort(function (a, b) {
        var ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        var tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return tb - ta;
      });
      var setup = setupByUser[p.id] || null;
      var browserAllowed = !!(setup && setup.push_enabled);
      var hasPush = devices.length > 0;
      var latest = devices[0] || null;
      var platforms = devices.map(function (d) {
        return endpointPlatform(d.endpoint);
      });
      var uniquePlatforms = platforms.filter(function (pl, i) {
        return platforms.indexOf(pl) === i;
      });
      return {
        id: p.id,
        name: String(p.full_name || p.username || "Staff").trim(),
        username: String(p.username || "").trim(),
        appRole: String(p.app_role || "").trim(),
        staffRole: String(p.staff_role || "").trim(),
        devices: devices,
        deviceCount: devices.length,
        hasPush: hasPush,
        browserAllowed: browserAllowed,
        mismatch: browserAllowed && !hasPush,
        latestAt: latest ? latest.updated_at || latest.created_at : null,
        platforms: uniquePlatforms,
        setupSeenAt: setup ? setup.last_seen_at : null,
      };
    });

    rows.sort(function (a, b) {
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });

    return { rows: rows, deviceRows: deviceRows };
  }

  function filterStaffRows(rows) {
    var f = state.filter;
    if (f === "has_push") return rows.filter(function (r) {
      return r.hasPush;
    });
    if (f === "no_push") return rows.filter(function (r) {
      return !r.hasPush;
    });
    if (f === "mismatch") return rows.filter(function (r) {
      return r.mismatch;
    });
    if (f === "browser_off") return rows.filter(function (r) {
      return !r.browserAllowed;
    });
    return rows;
  }

  function renderKpis(rows) {
    var el = document.getElementById("portalPushDevicesKpis");
    if (!el) return;
    var total = rows.length;
    var withPush = rows.filter(function (r) {
      return r.hasPush;
    }).length;
    var devices = rows.reduce(function (n, r) {
      return n + r.deviceCount;
    }, 0);
    var missing = total - withPush;
    var mismatch = rows.filter(function (r) {
      return r.mismatch;
    }).length;
    el.innerHTML =
      '<div class="grid-kpi portal-sready-kpis">' +
      '<div class="kpi card--premium portal-sready-kpi portal-sready-kpi--ok">' +
      '<div class="kpi-l">Workers with push</div>' +
      '<div class="kpi-v">' +
      esc(String(withPush)) +
      " / " +
      esc(String(total)) +
      "</div>" +
      '<div class="kpi-s muted">Registered for background alerts</div></div>' +
      '<div class="kpi card--premium portal-sready-kpi">' +
      '<div class="kpi-l">Devices registered</div>' +
      '<div class="kpi-v">' +
      esc(String(devices)) +
      "</div>" +
      '<div class="kpi-s muted">Rows in portal_push_subscriptions</div></div>' +
      '<div class="kpi card--premium portal-sready-kpi' +
      (missing ? " kpi--alert" : "") +
      '">' +
      '<div class="kpi-l">No push yet</div>' +
      '<div class="kpi-v">' +
      esc(String(missing)) +
      "</div>" +
      '<div class="kpi-s muted">Cannot receive alerts with app closed</div></div>' +
      '<div class="kpi card--premium portal-sready-kpi' +
      (mismatch ? " kpi--alert" : "") +
      '">' +
      '<div class="kpi-l">Allowed but not registered</div>' +
      '<div class="kpi-v">' +
      esc(String(mismatch)) +
      "</div>" +
      '<div class="kpi-s muted">Browser said Allow — push row missing</div></div>' +
      "</div>";
  }

  function devicesDetailHtml(row) {
    if (!row.devices || !row.devices.length) {
      return '<span class="muted">No device registered</span>';
    }
    return (
      '<ul class="portal-sready-missing-list portal-push-devices-list">' +
      row.devices
        .map(function (d) {
          var at = d.updated_at || d.created_at;
          return (
            "<li><strong>" +
            esc(endpointPlatform(d.endpoint)) +
            "</strong> · " +
            esc(formatLondon(at)) +
            ' <span class="muted">(' +
            esc(formatAgo(at)) +
            ")</span></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderStaffTable(rows) {
    var list = filterStaffRows(rows);
    if (!list.length) {
      return '<p class="portal-activity-empty">No workers match this filter.</p>';
    }
    var body = list
      .map(function (row) {
        var pushBadge = row.hasPush
          ? statusBadge("ok", "Yes")
          : statusBadge("bad", "No");
        var browserBadge = row.browserAllowed
          ? statusBadge("ok", "Allowed")
          : statusBadge("bad", "Blocked / off");
        var deliveryBadge = row.hasPush
          ? statusBadge("ok", "Can receive")
          : row.browserAllowed
            ? statusBadge("warn", "Fix needed")
            : statusBadge("bad", "Cannot receive");
        return (
          '<tr class="' +
          (row.hasPush ? "" : "portal-sready-row--app") +
          '">' +
          '<td class="portal-tprog-name"><strong>' +
          esc(row.name) +
          "</strong>" +
          (row.username
            ? '<span class="muted portal-sready-subdate">' + esc(row.username) + "</span>"
            : "") +
          "</td>" +
          "<td>" +
          pushBadge +
          "</td>" +
          "<td>" +
          esc(String(row.deviceCount)) +
          "</td>" +
          "<td>" +
          browserBadge +
          "</td>" +
          "<td>" +
          deliveryBadge +
          "</td>" +
          '<td class="portal-sready-cell">' +
          devicesDetailHtml(row) +
          "</td>" +
          '<td class="muted portal-tprog-seen">' +
          esc(formatLondon(row.latestAt)) +
          "</td>" +
          '<td class="muted portal-tprog-seen">' +
          esc(formatLondon(row.setupSeenAt)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="portal-tprog-scroll">' +
      '<table class="tbl portal-tprog-table portal-sready-table">' +
      "<thead><tr>" +
      "<th>Worker</th>" +
      "<th>Push registered</th>" +
      "<th>Devices</th>" +
      "<th>Browser permission</th>" +
      "<th>Background alerts</th>" +
      "<th>Registered devices</th>" +
      "<th>Last push update</th>" +
      "<th>Last portal open</th>" +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>"
    );
  }

  function renderDevicesTable(deviceRows) {
    if (!deviceRows.length) {
      return '<p class="portal-activity-empty">No push subscriptions registered yet.</p>';
    }
    var body = deviceRows
      .map(function (row) {
        return (
          "<tr>" +
          '<td class="portal-tprog-name"><strong>' +
          esc(row.name) +
          "</strong></td>" +
          "<td>" +
          esc(row.platform) +
          "</td>" +
          '<td class="muted portal-push-endpoint" title="' +
          esc(row.endpoint) +
          '">' +
          esc(endpointShort(row.endpoint)) +
          "</td>" +
          '<td class="muted portal-tprog-seen">' +
          esc(formatLondon(row.updatedAt)) +
          ' <span class="muted">(' +
          esc(formatAgo(row.updatedAt)) +
          ")</span></td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="portal-tprog-scroll">' +
      '<table class="tbl portal-tprog-table portal-sready-table">' +
      "<thead><tr>" +
      "<th>Worker</th>" +
      "<th>Platform</th>" +
      "<th>Endpoint</th>" +
      "<th>Last updated</th>" +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>"
    );
  }

  function syncTabsUi() {
    var root = document.getElementById("portalPushDevicesRoot");
    if (!root) return;
    root.querySelectorAll("[data-portal-push-tab]").forEach(function (btn) {
      var on = btn.getAttribute("data-portal-push-tab") === state.tab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function renderTable(rows, deviceRows) {
    var wrap = document.getElementById("portalPushDevicesTableWrap");
    var count = document.getElementById("portalPushDevicesCount");
    if (!wrap) return;
    renderKpis(rows);
    if (count) {
      if (state.tab === "all_devices") {
        count.textContent = deviceRows.length + " device" + (deviceRows.length === 1 ? "" : "s");
      } else {
        var shown = filterStaffRows(rows).length;
        count.textContent =
          shown + " worker" + (shown === 1 ? "" : "s") + " · " + rows.length + " active staff/leads";
      }
    }
    if (state.tab === "all_devices") {
      wrap.innerHTML = renderDevicesTable(deviceRows);
      return;
    }
    wrap.innerHTML = renderStaffTable(rows);
  }

  async function refresh() {
    var client = cfg.getClient();
    if (!client) {
      setStatus("<strong>Supabase not ready.</strong>", true);
      return;
    }

    var btn = document.getElementById("portalPushDevicesRefresh");
    if (btn) btn.disabled = true;
    state.loading = true;
    setStatus("<strong>Loading…</strong>");

    var profilesRes = await client
      .from("staff_profiles")
      .select("id, full_name, username, app_role, staff_role")
      .eq("is_active", true)
      .in("app_role", ["staff", "lead"])
      .order("full_name", { ascending: true });

    var subsRes = await client
      .from("portal_push_subscriptions")
      .select("user_id, endpoint, updated_at, created_at")
      .order("updated_at", { ascending: false });

    var setupRes = await client
      .from("portal_staff_setup_status")
      .select("staff_user_id, push_enabled, last_seen_at");

    state.loading = false;
    if (btn) btn.disabled = false;

    var err =
      (profilesRes.error && profilesRes.error.message) ||
      (subsRes.error && subsRes.error.message) ||
      (setupRes.error && setupRes.error.message);

    if (err) {
      if (/permission|policy|row-level/i.test(err)) {
        setStatus(
          "<strong>Database policy missing.</strong> Run migration <code>20260619130000_portal_push_subscriptions_admin_select.sql</code> on Portal Supabase.",
          true
        );
      } else {
        setStatus("<strong>Error</strong> " + esc(err), true);
      }
      state.rows = [];
      state.deviceRows = [];
      renderTable([], []);
      return;
    }

    var merged = mergeRows(profilesRes.data, subsRes.data, setupRes.data);
    state.rows = merged.rows;
    state.deviceRows = merged.deviceRows;
    setStatus("");
    renderTable(state.rows, state.deviceRows);
  }

  function bindModule() {
    var root = document.getElementById("portalPushDevicesRoot");
    if (!root || root.getAttribute("data-portal-push-bound") === "1") return;
    root.setAttribute("data-portal-push-bound", "1");

    var refreshBtn = document.getElementById("portalPushDevicesRefresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        void refresh();
      });
    }

    var filterSel = document.getElementById("portalPushDevicesFilter");
    if (filterSel) {
      filterSel.addEventListener("change", function () {
        state.filter = filterSel.value || "all";
        renderTable(state.rows, state.deviceRows);
      });
    }

    root.addEventListener("click", function (ev) {
      var tabBtn = ev.target.closest ? ev.target.closest("[data-portal-push-tab]") : null;
      if (!tabBtn || !root.contains(tabBtn)) return;
      state.tab = tabBtn.getAttribute("data-portal-push-tab") || "by_staff";
      syncTabsUi();
      renderTable(state.rows, state.deviceRows);
    });

    syncTabsUi();
    void refresh();
  }

  function viewHtml() {
    return (
      '<div id="portalPushDevicesRoot" class="portal-activity-embed portal-day-ops-embed portal-tprog-embed portal-sready-embed portal-push-devices-embed" data-portal-push-bound="0">' +
      '<h1 class="page-title">Staff push devices</h1>' +
      '<p class="page-desc">Who can receive background alerts when the portal is closed</p>' +
      '<p class="page-intro portal-activity-intro">Live from <code>portal_push_subscriptions</code> — one row per phone/browser that completed Web Push registration. This is stronger than the browser &ldquo;Allow&rdquo; flag in <button type="button" class="btn btn--ghost btn--sm" data-view-target="portal_training_progress">Staff readiness</button>: a worker can tap Allow and still fail to register until they open the portal again.</p>' +
      '<div id="portalPushDevicesKpis" class="portal-sready-kpis-wrap" aria-live="polite"></div>' +
      '<div id="portalPushDevicesStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-activity-toolbar">' +
      '<label class="portal-activity-toolbar__day"><span class="muted">Show</span> ' +
      '<select class="inp" id="portalPushDevicesFilter">' +
      '<option value="all">All workers</option>' +
      '<option value="has_push">Has push registered</option>' +
      '<option value="no_push">No push yet</option>' +
      '<option value="mismatch">Allowed but not registered</option>' +
      '<option value="browser_off">Browser permission off</option>' +
      "</select></label>" +
      '<button type="button" class="btn btn--sec btn--sm" id="portalPushDevicesRefresh">Refresh</button>' +
      "</div>" +
      '<div class="ash-tabs portal-sready-tabs" role="tablist" aria-label="Push device views">' +
      '<button type="button" class="ash-tab is-active" role="tab" data-portal-push-tab="by_staff" aria-selected="true">By worker</button>' +
      '<button type="button" class="ash-tab" role="tab" data-portal-push-tab="all_devices" aria-selected="false">All devices</button>' +
      "</div>" +
      '<p class="portal-activity-count" id="portalPushDevicesCount">Loading…</p>' +
      '<div id="portalPushDevicesTableWrap" aria-live="polite"></div>' +
      "</div>"
    );
  }

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  global.PortalPushDevices = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
