/**
 * Support-worker shift windows — 15 min before first / after last client slot
 * for weekday Multi-Activity and Bespoke Programme (timesheet + NEW SHIFT alerts).
 */
(function (global) {
  "use strict";

  var BUFFER_MIN = 15;

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
    return String((pl && (pl.service_booked || pl.service || pl.programme || pl.activity)) || "").trim();
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

  /** Weekday Multi-Activity + Bespoke Programme: +15 min each end of the work band. */
  function portalStaffSupportShiftBufferApplies(service, dayName) {
    var s = String(service || "").toLowerCase();
    var d = String(dayName || "").trim();
    if (/\bbespoke\b/.test(s) || /\bfitfun\b/.test(s)) return true;
    if (/multi[-\s]?activity/.test(s)) return !!d && d !== "Sunday";
    return false;
  }

  function shiftSlotLabelFromRows(rows, iso) {
    var list = Array.isArray(rows) ? rows : [];
    if (!list.length) return "";
    var dayName = dayNameFromIso(iso);
    var minStart = Infinity;
    var maxEnd = -Infinity;
    var applyBuffer = false;
    list.forEach(function (row) {
      var svc = serviceLabelFromRow(row);
      if (portalStaffSupportShiftBufferApplies(svc, dayName)) applyBuffer = true;
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
      if (!Number.isFinite(a) || !Number.isFinite(b)) return;
      if (b < a) b += 24 * 60;
      if (a < minStart) minStart = a;
      if (b > maxEnd) maxEnd = b;
    });
    if (!Number.isFinite(minStart) || !Number.isFinite(maxEnd)) return "";
    if (applyBuffer) {
      minStart -= BUFFER_MIN;
      maxEnd += BUFFER_MIN;
    }
    return formatBandLabel(minutesToHm(minStart), minutesToHm(maxEnd));
  }

  function portalStaffOverrideShiftSlotLabel(row) {
    var pl = parsePayload(row);
    if (pl && pl._portal_shift_slot_label) return String(pl._portal_shift_slot_label).trim();
    var iso = normIso(row && row.session_date);
    var staff = normKey(row && row.anchor_staff_id);
    var venue = normKey(row && row.anchor_venue);
    if (!iso || !staff) return "";
    var all =
      typeof global.portalScheduleOverrideRowsAll === "function"
        ? global.portalScheduleOverrideRowsAll()
        : Array.isArray(global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__)
          ? global.__PORTAL_SCHEDULE_OVERRIDE_ROWS__
          : [];
    var peers = all.filter(function (r) {
      if (String(r && r.override_type || "").trim() !== "slot_update") return false;
      if (normIso(r.session_date) !== iso) return false;
      if (normKey(r.anchor_staff_id) !== staff) return false;
      if (venue && normKey(r.anchor_venue) !== venue) return false;
      return true;
    });
    return shiftSlotLabelFromRows(peers.length ? peers : [row], iso);
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
    if (portalStaffSupportShiftBufferApplies(svc, dayName)) {
      a -= BUFFER_MIN;
      b += BUFFER_MIN;
    }
    return formatBandLabel(minutesToHm(a), minutesToHm(b));
  }

  global.portalStaffSupportShiftBufferApplies = portalStaffSupportShiftBufferApplies;
  global.portalStaffShiftSlotLabelFromRows = shiftSlotLabelFromRows;
  global.portalStaffOverrideShiftSlotLabel = portalStaffOverrideShiftSlotLabel;
  global.portalStaffSessionShiftSlotLabel = portalStaffSessionShiftSlotLabel;
  global.PORTAL_STAFF_SHIFT_BUFFER_MIN = BUFFER_MIN;
})(typeof window !== "undefined" ? window : globalThis);
