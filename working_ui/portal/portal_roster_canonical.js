/**
 * Single roster resolution pipeline for admin + staff dashboards.
 *
 * Runtime truth:
 *   1. Base rows: `staff_dashboard_spreadsheet_bundle.js` → STAFF_DASHBOARD_SOURCE.rows
 *   2. Overlay: Supabase `portal_roster_rows` (templates + dated exceptions)
 *   3. Autumn 26/27 standing patches (Day Centre who-with-whom + Hub Bespoke rota + Cyrus)
 *
 * Day-of operational changes (cover, cancel, add) stay in `schedule_overrides` and are
 * applied when building today's session cards — not duplicated here.
 *
 * Deprecated for roster (do not use to build rows):
 *   - SESSION_FEEDBACK_STATUS_PORTAL_SOURCE projection
 *   - ROSTER_TERM_MASTER_DASHBOARD_ROWS at runtime (build/export seed only)
 *   - Multiple copies of the bundle outside working_ui/portal/
 */
(function (global) {
  "use strict";

  var SOURCE_ID = "live_madre+bundle+portal_roster_rows";
  var SOURCE_VERSION = 28;

  /** Standing snap dates (pre-crash) — Services / staff weekday projection source. */
  var DAY_CENTRE_STANDING_ISO = {
    monday: "2026-07-13",
    tuesday: "2026-07-14",
    wednesday: "2026-07-15",
    thursday: "2026-07-16",
    friday: "2026-07-17",
  };

  var DAY_CENTRE_STANDING_ISO_SET = {
    "2026-07-13": 1,
    "2026-07-14": 1,
    "2026-07-15": 1,
    "2026-07-16": 1,
    "2026-07-17": 1,
  };

  /**
   * Autumn 26/27 Day Centre standing (ops truth for Services + staff snap).
   * Order = board column order. Times match MADRE-style "11 to 1" / "12.30 to 3".
   * Cyrus (Victor Tue 3.30-5) is Bespoke — not listed here; see CYRUS_BESPOKE_ROW.
   * Youssef Acton days (Mon/Thu): DC ends 15:00 then pool from 16:00.
   * Friday: DC through 16:00 (Fadi + Emanuel) then Hub Bespoke 16:15–18:15 (same site).
   */
  var AUTUMN_DAY_CENTRE_BOARD = {
    monday: [
      {
        staff: "Roberto",
        clients: [
          { name: "Emanuel", time: "11 to 1" },
          { name: "Fadi", time: "1 to 3" },
        ],
      },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      { staff: "Victor", clients: [{ name: "Ikram", time: "11 to 4" }] },
      {
        staff: "Raul",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "1 to 4" },
        ],
      },
      { staff: "Youssef", clients: [{ name: "Fadi", time: "12.30 to 3" }] },
    ],
    tuesday: [
      {
        staff: "Roberto",
        clients: [
          { name: "Ikram", time: "11 to 12.30" },
          { name: "Fadi", time: "12.30 to 3" },
        ],
      },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      /* Victor takes Raul's Tue DC; Raul OFF */
      {
        staff: "Victor",
        clients: [
          { name: "Fadi", time: "12.30 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
    ],
    wednesday: [
      {
        staff: "Roberto",
        clients: [
          { name: "Emanuel", time: "11 to 12.30" },
          { name: "Fadi", time: "12.30 to 3" },
          { name: "Emanuel", time: "3 to 4" },
        ],
      },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      {
        staff: "Victor",
        clients: [
          { name: "Fadi", time: "12.30 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      {
        staff: "Raul",
        clients: [
          { name: "Fadi", time: "12.30 to 3" },
          { name: "Emanuel", time: "3 to 4" },
        ],
      },
    ],
    thursday: [
      { staff: "Roberto", clients: [{ name: "Fadi", time: "12.30 to 3" }] },
      { staff: "Youssef", clients: [{ name: "Fadi", time: "12.30 to 3" }] },
    ],
    friday: [
      {
        staff: "Roberto",
        clients: [
          { name: "Emanuel", time: "11 to 1" },
          { name: "Fadi", time: "1 to 3" },
        ],
      },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
      {
        staff: "Victor",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "1 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      {
        staff: "Raul",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "1 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      {
        staff: "Youssef",
        clients: [
          { name: "Fadi", time: "12.30 to 3" },
          { name: "Emanuel", time: "3 to 4" },
        ],
      },
    ],
  };

  var CYRUS_BESPOKE_ROW = {
    client_name: "Cyrus",
    day: "Tuesday",
    instructors: "VICTOR",
    service: "Bespoke Programme",
    area: "Hub Room",
    time_slot: "3.30 to 5",
    venue: "SwimFarm",
    session_date: "2026-07-14",
  };

  /**
   * Autumn 26/27 Hub afternoon Bespoke — same staff shifts as the Autumn rota
   * (Godsway / John / Emanuel Mon+Wed 4.15–6.15; Fri Emanuel + Victor + Youssef; Tinashe booked).
   * Tue/Thu Hub: no Bespoke afternoon shift (Cyrus Tue is Victor 3.30–5 only).
   */
  var AUTUMN_BESPOKE_HUB_ROWS = [
    {
      client_name: "Tinashe",
      day: "Monday",
      instructors: "GODSWAY",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-13",
    },
    {
      client_name: "Tinashe",
      day: "Monday",
      instructors: "JOHN",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-13",
    },
    {
      client_name: "Tinashe",
      day: "Monday",
      instructors: "EMANUEL",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-13",
    },
    {
      client_name: "Tinashe",
      day: "Wednesday",
      instructors: "GODSWAY",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-15",
    },
    {
      client_name: "Tinashe",
      day: "Wednesday",
      instructors: "JOHN",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-15",
    },
    {
      client_name: "Tinashe",
      day: "Wednesday",
      instructors: "EMANUEL",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-15",
    },
    {
      client_name: "Tinashe",
      day: "Friday",
      instructors: "EMANUEL",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-17",
    },
    {
      client_name: "Tinashe",
      day: "Friday",
      instructors: "VICTOR",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-17",
    },
    {
      client_name: "Tinashe",
      day: "Friday",
      instructors: "YOUSSEF",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-17",
    },
  ];

  var DOW_TITLE = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  };

  function normIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function rosterSlug(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normalizeDowKey(dow) {
    var s = String(dow || "")
      .trim()
      .toLowerCase();
    if (s.indexOf("mon") === 0) return "monday";
    if (s.indexOf("tue") === 0) return "tuesday";
    if (s.indexOf("wed") === 0) return "wednesday";
    if (s.indexOf("thu") === 0) return "thursday";
    if (s.indexOf("fri") === 0) return "friday";
    if (s.indexOf("sat") === 0) return "saturday";
    if (s.indexOf("sun") === 0) return "sunday";
    return s;
  }

  function isDayCentreService(service) {
    return /day\s*centre/i.test(String(service || ""));
  }

  function parseHmToMinutes(timeSlot) {
    var raw = String(timeSlot || "")
      .replace(/\s*-\s*/g, " to ")
      .replace(/\s+/g, " ")
      .trim();
    var parts = raw.split(/\s+to\s+/i);
    if (parts.length < 2) return { startMin: 0, endMin: 0, duration: 0 };
    function one(p) {
      var m = String(p || "")
        .trim()
        .match(/^(\d{1,2})(?:[:.](\d{2}))?/);
      if (!m) return 0;
      var h = parseInt(m[1], 10) || 0;
      var min = parseInt(m[2] || "0", 10) || 0;
      if (h < 8) h += 12;
      return h * 60 + min;
    }
    var startMin = one(parts[0]);
    var endMin = one(parts[1]);
    var duration = endMin - startMin;
    if (duration < 0) duration += 24 * 60;
    return { startMin: startMin, endMin: endMin, duration: duration };
  }

  function dedupeRosterAdapterRows(rows) {
    var fold = global.PortalMadreFold;
    if (fold && typeof fold.dedupeRosterAdapterRows === "function") {
      return fold.dedupeRosterAdapterRows(rows);
    }
    var seen = Object.create(null);
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r) return;
      var key = [
        String(r.session_date || "").trim().slice(0, 10),
        String(r.day || "").trim(),
        rosterSlug(r.client_name),
        String(r.instructors || "").trim().toUpperCase(),
        String(r.time_slot || "").trim(),
        rosterSlug(r.service),
        String(r.area || "").trim(),
        String(r.venue || "").trim(),
      ].join("\0");
      if (seen[key]) return;
      seen[key] = true;
      out.push(r);
    });
    return out;
  }

  /** Prefer live Supabase MADRE; fallback to shipped bundle. */
  function getBundleBaseRows() {
    var live = global.PORTAL_MADRE_LIVE;
    if (live && Array.isArray(live.rows) && live.rows.length) {
      return live.rows.slice();
    }
    var src = global.STAFF_DASHBOARD_SOURCE;
    if (!src || !Array.isArray(src.rows) || !src.rows.length) return [];
    return src.rows.slice();
  }

  function applyPortalRosterDbRows(rows) {
    var cache = global.PORTAL_ROSTER_ROWS_CACHE;
    var list = Array.isArray(cache) ? cache : [];
    if (!list.length) return rows;
    var mergeFn =
      global.PortalRosterRowsMerge &&
      typeof global.PortalRosterRowsMerge.mergePortalRosterRows === "function"
        ? global.PortalRosterRowsMerge.mergePortalRosterRows
        : null;
    if (!mergeFn) return rows;
    return mergeFn(rows, list);
  }

  /**
   * Autumn 26/27 Northolt aquatic standing (Services truth — not summer Roberto book).
   * Source: admin Services Mon 7 Sep / Wed 9 Sep 2026 grids.
   */
  var AUTUMN_NORTHOLT_AQUATIC_BOARD = {
    monday: [
      {
        staff: "Dan",
        clients: [
          { name: "No participant", time: "4.30 to 5" },
          { name: "Amar Rai", time: "5 to 5.30" },
          { name: "Amar Rai", time: "5.30 to 6" },
          { name: "Adaam Ah", time: "6 to 6.30" },
        ],
      },
      {
        staff: "Luliya",
        clients: [
          { name: "No participant", time: "4.30 to 5" },
          { name: "Gemma", time: "5 to 5.30" },
          { name: "Zayana", time: "5.30 to 6" },
          { name: "Yamik", time: "6 to 6.30" },
        ],
      },
    ],
    wednesday: [
      {
        staff: "Dan",
        clients: [
          { name: "Tyson", time: "4.30 to 5" },
          { name: "Ruben", time: "5 to 5.30" },
          { name: "Amar Rai", time: "5.30 to 6" },
          { name: "No participant", time: "6 to 6.30" },
        ],
      },
      {
        staff: "Luliya",
        clients: [
          { name: "Vithura", time: "4.30 to 5" },
          { name: "Amar Rai", time: "5 to 5.30" },
          { name: "Amber", time: "5.30 to 6" },
          { name: "No participant", time: "6 to 6.30" },
        ],
      },
    ],
  };

  function autumnNortholtAquaticStandingRows() {
    var out = [];
    Object.keys(AUTUMN_NORTHOLT_AQUATIC_BOARD).forEach(function (dk) {
      var iso = DAY_CENTRE_STANDING_ISO[dk];
      var dayTitle = DOW_TITLE[dk] || dk;
      var cols = AUTUMN_NORTHOLT_AQUATIC_BOARD[dk] || [];
      cols.forEach(function (col) {
        (col.clients || []).forEach(function (c) {
          out.push({
            client_name: c.name,
            day: dayTitle,
            instructors: String(col.staff || "").toUpperCase(),
            service: "Aquatic Activity",
            area: "Teaching Pool",
            time_slot: c.time,
            venue: "Northolt",
            session_date: iso,
          });
        });
      });
    });
    return out;
  }

  function autumnDayCentreStandingRows() {
    var out = [];
    Object.keys(AUTUMN_DAY_CENTRE_BOARD).forEach(function (dk) {
      var iso = DAY_CENTRE_STANDING_ISO[dk];
      var dayTitle = DOW_TITLE[dk] || dk;
      var cols = AUTUMN_DAY_CENTRE_BOARD[dk] || [];
      cols.forEach(function (col) {
        (col.clients || []).forEach(function (c) {
          out.push({
            client_name: c.name,
            day: dayTitle,
            instructors: String(col.staff || "").toUpperCase(),
            service: "Day Centre",
            area: "Hub Room",
            time_slot: c.time,
            venue: "SwimFarm",
            session_date: iso,
          });
        });
      });
    });
    return out;
  }

  function rowDedupeKey(row) {
    return [
      String(row.session_date || "").trim().slice(0, 10),
      String(row.day || "").trim(),
      rosterSlug(row.client_name),
      String(row.instructors || "").trim().toUpperCase(),
      String(row.time_slot || "").trim(),
      rosterSlug(row.service),
      String(row.area || "").trim(),
      String(row.venue || "").trim(),
    ].join("\0");
  }

  function isBespokeService(service) {
    return /bespoke/i.test(String(service || ""));
  }

  function isMultiActivityService(service) {
    return /multi[\s-]*activity/i.test(String(service || ""));
  }

  /**
   * Autumn Sunday Hub rota: Godsway + Emanuel replace departed Bismark / Giuseppe
   * on Multi-Activity (same clients / 45′ halves).
   */
  function remapAutumnMultiInstructors(instructorsRaw) {
    var s = String(instructorsRaw || "").trim();
    if (!s) return s;
    return s
      .replace(/\bBISMARK\b/gi, "GODSWAY")
      .replace(/\bBISMARCK\b/gi, "GODSWAY")
      .replace(/\bGIUSEPPE\b/gi, "EMANUEL");
  }

  /** Autumn Acton pool remaps for departed / cover staff. */
  function remapAutumnActonPoolInstructors(row) {
    if (!row) return null;
    if (!isAquaticService(row.service)) return null;
    if (!isActonVenue(row.venue)) return null;
    var day = normalizeDowKey(row.day);
    var raw = String(row.instructors || "").trim();
    if (!raw) return null;
    var client = String(row.client_name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    /* Monday: Roberto takes Angel's Acton book (Adam P / Steven / Mario). */
    if (day === "monday" && /\bangel\b/i.test(raw)) {
      if (/\broberto\b/i.test(raw)) return null;
      return { instructors: "ROBERTO" };
    }

    if (day === "tuesday") {
      /* Angel's remaining Tue Acton (Cayra) → Luliya; Rayan Ta / Richard stay Javier. */
      if (/\bangel\b/i.test(raw)) {
        if (/\bluliya\b|\blulia\b|\baida\b/i.test(raw)) return null;
        return { instructors: "LULIYA" };
      }
      if (/^rayan\s*ta\b/.test(client) || client === "richard") {
        if (/\bjavier\b/i.test(raw)) return null;
        return { instructors: "JAVIER" };
      }
      return null;
    }

    /* Thursday: Luliya takes Simon's Acton book (Yuri / Eiji). */
    if (day === "thursday" && /\bsimon\b/i.test(raw)) {
      if (/\bluliya\b|\blulia\b|\baida\b/i.test(raw)) return null;
      return { instructors: "LULIYA" };
    }

    return null;
  }

  function isAquaticService(service) {
    return /aquatic/i.test(String(service || ""));
  }

  function isYoussefInstructor(instructorsRaw) {
    return /\byoussef\b/i.test(String(instructorsRaw || ""));
  }

  function isActonVenue(venue) {
    return /acton/i.test(String(venue || ""));
  }

  function isYoussefActon430ClosedSlot(row) {
    if (!row) return false;
    if (!/^closed$/i.test(String(row.client_name || "").trim())) return false;
    if (!isAquaticService(row.service)) return false;
    if (!isActonVenue(row.venue)) return false;
    if (!isYoussefInstructor(row.instructors)) return false;
    var day = normalizeDowKey(row.day);
    if (day && day !== "monday" && day !== "tuesday" && day !== "wednesday") return false;
    var slot = String(row.time_slot || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return (
      slot === "4 to 4.30" ||
      slot === "4.00 to 4.30" ||
      slot === "4:00 to 4:30" ||
      slot.indexOf("4 to 4.30") === 0
    );
  }

  var YOUSSEF_ACTON_OPEN_430_ROWS = [
    {
      client_name: "No participant",
      day: "Monday",
      instructors: "YOUSSEF",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "4 to 4.30",
      venue: "Acton",
      session_date: "2026-07-13",
    },
    {
      client_name: "No participant",
      day: "Tuesday",
      instructors: "YOUSSEF",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "4 to 4.30",
      venue: "Acton",
      session_date: "2026-07-14",
    },
    {
      client_name: "No participant",
      day: "Wednesday",
      instructors: "YOUSSEF",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "4 to 4.30",
      venue: "Acton",
      session_date: "2026-07-15",
    },
  ];

  /** Angel's Monday Acton book → Roberto (inject if live MADRE dropped Angel without successor). */
  var ROBERTO_MONDAY_ACTON_FROM_ANGEL = [
    {
      client_name: "Adam P",
      day: "Monday",
      instructors: "ROBERTO",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "4 to 5.30",
      venue: "Acton",
      session_date: "2026-07-13",
    },
    {
      client_name: "Steven",
      day: "Monday",
      instructors: "ROBERTO",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "5.30 to 6",
      venue: "Acton",
      session_date: "2026-07-13",
    },
    {
      client_name: "Mario",
      day: "Monday",
      instructors: "ROBERTO",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "6 to 6.30",
      venue: "Acton",
      session_date: "2026-07-13",
    },
  ];

  /** Simon's Thursday Acton book → Luliya (inject if live MADRE dropped Simon without successor). */
  var LULIYA_THURSDAY_ACTON_FROM_SIMON = [
    {
      client_name: "Yuri",
      day: "Thursday",
      instructors: "LULIYA",
      service: "Aquatic Activity",
      area: "Lane (SE)",
      time_slot: "5 to 5.30",
      venue: "Acton",
      session_date: "2026-07-16",
    },
    {
      client_name: "Eiji",
      day: "Thursday",
      instructors: "LULIYA",
      service: "Aquatic Activity",
      area: "Lane (DE)",
      time_slot: "5.30 to 6.30",
      venue: "Acton",
      session_date: "2026-07-16",
    },
  ];

  function mondayActonClientKey(name) {
    var s = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (/^adam\s*p/.test(s)) return "adam_p";
    if (/^steven\b/.test(s)) return "steven";
    if (/^mario\b/.test(s)) return "mario";
    return s.replace(/[^a-z0-9]+/g, "_");
  }

  function hasMondayActonClient(rows, clientKey) {
    var iso = DAY_CENTRE_STANDING_ISO.monday;
    return (rows || []).some(function (r) {
      if (!r) return false;
      if (normIso(r.session_date) !== iso) return false;
      if (!isActonVenue(r.venue) || !isAquaticService(r.service)) return false;
      return mondayActonClientKey(r.client_name) === clientKey;
    });
  }

  function thursdayActonClientKey(name) {
    var s = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (/^yuri\b/.test(s)) return "yuri";
    if (/^eiji\b/.test(s)) return "eiji";
    return s.replace(/[^a-z0-9]+/g, "_");
  }

  function hasThursdayActonClient(rows, clientKey) {
    var iso = DAY_CENTRE_STANDING_ISO.thursday;
    return (rows || []).some(function (r) {
      if (!r) return false;
      if (normIso(r.session_date) !== iso) return false;
      if (!isActonVenue(r.venue) || !isAquaticService(r.service)) return false;
      return thursdayActonClientKey(r.client_name) === clientKey;
    });
  }

  /** Summer dated window whose Day Centre who-with-whom is replaced by Autumn board. */
  var AUTUMN_DC_REPLACE_FROM = "2026-06-01";
  var AUTUMN_DC_REPLACE_THROUGH = "2026-07-19";

  /**
   * Autumn 26/27 standing patches on snap dates (13–17 Jul):
   * - Replace summer Day Centre who-with-whom with Autumn DC board
   *   (drop all DC rows in the summer dated window for weekdays on the board —
   *   not only 13–17 Jul — so June ACAT/Fadi snaps cannot win Autumn projection)
   * - Replace summer Hub Bespoke with Autumn rota staff + Tinashe / Cyrus
   * - Multi-Activity: Bismark→Godsway, Giuseppe→Emanuel (Sunday Hub shifts)
   * - Acton Mon: Angel → Roberto (Adam P / Steven / Mario)
   * - Acton Tue: Angel → Luliya (Cayra); Rayan Ta + Richard → Javier
   * - Acton Thu: Simon → Luliya (Yuri / Eiji)
   * - Northolt Mon/Wed: replace summer (Roberto/Dan) with Services Autumn Dan+Luliya book
   * - Luliya: DC Ikram Mon/Tue/Wed 11–3 + Fri 11–4; pool Mon/Wed Northolt 4.30–6.30,
   *   Tue Acton 4–6.30, Thu Acton 4.30–6.30
   * - Roberto Wed DC: Emanuel 11–12.30, Fadi 12.30–3, Emanuel 3–4 (no afternoon Acton)
   * - Acton Mon/Tue/Wed 4–4.30 Youssef: CLOSED → open (No participant)
   */
  function applyAutumnStandingParticipantRows(rows) {
    var out = [];
    var opened430 = { monday: false, tuesday: false, wednesday: false };
    function isLuliyaInstructor(instructorsRaw) {
      return /\bluliya\b|\blulia\b|\baida\b/i.test(String(instructorsRaw || ""));
    }
    function isShadowingOnlyRow(r) {
      var cn = String(r.client_name || "").trim().toLowerCase();
      var svc = String(r.service || "").trim().toLowerCase();
      return cn === "shadowing" || svc === "shadowing";
    }
    function isNortholtVenue(venue) {
      return /northolt/i.test(String(venue || ""));
    }
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var d = normIso(r.session_date);
      /* Drop summer Luliya shadowing-only Northolt rows (not Autumn book). */
      if (isLuliyaInstructor(r.instructors) && isShadowingOnlyRow(r)) return;
      if (isDayCentreService(r.service)) {
        var dkDc = normalizeDowKey(r.day);
        if (
          AUTUMN_DAY_CENTRE_BOARD[dkDc] &&
          d &&
          d >= AUTUMN_DC_REPLACE_FROM &&
          d <= AUTUMN_DC_REPLACE_THROUGH
        ) {
          return;
        }
      }
      /* Drop summer Northolt aquatic Mon/Wed — rebuild from AUTUMN_NORTHOLT_AQUATIC_BOARD. */
      if (
        isAquaticService(r.service) &&
        isNortholtVenue(r.venue) &&
        d &&
        d >= AUTUMN_DC_REPLACE_FROM &&
        d <= AUTUMN_DC_REPLACE_THROUGH
      ) {
        var dkNh = normalizeDowKey(r.day);
        if (AUTUMN_NORTHOLT_AQUATIC_BOARD[dkNh]) return;
      }
      /* Drop all standing-week Bespoke — rebuild from Autumn Hub rota below. */
      if (isBespokeService(r.service) && DAY_CENTRE_STANDING_ISO_SET[d]) {
        return;
      }
      if (isBespokeService(r.service) && /^cyrus\b/i.test(String(r.client_name || "").trim())) {
        return;
      }
      if (isYoussefActon430ClosedSlot(r)) {
        var dkClosed = normalizeDowKey(r.day) || "monday";
        if (opened430[dkClosed] !== undefined) opened430[dkClosed] = true;
        out.push(
          Object.assign({}, r, {
            client_name: "No participant",
          })
        );
        return;
      }
      /* Standing Tue/Wed often omit Youssef 4–4.30 — treat CLOSED / NO CLIENT as open too. */
      if (
        isAquaticService(r.service) &&
        isActonVenue(r.venue) &&
        isYoussefInstructor(r.instructors) &&
        (normalizeDowKey(r.day) === "tuesday" || normalizeDowKey(r.day) === "wednesday")
      ) {
        var slotW = String(r.time_slot || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (
          slotW === "4 to 4.30" ||
          slotW === "4.00 to 4.30" ||
          slotW.indexOf("4 to 4.30") === 0
        ) {
          var dkOpen = normalizeDowKey(r.day);
          if (opened430[dkOpen] !== undefined) opened430[dkOpen] = true;
          var cnW = String(r.client_name || "").trim();
          if (/^(closed|no client|noclient|no_client|available)$/i.test(cnW)) {
            out.push(Object.assign({}, r, { client_name: "No participant" }));
            return;
          }
        }
      }
      var poolPatch = remapAutumnActonPoolInstructors(r);
      if (poolPatch) {
        out.push(Object.assign({}, r, poolPatch));
        return;
      }
      if (isMultiActivityService(r.service)) {
        var mapped = remapAutumnMultiInstructors(r.instructors);
        if (mapped !== String(r.instructors || "").trim()) {
          out.push(Object.assign({}, r, { instructors: mapped }));
          return;
        }
      }
      out.push(r);
    });
    autumnDayCentreStandingRows().forEach(function (row) {
      out.push(row);
    });
    autumnNortholtAquaticStandingRows().forEach(function (row) {
      out.push(row);
    });
    AUTUMN_BESPOKE_HUB_ROWS.forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    out.push(Object.assign({}, CYRUS_BESPOKE_ROW));
    YOUSSEF_ACTON_OPEN_430_ROWS.forEach(function (row) {
      var dk = normalizeDowKey(row.day);
      if (opened430[dk]) return;
      out.push(Object.assign({}, row));
    });
    ROBERTO_MONDAY_ACTON_FROM_ANGEL.forEach(function (row) {
      var key = mondayActonClientKey(row.client_name);
      if (hasMondayActonClient(out, key)) return;
      out.push(Object.assign({}, row));
    });
    LULIYA_THURSDAY_ACTON_FROM_SIMON.forEach(function (row) {
      var key = thursdayActonClientKey(row.client_name);
      if (hasThursdayActonClient(out, key)) return;
      out.push(Object.assign({}, row));
    });
    return out;
  }

  /**
   * Services Day Centre staff board model (ordered columns).
   * @param {string} dowNorm
   * @param {{ coach?: string, participant?: string }|null} [filt]
   */
  function buildDayCentreStaffBoard(dowNorm, filt) {
    var dk = normalizeDowKey(dowNorm);
    var cols = AUTUMN_DAY_CENTRE_BOARD[dk] || [];
    var byStaff = {};
    var staffOrder = [];
    var coachFilt = filt && filt.coach ? String(filt.coach).trim().toLowerCase() : "";
    var paxFilt = filt && filt.participant ? String(filt.participant).trim().toLowerCase() : "";
    cols.forEach(function (col) {
      var snm = String(col.staff || "").trim();
      if (!snm) return;
      if (coachFilt && snm.toLowerCase().indexOf(coachFilt) < 0 && coachFilt.indexOf(snm.toLowerCase()) < 0) {
        return;
      }
      var snKey = snm.toLowerCase();
      var clients = [];
      (col.clients || []).forEach(function (c) {
        var pax = String(c.name || "").trim();
        if (!pax) return;
        if (paxFilt && pax.toLowerCase().indexOf(paxFilt) < 0 && paxFilt.indexOf(pax.toLowerCase()) < 0) {
          return;
        }
        var parsed = parseHmToMinutes(c.time);
        clients.push({
          client: pax,
          time: String(c.time || "").trim(),
          area: "Day Centre",
          startMin: parsed.startMin,
          duration: parsed.duration,
        });
      });
      if (!clients.length) return;
      clients.sort(function (a, b) {
        return a.startMin - b.startMin || String(a.client).localeCompare(String(b.client));
      });
      byStaff[snKey] = { key: snKey, name: snm, clients: clients };
      staffOrder.push(snKey);
    });
    return { staffOrder: staffOrder, byStaff: byStaff };
  }

  /**
   * Canonical roster rows for STAFF_DASHBOARD_SOURCE.rows.
   * @param {{ skipDb?: boolean }} [opts]
   */
  function resolveCanonicalRosterRows(opts) {
    opts = opts || {};
    var base = getBundleBaseRows();
    /* Autumn standing first, then portal_roster_rows so dated trials (e.g. Muhammad Mon Northolt) win. */
    var withAutumn = applyAutumnStandingParticipantRows(base);
    var merged = opts.skipDb ? withAutumn.slice() : applyPortalRosterDbRows(withAutumn);
    return dedupeRosterAdapterRows(merged);
  }

  function resolveCanonicalStaffDashboardSource() {
    var base = global.STAFF_DASHBOARD_SOURCE || {};
    var rows = resolveCanonicalRosterRows();
    return Object.assign({}, base, {
      rows: rows,
      rosterSourceId: SOURCE_ID,
      rosterSourceVersion: SOURCE_VERSION,
      rosterSourceNote:
        global.PORTAL_MADRE_LIVE && global.PORTAL_MADRE_LIVE.rows
          ? "Live MADRE (portal_madre_document) + portal_roster_rows + Autumn standing (DC/Hub/Northolt/Acton)"
          : "Bundle (MADRE snapshot) + portal_roster_rows + Autumn standing (DC/Hub/Northolt/Acton)",
    });
  }

  function getCanonicalRosterMeta() {
    var bundleCount = getBundleBaseRows().length;
    var dbCount = Array.isArray(global.PORTAL_ROSTER_ROWS_CACHE)
      ? global.PORTAL_ROSTER_ROWS_CACHE.length
      : 0;
    var resolved = resolveCanonicalRosterRows();
    return {
      sourceId: SOURCE_ID,
      version: SOURCE_VERSION,
      bundleRowCount: bundleCount,
      portalRosterRowsCached: dbCount,
      resolvedRowCount: resolved.length,
    };
  }

  global.PortalRosterCanonical = {
    SOURCE_ID: SOURCE_ID,
    SOURCE_VERSION: SOURCE_VERSION,
    getBundleBaseRows: getBundleBaseRows,
    applyPortalRosterDbRows: applyPortalRosterDbRows,
    applyAutumnStandingParticipantRows: applyAutumnStandingParticipantRows,
    resolveCanonicalRosterRows: resolveCanonicalRosterRows,
    resolveCanonicalStaffDashboardSource: resolveCanonicalStaffDashboardSource,
    getCanonicalRosterMeta: getCanonicalRosterMeta,
    buildDayCentreStaffBoard: buildDayCentreStaffBoard,
    autumnDayCentreStandingRows: autumnDayCentreStandingRows,
    DAY_CENTRE_STANDING_ISO: DAY_CENTRE_STANDING_ISO,
    AUTUMN_DAY_CENTRE_BOARD: AUTUMN_DAY_CENTRE_BOARD,
    normIso: normIso,
  };
})(typeof window !== "undefined" ? window : globalThis);
