/**
 * Session disruption shifts for one worker on one date.
 * Morning = Day Centre, or any other service that starts before 15:00.
 * Afternoon = everything else that starts at 15:00 or later.
 * One band means the report is the day. Two bands means they pick.
 */
(function (global) {
  "use strict";

  var SKIP_CLIENT = /^(no participant|no client|closed|available|open|cover needed|hold waitlist|waiting|elia)$/i;

  function canon(v) {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function staffKey(v) {
    var k = canon(v);
    if (!k) return "";
    if (k === "lulia" || k === "aida" || k === "lulya" || k.indexOf("luliya") === 0) return "luliya";
    if (k === "yousef" || k === "yusef" || k.indexOf("youssef") === 0) return "youssef";
    if (k.indexOf("javiermarquez") === 0 || k === "javier") return "javier";
    if (k.indexOf("roberto") === 0) return "roberto";
    if (k.indexOf("aurora") === 0) return "aurora";
    if (k.indexOf("godsway") === 0) return "godsway";
    if (k.indexOf("bismark") === 0 || k.indexOf("emmanuelamoakohene") === 0) return "emmanuel";
    var first = canon(String(v || "").trim().split(/\s+/)[0]);
    return first || k;
  }

  function sameStaff(instructor, profileName) {
    var a = staffKey(instructor);
    var b = staffKey(profileName);
    return !!(a && b && a === b);
  }

  function weekdayLong(iso) {
    try {
      return new Date(String(iso).slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", {
        weekday: "long",
      });
    } catch (_e) {
      return "";
    }
  }

  function parseRange(text) {
    var t = String(text || "")
      .replace(/\u2013|\u2014/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    var m = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(?:to|-)\s*(\d{1,2})(?:[:.](\d{2}))?/i);
    if (!m) {
      var one = t.match(/(\d{1,2})(?:[:.](\d{2}))?/);
      if (!one) return null;
      return { start: toMins(one[1], one[2]), end: NaN };
    }
    return { start: toMins(m[1], m[2]), end: toMins(m[3], m[4]) };
  }

  function toMins(hRaw, mRaw) {
    var h = parseInt(hRaw, 10);
    var min = mRaw ? parseInt(mRaw, 10) : 0;
    if (!isFinite(h)) return NaN;
    if (h >= 1 && h <= 7) h += 12;
    return h * 60 + min;
  }

  function seatTimeText(line, slot) {
    var client = String((line && (line.client || line.label)) || "");
    var parts = client.split(/\s*[·•|]\s*/);
    if (parts.length > 1 && /\d/.test(parts[1])) return parts.slice(1).join(" ");
    return String((slot && slot.timeLabel) || "");
  }

  function seatClientName(line) {
    var client = String((line && (line.client || line.label)) || "").trim();
    return String(client.split(/\s*[·•|]\s*/)[0] || "").trim();
  }

  function skipName(name) {
    return SKIP_CLIENT.test(String(name || "").trim());
  }

  function slotMatchesDate(slot, iso, dayTitle) {
    if (!slot) return false;
    if (dayTitle && String(slot.day || "").trim() !== dayTitle) return false;
    var from = String(slot.validFrom || "").slice(0, 10);
    var to = String(slot.validTo || "").slice(0, 10);
    if (from && iso < from) return false;
    if (to && iso > to) return false;
    if (!from && !to && String(slot.serviceId || "").toLowerCase() === "day_centre") {
      return iso >= "2026-09-20";
    }
    return true;
  }

  function slotSpanDays(slot) {
    var from = String(slot.validFrom || "").slice(0, 10);
    var to = String(slot.validTo || "").slice(0, 10);
    if (!from || !to) return 9999;
    var a = new Date(from + "T12:00:00").getTime();
    var b = new Date(to + "T12:00:00").getTime();
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  function bestDayCentreSlot(slots) {
    var hits = slots.filter(function (s) {
      return String(s.serviceId || "").toLowerCase() === "day_centre";
    });
    if (!hits.length) return null;
    hits.sort(function (a, b) {
      var pd = (Number(b.priority) || 10) - (Number(a.priority) || 10);
      if (pd) return pd;
      return slotSpanDays(a) - slotSpanDays(b);
    });
    return hits[0];
  }

  function isAfternoonSeat(serviceId, start) {
    var svc = String(serviceId || "").toLowerCase();
    if (svc === "day_centre" || svc === "daycentre") return false;
    return isFinite(start) && start >= 15 * 60;
  }

  function fmtClock(mins) {
    if (!isFinite(mins)) return "";
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var h12 = h > 12 ? h - 12 : h;
    if (h12 === 0) h12 = 12;
    if (!m) return String(h12) + ".00";
    return String(h12) + "." + String(m).padStart(2, "0");
  }

  function bandSummary(id, seats) {
    if (!seats.length) return null;
    var start = Infinity;
    var end = -Infinity;
    var venues = [];
    seats.forEach(function (s) {
      if (isFinite(s.start) && s.start < start) start = s.start;
      var stop = isFinite(s.end) ? s.end : s.start;
      if (isFinite(stop) && stop > end) end = stop;
      if (s.venue && venues.indexOf(s.venue) < 0) venues.push(s.venue);
    });
    var clock = "";
    if (isFinite(start)) {
      clock = fmtClock(start) + (isFinite(end) && end > start ? " to " + fmtClock(end) : "");
    }
    var title = id === "afternoon" ? "Afternoon" : "Morning";
    var bits = [title];
    if (clock) bits.push(clock);
    if (venues.length) bits.push(venues.join(", "));
    return {
      id: id,
      label: title,
      text: bits.join(" · "),
      venues: venues,
      start: start,
      end: end,
    };
  }

  function shiftsForStaffOnDate(bySlotId, profileName, iso) {
    var day = String(iso || "").slice(0, 10);
    var empty = { mode: "day", bands: [], venues: [], hint: "No booked sessions on this day. The report covers the day." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !bySlotId) return empty;
    var dayTitle = weekdayLong(day);
    var matched = [];
    Object.keys(bySlotId).forEach(function (id) {
      var slot = bySlotId[id];
      if (!slotMatchesDate(slot, day, dayTitle)) return;
      matched.push(slot);
    });
    var dc = bestDayCentreSlot(matched);
    var use = matched.filter(function (s) {
      return String(s.serviceId || "").toLowerCase() !== "day_centre";
    });
    if (dc) use.push(dc);
    var morning = [];
    var afternoon = [];
    use.forEach(function (slot) {
      var lines = Array.isArray(slot.seatLines) ? slot.seatLines : [];
      lines.forEach(function (line) {
        if (!line) return;
        var kind = String(line.kind || "booked").toLowerCase();
        if (kind === "open" || kind === "closed" || kind === "hold") return;
        if (!sameStaff(line.instructor, profileName)) return;
        var name = seatClientName(line);
        if (skipName(name)) return;
        var range = parseRange(seatTimeText(line, slot)) || { start: NaN, end: NaN };
        var seat = {
          name: name,
          start: range.start,
          end: range.end,
          venue: String(slot.venue || "").trim(),
          serviceId: slot.serviceId,
        };
        if (isAfternoonSeat(slot.serviceId, range.start)) afternoon.push(seat);
        else morning.push(seat);
      });
    });
    var bands = [];
    var m = bandSummary("morning", morning);
    var a = bandSummary("afternoon", afternoon);
    if (m) bands.push(m);
    if (a) bands.push(a);
    if (bands.length < 2) {
      var only = bands[0];
      var venues = only ? only.venues.slice() : [];
      var hint = only
        ? "This report is for the day (" + only.text.replace(/^(Morning|Afternoon)\s*·\s*/, "") + ")."
        : empty.hint;
      return { mode: "day", bands: bands, venues: venues, hint: hint };
    }
    var allVenues = [];
    bands.forEach(function (b) {
      b.venues.forEach(function (v) {
        if (allVenues.indexOf(v) < 0) allVenues.push(v);
      });
    });
    return {
      mode: "pick",
      bands: bands,
      venues: allVenues,
      hint: "Tick the shift you cannot do. Tick both if the whole day is off.",
    };
  }

  global.PortalDisruptionShifts = {
    shiftsForStaffOnDate: shiftsForStaffOnDate,
    staffKey: staffKey,
  };
})(typeof window !== "undefined" ? window : globalThis);
