/**
 * Admin — spreadsheet reference: group session grids + staff hours (Mon–Sun).
 * Data: window.PORTAL_SPREADSHEET_REFERENCE (spreadsheet_reference_data.js).
 */
(function (global) {
  "use strict";

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s);
    },
  };

  var state = {
    tab: "sessions",
    sessionDay: "Monday",
    hoursDay: "Monday",
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
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function data() {
    return global.PORTAL_SPREADSHEET_REFERENCE || null;
  }

  function viewHtml() {
    var d = data();
    var meta = d && d.meta ? d.meta : {};
    var weekLbl = esc(meta.sessionWeekLabel || "");
    return (
      '<div class="asr-root" id="adminSpreadsheetRefRoot">' +
      '<h1 class="page-title">Spreadsheet reference</h1>' +
      '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">' +
      "Read-only mirror of the <strong>group sessions</strong> layout (participant slots by instructor) and <strong>staff hours</strong> timetable (who works which venue each date). " +
      "Source: <code>" +
      esc(meta.sessionSource || "roster week CSV") +
      "</code>" +
      (weekLbl ? " · sessions week " + weekLbl : "") +
      ".</p>" +
      '<div class="asr-tabs" role="tablist">' +
      '<button type="button" class="btn btn--ghost btn--sm is-active" data-asr-tab="sessions">Group sessions</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-asr-tab="hours">Staff hours</button>' +
      "</div>" +
      '<div id="adminSpreadsheetRefPanel"></div>' +
      "</div>"
    );
  }

  function sessionLegendHtml() {
    return (
      '<div class="asr-legend" aria-label="Session cell legend">' +
      '<span><i class="asr-swatch" style="background:#fef08a"></i> No client / available</span>' +
      '<span><i class="asr-swatch" style="background:#fed7aa"></i> New / changes (manual in sheet)</span>' +
      '<span><i class="asr-swatch" style="background:#a5f3fc"></i> Trial (manual in sheet)</span>' +
      '<span><i class="asr-swatch" style="background:#1e3a5f"></i> Closed</span>' +
      "</div>"
    );
  }

  function hoursLegendHtml() {
    return (
      '<div class="asr-legend" aria-label="Staff hours legend">' +
      '<span><i class="asr-swatch" style="background:#bbf7d0"></i> Completed (before 1 Jun 2026)</span>' +
      '<span><i class="asr-swatch" style="background:#fff;border:1px solid #d1d5db"></i> Confirmed (from 1 Jun)</span>' +
      '<span class="muted">Blue text = cover · green = shadow · red = training</span>' +
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
        var cls = "asr-cell--" + kind;
        html += '<td class="' + cls + '">' + esc(cell.label || "") + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    var count = 0;
    grid.rows.forEach(function (row) {
      (row.cells || []).forEach(function (cell) {
        if (cell.kind === "client") count += 1;
      });
    });
    html +=
      '<p class="muted" style="margin:10px 0 0;font-size:12px">' +
      esc(count) +
      " participant slots (excl. closed / empty) on " +
      esc(day) +
      ".</p>";
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
      html +=
        '<div class="asr-placeholder card card-pad">' +
        "<strong>" +
        esc(day) +
        "</strong> — no staff hours in export.</div>";
      return html;
    }
    if (sheet.blocks && sheet.blocks.length) {
      sheet.blocks.forEach(function (block, idx) {
        var title =
          idx === 0 && sheet.blocks.length > 1
            ? "April – May 2026"
            : idx === 1
              ? "June – July 2026"
              : "";
        html += renderHoursTableHtml(block.venueGroups || [], block.dates || [], title);
      });
      return html;
    }
    return renderHoursTableHtml(sheet.venueGroups || [], sheet.dates || [], "");
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
        var tone = cell.tone ? " asr-tone--" + cell.tone : "";
        html +=
          '<td class="' +
          tone +
          '"><span style="display:block;min-width:0;overflow-wrap:break-word">' +
          esc(cell.text || "") +
          "</span></td>";
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    return html;
  }

  function refreshPanel() {
    var panel = document.getElementById("adminSpreadsheetRefPanel");
    if (!panel) return;
    panel.innerHTML = state.tab === "sessions" ? renderSessionsPanel() : renderHoursPanel();
    bindPanel(panel);
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
  }

  function bindModule() {
    var root = document.getElementById("adminSpreadsheetRefRoot");
    if (!root || root._asrBound) return;
    root._asrBound = true;
    root.querySelectorAll("[data-asr-tab]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tab = btn.getAttribute("data-asr-tab") || "sessions";
        state.tab = tab;
        root.querySelectorAll("[data-asr-tab]").forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-asr-tab") === tab);
        });
        refreshPanel();
      });
    });
    function mount() {
      if (!data()) {
        var panel = document.getElementById("adminSpreadsheetRefPanel");
        if (panel) {
          panel.innerHTML =
            '<p class="submission-state is-error">Could not load <code>spreadsheet_reference_data.js</code>.</p>';
        }
        return;
      }
      refreshPanel();
    }
    if (data()) mount();
    else {
      var s = document.createElement("script");
      s.src = "/portal/spreadsheet_reference_data.js?v=20260602-ref";
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
  };
})(typeof window !== "undefined" ? window : globalThis);
