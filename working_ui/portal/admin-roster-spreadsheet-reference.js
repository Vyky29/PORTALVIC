/**
 * Admin — spreadsheet reference: group sessions + editable staff hours (Jun 2026+).
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
    toast: function (m) {
      try {
        console.log("[spreadsheet-ref]", m);
      } catch (_) {}
    },
  };

  var state = {
    tab: "hours",
    sessionDay: "Monday",
    hoursDay: "Monday",
    hoursService: "all",
    dirty: Object.create(null),
    dirtyBaseline: Object.create(null),
    saving: false,
    mergedData: null,
    overrideLog: [],
    authorById: Object.create(null),
  };

  var HOURS_SERVICE_FILTERS = [
    { id: "all", label: "All" },
    { id: "day_centre", label: "Day Centre" },
    { id: "pool", label: "Pool / aquatic" },
    { id: "bespoke", label: "Bespoke" },
  ];

  var WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getClient) cfg.getClient = options.getClient;
    if (options.toast) cfg.toast = options.toast;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function baseData() {
    return global.PORTAL_SPREADSHEET_REFERENCE || null;
  }

  function data() {
    return state.mergedData || baseData();
  }

  function cloneStaffHours(sh) {
    return JSON.parse(JSON.stringify(sh || {}));
  }

  function applyOverridesToMerged() {
    var base = baseData();
    if (!base) {
      state.mergedData = null;
      return Promise.resolve();
    }
    var copy = JSON.parse(JSON.stringify(base));
    var client = cfg.getClient();
    if (!client || !global.PortalStaffTimetableMerge) {
      state.mergedData = copy;
      return Promise.resolve();
    }
    return global.PortalStaffTimetableMerge.loadAndCache(client, 0).then(function (map) {
      if (copy.staffHours) {
        global.PortalStaffTimetableMerge.applyToStaffHours(copy.staffHours, map);
      }
      state.mergedData = copy;
    });
  }

  function viewHtml() {
    var meta = (baseData() && baseData().meta) || {};
    var weekLbl = esc(meta.sessionWeekLabel || "");
    return (
      '<div class="asr-root" id="adminSpreadsheetRefRoot">' +
      '<h1 class="page-title">Spreadsheet reference</h1>' +
      '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">' +
      "<strong>Staff hours</strong> (from " +
      esc(meta.hoursFrom || "2026-06-01") +
      "): edit cells and <strong>Save</strong> — overrides apply across dashboards via Supabase. " +
      "<strong>Group sessions</strong> mirror the roster week" +
      (weekLbl ? " (" + weekLbl + ")" : "") +
      " (read-only here; use <strong>Edit term slot</strong> or <strong>Schedule &amp; Covers</strong> for participant slots).</p>" +
      '<div class="asr-tabs" role="tablist">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-asr-tab="sessions">Group sessions</button>' +
      '<button type="button" class="btn btn--ghost btn--sm is-active" data-asr-tab="hours">Staff hours</button>' +
      "</div>" +
      '<div class="asr-toolbar" id="asrToolbar">' +
      '<button type="button" class="btn btn--pri btn--sm" id="asrSaveBtn">Save staff hours</button>' +
      '<span class="muted" id="asrSaveStatus" style="font-size:12px;min-width:0;overflow-wrap:break-word"></span>' +
      "</div>" +
      '<div id="adminSpreadsheetRefPanel" class="asr-panel-host"></div>' +
      "</div>"
    );
  }

  function sessionLegendHtml() {
    return (
      '<div class="asr-legend" aria-label="Session cell legend">' +
      '<span><i class="asr-swatch" style="background:#fef08a"></i> No client / available</span>' +
      '<span><i class="asr-swatch" style="background:#1e3a5f"></i> Closed</span>' +
      "</div>"
    );
  }

  function hoursLegendHtml() {
    return (
      '<div class="asr-legend" aria-label="Staff hours legend">' +
      "<span>Scroll horizontally for all venues · edits sync to dashboards after Save</span>" +
      '<span><i class="asr-swatch" style="background:#eff6ff;border-color:#93c5fd"></i> Saved override (blue text)</span>' +
      "</div>"
    );
  }

  function weekdaySubtabs(active, attr, opts) {
    opts = opts || {};
    var html = '<div class="asr-subtabs" role="tablist">';
    if (opts.includeAll) {
      var allVal = opts.allValue || "all";
      var allLbl = opts.allLabel || "All week";
      html +=
        '<button type="button" class="btn btn--ghost btn--sm' +
        (active === allVal ? " is-active" : "") +
        '" ' +
        attr +
        '="' +
        esc(allVal) +
        '">' +
        esc(allLbl) +
        "</button>";
    }
    WEEKDAYS.forEach(function (day) {
      html +=
        '<button type="button" class="btn btn--ghost btn--sm' +
        (day === active ? " is-active" : "") +
        '" ' +
        attr +
        '="' +
        esc(day) +
        '">' +
        esc(day.slice(0, 3)) +
        "</button>";
    });
    return html + "</div>";
  }

  function renderSessionsPanel() {
    var d = data();
    if (!d || !d.sessionGrids) {
      return '<p class="muted">Session reference data not loaded.</p>';
    }
    var day = state.sessionDay;
    var grid = d.sessionGrids[day] || { columns: [], rows: [] };
    var html =
      '<p class="muted asr-tab-hint" style="margin:0 0 10px;max-width:52rem;overflow-wrap:break-word">Read-only mirror of the roster week. To change participant slots use <strong>Edit term slot</strong> or <strong>Schedule &amp; Covers</strong>. Staff pool hours are edited under the <strong>Staff hours</strong> tab.</p>' +
      sessionLegendHtml() +
      weekdaySubtabs(day, "data-asr-session-day");
    if (!grid.columns.length) {
      html += '<p class="muted">No session columns for ' + esc(day) + ".</p>";
      return html;
    }
    html += '<div class="asr-scroll"><table class="asr-grid asr-sessions"><thead><tr>';
    html += '<th class="asr-time">Time</th>';
    grid.columns.forEach(function (col) {
      html +=
        "<th><span class=\"asr-col-head__title\">" +
        esc(col.title) +
        '</span><span class="asr-col-head__sub">' +
        esc(col.subtitle) +
        "</span></th>";
    });
    html += "</tr></thead><tbody>";
    grid.rows.forEach(function (row) {
      html += "<tr><td class=\"asr-time\">" + esc(row.time) + "</td>";
      (row.cells || []).forEach(function (cell) {
        var kind = cell.kind || "empty";
        html += '<td class="asr-cell--' + kind + '">' + esc(cell.label || "") + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  function findCellInStaffHours(staffHours, editKey) {
    if (!staffHours || !editKey) return null;
    var found = null;
    function scan(cells) {
      (cells || []).forEach(function (cell) {
        if (cell && cell.editKey === editKey) found = cell;
      });
    }
    Object.keys(staffHours).forEach(function (day) {
      var sheet = staffHours[day];
      if (!sheet) return;
      (sheet.dates || []).forEach(function (dr) {
        scan(dr.cells);
      });
      (sheet.blocks || []).forEach(function (block) {
        (block.dates || []).forEach(function (dr) {
          scan(dr.cells);
        });
      });
    });
    return found;
  }

  function getBaseCellText(editKey) {
    var base = baseData();
    if (!base || !base.staffHours) return "";
    var cell = findCellInStaffHours(base.staffHours, editKey);
    return cell ? String(cell.text || "").trim() : "";
  }

  function formatLogWhen(raw) {
    if (!raw) return "";
    try {
      return new Date(raw).toLocaleString("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return String(raw).slice(0, 16).replace("T", " ");
    }
  }

  function formatSessionDateLabel(iso) {
    var s = String(iso || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    try {
      return new Date(s + "T12:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (_e) {
      return s;
    }
  }

  function formatColumnLabel(columnKey) {
    var k = String(columnKey || "").trim();
    if (!k) return "—";
    return k.replace(/:/g, " · ").replace(/-/g, " ");
  }

  function resolveAuthorName(userId) {
    var id = String(userId || "").trim();
    if (!id) return "Admin";
    if (state.authorById[id]) return state.authorById[id];
    try {
      var box = global.__PORTAL_SUPABASE__;
      var me = box && box.staff_profile;
      if (me && String(me.id) === id) {
        return String(me.full_name || me.username || "You").trim() || "You";
      }
    } catch (_e) {}
    return "Admin";
  }

  function loadAuthorNames(rows) {
    var client = cfg.getClient();
    if (!client || !rows || !rows.length) return Promise.resolve();
    var seen = Object.create(null);
    var ids = [];
    rows.forEach(function (r) {
      var id = String((r && r.updated_by) || "").trim();
      if (id && !seen[id]) {
        seen[id] = 1;
        ids.push(id);
      }
    });
    if (!ids.length) return Promise.resolve();
    return client
      .from("staff_profiles")
      .select("id,full_name,username")
      .in("id", ids)
      .then(function (res) {
        if (res.error || !res.data) return;
        res.data.forEach(function (p) {
          if (!p || !p.id) return;
          var name = String(p.full_name || p.username || "").trim();
          if (name) state.authorById[String(p.id)] = name;
        });
      })
      .catch(function () {});
  }

  function loadChangeLog() {
    var client = cfg.getClient();
    if (!client) {
      state.overrideLog = [];
      return Promise.resolve();
    }
    return client
      .from("portal_staff_timetable_cells")
      .select("session_date,day,column_key,raw_assignment,status,updated_at,updated_by")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(80)
      .then(function (res) {
        if (res.error) throw res.error;
        state.overrideLog = res.data || [];
        return loadAuthorNames(state.overrideLog);
      })
      .catch(function () {
        state.overrideLog = [];
      });
  }

  function renderChangeLogHtml() {
    var rows = state.overrideLog || [];
    if (!rows.length) {
      return (
        '<section class="asr-changelog" aria-labelledby="asrChangelogTitle">' +
        '<h3 class="asr-changelog__title" id="asrChangelogTitle">Change log</h3>' +
        '<p class="asr-changelog__hint">Saved staff-hour overrides appear here after you click <strong>Save staff hours</strong>.</p>' +
        '<p class="asr-changelog-empty">No saved changes yet.</p>' +
        "</section>"
      );
    }
    var html =
      '<section class="asr-changelog" aria-labelledby="asrChangelogTitle">' +
      '<h3 class="asr-changelog__title" id="asrChangelogTitle">Change log</h3>' +
      '<p class="asr-changelog__hint">Recent saves from Supabase — blue cells in the grid match these overrides.</p>' +
      '<div class="asr-changelog-scroll"><table class="asr-changelog-table"><thead><tr>' +
      "<th>When</th><th>By</th><th>Date</th><th>Day</th><th>Column</th><th>Before</th><th>After</th>" +
      "</tr></thead><tbody>";
    rows.forEach(function (row) {
      var editKey =
        String(row.session_date || "").slice(0, 10) +
        "|" +
        String(row.day || "").trim() +
        "|" +
        String(row.column_key || "").trim();
      var before = getBaseCellText(editKey);
      var after = String(row.raw_assignment || "").trim();
      html +=
        "<tr>" +
        "<td>" +
        esc(formatLogWhen(row.updated_at)) +
        "</td>" +
        "<td>" +
        esc(resolveAuthorName(row.updated_by)) +
        "</td>" +
        "<td>" +
        esc(formatSessionDateLabel(row.session_date)) +
        "</td>" +
        "<td>" +
        esc(row.day || "") +
        "</td>" +
        "<td>" +
        esc(formatColumnLabel(row.column_key)) +
        "</td>" +
        "<td>" +
        esc(before || "—") +
        "</td>" +
        '<td class="asr-changelog-new">' +
        esc(after || "—") +
        "</td>" +
        "</tr>";
    });
    html += "</tbody></table></div></section>";
    return html;
  }

  function cellInputHtml(cell) {
    var key = cell.editKey || "";
    var val = state.dirty[key] != null ? state.dirty[key] : cell.text || "";
    var dirtyCls = state.dirty[key] != null ? " asr-cell-input--dirty" : "";
    var savedCls =
      state.dirty[key] == null && (cell.overridden || cell.tone === "updated")
        ? " asr-cell-input--saved asr-tone--updated"
        : "";
    var tone =
      cell.tone && state.dirty[key] == null && !savedCls
        ? " asr-tone--" + cell.tone
        : "";
    return (
      '<input type="text" class="asr-cell-input' +
      dirtyCls +
      savedCls +
      tone +
      '" data-asr-edit-key="' +
      esc(key) +
      '" value="' +
      esc(val) +
      '" aria-label="Staff assignment" />'
    );
  }

  function cellMatchesServiceFilter(cell, serviceFilter) {
    if (!serviceFilter || serviceFilter === "all") return true;
    var band = String((cell && cell.band) || "").trim();
    var t = String((cell && cell.text) || "").toLowerCase();
    if (serviceFilter === "day_centre") {
      return (
        band === "day_centre" ||
        /\b11-4\b|\b11-3\b|\b12\.30-3\b|\b12\.30-4\b|\b1-3\b/.test(t)
      );
    }
    if (serviceFilter === "pool") {
      return (
        band === "pool" ||
        /\b4\.15|\b4\.30|\b4-|\b3\.30|\b9-|\b10-|\b9\.15/.test(t)
      );
    }
    if (serviceFilter === "bespoke") {
      return /\b4\.15-6\.15\b/.test(t) && band !== "day_centre";
    }
    return true;
  }

  function serviceSubtabs(active, attr) {
    var html = '<div class="asr-subtabs asr-subtabs--service" role="tablist">';
    HOURS_SERVICE_FILTERS.forEach(function (f) {
      html +=
        '<button type="button" class="btn btn--ghost btn--sm' +
        (f.id === active ? " is-active" : "") +
        '" ' +
        attr +
        '="' +
        esc(f.id) +
        '">' +
        esc(f.label) +
        "</button>";
    });
    return html + "</div>";
  }

  function renderHoursTableHtml(groups, dates, blockTitle, serviceFilter) {
    if (!groups.length) {
      return '<p class="muted">No columns.</p>';
    }
    var sf = serviceFilter || "all";
    var filteredDates = (dates || []).filter(function (dr) {
      if (sf === "all") return true;
      return (dr.cells || []).some(function (cell) {
        return cellMatchesServiceFilter(cell, sf);
      });
    });
    if (!filteredDates.length) {
      return '<p class="muted">No assignments for this service on the selected day.</p>';
    }
    var html = "";
    if (blockTitle) {
      html += '<p class="asr-hours-block__title">' + esc(blockTitle) + "</p>";
    }
    html += '<div class="asr-scroll asr-hours-block"><table class="asr-grid asr-hours"><thead>';
    html += '<tr><th rowspan="2" class="asr-date">Dates</th>';
    groups.forEach(function (g) {
      html +=
        '<th colspan="' +
        g.span +
        '" class="asr-venue--' +
        esc(g.style || "default") +
        '">' +
        esc(g.venue) +
        "</th>";
    });
    html += "</tr><tr>";
    groups.forEach(function (g) {
      for (var i = 0; i < g.span; i++) {
        html += "<th class=\"asr-venue--" + esc(g.style || "default") + '"> </th>';
      }
    });
    html += "</tr></thead><tbody>";
    filteredDates.forEach(function (dr) {
      html +=
        '<tr class="asr-row--' +
        esc(dr.status || "confirmed") +
        '"><td class="asr-date">' +
        esc(dr.label || dr.date) +
        "</td>";
      (dr.cells || []).forEach(function (cell) {
        if (sf !== "all" && !cellMatchesServiceFilter(cell, sf)) {
          html += '<td class="asr-cell--muted-filter">—</td>';
          return;
        }
        html += "<td>" + cellInputHtml(cell) + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  function renderHoursDaySection(day, sheet) {
    if (!sheet) {
      return '<p class="muted">No hours sheet for ' + esc(day) + ".</p>";
    }
    if (sheet.placeholder) {
      return '<p class="muted">No staff hours for ' + esc(day) + " from 1 Jun 2026.</p>";
    }
    var html = "";
    if (sheet.blocks && sheet.blocks.length) {
      sheet.blocks.forEach(function (block) {
        html += renderHoursTableHtml(
          block.venueGroups || [],
          block.dates || [],
          "",
          state.hoursService
        );
      });
      return html;
    }
    return renderHoursTableHtml(
      sheet.venueGroups || [],
      sheet.dates || [],
      "",
      state.hoursService
    );
  }

  function renderHoursPanel() {
    var d = data();
    if (!d || !d.staffHours) {
      return '<p class="muted">Staff hours data not loaded.</p>';
    }
    var day = state.hoursDay;
    var html =
      hoursLegendHtml() +
      weekdaySubtabs(day, "data-asr-hours-day", {
        includeAll: true,
        allLabel: "All week",
        allValue: "all",
      }) +
      serviceSubtabs(state.hoursService, "data-asr-hours-service");
    if (day === "all") {
      WEEKDAYS.forEach(function (wd) {
        var sheet = d.staffHours[wd];
        html +=
          '<section class="asr-hours-day-section" aria-labelledby="asr-hours-day-' +
          esc(wd) +
          '">' +
          '<h3 class="asr-hours-day-section__title" id="asr-hours-day-' +
          esc(wd) +
          '">' +
          esc(wd) +
          "</h3>";
        html += renderHoursDaySection(wd, sheet);
        html += "</section>";
      });
      return html + renderChangeLogHtml();
    }
    return html + renderHoursDaySection(day, d.staffHours[day]) + renderChangeLogHtml();
  }

  function updateToolbar() {
    var bar = document.getElementById("asrToolbar");
    if (bar) bar.hidden = state.tab !== "hours";
    var dirtyCount = Object.keys(state.dirty).length;
    var st = document.getElementById("asrSaveStatus");
    if (st) {
      st.textContent = dirtyCount
        ? dirtyCount + " unsaved change" + (dirtyCount === 1 ? "" : "s")
        : "";
    }
    var btn = document.getElementById("asrSaveBtn");
    if (btn) btn.disabled = state.saving || dirtyCount === 0;
  }

  function refreshPanel() {
    var panel = document.getElementById("adminSpreadsheetRefPanel");
    if (!panel) return;
    panel.innerHTML = state.tab === "sessions" ? renderSessionsPanel() : renderHoursPanel();
    bindPanel(panel);
    updateToolbar();
  }

  function parseEditKey(editKey) {
    var p = String(editKey || "").split("|");
    if (p.length < 3) return null;
    return {
      session_date: p[0],
      day: p[1],
      column_key: p.slice(2).join("|"),
    };
  }

  function collectDirtyRows() {
    var out = [];
    Object.keys(state.dirty).forEach(function (key) {
      var parsed = parseEditKey(key);
      if (!parsed) return;
      out.push({
        session_date: parsed.session_date,
        day: parsed.day,
        column_key: parsed.column_key,
        raw_assignment: String(state.dirty[key] || "").trim(),
        status: String(state.dirty[key] || "").trim() ? "active" : "cleared",
      });
    });
    return out;
  }

  function saveStaffHours() {
    if (state.saving) return;
    var rows = collectDirtyRows();
    if (!rows.length) return;
    var client = cfg.getClient();
    if (!client) {
      cfg.toast("Sign in to save overrides.");
      return;
    }
    state.saving = true;
    updateToolbar();
    var uid = null;
    try {
      var box = global.__PORTAL_SUPABASE__;
      if (box && box.session && box.session.user) uid = box.session.user.id;
    } catch (_e) {}
    if (!uid) {
      state.saving = false;
      cfg.toast("No auth user — reload and try again.");
      updateToolbar();
      return;
    }
    var payload = rows.map(function (row) {
      return {
        session_date: row.session_date,
        day: row.day,
        column_key: row.column_key,
        raw_assignment: row.raw_assignment,
        status: row.status,
        created_by: uid,
        updated_by: uid,
      };
    });
    client
      .from("portal_staff_timetable_cells")
      .upsert(payload, { onConflict: "session_date,column_key" })
      .then(function (res) {
        if (res.error) throw res.error;
        if (global.PortalStaffTimetableMerge) global.PortalStaffTimetableMerge.invalidate();
        Object.keys(state.dirty).forEach(function (key) {
          delete state.dirtyBaseline[key];
        });
        state.dirty = Object.create(null);
        return applyOverridesToMerged();
      })
      .then(function () {
        return loadChangeLog();
      })
      .then(function () {
        refreshPanel();
        cfg.toast(
          "Staff hours saved (" +
            payload.length +
            " cell" +
            (payload.length === 1 ? "" : "s") +
            ") — dashboards pick up overrides on reload."
        );
        if (global.PortalRosterRowsMerge && client) {
          return global.PortalRosterRowsMerge.loadAndCache(client);
        }
      })
      .then(function () {
        if (typeof global.portalRefreshStaffDashboardSourceFromPortal === "function") {
          global.portalRefreshStaffDashboardSourceFromPortal();
        }
      })
      .catch(function (err) {
        var msg = String((err && err.message) || err || "Unknown error");
        if (/portal_staff_timetable_cells|relation.*does not exist/i.test(msg)) {
          msg += " — run migration 20260611120000_portal_staff_timetable_cells on Portal Supabase.";
        }
        cfg.toast("Save failed: " + msg);
      })
      .finally(function () {
        state.saving = false;
        updateToolbar();
      });
  }

  function bindPanel(root) {
    if (!root) return;
    root.querySelectorAll("[data-asr-session-day]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.sessionDay = btn.getAttribute("data-asr-session-day") || "Monday";
        refreshPanel();
      });
    });
    root.querySelectorAll("[data-asr-hours-day]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.hoursDay = btn.getAttribute("data-asr-hours-day") || "Monday";
        refreshPanel();
      });
    });
    root.querySelectorAll("[data-asr-hours-service]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.hoursService = btn.getAttribute("data-asr-hours-service") || "all";
        refreshPanel();
      });
    });
    root.querySelectorAll(".asr-cell-input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var key = inp.getAttribute("data-asr-edit-key") || "";
        if (!key) return;
        if (!Object.prototype.hasOwnProperty.call(state.dirtyBaseline, key)) {
          var cell = findCellInStaffHours(data(), key);
          state.dirtyBaseline[key] = cell ? String(cell.text || "") : "";
        }
        state.dirty[key] = inp.value;
        inp.classList.add("asr-cell-input--dirty");
        inp.classList.remove("asr-cell-input--saved");
        updateToolbar();
      });
    });
  }

  function bindModule() {
    var root = document.getElementById("adminSpreadsheetRefRoot");
    if (!root) return;
    root.querySelectorAll("[data-asr-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.tab = btn.getAttribute("data-asr-tab") || "sessions";
        root.querySelectorAll("[data-asr-tab]").forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-asr-tab") === state.tab);
        });
        refreshPanel();
      });
    });
    var saveBtn = document.getElementById("asrSaveBtn");
    if (saveBtn && !saveBtn._asrSaveBound) {
      saveBtn._asrSaveBound = true;
      saveBtn.addEventListener("click", saveStaffHours);
    }

    function mount() {
      if (!baseData()) {
        var panel = document.getElementById("adminSpreadsheetRefPanel");
        if (panel) {
          panel.innerHTML =
            '<p class="submission-state is-error">Could not load <code>spreadsheet_reference_data.js</code>.</p>';
        }
        return;
      }
      state.mergedData = null;
      Promise.all([applyOverridesToMerged(), loadChangeLog()]).then(refreshPanel);
    }

    mount();
  }

  global.PortalSpreadsheetReference = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    reload: applyOverridesToMerged,
  };
})(typeof window !== "undefined" ? window : globalThis);
