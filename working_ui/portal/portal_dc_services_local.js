/**
 * LOCAL Day Centre from Services occupants (phased / dated seats).
 * Overview + Covers read who-with-whom here; Timetable still owns hours;
 * Covers snaps own day patches. Canonical WEEK1 / FADI / standing boards
 * are authoring fallback only when no matching Services seat exists.
 */
(function (global) {
  "use strict";

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

  function normIso(iso) {
    return String(iso || "").slice(0, 10);
  }

  function dowKeyFromIso(iso) {
    try {
      var d = new Date(normIso(iso) + "T12:00:00").getDay();
      return DOW_KEYS[d] || "";
    } catch (_e) {
      return "";
    }
  }

  function dayTitleFromIso(iso) {
    return DOW_TITLE[dowKeyFromIso(iso)] || "";
  }

  function isDcOccupantSlot(slot) {
    return !!(slot && String(slot.serviceId || "").toLowerCase() === "day_centre");
  }

  function slotMatchesIso(slot, iso) {
    if (!isDcOccupantSlot(slot)) return false;
    var d = normIso(iso);
    if (!d) return false;
    var want = dayTitleFromIso(d);
    if (want && String(slot.day || "").trim() !== want) return false;
    var from = normIso(slot.validFrom);
    var to = normIso(slot.validTo);
    if (from && d < from) return false;
    if (to && d > to) return false;
    /* Legacy standing-only DC (no validFrom) = standing from 20 Sep. */
    if (!from && !to) {
      return d >= "2026-09-20";
    }
    return true;
  }

  function slotPriority(slot) {
    var p = Number(slot && slot.priority);
    if (Number.isFinite(p)) return p;
    var phase = String((slot && slot.phase) || "").toLowerCase();
    if (phase.indexOf("dated") === 0) return 100;
    return 10;
  }

  function slotSpanDays(slot) {
    var from = normIso(slot.validFrom);
    var to = normIso(slot.validTo);
    if (!from || !to) return 9999;
    try {
      var a = new Date(from + "T12:00:00").getTime();
      var b = new Date(to + "T12:00:00").getTime();
      return Math.max(0, Math.round((b - a) / 86400000));
    } catch (_e) {
      return 9999;
    }
  }

  /** Best matching DC Services seat for a calendar day (dated wins over phase). */
  function dcOccupantSlotForIso(bySlotId, iso) {
    var hits = [];
    Object.keys(bySlotId || {}).forEach(function (id) {
      var slot = bySlotId[id];
      if (!slotMatchesIso(slot, iso)) return;
      hits.push(slot);
    });
    if (!hits.length) return null;
    hits.sort(function (a, b) {
      var pd = slotPriority(b) - slotPriority(a);
      if (pd) return pd;
      return slotSpanDays(a) - slotSpanDays(b);
    });
    return hits[0];
  }

  function parseClientTime(raw) {
    var text = String(raw || "").trim();
    var parts = text.split(/\s*[·|]\s*/);
    var name = String(parts[0] || "").trim();
    var time = String(parts[1] || "")
      .replace(/\u2013|\u2014/g, "-")
      .replace(/\s*-\s*/g, " to ")
      .replace(/(\d)\.00\b/g, "$1")
      .trim();
    return { name: name, time: time };
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

  function isFadiLabel(name) {
    return /^fadi\b/i.test(String(name || "").trim());
  }

  function columnsFromOccupantSlot(slot) {
    var byStaff = {};
    var order = [];
    (slot && slot.seatLines ? slot.seatLines : []).forEach(function (line) {
      var staff = String((line && line.instructor) || "").trim();
      if (!staff) return;
      var parsed = parseClientTime(line.client || line.label || "");
      if (!parsed.name) return;
      if (!byStaff[staff]) {
        byStaff[staff] = [];
        order.push(staff);
      }
      byStaff[staff].push({
        name: parsed.name,
        time: parsed.time || "",
        kind: String((line && line.kind) || "booked"),
      });
    });
    return order.map(function (staff) {
      return { staff: staff, clients: byStaff[staff] };
    });
  }

  /**
   * { phase, phaseLabel, columns, source: 'services'|'canonical'|'none' }
   * Prefer Services occupants; optional canonicalFallback(iso) → { phase, columns }.
   */
  function boardForIso(bySlotId, iso, canonicalFallback) {
    var d = normIso(iso);
    var dk = dowKeyFromIso(d);
    if (!dk || dk === "saturday" || dk === "sunday") {
      return { phase: "weekend", phaseLabel: "Weekend", columns: [], source: "none" };
    }
    var slot = dcOccupantSlotForIso(bySlotId, d);
    if (slot) {
      return {
        phase: String(slot.phase || "services"),
        phaseLabel: String(slot.phaseLabel || slot.phase || "Services"),
        columns: columnsFromOccupantSlot(slot),
        source: "services",
        slotId: slot.id || null,
        validFrom: slot.validFrom || null,
        validTo: slot.validTo || null,
      };
    }
    if (typeof canonicalFallback === "function") {
      var fb = canonicalFallback(d) || {};
      return {
        phase: fb.phase || "canonical",
        phaseLabel: fb.phaseLabel || fb.phase || "Canonical template",
        columns: Array.isArray(fb.columns) ? fb.columns : [],
        source: "canonical",
      };
    }
    return { phase: "missing", phaseLabel: "No DC Services seat", columns: [], source: "none" };
  }

  function rosterRowsForIso(bySlotId, iso, opts) {
    opts = opts || {};
    var board = boardForIso(bySlotId, iso, opts.canonicalFallback);
    var out = [];
    var dayTitle = dayTitleFromIso(iso);
    var fadiOff = !!opts.fadiOffRota;
    (board.columns || []).forEach(function (col) {
      var staff = String((col && col.staff) || "").trim();
      if (!staff) return;
      (col.clients || []).forEach(function (c) {
        var name = String((c && c.name) || "").trim();
        if (!name) return;
        if (fadiOff && isFadiLabel(name)) return;
        var interview = isInterviewClient(name);
        out.push({
          client_name: interview ? "Interviews" : name,
          day: dayTitle,
          instructors: staff.toUpperCase(),
          service: interview ? "Interview" : "Day Centre",
          area: areaForDcClient(name),
          time_slot: String((c && c.time) || "").trim(),
          venue: "SwimFarm",
          session_date: normIso(iso),
          __dcPhase: board.phase,
          __dcSource: board.source,
        });
      });
    });
    return out;
  }

  function enumerateTermWeekdays(fromIso, throughIso) {
    var out = [];
    var cur = new Date(String(fromIso).slice(0, 10) + "T12:00:00");
    var end = new Date(String(throughIso).slice(0, 10) + "T12:00:00");
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

  global.PortalDcServicesLocal = {
    boardForIso: boardForIso,
    dcOccupantSlotForIso: dcOccupantSlotForIso,
    columnsFromOccupantSlot: columnsFromOccupantSlot,
    rosterRowsForIso: rosterRowsForIso,
    enumerateTermWeekdays: enumerateTermWeekdays,
    areaForDcClient: areaForDcClient,
    isInterviewClient: isInterviewClient,
    parseClientTime: parseClientTime,
    dayTitleFromIso: dayTitleFromIso,
  };
})(typeof window !== "undefined" ? window : globalThis);
