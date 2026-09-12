/**
 * Admin — Instructor timetable (ex Spreadsheet reference).
 * Who is booked = same standing roster as Services (canonical) → Edit term slot.
 * Who works = standing week from that roster + editable dated overrides (Supabase).
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

  /**
   * Standing snap dates for Who is booked / standing hours summary.
   * Autumn week after DC standing starts (Mon 7). Sunday uses 20 Sep so the
   * sample is a normal Aurora Sunday (not Aurora-off cover days 13 Sep / 4 Oct).
   */
  var STANDING_ISO_BY_DAY = {
    Monday: "2026-09-07",
    Tuesday: "2026-09-08",
    Wednesday: "2026-09-09",
    Thursday: "2026-09-10",
    Friday: "2026-09-11",
    Saturday: "2026-09-12",
    Sunday: "2026-09-20",
  };

  var state = {
    tab: "hours",
    sessionDay: "Monday",
    hoursDay: "Monday",
    hoursService: "all",
    /** term = all Autumn dates for that weekday; week = one Mon-Sun strip */
    hoursRange: "term",
    hoursWeekStart: null,
    dirty: Object.create(null),
    dirtyBaseline: Object.create(null),
    saving: false,
    mergedData: null,
    overrideLog: [],
    authorById: Object.create(null),
    /** iso YYYY-MM-DD -> [{ key, label }] from staff_unavailability (same as Overview). */
    dayOffByDate: Object.create(null),
    /** Active cell picker: { editKey, wrap } */
    pick: null,
  };

  /** First-name labels used on Autumn hours sheet (clickable pick list). */
  var AUTUMN_HOURS_STAFF_SEED = [
    "Alex",
    "Aurora",
    "Berta",
    "Bismark",
    "Carlos",
    "Emmanuel",
    "Emanuel",
    "Fadi",
    "Godsway",
    "Javier",
    "Javi",
    "Joelle",
    "John",
    "Luliya",
    "Michelle",
    "Patrick",
    "Raul",
    "Roberto",
    "Simon",
    "Victor",
    "Youssef",
    "Yusuf",
  ];

  var COMMON_HOURS_BANDS = [
    "9-12",
    "9.15-12",
    "10-11",
    "10.45-4.15",
    "11-3",
    "11-4",
    "12-1",
    "12.30-3",
    "12.30-4",
    "1-2",
    "1-3",
    "2-3",
    "3-4",
    "3.30-5",
    "4-5",
    "4-6",
    "4-6.30",
    "4.15-6.15",
    "4.30-6.30",
    "5-6",
  ];

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

  /** First Autumn date for this weekday (Edit term slot needs a term-window anchor). */
  function autumnAnchorForWeekday(dayName) {
    var want = String(dayName || "").trim();
    var iso = HOURS_TERM_FROM;
    var guard = 0;
    while (iso <= HOURS_TERM_TO && guard < 14) {
      var d = parseIsoLocal(iso);
      if (!d) break;
      var long = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
        d.getDay()
      ];
      if (long === want) return iso;
      iso = addDaysIso(iso, 1);
      guard += 1;
    }
    return HOURS_TERM_FROM;
  }

  function encodeTermEditPayload(obj) {
    try {
      return encodeURIComponent(JSON.stringify(obj || {}));
    } catch (_e) {
      return "";
    }
  }

  function decodeTermEditPayload(raw) {
    try {
      return JSON.parse(decodeURIComponent(String(raw || ""))) || null;
    } catch (_e) {
      return null;
    }
  }

  function openTermSlotFromBookedCell(prefill) {
    if (!prefill) return;
    if (typeof global.portalAdminOpenTermSlotEdit === "function") {
      global.portalAdminOpenTermSlotEdit(prefill);
      return;
    }
    if (global.AdminTermSlot && typeof global.AdminTermSlot.openWithPrefill === "function") {
      global.AdminTermSlot.openWithPrefill(prefill);
    }
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

  function filterDatesToHoursTerm(dates) {
    return (dates || []).filter(function (dr) {
      var iso = String((dr && dr.date) || "").slice(0, 10);
      return iso >= HOURS_TERM_FROM && iso <= HOURS_TERM_TO;
    });
  }

  function sheetForHoursRange(sheet) {
    if (!sheet) return sheet;
    if (state.hoursRange === "week") return sheetForHoursWeek(sheet);
    var out = {
      venueGroups: sheet.venueGroups || [],
      dates: filterDatesToHoursTerm(sheet.dates),
      placeholder: sheet.placeholder,
    };
    if (sheet.blocks && sheet.blocks.length) {
      out.blocks = sheet.blocks.map(function (block) {
        return {
          venueGroups: block.venueGroups || [],
          dates: filterDatesToHoursTerm(block.dates),
        };
      });
    }
    return out;
  }

  function splitStaffHoursNameTime(text) {
    var raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return { name: "", time: "" };
    var m = raw.match(
      /^(.+?)\s+(\d{1,2}(?:[.:]\d{2})?\s*-\s*\d{1,2}(?:[.:]\d{2})?)(.*)$/,
    );
    if (!m) return { name: raw, time: "" };
    var name = String(m[1] || "").trim();
    var time = String(m[2] || "").replace(/\s+/g, "");
    var extra = String(m[3] || "").trim();
    if (extra) time = time + " " + extra;
    return { name: name, time: time };
  }

  function hoursRangeToggleHtml() {
    return (
      '<div class="asr-subtabs asr-subtabs--range" role="tablist" aria-label="Hours date range">' +
      '<button type="button" class="btn btn--ghost btn--sm' +
      (state.hoursRange === "term" ? " is-active" : "") +
      '" data-asr-hours-range="term">Whole term</button>' +
      '<button type="button" class="btn btn--ghost btn--sm' +
      (state.hoursRange === "week" ? " is-active" : "") +
      '" data-asr-hours-range="week">One week</button>' +
      "</div>"
    );
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

  /** Who is booked grid — same standing week / canonical rows as Services. */
  function buildSessionGridsFromRoster(rows) {
    var grids = {};
    WEEKDAYS.forEach(function (day) {
      var iso = STANDING_ISO_BY_DAY[day];
      var termAnchor = autumnAnchorForWeekday(day);
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
          if (!hits.length) return { label: "", kind: "empty", edits: [] };
          var labels = [];
          var seen = Object.create(null);
          var edits = [];
          hits.forEach(function (h) {
            var nm = String(h.client_name || "").trim();
            if (!nm || seen[nm.toLowerCase()]) return;
            seen[nm.toLowerCase()] = 1;
            labels.push(nm);
            var kindInfo = cellKindFromClient(nm);
            edits.push({
              anchorDate: termAnchor,
              client_name: nm,
              service: String(h.service || "").trim(),
              time_slot: String(h.time_slot || time || "").trim(),
              instructors: String(h.instructors || "").trim(),
              venue: String(h.venue || "").trim(),
              area: String(h.area || "").trim(),
              scope: "weekday_term",
              action: "update",
              label: kindInfo.label || nm,
              kind: kindInfo.kind,
            });
          });
          if (!labels.length) return { label: "", kind: "empty", edits: [] };
          if (labels.length === 1) {
            var one = cellKindFromClient(labels[0]);
            return { label: one.label, kind: one.kind, edits: edits };
          }
          return { label: labels.join(", "), kind: "client", edits: edits };
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
      sessionWeekLabel: "Autumn Term 2026 standing week (DC from 1 Sep, weekends Sat 5, after-school Mon 7)",
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
    var weekLbl = esc(meta.sessionWeekLabel || "Autumn Term 2026 standing week");
    return (
      '<div class="asr-root" id="adminSpreadsheetRefRoot">' +
      '<h1 class="page-title">Instructor timetable</h1>' +
      '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">' +
      "<strong>Who works</strong> = instructor name + hours for every Monday (or Tue…) in Autumn — edit and Save. " +
      "Does not change who is booked in Services / MADRE (use Edit term slot for that). " +
      "<strong>Day off · COVER</strong> on a date comes from the same <code>staff_unavailability</code> as Sessions Overview (Validate day / HR). " +
      "<strong>Who is booked</strong> = standing client seats (" +
      weekLbl +
      ") — click a name to open Edit term slot (every matching weekday).</p>" +
      '<div class="asr-tabs" role="tablist">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-asr-tab="sessions">Who is booked</button>' +
      '<button type="button" class="btn btn--ghost btn--sm is-active" data-asr-tab="hours">Who works</button>' +
      "</div>" +
      '<div class="asr-toolbar" id="asrToolbar">' +
      '<button type="button" class="btn btn--pri btn--sm" id="asrSaveBtn">Save staff hours</button>' +
      '<span class="muted" id="asrSaveStatus" style="font-size:12px;min-width:0;overflow-wrap:break-word"></span>' +
      "</div>" +
      '<div id="adminSpreadsheetRefPanel" class="asr-panel-host"></div>' +
      staffHoursPickHtml() +
      "</div>"
    );
  }

  function sessionLegendHtml() {
    return (
      '<div class="asr-legend" aria-label="Booked cell legend">' +
      '<span><i class="asr-swatch" style="background:#fef08a"></i> No client / available</span>' +
      '<span><i class="asr-swatch" style="background:#1e3a5f"></i> Closed</span>' +
      "<span>Click a name → Edit term slot</span>" +
      "</div>"
    );
  }

  function hoursLegendHtml() {
    return (
      '<div class="asr-legend" aria-label="Staff hours legend">' +
      "<span>Scroll horizontally for all venues · edits sync to dashboards after Save</span>" +
      '<span><i class="asr-swatch" style="background:#eff6ff;border-color:#93c5fd"></i> Saved override (blue text)</span>' +
      '<span><i class="asr-swatch" style="background:#fff7ed;border-color:#fdba74"></i> Day off · COVER (staff_unavailability)</span>' +
      "<span>Click cell → pick staff / hours</span>" +
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
      '<p class="muted asr-tab-hint" style="margin:0 0 10px;max-width:52rem;overflow-wrap:break-word">Standing seats from the <strong>same roster as Services</strong>. Click a participant (or open seat) to open <strong>Edit term slot</strong> for every matching weekday in Autumn. One-day covers stay in <strong>Schedule &amp; Covers</strong>. Instructor hours → <strong>Who works</strong>.</p>' +
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
        var edits = cell.edits || [];
        if (!edits.length || kind === "closed") {
          html += '<td class="asr-cell--' + kind + '">' + esc(cell.label || "") + "</td>";
          return;
        }
        html +=
          '<td class="asr-cell--' +
          kind +
          ' asr-cell--booked">' +
          edits
            .map(function (ed) {
              if (ed.kind === "closed") return esc(ed.label || "CLOSED");
              var payload = {
                anchorDate: ed.anchorDate,
                client_name: ed.client_name,
                service: ed.service,
                time_slot: ed.time_slot,
                instructors: ed.instructors,
                venue: ed.venue,
                area: ed.area,
                scope: ed.scope || "weekday_term",
                action: ed.action || "update",
              };
              var chipKind = ed.kind === "available" ? " available" : "";
              var chipLabel = ed.label || ed.client_name || "Open";
              var areaNote = String(ed.area || "").trim();
              return (
                '<button type="button" class="asr-booked-chip' +
                chipKind +
                '" data-asr-term-edit="' +
                esc(encodeTermEditPayload(payload)) +
                '" title="Edit term slot' +
                (areaNote ? " · " + esc(areaNote) : "") +
                '">' +
                esc(chipLabel) +
                (areaNote
                  ? '<span class="asr-booked-chip__area">' + esc(areaNote) + "</span>"
                  : "") +
                "</button>"
              );
            })
            .join(" ") +
          "</td>";
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
      '<p class="asr-tab-hint" style="margin:0 0 8px;font-weight:600;max-width:52rem;overflow-wrap:break-word">Autumn Term 2026 standing week · instructor timetable (synced with Services)</p>' +
      '<p class="muted" style="margin:0 0 10px;font-size:12px;max-width:52rem;overflow-wrap:break-word">Who is on when for Autumn: Day Centre from 1 Sep, weekends from Sat 5 Sep, after-school from Mon 7 Sep. Editable dated overrides for payroll stay in the sheet below. Orange Day off · COVER badges on dated rows come from live staff_unavailability (not this standing snapshot).</p>';
    days.forEach(function (wd) {
      var block = stand[wd];
      if (!block || !block.lines || !block.lines.length) {
        html +=
          '<p class="muted" style="margin:0 0 8px">' + esc(wd) + ": no standing roster lines.</p>";
        return;
      }
      var sampleIso = block.iso || STANDING_ISO_BY_DAY[wd] || "";
      var sampleOffs = dayOffsForIso(sampleIso);
      html +=
        '<div style="margin:0 0 10px;min-width:0">' +
        '<div style="font-size:12px;font-weight:700;margin:0 0 4px">' +
        esc(wd) +
        (sampleIso ? ' <span class="muted">(' + esc(sampleIso) + ")</span>" : "") +
        "</div>";
      if (sampleOffs.length) {
        html +=
          '<p class="asr-standing-dayoffs" style="margin:0 0 6px;font-size:12px;min-width:0;overflow-wrap:break-word">' +
          sampleOffs
            .map(function (o) {
              return (
                '<span class="asr-dayoff-chip">' +
                esc(o.label) +
                " · Day off</span>"
              );
            })
            .join(" ") +
          "</p>";
      }
      html += "<ul style=\"margin:0;padding-left:1.1rem;max-width:52rem\">";
      block.lines.forEach(function (line) {
        var away = sampleIso && staffAwayOnIso(line.name, sampleIso);
        html +=
          "<li style=\"overflow-wrap:break-word;min-width:0\">" +
          esc(line.text) +
          (line.venue ? ' <span class="muted">(' + esc(line.venue) + ")</span>" : "") +
          (away
            ? ' <span class="asr-dayoff-chip">Day off · COVER</span>'
            : "") +
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

  /** Same live day-off source as Sessions Overview (Validate day / HR Add day off). */
  function loadDayOffs() {
    var client = cfg.getClient();
    if (!client) {
      state.dayOffByDate = Object.create(null);
      return Promise.resolve();
    }
    return client
      .from("staff_unavailability")
      .select("staff_name,name_key,off_date,reason")
      .gte("off_date", HOURS_TERM_FROM)
      .lte("off_date", HOURS_TERM_TO)
      .then(function (res) {
        if (res.error) throw res.error;
        var map = Object.create(null);
        (res.data || []).forEach(function (r) {
          if (!r) return;
          var iso = String(r.off_date || "").slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
          var key = staffNameKey(r.name_key || r.staff_name || "");
          if (!key) return;
          var label = String(r.staff_name || r.name_key || "").trim() || key;
          if (!map[iso]) map[iso] = [];
          if (
            map[iso].some(function (x) {
              return x.key === key;
            })
          ) {
            return;
          }
          map[iso].push({ key: key, label: label });
        });
        state.dayOffByDate = map;
      })
      .catch(function () {
        state.dayOffByDate = Object.create(null);
      });
  }

  function dayOffsForIso(iso) {
    return state.dayOffByDate[String(iso || "").slice(0, 10)] || [];
  }

  function staffAwayOnIso(staffRaw, iso) {
    var key = staffNameKey(staffRaw);
    if (!key) return false;
    return dayOffsForIso(iso).some(function (x) {
      return x.key === key;
    });
  }

  function dateDayOffChipsHtml(iso) {
    var offs = dayOffsForIso(iso);
    if (!offs.length) return "";
    return (
      '<div class="asr-date-dayoffs" title="From staff_unavailability (same as Overview)">' +
      offs
        .map(function (o) {
          return (
            '<span class="asr-dayoff-chip">' +
            esc(o.label) +
            " · Day off</span>"
          );
        })
        .join("") +
      "</div>"
    );
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

  function composeStaffHoursText(name, time) {
    var n = String(name || "").trim();
    var t = String(time || "")
      .replace(/\s+/g, "")
      .trim();
    if (!n && !t) return "";
    if (!n) return t;
    if (!t) return n;
    return n + " " + t;
  }

  function collectStaffPickNames() {
    var seen = Object.create(null);
    var out = [];
    function push(raw) {
      var n = String(raw || "").trim();
      if (!n) return;
      var first = n.split(/\s+/)[0];
      if (!first || /^no$/i.test(first) || /^closed$/i.test(first)) return;
      var key = staffNameKey(first);
      if (!key || seen[key]) return;
      if (isHiddenFromAutumnHours(first) && !/luliya|lulia/i.test(first)) return;
      seen[key] = 1;
      out.push(first.charAt(0).toUpperCase() + first.slice(1));
    }
    AUTUMN_HOURS_STAFF_SEED.forEach(push);
    var sh = data() && data().staffHours;
    if (sh) {
      Object.keys(sh).forEach(function (day) {
        var sheet = sh[day];
        if (!sheet) return;
        function scanCells(cells) {
          (cells || []).forEach(function (cell) {
            push(splitStaffHoursNameTime(cell && cell.text).name);
          });
        }
        (sheet.dates || []).forEach(function (dr) {
          scanCells(dr.cells);
        });
        (sheet.blocks || []).forEach(function (block) {
          (block.dates || []).forEach(function (dr) {
            scanCells(dr.cells);
          });
        });
      });
    }
    try {
      resolveRosterRows().forEach(function (r) {
        String((r && r.instructors) || "")
          .split(/[,+/|]/)
          .forEach(function (part) {
            push(part);
          });
      });
    } catch (_e) {}
    out.sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
    return out;
  }

  function collectTimePickBands(dayName, colIdx) {
    var seen = Object.create(null);
    var out = [];
    function push(raw) {
      var t = String(raw || "")
        .replace(/\s+/g, "")
        .trim();
      if (!t || !/\d/.test(t) || seen[t]) return;
      seen[t] = 1;
      out.push(t);
    }
    COMMON_HOURS_BANDS.forEach(push);
    var sh = data() && data().staffHours;
    var sheet = sh && sh[dayName];
    if (sheet) {
      function scanDates(dates) {
        (dates || []).forEach(function (dr) {
          var cell = (dr.cells || [])[colIdx];
          if (!cell) return;
          push(splitStaffHoursNameTime(cell.text).time);
        });
      }
      scanDates(sheet.dates);
      (sheet.blocks || []).forEach(function (block) {
        scanDates(block.dates);
      });
    }
    return out;
  }

  function updateCellWrapFace(wrap, val, iso) {
    if (!wrap) return;
    var parts = splitStaffHoursNameTime(val);
    var away = !!(iso && parts.name && staffAwayOnIso(parts.name, iso));
    wrap.classList.toggle("asr-cell-wrap--dayoff", away);
    var nameEl = wrap.querySelector(".asr-cell-face__name");
    var timeEl = wrap.querySelector(".asr-cell-face__time");
    var badge = wrap.querySelector(".asr-dayoff-badge");
    if (nameEl) nameEl.textContent = parts.name || (val ? val : "·");
    if (timeEl) {
      if (parts.time) {
        timeEl.textContent = parts.time;
        timeEl.hidden = false;
      } else {
        timeEl.textContent = "";
        timeEl.hidden = true;
      }
    }
    if (away && !badge) {
      var face = wrap.querySelector(".asr-cell-face");
      if (face) {
        var span = document.createElement("span");
        span.className = "asr-dayoff-badge";
        span.title = "staff_unavailability — same as Overview";
        span.textContent = "Day off · COVER";
        face.appendChild(span);
      }
    } else if (!away && badge) {
      badge.remove();
    }
  }

  function setCellAssignment(wrap, val) {
    if (!wrap) return;
    var key = wrap.getAttribute("data-asr-edit-key") || "";
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(state.dirtyBaseline, key)) {
      var cell = findCellInStaffHours(data() && data().staffHours, key);
      state.dirtyBaseline[key] = cell ? String(cell.text || "") : "";
    }
    var next = String(val || "").trim();
    var base = state.dirtyBaseline[key];
    if (next === String(base || "").trim()) {
      delete state.dirty[key];
      wrap.classList.remove("asr-cell-input--dirty");
      wrap.classList.toggle(
        "asr-cell-input--saved",
        !!(function () {
          var c = findCellInStaffHours(data() && data().staffHours, key);
          return c && (c.overridden || c.tone === "updated");
        })()
      );
    } else {
      state.dirty[key] = next;
      wrap.classList.add("asr-cell-input--dirty");
      wrap.classList.remove("asr-cell-input--saved");
    }
    wrap.setAttribute("data-asr-value", next);
    var iso = wrap.getAttribute("data-asr-iso") || "";
    updateCellWrapFace(wrap, next, iso);
    var typeInp = wrap.querySelector(".asr-cell-input--type");
    if (typeInp) typeInp.value = next;
    updateToolbar();
  }

  function closeStaffHoursPick() {
    var pop = document.getElementById("asrStaffHoursPick");
    if (pop) pop.hidden = true;
    if (state.pick && state.pick.wrap) {
      state.pick.wrap.classList.remove("asr-cell-wrap--picking");
      state.pick.wrap.classList.remove("asr-cell-wrap--type");
    }
    state.pick = null;
  }

  function renderPickChips(host, items, kind, activeVal) {
    if (!host) return;
    var activeKey =
      kind === "staff" ? staffNameKey(activeVal) : String(activeVal || "").replace(/\s+/g, "");
    host.innerHTML = items
      .map(function (item) {
        var label = String(item);
        var isActive =
          kind === "staff"
            ? staffNameKey(label) === activeKey
            : String(label).replace(/\s+/g, "") === activeKey;
        return (
          '<button type="button" class="asr-pick-chip' +
          (isActive ? " is-active" : "") +
          '" data-asr-pick="' +
          esc(kind) +
          '" data-asr-pick-val="' +
          esc(label) +
          '">' +
          esc(label) +
          "</button>"
        );
      })
      .join("");
  }

  function openStaffHoursPick(wrap) {
    if (!wrap) return;
    var root = document.getElementById("adminSpreadsheetRefRoot");
    var pop = document.getElementById("asrStaffHoursPick");
    if (!root || !pop) return;
    closeStaffHoursPick();
    state.pick = { editKey: wrap.getAttribute("data-asr-edit-key") || "", wrap: wrap };
    wrap.classList.add("asr-cell-wrap--picking");
    var val = wrap.getAttribute("data-asr-value") || "";
    var parts = splitStaffHoursNameTime(val);
    var dayName = wrap.getAttribute("data-asr-day") || state.hoursDay || "Monday";
    var colIdx = Number(wrap.getAttribute("data-asr-col") || 0);
    renderPickChips(
      pop.querySelector("[data-asr-pick-staff]"),
      collectStaffPickNames(),
      "staff",
      parts.name
    );
    renderPickChips(
      pop.querySelector("[data-asr-pick-times]"),
      collectTimePickBands(dayName, colIdx),
      "time",
      parts.time
    );
    pop.hidden = false;
    var rect = wrap.getBoundingClientRect();
    var rootRect = root.getBoundingClientRect();
    var top = rect.bottom - rootRect.top + root.scrollTop + 6;
    var left = rect.left - rootRect.left + root.scrollLeft;
    var maxLeft = Math.max(8, root.clientWidth - 320);
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    pop.style.top = top + "px";
    pop.style.left = left + "px";
  }

  function staffHoursPickHtml() {
    return (
      '<div id="asrStaffHoursPick" class="asr-pick" hidden role="dialog" aria-label="Pick staff and hours">' +
      '<p class="asr-pick__title">Pick staff + hours</p>' +
      '<div class="asr-pick__sec"><div class="asr-pick__lbl">Staff</div>' +
      '<div class="asr-pick__chips" data-asr-pick-staff></div></div>' +
      '<div class="asr-pick__sec"><div class="asr-pick__lbl">Hours</div>' +
      '<div class="asr-pick__chips" data-asr-pick-times></div></div>' +
      '<div class="asr-pick__actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-asr-pick-clear>Clear</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-asr-pick-type>Type…</button>' +
      '<button type="button" class="btn btn--sec btn--sm" data-asr-pick-done>Done</button>' +
      "</div></div>"
    );
  }

  function cellInputHtml(cell, iso, colIdx, dayName) {
    var key = cell.editKey || "";
    var val = state.dirty[key] != null ? state.dirty[key] : cell.text || "";
    var parts = splitStaffHoursNameTime(val);
    var dirtyCls = state.dirty[key] != null ? " asr-cell-input--dirty" : "";
    var savedCls =
      state.dirty[key] == null && (cell.overridden || cell.tone === "updated")
        ? " asr-cell-input--saved asr-tone--updated"
        : "";
    var tone =
      cell.tone && state.dirty[key] == null && !savedCls
        ? " asr-tone--" + cell.tone
        : "";
    var away = !!(iso && parts.name && staffAwayOnIso(parts.name, iso));
    var dayOffCls = away ? " asr-cell-wrap--dayoff" : "";
    var face =
      '<span class="asr-cell-face" aria-hidden="true">' +
      '<span class="asr-cell-face__name">' +
      esc(parts.name || (val ? val : "·")) +
      "</span>" +
      (parts.time
        ? '<span class="asr-cell-face__time">' + esc(parts.time) + "</span>"
        : '<span class="asr-cell-face__time" hidden></span>') +
      (away
        ? '<span class="asr-dayoff-badge" title="staff_unavailability — same as Overview">Day off · COVER</span>'
        : "") +
      "</span>";
    return (
      '<div class="asr-cell-wrap' +
      dirtyCls +
      savedCls +
      tone +
      dayOffCls +
      '" role="button" tabindex="0" title="Click to pick staff + hours" data-asr-edit-key="' +
      esc(key) +
      '" data-asr-value="' +
      esc(val) +
      '" data-asr-iso="' +
      esc(iso || "") +
      '" data-asr-col="' +
      esc(String(colIdx == null ? 0 : colIdx)) +
      '" data-asr-day="' +
      esc(dayName || "") +
      '">' +
      face +
      '<input type="text" class="asr-cell-input asr-cell-input--type" value="' +
      esc(val) +
      '" aria-label="Type staff assignment name and hours" tabindex="-1" />' +
      "</div>"
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

  function asrIcoCalendar() {
    return (
      '<svg class="asr-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M8 3v4M16 3v4M3 11h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function asrIcoVenue(style) {
    var s = String(style || "");
    if (s === "northolt" || s === "acton") {
      return (
        '<svg class="asr-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M4 20V9l8-5 8 5v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="2"/>' +
        "</svg>"
      );
    }
    if (s.indexOf("swimfarm") >= 0) {
      return (
        '<svg class="asr-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M3 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M3 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        "</svg>"
      );
    }
    return (
      '<svg class="asr-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
      "</svg>"
    );
  }

  function flattenHoursVenueLabels(groups) {
    var labels = [];
    (groups || []).forEach(function (g) {
      var span = Number(g.span) || 1;
      for (var i = 0; i < span; i++) {
        labels.push({ style: g.style || "default", idx: i, venue: g.venue || "" });
      }
    });
    return labels;
  }

  function venueServiceUnderName(style) {
    var st = String(style || "");
    if (st === "northolt" || st === "acton") return "Aquatic Activity";
    if (st === "westway") return "Climbing Activity";
    return "";
  }

  var SUNDAY_SF_SWIM = {
    aurora: 1,
    berta: 1,
    emmanuel: 1,
  };
  var SUNDAY_SF_SUPPORT = {
    godsway: 1,
    javier: 1,
    javi: 1,
    roberto: 1,
  };

  function staffKeyFromHoursText(text) {
    var m = String(text || "")
      .trim()
      .match(/^([A-Za-z]+)/);
    return m ? m[1].toLowerCase() : "";
  }

  function columnServiceFromCell(venueStyle, cell, dayName) {
    var st = String(venueStyle || "");
    if (st === "northolt" || st === "acton") return "Aquatic Activity";
    if (st === "westway") return "Climbing Activity";
    if (st.indexOf("swimfarm") < 0) return venueServiceUnderName(st) || "";
    var day = String(dayName || "").toLowerCase();
    var band = String((cell && cell.band) || "")
      .toLowerCase()
      .trim();
    var text = String((cell && cell.text) || "");
    if (day === "saturday") {
      return "Aquatic Activity";
    }
    if (day === "sunday") {
      if (band === "day_centre" || band === "dc") return "Day Centre";
      if (band === "bespoke" || /\b4\.15-6\.15\b/.test(text)) return "Bespoke";
      var who = staffKeyFromHoursText(text);
      if (SUNDAY_SF_SUPPORT[who]) return "Multi-Activity";
      if (SUNDAY_SF_SWIM[who]) return "Aquatic & Multi-Activity";
      return "Aquatic & Multi-Activity";
    }
    if (/\b4\.15\s*-\s*6\.15\b/.test(text) || /\b4\.15-6\.15\b/.test(text)) {
      return "Bespoke";
    }
    if (band === "bespoke") return "Bespoke";
    if (band === "day_centre" || band === "dc") return "Day Centre";
    if (band === "pool" && /4\.15/.test(text)) return "Bespoke";
    if (band === "pool" || band === "other" || !band) return "Day Centre";
    return "Day Centre";
  }

  function inferColumnServices(groups, dates, dayName) {
    var labels = flattenHoursVenueLabels(groups);
    return labels.map(function (lab, i) {
      var counts = Object.create(null);
      (dates || []).forEach(function (dr) {
        var cell = (dr.cells || [])[i];
        if (!cell) return;
        var raw = String(cell.text || "").trim();
        if (!raw && !(cell.band || "").trim()) return;
        var svc = columnServiceFromCell(lab.style, cell, dayName);
        if (!svc) return;
        counts[svc] = (counts[svc] || 0) + 1;
      });
      var best = "";
      var bestN = 0;
      Object.keys(counts).forEach(function (k) {
        if (counts[k] > bestN) {
          bestN = counts[k];
          best = k;
        }
      });
      if (best) return best;
      var weekendSun = String(dayName || "").toLowerCase() === "sunday";
      var weekendSat = String(dayName || "").toLowerCase() === "saturday";
      if (String(lab.style || "").indexOf("swimfarm") >= 0) {
        if (weekendSat) return "Aquatic Activity";
        if (weekendSun) return "Aquatic & Multi-Activity";
        return "Day Centre";
      }
      return venueServiceUnderName(lab.style) || "";
    });
  }

  function serviceHeaderSegments(groups, columnServices) {
    var segs = [];
    var col = 0;
    (groups || []).forEach(function (g) {
      var span = Number(g.span) || 1;
      var i = 0;
      while (i < span) {
        var svc = columnServices[col + i] || "";
        var run = 1;
        while (i + run < span && columnServices[col + i + run] === svc) run += 1;
        segs.push({
          label: svc,
          span: run,
          style: g.style || "default",
          start: i === 0,
          svcStart: true,
        });
        i += run;
      }
      col += span;
    });
    return segs;
  }

  function serviceSlug(label) {
    return String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function serviceSortRank(svc, venueStyle) {
    var s = String(svc || "");
    var st = String(venueStyle || "");
    if (st.indexOf("swimfarm") >= 0) {
      if (s === "Bespoke" || s === "Aquatic & Multi-Activity") return 0;
      if (s === "Day Centre" || s === "Multi-Activity") return 1;
      if (s === "Aquatic Activity") return 0;
      return 2;
    }
    return 0;
  }

  function reorderColumnsByService(groups, dates, dayName) {
    var columnServices = inferColumnServices(groups, dates, dayName);
    var order = [];
    var col = 0;
    (groups || []).forEach(function (g) {
      var span = Number(g.span) || 1;
      var idxs = [];
      for (var i = 0; i < span; i++) idxs.push(col + i);
      idxs.sort(function (a, b) {
        return (
          serviceSortRank(columnServices[a], g.style) -
            serviceSortRank(columnServices[b], g.style) ||
          a - b
        );
      });
      idxs.forEach(function (oldIdx) {
        order.push(oldIdx);
      });
      col += span;
    });
    var changed = order.some(function (oldIdx, newIdx) {
      return oldIdx !== newIdx;
    });
    if (!changed) {
      return { groups: groups, dates: dates, columnServices: columnServices };
    }
    var newServices = order.map(function (oldIdx) {
      return columnServices[oldIdx] || "";
    });
    var newDates = (dates || []).map(function (dr) {
      var cells = dr.cells || [];
      return Object.assign({}, dr, {
        cells: order.map(function (oldIdx) {
          return cells[oldIdx] || { text: "", editKey: "", band: "" };
        }),
      });
    });
    return { groups: groups, dates: newDates, columnServices: newServices };
  }

  function renderHoursTableHtml(groups, dates, blockTitle, serviceFilter, dayName) {
    if (!groups.length) {
      return '<p class="muted">No columns.</p>';
    }
    var sf = serviceFilter || "all";
    var reordered = reorderColumnsByService(groups, dates, dayName);
    groups = reordered.groups;
    dates = reordered.dates;
    var columnServices = reordered.columnServices;
    var filteredDates = (dates || []).filter(function (dr) {
      if (sf === "all") return true;
      return (dr.cells || []).some(function (cell) {
        return cellMatchesServiceFilter(cell, sf);
      });
    });
    if (!filteredDates.length) {
      return '<p class="muted">No assignments for this service on the selected day.</p>';
    }
    var labels = flattenHoursVenueLabels(groups);
    var svcSegs = serviceHeaderSegments(groups, columnServices);
    var html = "";
    if (blockTitle) {
      html += '<p class="asr-hours-block__title">' + esc(blockTitle) + "</p>";
    }
    html += '<div class="asr-scroll asr-hours-block"><table class="asr-grid asr-hours"><thead>';
    html +=
      '<tr><th rowspan="2" class="asr-date"><span class="asr-head">' +
      asrIcoCalendar() +
      "<span>Dates</span></span></th>";
    groups.forEach(function (g) {
      var st = g.style || "default";
      html +=
        '<th colspan="' +
        g.span +
        '" class="asr-venue--' +
        esc(st) +
        ' asr-venue-start"><span class="asr-head">' +
        asrIcoVenue(st) +
        "<span>" +
        esc(g.venue) +
        "</span></span></th>";
    });
    html += "</tr><tr>";
    svcSegs.forEach(function (seg) {
      var slug = serviceSlug(seg.label);
      html +=
        '<th colspan="' +
        seg.span +
        '" class="asr-svc asr-venue--' +
        esc(seg.style) +
        (seg.start ? " asr-venue-start" : "") +
        (seg.svcStart && !seg.start ? " asr-svc-start" : "") +
        (slug ? " asr-svc--" + esc(slug) : "") +
        '">' +
        esc(seg.label || "") +
        "</th>";
    });
    html += "</tr></thead><tbody>";
    filteredDates.forEach(function (dr) {
      var iso = String(dr.date || "").slice(0, 10);
      var rowOff = dayOffsForIso(iso).length ? " asr-row--has-dayoff" : "";
      html +=
        '<tr class="asr-row--' +
        esc(dr.status || "confirmed") +
        rowOff +
        '"><td class="asr-date">' +
        esc(dr.label || dr.date) +
        dateDayOffChipsHtml(iso) +
        "</td>";
      (dr.cells || []).forEach(function (cell, idx) {
        var lab = labels[idx] || { style: "default", idx: 0 };
        var svcSlug = serviceSlug(columnServices[idx] || "");
        var prevSlug = idx > 0 ? serviceSlug(columnServices[idx - 1] || "") : "";
        var tdCls =
          "asr-venue-body--" +
          esc(lab.style || "default") +
          (lab.idx === 0 ? " asr-venue-start" : "") +
          (svcSlug && String(lab.style || "").indexOf("swimfarm") >= 0
            ? " asr-sf-svc--" + esc(svcSlug)
            : "") +
          (svcSlug && prevSlug && svcSlug !== prevSlug ? " asr-svc-start" : "");
        if (sf !== "all" && !cellMatchesServiceFilter(cell, sf)) {
          html += '<td class="' + tdCls + ' asr-cell--muted-filter">—</td>';
          return;
        }
        html += '<td class="' + tdCls + '">' + cellInputHtml(cell, iso, idx, dayName) + "</td>";
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
      return '<p class="muted">No staff hours for ' + esc(day) + " in Autumn Term 2026.</p>";
    }
    var html = "";
    if (sheet.blocks && sheet.blocks.length) {
      sheet.blocks.forEach(function (block) {
        html += renderHoursTableHtml(
          block.venueGroups || [],
          block.dates || [],
          "",
          state.hoursService,
          day
        );
      });
      return html;
    }
    return renderHoursTableHtml(
      sheet.venueGroups || [],
      sheet.dates || [],
      "",
      state.hoursService,
      day
    );
  }

  function renderHoursPanel() {
    var d = data();
    if (!d || !d.staffHours) {
      return '<p class="muted">Staff hours data not loaded.</p>';
    }
    ensureHoursWeekStart();
    var day = state.hoursDay;
    var rangeHint =
      state.hoursRange === "term"
        ? "Showing <strong>every " +
          (day === "all" ? "weekday" : day) +
          "</strong> in Autumn Term 2026 (1 Sep - 17 Dec). <strong>Click a cell</strong> to pick staff + hours (chips), then <strong>Save staff hours</strong>."
        : "Showing <strong>one week</strong> only. Click a cell to pick staff + hours. Switch to Whole term to see all Mondays (etc.).";
    var html =
      renderStandingHoursBlock() +
      '<p class="muted asr-tab-hint" style="margin:0 0 10px;max-width:52rem;overflow-wrap:break-word">' +
      rangeHint +
      " Saves update dashboards — they do <strong>not</strong> change MADRE / who is booked (use Edit term slot).</p>" +
      hoursRangeToggleHtml() +
      (state.hoursRange === "week" ? hoursWeekNavHtml() : "") +
      hoursLegendHtml() +
      weekdaySubtabs(day, "data-asr-hours-day", {
        includeAll: true,
        allLabel: "All weekdays",
        allValue: "all",
      }) +
      serviceSubtabs(state.hoursService, "data-asr-hours-service");
    if (day === "all") {
      WEEKDAYS.forEach(function (wd) {
        var sheet = sheetForHoursRange(d.staffHours[wd]);
        html +=
          '<section class="asr-hours-day-section" aria-labelledby="asr-hours-day-' +
          esc(wd) +
          '">' +
          '<h3 class="asr-hours-day-section__title" id="asr-hours-day-' +
          esc(wd) +
          '">' +
          esc(wd) +
          "</h3>";
        if (!sheet || (!(sheet.dates && sheet.dates.length) && !(sheet.blocks && sheet.blocks.length))) {
          html +=
            '<p class="muted" style="margin:0 0 12px">No Autumn shifts for ' +
            esc(wd) +
            ".</p>";
        } else {
          html += renderHoursDaySection(wd, sheet);
        }
        html += "</section>";
      });
      return html + renderChangeLogHtml();
    }
    var one = sheetForHoursRange(d.staffHours[day]);
    if (!one || (!(one.dates && one.dates.length) && !(one.blocks && one.blocks.length))) {
      html +=
        '<p class="muted" style="margin:12px 0">No Autumn shifts for ' +
        esc(day) +
        (state.hoursRange === "week"
          ? ". Use Next week, or switch to Whole term."
          : ".") +
        "</p>";
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
    closeStaffHoursPick();
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
    root.querySelectorAll("[data-asr-term-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var prefill = decodeTermEditPayload(btn.getAttribute("data-asr-term-edit") || "");
        if (!prefill) {
          cfg.toast("Could not open Edit term slot from this cell.");
          return;
        }
        openTermSlotFromBookedCell(prefill);
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
    root.querySelectorAll("[data-asr-hours-range]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.hoursRange = btn.getAttribute("data-asr-hours-range") || "term";
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

    root.querySelectorAll(".asr-cell-wrap[data-asr-edit-key]").forEach(function (wrap) {
      wrap.addEventListener("click", function (e) {
        if (e.target && e.target.closest && e.target.closest(".asr-cell-input--type")) return;
        if (wrap.classList.contains("asr-cell-wrap--type")) return;
        e.preventDefault();
        openStaffHoursPick(wrap);
      });
      wrap.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          if (wrap.classList.contains("asr-cell-wrap--type")) return;
          e.preventDefault();
          openStaffHoursPick(wrap);
        }
      });
      var typeInp = wrap.querySelector(".asr-cell-input--type");
      if (typeInp) {
        typeInp.addEventListener("input", function () {
          setCellAssignment(wrap, typeInp.value);
        });
        typeInp.addEventListener("keydown", function (e) {
          if (e.key === "Escape") {
            wrap.classList.remove("asr-cell-wrap--type");
            typeInp.blur();
            closeStaffHoursPick();
          }
        });
      }
    });
  }

  function bindStaffHoursPickOnce() {
    var root = document.getElementById("adminSpreadsheetRefRoot");
    if (!root || root._asrPickBound) return;
    root._asrPickBound = true;
    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var pickBtn = t.closest("[data-asr-pick]");
      if (pickBtn && state.pick && state.pick.wrap) {
        e.preventDefault();
        e.stopPropagation();
        var kind = pickBtn.getAttribute("data-asr-pick") || "";
        var pickVal = pickBtn.getAttribute("data-asr-pick-val") || "";
        var wrap = state.pick.wrap;
        var cur = splitStaffHoursNameTime(wrap.getAttribute("data-asr-value") || "");
        if (kind === "staff") {
          setCellAssignment(wrap, composeStaffHoursText(pickVal, cur.time));
        } else if (kind === "time") {
          setCellAssignment(wrap, composeStaffHoursText(cur.name, pickVal));
        }
        var parts = splitStaffHoursNameTime(wrap.getAttribute("data-asr-value") || "");
        var pop = document.getElementById("asrStaffHoursPick");
        if (pop) {
          renderPickChips(
            pop.querySelector("[data-asr-pick-staff]"),
            collectStaffPickNames(),
            "staff",
            parts.name
          );
          renderPickChips(
            pop.querySelector("[data-asr-pick-times]"),
            collectTimePickBands(
              wrap.getAttribute("data-asr-day") || state.hoursDay || "Monday",
              Number(wrap.getAttribute("data-asr-col") || 0)
            ),
            "time",
            parts.time
          );
        }
        return;
      }
      if (t.closest("[data-asr-pick-clear]") && state.pick && state.pick.wrap) {
        e.preventDefault();
        setCellAssignment(state.pick.wrap, "");
        closeStaffHoursPick();
        return;
      }
      if (t.closest("[data-asr-pick-done]")) {
        e.preventDefault();
        closeStaffHoursPick();
        return;
      }
      if (t.closest("[data-asr-pick-type]") && state.pick && state.pick.wrap) {
        e.preventDefault();
        var w = state.pick.wrap;
        closeStaffHoursPick();
        w.classList.add("asr-cell-wrap--type");
        var inp = w.querySelector(".asr-cell-input--type");
        if (inp) {
          inp.focus();
          inp.select();
        }
        return;
      }
      if (t.closest("#asrStaffHoursPick")) return;
      if (t.closest(".asr-cell-wrap[data-asr-edit-key]")) return;
      closeStaffHoursPick();
    });
  }

  function bindModule() {
    var root = document.getElementById("adminSpreadsheetRefRoot");
    if (!root) return;
    bindStaffHoursPickOnce();
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
      Promise.all([applyOverridesToMerged(), loadChangeLog(), loadDayOffs()]).then(refreshPanel);
    }

    if (!global.__ASR_ROSTER_SYNC_BOUND__) {
      global.__ASR_ROSTER_SYNC_BOUND__ = true;
      try {
        global.addEventListener("portal:staff-dashboard-source-updated", function () {
          if (!document.getElementById("adminSpreadsheetRefRoot")) return;
          Promise.all([applyOverridesToMerged(), loadDayOffs()]).then(refreshPanel);
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
