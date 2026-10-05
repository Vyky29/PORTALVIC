/**
 * Parent Notes from written session feedback.
 * Engagement / regulation / independence stay in Sessions Overview.
 * Relevant information is never read here.
 * Notes through 2026-10-04 are visible and do not count.
 * From 2026-10-06 a new note counts on the Notes tile. No push, no message.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PortalParentSessionNotes = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var BADGE_FROM = "2026-10-06";
  var WEEKLY_BADGE_FROM = "2026-10-05";
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function clean(v) {
    return String(v == null ? "" : v).replace(/\s+/g, " ").trim();
  }

  function isoDate(v) {
    var s = String(v || "").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function dmy(iso) {
    var s = isoDate(iso);
    if (!s) return "";
    var p = s.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }

  function weekdayName(iso) {
    var p = isoDate(iso).split("-").map(Number);
    if (p.length !== 3 || !p[0]) return "";
    return WEEKDAYS[new Date(p[0], p[1] - 1, p[2]).getDay()] || "";
  }

  function programmeKey(raw) {
    var s = clean(raw).toLowerCase();
    if (!s) return "";
    if (s.indexOf("day centre") >= 0 || s.indexOf("daycentre") >= 0) return "daycentre";
    if (s.indexOf("climb") >= 0) return "climbing";
    if (s.indexOf("splash") >= 0) return "splash";
    if (s.indexOf("multi") >= 0) return "multi";
    if (s.indexOf("aquatic") >= 0 || s.indexOf("swim") >= 0) return "aquatic";
    if (s.indexOf("physical") >= 0) return "physical";
    if (s.indexOf("bespoke") >= 0) return "bespoke";
    return "";
  }

  function serviceTitle(raw) {
    var s = clean(raw).replace(/^\d+\s*'\s*/, "");
    return s || "Session";
  }

  function covers(expectedKey, rowKey) {
    if (!expectedKey || !rowKey) return false;
    if (expectedKey === rowKey) return true;
    if (
      (expectedKey === "multi" && rowKey === "splash") ||
      (expectedKey === "splash" && rowKey === "multi")
    ) {
      return true;
    }
    return false;
  }

  function parentText(row) {
    var t = clean(row && (row.comment || row.parent_message));
    if (!t || t === "1") return "";
    if (/^(n\/?a|na|none|nothing|no|nil|null|—|-|\.)$/i.test(t)) return "";
    return t;
  }

  function rowAbsent(row) {
    if (!row) return false;
    if (row.parent_absent) return true;
    var a = clean(row.attendance).toLowerCase();
    if (!a) return false;
    if (a.indexOf("absent") >= 0) return true;
    if (a === "no" || a.indexOf("no show") === 0 || a.indexOf("noshow") === 0) return true;
    return false;
  }

  function timeStartMins(raw) {
    var s = String(raw || "");
    var m = s.match(/(\d{1,2})[:.](\d{2})/);
    if (!m) return 24 * 60;
    var h = Number(m[1]);
    var min = Number(m[2]);
    if (h >= 1 && h <= 7) h += 12;
    return h * 60 + min;
  }

  function firstNameFrom(data) {
    var p = (data && data.participant) || {};
    var n = clean(p.first_name || p.display_name || "Your child");
    return n.split(/\s+/)[0] || "Your child";
  }

  function servicesDetail(data) {
    if (data && data.general && Array.isArray(data.general.services_detail)) {
      return data.general.services_detail;
    }
    if (data && Array.isArray(data.services_detail)) return data.services_detail;
    return [];
  }

  function expectedKeys(data, iso) {
    var day = weekdayName(iso).toLowerCase();
    var keys = [];
    var seen = Object.create(null);
    servicesDetail(data).forEach(function (slot) {
      if (clean(slot && slot.day).toLowerCase() !== day) return;
      var key = programmeKey(slot && (slot.label || slot.service));
      if (!key || key === "daycentre" || seen[key]) return;
      seen[key] = true;
      keys.push(key);
    });
    return keys;
  }

  function joinTitles(titles) {
    var uniq = [];
    titles.forEach(function (t) {
      if (t && uniq.indexOf(t) < 0) uniq.push(t);
    });
    if (!uniq.length) return "Session";
    if (uniq.length === 1) return uniq[0];
    if (uniq.length === 2) return uniq[0] + " and " + uniq[1];
    return uniq.slice(0, -1).join(", ") + " and " + uniq[uniq.length - 1];
  }

  function buildSessionNotes(data) {
    var sessions = Array.isArray(data && data.sessions) ? data.sessions : [];
    var byDate = Object.create(null);
    sessions.forEach(function (row) {
      if (!row) return;
      if (programmeKey(row.service) === "daycentre") return;
      var iso = isoDate(row.session_date);
      if (!iso) return;
      if (!byDate[iso]) byDate[iso] = [];
      byDate[iso].push(row);
    });
    var first = firstNameFrom(data);
    var notes = [];
    Object.keys(byDate).forEach(function (iso) {
      var rows = byDate[iso].slice().sort(function (a, b) {
        return timeStartMins(a.session_time) - timeStartMins(b.session_time);
      });
      var expect = expectedKeys(data, iso);
      var ready = rows.filter(function (row) {
        return rowAbsent(row) || (!row.message_pending && parentText(row));
      });
      var blocked = rows.some(function (row) {
        return !rowAbsent(row) && (row.message_pending || !parentText(row));
      });
      if (blocked) return;
      if (expect.length) {
        var missing = expect.some(function (key) {
          return !ready.some(function (row) {
            return covers(key, programmeKey(row.service));
          });
        });
        if (missing) return;
      }
      if (!ready.length) return;
      var allAbsent = ready.every(rowAbsent);
      var paragraphs = allAbsent
        ? [first + " did not attend the session."]
        : ready.map(function (row) {
            if (rowAbsent(row)) return first + " did not attend this part of the session.";
            return parentText(row);
          });
      var keys = [];
      ready.forEach(function (row) {
        var key = programmeKey(row.service) || "session";
        if (keys.indexOf(key) < 0) keys.push(key);
      });
      keys.sort();
      var noteKey = iso + "|" + keys.join("+");
      notes.push({
        id: "s:" + noteKey,
        kind: "session",
        note_key: noteKey,
        session_date: iso,
        title: joinTitles(ready.map(function (row) { return serviceTitle(row.service); })) + " · " + dmy(iso),
        paragraphs: paragraphs.filter(Boolean),
        counts_for_badge: iso >= BADGE_FROM,
      });
    });
    notes.sort(function (a, b) {
      return String(b.session_date).localeCompare(String(a.session_date));
    });
    return notes;
  }

  function weeklyNoteCard(note) {
    var start = isoDate(note && note.week_start);
    var end = isoDate(note && note.week_end);
    var full = String((note && note.body) || "").trim();
    var paragraphs = full
      .split(/\n\s*\n/)
      .map(function (p) { return p.replace(/\s+/g, " ").trim(); })
      .filter(Boolean);
    if (!paragraphs.length && full) paragraphs = [full.replace(/\s+/g, " ").trim()];
    var title = "Day Centre";
    if (start && end) title += " · " + dmy(start) + " - " + dmy(end);
    else if (start) title += " · " + dmy(start);
    return {
      id: "w:" + (start || clean(note && note.id)),
      kind: "weekly",
      note_key: "week:" + start,
      session_date: end || start,
      title: title,
      paragraphs: paragraphs,
      counts_for_badge: !!(start && start >= WEEKLY_BADGE_FROM),
    };
  }

  function buildParentNotes(data) {
    var weekly = Array.isArray(data && data.weekly_notes) ? data.weekly_notes : [];
    var cards = buildSessionNotes(data).concat(weekly.map(weeklyNoteCard));
    cards.sort(function (a, b) {
      return String(b.session_date || "").localeCompare(String(a.session_date || ""));
    });
    return cards;
  }

  function unreadCount(notes, seen) {
    seen = seen || {};
    var n = 0;
    (notes || []).forEach(function (note) {
      if (!note || !note.counts_for_badge) return;
      if (!seen[note.id]) n += 1;
    });
    return n;
  }

  return {
    BADGE_FROM: BADGE_FROM,
    dmy: dmy,
    buildSessionNotes: buildSessionNotes,
    buildParentNotes: buildParentNotes,
    unreadCount: unreadCount,
    parentText: parentText,
  };
});
