/**
 * Shared client day-visibility (Option A: Staff = Overview).
 * One policy for "is this client allowed on this calendar ISO" across
 * Sessions Overview and Staff Today / Term.
 *
 * Phase B will fold this into resolveDayBoard(iso, audience).
 */
(function (global) {
  "use strict";

  /**
   * Fallback when capacity chain wiped bundle starts (admin Overview often has no bundle).
   * Weekend Multi/Aquatic standing for Adaam / Aydaan / Amaar began Autumn Sun 6 Sep —
   * do NOT stamp weekday Acton NEW CLIENT (Mon/Tue 14–15) here or Overview hides Sun 6/13 seats.
   * Muhammad aquatic Mon Northolt from Mon 7; climb trial Sun 13 is seat trialDate only.
   */
  var FALLBACK_CLIENT_STARTS = {
    "Emmanuel Abate": "2026-09-15",
    "Christian Abate": "2026-09-15",
    "Amaar Ah": "2026-09-06",
    Muhammad: "2026-09-07",
    "Adaam Ah": "2026-09-06",
    "Aydaan Ah": "2026-09-06",
    /* Tue Acton Javier 4–5 from Autumn Tue 8; Wed Acton 5–6 NEW CLIENT is 16 Sep (row bookedFrom + scrub). */
    Ayman: "2026-09-08",
    "Ayman El Bakry": "2026-09-08",
  };

  function clean(v) {
    return String(v == null ? "" : v).trim();
  }

  function slugify(name) {
    return clean(name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function canonicalClientSlug(name) {
    var s = slugify(name);
    s = s
      .replace(/^(trial|makeup|make_up|cover)_+/g, "")
      .replace(/_+(trial|makeup|make_up)$/g, "")
      .replace(/^(trial|makeup)_+/g, "");
    return s;
  }

  function mapEntry(map, clientName) {
    if (!map) return null;
    var name = clean(clientName);
    if (map[name] != null) return map[name];
    if (!name) return null;
    var slug = canonicalClientSlug(name);
    for (var k in map) {
      if (Object.prototype.hasOwnProperty.call(map, k) && canonicalClientSlug(k) === slug) {
        return map[k];
      }
    }
    return null;
  }

  function earlierIso(a, b) {
    if (!a) return b || "";
    if (!b) return a;
    return String(a) <= String(b) ? a : b;
  }

  function isFadiOffRota(clientName, isoDate) {
    var name = clean(clientName);
    var canon = global.PortalRosterCanonical;
    var isFadi =
      canon && typeof canon.isFadiClientName === "function"
        ? canon.isFadiClientName(name)
        : /^fadi\b/i.test(name);
    if (!isFadi) return false;
    if (canon && typeof canon.isFadiOffRotaIso === "function") {
      return !!canon.isFadiOffRotaIso(isoDate);
    }
    return !!(isoDate && isoDate >= "2026-09-01" && isoDate < "2026-09-20");
  }

  /**
   * @param {string} clientName
   * @param {string} isoDate YYYY-MM-DD
   * @param {{ extraStarts?: Record<string,string> }=} opts
   *   extraStarts: optional earlier candidates (e.g. Staff ParticipantsSheet first session)
   */
  function clientAllowedOnDate(clientName, isoDate, opts) {
    opts = opts || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(isoDate || ""))) return true;
    var iso = String(isoDate).slice(0, 10);
    if (isFadiOffRota(clientName, iso)) return false;

    var src = global.STAFF_DASHBOARD_SOURCE || {};
    var start = mapEntry(src.clientRosterStartDates, clientName);
    var ovStart = mapEntry(global.__PORTAL_ASH_CLIENT_FIRST_SESSION__, clientName);
    var fbStart = mapEntry(FALLBACK_CLIENT_STARTS, clientName);
    var extra = mapEntry(opts.extraStarts, clientName);
    start = earlierIso(earlierIso(earlierIso(start, ovStart), fbStart), extra);

    if (start && /^\d{4}-\d{2}-\d{2}$/.test(String(start)) && iso < String(start)) {
      return false;
    }

    var goneFrom = mapEntry(src.clientRosterGoneFromDates, clientName);
    if (goneFrom && /^\d{4}-\d{2}-\d{2}$/.test(String(goneFrom)) && iso >= String(goneFrom)) {
      return false;
    }
    return true;
  }

  function clientAllowedOnWeekday(clientName, weekdayLong) {
    var allow = mapEntry(
      global.STAFF_DASHBOARD_SOURCE && global.STAFF_DASHBOARD_SOURCE.clientWeekdaysOnly,
      clientName
    );
    if (!allow || !allow.length) return true;
    return allow.indexOf(weekdayLong) !== -1;
  }

  function noteFirstSessionFromOverrides(overrides) {
    var map = Object.create(null);
    function note(name, iso) {
      var n = clean(name);
      var d = clean(iso).slice(0, 10);
      if (!n || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      var low = n.toLowerCase();
      if (
        /^(no participant|open|closed|unassigned|cover needed)$/i.test(n) ||
        low === "hold waitlist" ||
        (/^hold\b/.test(low) && /wait/.test(low)) ||
        /^elia\b/.test(low)
      ) {
        return;
      }
      var slug = canonicalClientSlug(n);
      if (!slug) return;
      if (!map[slug] || d < map[slug]) map[slug] = d;
      map[n] = map[slug];
    }
    function payloadObj(ov) {
      var p = ov && ov.payload;
      if (!p) return {};
      if (typeof p === "string") {
        try {
          p = JSON.parse(p);
        } catch (_) {
          return {};
        }
      }
      return p && typeof p === "object" ? p : {};
    }
    var list = Array.isArray(overrides) ? overrides : [];
    for (var i = 0; i < list.length; i++) {
      var ov = list[i];
      if (!ov) continue;
      if (String(ov.status || "active").trim() !== "active") continue;
      var p = payloadObj(ov);
      var first = clean(p.first_session || p.firstSession).slice(0, 10);
      var ot = clean(ov.override_type || ov.type || p.override_type || "").toLowerCase();
      var isNew =
        ot === "client_replace_in_slot" ||
        p.new_client === true ||
        p.new_client === "true" ||
        p.term_new_participant === true ||
        p.term_new_participant === "true" ||
        p.finish_booking === true ||
        p.finish_booking === "true";
      if (!first && isNew) first = clean(ov.session_date).slice(0, 10);
      if (!first) continue;
      if (!isNew && !clean(p.first_session || p.firstSession)) continue;
      note(p.to_client_name || p.toClientName, first);
      note(p.replacement_client_name || p.replacementClientName, first);
      note(p.client_name || p.clientName, first);
      note(p.participant_name || p.participantName, first);
      note(ov.anchor_client_id, first);
    }
    try {
      var prev = global.__PORTAL_ASH_CLIENT_FIRST_SESSION__;
      if (prev && typeof prev === "object") {
        for (var pk in prev) {
          if (!Object.prototype.hasOwnProperty.call(prev, pk)) continue;
          if (!map[pk] || String(prev[pk]) < String(map[pk])) map[pk] = prev[pk];
        }
      }
      global.__PORTAL_ASH_CLIENT_FIRST_SESSION__ = map;
    } catch (_g) {}
    return map;
  }

  global.PortalClientDayVisibility = {
    FALLBACK_CLIENT_STARTS: FALLBACK_CLIENT_STARTS,
    clientAllowedOnDate: clientAllowedOnDate,
    clientAllowedOnWeekday: clientAllowedOnWeekday,
    isFadiOffRota: isFadiOffRota,
    canonicalClientSlug: canonicalClientSlug,
    mapEntry: mapEntry,
    noteFirstSessionFromOverrides: noteFirstSessionFromOverrides,
  };
})(typeof window !== "undefined" ? window : globalThis);
