/**
 * Support-worker shift windows — 15 min before first / after last client slot
 * for weekday Multi-Activity and Bespoke Programme (timesheet + NEW SHIFT alerts).
 */
(function (global) {
  "use strict";

  var BUFFER_MIN = 15;
  /** Paid shift band length (2h) — consecutive slots totalling 2h need no extra ±15 padding. */
  var PAYROLL_BAND_MINUTES = 120;

  function hmToMinutes(hm) {
    var p = String(hm || "").split(":");
    var h = Number(p[0] || 0);
    var m = Number(p[1] || 0);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
    return h * 60 + m;
  }

  function hmFromDbTime(t) {
    var m = String(t || "").match(/(\d{1,2}):(\d{2})/);
    if (!m) return "";
    return String(parseInt(m[1], 10)).padStart(2, "0") + ":" + String(parseInt(m[2], 10)).padStart(2, "0");
  }

  function minutesToHm(total) {
    var m = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }

  function formatBandLabel(startHm, endHm) {
    if (typeof global.portalFormatRosterBandLabel === "function") {
      return global.portalFormatRosterBandLabel(startHm, endHm);
    }
    function tok(hm) {
      var bits = String(hm || "").split(":");
      var h = Number(bits[0]);
      var m = Number(bits[1] || 0);
      if (Number.isNaN(h)) return "";
      if (h > 12) h -= 12;
      if (h === 0) h = 12;
      if (m === 0) return String(h);
      if (m === 30) return h + ".30";
      if (m === 15) return h + ".15";
      if (m === 45) return h + ".45";
      return h + "." + String(m).padStart(2, "0");
    }
    var a = tok(startHm);
    var b = tok(endHm);
    if (!a || !b) return "";
    return a + " to " + b;
  }

  function normKey(v) {
    if (typeof global.portalNormKeyStr === "function") return global.portalNormKeyStr(v);
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function normIso(v) {
    if (typeof global.normaliseIsoDate === "function") return global.normaliseIsoDate(v);
    return String(v || "").trim().slice(0, 10);
  }

  function parsePayload(row) {
    if (!row) return null;
    if (row.payload && typeof row.payload === "object") return row.payload;
    try {
      return JSON.parse(String(row.payload || ""));
    } catch (_) {
      return null;
    }
  }

  function serviceLabelFromRow(row) {
    var pl = parsePayload(row);
    var fromPl = String(
      (pl && (pl.service_booked || pl.service || pl.programme || pl.activity)) || ""
    ).trim();
    if (fromPl) return fromPl;
    return String((row && (row.activity || row.rosterService)) || "").trim();
  }

  function portalStaffIsSupportWorker(staffId) {
    var k = normKey(staffId);
    if (!k) return false;
    try {
      var src = global.STAFF_DASHBOARD_SOURCE;
      var prof = src && src.staffProfiles && (src.staffProfiles[k] || src.staffProfiles[staffId]);
      if (!prof) return false;
      var track = String(prof.staffRoleTrack || "").toLowerCase().replace(/[\s_-]+/g, "");
      if (track === "support" || track === "supportlead") return true;
      var tracks = prof.staffRoleTracks;
      if (Array.isArray(tracks)) {
        for (var i = 0; i < tracks.length; i++) {
          var t = String(tracks[i] || "").toLowerCase().replace(/[\s_-]+/g, "");
          if (t === "support" || t === "supportlead") return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function dayNameFromIso(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return "";
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(d.getTime())) return "";
    try {
      return d.toLocaleDateString("en-GB", { weekday: "long" });
    } catch (_) {
      return "";
    }
  }

  /** Weekday Multi-Activity + Bespoke Programme: paid band 4:15–6:15 (client slots may be shorter). */
  function portalStaffSupportShiftBufferApplies(service, dayName) {
    var s = String(service || "").toLowerCase();
    var d = String(dayName || "").trim();
    if (/\bbespoke\b/.test(s) || /\bfitfun\b/.test(s)) return d && d !== "Sunday";
    if (/multi[-\s]?activity/.test(s)) return !!d && d !== "Sunday";
    return false;
  }

  function isMaOrBespokeServiceLabel(service) {
    var s = String(service || "").toLowerCase();
    return /\bbespoke\b/.test(s) || /multi[-\s]?activity/.test(s);
  }

  function rowsAreWeekdayMaBespokeBand(rows, iso) {
    var dayName = dayNameFromIso(iso);
    if (!dayName || dayName === "Sunday") return false;
    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) return false;
    for (var i = 0; i < list.length; i++) {
      if (!isMaOrBespokeServiceLabel(serviceLabelFromRow(list[i]))) return false;
    }
    return true;
  }

  function rowAnchorHmRange(row) {
    var t0 =
      typeof global.portalHmFromDbTime === "function"
        ? global.portalHmFromDbTime(row && row.anchor_start)
        : hmFromDbTime(row && row.anchor_start);
    var t1 =
      typeof global.portalHmFromDbTime === "function"
        ? global.portalHmFromDbTime(row && row.anchor_end)
        : hmFromDbTime(row && row.anchor_end);
    var a = hmToMinutes(t0);
    var b = hmToMinutes(t1 || t0);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (b < a) b += 24 * 60;
    return { start: a, end: b };
  }

  function resolveShiftBandBuffer(opts, spanMin, dayName) {
    if (opts.applyBuffer === false) return false;
    if (opts.applyBuffer === true) return true;
    /* 2h pay band: ±15 only when client-facing time is under 2h (e.g. one 1.5h session). */
    return spanMin < PAYROLL_BAND_MINUTES && dayName && dayName !== "Sunday";
  }

  function shiftSlotLabelFromRows(rows, iso, opts) {
    opts = opts && typeof opts === "object" ? opts : {};
    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) return "";
    var isoNorm = normIso(iso);
    if (rowsAreWeekdayMaBespokeBand(list, isoNorm)) {
      return formatBandLabel("16:15", "18:15");
    }
    var dayName = dayNameFromIso(isoNorm);
    var minStart = Infinity;
    var maxEnd = -Infinity;
    list.forEach(function (row) {
      var range = rowAnchorHmRange(row);
      if (!range) return;
      if (range.start < minStart) minStart = range.start;
      if (range.end > maxEnd) maxEnd = range.end;
    });
    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) return "";
    var spanMin = maxEnd - minStart;
    if (resolveShiftBandBuffer(opts, spanMin, dayName)) {
      minStart -= BUFFER_MIN;
      maxEnd += BUFFER_MIN;
    }
    return formatBandLabel(minutesToHm(minStart), minutesToHm(maxEnd));
  }

  function isBookedClientSession(session) {
    var cid = String((session && session.clientId) || "").trim().toLowerCase();
    if (!cid || cid === "available" || cid === "closed") return false;
    var nm = String((session && (session.clientDisplay || session.clientName || session.name)) || "")
      .trim()
      .toLowerCase();
    return !!nm && nm !== "closed" && nm !== "no client" && nm !== "noclient";
  }

  function sessionAppliesOnIso(session, iso) {
    var date = normIso(iso);
    if (!date || !session) return false;
    var dayName = dayNameFromIso(date) || String(session.day || "").trim();
    if (typeof global.portalSessionSpreadsheetRowMatchesCalendarDate === "function") {
      return global.portalSessionSpreadsheetRowMatchesCalendarDate(session, date, dayName);
    }
    return normIso(session.session_date || session.sessionDate) === date;
  }

  function sessionsModelForStaffDay(staffId, iso, venueKey) {
    var staff = normKey(staffId);
    var date = normIso(iso);
    if (!staff || !date) return [];
    var model = Array.isArray(global.sessionsModel) ? global.sessionsModel : [];
    if (!model.length && Array.isArray(global.__PORTAL_STAFF_SESSIONS_GUARD_MODEL__)) {
      model = global.__PORTAL_STAFF_SESSIONS_GUARD_MODEL__;
    }
    var dayName = dayNameFromIso(date);
    var wantVenue = normKey(venueKey);
    var out = [];
    model.forEach(function (s) {
      if (!s || normKey(s.staffId) !== staff) return;
      if (!sessionAppliesOnIso(s, date)) return;
      if (
        typeof global.portalStaffDashboardOmitSpreadsheetSession === "function" &&
        global.portalStaffDashboardOmitSpreadsheetSession(s, dayName || String(s.day || "").trim())
      ) {
        return;
      }
      if (!isBookedClientSession(s)) return;
      var vk = normKey(s.venue) || "_";
      if (wantVenue && vk !== wantVenue) return;
      out.push(s);
    });
    return out;
  }

  function sessionToBandRow(session) {
    return {
      anchor_start: String(session.start || "").trim(),
      anchor_end: String(session.end || session.start || "").trim(),
      activity: String(session.rosterService || session.activity || "").trim(),
      rosterService: String(session.rosterService || session.activity || "").trim(),
      anchor_staff_id: session.staffId,
      anchor_venue: session.venue,
      anchor_client_id: session.clientId,
      override_type: "roster_session",
    };
  }

  function spreadsheetBandRowsForStaffDay(staffId, iso, venueKey) {
    var staff = normKey(staffId);
    var date = normIso(iso);
    if (!staff || !date) return [];
    var src = global.STAFF_DASHBOARD_SOURCE;
    var rows = src && Array.isArray(src.rows) ? src.rows : [];
    var dayName = dayNameFromIso(date);
    var wantVenue = normKey(venueKey);
    var adapter = global.StaffDashboardSpreadsheetAdapter;
    var parseSlot =
      (adapter && typeof adapter.parseTimeSlot === "function" && adapter.parseTimeSlot.bind(adapter)) ||
      (typeof global.parseTimeSlot === "function" && global.parseTimeSlot) ||
      null;
    var out = [];
    rows.forEach(function (row) {
      if (!row) return;
      if (typeof global.portalStaffMatchesStatusInstructor === "function") {
        if (!global.portalStaffMatchesStatusInstructor(staff, row.instructors)) return;
      } else if (typeof global.portalNormKeyStr === "function") {
        var hit = false;
        String(row.instructors || "")
          .split(/[,/&]|\band\b/gi)
          .forEach(function (part) {
            if (global.portalNormKeyStr(part) === staff) hit = true;
          });
        if (!hit) return;
      }
      var rowIso = normIso(row.session_date || row.sessionDate);
      if (rowIso) {
        if (rowIso !== date) return;
      } else if (String(row.day || "").trim() !== dayName) {
        return;
      }
      var vk = normKey(row.venue) || "_";
      if (wantVenue && vk !== wantVenue) return;
      var clientName = String(row.client_name || "").trim().toLowerCase();
      if (!clientName || clientName === "closed" || clientName === "no client") return;
      if (!parseSlot) return;
      var bounds = parseSlot(String(row.time_slot || ""), row.day || dayName);
      if (!bounds || !bounds.start) return;
      out.push({
        anchor_start: bounds.start,
        anchor_end: bounds.end || bounds.start,
        activity: String(row.service || "").trim(),
        rosterService: String(row.service || "").trim(),
        anchor_staff_id: staffId,
        anchor_venue: row.venue,
        override_type: "roster_session",
      });
    });
    return out;
  }

  /** All client slots on a staff day (roster + slot_update) — used for NEW SHIFT pay band. */
  function portalStaffCollectStaffDayShiftBandRows(staffId, iso, venueKey) {
    var staff = normKey(staffId);
    var date = normIso(iso);
    var wantVenue = normKey(venueKey);
    if (!staff || !date) return [];
    var seen = Object.create(null);
    var out = [];

    function addRow(row) {
      var range = rowAnchorHmRange(row);
      if (!range) return;
      var key = range.start + "|" + range.end + "|" + normKey(row.anchor_client_id);
      if (seen[key]) return;
      seen[key] = true;
      out.push(row);
    }

    var modelSessions = sessionsModelForStaffDay(staffId, date, wantVenue);
    spreadsheetBandRowsForStaffDay(staffId, date, wantVenue).forEach(addRow);
    modelSessions.forEach(function (s) {
      addRow(sessionToBandRow(s));
    });

    overrideRowsAll().forEach(function (row) {
      if (String(row && row.status || "active") !== "active") return;
      if (String(row && row.override_type || "").trim() !== "slot_update") return;
      if (normIso(row.session_date) !== date) return;
      if (normKey(row.anchor_staff_id) !== staff) return;
      var vk = normKey(row.anchor_venue) || "_";
      if (wantVenue && vk !== wantVenue) return;
      addRow(row);
    });

    return out;
  }

  function overrideRowsAll() {
    return typeof global.portalScheduleOverrideRowsAll === "function"
      ? global.portalScheduleOverrideRowsAll()
      : Array.isArray(global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__)
        ? global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__
        : [];
  }

  function portalStaffOverrideShiftSlotLabel(row) {
    var iso = normIso(row && row.session_date);
    var staff = normKey(row && row.anchor_staff_id);
    var venue = normKey(row && row.anchor_venue);
    if (!iso || !staff) return "";
    var bandRows = portalStaffCollectStaffDayShiftBandRows(staff, iso, venue);
    if (bandRows.length) return shiftSlotLabelFromRows(bandRows, iso);
    var pl = parsePayload(row);
    if (pl && pl._portal_shift_slot_label) return String(pl._portal_shift_slot_label).trim();
    return shiftSlotLabelFromRows([row], iso);
  }

  /** Merged band for session_add (shadowing / training) — shadowing has no ±15 min buffer. */
  function portalStaffSessionAddBandLabel(row, opts) {
    opts = opts && typeof opts === "object" ? opts : {};
    var pl = parsePayload(row);
    var kind = String(opts.kind || (pl && pl.kind) || "").trim().toLowerCase();
    var iso = normIso(row && row.session_date);
    var staff = normKey(row && row.anchor_staff_id);
    var venue = normKey(row && row.anchor_venue);
    if (!iso || !staff || !kind) return "";
    var peers = overrideRowsAll().filter(function (r) {
      if (String(r && r.override_type || "").trim() !== "session_add") return false;
      if (normIso(r.session_date) !== iso) return false;
      if (normKey(r.anchor_staff_id) !== staff) return false;
      if (venue && normKey(r.anchor_venue) !== venue) return false;
      var rpl = parsePayload(r);
      return String(rpl && rpl.kind || "").trim().toLowerCase() === kind;
    });
    var useBuffer = kind !== "shadowing" && opts.buffer !== false;
    return shiftSlotLabelFromRows(peers.length ? peers : [row], iso, { applyBuffer: useBuffer });
  }

  function portalStaffDayShiftLabelsByVenue(staffId, iso) {
    var staff = normKey(staffId);
    var date = normIso(iso);
    var byVenue = Object.create(null);
    if (!staff || !date) return byVenue;
    var grouped = Object.create(null);
    portalStaffCollectStaffDayShiftBandRows(staffId, date, "").forEach(function (row) {
      var venue = normKey(row.anchor_venue) || "_";
      if (!grouped[venue]) grouped[venue] = [];
      grouped[venue].push(row);
    });
    Object.keys(grouped).forEach(function (venue) {
      var label = shiftSlotLabelFromRows(grouped[venue], date);
      if (label) byVenue[venue] = label;
    });
    return byVenue;
  }

  function portalApplyStaffDayShiftWindowToTodayItems(items, staffId, iso) {
    var list = Array.isArray(items) ? items : [];
    var labels = portalStaffDayShiftLabelsByVenue(staffId, iso);
    if (!labels || !Object.keys(labels).length) return list;
    list.forEach(function (item) {
      if (!item || item.kind !== "client") return;
      var ov = item.__portalScheduleOverride;
      var updated =
        !!item.portalRosterTimeUpdated ||
        (ov && String(ov.override_type || "").trim() === "slot_update");
      if (!updated) return;
      var ovPl = parsePayload(ov);
      if (ovPl && ovPl._portal_shift_slot_label) {
        item.time = String(ovPl._portal_shift_slot_label).trim();
        return;
      }
      var venue = normKey(item.sessionVenue);
      var lab = labels[venue] || labels["_"];
      if (lab) item.time = lab;
    });
    return list;
  }

  function portalStaffSessionShiftSlotLabel(session, iso) {
    if (!session) return "";
    var dayName = dayNameFromIso(iso) || String(session.day || "").trim();
    var svc = String(session.rosterService || session.service || session.activity || "").trim();
    var start = String(session.start || "").trim();
    var end = String(session.end || session.start || "").trim();
    var a = hmToMinutes(start);
    var b = hmToMinutes(end);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
    if (portalStaffSupportShiftBufferApplies(svc, dayName) && b - a < PAYROLL_BAND_MINUTES) {
      if (dayName && dayName !== "Sunday") {
        return formatBandLabel("16:15", "18:15");
      }
      a -= BUFFER_MIN;
      b += BUFFER_MIN;
    }
    return formatBandLabel(minutesToHm(a), minutesToHm(b));
  }

  function portalStaffPayrollShiftBandLabel(staffId, iso, venue) {
    var rows = portalStaffCollectStaffDayShiftBandRows(staffId, iso, normKey(venue));
    if (!rows.length) return "";
    return shiftSlotLabelFromRows(rows, normIso(iso));
  }

  global.portalStaffSupportShiftBufferApplies = portalStaffSupportShiftBufferApplies;
  global.portalStaffIsSupportWorker = portalStaffIsSupportWorker;
  global.portalStaffShiftSlotLabelFromRows = shiftSlotLabelFromRows;
  global.portalStaffCollectStaffDayShiftBandRows = portalStaffCollectStaffDayShiftBandRows;
  global.portalStaffPayrollShiftBandLabel = portalStaffPayrollShiftBandLabel;
  global.portalStaffOverrideShiftSlotLabel = portalStaffOverrideShiftSlotLabel;
  global.portalStaffSessionAddBandLabel = portalStaffSessionAddBandLabel;
  global.portalStaffDayShiftLabelsByVenue = portalStaffDayShiftLabelsByVenue;
  global.portalApplyStaffDayShiftWindowToTodayItems = portalApplyStaffDayShiftWindowToTodayItems;
  global.portalStaffSessionShiftSlotLabel = portalStaffSessionShiftSlotLabel;
  global.PORTAL_STAFF_SHIFT_BUFFER_MIN = BUFFER_MIN;
  global.PORTAL_STAFF_PAYROLL_BAND_MINUTES = PAYROLL_BAND_MINUTES;
  global.portalStaffShouldApplyPayrollBandBuffer = resolveShiftBandBuffer;
})(typeof window !== "undefined" ? window : globalThis);
