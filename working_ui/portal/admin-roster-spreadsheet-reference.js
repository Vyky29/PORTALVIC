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
    tab: "sessions",
    sessionDay: "Monday",
    hoursDay: "Monday",
    dirty: Object.create(null),
    saving: false,
    mergedData: null,
  };

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
      '<button type="button" class="btn btn--ghost btn--sm is-active" data-asr-tab="sessions">Group sessions</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-asr-tab="hours">Staff hours</button>' +
      "</div>" +
      '<div class="asr-toolbar" id="asrToolbar" hidden>' +
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
      "</div>"
    );
  }

  function weekdaySubtabs(active, attr) {
    var html = '<div class="asr-subtabs" role="tablist">';
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
    var html = sessionLegendHtml() + weekdaySubtabs(day, "data-asr-session-day");
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

  function cellInputHtml(cell) {
    var key = cell.editKey || "";
    var val = state.dirty[key] != null ? state.dirty[key] : cell.text || "";
    var dirtyCls = state.dirty[key] != null ? " asr-cell-input--dirty" : "";
    var tone = cell.tone ? " asr-tone--" + cell.tone : "";
    return (
      '<input type="text" class="asr-cell-input' +
      dirtyCls +
      tone +
      '" data-asr-edit-key="' +
      esc(key) +
      '" value="' +
      esc(val) +
      '" aria-label="Staff assignment" />'
    );
  }

  function renderHoursTableHtml(groups, dates, blockTitle) {
    if (!groups.length) {
      return '<p class="muted">No columns.</p>';
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
    dates.forEach(function (dr) {
      html +=
        '<tr class="asr-row--' +
        esc(dr.status || "confirmed") +
        '"><td class="asr-date">' +
        esc(dr.label || dr.date) +
        "</td>";
      (dr.cells || []).forEach(function (cell) {
        html += "<td>" + cellInputHtml(cell) + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  function renderHoursPanel() {
    var d = data();
    if (!d || !d.staffHours) {
      return '<p class="muted">Staff hours data not loaded.</p>';
    }
    var day = state.hoursDay;
    var sheet = d.staffHours[day];
    var html = hoursLegendHtml() + weekdaySubtabs(day, "data-asr-hours-day");
    if (!sheet) {
      html += '<p class="muted">No hours sheet for ' + esc(day) + ".</p>";
      return html;
    }
    if (sheet.placeholder) {
      html += '<p class="muted">No staff hours for ' + esc(day) + " from 1 Jun 2026.</p>";
      return html;
    }
    if (sheet.blocks && sheet.blocks.length) {
      sheet.blocks.forEach(function (block) {
        html += renderHoursTableHtml(block.venueGroups || [], block.dates || [], "");
      });
      return html;
    }
    return renderHoursTableHtml(sheet.venueGroups || [], sheet.dates || [], "");
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
    var chain = Promise.resolve();
    rows.forEach(function (row) {
      chain = chain.then(function () {
        return client
          .from("portal_staff_timetable_cells")
          .upsert(
            [
              {
                session_date: row.session_date,
                day: row.day,
                column_key: row.column_key,
                raw_assignment: row.raw_assignment,
                status: row.status,
                created_by: uid,
                updated_by: uid,
              },
            ],
            { onConflict: "session_date,column_key" }
          );
      });
    });
    chain
      .then(function () {
        if (global.PortalStaffTimetableMerge) global.PortalStaffTimetableMerge.invalidate();
        state.dirty = Object.create(null);
        return applyOverridesToMerged();
      })
      .then(function () {
        refreshPanel();
        cfg.toast("Staff hours saved — dashboards will use overrides on next load.");
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
        cfg.toast("Save failed: " + String((err && err.message) || err));
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
    root.querySelectorAll(".asr-cell-input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var key = inp.getAttribute("data-asr-edit-key") || "";
        if (!key) return;
        state.dirty[key] = inp.value;
        inp.classList.add("asr-cell-input--dirty");
        updateToolbar();
      });
    });
  }

  function bindModule() {
    var root = document.getElementById("adminSpreadsheetRefRoot");
    if (!root || root._asrBound) return;
    root._asrBound = true;
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
    if (saveBtn) saveBtn.addEventListener("click", saveStaffHours);

    function mount() {
      if (!baseData()) {
        var panel = document.getElementById("adminSpreadsheetRefPanel");
        if (panel) {
          panel.innerHTML =
            '<p class="submission-state is-error">Could not load <code>spreadsheet_reference_data.js</code>.</p>';
        }
        return;
      }
      applyOverridesToMerged().then(refreshPanel);
    }

    if (baseData()) mount();
    else {
      var s = document.createElement("script");
      s.src = "/portal/spreadsheet_reference_data.js?v=20260602-weekend-editable";
      s.onload = mount;
      s.onerror = function () {
        var panel = document.getElementById("adminSpreadsheetRefPanel");
        if (panel) {
          panel.innerHTML =
            '<p class="submission-state is-error">Failed to load spreadsheet reference data.</p>';
        }
      };
      document.head.appendChild(s);
    }
  }

  global.PortalSpreadsheetReference = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    reload: applyOverridesToMerged,
  };
})(typeof window !== "undefined" ? window : globalThis);
