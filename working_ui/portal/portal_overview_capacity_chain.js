/**
 * Sessions Overview capacity chain (prod + LOCAL).
 * Places AS / weekend / climb / multi / physical + Services DC phased seats +
 * Timetable Bespoke who. Day patches stay schedule_overrides + staff_unavailability.
 * Does not call resolveCanonicalRosterRows.
 */
(function (global) {
  "use strict";

  var TERM_FROM = "2026-09-01";
  var TERM_THROUGH = "2026-12-18";
  var TIMETABLE_HOURS_DRAFT_KEY = "term_timetable_local_hours_draft_v1";
  var DOW_KEYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  var DOW_TITLE = {
    sunday: "Sunday",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
  };

  function fetchJson(path) {
    return fetch(path + "?v=" + Date.now(), { cache: "no-store" }).then(
      function (res) {
        if (!res.ok) throw new Error("http_" + res.status);
        return res.json();
      },
    );
  }

  function isFadiOffRotaIso(iso) {
    var C = global.PortalRosterCanonical;
    if (C && typeof C.isFadiOffRotaIso === "function") return !!C.isFadiOffRotaIso(iso);
    var d = String(iso || "").slice(0, 10);
    return !!(d && d >= "2026-09-01" && d < "2026-09-20");
  }

  function isFadiLabel(name) {
    return /^fadi\b/i.test(String(name || "").trim());
  }

  function flattenOverrides(byDate) {
    var out = [];
    Object.keys(byDate || {}).forEach(function (iso) {
      var day = String(iso || "").slice(0, 10);
      var off = isFadiOffRotaIso(day);
      (byDate[iso] || []).forEach(function (ov) {
        if (!ov) return;
        if (off) {
          if (isFadiLabel(ov.anchor_client_id)) return;
          var p = ov.payload || {};
          if (isFadiLabel(p.to_client_name || p.client_name || p.anchor_client_name)) {
            return;
          }
        }
        out.push(ov);
      });
    });
    return out;
  }

  function flattenUnavailability(byDate) {
    var out = [];
    Object.keys(byDate || {}).forEach(function (iso) {
      (byDate[iso] || []).forEach(function (row) {
        if (!row) return;
        out.push({
          off_date: String(iso || "").slice(0, 10),
          staff_name: String(row.label || row.staff_name || "").trim(),
          name_key: String(row.key || row.name_key || "").trim(),
          reason: String(row.reason || "").trim(),
          cover_name: String(row.coverName || row.cover_name || "").trim(),
          status: "active",
        });
      });
    });
    return out;
  }

  function setWarn(msg) {
    var el = document.getElementById("solWarn");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function markRosterReady() {
    try {
      global.__PORTAL_STAFF_ROSTER_LIVE_READY__ = true;
      global.dispatchEvent(new CustomEvent("portal:staff-roster-live-ready"));
    } catch (_e) {}
  }

  function normDow(day) {
    return String(day || "")
      .trim()
      .toLowerCase();
  }

  function autumnIsosForDow(dayName) {
    var want = DOW_KEYS.indexOf(normDow(dayName));
    if (want < 0) return [];
    var out = [];
    var cur = new Date(TERM_FROM + "T12:00:00");
    var end = new Date(TERM_THROUGH + "T12:00:00");
    while (cur <= end) {
      if (cur.getDay() === want) {
        var y = cur.getFullYear();
        var m = String(cur.getMonth() + 1).padStart(2, "0");
        var d = String(cur.getDate()).padStart(2, "0");
        out.push(y + "-" + m + "-" + d);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  /** Places / Services bands only — not Day Centre / Bespoke (Timetable). */
  function isPlacesPhaseServiceId(serviceId) {
    var id = String(serviceId || "").toLowerCase();
    return (
      id === "aquatic" ||
      id === "climbing" ||
      id === "multi" ||
      id === "physical"
    );
  }

  function serviceLabelFromId(serviceId) {
    var id = String(serviceId || "").toLowerCase();
    if (id === "aquatic") return "Aquatic Activity";
    if (id === "climbing") return "Climbing Activity";
    if (id === "multi") return "Multi-Activity";
    if (id === "physical") return "Physical Activity";
    return "";
  }

  function isPlacesPhaseRosterService(service) {
    var s = String(service || "").toLowerCase();
    return (
      s.indexOf("aquatic") >= 0 ||
      s.indexOf("climb") >= 0 ||
      s.indexOf("multi") >= 0 ||
      s.indexOf("physical") >= 0 ||
      s.indexOf("fitness") >= 0
    );
  }

  function parseBandMinutes(label) {
    var raw = String(label || "")
      .replace(/\u2013|\u2014/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    var m = raw.match(
      /(\d{1,2})(?:[.:](\d{2}))?\s*(?:am|pm)?\s*[-–to]+\s*(\d{1,2})(?:[.:](\d{2}))?/i,
    );
    if (!m) return { start: -1, end: -1 };
    function toMin(h, mm) {
      var hh = Number(h);
      var mi = mm != null && mm !== "" ? Number(mm) : 0;
      if (hh <= 7) hh += 12;
      return hh * 60 + mi;
    }
    return { start: toMin(m[1], m[2]), end: toMin(m[3], m[4]) };
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
    if (startMin < 0 || endMin < 0) return "";
    return tok(startMin) + " to " + tok(endMin);
  }

  function defaultArea(serviceId, venue) {
    var v = String(venue || "").toLowerCase();
    var id = String(serviceId || "").toLowerCase();
    if (id === "climbing" || v === "westway") {
      if (id === "physical") return "Gym";
      return "Wall";
    }
    if (id === "aquatic" && (v === "acton" || v === "northolt")) return "Teaching Pool";
    if (id === "aquatic" && v === "swimfarm") return "Teaching Pool";
    if (id === "multi") return "Hub Room";
    if (id === "physical") return "Gym";
    return "";
  }

  function clientFromSeatLine(line) {
    var kind = String((line && line.kind) || "").toLowerCase();
    var raw = line && line.client;
    if (kind === "open" || raw == null || raw === "") return "No participant";
    var text = String(raw).trim();
    if (!text || /^no participant$/i.test(text)) return "No participant";
    if (kind === "trial" || /HOLD BY TRIAL/i.test(text) || /HOLD BY TRIAL/i.test(String(line.label || ""))) {
      var trialName = text.replace(/^HOLD BY TRIAL\s*[-–:]?\s*/i, "").trim();
      if (!trialName && line.label) {
        var m = String(line.label).match(/HOLD BY TRIAL\s*[-–:]?\s*([^(]+)/i);
        if (m) trialName = String(m[1] || "").trim();
      }
      return trialName || text;
    }
    return text;
  }

  function occupantsPhasesToRosterRows(bySlotId) {
    var out = [];
    Object.keys(bySlotId || {}).forEach(function (slotId) {
      var slot = bySlotId[slotId];
      if (!slot || !isPlacesPhaseServiceId(slot.serviceId)) return;
      var service = serviceLabelFromId(slot.serviceId);
      if (!service) return;
      var day = String(slot.day || "").trim();
      var dates = autumnIsosForDow(day);
      if (!dates.length) return;
      var band = parseBandMinutes(slot.timeLabel);
      var timeSlot =
        formatTurnLabel(band.start, band.end) ||
        String(slot.timeLabel || "")
          .replace(/\u2013|\u2014/g, "-")
          .replace(/\s*-\s*/g, " to ")
          .replace(/(\d)\.00\b/g, "$1")
          .trim();
      var area = defaultArea(slot.serviceId, slot.venue);
      var lines =
        slot.seatLines && slot.seatLines.length
          ? slot.seatLines
          : [
              {
                instructor: (slot.instructors || [])[0] || "",
                client: (slot.bookedNames || [])[0] || null,
                kind: (slot.bookedNames || []).length ? "booked" : "open",
              },
            ];
      lines.forEach(function (line) {
        var client = clientFromSeatLine(line);
        var staff = String(line.instructor || "").trim();
        if (!staff) return;
        dates.forEach(function (iso) {
          if (isFadiOffRotaIso(iso) && isFadiLabel(client)) return;
          out.push({
            client_name: client,
            day: DOW_TITLE[normDow(day)] || day,
            instructors: staff.toUpperCase(),
            service: service,
            area: area,
            time_slot: timeSlot,
            venue: String(slot.venue || ""),
            session_date: iso,
          });
        });
      });
    });
    return out;
  }

  function isBespokeService(service) {
    return /bespoke/i.test(String(service || ""));
  }

  function stripPlacesPhaseRows(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (isPlacesPhaseRosterService(r.service)) return;
      /* Bespoke who-works comes from Timetable — drop canonical Hub books. */
      if (isBespokeService(r.service)) return;
      out.push(r);
    });
    return out;
  }

  /** Client window for Bespoke on a weekday (from Places/Services occupants). */
  function bespokeClientMetaForDay(bySlotId, dayName) {
    var want = normDow(dayName);
    var hit = null;
    Object.keys(bySlotId || {}).forEach(function (slotId) {
      var slot = bySlotId[slotId];
      if (!slot || String(slot.serviceId || "").toLowerCase() !== "bespoke") return;
      if (normDow(slot.day) !== want) return;
      hit = slot;
    });
    if (!hit) {
      return {
        client: "Tinashe",
        timeSlot: "4.30 to 6",
        venue: "SwimFarm",
        area: "Hub Room",
      };
    }
    var client = "Tinashe";
    var line = (hit.seatLines || [])[0];
    if (line) {
      var raw = clientFromSeatLine(line);
      client = String(raw || "Tinashe")
        .split(/[·|]/)[0]
        .replace(/\s+\d.*$/, "")
        .trim() || "Tinashe";
    } else if ((hit.bookedNames || [])[0]) {
      client = String(hit.bookedNames[0]).trim();
    }
    var band = parseBandMinutes(hit.timeLabel);
    var timeSlot =
      formatTurnLabel(band.start, band.end) ||
      "4.30 to 6";
    /* Prefer client window inside staff hours when label embeds 4.30–6. */
    if (line && /4\.30|4:30/i.test(String(line.client || line.label || ""))) {
      timeSlot = "4.30 to 6";
    }
    return {
      client: client,
      timeSlot: timeSlot,
      venue: String(hit.venue || "SwimFarm"),
      area: "Hub Room",
    };
  }

  /**
   * Bespoke standing for Overview = Timetable who works that date (point 3).
   * Client name/window from Places/Services occupants for the weekday.
   */
  function timetableBespokeToRosterRows(bySlotId) {
    var P = global.PORTAL_AUTUMN_STAFF_HOURS;
    var root = P && (P.staffHours || P);
    if (!root) return [];
    var out = [];
    Object.keys(root).forEach(function (dayName) {
      var sheet = root[dayName];
      if (!sheet) return;
      var meta = bespokeClientMetaForDay(bySlotId, dayName);
      var venues = [];
      (sheet.venueGroups || []).forEach(function (g) {
        var span = Number(g.span) || 1;
        for (var i = 0; i < span; i++) venues.push(String(g.venue || ""));
      });
      (sheet.dates || []).forEach(function (dr) {
        var iso = String((dr && dr.date) || "").slice(0, 10);
        if (!iso || iso < TERM_FROM || iso > TERM_THROUGH) return;
        (dr.cells || []).forEach(function (cell, ci) {
          var band = String((cell && cell.band) || "").toLowerCase();
          if (band !== "bespoke") return;
          var text = timetableCellText(cell);
          var name = parseHoursName(text);
          if (!name || /^closed$/i.test(name)) return;
          var range = parseHoursRange(text);
          /* Card = kid session 4.30-6. Staff 4.15-6.15 stays on Timetable / green hours. */
          var kidTime = "4.30 to 6";
          if (/^tinashe\b/i.test(String(meta.client || ""))) {
            kidTime = "4.30 to 6";
          } else if (meta.timeSlot) {
            kidTime = meta.timeSlot;
          } else if (range.start >= 0) {
            kidTime = formatTurn(range.start, range.end);
          }
          out.push({
            client_name: meta.client,
            day: DOW_TITLE[normDow(dayName)] || dayName,
            instructors: name.toUpperCase(),
            service: "Bespoke Programme",
            area: meta.area,
            time_slot: kidTime,
            venue: meta.venue || venues[ci] || "SwimFarm",
            session_date: iso,
          });
        });
      });
    });
    return out;
  }

  function slugName(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function toMinutesClock(tok) {
    var m = String(tok || "").match(/^(\d{1,2})(?:[.:](\d{2}))?$/);
    if (!m) return -1;
    var hh = Number(m[1]);
    var mi = m[2] != null ? Number(m[2]) : 0;
    if (hh <= 7) hh += 12;
    return hh * 60 + mi;
  }

  function parseHoursRange(text) {
    var raw = String(text || "").trim();
    var m = raw.match(/(\d{1,2}(?:\.\d{1,2})?)\s*-\s*(\d{1,2}(?:\.\d{1,2})?)/);
    if (!m) return { start: -1, end: -1 };
    var start = toMinutesClock(m[1]);
    var end = toMinutesClock(m[2]);
    if (start >= 0 && end >= 0 && end <= start) end += 12 * 60;
    return { start: start, end: end };
  }

  function parseSlotRange(label) {
    var raw = String(label || "")
      .replace(/\u2013|\u2014/g, "-")
      .replace(/\s+to\s+/i, "-")
      .replace(/\s+/g, " ")
      .trim();
    var m = raw.match(/(\d{1,2}(?:[.:]\d{2})?)\s*-\s*(\d{1,2}(?:[.:]\d{2})?)/);
    if (!m) return { start: -1, end: -1 };
    var start = toMinutesClock(m[1]);
    var end = toMinutesClock(m[2]);
    if (start >= 0 && end >= 0 && end <= start) end += 12 * 60;
    return { start: start, end: end };
  }

  function formatTurn(startMin, endMin) {
    function tok(mins) {
      if (mins < 0) return "";
      var h = Math.floor(mins / 60);
      var m = mins % 60;
      var h12 = h % 12;
      if (!h12) h12 = 12;
      return m ? h12 + "." + String(m).padStart(2, "0") : String(h12);
    }
    if (startMin < 0 || endMin < 0) return "";
    return tok(startMin) + " to " + tok(endMin);
  }

  function timetableCellText(cell) {
    var drafts = {};
    try {
      drafts = JSON.parse(localStorage.getItem(TIMETABLE_HOURS_DRAFT_KEY) || "{}") || {};
    } catch (_e) {}
    var k = cell && cell.editKey;
    if (k && drafts[k] != null) return String(drafts[k]);
    return String((cell && cell.text) || "");
  }

  function parseHoursName(text) {
    var raw = String(text || "").trim();
    if (!raw || /^closed$/i.test(raw)) return "";
    var m = raw.match(/^(.+?)\s+(\d{1,2}(?:\.\d{1,2})?\s*-\s*\d{1,2}(?:\.\d{1,2})?)/i);
    if (m) return String(m[1] || "").trim();
    return raw.replace(/\boffice\b/i, "").trim();
  }

  /** Timetable DC window for instructor on iso (point 3 → Overview). */
  function timetableDcWindowForStaff(iso, staffRaw) {
    var P = global.PORTAL_AUTUMN_STAFF_HOURS;
    var root = P && (P.staffHours || P);
    if (!root) return null;
    var day = DOW_TITLE[
      DOW_KEYS[new Date(String(iso).slice(0, 10) + "T12:00:00").getDay()]
    ];
    var sheet = root[day];
    if (!sheet) return null;
    var dateRow = null;
    (sheet.dates || []).forEach(function (dr) {
      if (String((dr && dr.date) || "").slice(0, 10) === String(iso).slice(0, 10)) {
        dateRow = dr;
      }
    });
    if (!dateRow) return null;
    var venues = [];
    (sheet.venueGroups || []).forEach(function (g) {
      var span = Number(g.span) || 1;
      for (var i = 0; i < span; i++) venues.push(String(g.venue || ""));
    });
    var want = slugName(staffRaw);
    var best = null;
    (dateRow.cells || []).forEach(function (cell, ci) {
      var text = timetableCellText(cell);
      var name = parseHoursName(text);
      if (!name) return;
      var nk = slugName(name);
      if (nk !== want && nk.indexOf(want) !== 0 && want.indexOf(nk) !== 0) return;
      var band = String((cell && cell.band) || "").toLowerCase();
      if (band === "pool" || band === "aquatic" || band === "bespoke") return;
      var range = parseHoursRange(text);
      if (range.start < 0) return;
      var isDc = band === "day_centre" || band === "dc" || band === "office" || !band;
      var isSf = /swimfarm/i.test(venues[ci] || "");
      if (!isDc && !isSf) return;
      var cand = { start: range.start, end: range.end, band: band };
      if (!best) {
        best = cand;
        return;
      }
      var bestBand = String(best.band || "").toLowerCase();
      if (
        (band === "day_centre" || band === "dc") &&
        bestBand !== "day_centre" &&
        bestBand !== "dc"
      ) {
        best = cand;
      }
    });
    return best;
  }

  function isDayCentreService(service) {
    return /day\s*centre/i.test(String(service || ""));
  }

  function areaForDcClient(name) {
    var n = String(name || "").trim().toLowerCase();
    if (n === "manager") return "Hub · Manager";
    if (n === "office") return "Hub · Office";
    if (n === "acat") return "Hub · ACAT";
    if (n === "interview" || n === "interviews") return "Hub Room";
    return "Hub Room";
  }

  function isInterviewClient(name) {
    return /^(interview|interviews)$/i.test(String(name || "").trim());
  }

  function dowKeyFromIso(iso) {
    var d = new Date(String(iso).slice(0, 10) + "T12:00:00").getDay();
    return DOW_KEYS[d] || "";
  }

  function enumerateTermWeekdays() {
    var out = [];
    var cur = new Date(TERM_FROM + "T12:00:00");
    var end = new Date(TERM_THROUGH + "T12:00:00");
    while (cur <= end) {
      var dow = cur.getDay();
      if (dow >= 1 && dow <= 5) {
        var y = cur.getFullYear();
        var m = String(cur.getMonth() + 1).padStart(2, "0");
        var d = String(cur.getDate()).padStart(2, "0");
        out.push(y + "-" + m + "-" + d);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  /**
   * DC who-with-whom from Services phased/dated seats (capacity chain point 2).
   * Timetable still clips hours. Canonical boards = fallback only.
   */
  function canonicalDcFallback(iso) {
    var C = global.PortalRosterCanonical;
    if (!C) return { phase: "missing", columns: [] };
    var d = String(iso || "").slice(0, 10);
    var dk = dowKeyFromIso(d);
    if (!dk || dk === "saturday" || dk === "sunday") {
      return { phase: "weekend", columns: [] };
    }
    if (d === "2026-09-14" && C.MONDAY_SEP14_DC_BOARD) {
      return { phase: "mon14_adam_absent", columns: C.MONDAY_SEP14_DC_BOARD };
    }
    if (d >= "2026-09-01" && d <= "2026-09-04") {
      return {
        phase: "week1",
        columns: (C.WEEK1_DC_BOARD && C.WEEK1_DC_BOARD[dk]) || [],
      };
    }
    if (d >= "2026-09-07" && d < "2026-09-20") {
      return {
        phase: "fadi_absent_board",
        columns: (C.FADI_ABSENT_DC_BOARD && C.FADI_ABSENT_DC_BOARD[dk]) || [],
      };
    }
    if (d >= "2026-09-20") {
      return {
        phase: "standing",
        columns: (C.AUTUMN_DAY_CENTRE_BOARD && C.AUTUMN_DAY_CENTRE_BOARD[dk]) || [],
      };
    }
    return { phase: "none", columns: [] };
  }

  function occupantsDcToRosterRows(bySlotId) {
    var Dc = global.PortalDcServicesLocal;
    if (!Dc || typeof Dc.rosterRowsForIso !== "function") {
      return [];
    }
    var C = global.PortalRosterCanonical;
    var out = [];
    enumerateTermWeekdays().forEach(function (iso) {
      var fadiOff =
        C && typeof C.isFadiOffRotaIso === "function"
          ? C.isFadiOffRotaIso(iso)
          : iso < "2026-09-20";
      Dc.rosterRowsForIso(bySlotId || {}, iso, {
        fadiOffRota: fadiOff,
        canonicalFallback: canonicalDcFallback,
      }).forEach(function (row) {
        out.push(row);
      });
    });
    return out;
  }

  /** Clip DC roster rows to Timetable hours so Overview matches point 3. */
  function clipDcRowsToTimetable(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r || !isDayCentreService(r.service)) {
        out.push(r);
        return;
      }
      var iso = String(r.session_date || "").slice(0, 10);
      var win = timetableDcWindowForStaff(iso, r.instructors);
      if (!win) {
        out.push(r);
        return;
      }
      var band = parseSlotRange(r.time_slot);
      var start =
        band.start < 0 ? win.start : Math.max(band.start, win.start);
      var end = band.end < 0 ? win.end : Math.min(band.end, win.end);
      if (end <= start) {
        start = win.start;
        end = win.end;
      }
      out.push(
        Object.assign({}, r, {
          time_slot: formatTurn(start, end) || r.time_slot,
        }),
      );
    });
    return out;
  }

  /**
   * LOCAL Overview = Places (AS) + Services (DC phased seats) + Timetable (Bespoke who)
   * + Covers snaps. Does NOT paint from resolveCanonicalRosterRows.
   */
  function resolveCapacityChainRosterSource(occupantsBySlotId) {
    var C = global.PortalRosterCanonical;
    var phases = occupantsPhasesToRosterRows(occupantsBySlotId || {});
    var bespoke = timetableBespokeToRosterRows(occupantsBySlotId || {});
    var dc = clipDcRowsToTimetable(occupantsDcToRosterRows(occupantsBySlotId || {}));
    var rows = phases.concat(bespoke).concat(dc);
    return {
      rows: rows,
      clientRosterStartDates: C && C.FADI_START_ISO ? { Fadi: C.FADI_START_ISO } : {},
      capacityChainPlacesPhases: true,
      localPlacesPhases: true,
      capacityChainTimetableBespoke: true,
      localTimetableBespoke: true,
      capacityChainDcServicesSeats: true,
      localDcServicesSeats: true,
      capacityChainNoCanonicalRemap: true,
      localNoCanonicalResolve: true,
      rosterSourceNote:
        "Capacity chain (Places + Services DC phases + Timetable + Covers)",
    };
  }


  function occupantsBySlotId(opt) {
    if (opt && opt.bySlotId) return opt.bySlotId;
    var P = global.PORTAL_CAPACITY_CHAIN_OCCUPANTS;
    return (P && P.bySlotId) || null;
  }

  function resolve(opt) {
    var by = occupantsBySlotId(opt);
    if (!by || !Object.keys(by).length) return null;
    if (!global.PORTAL_AUTUMN_STAFF_HOURS) return null;
    if (!global.PortalDcServicesLocal) return null;
    return resolveCapacityChainRosterSource(by);
  }

  global.PortalOverviewCapacityChain = {
    resolve: resolve,
    resolveCapacityChainRosterSource: resolveCapacityChainRosterSource,
    occupantsBySlotId: occupantsBySlotId,
  };
})(typeof window !== "undefined" ? window : globalThis);
