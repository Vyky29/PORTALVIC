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
    var SOURCE_VERSION = 5;

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
      { staff: "Roberto", clients: [{ name: "Ikram", time: "11 to 3" }] },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Victor", clients: [{ name: "Fadi", time: "12.30 to 3" }] },
      {
        staff: "Raul",
        clients: [
          { name: "Fadi", time: "12.30 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
    ],
    wednesday: [
      { staff: "Roberto", clients: [{ name: "Emanuel", time: "11 to 3" }] },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Victor", clients: [{ name: "Ikram", time: "11 to 4" }] },
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
      { staff: "Victor", clients: [{ name: "Ikram", time: "11 to 4" }] },
      {
        staff: "Raul",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "1 to 3" },
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
   * (Godsway / John / Emanuel Mon+Wed 4.15–6.15; Fri Emanuel only; Tinashe booked).
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

  /**
   * Autumn 26/27 standing patches on snap dates (13–17 Jul):
   * - Replace summer Day Centre who-with-whom with Autumn DC board
   * - Replace summer Hub Bespoke with Autumn rota staff + Tinashe / Cyrus
   */
  function applyAutumnStandingParticipantRows(rows) {
    var out = (Array.isArray(rows) ? rows : []).filter(function (r) {
      if (!r) return false;
      var d = normIso(r.session_date);
      if (DAY_CENTRE_STANDING_ISO_SET[d] && isDayCentreService(r.service)) {
        return false;
      }
      /* Drop all standing-week Bespoke — rebuild from Autumn Hub rota below. */
      if (isBespokeService(r.service) && DAY_CENTRE_STANDING_ISO_SET[d]) {
        return false;
      }
      if (isBespokeService(r.service) && /^cyrus\b/i.test(String(r.client_name || "").trim())) {
        return false;
      }
      return true;
    });
    autumnDayCentreStandingRows().forEach(function (row) {
      out.push(row);
    });
    AUTUMN_BESPOKE_HUB_ROWS.forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    out.push(Object.assign({}, CYRUS_BESPOKE_ROW));
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
    var merged = opts.skipDb ? base.slice() : applyPortalRosterDbRows(base);
    merged = applyAutumnStandingParticipantRows(merged);
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
          ? "Live MADRE (portal_madre_document) + portal_roster_rows + Autumn DC/Hub standing"
          : "Bundle (MADRE snapshot) + portal_roster_rows + Autumn DC/Hub standing",
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
