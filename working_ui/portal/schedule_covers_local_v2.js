/**
 * LOCAL Schedule & Covers — Admin twin (Base schedule + day patches).
 * Open: http://127.0.0.1:8765/schedule_covers_local.html
 */
(function (global) {
  "use strict";

  var TERM_FROM = "2026-09-01";
  var TERM_TO = "2026-12-17";
  var DRAFT_KEY = "schedule_covers_local_drafts_v1";
  var DAY_NAMES = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  var state = {
    iso: "2026-09-13",
    weekAnchor: "2026-09-07",
    onlyOverrides: false,
    venueFilter: "",
    unavailByDate: Object.create(null),
    overridesByDate: Object.create(null),
    occupantsBySlotId: Object.create(null),
    snapMeta: { unavail: false, overrides: false, occupants: false, hours: false },
    rows: [],
    drafts: loadDrafts(),
    activePaint: null,
  };

  function loadDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveDrafts() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state.drafts || {}));
    } catch (_) {}
  }

  function draftsForIso(iso) {
    var list = (state.drafts && state.drafts[iso]) || [];
    return Array.isArray(list) ? list : [];
  }

  function isFadiOffRotaIso(iso) {
    var C = global.PortalRosterCanonical;
    if (C && typeof C.isFadiOffRotaIso === "function") return !!C.isFadiOffRotaIso(iso);
    var d = String(iso || "").slice(0, 10);
    return !!(d && d >= "2026-09-01" && d < "2026-09-20");
  }

  function isFadiClientLabel(name) {
    return /^fadi\b/i.test(String(name || "").trim());
  }

  /** Live snap overrides + local preview drafts for this date. */
  function mergedOverridesForIso(iso) {
    var live = state.overridesByDate[iso] || [];
    var list = live.concat(draftsForIso(iso));
    if (!isFadiOffRotaIso(iso)) return list;
    return list.filter(function (ov) {
      if (!ov) return false;
      if (isFadiClientLabel(ov.anchor_client_id)) return false;
      var p = ov.payload || {};
      if (isFadiClientLabel(p.to_client_name || p.client_name || p.anchor_client_name)) {
        return false;
      }
      return true;
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slug(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\(.*?\)/g, " ")
      .replace(/hold by trial|hold waitlist|trial/gi, " ")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function firstName(label) {
    var s = String(label || "").trim();
    if (!s) return "—";
    return s.split(/\s+/)[0];
  }

  /** Split standing pair labels: "Aurora/Luliya" → ["Aurora","Luliya"]. */
  function splitInstructorTokens(label) {
    return String(label || "")
      .split("/")
      .map(function (p) {
        return String(p || "").trim();
      })
      .filter(Boolean);
  }

  /** Same draft key as term_timetable_local.js — Covers must see Timetable edits. */
  var TIMETABLE_HOURS_DRAFT_KEY = "term_timetable_local_hours_draft_v1";

  function staffHoursRoot() {
    var P = global.PORTAL_AUTUMN_STAFF_HOURS;
    if (!P) return null;
    return P.staffHours || P;
  }

  function timetableHoursDrafts() {
    return {};
  }

  /** Cell text from Timetable hours (Admin DB merge / shipped base — no LOCAL draft). */
  function timetableCellText(cell) {
    return String((cell && cell.text) || "");
  }

  function parseHoursCellName(text) {
    var raw = String(text || "").trim();
    if (!raw || /^closed$/i.test(raw)) return "";
    var m = raw.match(/^(.+?)\s+(\d{1,2}(?:\.\d{1,2})?\s*-\s*\d{1,2}(?:\.\d{1,2})?)/i);
    if (m) return String(m[1] || "").trim();
    return raw.replace(/\boffice\b/i, "").trim();
  }

  function parseHoursCellRange(text) {
    var raw = String(text || "").trim();
    var m = raw.match(/(\d{1,2}(?:\.\d{1,2})?)\s*-\s*(\d{1,2}(?:\.\d{1,2})?)/);
    if (!m) return { start: -1, end: -1 };
    var start = toMinutes(m[1]);
    var end = toMinutes(m[2]);
    if (start >= 0 && end >= 0 && end <= start) end += 12 * 60;
    return { start: start, end: end };
  }

  /** Who works this calendar day per Timetable (point 3). */
  function timetableWorkersForIso(iso) {
    var day = dayNameForIso(iso);
    var root = staffHoursRoot();
    var sheet = root && root[day];
    if (!sheet) return [];
    var dateRow = null;
    (sheet.dates || []).forEach(function (dr) {
      if (String((dr && dr.date) || "").slice(0, 10) === iso) dateRow = dr;
    });
    if (!dateRow) return [];
    var venues = [];
    (sheet.venueGroups || []).forEach(function (g) {
      var span = Number(g.span) || 1;
      for (var i = 0; i < span; i++) venues.push(String(g.venue || ""));
    });
    var out = [];
    (dateRow.cells || []).forEach(function (cell, ci) {
      var text = timetableCellText(cell);
      var name = parseHoursCellName(text);
      if (!name || /^closed$/i.test(name)) return;
      var range = parseHoursCellRange(text);
      out.push({
        name: name,
        key: slug(name),
        venue: venues[ci] || "",
        start: range.start,
        end: range.end,
        band: String((cell && cell.band) || ""),
      });
    });
    return out;
  }

  /**
   * Timetable DC hours for a staff name on this date (SwimFarm day_centre / office).
   * Chain law: Timetable owns standing hours before Covers / Overview paint.
   */
  function timetableDcWindowForStaff(iso, staffName) {
    var workers = timetableWorkersForIso(iso);
    var k = slug(staffName);
    var best = null;
    workers.forEach(function (w) {
      if (!w) return;
      if (w.key !== k && slug(firstName(w.name)) !== k) return;
      if (w.start < 0 || w.end < 0) return;
      var band = String(w.band || "").toLowerCase();
      if (band === "pool" || band === "aquatic" || band === "bespoke") return;
      var isDc =
        band === "day_centre" || band === "dc" || band === "office" || !band;
      var isSf = /swimfarm/i.test(String(w.venue || ""));
      if (!isDc && !isSf) return;
      if (!best) {
        best = w;
        return;
      }
      var bestBand = String(best.band || "").toLowerCase();
      if (
        (band === "day_centre" || band === "dc") &&
        bestBand !== "day_centre" &&
        bestBand !== "dc"
      ) {
        best = w;
      }
    });
    return best;
  }

  /** Clip who-with-whom client band to Timetable staff hours (Timetable wins). */
  function clipBandToTimetableDc(band, staffWin) {
    if (!staffWin || staffWin.start < 0 || staffWin.end < 0) return band;
    if (!band || band.start < 0 || band.end < 0) {
      return { start: staffWin.start, end: staffWin.end };
    }
    var start = Math.max(band.start, staffWin.start);
    var end = Math.min(band.end, staffWin.end);
    if (end <= start) {
      return { start: staffWin.start, end: staffWin.end };
    }
    return { start: start, end: end };
  }

  function dayOffByKey(iso) {
    var map = Object.create(null);
    (state.unavailByDate[iso] || []).forEach(function (o) {
      var key = slug(o.label || o.key);
      if (!key) return;
      map[key] = {
        coverName: String(o.coverName || "").trim(),
        reason: String(o.reason || "").trim(),
        label: String(o.label || o.key || "").trim(),
      };
      /* also first-name key */
      map[slug(firstName(o.label || o.key))] = map[key];
    });
    return map;
  }

  function workerOverlapsBand(w, bandStart, bandEnd) {
    if (!w) return false;
    if (w.start < 0 || w.end < 0 || bandStart < 0 || bandEnd < 0) return true;
    return w.start < bandEnd + 5 && w.end > bandStart - 5;
  }

  /**
   * Standing MADRE may say "Aurora/Luliya". Day truth = Timetable who works
   * that date (+ day-off cover). Never leave slash pairs on the Covers board.
   */
  function resolveDayInstructor(iso, standingLabel, venue, bandStart, bandEnd) {
    var tokens = splitInstructorTokens(standingLabel);
    if (!tokens.length) {
      return {
        display: "—",
        primaryId: "",
        dayOffCover: false,
        fromName: "",
        toName: "",
      };
    }
    var primaryName = tokens[0];
    var primaryId = slug(primaryName);
    var workers = timetableWorkersForIso(iso);
    var offs = dayOffByKey(iso);
    var venueKey = slug(venue);

    function findWorker(token) {
      var k = slug(token);
      for (var i = 0; i < workers.length; i++) {
        var w = workers[i];
        if (w.key !== k && slug(firstName(w.name)) !== k) continue;
        if (venueKey && slug(w.venue) && slug(w.venue) !== venueKey) {
          /* allow cross-venue only if unique name that day */
          var sameName = workers.filter(function (x) {
            return x.key === w.key;
          });
          if (sameName.length > 1) continue;
        }
        if (!workerOverlapsBand(w, bandStart, bandEnd)) continue;
        return w;
      }
      /* fallback: name on timetable any hours that day */
      for (var j = 0; j < workers.length; j++) {
        if (workers[j].key === k || slug(firstName(workers[j].name)) === k) {
          return workers[j];
        }
      }
      return null;
    }

    /* Prefer a pair token who is actually on Timetable today. */
    var onShift = [];
    tokens.forEach(function (tok) {
      var w = findWorker(tok);
      if (w) onShift.push({ token: tok, worker: w });
    });

    var chosen = onShift.length ? onShift[0].token : primaryName;
    var chosenKey = slug(chosen);
    var off = offs[chosenKey] || offs[slug(firstName(chosen))];

    /* If primary is off, use their cover (Luliya for Aurora). */
    var primaryOff = offs[primaryId] || offs[slug(firstName(primaryName))];
    if (primaryOff && primaryOff.coverName) {
      return {
        display: firstName(primaryOff.coverName),
        primaryId: primaryId,
        dayOffCover: true,
        fromName: firstName(primaryName),
        toName: firstName(primaryOff.coverName),
      };
    }

    /* If chosen token is off without being primary — rare */
    if (off && off.coverName) {
      return {
        display: firstName(off.coverName),
        primaryId: primaryId,
        dayOffCover: true,
        fromName: firstName(chosen),
        toName: firstName(off.coverName),
      };
    }

    /* Only one of the pair works today (Javier not Dan; Roberto not Youssef). */
    if (onShift.length === 1) {
      return {
        display: firstName(onShift[0].token),
        primaryId: primaryId,
        dayOffCover: false,
        fromName: "",
        toName: "",
      };
    }
    if (onShift.length > 1) {
      /* Both on Timetable — still show primary only (day board, not pair look). */
      return {
        display: firstName(onShift[0].token),
        primaryId: primaryId,
        dayOffCover: false,
        fromName: "",
        toName: "",
      };
    }

    /* Nobody from the pair on Timetable — still show primary first name, not slash. */
    return {
      display: firstName(primaryName),
      primaryId: primaryId,
      dayOffCover: false,
      fromName: "",
      toName: "",
    };
  }

  function dayNameForIso(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) return "";
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return "";
    return DAY_NAMES[d.getDay()] || "";
  }

  function mondayOf(iso) {
    var parts = String(iso || "").split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + dd;
  }

  function addDays(iso, n) {
    var parts = String(iso || "").split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + n);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + dd;
  }

  function formatDdMmmYyyy(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) return iso;
    var months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return (
      parts[2] +
      "-" +
      months[Number(parts[1]) - 1] +
      "-" +
      parts[0]
    );
  }

  function weekRangeLabel(anchorIso) {
    var sun = addDays(anchorIso, 6);
    return formatDdMmmYyyy(anchorIso) + " – " + formatDdMmmYyyy(sun);
  }

  /** Minutes from midnight; accepts HH:MM[:SS] or "12.00" / "4.30". */
  function toMinutes(raw) {
    var s = String(raw || "").trim().toLowerCase();
    if (!s) return -1;
    var m = s.match(/^(\d{1,2})[:.](\d{2})(?::\d{2})?/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    m = s.match(/^(\d{1,2})$/);
    if (m) return Number(m[1]) * 60;
    return -1;
  }

  function formatClock(mins) {
    if (mins < 0) return "";
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var h12 = h % 12;
    if (!h12) h12 = 12;
    return m ? h12 + "." + String(m).padStart(2, "0") : String(h12);
  }

  function parseBandMinutes(label) {
    var s = String(label || "").trim();
    var m = s.match(
      /(\d{1,2}(?:[.:]\d{2})?)\s*[–\-to]+\s*(\d{1,2}(?:[.:]\d{2})?)/i,
    );
    if (!m) return { start: -1, end: -1 };
    var start = toMinutes(m[1]);
    var end = toMinutes(m[2]);
    /* Club afternoon: "1 to 2" / "2.30 to 3" = 13:00–14:00 / 14:30–15:00 (not 01:00). */
    if (start >= 0 && start < 8 * 60) {
      start += 12 * 60;
      if (end >= 0 && end < 8 * 60) end += 12 * 60;
    }
    if (start >= 0 && end >= 0 && end <= start) end += 12 * 60;
    return { start: start, end: end };
  }

  function timeLabelFromStartEnd(start, end) {
    var a = toMinutes(start);
    var b = toMinutes(end);
    if (a < 0) return "";
    if (b >= 0 && b <= a) b += 12 * 60;
    if (b < 0) return formatClock(a);
    return formatClock(a) + " – " + formatClock(b);
  }

  function serviceFromSlotId(slotId, venue) {
    var id = String(slotId || "").toLowerCase();
    if (id.indexOf("climbing") >= 0) return "Climbing Activity";
    if (id.indexOf("aquatic") >= 0) return "Aquatic Activity";
    if (id.indexOf("physical") >= 0 || id.indexOf("fitness") >= 0)
      return "Fitness";
    if (id.indexOf("multi") >= 0) return "Multi-Activity";
    if (id.indexOf("hub") >= 0) return "Hub";
    if (id.indexOf("bespoke") >= 0) return "Bespoke Programme";
    if (id.indexOf("day") >= 0) return "Day Centre";
    var v = String(venue || "").toLowerCase();
    if (v === "westway") return "Climbing Activity";
    if (v === "acton" || v === "northolt") return "Aquatic Activity";
    return "—";
  }

  function ovTypeLabel(ov) {
    var t = String((ov && ov.override_type) || "").trim();
    var p = (ov && ov.payload) || {};
    if (t === "client_replace_in_slot" && (p.is_trial || p.session_kind === "trial" || p.booking_kind === "trial"))
      return "Trial";
    if (t === "client_replace_in_slot" && p.finish_booking && !p.is_trial)
      return "New client";
    var map = {
      client_absence_announced: "Absent",
      client_cancelled: "Cancelled",
      slot_clear_client: "No Participant",
      client_replace_in_slot: "Make up",
      instructor_reassign: "Changed instructor",
      instructor_cover_needed: "COVER NEEDED",
      slot_close: "Closed",
      slot_open: "Open closed slot",
      session_add: "Training / Shadowing",
      slot_update: "Updated",
    };
    return map[t] || t || "Override";
  }

  function ovTypeClass(ov) {
    var t = String((ov && ov.override_type) || "").trim();
    var p = (ov && ov.payload) || {};
    if (t === "client_absence_announced") return "override--absent";
    if (t === "instructor_cover_needed") return "override--cover-needed";
    if (t === "instructor_reassign") return "override--instructor";
    if (t === "slot_update") return "override--updated";
    if (t === "client_replace_in_slot" && (p.is_trial || p.session_kind === "trial"))
      return "override--trial";
    if (t === "client_replace_in_slot") return "override--makeup";
    if (t === "slot_close" || t === "client_cancelled") return "override--closed";
    if (t === "session_add") return "override--term";
    return "override--updated";
  }

  function fetchJson(path) {
    return fetch(path + "?v=" + Date.now(), { cache: "no-store" }).then(
      function (res) {
        if (!res.ok) throw new Error("http_" + res.status);
        return res.json();
      },
    );
  }

  function loadSnaps() {
    return Promise.all([
      fetchJson("/portal/_local_staff_unavailability.json")
        .then(function (data) {
          state.unavailByDate = (data && data.byDate) || Object.create(null);
          state.snapMeta.unavail = true;
        })
        .catch(function () {
          state.snapMeta.unavail = false;
        }),
      fetchJson("/portal/_local_schedule_overrides.json")
        .then(function (data) {
          state.overridesByDate = (data && data.byDate) || Object.create(null);
          state.snapMeta.overrides = true;
        })
        .catch(function () {
          state.snapMeta.overrides = false;
        }),
      fetchJson("/portal/_local_booking_occupants.json")
        .then(function (data) {
          state.occupantsBySlotId =
            (data && data.bySlotId) || Object.create(null);
          state.snapMeta.occupants = true;
        })
        .catch(function () {
          state.snapMeta.occupants = false;
        }),
    ]);
  }

  /**
   * Sunday Multi-Activity = two 45' turns inside each 90' parent band
   * (pool half + hub half). Same standing as portal_roster_canonical.
   */
  var SUNDAY_MA_POOL_HALVES = [
    { client: "Yusuf Ah", staff: "Roberto", area: "Big Pool", time: "9.30 to 10.15" },
    { client: "Samer", staff: "Roberto", area: "Big Pool", time: "10.15 to 11" },
    { client: "Gabriel", staff: "Roberto", area: "Big Pool", time: "11 to 11.45" },
    { client: "Arthur Mo", staff: "Roberto", area: "Big Pool", time: "11.45 to 12.30" },
    { client: "Amaar Ah", staff: "Roberto", area: "Big Pool", time: "12.30 to 1.15" },
    { client: "Adaam Ah", staff: "Roberto", area: "Big Pool", time: "1.15 to 2" },
    { client: "Adam Ab", staff: "Aurora", area: "Small Pool", time: "9.30 to 10.15" },
    { client: "Jack W", staff: "Aurora", area: "Big Pool", time: "10.15 to 11" },
    { client: "Arthur Ma", staff: "Aurora", area: "Small Pool", time: "11 to 11.45" },
    { client: "Cyrus", staff: "Aurora", area: "Small Pool", time: "11.45 to 12.30" },
    { client: "Aydaan Ah", staff: "Aurora", area: "Big Pool", time: "12.30 to 1.15" },
    { client: "Erik", staff: "Aurora", area: "Big Pool", time: "1.15 to 2" },
    { client: "Jack S", staff: "Javier", area: "Big Pool", time: "9.30 to 10.15" },
    { client: "Zaid", staff: "Javier", area: "Small Pool", time: "10.15 to 11" },
    { client: "Hazem", staff: "Javier", area: "Big Pool", time: "11 to 11.45" },
    { client: "Eiji", staff: "Javier", area: "Big Pool", time: "11.45 to 12.30" },
    { client: "Rayyan F", staff: "Javier", area: "Small Pool", time: "12.30 to 1.15" },
    { client: "Haneef", staff: "Javier", area: "Small Pool", time: "1.15 to 2" },
  ];

  var SUNDAY_MA_HUB_HALVES = [
    { client: "Jack W", staff: "Berta", area: "Hub Room", time: "9.30 to 10.15" },
    { client: "Adam Ab", staff: "Berta", area: "Hub Room", time: "10.15 to 11" },
    { client: "Cyrus", staff: "Berta", area: "Hub Room", time: "11 to 11.45" },
    { client: "Arthur Ma", staff: "Berta", area: "Hub Room", time: "11.45 to 12.30" },
    { client: "Erik", staff: "Berta", area: "Hub Room", time: "12.30 to 1.15" },
    { client: "Aydaan Ah", staff: "Berta", area: "Hub Room", time: "1.15 to 2" },
    { client: "Zaid", staff: "Emmanuel", area: "Hub Room", time: "9.30 to 10.15" },
    { client: "Jack S", staff: "Emmanuel", area: "Hub Room", time: "10.15 to 11" },
    { client: "Eiji", staff: "Emmanuel", area: "Hub Room", time: "11 to 11.45" },
    { client: "Hazem", staff: "Emmanuel", area: "Hub Room", time: "11.45 to 12.30" },
    { client: "Haneef", staff: "Emmanuel", area: "Hub Room", time: "12.30 to 1.15" },
    { client: "Rayyan F", staff: "Emmanuel", area: "Hub Room", time: "1.15 to 2" },
    { client: "Samer", staff: "Godsway", area: "Hub Room", time: "9.30 to 10.15" },
    { client: "Yusuf Ah", staff: "Godsway", area: "Hub Room", time: "10.15 to 11" },
    { client: "Arthur Mo", staff: "Godsway", area: "Hub Room", time: "11 to 11.45" },
    { client: "Gabriel", staff: "Godsway", area: "Hub Room", time: "11.45 to 12.30" },
    { client: "Adaam Ah", staff: "Godsway", area: "Hub Room", time: "12.30 to 1.15" },
    { client: "Amaar Ah", staff: "Godsway", area: "Hub Room", time: "1.15 to 2" },
  ];

  /** Sunday Aquatic areas (cards) — same as canonical standing pool books. */
  var SUNDAY_AQUATIC_AREAS = [
    { client: "Simon", staff: "Aurora", area: "Small Pool", time: "9 to 9.30" },
    { client: "Yusuf Ah", staff: "Roberto", area: "Big Pool", time: "9 to 9.30" },
    { client: "No participant", staff: "Javier", area: "Small Pool", time: "9 to 9.30" },
    { client: "Zakariya", staff: "Aurora", area: "Big Pool", time: "2 to 2.30" },
    { client: "Rodin", staff: "Roberto", area: "Big Pool", time: "2 to 2.30" },
    { client: "Max", staff: "Javier", area: "Big Pool", time: "2 to 2.30" },
    { client: "Faris", staff: "Aurora", area: "Big Pool", time: "2.30 to 3" },
    { client: "Yoan", staff: "Roberto", area: "Big Pool", time: "2.30 to 3" },
    { client: "Shaan", staff: "Javier", area: "Big Pool", time: "2.30 to 3" },
  ];

  function timesAlign(a, b) {
    var pa = parseBandMinutes(String(a || "").replace(/\s+to\s+/i, " – "));
    var pb = parseBandMinutes(String(b || "").replace(/\s+to\s+/i, " – "));
    if (pa.start < 0 || pb.start < 0) {
      return (
        slug(a) === slug(b) ||
        String(a || "").replace(/\s+/g, "") === String(b || "").replace(/\s+/g, "")
      );
    }
    return Math.abs(pa.start - pb.start) <= 5 && (pa.end < 0 || pb.end < 0 || Math.abs(pa.end - pb.end) <= 5);
  }

  function staffKeysMatch(a, b) {
    var ka = slug(firstName(a));
    var kb = slug(firstName(b));
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    if (ka.indexOf(kb) === 0 || kb.indexOf(ka) === 0) return true;
    if ((ka === "javi" || ka === "javier") && (kb === "javi" || kb === "javier")) return true;
    return false;
  }

  function clientKeysMatch(a, b) {
    var ka = slug(a);
    var kb = slug(b);
    if (!ka || !kb) return false;
    if (ka === kb) return true;
    var openA = /no_participant|closed|hold/.test(ka);
    var openB = /no_participant|closed|hold/.test(kb);
    if (openA && openB) return true;
    return ka.indexOf(kb) === 0 || kb.indexOf(ka) === 0;
  }

  /** Occupants snap has no area — AS seats take notes from canonical standing boards. */
  function autumnAsAreaHints(iso) {
    var C = global.PortalRosterCanonical;
    if (!C) return [];
    var day = dayNameForIso(iso);
    var out = [];
    function push(staff, name, time, area, venue, dayName) {
      if (dayName && dayName !== day) return;
      out.push({
        staff: staff,
        name: name,
        time: time,
        area: area,
        venue: venue,
      });
    }
    function pushBoard(list, venue, defaultStaff, defaultArea, dayName) {
      (list || []).forEach(function (s) {
        push(
          s.staff || defaultStaff || "",
          s.name || s.client_name,
          s.time || s.time_slot,
          s.area || defaultArea || "",
          s.venue || venue,
          s.day || dayName || "",
        );
      });
    }
    if (day === "Tuesday") pushBoard(C.AUTUMN_ACTON_TUESDAY_BOARD, "Acton", "", "Lane (DE)", "Tuesday");
    if (day === "Wednesday") pushBoard(C.AUTUMN_ACTON_WEDNESDAY_BOARD, "Acton", "", "Teaching Pool", "Wednesday");
    if (day === "Thursday") pushBoard(C.AUTUMN_ACTON_THURSDAY_BOARD, "Acton", "", "Teaching Pool", "Thursday");
    if (day === "Saturday")
      pushBoard(C.AUTUMN_SATURDAY_ACTON_BOARD, "Acton", "Youssef", "Teaching Pool", "Saturday");
    pushBoard(C.ROBERTO_MONDAY_ACTON_FROM_ANGEL, "Acton", "Roberto", "Teaching Pool", "");
    pushBoard(C.YOUSSEF_ACTON_OPEN_430_ROWS, "Acton", "Youssef", "Teaching Pool", "");
    pushBoard(C.YOUSSEF_FRIDAY_ACTON_FROM_ROBERTO, "Acton", "Youssef", "Teaching Pool", "");
    var nh = (C.AUTUMN_NORTHOLT_AQUATIC_BOARD || {})[String(day || "").toLowerCase()] || [];
    nh.forEach(function (col) {
      (col.clients || []).forEach(function (c) {
        push(col.staff, c.name, c.time, "Teaching Pool", "Northolt", day);
      });
    });
    (C.AUTUMN_BESPOKE_HUB_ROWS || []).forEach(function (row) {
      push(row.instructors, row.client_name, row.time_slot, row.area || "Hub Room", row.venue || "SwimFarm", row.day);
    });
    (C.AUTUMN_SUNDAY_CLIMBING_BOARD || []).forEach(function (s) {
      push(s.staff, s.name, s.time, "Wall", "Westway", "Sunday");
    });
    (C.AUTUMN_WEEKDAY_CLIMBING_BOARD || []).forEach(function (s) {
      push(s.staff, s.name, s.time, "Wall", "Westway", s.day);
    });
    return out;
  }

  function areaFromCanonicalAs(iso, venue, staff, client, timeLabel) {
    var list = autumnAsAreaHints(iso);
    var ven = String(venue || "").toLowerCase();
    var hits = list.filter(function (s) {
      if (ven && String(s.venue || "").toLowerCase() !== ven) return false;
      if (staff && s.staff && !staffKeysMatch(staff, s.staff)) return false;
      return timesAlign(timeLabel, s.time);
    });
    for (var i = 0; i < hits.length; i++) {
      if (clientKeysMatch(client, hits[i].name) && hits[i].area) return hits[i].area;
    }
    for (var j = 0; j < hits.length; j++) {
      if (hits[j].area) return hits[j].area;
    }
    return "";
  }

  function defaultAreaForSlot(service, venue, clientLabel, timeLabel, standingStaff, iso) {
    var svc = String(service || "");
    var ven = String(venue || "").toLowerCase();
    var fromCanon = areaFromCanonicalAs(
      iso || state.iso,
      venue,
      standingStaff,
      clientLabel,
      timeLabel,
    );
    if (fromCanon) return fromCanon;
    if (/climb/i.test(svc) && /westway/i.test(ven)) return "Wall";
    if (/fitness|physical/i.test(svc) && /westway/i.test(ven)) return "Gym";
    if (/bespoke|hub/i.test(svc) && /swimfarm/i.test(ven)) return "Hub Room";
    if (/aquatic/i.test(svc) && /acton/i.test(ven)) return "Teaching Pool";
    if (/aquatic/i.test(svc) && /northolt/i.test(ven)) return "Teaching Pool";
    if (/aquatic/i.test(svc) && /swimfarm/i.test(ven)) {
      var ck = slug(clientLabel);
      var sk = slug(standingStaff);
      var tl = String(timeLabel || "").toLowerCase().replace(/[–—]/g, " to ");
      for (var i = 0; i < SUNDAY_AQUATIC_AREAS.length; i++) {
        var a = SUNDAY_AQUATIC_AREAS[i];
        var at = String(a.time || "").toLowerCase();
        var clientHit =
          ck === slug(a.client) ||
          (ck.indexOf("participant") >= 0 && slug(a.client).indexOf("participant") >= 0);
        var timeHit =
          tl.indexOf(at.replace(/\s+to\s+/, " to ")) >= 0 ||
          at.replace(/\s+/g, "") === tl.replace(/\s+/g, "");
        if (clientHit && (timeHit || slug(a.staff) === sk || sk.indexOf(slug(a.staff)) >= 0)) {
          return a.area;
        }
      }
      /* Aurora book morning → Small; else Big Pool default for Sunday aquatic. */
      if (/aurora|luliya/i.test(standingStaff) && /9\s*to\s*9\.30|9\.00/.test(tl))
        return "Small Pool";
      return "Big Pool";
    }
    return "";
  }

  /** Cover must be on Timetable for that band (Javier starts 9.30 — not Simon 9–9.30). */
  function coverWorksBand(iso, coverName, bandStart, bandEnd) {
    var key = slug(coverName);
    if (!key) return false;
    if (bandStart < 0 || bandEnd < 0) return true;
    var workers = timetableWorkersForIso(iso);
    for (var i = 0; i < workers.length; i++) {
      var w = workers[i];
      if (w.key !== key && slug(firstName(w.name)) !== key) continue;
      if (w.start < 0 || w.end < 0) continue;
      /* Half-open [start,end): 9.30 start does not cover 9–9.30. */
      if (w.start < bandEnd && w.end > bandStart) return true;
    }
    return false;
  }

  function formatTurnLabel(startMin, endMin) {
    function tok(mins) {
      if (mins < 0) return "";
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      var h12 = h % 12;
      if (!h12) h12 = 12;
      return m ? h12 + "." + String(m).padStart(2, "0") : String(h12);
    }
    return tok(startMin) + " to " + tok(endMin);
  }

  function pushResolvedRow(out, iso, opts) {
    var standingStaff = String(opts.standingStaff || "").trim();
    var resolved = resolveDayInstructor(
      iso,
      standingStaff,
      opts.venue || "",
      opts.bandStart,
      opts.bandEnd,
    );
    var kind = opts.kind || "booked";
    var clientLabel = opts.clientLabel || "No participant";
    var area =
      opts.area ||
      defaultAreaForSlot(
        opts.service,
        opts.venue,
        clientLabel,
        opts.timeLabel,
        standingStaff,
        opts.sessionIso || iso,
      );
    out.push({
      demoId: opts.demoId,
      slotId: opts.slotId || "",
      venue: opts.venue || "",
      area: area || "",
      timeLabel: opts.timeLabel || "",
      bandStart: opts.bandStart,
      bandEnd: opts.bandEnd,
      service: opts.service || "—",
      standingStaff: standingStaff,
      staffName: resolved.display,
      staffId: resolved.primaryId || slug(resolved.display),
      dayOffCover: !!resolved.dayOffCover,
      dayOffFrom: resolved.fromName || "",
      dayOffTo: resolved.toName || "",
      clientLabel: clientLabel,
      clientId: slug(clientLabel),
      kind: kind,
      roster:
        kind === "trial"
          ? "Trial hold"
          : kind === "hold"
            ? "Hold"
            : kind === "open"
              ? "Open"
              : kind === "cancelled"
                ? "Cancelled"
                : "Booked",
      parentBand: opts.parentBand || "",
      board: opts.board || "asw",
      sessionIso: iso,
    });
  }

  function isDayCentreService(svc) {
    return /day\s*centre|day\s*center/i.test(String(svc || ""));
  }

  function areaForDcClient(name) {
    var n = String(name || "").trim().toLowerCase();
    if (n === "manager") return "Hub · Manager";
    if (n === "office") return "Hub · Office";
    if (n === "acat") return "Hub · ACAT";
    return "Hub Room";
  }

  function dcClientTone(name) {
    var n = String(name || "").trim().toLowerCase();
    if (/^emanuel\b|^emmanuel\b/.test(n)) return "emanuel";
    if (/^fadi\b/.test(n)) return "fadi";
    if (/^ikram\b/.test(n)) return "ikram";
    if (/^timi\b/.test(n)) return "timi";
    if (n === "manager") return "manager";
    if (n === "office") return "office";
    if (n === "acat") return "acat";
    return "";
  }

  function dowKeyForIso(iso) {
    var d = new Date(String(iso).substring(0, 10) + "T12:00:00").getDay();
    return (
      ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
        d
      ] || ""
    );
  }

  /**
   * DC columns for a calendar day from Services phased/dated seats.
   * Canonical WEEK1 / Fadi-off / standing boards = fallback only.
   * Returns { phase, columns: [{ staff, clients: [{ name, time }] }] }.
   */
  function dcBoardForIso(iso) {
    var Dc = global.PortalDcServicesLocal;
    var C = global.PortalRosterCanonical;
    var d = String(iso || "").slice(0, 10);
    var key = dowKeyForIso(d);
    if (!key || key === "saturday" || key === "sunday") {
      return { phase: "weekend", columns: [], phaseLabel: "Weekend" };
    }

    function canonicalFallback(iso2) {
      if (!C) return { phase: "missing_canonical", columns: [] };
      var cols = [];
      var phase = "standing";
      var isoN = String(iso2 || "").slice(0, 10);
      var dk = dowKeyForIso(isoN);
      if (isoN === "2026-09-14" && C.MONDAY_SEP14_DC_BOARD) {
        cols = C.MONDAY_SEP14_DC_BOARD;
        phase = "mon14_adam_absent";
      } else if (typeof C.isAutumnWeek1DcIso === "function" && C.isAutumnWeek1DcIso(isoN)) {
        cols = (C.WEEK1_DC_BOARD && C.WEEK1_DC_BOARD[dk]) || [];
        phase = "week1";
      } else if (
        typeof C.isFadiAbsentDcBoardIso === "function" &&
        C.isFadiAbsentDcBoardIso(isoN)
      ) {
        cols = (C.FADI_ABSENT_DC_BOARD && C.FADI_ABSENT_DC_BOARD[dk]) || [];
        phase = "fadi_absent_board";
      } else {
        cols = (C.AUTUMN_DAY_CENTRE_BOARD && C.AUTUMN_DAY_CENTRE_BOARD[dk]) || [];
        phase = "standing";
      }
      return { phase: phase, columns: Array.isArray(cols) ? cols : [] };
    }

    var board =
      Dc && typeof Dc.boardForIso === "function"
        ? Dc.boardForIso(state.occupantsBySlotId || {}, d, canonicalFallback)
        : Object.assign({ source: "canonical" }, canonicalFallback(d));

    var offRota =
      typeof C.isFadiOffRotaIso === "function"
        ? C.isFadiOffRotaIso(d)
        : typeof C.isFadiAbsentDcWindowIso === "function" &&
          C.isFadiAbsentDcWindowIso(d);
    var cols = (board && board.columns) || [];
    if (offRota) {
      cols = cols.map(function (col) {
        return {
          staff: col.staff,
          clients: (col.clients || []).filter(function (c) {
            return !/^fadi\b/i.test(String((c && c.name) || "").trim());
          }),
        };
      });
    }
    return {
      phase: (board && board.phase) || "standing",
      phaseLabel: (board && board.phaseLabel) || "",
      columns: cols,
      fadiOffRota: !!offRota,
      source: (board && board.source) || "canonical",
    };
  }

  function dcPhaseHint(board) {
    var phase = board && board.phase;
    var fromServices = board && board.source === "services";
    var prefix = fromServices ? "Services DC · " : "";
    if (phase === "dated_2026-09-14" || phase === "mon14_adam_absent")
      return (
        prefix +
        "Mon 14 Sep: Adam P absent — Roberto DC Emanuel 11-4, Acton from 5.30. Timetable hours for this date."
      );
    if (phase === "week1") return prefix + "Week-1 Day Centre (1-4 Sep).";
    if (phase === "fadi_off" || phase === "fadi_absent_board")
      return prefix + "Fadi off (7-19 Sep). Standing from 20 Sep.";
    if (phase === "standing" && board.fadiOffRota)
      return prefix + "Standing pairs. Fadi off rota until 20 Sep (no Cancelled seats).";
    if (phase === "standing")
      return prefix + "Standing (Fadi from 20 Sep; Thu Roberto + Youssef with Fadi).";
    if (phase === "weekend") return "No Day Centre on weekends.";
    if (phase === "missing_canonical" || phase === "missing")
      return "No Day Centre Services seat for this date.";
    if (board && board.phaseLabel) return prefix + board.phaseLabel;
    return prefix + "Day Centre who-with-whom.";
  }

  function buildDcStandingRows(iso) {
    var board = dcBoardForIso(iso);
    var out = [];
    (board.columns || []).forEach(function (col) {
      var staff = String((col && col.staff) || "").trim();
      var clients = (col && col.clients) || [];
      if (!clients.length) return;
      clients.forEach(function (c, idx) {
        var name = String((c && c.name) || "").trim() || "No participant";
        var timeRaw = String((c && c.time) || "").trim();
        var band = parseBandMinutes(timeRaw.replace(/\s+to\s+/i, " – "));
        if (band.start < 0) {
          var m = timeRaw.match(
            /(\d{1,2}(?:\.\d{1,2})?)\s*to\s*(\d{1,2}(?:\.\d{1,2})?)/i,
          );
          if (m) {
            band = { start: toMinutes(m[1]), end: toMinutes(m[2]) };
            if (band.start >= 0 && band.start < 8 * 60) {
              band.start += 12 * 60;
              if (band.end >= 0 && band.end < 8 * 60) band.end += 12 * 60;
            }
            if (band.end >= 0 && band.end <= band.start) band.end += 12 * 60;
          }
        }
        /* Timetable (3) owns hours — clip MADRE/canonical who-with-whom to staff DC window. */
        band = clipBandToTimetableDc(band, timetableDcWindowForStaff(iso, staff));
        var timeLabel =
          formatTurnLabel(band.start, band.end) || timeRaw || "—";
        var kind = "booked";
        if (/^no participant\b/i.test(name) || /^closed\b/i.test(name)) {
          kind = "open";
        }
        pushResolvedRow(out, iso, {
          demoId:
            "dc|" +
            iso +
            "|" +
            slug(staff) +
            "|" +
            slug(name) +
            "|" +
            slug(timeLabel) +
            "|" +
            idx,
          slotId: "day-centre",
          venue: "SwimFarm",
          area: areaForDcClient(name),
          timeLabel: timeLabel,
          bandStart: band.start,
          bandEnd: band.end,
          service: "Day Centre",
          standingStaff: staff,
          clientLabel: name,
          kind: kind,
          board: "dc",
        });
      });
    });
    /* Group by participant (Emanuel / Ikram / …), then time — stacked cells, not time-interleaved. */
    out.sort(function (a, b) {
      var ca = dcParticipantSortKey(a.clientLabel);
      var cb = dcParticipantSortKey(b.clientLabel);
      if (ca !== cb) return ca.localeCompare(cb, "en", { sensitivity: "base" });
      var ta = Number(a.bandStart);
      var tb = Number(b.bandStart);
      if (!Number.isFinite(ta) || ta < 0) ta = 99999;
      if (!Number.isFinite(tb) || tb < 0) tb = 99999;
      if (ta !== tb) return ta - tb;
      var ea = Number(a.bandEnd);
      var eb = Number(b.bandEnd);
      if (Number.isFinite(ea) && Number.isFinite(eb) && ea !== eb) return ea - eb;
      return String(a.staffName || "").localeCompare(String(b.staffName || ""), "en", {
        sensitivity: "base",
      });
    });
    return out;
  }

  function dcParticipantSortKey(name) {
    var n = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (/^emmanuel\b/.test(n)) n = "emanuel" + n.slice("emmanuel".length);
    return n;
  }

  function appendSundayMultiHalfRows(iso, out) {
    function addHalf(list, book) {
      list.forEach(function (h) {
        var band = parseBandMinutes(h.time.replace(/\s+to\s+/i, " – "));
        if (band.start < 0) {
          /* "9.30 to 10.15" */
          var m = String(h.time || "").match(
            /(\d{1,2}(?:\.\d{1,2})?)\s*to\s*(\d{1,2}(?:\.\d{1,2})?)/i,
          );
          if (m) {
            band = {
              start: toMinutes(m[1]),
              end: toMinutes(m[2]),
            };
            if (band.end <= band.start) band.end += 12 * 60;
          }
        }
        var timeLabel = formatTurnLabel(band.start, band.end);
        pushResolvedRow(out, iso, {
          demoId:
            "sunday-ma|" +
            timeLabel +
            "|" +
            slug(h.client) +
            "|" +
            slug(h.area),
          slotId: "sunday-ma-45",
          venue: "SwimFarm",
          area: h.area,
          timeLabel: timeLabel,
          bandStart: band.start,
          bandEnd: band.end,
          service: "90' Multi-Activity",
          standingStaff: h.staff,
          clientLabel: h.client,
          kind: "booked",
          parentBand: "90'",
          board: "asw",
        });
      });
    }
    addHalf(SUNDAY_MA_POOL_HALVES, "pool");
    addHalf(SUNDAY_MA_HUB_HALVES, "hub");
  }

  function buildStandingRows(iso) {
    var day = dayNameForIso(iso);
    var out = [];
    var map = state.occupantsBySlotId || {};
    Object.keys(map).forEach(function (slotId) {
      var slot = map[slotId];
      if (!slot || String(slot.day || "") !== day) return;
      var service = serviceFromSlotId(slotId, slot.venue);
      /* Day Centre lives in the DC section (canonical pairs), not this seat table. */
      if (isDayCentreService(service)) return;
      var band = parseBandMinutes(slot.timeLabel);
      var dur = band.end >= 0 && band.start >= 0 ? band.end - band.start : 0;
      /* Sunday MA 90' → two 45' turns (not one fat row). */
      if (
        day === "Sunday" &&
        /multi/i.test(service) &&
        dur >= 80
      ) {
        return;
      }
      var lines = slot.seatLines && slot.seatLines.length
        ? slot.seatLines
        : [
            {
              instructor: (slot.instructors || [])[0] || "",
              client: (slot.bookedNames || [])[0] || null,
              kind: (slot.bookedNames || []).length ? "booked" : "open",
            },
          ];
      lines.forEach(function (line, idx) {
        var clientRaw = line.client;
        var kind = String(line.kind || "").toLowerCase();
        var clientLabel = "";
        if (kind === "open" || clientRaw == null || clientRaw === "") {
          clientLabel = "No participant";
          kind = "open";
        } else {
          clientLabel = String(clientRaw);
        }
        if (isFadiOffRotaIso(iso) && isFadiClientLabel(clientLabel)) return;
        var svcLabel = service;
        if (/aquatic/i.test(service) && dur > 0 && dur <= 35) {
          svcLabel = "30' Aquatic Activity";
        } else if (/climb/i.test(service) && dur >= 55 && dur <= 65) {
          svcLabel = "60' Climbing Activity";
        }
        pushResolvedRow(out, iso, {
          demoId: slotId + "#" + (line.seat || idx + 1),
          slotId: slotId,
          venue: String(slot.venue || ""),
          area: line.area || slot.area || "",
          timeLabel: formatTurnLabel(band.start, band.end) || String(slot.timeLabel || ""),
          bandStart: band.start,
          bandEnd: band.end,
          service: svcLabel,
          standingStaff: String(line.instructor || "").trim(),
          clientLabel: clientLabel,
          kind: kind,
          board: "asw",
        });
      });
    });
    if (day === "Sunday") appendSundayMultiHalfRows(iso, out);
    out.sort(function (a, b) {
      var ta = Number(a.bandStart);
      var tb = Number(b.bandStart);
      if (!Number.isFinite(ta)) ta = 99999;
      if (!Number.isFinite(tb)) tb = 99999;
      if (ta !== tb) return ta - tb;
      var ea = Number(a.bandEnd);
      var eb = Number(b.bandEnd);
      if (Number.isFinite(ea) && Number.isFinite(eb) && ea !== eb) return ea - eb;
      return (
        String(a.venue || "").localeCompare(String(b.venue || "")) ||
        String(a.area || "").localeCompare(String(b.area || "")) ||
        String(a.staffName || "").localeCompare(String(b.staffName || "")) ||
        String(a.clientLabel || "").localeCompare(String(b.clientLabel || ""))
      );
    });
    return out;
  }

  function overrideDisplayTime(ov) {
    var fromClock = timeLabelFromStartEnd(ov.anchor_start, ov.anchor_end);
    if (fromClock) return fromClock;
    return String(ov.anchor_time_slot_label || "").trim() || "—";
  }

  function isNoisyTermSlotUpdate(ov) {
    if (!ov || String(ov.override_type || "") !== "slot_update") return false;
    var p = ov.payload || {};
    if (!(p.term_roster_edit || p.scope === "rest_of_term")) return false;
    /* Stale label vs real clock (Patrick 12 vs 16:30) — do not paint as day truth. */
    var labelMins = parseBandMinutes(ov.anchor_time_slot_label).start;
    var startMins = toMinutes(ov.anchor_start);
    if (labelMins >= 0 && startMins >= 0 && Math.abs(labelMins - startMins) >= 30) {
      return true;
    }
    return false;
  }

  function overrideMatchesRow(row, ov) {
    if (!row || !ov) return false;
    if (ov.localDraft && ov.demoId && ov.demoId === row.demoId) return true;
    if (isNoisyTermSlotUpdate(ov)) return false;

    /* Ignore cover assigns when cover is not on Timetable for this turn
       (e.g. Javier→Simon 9–9.30 while Javier starts 9.30). */
    if (String(ov.override_type || "") === "instructor_reassign") {
      var coverNm =
        (ov.payload &&
          (ov.payload.covering_staff_name || ov.payload.covering_staff_id)) ||
        "";
      if (
        coverNm &&
        !coverWorksBand(
          row.sessionIso || state.iso,
          coverNm,
          row.bandStart,
          row.bandEnd,
        )
      ) {
        return false;
      }
    }
    var venueOk =
      !ov.anchor_venue ||
      slug(ov.anchor_venue) === slug(row.venue) ||
      String(row.venue || "")
        .toLowerCase()
        .indexOf(String(ov.anchor_venue || "").toLowerCase()) >= 0;
    if (!venueOk) return false;

    var staffOv = slug(ov.anchor_staff_id);
    if (staffOv) {
      var rowStaff = row.staffId;
      var standingKeys = splitInstructorTokens(row.standingStaff || row.staffName).map(slug);
      var staffHit =
        staffOv === rowStaff ||
        standingKeys.indexOf(staffOv) >= 0 ||
        staffOv === slug(row.staffName);
      if (!staffHit) return false;
    }

    var clientOv = slug(ov.anchor_client_id);
    var openOv =
      !clientOv ||
      clientOv === "available" ||
      clientOv === "open" ||
      clientOv === "no_participant";
    var t = String(ov.override_type || "");

    if (openOv) {
      /* Open-anchor patches only land on open / trial-hold / hold seats. */
      if (!(row.kind === "open" || row.kind === "trial" || row.kind === "hold")) {
        return false;
      }
      if (t === "client_replace_in_slot") {
        var toSlug = slug(
          (ov.payload &&
            (ov.payload.to_client_id ||
              ov.payload.replacement_client_id ||
              ov.payload.to_client_name)) ||
            "",
        );
        if (
          toSlug &&
          row.kind === "trial" &&
          row.clientId &&
          row.clientId.indexOf(toSlug) < 0 &&
          toSlug.indexOf(row.clientId) < 0
        ) {
          /* Prefer the trial hold seat that already names this participant. */
        }
      }
    } else {
      var clientHit =
        clientOv === row.clientId ||
        (row.clientId && row.clientId.indexOf(clientOv) >= 0) ||
        (clientOv && clientOv.indexOf(row.clientId) >= 0) ||
        slug(row.clientLabel).indexOf(clientOv) >= 0;
      if (
        t === "client_replace_in_slot" &&
        (row.kind === "open" || row.kind === "trial" || row.kind === "hold")
      ) {
        var toSlug2 = slug(
          (ov.payload &&
            (ov.payload.to_client_id ||
              ov.payload.replacement_client_id ||
              ov.payload.to_client_name)) ||
            "",
        );
        if (
          toSlug2 &&
          (row.clientId.indexOf(toSlug2) >= 0 ||
            toSlug2.indexOf(row.clientId) >= 0 ||
            /muhammad/i.test(row.clientLabel))
        ) {
          clientHit = true;
        }
      }
      if (!clientHit) return false;
    }

    var ovStart = toMinutes(ov.anchor_start);
    if (ovStart < 0) {
      ovStart = parseBandMinutes(ov.anchor_time_slot_label).start;
    }
    if (ovStart >= 0 && row.bandStart >= 0 && row.bandEnd >= 0) {
      /* Allow half-hour patch inside a wider standing band (Multi). */
      if (ovStart < row.bandStart - 5 || ovStart >= row.bandEnd + 5) return false;
    }
    return true;
  }

  function pickOverridesForRow(row, list) {
    var hits = (list || []).filter(function (ov) {
      return overrideMatchesRow(row, ov);
    });
    var staff = null;
    var other = null;
    hits.forEach(function (ov) {
      var t = String(ov.override_type || "");
      if (t === "instructor_reassign" || t === "instructor_cover_needed") {
        if (!staff) staff = ov;
      } else if (!other) {
        other = ov;
      }
    });
    return { primary: other || staff, staff: staff };
  }

  function decoratePaintRow(row, ovs) {
      var pick = pickOverridesForRow(row, ovs);
      var ov = pick.primary;
      var staffOv = pick.staff;
      var clientHtml = row.clientLabel;
      var pillClass = "pax-pill";
      if (row.kind === "open") pillClass += " pax-pill--open";
      if (row.kind === "cancelled") pillClass += " pax-pill--absent";
      if (row.kind === "trial" || /trial/i.test(row.clientLabel))
        pillClass += " pax-pill--trial";
      if (row.kind === "hold" || /hold/i.test(row.clientLabel))
        pillClass += " pax-pill--hold";

      if (ov && String(ov.override_type) === "client_absence_announced") {
        pillClass += " pax-pill--absent";
      }
      if (ov && String(ov.override_type) === "client_replace_in_slot") {
        var p = ov.payload || {};
        var toName =
          p.to_client_name || p.replacement_client_name || row.clientLabel;
        if (p.is_trial || p.session_kind === "trial" || /trial/i.test(String(toName))) {
          clientHtml = String(toName).indexOf("Trial") >= 0 ? toName : "Trial · " + toName;
          pillClass = "pax-pill pax-pill--trial";
        } else {
          clientHtml = String(toName);
        }
      }

      var instructorHtml = esc(row.staffName || "—");
      var syntheticDayOffOv = null;
      if (row.dayOffCover && row.dayOffTo) {
        instructorHtml =
          '<span class="pax-pill" style="background:#dbeafe;color:#1e3a8a">' +
          esc(row.dayOffTo) +
          "</span>" +
          '<div class="cover-arrow">covers ' +
          esc(row.dayOffFrom || "—") +
          " (day off)</div>";
        syntheticDayOffOv = {
          override_type: "instructor_reassign",
          payload: { covering_staff_name: row.dayOffTo },
        };
      }
      if (staffOv && String(staffOv.override_type) === "instructor_reassign") {
        var cover =
          (staffOv.payload &&
            (staffOv.payload.covering_staff_name ||
              staffOv.payload.covering_staff_id)) ||
          "";
        var orig =
          firstName(row.dayOffFrom || splitInstructorTokens(row.standingStaff)[0] || row.staffName) ||
          firstName(staffOv.anchor_staff_id);
        if (cover) {
          instructorHtml =
            '<span class="pax-pill" style="background:#dbeafe;color:#1e3a8a">' +
            esc(firstName(cover)) +
            "</span>" +
            '<div class="cover-arrow">covers ' +
            esc(orig) +
            "</div>";
        }
      } else if (
        staffOv &&
        String(staffOv.override_type) === "instructor_cover_needed"
      ) {
        instructorHtml =
          esc(row.staffName || "—") +
          '<div class="cover-arrow">COVER NEEDED</div>';
      }

      var chips = [];
      if (row.kind === "cancelled" && !ov) {
        chips.push(
          '<span class="override-chip override--closed">Cancelled</span>',
        );
      }
      if (ov) {
        chips.push(
          '<span class="override-chip ' +
            ovTypeClass(ov) +
            '">' +
            esc(ovTypeLabel(ov)) +
            "</span>",
        );
      }
      if (staffOv && (!ov || String(staffOv.id) !== String(ov.id))) {
        chips.push(
          '<span class="override-chip ' +
            ovTypeClass(staffOv) +
            '">' +
            esc(ovTypeLabel(staffOv)) +
            "</span>",
        );
      } else if (!staffOv && syntheticDayOffOv) {
        chips.push(
          '<span class="override-chip ' +
            ovTypeClass(syntheticDayOffOv) +
            '">' +
            esc(ovTypeLabel(syntheticDayOffOv)) +
            "</span>",
        );
      }
      var ovChip = chips.length
        ? chips.join(" ")
        : '<span class="muted" style="font-size:12px;font-weight:600">NONE</span>';

      return {
        row: row,
        ov: ov,
        staffOv: staffOv || syntheticDayOffOv,
        hasOv: !!(ov || staffOv || syntheticDayOffOv || row.kind === "cancelled"),
        clientHtml:
          '<span class="' +
          pillClass +
          '">' +
          esc(clientHtml) +
          "</span>",
        instructorHtml: instructorHtml,
        ovChip: ovChip,
      };
  }

  function paintDcRows(iso) {
    var standing = buildDcStandingRows(iso);
    var ovs = mergedOverridesForIso(iso);
    return standing.map(function (row) {
      return decoratePaintRow(row, ovs);
    });
  }

  function paintAswRows(iso) {
    var standing = buildStandingRows(iso);
    var ovs = mergedOverridesForIso(iso);
    return standing.map(function (row) {
      return decoratePaintRow(row, ovs);
    });
  }

  function paintRows(iso) {
    return paintDcRows(iso).concat(paintAswRows(iso));
  }

  function countDcUnits(iso) {
    return buildDcStandingRows(iso).filter(function (r) {
      return r.kind !== "open";
    }).length;
  }

  function countAswUnits(iso) {
    return paintAswRows(iso).length;
  }

  function renderWarn() {
    var el = document.getElementById("sclWarn");
    if (!el) return;
    var missing = [];
    if (!state.snapMeta.overrides) missing.push("overrides snap");
    if (!state.snapMeta.occupants) missing.push("occupants snap");
    if (!state.snapMeta.unavail) missing.push("unavailability snap");
    if (!staffHoursRoot()) missing.push("autumn staff hours (Timetable)");
    if (!global.PortalRosterCanonical) missing.push("portal_roster_canonical (DC board)");
    if (!missing.length) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent =
      "Missing: " +
      missing.join(", ") +
      ". Serve from http://127.0.0.1:8765/ and refresh snaps.";
  }

  function renderWeekBar() {
    var el = document.getElementById("sclWeekBar");
    if (!el) return;
    el.innerHTML =
      '<div class="c4k-hub-weekbar">' +
      '<div class="c4k-hub-weekbar__range">' +
      esc(weekRangeLabel(state.weekAnchor)) +
      "</div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      '<button type="button" class="btn btn--ghost btn--sm" id="sclWeekPrev">← Past week</button>' +
      '<button type="button" class="btn btn--sec btn--sm" id="sclWeekThis">This week</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" id="sclWeekNext">Next week →</button>' +
      "</div></div>";
    document.getElementById("sclWeekPrev").onclick = function () {
      state.weekAnchor = addDays(state.weekAnchor, -7);
      state.iso = state.weekAnchor;
      renderAll();
    };
    document.getElementById("sclWeekNext").onclick = function () {
      state.weekAnchor = addDays(state.weekAnchor, 7);
      state.iso = state.weekAnchor;
      renderAll();
    };
    document.getElementById("sclWeekThis").onclick = function () {
      state.iso = "2026-09-13";
      state.weekAnchor = mondayOf(state.iso);
      renderAll();
    };
  }

  function renderDayStrip() {
    var el = document.getElementById("sclDayStrip");
    if (!el) return;
    var cards = [];
    for (var i = 0; i < 7; i++) {
      var iso = addDays(state.weekAnchor, i);
      var day = dayNameForIso(iso);
      var nDc = countDcUnits(iso);
      var nAs = countAswUnits(iso);
      var sel = iso === state.iso;
      cards.push(
        '<div class="c4k-hub-day-card' +
          (sel ? " is-selected" : "") +
          '" data-iso="' +
          esc(iso) +
          '" role="button" tabindex="0">' +
          '<div class="c4k-hub-day-card__day">' +
          esc(day) +
          "</div>" +
          '<div class="c4k-hub-day-card__date">' +
          esc(formatDdMmmYyyy(iso)) +
          "</div>" +
          '<div class="c4k-hub-day-card__rule"></div>' +
          '<div class="c4k-hub-day-card__counts">' +
          '<div class="c4k-hub-day-card__pair">' +
          '<div class="c4k-hub-day-card__count">' +
          esc(String(nDc)) +
          "</div>" +
          '<div class="c4k-hub-day-card__lbl">DC</div>' +
          "</div>" +
          '<div class="c4k-hub-day-card__pair">' +
          '<div class="c4k-hub-day-card__count">' +
          esc(String(nAs)) +
          "</div>" +
          '<div class="c4k-hub-day-card__lbl">AS</div>' +
          "</div>" +
          "</div>" +
          "</div>",
      );
    }
    el.innerHTML =
      '<div class="c4k-hub-day-strip" role="region" aria-label="Week days">' +
      cards.join("") +
      "</div>";
    el.onclick = function (e) {
      var card = e.target && e.target.closest && e.target.closest("[data-iso]");
      if (!card) return;
      state.iso = card.getAttribute("data-iso");
      state.weekAnchor = mondayOf(state.iso);
      renderAll();
    };
  }

  function renderFilters() {
    var el = document.getElementById("sclFilters");
    if (!el) return;
    var venues = {};
    paintRows(state.iso).forEach(function (p) {
      if (p.row.venue) venues[p.row.venue] = 1;
    });
    var venueOpts =
      '<option value="">All venues</option>' +
      Object.keys(venues)
        .sort()
        .map(function (v) {
          return (
            '<option value="' +
            esc(v) +
            '"' +
            (state.venueFilter === v ? " selected" : "") +
            ">" +
            esc(v) +
            "</option>"
          );
        })
        .join("");
    el.innerHTML =
      '<label class="muted" for="sclDate">Date</label>' +
      '<input type="date" class="inp" id="sclDate" min="' +
      TERM_FROM +
      '" max="' +
      TERM_TO +
      '" value="' +
      esc(state.iso) +
      '" />' +
      '<select class="sel" id="sclVenue" aria-label="Venue filter">' +
      venueOpts +
      "</select>" +
      '<label style="display:flex;align-items:center;gap:8px;font-size:13px;min-width:0">' +
      '<input type="checkbox" id="sclOnlyOv"' +
      (state.onlyOverrides ? " checked" : "") +
      " /> Overrides only</label>" +
      '<button type="button" class="btn btn--sec btn--sm" id="sclRefresh">Refresh</button>' +
      '<a class="btn btn--pri btn--sm" href="/admin_dashboard.html?view=scheduling" style="text-decoration:none">Open Admin (live writes)</a>';
    document.getElementById("sclDate").onchange = function (e) {
      state.iso = String(e.target.value || "").slice(0, 10);
      state.weekAnchor = mondayOf(state.iso);
      renderAll();
    };
    document.getElementById("sclVenue").onchange = function (e) {
      state.venueFilter = String(e.target.value || "");
      renderTables();
    };
    document.getElementById("sclOnlyOv").onchange = function (e) {
      state.onlyOverrides = !!e.target.checked;
      renderTables();
    };
    document.getElementById("sclRefresh").onclick = function () {
      loadSnaps().then(renderAll);
    };
  }

  function renderDayOffs() {
    var el = document.getElementById("sclDayOffs");
    if (!el) return;
    var offs = state.unavailByDate[state.iso] || [];
    if (!offs.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = offs
      .map(function (o) {
        return (
          '<div class="dayoff-chip">' +
          esc(firstName(o.label || o.key)) +
          " · Day off" +
          (o.coverName
            ? "<span>Cover: " + esc(o.coverName) + "</span>"
            : "") +
          "</div>"
        );
      })
      .join("");
  }

  function renderTables() {
    var paintedDc = paintDcRows(state.iso);
    var paintedAsw = paintAswRows(state.iso);
    var painted = paintedDc.concat(paintedAsw);
    state.rows = painted;
    function schedSlotRowHtml(p) {
      var coverNeeded = !!(
        p.staffOv &&
        String(p.staffOv.override_type) === "instructor_cover_needed"
      );
      return (
        '<tr class="sched-slot-row' +
        (coverNeeded ? " sched-slot-row--cover-needed" : "") +
        (p.row.kind === "cancelled" ? " sched-slot-row--cancelled" : "") +
        '" data-has-ov="' +
        (p.hasOv ? "1" : "0") +
        '" data-demo-id="' +
        esc(p.row.demoId) +
        '">' +
        "<td>" +
        p.clientHtml +
        "</td>" +
        "<td>" +
        esc(p.row.service) +
        "</td>" +
        "<td>" +
        esc(p.row.timeLabel) +
        "</td>" +
        "<td>" +
        esc(p.row.area || "—") +
        "</td>" +
        "<td>" +
        esc(p.row.venue) +
        "</td>" +
        "<td>" +
        p.instructorHtml +
        "</td>" +
        "<td>" +
        esc(p.row.roster) +
        "</td>" +
        "<td>" +
        p.ovChip +
        "</td>" +
        '<td class="sched-td-action"><button type="button" class="btn btn--sec btn--sm" data-sched-change="' +
        esc(p.row.demoId) +
        '">Change</button></td>' +
        "</tr>"
      );
    }

    function bindChangeClicks(el) {
      if (!el) return;
      el.onclick = function (e) {
        var btn =
          e.target && e.target.closest && e.target.closest("[data-sched-change]");
        if (!btn) return;
        e.preventDefault();
        var id = btn.getAttribute("data-sched-change");
        var hit = null;
        for (var i = 0; i < painted.length; i++) {
          if (painted[i].row.demoId === id) {
            hit = painted[i];
            break;
          }
        }
        if (hit) openSlotDrawer(hit);
      };
    }

    var dcBody = document.getElementById("schedDcBody");
    var body = document.getElementById("schedBaseBody");
    var logBody = document.getElementById("schedLogBody");
    var dcHint = document.getElementById("sclDcHint");
    var boardMeta = dcBoardForIso(state.iso);
    if (dcHint) dcHint.textContent = dcPhaseHint(boardMeta);

    function filterPaint(list) {
      return list.filter(function (p) {
        if (state.venueFilter && p.row.venue !== state.venueFilter) return false;
        if (state.onlyOverrides && !p.hasOv) return false;
        return true;
      });
    }

    var shownDc = filterPaint(paintedDc);
    var shownAsw = filterPaint(paintedAsw);

    if (dcBody) {
      if (boardMeta.phase === "weekend") {
        dcBody.innerHTML =
          '<tr><td colspan="9" class="muted">No Day Centre on weekends - use Afterschool &amp; Weekend below.</td></tr>';
      } else if (!shownDc.length) {
        dcBody.innerHTML =
          '<tr><td colspan="9" class="muted">No Day Centre turns for this filter.</td></tr>';
      } else {
        dcBody.innerHTML = shownDc.map(schedSlotRowHtml).join("");
      }
      bindChangeClicks(dcBody);
    }

    if (body) {
      body.innerHTML = shownAsw.length
        ? shownAsw.map(schedSlotRowHtml).join("")
        : '<tr><td colspan="9" class="muted">No afterschool / weekend seats for this day.</td></tr>';
      bindChangeClicks(body);
    }

    if (!logBody) return;

    var ovs = mergedOverridesForIso(state.iso)
      .filter(function (ov) {
        return !isNoisyTermSlotUpdate(ov);
      })
      .slice()
      .sort(function (a, b) {
        return String(a.anchor_start || "").localeCompare(
          String(b.anchor_start || ""),
        );
      });

    logBody.innerHTML = ovs.length
      ? ovs
          .map(function (ov) {
            return (
              "<tr>" +
              '<td><span class="override-chip ' +
              ovTypeClass(ov) +
              '">' +
              esc(ovTypeLabel(ov)) +
              (ov.localDraft ? " · draft" : "") +
              "</span></td>" +
              "<td>" +
              esc(overrideDisplayTime(ov)) +
              "</td>" +
              "<td>" +
              esc(ov.anchor_venue || "—") +
              "</td>" +
              "<td>" +
              esc(ov.anchor_staff_id || "—") +
              "</td>" +
              "<td>" +
              esc(ov.anchor_client_id || "—") +
              "</td>" +
              "<td>" +
              esc(ov.reason || "—") +
              "</td>" +
              "</tr>"
            );
          })
          .join("")
      : '<tr><td colspan="6" class="muted">No active day overrides.</td></tr>';
  }

  function closeSlotDrawer() {
    state.activePaint = null;
    var bd = document.getElementById("sclDrawerBackdrop");
    var dr = document.getElementById("sclSlotDrawer");
    if (bd) {
      bd.hidden = true;
      bd.classList.remove("is-open");
    }
    if (dr) {
      dr.hidden = true;
      dr.classList.remove("is-open");
      dr.setAttribute("aria-hidden", "true");
    }
  }

  function bandToClock(mins) {
    if (mins < 0) return "";
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00";
  }

  function openSlotDrawer(paint) {
    if (!paint || !paint.row) return;
    state.activePaint = paint;
    var row = paint.row;
    var ov = paint.ov || paint.staffOv;
    var bd = document.getElementById("sclDrawerBackdrop");
    var dr = document.getElementById("sclSlotDrawer");
    var body = document.getElementById("sclDrawerBody");
    var actions = document.getElementById("sclDrawerActions");
    var sub = document.getElementById("sclDrawerSub");
    if (!body || !dr) return;
    if (sub) {
      sub.textContent =
        (row.board === "dc" ? "Day Centre · " : "Afterschool / Weekend · ") +
        row.timeLabel +
        " · " +
        row.venue +
        " · " +
        (row.clientLabel || "—") +
        " · " +
        state.iso;
    }

    var ovBlock = ov
      ? '<div class="card" style="padding:10px;margin-bottom:12px;border:1px solid var(--line);border-radius:10px"><div class="kpi-l">Current override</div><p style="margin:6px 0 0;font-size:13px"><span class="override-chip ' +
        ovTypeClass(ov) +
        '">' +
        esc(ovTypeLabel(ov)) +
        "</span> · " +
        esc(ov.reason || "—") +
        (ov.localDraft
          ? ' <span class="muted">(local draft)</span>'
          : "") +
        "</p>" +
        (ov.localDraft
          ? '<p style="margin:10px 0 0"><button type="button" class="btn btn--sec btn--sm" id="sclUndoDraftBtn">Undo local draft</button></p>'
          : "") +
        "</div>"
      : '<div class="card" style="padding:10px;margin-bottom:12px;border:1px solid var(--line);border-radius:10px"><div class="kpi-l">Current override</div><p class="muted" style="margin:6px 0 0">None for this seat on the selected date.</p></div>';

    var actionBtns = [
      { value: "client_absence_announced", label: "Absent" },
      { value: "client_cancelled", label: "Cancelled" },
      { value: "client_replace_in_slot", label: "MakeUp" },
      { value: "client_trial", label: "Trial" },
      { value: "instructor_reassign", label: "Change Instructor" },
      { value: "instructor_cover_needed", label: "COVER NEEDED" },
      { value: "slot_open", label: "Open closed slot" },
    ]
      .map(function (c) {
        return (
          '<button type="button" class="btn btn--sec btn--sm sched-ov-type-btn" data-ov="' +
          esc(c.value) +
          '" aria-pressed="false">' +
          esc(c.label) +
          "</button>"
        );
      })
      .join("");

    body.innerHTML =
      '<div class="card" style="padding:10px;margin-bottom:12px;border:1px solid var(--line);border-radius:10px"><div class="kpi-l">Base slot</div>' +
      '<ul class="muted" style="margin:6px 0 0;padding-left:18px;font-size:13px;line-height:1.55">' +
      "<li><strong style=\"color:var(--ink)\">Date:</strong> " +
      esc(state.iso) +
      "</li>" +
      "<li><strong style=\"color:var(--ink)\">Time:</strong> " +
      esc(row.timeLabel) +
      "</li>" +
      "<li><strong style=\"color:var(--ink)\">Venue:</strong> " +
      esc(row.venue) +
      "</li>" +
      "<li><strong style=\"color:var(--ink)\">Service:</strong> " +
      esc(row.service) +
      "</li>" +
      "<li><strong style=\"color:var(--ink)\">Instructor (day):</strong> " +
      esc(row.staffName) +
      "</li>" +
      "<li><strong style=\"color:var(--ink)\">Participant:</strong> " +
      esc(row.clientLabel) +
      "</li>" +
      "</ul></div>" +
      ovBlock +
      '<div class="card" style="padding:10px;border:1px solid var(--line);border-radius:10px"><div class="kpi-l">New override</div>' +
      '<div class="kpi-l" style="margin-top:10px">Action</div>' +
      '<input type="hidden" id="sclFormOvType" value="" />' +
      '<div class="sched-ov-type-picker" id="sclOvTypePicker" role="group" aria-label="Override action">' +
      actionBtns +
      "</div>" +
      '<p class="muted" style="margin:8px 0 0;font-size:12px">Selected: <strong id="sclOvTypeSelText">None</strong></p>' +
      '<div id="sclWrapCover" style="display:none">' +
      '<label class="muted" for="sclFormCover" style="display:block;margin-top:12px">Covering instructor</label>' +
      '<input class="inp" id="sclFormCover" style="width:100%;max-width:100%" placeholder="e.g. Luliya" />' +
      "</div>" +
      '<div id="sclWrapReplace" style="display:none">' +
      '<label class="muted" for="sclFormReplace" style="display:block;margin-top:12px">Replacement / trial participant</label>' +
      '<input class="inp" id="sclFormReplace" style="width:100%;max-width:100%" placeholder="e.g. Muhammad" />' +
      "</div>" +
      '<label class="muted" for="sclFormReason" style="display:block;margin-top:12px">Reason / notes</label>' +
      '<textarea class="txa" id="sclFormReason" placeholder="Short operational reason"></textarea>' +
      '<p class="muted" style="margin:10px 0 0;font-size:12px;line-height:1.45;overflow-wrap:break-word">' +
      "Local draft paints this board only. Live overrides that feed Sessions Overview, Staff Today, and Parent portal must be saved in Admin → Schedule &amp; Covers (same <code>schedule_overrides</code> table)." +
      "</p></div>";

    if (actions) {
      actions.innerHTML =
        '<button type="button" class="btn btn--pri btn--sm" id="sclSaveDraftBtn">Save local draft</button>' +
        '<a class="btn btn--sec btn--sm" id="sclOpenAdminBtn" href="/admin_dashboard.html?view=scheduling" style="text-decoration:none">Save live in Admin</a>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="sclDrawerCancel">Cancel</button>';
    }

    if (bd) {
      bd.hidden = false;
      bd.classList.add("is-open");
    }
    dr.hidden = false;
    dr.classList.add("is-open");
    dr.setAttribute("aria-hidden", "false");

    function syncVis() {
      var t = (document.getElementById("sclFormOvType") || {}).value || "";
      var wrapC = document.getElementById("sclWrapCover");
      var wrapR = document.getElementById("sclWrapReplace");
      if (wrapC)
        wrapC.style.display =
          t === "instructor_reassign" || t === "instructor_cover_needed"
            ? ""
            : "none";
      if (wrapR)
        wrapR.style.display =
          t === "client_replace_in_slot" || t === "client_trial" ? "" : "none";
    }

    var picker = document.getElementById("sclOvTypePicker");
    if (picker) {
      picker.onclick = function (e) {
        var b =
          e.target && e.target.closest && e.target.closest("[data-ov]");
        if (!b) return;
        var val = b.getAttribute("data-ov") || "";
        var hid = document.getElementById("sclFormOvType");
        var lab = document.getElementById("sclOvTypeSelText");
        if (hid) hid.value = val;
        if (lab) lab.textContent = b.textContent || val || "None";
        picker.querySelectorAll(".sched-ov-type-btn").forEach(function (x) {
          x.classList.toggle("is-on", x === b);
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
        syncVis();
      };
    }

    var closeBtn = document.getElementById("sclDrawerClose");
    var cancelBtn = document.getElementById("sclDrawerCancel");
    if (closeBtn) closeBtn.onclick = closeSlotDrawer;
    if (cancelBtn) cancelBtn.onclick = closeSlotDrawer;
    if (bd) bd.onclick = closeSlotDrawer;

    var undo = document.getElementById("sclUndoDraftBtn");
    if (undo) {
      undo.onclick = function () {
        var list = draftsForIso(state.iso).filter(function (d) {
          return d.demoId !== row.demoId;
        });
        state.drafts[state.iso] = list;
        saveDrafts();
        closeSlotDrawer();
        renderTables();
      };
    }

    var saveBtn = document.getElementById("sclSaveDraftBtn");
    if (saveBtn) {
      saveBtn.onclick = function () {
        var typeEl = document.getElementById("sclFormOvType");
        var rawType = String((typeEl && typeEl.value) || "").trim();
        if (!rawType) {
          alert("Pick an Action first (Absent, MakeUp, Change Instructor, …).");
          return;
        }
        var ovType = rawType === "client_trial" ? "client_replace_in_slot" : rawType;
        var cover = String(
          (document.getElementById("sclFormCover") || {}).value || "",
        ).trim();
        var repl = String(
          (document.getElementById("sclFormReplace") || {}).value || "",
        ).trim();
        var reason = String(
          (document.getElementById("sclFormReason") || {}).value || "",
        ).trim();
        var payload = {};
        if (ovType === "instructor_reassign") {
          if (!cover) {
            alert("Enter covering instructor.");
            return;
          }
          payload.covering_staff_name = cover;
          payload.covering_staff_id = slug(cover);
        }
        if (ovType === "client_replace_in_slot") {
          if (!repl) {
            alert("Enter replacement / trial participant.");
            return;
          }
          payload.to_client_name = repl;
          payload.to_client_id = slug(repl);
          payload.replacement_client_name = repl;
          payload.replacement_client_id = slug(repl);
          if (rawType === "client_trial") {
            payload.is_trial = true;
            payload.session_kind = "trial";
            payload.booking_kind = "trial";
          }
        }
        if (!reason) {
          reason =
            ovTypeLabel({ override_type: ovType, payload: payload }) +
            " · " +
            row.clientLabel +
            " · " +
            state.iso;
        }
        var draft = {
          id: "local-draft-" + Date.now(),
          localDraft: true,
          demoId: row.demoId,
          session_date: state.iso,
          override_type: ovType,
          reason: reason,
          status: "active",
          anchor_start: bandToClock(row.bandStart),
          anchor_end: bandToClock(row.bandEnd),
          anchor_venue: row.venue,
          anchor_time_slot_label: row.timeLabel,
          anchor_staff_id: row.staffId || slug(row.staffName),
          anchor_client_id:
            row.kind === "open" ? "available" : row.clientId || slug(row.clientLabel),
          payload: payload,
          created_at: new Date().toISOString(),
        };
        var next = draftsForIso(state.iso).filter(function (d) {
          return d.demoId !== row.demoId;
        });
        next.push(draft);
        if (!state.drafts) state.drafts = {};
        state.drafts[state.iso] = next;
        saveDrafts();
        closeSlotDrawer();
        renderTables();
      };
    }
  }

  function renderAll() {
    if (state.iso < TERM_FROM) state.iso = TERM_FROM;
    if (state.iso > TERM_TO) state.iso = TERM_TO;
    state.weekAnchor = mondayOf(state.iso);
    renderWarn();
    renderWeekBar();
    renderDayStrip();
    renderFilters();
    renderDayOffs();
    renderTables();
  }

  function boot() {
    closeSlotDrawer();
    loadSnaps().then(renderAll);
  }

  global.ScheduleCoversLocal = { boot: boot };
})(typeof window !== "undefined" ? window : globalThis);
