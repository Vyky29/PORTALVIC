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
  var SOURCE_VERSION = 56;

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
   * Friday: Roberto DC 11-3 then Hub Bespoke Tinashe 4.15-6.15 (in his 21h PT band);
   * Youssef DC through 16:00 then Acton aquatic.
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
      /* Victor OFF Mondays (DC) */
      { staff: "Victor", clients: [] },
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
          { name: "ACAT", time: "11 to 12" },
          { name: "Fadi", time: "12.30 to 3" },
        ],
      },
      /* Michelle Tue: Ikram full DC block 11-4 (no Manager duty). */
      {
        staff: "Michelle",
        clients: [{ name: "Ikram", time: "11 to 4" }],
      },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      /* Victor takes Raul's Tue DC; Raul OFF (column kept for board visibility) */
      {
        staff: "Victor",
        clients: [
          { name: "Fadi", time: "12.30 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      { staff: "Raul", clients: [] },
      { staff: "Youssef", clients: [] },
    ],
    wednesday: [
      {
        staff: "Roberto",
        /* Wed: Emanuel morning + Fadi through 15:00; no Emanuel 3–4 */
        clients: [
          { name: "Emanuel", time: "11 to 12.30" },
          { name: "Fadi", time: "12.30 to 3" },
        ],
      },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      {
        staff: "Victor",
        clients: [
          /* Fadi Wed is Roberto + Raul; Victor has Emanuel mid-block */
          { name: "Emanuel", time: "12.30 to 3" },
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
      /* Michelle + Luliya Ikram to 4; Victor + Raul Timi then Emanuel 1–4; Youssef Fadi to 3 (Acton from 4). */
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
      {
        staff: "Victor",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "1 to 4" },
        ],
      },
      {
        staff: "Raul",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "1 to 4" },
        ],
      },
      {
        staff: "Youssef",
        clients: [{ name: "Fadi", time: "12.30 to 3" }],
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
   * Autumn 26/27 Hub afternoon Bespoke — same staff as LOCAL EXTRA standing start
   * (Godsway / John / Raul Mon+Wed 4.15-6.15; Fri Roberto; Tinashe booked).
   * Tue/Thu Hub: no Bespoke afternoon shift (Cyrus Tue is Victor 3.30-5 only).
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
      instructors: "RAUL",
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
      instructors: "RAUL",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-15",
    },
    {
      client_name: "Tinashe",
      day: "Friday",
      instructors: "ROBERTO",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.15 to 6.15",
      venue: "SwimFarm",
      session_date: "2026-07-17",
    },
  ];

  /** Week 1 DC only (Tue 1 – Fri 4 Sep 2026). Dated rows so Today cards match ops, not Jul snap. */
  var WEEK1_DC_ISO = {
    tuesday: "2026-09-01",
    wednesday: "2026-09-02",
    thursday: "2026-09-03",
    friday: "2026-09-04",
  };
  var WEEK1_DC_BOARD = {
    tuesday: [
      { staff: "Roberto", clients: [{ name: "Ikram", time: "11 to 3" }] },
      {
        staff: "Michelle",
        clients: [
          { name: "Manager", time: "11 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
    ],
    wednesday: [
      { staff: "Roberto", clients: [{ name: "Emanuel", time: "11 to 4" }] },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
    ],
    thursday: [
      { staff: "Roberto", clients: [] },
      { staff: "Youssef", clients: [] },
    ],
    friday: [
      { staff: "Roberto", clients: [{ name: "Emanuel", time: "11 to 4" }] },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Victor", clients: [{ name: "Timi", time: "11 to 1" }] },
      { staff: "Raul", clients: [{ name: "Timi", time: "11 to 1" }] },
      { staff: "Youssef", clients: [] },
    ],
  };

  function autumnWeek1DayCentreRows() {
    var out = [];
    Object.keys(WEEK1_DC_BOARD).forEach(function (dk) {
      var iso = WEEK1_DC_ISO[dk];
      var dayTitle = DOW_TITLE[dk] || dk;
      (WEEK1_DC_BOARD[dk] || []).forEach(function (col) {
        (col.clients || []).forEach(function (c) {
          out.push({
            client_name: c.name,
            day: dayTitle,
            instructors: String(col.staff || "").toUpperCase(),
            service: "Day Centre",
            area: c.name && String(c.name).toLowerCase() === "manager" ? "Hub · Manager" : "Hub Room",
            time_slot: c.time,
            venue: "SwimFarm",
            session_date: iso,
          });
        });
      });
    });
    return out;
  }

  /**
   * Standing Tue Acton AS (from Mon 7 Sep): Roberto / Aurora / Javier / Luliya.
   * Logan + Richard → Roberto; Serine → Luliya; no Youssef.
   */
  var AUTUMN_ACTON_TUESDAY_BOARD = [
    { staff: "ROBERTO", name: "No participant", time: "4 to 4.30" },
    { staff: "ROBERTO", name: "No participant", time: "4.30 to 5" },
    { staff: "ROBERTO", name: "Logan", time: "5 to 5.30" },
    { staff: "ROBERTO", name: "No participant", time: "5.30 to 6" },
    { staff: "ROBERTO", name: "Richard", time: "6 to 6.30" },
    /* On shift from 4 — empty seat is open (No participant), never Closed. */
    { staff: "LULIYA", name: "No participant", time: "4 to 4.30" },
    { staff: "LULIYA", name: "Serine", time: "4.30 to 5.30" },
    { staff: "LULIYA", name: "No participant", time: "5.30 to 6" },
    { staff: "LULIYA", name: "No participant", time: "6 to 6.30" },
    /* Invoice INV-P-0139: Aquatic 60' Tue 4–5 Acton (same as Thu). */
    { staff: "JAVIER", name: "Ayman", time: "4 to 5" },
    { staff: "JAVIER", name: "Linda", time: "5 to 5.30" },
    { staff: "JAVIER", name: "Rayan Ta", time: "5.30 to 6" },
    { staff: "JAVIER", name: "Kareena", time: "6 to 6.30" },
    { staff: "AURORA", name: "Closed", time: "4 to 4.30" },
    { staff: "AURORA", name: "Adam Mahmmoud", time: "4.30 to 5" },
    { staff: "AURORA", name: "Junaid", time: "5 to 5.30" },
    { staff: "AURORA", name: "Aydaan Ah", time: "5.30 to 6" },
    { staff: "AURORA", name: "Anas", time: "6 to 6.30" },
  ];

  function autumnActonTuesdayStandingRows() {
    var iso = DAY_CENTRE_STANDING_ISO.tuesday;
    return AUTUMN_ACTON_TUESDAY_BOARD.map(function (slot) {
      return {
        client_name: slot.name,
        day: "Tuesday",
        instructors: slot.staff,
        service: "Aquatic Activity",
        area: "Teaching Pool",
        time_slot: slot.time,
        venue: "Acton",
        session_date: iso,
      };
    });
  }

  function isAutumnWeek1DcIso(iso) {
    var d = normIso(iso);
    return d >= "2026-09-01" && d <= "2026-09-04";
  }

  /** True when this Day Centre row is the Jul standing snap used for Mon 7+ projection. */
  function isAutumnDcStandingTemplateRow(row) {
    if (!row || !isDayCentreService(row.service)) return false;
    return isAutumnStandingTemplateIso(row.session_date);
  }

  function isTuesdayActonAquaticStandingRow(row) {
    if (!row) return false;
    if (!isActonVenue(row.venue)) return false;
    if (normalizeDowKey(row.day) !== "tuesday") return false;
    /*
     * Empty-service junk (e.g. bundle "cayra"/"richard" 16.30 rows under ANGEL) must
     * also be replaced — otherwise Autumn weekday snap resurrects Angel's old book.
     */
    if (!isAquaticService(row.service) && String(row.service || "").trim()) return false;
    var d = normIso(row.session_date);
    if (!d) return true;
    if (d >= AUTUMN_DC_REPLACE_FROM && d <= AUTUMN_DC_REPLACE_THROUGH) return true;
    return false;
  }

  /**
   * No Autumn Term 2026 sessions (LOCAL has no columns). Summer / MADRE leftovers
   * must not project onto Sep+ Today or Term calendars.
   */
  var AUTUMN_NO_SESSION_STAFF_KEYS = ["angel", "giuseppe", "andres", "bismark"];
  var AUTUMN_NO_SESSION_INSTRUCTOR_RE =
    /\b(angel|giuseppe|andres|andr[eé]s|bismark|bismarck)\b/i;

  function isAutumnNoSessionStaffKey(staffKey) {
    var id = String(staffKey || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (!id) return false;
    if (id === "andres" || id === "andrés" || id === "andresx") return true;
    return AUTUMN_NO_SESSION_STAFF_KEYS.indexOf(id) >= 0;
  }

  function scrubDepartedAutumnInstructorRows(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var row = r;
      /* DB overlays may reintroduce summer Multi names — remap again before scrub. */
      if (isMultiActivityService(row.service)) {
        var mapped = remapAutumnMultiInstructorsStanding(row.instructors);
        if (mapped !== String(row.instructors || "").trim()) {
          row = Object.assign({}, row, { instructors: mapped });
        }
      }
      var inst = String(row.instructors || "").trim();
      if (!AUTUMN_NO_SESSION_INSTRUCTOR_RE.test(inst)) {
        out.push(row);
        return;
      }
      /* Strip departed co-instructors; keep the seat if anyone Autumn remains. */
      var kept = inst
        .split(/[,+/]| and /i)
        .map(function (p) {
          return String(p || "").trim();
        })
        .filter(function (p) {
          return p && !AUTUMN_NO_SESSION_INSTRUCTOR_RE.test(p);
        });
      if (!kept.length) return;
      out.push(Object.assign({}, row, { instructors: kept.join(", ").toUpperCase() }));
    });
    return out;
  }

  /** @deprecated use scrubDepartedAutumnInstructorRows */
  function scrubDepartedAngelInstructorRows(rows) {
    return scrubDepartedAutumnInstructorRows(rows);
  }

  function applyAutumnWeek1DayCentre(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (isDayCentreService(r.service) && isAutumnWeek1DcIso(r.session_date)) return;
      out.push(r);
    });
    autumnWeek1DayCentreRows().forEach(function (row) {
      out.push(row);
    });
    return out;
  }

  function applyAutumnActonTuesdayStanding(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (isTuesdayActonAquaticStandingRow(r)) return;
      out.push(r);
    });
    autumnActonTuesdayStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    return out;
  }

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
          { name: "Muhammad", time: "4.30 to 5" },
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

  /** Sun 6 Sep 2026: Emanuel off — John covers his Hub Multi book (dated so Today matches). */
  var SEP6_2026_JOHN_EMANUEL_HUB_MULTI = [
    { client_name: "Zaid", time_slot: "9.30 to 10.15" },
    /* Standing Jack S <-> Samer: Hub 10.15 is Jack S. */
    { client_name: "Jack S", time_slot: "10.15 to 11" },
    { client_name: "Eiji", time_slot: "11 to 11.45" },
    { client_name: "Hazem", time_slot: "11.45 to 12.30" },
    { client_name: "Haneef", time_slot: "12.30 to 1.15" },
    { client_name: "Rayyan F", time_slot: "1.15 to 2" },
  ];

  /** Sun 6 Sep 2026: Berta Lead keeps the Hub Multi book that was on John. */
  var SEP6_2026_BERTA_HUB_MULTI = [
    { client_name: "Jack W", time_slot: "9.30 to 10.15" },
    { client_name: "Adam Ab", time_slot: "10.15 to 11" },
    { client_name: "Cyrus", time_slot: "11 to 11.45" },
    { client_name: "Arthur Ma", time_slot: "11.45 to 12.30" },
    { client_name: "Erik", time_slot: "12.30 to 1.15" },
    { client_name: "Aydaan Ah", time_slot: "1.15 to 2" },
  ];

  function autumnSundaySep6HubCoverRows() {
    var john = SEP6_2026_JOHN_EMANUEL_HUB_MULTI.map(function (slot) {
      return {
        client_name: slot.client_name,
        day: "Sunday",
        instructors: "JOHN",
        service: "Multi-Activity",
        area: "Hub Room",
        time_slot: slot.time_slot,
        venue: "SwimFarm",
        session_date: "2026-09-06",
      };
    });
    var berta = SEP6_2026_BERTA_HUB_MULTI.map(function (slot) {
      return {
        client_name: slot.client_name,
        day: "Sunday",
        instructors: "BERTA",
        service: "Multi-Activity",
        area: "Hub Room",
        time_slot: slot.time_slot,
        venue: "SwimFarm",
        session_date: "2026-09-06",
      };
    });
    return john.concat(berta);
  }

  /**
   * Autumn Sunday Hub Multi standing remaps (snap-date agnostic).
   * Standing Jul week may still store Hub books under BERTA / GIUSEPPE / JOHN etc.
   * - BISMARK → GODSWAY; GIUSEPPE → EMANUEL
   * - JOHN → BERTA (Berta Lead keeps that Hub book; John only works Sun 6 via dated cover)
   * Sun 6 Sep: dated autumnSundaySep6HubCoverRows give John the Emanuel book.
   */
  function remapAutumnMultiInstructorsStanding(instructorsRaw) {
    var s = String(instructorsRaw || "").trim();
    if (!s) return s;
    return s
      .replace(/\bBISMARK\b/gi, "GODSWAY")
      .replace(/\bBISMARCK\b/gi, "GODSWAY")
      .replace(/\bGIUSEPPE\b/gi, "EMANUEL")
      /* Standing: Berta Lead keeps the Hub book that summer stored under John.
       * Sun 6 dated cover re-injects JOHN for the Emanuel book after this remap. */
      .replace(/\bJOHN\b/gi, "BERTA");
  }

  /**
   * Resolve instructors for a *calendar* day (Today / team strip).
   * Standing Multi remaps are usually already on the row; this adds date-specific covers.
   */
  function resolveAutumnInstructorsForCalendarDate(instructorsRaw, calendarIso, meta) {
    meta = meta || {};
    var s = String(instructorsRaw || "").trim();
    if (!s) return s;
    var iso = String(calendarIso || "").trim().slice(0, 10);
    var service = meta.service || "";
    var day = normalizeDowKey(meta.day) || "";
    if (!day && iso) {
      try {
        var dt = new Date(iso + "T12:00:00");
        if (!isNaN(dt.getTime())) {
          day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
            dt.getDay()
          ];
        }
      } catch (_) {}
    }
    if (isMultiActivityService(service)) {
      s = remapAutumnMultiInstructorsStanding(s);
      if (iso === "2026-09-06") {
        /*
         * Sun 6 Hub: John covers Emanuel book; Berta Lead keeps former John book.
         * Order matters — move JOHN→BERTA before EMANUEL→JOHN.
         */
        s = s
          .replace(/\bJOHN\b/gi, "__SEP6_BERTA_BOOK__")
          .replace(/\bEMANUEL\b/gi, "JOHN")
          .replace(/__SEP6_BERTA_BOOK__/g, "BERTA");
      }
    }
    if (isBespokeService(service)) {
      /* Mon 1–13 Sep: Emanuel not on Tinashe yet → Raul with Godsway + John. */
      if (iso && iso >= "2026-09-01" && iso < "2026-09-14" && day === "monday") {
        s = s.replace(/\bEMANUEL\b/gi, "RAUL");
      }
    }
    return s;
  }

  /** @deprecated use resolveAutumnInstructorsForCalendarDate for calendar days */
  function remapAutumnMultiInstructors(instructorsRaw, sessionDateIso) {
    return resolveAutumnInstructorsForCalendarDate(instructorsRaw, sessionDateIso, {
      service: "Multi-Activity",
    });
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

    /* Friday: Acton aquatic (Adam Pi / Amaar) → Youssef (not Roberto). */
    if (day === "friday" && isActonVenue(row.venue) && /\broberto\b/i.test(raw)) {
      if (/\byoussef\b/i.test(raw)) return null;
      return { instructors: "YOUSSEF" };
    }

    if (day === "tuesday") {
      /* Standing Tue Acton: Roberto / Aurora / Javier / Luliya (no Youssef). */
      if (/^logan\b/.test(client) || client === "richard") {
        if (/\broberto\b/i.test(raw)) return null;
        return { instructors: "ROBERTO" };
      }
      if (/^serine\b/.test(client)) {
        if (/\bluliya\b|\blulia\b|\baida\b/i.test(raw)) return null;
        return { instructors: "LULIYA" };
      }
      if (/^rayan\s*ta\b/.test(client)) {
        if (/\bjavier\b/i.test(raw)) return null;
        return { instructors: "JAVIER" };
      }
      if (/\bangel\b/i.test(raw) && /^cayra\b/.test(client)) {
        if (/\bluliya\b|\blulia\b|\baida\b/i.test(raw)) return null;
        return { instructors: "LULIYA" };
      }
      return null;
    }

    /* Thursday Acton: Simon keeps Elijah / Yuri (not Luliya). Elijah off Aurora → Simon. */
    if (day === "thursday") {
      if (/^elijah\b/.test(client)) {
        if (/\bsimon\b/i.test(raw)) return null;
        return { instructors: "SIMON" };
      }
      if (/^yuri\b/.test(client)) {
        if (/\bsimon\b/i.test(raw)) return null;
        return { instructors: "SIMON" };
      }
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

  /**
   * Erik Ndregjoni Multi Sun 12.30–2 (INV-P-0461 paid/partial).
   * Restore name if a summer snap left the seat as No participant / HOLD WAITLIST.
   */
  function restoreErikSundayMultiSeat(row) {
    if (!row || !isMultiActivityService(row.service)) return null;
    if (normalizeDowKey(row.day) !== "sunday") return null;
    if (!/swimfarm/i.test(String(row.venue || ""))) return null;
    var cn = String(row.client_name || "").trim();
    if (!/^(no participant|no client|hold waitlist|closed)$/i.test(cn)) return null;
    var slot = String(row.time_slot || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/:/g, ".");
    var area = String(row.area || "").toLowerCase();
    var inst = String(row.instructors || "");
    var hubHalf =
      (slot === "12.30 to 1.15" || slot.indexOf("12.30 to 1.15") === 0) &&
      (/hub/i.test(area) || /\bberta\b|\bjohn\b/i.test(inst));
    var poolHalf =
      (slot === "1.15 to 2" || slot.indexOf("1.15 to 2") === 0) &&
      (/big\s*pool/i.test(area) || /\baurora\b|\bdan\b|\byoussef\b/i.test(inst));
    if (!hubHalf && !poolHalf) return null;
    return { client_name: "Erik" };
  }

  /**
   * Standing Sunday Multi: Jack S <-> Samer area swap.
   *   Jack S: Big Pool 9.30-10.15, Hub Room 10.15-11
   *   Samer:  Hub Room 9.30-10.15, Big Pool 10.15-11
   * Idempotent on Jul-12 MADRE; corrects older May-pattern snaps.
   */
  function enforceJackSSamerSundayMultiSwap(row) {
    if (!row || !isMultiActivityService(row.service)) return null;
    if (normalizeDowKey(row.day) !== "sunday") return null;
    if (!/swimfarm/i.test(String(row.venue || ""))) return null;
    var cn = String(row.client_name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (cn !== "jack s" && cn !== "samer") return null;
    var slot = String(row.time_slot || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/:/g, ".");
    var is930 = slot === "9.30 to 10.15" || slot.indexOf("9.30 to 10.15") === 0;
    var is1015 = slot === "10.15 to 11" || slot.indexOf("10.15 to 11") === 0;
    if (!is930 && !is1015) return null;
    var area = String(row.area || "").toLowerCase();
    var hub = /hub/.test(area);
    var big = /big\s*pool/.test(area);
    if (!hub && !big) return null;
    /* Wrong seats from pre-swap rota → rename into the standing pair. */
    if (cn === "jack s" && ((hub && is930) || (big && is1015))) {
      return { client_name: "Samer" };
    }
    if (cn === "samer" && ((big && is930) || (hub && is1015))) {
      return { client_name: "Jack S" };
    }
    return null;
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
    /* Tuesday Acton: Youssef is not on the Autumn pool. Opens sit on Roberto. */
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

  /** Friday Acton aquatic → Youssef (was Roberto). */
  var YOUSSEF_FRIDAY_ACTON_FROM_ROBERTO = [
    {
      client_name: "Adam Pi",
      day: "Friday",
      instructors: "YOUSSEF",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "4 to 5.30",
      venue: "Acton",
      session_date: "2026-07-17",
    },
    {
      client_name: "Amaar Ah",
      day: "Friday",
      instructors: "YOUSSEF",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "5.30 to 6",
      venue: "Acton",
      session_date: "2026-07-17",
    },
  ];

  /**
   * Standing Thu Acton AS: Roberto / Simon / Javier / Aurora (no Luliya).
   * Elijah + Yuri with Simon; Aurora CLOSED 4–4.30 (starts 4.30). Eiji aquatic withdrawn.
   * Simon works 4–6.30 — gap 4.30–5 is open (No participant), not Closed.
   * Yunis + Maiyar with Roberto; Joelle 5.30–6.30 with Aurora + Simon.
   */
  var AUTUMN_ACTON_THURSDAY_BOARD = [
    { staff: "ROBERTO", name: "Tom", time: "4 to 4.30" },
    { staff: "ROBERTO", name: "Yassir", time: "4.30 to 5" },
    { staff: "ROBERTO", name: "Yossi", time: "5 to 5.30" },
    { staff: "ROBERTO", name: "Yunis Hussein", time: "5.30 to 6" },
    { staff: "ROBERTO", name: "Maiyar", time: "6 to 6.30" },
    { staff: "SIMON", name: "Elijah", time: "4 to 4.30" },
    { staff: "SIMON", name: "No participant", time: "4.30 to 5" },
    { staff: "SIMON", name: "Yuri", time: "5 to 5.30" },
    { staff: "SIMON", name: "Joelle", time: "5.30 to 6.30" },
    { staff: "JAVIER", name: "Ayman", time: "4 to 5" },
    { staff: "JAVIER", name: "Khalid Ab", time: "5 to 5.30" },
    { staff: "JAVIER", name: "No participant", time: "5.30 to 6" },
    { staff: "JAVIER", name: "No participant", time: "6 to 6.30" },
    { staff: "AURORA", name: "Closed", time: "4 to 4.30" },
    { staff: "AURORA", name: "Aqsa", time: "4.30 to 5.30" },
    { staff: "AURORA", name: "Joelle", time: "5.30 to 6.30" },
  ];

  function autumnActonThursdayStandingRows() {
    var iso = DAY_CENTRE_STANDING_ISO.thursday;
    return AUTUMN_ACTON_THURSDAY_BOARD.map(function (slot) {
      return {
        client_name: slot.name,
        day: "Thursday",
        instructors: slot.staff,
        service: "Aquatic Activity",
        area: "Teaching Pool",
        time_slot: slot.time,
        venue: "Acton",
        session_date: iso,
      };
    });
  }

  /**
   * Autumn Sunday Westway climbing (60' books).
   * Scott de Wolff not renewing — 12–1 open. Alex 2–3 open. Patrick 3–4 Carlos.
   */
  var WEEKEND_STANDING_ISO = {
    saturday: "2026-07-11",
    sunday: "2026-07-12",
  };

  var AUTUMN_SUNDAY_CLIMBING_BOARD = [
    { staff: "ALEX", name: "Eiji", time: "10 to 11" },
    { staff: "ALEX", name: "Yusef", time: "11 to 12" },
    { staff: "ALEX", name: "No participant", time: "12 to 1" },
    { staff: "ALEX", name: "Rodin", time: "1 to 2" },
    { staff: "ALEX", name: "No participant", time: "2 to 3" },
    { staff: "CARLOS", name: "Hazem", time: "10 to 11" },
    { staff: "CARLOS", name: "Zaid", time: "11 to 12" },
    { staff: "CARLOS", name: "Serine", time: "12 to 1" },
    { staff: "CARLOS", name: "Zakariya", time: "1 to 2" },
    { staff: "CARLOS", name: "No participant", time: "2 to 3" },
    { staff: "CARLOS", name: "Patrick", time: "3 to 4" },
  ];

  function isClimbingService(service) {
    return /climb/i.test(String(service || ""));
  }

  function isWestwayVenue(venue) {
    return /westway/i.test(String(venue || ""));
  }

  function autumnSundayClimbingStandingRows() {
    var iso = WEEKEND_STANDING_ISO.sunday;
    return AUTUMN_SUNDAY_CLIMBING_BOARD.map(function (slot) {
      return {
        client_name: slot.name,
        day: "Sunday",
        instructors: slot.staff,
        service: "Climbing Activity",
        area: "Wall",
        time_slot: slot.time,
        venue: "Westway",
        session_date: iso,
      };
    });
  }

  function isSundayWestwayClimbingStandingRow(row) {
    if (!row) return false;
    if (!isClimbingService(row.service) || !isWestwayVenue(row.venue)) return false;
    if (normalizeDowKey(row.day) !== "sunday") return false;
    return true;
  }

  function isThursdayActonAquaticStandingRow(row) {
    if (!row) return false;
    if (!isAquaticService(row.service) || !isActonVenue(row.venue)) return false;
    if (normalizeDowKey(row.day) !== "thursday") return false;
    var d = normIso(row.session_date);
    if (!d) return true;
    if (d >= AUTUMN_DC_REPLACE_FROM && d <= AUTUMN_DC_REPLACE_THROUGH) return true;
    return false;
  }

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

  function fridayActonClientKey(name) {
    var s = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (/^adam\s*pi/.test(s) || /^adam\s*p\b/.test(s)) return "adam_pi";
    if (/^amaar/.test(s)) return "amaar";
    return s.replace(/[^a-z0-9]+/g, "_");
  }

  function hasFridayActonClient(rows, clientKey) {
    var iso = DAY_CENTRE_STANDING_ISO.friday;
    return (rows || []).some(function (r) {
      if (!r) return false;
      if (normIso(r.session_date) !== iso) return false;
      if (!isActonVenue(r.venue) || !isAquaticService(r.service)) return false;
      return fridayActonClientKey(r.client_name) === clientKey;
    });
  }

  /**
   * Autumn template stamp dates (NOT summer truth).
   * Rows are stamped on these ISOs so weekday snap can find Autumn LOCAL boards.
   * Real summer history (other May–Jul dates) must not remain in the resolved roster.
   */
  var AUTUMN_TERM_FROM_ISO = "2026-09-01";
  /** While applying Autumn patches, drop summer DC/Hub rows in this window before re-injecting LOCAL boards. */
  var AUTUMN_DC_REPLACE_FROM = "2026-06-01";
  var AUTUMN_DC_REPLACE_THROUGH = "2026-07-19";
  var AUTUMN_STANDING_TEMPLATE_ISO_SET = {
    "2026-07-11": 1 /* Sat weekend standing */,
    "2026-07-12": 1 /* Sun Multi/Climb standing */,
    "2026-07-13": 1 /* Mon */,
    "2026-07-14": 1 /* Tue */,
    "2026-07-15": 1 /* Wed */,
    "2026-07-16": 1 /* Thu */,
    "2026-07-17": 1 /* Fri */,
  };

  function isAutumnStandingTemplateIso(iso) {
    var d = normIso(iso);
    return !!(d && AUTUMN_STANDING_TEMPLATE_ISO_SET[d]);
  }

  function isAutumnTermOrTemplateIso(iso) {
    var d = normIso(iso);
    if (!d) return false;
    if (d >= AUTUMN_TERM_FROM_ISO) return true;
    return !!AUTUMN_STANDING_TEMPLATE_ISO_SET[d];
  }

  /**
   * Drop summer history weeks. Autumn dashboards must never project May/Jun/early-Jul
   * books — only Autumn template stamps (Jul 11–17 LOCAL boards) + dated Sep+ rows.
   */
  function purgeSummerHistoryOutsideAutumnTemplates(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var d = normIso(r.session_date);
      if (!d) return;
      if (!isAutumnTermOrTemplateIso(d)) return;
      out.push(r);
    });
    return out;
  }

  /**
   * Autumn 26/27 standing patches on snap dates (13–17 Jul):
   * - Replace summer Day Centre who-with-whom with Autumn DC board
   *   (drop all DC rows in the summer dated window for weekdays on the board —
   *   not only 13–17 Jul — so June ACAT/Fadi snaps cannot win Autumn projection)
   * - Replace summer Hub Bespoke with Autumn rota staff + Tinashe / Cyrus
   * - Multi-Activity: Bismark→Godsway; Giuseppe→Emanuel; John keeps Hub book;
   *   Berta Sunday = Leader (no Multi clients); Sun 6 only: Emanuel→Youssef (Emanuel off)
   * - Acton Mon: Angel → Roberto (Adam P / Steven / Mario)
   * - Acton Tue: Roberto / Aurora / Javier / Luliya (Logan+Richard Roberto; Serine Luliya; no Youssef)
   * - Acton Thu: Roberto / Simon / Javier / Aurora (Luliya OFF; Simon keeps Elijah / Yuri)
   * - Northolt Mon/Wed: replace summer (Roberto/Dan) with Services Autumn Dan+Luliya book
   * - Luliya: DC Ikram Mon/Tue/Wed 11–3 + Fri 11-4; pool Mon/Wed Northolt 4.30–6.30,
   *   Tue Acton 4–6.30 (not Thu — Simon covers Thu Acton AS)
   * - Roberto Wed DC: Emanuel 11–12.30 + Fadi 12.30–3 (ends 15:00; no Emanuel 3–4)
   * - Victor Wed DC: Emanuel 12.30–3 (Fadi with Roberto+Raul), Ikram 3–4
   * - Fri DC: Victor+Raul Emanuel 1–4 (after Timi); Michelle+Luliya Ikram to 16:00;
   *   Youssef Fadi ends 15:00 (Acton from 16:00 — no Emanuel 3–4)
   * - Acton Fri: Roberto → Youssef (Adam Pi / Amaar); Hub Fri Tinashe: Roberto (21h PT band)
   * - Victor OFF Mondays (DC)
   * - Acton Mon/Tue/Wed 4–4.30 Youssef: CLOSED → open (No participant)
   * - Acton Thu AS: Simon (Elijah 4–4.30, Yuri 5–5.30); Aurora CLOSED 4–4.30
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
      /* Drop summer Tue Acton aquatic — rebuild from AUTUMN_ACTON_TUESDAY_BOARD. */
      if (isTuesdayActonAquaticStandingRow(r)) return;
      /* Drop summer/live Thu Acton aquatic — rebuild from AUTUMN_ACTON_THURSDAY_BOARD. */
      if (isThursdayActonAquaticStandingRow(r)) return;
      /* Drop summer/live Sun Westway climbing — rebuild from AUTUMN_SUNDAY_CLIMBING_BOARD. */
      if (isSundayWestwayClimbingStandingRow(r)) return;
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
      var erikPatch = restoreErikSundayMultiSeat(r);
      if (erikPatch) {
        out.push(Object.assign({}, r, erikPatch));
        return;
      }
      var jackSamerPatch = enforceJackSSamerSundayMultiSwap(r);
      if (jackSamerPatch) {
        var swapped = Object.assign({}, r, jackSamerPatch);
        /* Never JOHN→BERTA on dated Sun 6 — scrubAndEnsureSep6HubCover owns that day. */
        if (
          isMultiActivityService(swapped.service) &&
          normIso(swapped.session_date) !== "2026-09-06"
        ) {
          var mappedSwap = remapAutumnMultiInstructorsStanding(swapped.instructors);
          if (mappedSwap !== String(swapped.instructors || "").trim()) {
            swapped.instructors = mappedSwap;
          }
        }
        out.push(swapped);
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
      /* Luliya Tue Acton 4–4.30: on shift — never leave stale Closed from summer snaps. */
      if (
        isAquaticService(r.service) &&
        isActonVenue(r.venue) &&
        normalizeDowKey(r.day) === "tuesday" &&
        /\bluliya\b|\blulia\b|\baida\b/i.test(String(r.instructors || ""))
      ) {
        var slotL = String(r.time_slot || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (
          slotL === "4 to 4.30" ||
          slotL === "4.00 to 4.30" ||
          slotL.indexOf("4 to 4.30") === 0
        ) {
          var cnL = String(r.client_name || "").trim();
          if (/^(closed|no client|noclient|no_client|available)?$/i.test(cnL) || !cnL) {
            out.push(Object.assign({}, r, { client_name: "No participant" }));
            return;
          }
        }
      }
      /* Wed Acton: Cyrus with Javier is 4–5 only (not 5–5.30). */
      if (
        isAquaticService(r.service) &&
        isActonVenue(r.venue) &&
        normalizeDowKey(r.day) === "wednesday" &&
        /^cyrus\b/i.test(String(r.client_name || "").trim())
      ) {
        var slotC = String(r.time_slot || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (
          slotC === "5 to 5.30" ||
          slotC === "5.00 to 5.30" ||
          slotC === "17 to 17.30" ||
          slotC === "17.00 to 17.30"
        ) {
          out.push(Object.assign({}, r, { client_name: "No participant" }));
          return;
        }
        if (slotC === "4 to 5.30" || slotC === "4.00 to 5.30") {
          out.push(Object.assign({}, r, { time_slot: "4 to 5" }));
          return;
        }
      }
      var poolPatch = remapAutumnActonPoolInstructors(r);
      if (poolPatch) {
        out.push(Object.assign({}, r, poolPatch));
        return;
      }
      if (isMultiActivityService(r.service) && normIso(r.session_date) !== "2026-09-06") {
        var mapped = remapAutumnMultiInstructorsStanding(r.instructors);
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
    YOUSSEF_FRIDAY_ACTON_FROM_ROBERTO.forEach(function (row) {
      var key = fridayActonClientKey(row.client_name);
      if (hasFridayActonClient(out, key)) return;
      out.push(Object.assign({}, row));
    });
    autumnActonTuesdayStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    autumnActonThursdayStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    autumnSundayClimbingStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    /* Sep 6 Hub cover is applied once in resolveCanonicalRosterRows (after DB rows). */
    return out;
  }

  /**
   * Sun 6 Sep: John = Emanuel Hub book; Berta Lead = former John Hub book; Emanuel off.
   * Drop John / Emanuel / Giuseppe Multi, and also Hub Berta Multi (standing JOHN→BERTA
   * may have already rewritten the Emanuel-cover book to BERTA — that caused Zaid/Jack S
   * to appear under both Berta and John). Re-inject the two authoritative Hub books.
   * Godsway Hub + pool Multi rows are kept.
   */
  function scrubAndEnsureSep6HubCover(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var d = normIso(r.session_date);
      if (
        d === "2026-09-06" &&
        isMultiActivityService(r.service) &&
        /swimfarm/i.test(String(r.venue || "SwimFarm"))
      ) {
        var inst = String(r.instructors || "");
        var area = String(r.area || "");
        if (/\bjohn\b/i.test(inst)) return;
        if (/\bemanuel\b/i.test(inst) || /\bgiuseppe\b/i.test(inst)) return;
        if (/\bberta\b/i.test(inst) && /hub/i.test(area)) return;
      }
      out.push(r);
    });
    autumnSundaySep6HubCoverRows().forEach(function (row) {
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
          area:
            pax.toLowerCase() === "manager" ? "Hub · Manager" : "Day Centre",
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
    merged = applyAutumnActonTuesdayStanding(merged);
    merged = scrubDepartedAutumnInstructorRows(merged);
    merged = applyAutumnWeek1DayCentre(merged);
    merged = scrubAndEnsureSep6HubCover(merged);
    /* After all Autumn patches: no summer history weeks left to snap onto Sep+. */
    merged = purgeSummerHistoryOutsideAutumnTemplates(merged);
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
          ? "Autumn LOCAL standing templates + dated Sep+ (summer history purged)"
          : "Autumn LOCAL standing templates + dated Sep+ (summer history purged)",
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
    remapAutumnMultiInstructorsStanding: remapAutumnMultiInstructorsStanding,
    resolveAutumnInstructorsForCalendarDate: resolveAutumnInstructorsForCalendarDate,
    remapAutumnMultiInstructors: remapAutumnMultiInstructors,
    getCanonicalRosterMeta: getCanonicalRosterMeta,
    buildDayCentreStaffBoard: buildDayCentreStaffBoard,
    autumnDayCentreStandingRows: autumnDayCentreStandingRows,
    DAY_CENTRE_STANDING_ISO: DAY_CENTRE_STANDING_ISO,
    WEEKEND_STANDING_ISO: WEEKEND_STANDING_ISO,
    AUTUMN_DAY_CENTRE_BOARD: AUTUMN_DAY_CENTRE_BOARD,
    WEEK1_DC_BOARD: WEEK1_DC_BOARD,
    isAutumnWeek1DcIso: isAutumnWeek1DcIso,
    isAutumnDcStandingTemplateRow: isAutumnDcStandingTemplateRow,
    AUTUMN_NO_SESSION_STAFF_KEYS: AUTUMN_NO_SESSION_STAFF_KEYS,
    AUTUMN_TERM_FROM_ISO: AUTUMN_TERM_FROM_ISO,
    AUTUMN_STANDING_TEMPLATE_ISO_SET: AUTUMN_STANDING_TEMPLATE_ISO_SET,
    isAutumnStandingTemplateIso: isAutumnStandingTemplateIso,
    isAutumnTermOrTemplateIso: isAutumnTermOrTemplateIso,
    isAutumnNoSessionStaffKey: isAutumnNoSessionStaffKey,
    scrubDepartedAutumnInstructorRows: scrubDepartedAutumnInstructorRows,
    scrubDepartedAngelInstructorRows: scrubDepartedAngelInstructorRows,
    purgeSummerHistoryOutsideAutumnTemplates: purgeSummerHistoryOutsideAutumnTemplates,
    normIso: normIso,
  };
})(typeof window !== "undefined" ? window : globalThis);
