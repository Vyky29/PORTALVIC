/**
 * Admin — Instructor timetable (ex Spreadsheet reference).
 * Group sessions = same standing roster as Services (canonical).
 * Staff hours = standing week from that roster + editable dated overrides (Supabase).
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

  /** Same snap dates Services uses for standing weekday projection. */
  var STANDING_ISO_BY_DAY = {
    Saturday: "2026-07-11",
    Sunday: "2026-07-12",
    Monday: "2026-07-13",
    Tuesday: "2026-07-14",
    Wednesday: "2026-07-15",
    Thursday: "2026-07-16",
    Friday: "2026-07-17",
  };

  var state = {
    tab: "sessions",
    sessionDay: "Monday",
    hoursDay: "Monday",
    hoursService: "all",
    hoursWeekStart: null,
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

  /** Staff hours dated sheet = Autumn 26/27 only (not summer Excel). */
  var HOURS_TERM_FROM = "2026-09-01";
  var HOURS_TERM_TO = "2026-12-17";

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function isoFromDate(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function parseIsoLocal(iso) {
    var s = String(iso || "").slice(0, 10);
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function addDaysIso(iso, days) {
    var d = parseIsoLocal(iso);
    if (!d) return "";
    d.setDate(d.getDate() + days);
    return isoFromDate(d);
  }

  function mondayOfWeek(iso) {
    var d = parseIsoLocal(iso);
    if (!d) return "";
    var wd = d.getDay();
    var diff = wd === 0 ? -6 : 1 - wd;
    d.setDate(d.getDate() + diff);
    return isoFromDate(d);
  }

  function isoTodayLocal() {
    var n = new Date();
    return isoFromDate(n);
  }

  function formatHoursWeekRangeLabel(weekStart) {
    var a = parseIsoLocal(weekStart);
    var b = parseIsoLocal(addDaysIso(weekStart, 6));
    if (!a || !b) return "";
    function fmt(d) {
      return pad2(d.getDate()) + "/" + pad2(d.getMonth() + 1) + "/" + d.getFullYear();
    }
    return fmt(a) + " - " + fmt(b);
  }

  function defaultHoursWeekStart() {
    var t = isoTodayLocal();
    if (t < HOURS_TERM_FROM) t = HOURS_TERM_FROM;
    if (t > HOURS_TERM_TO) t = HOURS_TERM_TO;
    return mondayOfWeek(t);
  }

  function ensureHoursWeekStart() {
    if (!state.hoursWeekStart) state.hoursWeekStart = defaultHoursWeekStart();
    return state.hoursWeekStart;
  }

  function hoursWeekBounds() {
    var start = ensureHoursWeekStart();
    return { start: start, end: addDaysIso(start, 6) };
  }

  function canHoursWeekPrev() {
    var prevEnd = addDaysIso(addDaysIso(ensureHoursWeekStart(), -7), 6);
    return prevEnd >= HOURS_TERM_FROM;
  }

  function canHoursWeekNext() {
    return addDaysIso(ensureHoursWeekStart(), 7) <= HOURS_TERM_TO;
  }

  function filterDatesToHoursWeek(dates) {
    var b = hoursWeekBounds();
    return (dates || []).filter(function (dr) {
      var iso = String((dr && dr.date) || "").slice(0, 10);
      return iso >= b.start && iso <= b.end;
    });
  }

  function sheetForHoursWeek(sheet) {
    if (!sheet) return sheet;
    var out = {
      venueGroups: sheet.venueGroups || [],
      dates: filterDatesToHoursWeek(sheet.dates),
      placeholder: sheet.placeholder,
    };
    if (sheet.blocks && sheet.blocks.length) {
      out.blocks = sheet.blocks.map(function (block) {
        return {
          venueGroups: block.venueGroups || [],
          dates: filterDatesToHoursWeek(block.dates),
        };
      });
    }
    return out;
  }

  function hoursWeekNavHtml() {
    var start = ensureHoursWeekStart();
    var canPrev = canHoursWeekPrev();
    var canNext = canHoursWeekNext();
    return (
      '<div class="c4k-hub-weekbar card-pad asr-hours-weekbar" style="margin:0 0 12px;min-width:0">' +
      '<div class="c4k-hub-weekbar__left" style="min-width:0">' +
      '<span class="c4k-hub-weekbar__lbl">WEEK (MON-SUN)</span>' +
      '<span class="c4k-hub-weekbar__range" id="asrHoursWeekRange">' +
      esc(formatHoursWeekRangeLabel(start)) +
      "</span></div>" +
      '<div class="c4k-hub-weekbar__btns">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-asr-hours-week="prev"' +
      (canPrev ? "" : " disabled") +
      ">← Prev week</button>" +
      '<button type="button" class="btn btn--sec btn--sm" data-asr-hours-week="this">This week</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-asr-hours-week="next"' +
      (canNext ? "" : " disabled") +
      ">Next week →</button>" +
      "</div></div>"
    );
  }

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

  function resolveRosterRows() {
    try {
      if (
        global.PortalRosterCanonical &&
        typeof global.PortalRosterCanonical.resolveCanonicalRosterRows === "function"
      ) {
        return global.PortalRosterCanonical.resolveCanonicalRosterRows() || [];
      }
    } catch (_e) {}
    var src = global.STAFF_DASHBOARD_SOURCE;
    return src && Array.isArray(src.rows) ? src.rows : [];
  }

  function parseSlotMinutes(timeSlot) {
    var raw = String(timeSlot || "")
      .replace(/\s*-\s*/g, " to ")
      .replace(/\s+/g, " ")
      .trim();
    var parts = raw.split(/\s+to\s+/i);
    if (parts.length < 2) return { start: 0, end: 0 };
    function one(p) {
      var m = String(p || "")
        .trim()
        .match(/^(\d{1,2})(?:[:.](\d{2}))?/);
      if (!m) return 0;
      var h = parseInt(m[1], 10) || 0;
      var min = parseInt(m[2] || "0", 10) || 0;
      /* 1–7 → afternoon (13–19). Keep 8–12 as morning / midday. */
      if (h > 0 && h < 8) h += 12;
      return h * 60 + min;
    }
    return { start: one(parts[0]), end: one(parts[1]) };
  }

  /** "17 to 17.30" / "16:30 to 18:30" → club labels "5 to 5.30" / "4.30 to 6.30". */
  function normalizeClubTimeSlot(timeSlot) {
    var raw = String(timeSlot || "")
      .replace(/\s*-\s*/g, " to ")
      .replace(/\s+/g, " ")
      .trim();
    if (!raw) return "";
    var parts = raw.split(/\s+to\s+/i);
    if (parts.length < 2) return raw;
    function fmt(p) {
      var m = String(p || "")
        .trim()
        .match(/^(\d{1,2})(?:[:.](\d{2}))?/);
      if (!m) return String(p || "").trim();
      var h = parseInt(m[1], 10) || 0;
      var min = parseInt(m[2] || "0", 10) || 0;
      if (h >= 13 && h <= 23) h -= 12;
      if (min === 0) return String(h);
      return h + "." + String(min).padStart(2, "0");
    }
    return fmt(parts[0]) + " to " + fmt(parts[1]);
  }

  function normalizeGroupSessionService(service, venue, area) {
    var svc = String(service || "").trim();
    if (svc && svc !== "—") return svc;
    var v = String(venue || "").toLowerCase();
    var a = String(area || "").toLowerCase();
    if (/acton|northolt/.test(v) || /lane|pool|teaching/.test(a)) return "Aquatic Activity";
    if (/westway/.test(v) || /climb/.test(a)) return "Climbing Activity";
    if (/swimfarm|hub/.test(v) && /bespoke/.test(a)) return "Bespoke Programme";
    return svc || "Aquatic Activity";
  }

  function displayClientLabel(name) {
    var n = String(name || "").trim();
    if (!n) return "";
    var low = n.toLowerCase();
    if (low === "junaid_f" || low === "junaid") return "Junaid";
    if (low.indexOf("_") >= 0) {
      return n
        .split(/_+/)
        .filter(Boolean)
        .map(function (w) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join(" ");
    }
    return n;
  }

  function clientLabelRank(name) {
    var n = String(name || "").trim();
    if (!n) return 0;
    if (/_/.test(n)) return 1;
    if (n === n.toLowerCase()) return 2;
    return 3;
  }

  /** Normalize standing rows so empty-service / 24h junk does not split Aurora/Javier columns. */
  function normalizeGroupSessionRows(rows) {
    var mapped = (rows || []).map(function (r) {
      if (!r) return null;
      var venue = String(r.venue || "").trim();
      var service = normalizeGroupSessionService(r.service, venue, r.area);
      var time = normalizeClubTimeSlot(r.time_slot);
      var client = displayClientLabel(r.client_name);
      return Object.assign({}, r, {
        venue: venue || "—",
        service: service,
        time_slot: time,
        client_name: client || String(r.client_name || "").trim(),
      });
    }).filter(Boolean);

    var best = Object.create(null);
    mapped.forEach(function (r) {
      var instr = String(r.instructors || "").trim().toUpperCase() || "—";
      var mins = parseSlotMinutes(r.time_slot);
      var key =
        instr +
        "|" +
        String(r.venue || "") +
        "|" +
        String(r.service || "") +
        "|" +
        mins.start +
        "-" +
        mins.end +
        "|" +
        String(r.client_name || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "");
      var prev = best[key];
      if (!prev || clientLabelRank(r.client_name) > clientLabelRank(prev.client_name)) {
        best[key] = r;
      }
    });
    return Object.keys(best).map(function (k) {
      return best[k];
    });
  }

  function sortTimeSlots(a, b) {
    return parseSlotMinutes(a).start - parseSlotMinutes(b).start || String(a).localeCompare(String(b));
  }

  function cellKindFromClient(name) {
    var n = String(name || "").trim();
    var low = n.toLowerCase().replace(/_/g, " ");
    if (!n) return { label: "", kind: "empty" };
    if (low === "closed") return { label: "CLOSED", kind: "closed" };
    if (
      low === "no client" ||
      low === "noclient" ||
      low === "no participant" ||
      low === "available" ||
      low === "home" ||
      low === "manager" ||
      low === "shadowing"
    ) {
      return { label: low === "home" || low === "manager" ? n : "NO CLIENT", kind: "available" };
    }
    return { label: n, kind: "client" };
  }

  function compactTimeLabel(timeSlot) {
    return String(timeSlot || "")
      .replace(/\s+to\s+/gi, "-")
      .replace(/\s+/g, "");
  }

  /** Group sessions grid — same standing week / canonical rows as Services. */
  function buildSessionGridsFromRoster(rows) {
    var grids = {};
    WEEKDAYS.forEach(function (day) {
      var iso = STANDING_ISO_BY_DAY[day];
      var dayRows = normalizeGroupSessionRows(
        (rows || []).filter(function (r) {
          return String((r && r.session_date) || "").slice(0, 10) === iso;
        })
      );
      var colMap = Object.create(null);
      var colOrder = [];
      dayRows.forEach(function (r) {
        var instr = String(r.instructors || "").trim().toUpperCase() || "—";
        var venue = String(r.venue || "").trim() || "—";
        var service = String(r.service || "").trim() || "—";
        var id = instr + "|" + venue + "|" + service;
        if (!colMap[id]) {
          colMap[id] = {
            id: id,
            title: instr,
            subtitle: service + " (" + venue + ")",
            venue: venue,
            service: service,
          };
          colOrder.push(id);
        }
      });
      colOrder.sort(function (a, b) {
        var ca = colMap[a];
        var cb = colMap[b];
        return (
          String(ca.venue).localeCompare(String(cb.venue), undefined, { sensitivity: "base" }) ||
          String(ca.service).localeCompare(String(cb.service), undefined, { sensitivity: "base" }) ||
          String(ca.title).localeCompare(String(cb.title), undefined, { sensitivity: "base" })
        );
      });
      var timeByKey = Object.create(null);
      var timeOrder = [];
      dayRows.forEach(function (r) {
        var t = String(r.time_slot || "").trim();
        if (!t) return;
        var mins = parseSlotMinutes(t);
        var tk = mins.start + "-" + mins.end;
        if (!timeByKey[tk]) {
          timeByKey[tk] = t;
          timeOrder.push(tk);
        }
      });
      timeOrder.sort(function (a, b) {
        return sortTimeSlots(timeByKey[a], timeByKey[b]);
      });
      var outRows = timeOrder.map(function (tk) {
        var time = timeByKey[tk];
        var cells = colOrder.map(function (cid) {
          var hits = dayRows.filter(function (r) {
            var instr = String(r.instructors || "").trim().toUpperCase() || "—";
            var venue = String(r.venue || "").trim() || "—";
            var service = String(r.service || "").trim() || "—";
            var mins = parseSlotMinutes(r.time_slot);
            return (
              instr + "|" + venue + "|" + service === cid &&
              mins.start + "-" + mins.end === tk
            );
          });
          if (!hits.length) return { label: "", kind: "empty" };
          var labels = [];
          var seen = Object.create(null);
          hits.forEach(function (h) {
            var nm = String(h.client_name || "").trim();
            if (!nm || seen[nm.toLowerCase()]) return;
            seen[nm.toLowerCase()] = 1;
            labels.push(nm);
          });
          if (!labels.length) return { label: "", kind: "empty" };
          if (labels.length === 1) return cellKindFromClient(labels[0]);
          return { label: labels.join(", "), kind: "client" };
        });
        return { time: time, cells: cells };
      });
      grids[day] = {
        columns: colOrder.map(function (id) {
          return colMap[id];
        }),
        rows: outRows,
      };
    });
    return grids;
  }

  /** Staff no longer on Autumn 26/27 rota (hide from Staff hours standing summary). */
  var DEPARTED_OR_BANK_STAFF = {
    angel: 1,
    bismark: 1,
    bismarck: 1,
    giuseppe: 1,
    luliya: 1,
    lulia: 1,
    aida: 1,
  };

  function staffNameKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  }

  function isHiddenFromAutumnHours(name) {
    return !!DEPARTED_OR_BANK_STAFF[staffNameKey(name)];
  }

  function autumnStaffHoursPayload() {
    return global.PORTAL_AUTUMN_STAFF_HOURS || null;
  }

  function autumnStaffHoursBase() {
    var payload = autumnStaffHoursPayload();
    return payload && payload.staffHours ? payload.staffHours : null;
  }

  /** Standing instructor hours summary (read-only) — same roster as Services. */
  function buildStandingHoursLines(rows) {
    var byDay = {};
    WEEKDAYS.forEach(function (day) {
      var iso = STANDING_ISO_BY_DAY[day];
      var dayRows = (rows || []).filter(function (r) {
        return String((r && r.session_date) || "").slice(0, 10) === iso;
      });
      var byStaff = Object.create(null);
      var order = [];
      dayRows.forEach(function (r) {
        var instr = String(r.instructors || "").trim();
        if (!instr) return;
        if (isHiddenFromAutumnHours(instr)) return;
        var key = instr.toUpperCase();
        if (!byStaff[key]) {
          byStaff[key] = {
            name: instr,
            venue: String(r.venue || "").trim(),
            spans: [],
            startMin: null,
            endMin: null,
          };
          order.push(key);
        }
        var t = String(r.time_slot || "").trim();
        var p = parseSlotMinutes(t);
        if (t) byStaff[key].spans.push(compactTimeLabel(t));
        if (p.start || p.end) {
          if (byStaff[key].startMin == null || p.start < byStaff[key].startMin) {
            byStaff[key].startMin = p.start;
          }
          if (byStaff[key].endMin == null || p.end > byStaff[key].endMin) {
            byStaff[key].endMin = p.end;
          }
        }
        if (!byStaff[key].venue && r.venue) byStaff[key].venue = String(r.venue).trim();
      });
      order.sort(function (a, b) {
        return String(byStaff[a].name).localeCompare(String(byStaff[b].name), undefined, {
          sensitivity: "base",
        });
      });
      byDay[day] = {
        iso: iso,
        lines: order.map(function (k) {
          var s = byStaff[k];
          var unique = [];
          var seenT = Object.create(null);
          (s.spans || []).forEach(function (x) {
            if (!x || seenT[x]) return;
            seenT[x] = 1;
            unique.push(x);
          });
          var span = unique.join(", ");
          return {
            name: s.name,
            venue: s.venue,
            text: s.name + (span ? " " + span : ""),
          };
        }),
      };
    });
    return byDay;
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
    var rosterRows = resolveRosterRows();
    copy.sessionGrids = buildSessionGridsFromRoster(rosterRows);
    copy.meta = Object.assign({}, copy.meta || {}, {
      sessionSource: "canonical_roster_standing",
      sessionWeekLabel: "Standing week (same as Services) · Sat 11–Fri 17 Jul snap",
      syncedWithServices: true,
    });
    copy._standingHours = buildStandingHoursLines(rosterRows);
    var autumnHours = autumnStaffHoursBase();
    var autumnMeta = (autumnStaffHoursPayload() && autumnStaffHoursPayload().meta) || {};
    /* Always prefer Autumn blob; fall back to base only if it is already Autumn-dated. */
    if (autumnHours) {
      copy.staffHours = cloneStaffHours(autumnHours);
    } else if (copy.staffHours) {
      var monDates = (copy.staffHours.Monday && copy.staffHours.Monday.dates) || [];
      var firstIso = monDates[0] && String(monDates[0].date || "").slice(0, 10);
      if (!firstIso || firstIso < HOURS_TERM_FROM) {
        copy.staffHours = { Monday: { venueGroups: [], dates: [], placeholder: true } };
        WEEKDAYS.forEach(function (wd) {
          copy.staffHours[wd] = { venueGroups: [], dates: [], placeholder: true };
        });
      }
    }
    copy.meta = Object.assign({}, copy.meta || {}, {
      hoursFrom: autumnMeta.hoursFrom || HOURS_TERM_FROM,
      hoursTo: autumnMeta.hoursTo || HOURS_TERM_TO,
      termBreakFrom: autumnMeta.termBreakFrom || "2026-10-26",
      termBreakTo: autumnMeta.termBreakTo || "2026-10-30",
      hoursLabel: autumnMeta.hoursLabel || "Autumn Term 2026 (1 Sep - 17 Dec)",
      timetableSource:
        autumnMeta.timetableSource || "database/apply_staff_timetable_autumn_2026.py",
      hoursSource: "autumn_2026",
    });
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
    var meta = (data() && data().meta) || (baseData() && baseData().meta) || {};
    var weekLbl = esc(meta.sessionWeekLabel || "Standing week (same as Services)");
    return (
      '<div class="asr-root" id="adminSpreadsheetRefRoot">' +
      '<h1 class="page-title">Instructor timetable</h1>' +
      '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">' +
      "<strong>Same roster as Services</strong> (re-enrol + machine + new clients + Autumn Day Centre). " +
      "<strong>Group sessions</strong> = clients under each instructor (" +
      weekLbl +
      "). " +
      "<strong>Staff hours</strong> = instructor timetable for that standing week, plus optional dated overrides for payroll.</p>" +
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
      '<p class="muted asr-tab-hint" style="margin:0 0 10px;max-width:52rem;overflow-wrap:break-word">Read-only grid from the <strong>same standing roster as Services</strong>. Change who is booked via <strong>Edit term slot</strong> or <strong>Schedule &amp; Covers</strong>. Instructor hours → <strong>Staff hours</strong> tab.</p>' +
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

  function renderStandingHoursBlock() {
    var d = data();
    var stand = (d && d._standingHours) || null;
    if (!stand) return "";
    var day = state.hoursDay;
    var days = day === "all" ? WEEKDAYS : [day];
    var html =
      '<div class="asr-standing-hours" style="margin:0 0 16px;padding:12px 14px;border:1px solid var(--border,#d7e2e8);border-radius:12px;background:#f8fafc;min-width:0">' +
      '<p class="asr-tab-hint" style="margin:0 0 8px;font-weight:600;max-width:52rem;overflow-wrap:break-word">Standing week · instructor timetable (synced with Services)</p>' +
      '<p class="muted" style="margin:0 0 10px;font-size:12px;max-width:52rem;overflow-wrap:break-word">Who is on when for the ops standing snap. Editable dated overrides for payroll stay in the sheet below.</p>';
    days.forEach(function (wd) {
      var block = stand[wd];
      if (!block || !block.lines || !block.lines.length) {
        html +=
          '<p class="muted" style="margin:0 0 8px">' + esc(wd) + ": no standing roster lines.</p>";
        return;
      }
      html +=
        '<div style="margin:0 0 10px;min-width:0">' +
        '<div style="font-size:12px;font-weight:700;margin:0 0 4px">' +
        esc(wd) +
        (block.iso ? " · " + esc(block.iso) : "") +
        "</div><ul style=\"margin:0;padding-left:1.1rem;max-width:52rem\">";
      block.lines.forEach(function (line) {
        html +=
          "<li style=\"overflow-wrap:break-word;min-width:0\">" +
          esc(line.text) +
          (line.venue ? ' <span class="muted">(' + esc(line.venue) + ")</span>" : "") +
          "</li>";
      });
      html += "</ul></div>";
    });
    html += "</div>";
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
    var staffHours = autumnStaffHoursBase() || (baseData() && baseData().staffHours);
    if (!staffHours) return "";
    var cell = findCellInStaffHours(staffHours, editKey);
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
    ensureHoursWeekStart();
    var day = state.hoursDay;
    var html =
      renderStandingHoursBlock() +
      '<p class="muted asr-tab-hint" style="margin:0 0 10px;max-width:52rem;overflow-wrap:break-word">Below: dated hours sheet for <strong>Autumn Term 2026</strong> (1 Sep - 17 Dec) + saved overrides. Use the week bar to step week by week. Edits sync to dashboards after <strong>Save</strong> - they do not change who is booked in Services.</p>' +
      hoursWeekNavHtml() +
      hoursLegendHtml() +
      weekdaySubtabs(day, "data-asr-hours-day", {
        includeAll: true,
        allLabel: "All week",
        allValue: "all",
      }) +
      serviceSubtabs(state.hoursService, "data-asr-hours-service");
    if (day === "all") {
      WEEKDAYS.forEach(function (wd) {
        var sheet = sheetForHoursWeek(d.staffHours[wd]);
        html +=
          '<section class="asr-hours-day-section" aria-labelledby="asr-hours-day-' +
          esc(wd) +
          '">' +
          '<h3 class="asr-hours-day-section__title" id="asr-hours-day-' +
          esc(wd) +
          '">' +
          esc(wd) +
          "</h3>";
        if (!sheet || !(sheet.dates && sheet.dates.length) && !(sheet.blocks && sheet.blocks.length)) {
          html +=
            '<p class="muted" style="margin:0 0 12px">No Autumn shifts this week for ' +
            esc(wd) +
            ".</p>";
        } else {
          html += renderHoursDaySection(wd, sheet);
        }
        html += "</section>";
      });
      return html + renderChangeLogHtml();
    }
    var one = sheetForHoursWeek(d.staffHours[day]);
    if (!one || (!(one.dates && one.dates.length) && !(one.blocks && one.blocks.length))) {
      html +=
        '<p class="muted" style="margin:12px 0">No Autumn shifts in this week for ' +
        esc(day) +
        ". Use Next week to move into term dates.</p>";
      return html + renderChangeLogHtml();
    }
    return html + renderHoursDaySection(day, one) + renderChangeLogHtml();
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
    root.querySelectorAll("[data-asr-hours-week]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var act = btn.getAttribute("data-asr-hours-week") || "";
        var cur = ensureHoursWeekStart();
        if (act === "prev") {
          if (!canHoursWeekPrev()) return;
          state.hoursWeekStart = addDaysIso(cur, -7);
        } else if (act === "next") {
          if (!canHoursWeekNext()) return;
          state.hoursWeekStart = addDaysIso(cur, 7);
        } else {
          state.hoursWeekStart = defaultHoursWeekStart();
        }
        refreshPanel();
      });
    });
    root.querySelectorAll(".asr-cell-input").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var key = inp.getAttribute("data-asr-edit-key") || "";
        if (!key) return;
        if (!Object.prototype.hasOwnProperty.call(state.dirtyBaseline, key)) {
          var cell = findCellInStaffHours(data() && data().staffHours, key);
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

    if (!global.__ASR_ROSTER_SYNC_BOUND__) {
      global.__ASR_ROSTER_SYNC_BOUND__ = true;
      try {
        global.addEventListener("portal:staff-dashboard-source-updated", function () {
          if (!document.getElementById("adminSpreadsheetRefRoot")) return;
          applyOverridesToMerged().then(refreshPanel);
        });
      } catch (_e) {}
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
