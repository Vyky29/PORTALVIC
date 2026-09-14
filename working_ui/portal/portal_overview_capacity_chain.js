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

  function ymdLocal(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  /**
   * Staff Today expands only a rolling date window (not whole Sep–Dec).
   * Admin Overview leaves win null → full Autumn term.
   */
  function staffExpandWindowBounds(opt) {
    opt = opt || {};
    var from = String(opt.windowFrom || "").slice(0, 10);
    var through = String(opt.windowThrough || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(through)) {
      var now = new Date();
      var a = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21);
      var b = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 35);
      from = ymdLocal(a);
      through = ymdLocal(b);
    }
    if (from < TERM_FROM) from = TERM_FROM;
    if (through > TERM_THROUGH) through = TERM_THROUGH;
    if (through < from) through = from;
    return { from: from, through: through };
  }

  function isoInWindow(iso, win) {
    var d = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    if (!win || !win.from || !win.through) return true;
    return d >= win.from && d <= win.through;
  }

  function autumnIsosForDow(dayName, win) {
    var want = DOW_KEYS.indexOf(normDow(dayName));
    if (want < 0) return [];
    var out = [];
    var cur = new Date(TERM_FROM + "T12:00:00");
    var end = new Date(TERM_THROUGH + "T12:00:00");
    while (cur <= end) {
      if (cur.getDay() === want) {
        var iso = ymdLocal(cur);
        if (isoInWindow(iso, win)) out.push(iso);
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

  function isTrialSeatLine(line) {
    var kind = String((line && line.kind) || "").toLowerCase();
    if (kind === "trial") return true;
    var text = String((line && line.client) || "");
    var label = String((line && line.label) || "");
    return /HOLD BY TRIAL/i.test(text) || /HOLD BY TRIAL/i.test(label);
  }

  /** One-off trial day if Places stamped it; otherwise standing stays open. */
  function trialDateForSeatLine(line, slot) {
    var raw =
      (line && (line.trialDate || line.trial_date || line.session_date)) ||
      (slot && (slot.trialDate || slot.trial_date)) ||
      "";
    var d = String(raw || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  }

  function trialClientForSeatLine(line) {
    var named = String((line && (line.trialClient || line.trial_client)) || "").trim();
    if (named) return named;
    if (!isTrialSeatLine(line)) return "";
    return clientFromSeatLine(line);
  }

  /** First calendar day a standing CLIENT occupies this seat (ISO). Before that → open. */
  function bookedFromForSeatLine(line, slot) {
    var raw =
      (line && (line.bookedFrom || line.booked_from || line.firstSession || line.first_session)) ||
      (slot && (slot.bookedFrom || slot.booked_from)) ||
      "";
    var d = String(raw || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  }

  function occupantsPhasesToRosterRows(bySlotId, win) {
    var out = [];
    Object.keys(bySlotId || {}).forEach(function (slotId) {
      var slot = bySlotId[slotId];
      if (!slot || !isPlacesPhaseServiceId(slot.serviceId)) return;
      var service = serviceLabelFromId(slot.serviceId);
      if (!service) return;
      var day = String(slot.day || "").trim();
      var dates = autumnIsosForDow(day, win);
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
        var trialIso = trialDateForSeatLine(line, slot);
        var trialClient = trialClientForSeatLine(line);
        var trialSeat = isTrialSeatLine(line) || !!(trialIso && trialClient);
        var standingClient = trialSeat && isTrialSeatLine(line) ? "No participant" : clientFromSeatLine(line);
        /* Open seat that only carries a dated trial stamp stays open on other weeks. */
        if (trialSeat && !isTrialSeatLine(line) && trialIso) {
          standingClient = "No participant";
        }
        var bookedFrom = bookedFromForSeatLine(line, slot);
        var staffRaw = String(line.instructor || "").trim();
        if (!staffRaw) return;
        dates.forEach(function (iso) {
          /* Timetable owns who-works: collapse slash pools (Dan/Youssef/Directors) per ISO. */
          var staff =
            resolveSlashInstructorsForIso(staffRaw, iso, slot.serviceId || service) || staffRaw;
          if (!staff) return;
          var client = standingClient;
          if (trialSeat) {
            client = trialIso && iso === trialIso && trialClient ? trialClient : "No participant";
          }
          /* Standing CLIENT not yet started on this seat (e.g. Serine Roberto Tue from 15 Sep). */
          if (
            bookedFrom &&
            iso < bookedFrom &&
            client &&
            !/^(no participant|closed|available|hold\b)/i.test(String(client).trim())
          ) {
            client = "No participant";
          }
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
  function timetableBespokeToRosterRows(bySlotId, win) {
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
        if (!isoInWindow(iso, win)) return;
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

  /** First-name keys on Timetable for this ISO (draft hours win). */
  function timetableStaffKeysForIso(iso) {
    var P = global.PORTAL_AUTUMN_STAFF_HOURS;
    var root = P && (P.staffHours || P);
    if (!root) return null;
    var dayIso = String(iso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) return null;
    var day = DOW_TITLE[DOW_KEYS[new Date(dayIso + "T12:00:00").getDay()]];
    var sheet = root[day];
    if (!sheet) return null;
    var dateRow = null;
    (sheet.dates || []).forEach(function (dr) {
      if (String((dr && dr.date) || "").slice(0, 10) === dayIso) dateRow = dr;
    });
    if (!dateRow) return null;
    var keys = Object.create(null);
    (dateRow.cells || []).forEach(function (cell) {
      var name = parseHoursName(timetableCellText(cell));
      var k = normStaffTok(name);
      if (k) keys[k] = name.split(/\s+/)[0] || name;
    });
    return keys;
  }

  function isRoleInstructorToken(tok) {
    return /^(directors?|manager|office)$/i.test(String(tok || "").trim());
  }

  /** Places "Directors" pool → named club directors (never paint literal DI). */
  function expandRoleInstructorToken(tok) {
    if (/^directors?$/i.test(String(tok || "").trim())) {
      return ["Victor", "Raul", "Javi"];
    }
    return [String(tok || "").trim()];
  }

  /**
   * Slash capacity (Javier/Dan/Emmanuel, Roberto/Youssef/Godsway,
   * Aurora/Luliya/Berta/Directors) → Timetable who-works for that ISO.
   * Dan/Youssef/DI only appear when Timetable names them that Sunday.
   */
  function resolveSlashInstructorsForIso(instructorsRaw, iso, serviceId) {
    var raw = String(instructorsRaw || "").trim();
    if (!raw) return "";
    var hasSlash = /[\/|,]/.test(raw) || isRoleInstructorToken(raw);
    if (!hasSlash) return raw;
    var tt = timetableStaffKeysForIso(iso);
    var parts = raw
      .split(/[,/&]+|\band\b/gi)
      .map(function (p) {
        return String(p || "").trim();
      })
      .filter(Boolean);
    if (!parts.length) return raw;
    var expanded = [];
    parts.forEach(function (p) {
      expandRoleInstructorToken(p).forEach(function (n) {
        if (n && expanded.indexOf(n) < 0) expanded.push(n);
      });
    });
    function onTt(name) {
      if (!tt) return false;
      return !!tt[normStaffTok(name)];
    }
    function displayName(name) {
      var k = normStaffTok(name);
      if (tt && tt[k]) return tt[k];
      return String(name || "").split(/\s+/)[0] || name;
    }
    var matched = expanded.filter(onTt).map(displayName);
    var seen = Object.create(null);
    matched = matched.filter(function (n) {
      var k = normStaffTok(n);
      if (!k || seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    var pool = parts
      .concat(expanded)
      .map(function (p) {
        return normStaffTok(p);
      })
      .join(" ");
    var isMulti = /multi/i.test(String(serviceId || ""));
    function pick(want) {
      var wk = normStaffTok(want);
      for (var i = 0; i < matched.length; i++) {
        if (normStaffTok(matched[i]) === wk) return matched[i];
      }
      return "";
    }
    /* Sunday standing = Aurora | Javier | Roberto only; covers via overrides. */
    if (isMulti || /aquatic|swim/i.test(String(serviceId || ""))) {
      if (/\bjavier\b|\bdan\b|\bemmanuel\b|\bemanuel\b|\bgiuseppe\b/.test(pool) && pick("Javier")) {
        return pick("Javier");
      }
      if (/\broberto\b|\byoussef\b|\bgodsway\b/.test(pool) && pick("Roberto")) {
        return pick("Roberto");
      }
      if (/\baurora\b|\bluliya\b|\bberta\b|\bdirectors?\b/.test(pool) && pick("Aurora")) {
        return pick("Aurora");
      }
      /* Cover on Timetable who is not the standing name (e.g. Luliya covering Aurora). */
      if (matched.length === 1) return matched[0];
      if (pick("Aurora")) return pick("Aurora");
      if (pick("Javier")) return pick("Javier");
      if (pick("Roberto")) return pick("Roberto");
    }
    if (matched.length) return matched[0];
    /* Nobody from the pool on Timetable — keep first real name (not Directors). */
    for (var j = 0; j < parts.length; j++) {
      if (!isRoleInstructorToken(parts[j])) return parts[j].split(/\s+/)[0] || parts[j];
    }
    return "";
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

  function enumerateTermWeekdays(win) {
    var out = [];
    var cur = new Date(TERM_FROM + "T12:00:00");
    var end = new Date(TERM_THROUGH + "T12:00:00");
    while (cur <= end) {
      var dow = cur.getDay();
      if (dow >= 1 && dow <= 5) {
        var iso = ymdLocal(cur);
        if (isoInWindow(iso, win)) out.push(iso);
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

  function occupantsDcToRosterRows(bySlotId, win) {
    var Dc = global.PortalDcServicesLocal;
    if (!Dc || typeof Dc.rosterRowsForIso !== "function") {
      return [];
    }
    var C = global.PortalRosterCanonical;
    var out = [];
    enumerateTermWeekdays(win).forEach(function (iso) {
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

  function occupantsBySlotId(opt) {
    if (opt && opt.bySlotId) return opt.bySlotId;
    var P = global.PORTAL_CAPACITY_CHAIN_OCCUPANTS;
    return (P && P.bySlotId) || null;
  }

  function normStaffTok(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function canonStaffTok(raw) {
    var t = normStaffTok(raw);
    if (!t) return "";
    try {
      var fn =
        typeof global.portalCanonicalStaffMatchKey === "function"
          ? global.portalCanonicalStaffMatchKey
          : global.PortalStaffMatchKey &&
            typeof global.PortalStaffMatchKey.canonicalStaffMatchKey === "function"
          ? global.PortalStaffMatchKey.canonicalStaffMatchKey
          : null;
      if (fn) t = normStaffTok(fn(raw) || t);
    } catch (_c) {}
    /* Hire Emmanuel Amoakohene — never treat as departed Giuseppe / DC Emanuel. */
    if (t === "giuseppe" || t === "emanuel" || t === "emmanuelamoakohene") return "emmanuel";
    return t;
  }

  function instructorMentionsStaff(instructorsRaw, staffKey) {
    var want = canonStaffTok(staffKey);
    if (!want) return false;
    return String(instructorsRaw || "")
      .split(/,|\/|&|\band\b/gi)
      .some(function (part) {
        return canonStaffTok(part) === want;
      });
  }

  /** Keep only seats that name this worker — expand fewer term dates on Staff Today. */
  function filterOccupantsByStaff(bySlotId, staffId) {
    var want = normStaffTok(staffId);
    if (!want || !bySlotId) return bySlotId || {};
    var out = {};
    Object.keys(bySlotId).forEach(function (slotId) {
      var slot = bySlotId[slotId];
      if (!slot) return;
      var lines = Array.isArray(slot.seatLines) ? slot.seatLines : [];
      var keepLines = lines.filter(function (line) {
        return instructorMentionsStaff(line && line.instructor, want);
      });
      if (keepLines.length) {
        out[slotId] = Object.assign({}, slot, {
          seatLines: keepLines,
          instructors: keepLines
            .map(function (l) {
              return String(l.instructor || "").trim();
            })
            .filter(Boolean),
        });
        return;
      }
      var inst = slot.instructors || [];
      if (
        inst.some(function (name) {
          return instructorMentionsStaff(name, want);
        })
      ) {
        out[slotId] = slot;
      }
    });
    return out;
  }

  function isSwimfarmPoolOrHubPlacesService(service) {
    var svc = String(service || "").toLowerCase();
    return /multi/.test(svc) || /aquatic|swim/.test(svc);
  }

  /**
   * Places Sunday Multi bands are capacity windows (e.g. 9.30-11 with Adam+Jack),
   * not teaching turns. Staff Today and Sessions Overview WHO WORKS need canonical
   * 45' seats: pool books on swimming instructors + Hub Room on support
   * (Berta/Emmanuel/Godsway standing; John / Raul / Victor via dated covers).
   * Places occupancy counts stay on the Places occupants JSON; WHO WORKS paints turns.
   */
  function dropSwimfarmPlacesPoolOrHubRows(rows) {
    var kept = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var venue = String(r.venue || "").toLowerCase();
      if (venue.indexOf("swimfarm") >= 0 && isSwimfarmPoolOrHubPlacesService(r.service)) {
        return;
      }
      kept.push(r);
    });
    return kept;
  }

  function resolveCanonicalSwimfarmTeachingTurnRows() {
    var C = global.PortalRosterCanonical;
    if (!C || typeof C.resolveCanonicalRosterRows !== "function") return [];
    try {
      /* skipDb: Hub books are LOCAL standing; do not depend on portal_roster_rows cache. */
      return C.resolveCanonicalRosterRows({ skipDb: true }) || [];
    } catch (_c) {
      try {
        return C.resolveCanonicalRosterRows() || [];
      } catch (_c2) {
        return [];
      }
    }
  }

  function appendCanonicalSwimfarmTeachingTurns(kept, staffKeyFilter) {
    var want = staffKeyFilter ? canonStaffTok(staffKeyFilter) : "";
    var canon = resolveCanonicalSwimfarmTeachingTurnRows();
    if (!canon.length) return kept;
    canon.forEach(function (r) {
      if (!r) return;
      var venue = String(r.venue || "").toLowerCase();
      if (venue.indexOf("swimfarm") < 0) return;
      if (!isSwimfarmPoolOrHubPlacesService(r.service)) return;
      if (want && !instructorMentionsStaff(r.instructors, want)) return;
      kept.push(r);
    });
    return kept;
  }

  function replaceStaffSwimfarmPlacesBandsWithTeachingTurns(rows, staffId) {
    var want = canonStaffTok(staffId);
    if (!want) return rows;
    var kept = dropSwimfarmPlacesPoolOrHubRows(rows);
    var next = appendCanonicalSwimfarmTeachingTurns(kept, want);
    return next.length ? next : rows;
  }

  /** Overview WHO WORKS: same SwimFarm teaching turns for every staff column (incl. Hub support). */
  function replaceOverviewSwimfarmPlacesBandsWithTeachingTurns(rows) {
    var kept = dropSwimfarmPlacesPoolOrHubRows(rows);
    var next = appendCanonicalSwimfarmTeachingTurns(kept, "");
    return next.length ? next : rows;
  }

  function occupantsHasDayCentre(bySlotId) {
    return Object.keys(bySlotId || {}).some(function (id) {
      var s = bySlotId[id];
      return s && String(s.serviceId || "").toLowerCase() === "day_centre";
    });
  }

  var FULL_CHAIN_CACHE = null;
  var STAFF_CHAIN_CACHE = Object.create(null);

  function resolveCapacityChainRosterSource(occupantsBySlotId, opt) {
    opt = opt || {};
    var win = opt.dateWindow || null;
    var C = global.PortalRosterCanonical;
    var phases = occupantsPhasesToRosterRows(occupantsBySlotId || {}, win);
    var bespoke = timetableBespokeToRosterRows(occupantsBySlotId || {}, win);
    var dc = [];
    var wantDc = opt.includeDc !== false && occupantsHasDayCentre(occupantsBySlotId);
    try {
      if (wantDc && global.PortalDcServicesLocal) {
        dc = clipDcRowsToTimetable(occupantsDcToRosterRows(occupantsBySlotId || {}, win));
      }
    } catch (_dc) {
      dc = [];
    }
    var rows = phases.concat(bespoke).concat(dc);
    var baseSrc = global.STAFF_DASHBOARD_SOURCE || {};
    var starts = Object.assign(
      {},
      baseSrc.clientRosterStartDates || {},
      {
        "Emmanuel Abate": "2026-09-15",
        "Christian Abate": "2026-09-15",
        "Amaar Ah": "2026-09-14",
        "Muhammad": "2026-09-14",
        "Adaam Ah": "2026-09-14",
        "Aydaan Ah": "2026-09-14",
        Ayman: "2026-09-16",
        "Ayman El Bakry": "2026-09-16",
      },
      C && C.FADI_START_ISO ? { Fadi: C.FADI_START_ISO } : {}
    );
    return {
      rows: rows,
      clientRosterStartDates: starts,
      clientRosterGoneFromDates: Object.assign({}, baseSrc.clientRosterGoneFromDates || {}),
      clientWeekdaysOnly: Object.assign({}, baseSrc.clientWeekdaysOnly || {}),
      sundayFeedbackMerges: Array.isArray(baseSrc.sundayFeedbackMerges)
        ? baseSrc.sundayFeedbackMerges
        : [],
      sundayDateOverrides: Object.assign({}, baseSrc.sundayDateOverrides || {}),
      overviewOmitRosterSlots: Array.isArray(baseSrc.overviewOmitRosterSlots)
        ? baseSrc.overviewOmitRosterSlots
        : [],
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

  function resolve(opt) {
    opt = opt || {};
    var by = occupantsBySlotId(opt);
    if (!by || !Object.keys(by).length) return null;
    if (!global.PORTAL_AUTUMN_STAFF_HOURS) return null;
    var staffId = normStaffTok(opt.staffId || "");
    try {
      if (staffId) {
        var canonFn =
          typeof global.portalCanonicalStaffMatchKey === "function"
            ? global.portalCanonicalStaffMatchKey
            : global.PortalStaffMatchKey &&
              typeof global.PortalStaffMatchKey.canonicalStaffMatchKey === "function"
            ? global.PortalStaffMatchKey.canonicalStaffMatchKey
            : null;
        if (canonFn) staffId = normStaffTok(canonFn(staffId) || staffId);
      }
      /* Staff Today: expand only this worker's seats in a rolling date window. */
      if (staffId && !opt.forSessionsOverview) {
        var wantWin = staffExpandWindowBounds(opt);
        var cached = !opt.bypassCache ? STAFF_CHAIN_CACHE[staffId] : null;
        if (
          cached &&
          Array.isArray(cached.rows) &&
          cached._winFrom &&
          cached._winThrough &&
          cached._winFrom <= wantWin.from &&
          cached._winThrough >= wantWin.through
        ) {
          return cached;
        }
        var unionWin = {
          from: wantWin.from,
          through: wantWin.through,
        };
        if (cached && cached._winFrom && cached._winThrough) {
          if (cached._winFrom < unionWin.from) unionWin.from = cached._winFrom;
          if (cached._winThrough > unionWin.through) {
            unionWin.through = cached._winThrough;
          }
        }
        var slimBy = filterOccupantsByStaff(by, staffId);
        var slim = resolveCapacityChainRosterSource(slimBy, {
          includeDc: occupantsHasDayCentre(slimBy),
          dateWindow: unionWin,
        });
        if (slim) {
          var teachingRows = replaceStaffSwimfarmPlacesBandsWithTeachingTurns(
            slim.rows || [],
            staffId,
          );
          slim = Object.assign({}, slim, {
            rows: teachingRows,
            capacityChainStaffScoped: true,
            capacityChainStaffId: staffId,
            capacityChainSwimfarmTeachingTurns: true,
            capacityChainDateWindowFrom: unionWin.from,
            capacityChainDateWindowThrough: unionWin.through,
            _winFrom: unionWin.from,
            _winThrough: unionWin.through,
            rosterSourceNote:
              (slim.rosterSourceNote || "Capacity chain") +
              " · staff-scoped (" +
              staffId +
              ") · " +
              unionWin.from +
              ".." +
              unionWin.through +
              " · SwimFarm teaching turns",
          });
          STAFF_CHAIN_CACHE[staffId] = slim;
        }
        return slim;
      }
      if (!opt.bypassCache && FULL_CHAIN_CACHE && Array.isArray(FULL_CHAIN_CACHE.rows) && !opt.windowFrom) {
        return FULL_CHAIN_CACHE;
      }
      /* Schedule & Covers: optional week window (do not poison full Overview cache). */
      if (opt.forSessionsOverview && opt.windowFrom && opt.windowThrough) {
        var schedWin = staffExpandWindowBounds({
          windowFrom: opt.windowFrom,
          windowThrough: opt.windowThrough,
        });
        var weekSrc = resolveCapacityChainRosterSource(by, {
          includeDc: true,
          dateWindow: schedWin,
        });
        if (weekSrc) {
          var weekTeach = replaceOverviewSwimfarmPlacesBandsWithTeachingTurns(
            weekSrc.rows || [],
          );
          weekSrc = Object.assign({}, weekSrc, {
            rows: weekTeach,
            capacityChainSwimfarmTeachingTurns: true,
            capacityChainDateWindowFrom: schedWin.from,
            capacityChainDateWindowThrough: schedWin.through,
            rosterSourceNote:
              (weekSrc.rosterSourceNote || "Capacity chain") +
              " · schedule week " +
              schedWin.from +
              ".." +
              schedWin.through +
              " · SwimFarm teaching turns",
          });
        }
        return weekSrc;
      }
      var full = resolveCapacityChainRosterSource(by, { includeDc: true });
      if (full && Array.isArray(full.rows) && full.rows.length) {
        var fullTeach = replaceOverviewSwimfarmPlacesBandsWithTeachingTurns(full.rows);
        full = Object.assign({}, full, {
          rows: fullTeach,
          capacityChainSwimfarmTeachingTurns: true,
          rosterSourceNote:
            (full.rosterSourceNote || "Capacity chain") + " · SwimFarm teaching turns",
        });
        FULL_CHAIN_CACHE = full;
      }
      return full;
    } catch (_e) {
      try {
        var phases = occupantsPhasesToRosterRows(by);
        var bespoke = timetableBespokeToRosterRows(by);
        return {
          rows: phases.concat(bespoke),
          capacityChainNoCanonicalRemap: true,
          localNoCanonicalResolve: true,
          rosterSourceNote:
            "Capacity chain (Places + Timetable; DC expand failed)",
        };
      } catch (_e2) {
        return null;
      }
    }
  }

  function clearResolveCache() {
    FULL_CHAIN_CACHE = null;
    STAFF_CHAIN_CACHE = Object.create(null);
  }

  global.PortalOverviewCapacityChain = {
    resolve: resolve,
    resolveCapacityChainRosterSource: resolveCapacityChainRosterSource,
    occupantsBySlotId: occupantsBySlotId,
    filterOccupantsByStaff: filterOccupantsByStaff,
    staffExpandWindowBounds: staffExpandWindowBounds,
    resolveSlashInstructorsForIso: resolveSlashInstructorsForIso,
    timetableStaffKeysForIso: timetableStaffKeysForIso,
    clearResolveCache: clearResolveCache,
  };
})(typeof window !== "undefined" ? window : globalThis);
