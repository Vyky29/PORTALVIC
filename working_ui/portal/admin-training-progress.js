/**
 * Admin — staff training progress (induction modules, swimming tracks) + app readiness.
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
    loading: false,
    filter: "all",
  };

  var INDUCTION_MODULES = 6;

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function formatLondon(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return String(iso);
    }
  }

  function yesNoChip(on, labelOn, labelOff) {
    if (on) {
      return (
        '<span class="chip chip--ok portal-tprog-chip" title="' +
        esc(labelOn || "Yes") +
        '">✓</span>'
      );
    }
    return (
      '<span class="chip chip--pend portal-tprog-chip" title="' +
      esc(labelOff || "No") +
      '">—</span>'
    );
  }

  function moduleChip(n, mod) {
    var done = mod && mod.quizPass;
    var partial = mod && (mod.video || mod.journey) && !done;
    var cls = done ? "chip--ok" : partial ? "chip--info" : "chip--pend";
    var title = (mod && mod.label) || (done ? "Done" : partial ? "In progress" : "Not started");
    var inner = done ? "✓" : String(n);
    return (
      '<span class="chip ' +
      cls +
      ' portal-tprog-mod" title="Module ' +
      n +
      ": " +
      esc(title) +
      '">' +
      inner +
      "</span>"
    );
  }

  function trackCell(row, track) {
    var p = row.tracks[track];
    if (!p) {
      return '<span class="muted portal-tprog-phase">No data yet</span>';
    }
    var phase = esc(p.phase_label || "—");
    var pct = Number(p.progress_pct);
    if (!Number.isFinite(pct)) pct = 0;
    var pctHtml =
      pct > 0 && pct < 100
        ? ' <span class="chip chip--info portal-tprog-pct">' + pct + "%</span>"
        : pct >= 100
          ? ' <span class="chip chip--ok portal-tprog-pct">100%</span>'
          : "";
    return (
      '<div class="portal-tprog-track-cell">' +
      '<span class="portal-tprog-phase">' +
      phase +
      "</span>" +
      pctHtml +
      "</div>"
    );
  }

  function inductionCell(row) {
    var p = row.tracks.induction;
    if (!p) {
      return '<span class="muted">No sync yet</span>';
    }
    var mods = p.module_states || {};
    var chips = "";
    for (var i = 1; i <= INDUCTION_MODULES; i++) {
      chips += moduleChip(i, mods[String(i)]);
    }
    return (
      '<div class="portal-tprog-induction">' +
      '<div class="portal-tprog-mod-row">' +
      chips +
      "</div>" +
      trackCell(row, "induction") +
      "</div>"
    );
  }

  function shellBadge(row) {
    var s = row.setup;
    if (!s || !s.last_seen_at) {
      return '<span class="chip chip--pend">Unknown</span>';
    }
    if (s.is_pwa) {
      return '<span class="chip chip--ok" title="Installed app (PWA)">App</span>';
    }
    return '<span class="chip chip--info" title="Browser only">Web</span>';
  }

  function rowNeedsAttention(row) {
    var ind = row.tracks.induction;
    if (ind && Number(ind.progress_pct) < 100 && !/grandfathered/i.test(ind.phase_label || "")) {
      return true;
    }
    var s = row.setup;
    if (!s || !s.last_seen_at) return true;
    if (!s.is_pwa) return true;
    if (!s.push_enabled || !s.location_granted || !s.microphone_granted) return true;
    return false;
  }

  function mergeRows(profiles, progressRows, setupRows) {
    var byUser = {};
    (profiles || []).forEach(function (p) {
      byUser[p.id] = {
        id: p.id,
        name: String(p.full_name || p.username || "Staff").trim(),
        tracks: {},
        setup: null,
      };
    });
    (progressRows || []).forEach(function (r) {
      if (!byUser[r.staff_user_id]) {
        byUser[r.staff_user_id] = {
          id: r.staff_user_id,
          name: String(r.staff_display_name || "Staff").trim(),
          tracks: {},
          setup: null,
        };
      }
      byUser[r.staff_user_id].tracks[r.track] = r;
    });
    (setupRows || []).forEach(function (s) {
      if (!byUser[s.staff_user_id]) {
        byUser[s.staff_user_id] = {
          id: s.staff_user_id,
          name: String(s.staff_display_name || "Staff").trim(),
          tracks: {},
          setup: null,
        };
      }
      byUser[s.staff_user_id].setup = s;
      if (!byUser[s.staff_user_id].name && s.staff_display_name) {
        byUser[s.staff_user_id].name = String(s.staff_display_name).trim();
      }
    });
    return Object.keys(byUser)
      .map(function (k) {
        return byUser[k];
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name, "en");
      });
  }

  function filterRows(rows) {
    var f = state.filter;
    if (f === "all") return rows;
    if (f === "attention") return rows.filter(rowNeedsAttention);
    if (f === "induction_incomplete") {
      return rows.filter(function (r) {
        var ind = r.tracks.induction;
        return !ind || (Number(ind.progress_pct) < 100 && !/grandfathered/i.test(ind.phase_label || ""));
      });
    }
    if (f === "browser_only") {
      return rows.filter(function (r) {
        return !r.setup || !r.setup.is_pwa;
      });
    }
    if (f === "missing_setup") {
      return rows.filter(function (r) {
        var s = r.setup;
        return !s || !s.push_enabled || !s.location_granted || !s.microphone_granted;
      });
    }
    return rows;
  }

  function renderTable(rows) {
    var list = document.getElementById("portalTrainingProgressTableWrap");
    var count = document.getElementById("portalTrainingProgressCount");
    if (!list) return;

    var filtered = filterRows(rows);
    if (count) {
      count.textContent =
        filtered.length +
        " staff" +
        (filtered.length === 1 ? "" : "") +
        (state.filter !== "all" ? " (filtered)" : "") +
        " · data updates when staff open the portal on their device";
    }

    if (!filtered.length) {
      list.innerHTML =
        '<p class="portal-activity-empty">No rows match this filter. Staff appear after they sign in on the app or web.</p>';
      return;
    }

    var body = filtered
      .map(function (row) {
        var s = row.setup || {};
        return (
          "<tr>" +
          '<td class="portal-tprog-name"><strong>' +
          esc(row.name) +
          "</strong></td>" +
          '<td class="portal-tprog-ind-cell">' +
          inductionCell(row) +
          "</td>" +
          "<td>" +
          trackCell(row, "swimming_training") +
          "</td>" +
          "<td>" +
          trackCell(row, "swimming_term_review") +
          "</td>" +
          "<td>" +
          shellBadge(row) +
          "</td>" +
          "<td>" +
          yesNoChip(s.push_enabled, "Alerts on", "Alerts off") +
          "</td>" +
          "<td>" +
          yesNoChip(s.location_granted, "Location on", "Location off") +
          "</td>" +
          "<td>" +
          yesNoChip(s.microphone_granted, "Microphone on", "Microphone off") +
          "</td>" +
          '<td class="muted portal-tprog-seen">' +
          esc(formatLondon(s.last_seen_at)) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    list.innerHTML =
      '<div class="portal-tprog-scroll">' +
      '<table class="tbl portal-tprog-table">' +
      "<thead><tr>" +
      "<th>Staff</th>" +
      "<th>Induction (M1–M6)</th>" +
      "<th>Swimming training</th>" +
      "<th>Term review</th>" +
      "<th>App</th>" +
      "<th>Alerts</th>" +
      "<th>Map</th>" +
      "<th>Mic</th>" +
      "<th>Last seen</th>" +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>";
  }

  function setStatus(html, isError) {
    var el = document.getElementById("portalTrainingProgressStatus");
    if (!el) return;
    el.className = "portal-forms-status" + (isError ? " is-error" : "");
    el.innerHTML = html || "";
  }

  async function refresh() {
    var client = cfg.getClient();
    if (!client) {
      setStatus("<strong>Sign in required.</strong> Supabase session not available.", true);
      return;
    }

    var btn = document.getElementById("portalTrainingProgressRefresh");
    if (btn) btn.disabled = true;
    state.loading = true;
    setStatus("<strong>Loading…</strong>");

    var profilesRes = await client
      .from("staff_profiles")
      .select("id, full_name, username, is_active")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    var progressRes = await client
      .from("portal_staff_training_progress")
      .select(
        "staff_user_id, track, current_module, modules_total, progress_pct, module_states, phase_label, completed_at, updated_at"
      );

    var setupRes = await client.from("portal_staff_setup_status").select("*");

    state.loading = false;
    if (btn) btn.disabled = false;

    var err =
      (profilesRes.error && profilesRes.error.message) ||
      (progressRes.error && progressRes.error.message) ||
      (setupRes.error && setupRes.error.message);

    if (err) {
      if (/does not exist|relation/i.test(err)) {
        setStatus(
          "<strong>Database not ready.</strong> Run migration <code>20260614150000_portal_staff_training_setup_status.sql</code> on Portal Supabase.",
          true
        );
      } else {
        setStatus("<strong>Error</strong> " + esc(err), true);
      }
      state.rows = [];
      renderTable([]);
      return;
    }

    state.rows = mergeRows(profilesRes.data, progressRes.data, setupRes.data);
    setStatus("");
    renderTable(state.rows);
  }

  function bindModule() {
    var root = document.getElementById("portalTrainingProgressRoot");
    if (!root || root.getAttribute("data-portal-tprog-bound") === "1") return;
    root.setAttribute("data-portal-tprog-bound", "1");

    var refreshBtn = document.getElementById("portalTrainingProgressRefresh");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", function () {
        void refresh();
      });
    }

    var filterSel = document.getElementById("portalTrainingProgressFilter");
    if (filterSel) {
      filterSel.addEventListener("change", function () {
        state.filter = filterSel.value || "all";
        renderTable(state.rows);
      });
    }

    void refresh();
  }

  function viewHtml() {
    return (
      '<div id="portalTrainingProgressRoot" class="portal-activity-embed portal-day-ops-embed portal-tprog-embed" data-portal-tprog-bound="0">' +
      '<h1 class="page-title">Training &amp; app readiness</h1>' +
      '<p class="page-intro portal-activity-intro">Induction progress by module (M1–M6), swimming training and term review phases, plus whether each worker uses the installed app with alerts, map and microphone enabled. Data syncs from each device when they open the portal.</p>' +
      '<div id="portalTrainingProgressStatus" class="portal-forms-status" role="status"></div>' +
      '<div class="portal-activity-toolbar">' +
      '<label class="portal-activity-toolbar__day"><span class="muted">Show</span> ' +
      '<select class="inp" id="portalTrainingProgressFilter">' +
      '<option value="all">All staff</option>' +
      '<option value="attention">Needs follow-up</option>' +
      '<option value="induction_incomplete">Induction incomplete</option>' +
      '<option value="browser_only">Web only (not app)</option>' +
      '<option value="missing_setup">Missing alerts / map / mic</option>' +
      "</select></label>" +
      '<button type="button" class="btn btn--sec btn--sm" id="portalTrainingProgressRefresh">Refresh</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-view-target="staffhr">Staff &amp; HR</button>' +
      "</div>" +
      '<p class="portal-activity-count" id="portalTrainingProgressCount">Loading…</p>' +
      '<div id="portalTrainingProgressTableWrap" aria-live="polite"></div>' +
      "</div>"
    );
  }

  global.PortalTrainingProgress = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    refresh: refresh,
  };
})(typeof window !== "undefined" ? window : globalThis);
