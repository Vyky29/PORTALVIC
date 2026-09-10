/**
 * LOCAL Term timetable — Staff hours (whole term) + optional sessions board.
 * Open: http://127.0.0.1:8765/term_timetable_local.html
 */
(function (global) {
  "use strict";

  var DAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  var SERVICE_FILTERS = [
    { id: "all", label: "All" },
    { id: "day_centre", label: "Day Centre" },
    { id: "pool", label: "Pool / aquatic" },
    { id: "bespoke", label: "Bespoke" },
  ];
  var DRAFT_KEY = "term_timetable_local_hours_draft_v1";
  var TERM_FROM = "2026-09-01";
  var TERM_TO = "2026-12-17";

  var state = {
    tab: "sessions",
    day: "Monday",
    service: "all",
    drafts: loadDrafts(),
    selectedKey: "",
    selectedSeat: null,
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  function saveDrafts() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state.drafts));
    } catch (_) {}
  }

  function staffHoursRoot() {
    var P = global.PORTAL_AUTUMN_STAFF_HOURS;
    if (!P) return null;
    return P.staffHours || P;
  }

  function sheetForDay(day) {
    var root = staffHoursRoot();
    if (!root) return null;
    return root[day] || null;
  }

  function cellMatchesService(cell, sf) {
    if (sf === "all") return true;
    var band = String((cell && cell.band) || "").toLowerCase();
    if (sf === "pool") return band === "pool" || band === "aquatic" || !band;
    if (sf === "day_centre") return band === "day_centre" || band === "dc";
    if (sf === "bespoke") return band === "bespoke";
    return true;
  }

  function cellText(cell) {
    if (!cell) return "";
    var k = cell.editKey;
    if (k && state.drafts[k] != null) return String(state.drafts[k]);
    return String(cell.text || "");
  }

  /** "Javi 4-6" / "Dan 4.30-6.30" / "Victor 11-4 Office" → name + time rows. */
  function splitNameTime(text) {
    var raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return { name: "", time: "" };
    var m = raw.match(
      /^(.+?)\s+(\d{1,2}(?:[.:]\d{2})?\s*-\s*\d{1,2}(?:[.:]\d{2})?)(.*)$/,
    );
    if (!m) return { name: raw, time: "" };
    var name = String(m[1] || "").trim();
    var time = String(m[2] || "").replace(/\s+/g, "");
    var extra = String(m[3] || "").trim();
    if (extra) time = time + " " + extra;
    return { name: name, time: time };
  }

  function cellTwoLineHtml(text, opts) {
    opts = opts || {};
    var parts = splitNameTime(text);
    if (!parts.name && !parts.time) {
      return '<span class="ttl-cell__empty">·</span>';
    }
    if (!parts.time) {
      return (
        '<span class="ttl-cell__name">' +
        esc(parts.name) +
        "</span>"
      );
    }
    return (
      '<span class="ttl-cell__name">' +
      esc(parts.name) +
      '</span><span class="ttl-cell__time">' +
      esc(parts.time) +
      "</span>"
    );
  }

  function termDates(sheet) {
    return (sheet && sheet.dates ? sheet.dates : []).filter(function (dr) {
      var iso = String((dr && dr.date) || "").slice(0, 10);
      return iso >= TERM_FROM && iso <= TERM_TO;
    });
  }

  function flattenVenueLabels(groups) {
    var labels = [];
    (groups || []).forEach(function (g) {
      var span = Number(g.span) || 1;
      for (var i = 0; i < span; i++) {
        labels.push({
          venue: g.venue || "",
          style: g.style || "default",
          idx: i,
        });
      }
    });
    return labels;
  }

  function venueServiceUnderName(style) {
    var st = String(style || "");
    if (st === "northolt" || st === "acton") return "Aquatic Activity";
    if (st === "westway") return "Climbing Activity";
    return "";
  }

  function columnServiceFromCell(venueStyle, cell) {
    var st = String(venueStyle || "");
    if (st === "northolt" || st === "acton") return "Aquatic Activity";
    if (st === "westway") return "Climbing Activity";
    if (st.indexOf("swimfarm") < 0) return venueServiceUnderName(st) || "";
    var band = String((cell && cell.band) || "")
      .toLowerCase()
      .trim();
    var text = String((cell && cell.text) || "");
    if (/\b4\.15\s*-\s*6\.15\b/.test(text) || /\b4\.15-6\.15\b/.test(text)) {
      return "Bespoke";
    }
    if (band === "bespoke") return "Bespoke";
    if (band === "day_centre" || band === "dc") return "Day Centre";
    if (band === "pool" && /4\.15/.test(text)) return "Bespoke";
    if (band === "pool" || band === "other" || !band) return "Day Centre";
    return "Day Centre";
  }

  /** Majority service label per column (from dated cells). */
  function inferColumnServices(groups, dates) {
    var labels = flattenVenueLabels(groups);
    return labels.map(function (lab, i) {
      var counts = Object.create(null);
      (dates || []).forEach(function (dr) {
        var cell = (dr.cells || [])[i];
        if (!cell) return;
        var raw = String(cell.text || "").trim();
        if (!raw && !(cell.band || "").trim()) return;
        var svc = columnServiceFromCell(lab.style, cell);
        if (!svc) return;
        counts[svc] = (counts[svc] || 0) + 1;
      });
      var best = "";
      var bestN = 0;
      Object.keys(counts).forEach(function (k) {
        if (counts[k] > bestN) {
          bestN = counts[k];
          best = k;
        }
      });
      if (best) return best;
      return venueServiceUnderName(lab.style) ||
        (String(lab.style || "").indexOf("swimfarm") >= 0 ? "Day Centre" : "");
    });
  }

  function serviceHeaderSegments(groups, columnServices) {
    var segs = [];
    var col = 0;
    (groups || []).forEach(function (g) {
      var span = Number(g.span) || 1;
      var i = 0;
      while (i < span) {
        var svc = columnServices[col + i] || "";
        var run = 1;
        while (i + run < span && columnServices[col + i + run] === svc) run += 1;
        segs.push({
          label: svc,
          span: run,
          style: g.style || "default",
          start: i === 0,
        });
        i += run;
      }
      col += span;
    });
    return segs;
  }

  function icoCalendar() {
    return (
      '<svg class="ttl-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M8 3v4M16 3v4M3 11h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      "</svg>"
    );
  }

  function icoVenue(style) {
    var s = String(style || "");
    if (s === "northolt" || s === "acton") {
      return (
        '<svg class="ttl-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M4 20V9l8-5 8 5v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
        '<path d="M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="2"/>' +
        "</svg>"
      );
    }
    if (s.indexOf("swimfarm") >= 0) {
      return (
        '<svg class="ttl-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M3 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<path d="M3 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        "</svg>"
      );
    }
    return (
      '<svg class="ttl-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z" fill="none" stroke="currentColor" stroke-width="2"/>' +
      '<circle cx="12" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
      "</svg>"
    );
  }

  function renderTabs() {
    return (
      '<div class="ttl-tabs">' +
      '<button type="button" class="ttl-tab' +
      (state.tab === "sessions" ? " is-on" : "") +
      '" data-tab="sessions">Who is booked</button>' +
      '<button type="button" class="ttl-tab' +
      (state.tab === "hours" ? " is-on" : "") +
      '" data-tab="hours">Who works (term)</button>' +
      "</div>"
    );
  }

  function renderDayServiceChips() {
    var dayBtns = DAYS.map(function (d) {
      return (
        '<button type="button" class="ttl-chip' +
        (state.day === d ? " is-on" : "") +
        '" data-day="' +
        esc(d) +
        '">' +
        esc(d.slice(0, 3)) +
        "</button>"
      );
    }).join("");
    var svcBtns = SERVICE_FILTERS.map(function (f) {
      return (
        '<button type="button" class="ttl-chip ttl-chip--soft' +
        (state.service === f.id ? " is-on" : "") +
        '" data-service="' +
        esc(f.id) +
        '">' +
        esc(f.label) +
        "</button>"
      );
    }).join("");
    return (
      '<div class="ttl-row">' +
      dayBtns +
      "</div>" +
      '<div class="ttl-row">' +
      svcBtns +
      "</div>"
    );
  }

  function renderHoursTermTable() {
    var sheet = sheetForDay(state.day);
    if (!sheet || sheet.placeholder) {
      return (
        '<p class="ttl-empty">No staff hours sheet for ' +
        esc(state.day) +
        ".</p>"
      );
    }
    var dates = termDates(sheet);
    var groups = sheet.venueGroups || [];
    var labels = flattenVenueLabels(groups);
    if (!dates.length) {
      return '<p class="ttl-empty">No Autumn dates for this weekday.</p>';
    }

    var filtered = dates.filter(function (dr) {
      if (state.service === "all") return true;
      return (dr.cells || []).some(function (c) {
        return cellMatchesService(c, state.service) && cellText(c);
      });
    });

    var columnServices = inferColumnServices(groups, dates);
    var svcSegs = serviceHeaderSegments(groups, columnServices);

    var headVenues = "";
    groups.forEach(function (g) {
      var st = g.style || "default";
      var under = venueServiceUnderName(st);
      headVenues +=
        '<th colspan="' +
        (Number(g.span) || 1) +
        '" class="ttl-v--' +
        esc(st) +
        ' ttl-v-start"><span class="ttl-head">' +
        icoVenue(st) +
        '<span class="ttl-head__stack"><span class="ttl-head__venue">' +
        esc(g.venue || "") +
        "</span>" +
        (under
          ? '<span class="ttl-head__svc">' + esc(under) + "</span>"
          : String(st).indexOf("swimfarm") >= 0
            ? '<span class="ttl-head__svc">Day Centre · Bespoke</span>'
            : "") +
        "</span></span></th>";
    });

    var headServices = "";
    svcSegs.forEach(function (seg) {
      headServices +=
        '<th colspan="' +
        seg.span +
        '" class="ttl-svc ttl-v--' +
        esc(seg.style) +
        (seg.start ? " ttl-v-start" : "") +
        '">' +
        esc(seg.label || "") +
        "</th>";
    });

    var rowsHtml = filtered
      .map(function (dr) {
        var cells = dr.cells || [];
        var tds = labels
          .map(function (lab, i) {
            var cell = cells[i] || { text: "", editKey: "" };
            var tdCls =
              "ttl-v-body--" +
              esc(lab.style || "default") +
              (lab.idx === 0 ? " ttl-v-start" : "");
            if (state.service !== "all" && !cellMatchesService(cell, state.service)) {
              return '<td class="' + tdCls + ' ttl-muted">—</td>';
            }
            var text = cellText(cell);
            var draft = cell.editKey && state.drafts[cell.editKey] != null;
            var key = cell.editKey || "";
            if (!key) {
              return (
                '<td class="' +
                tdCls +
                '"><span class="ttl-cell-ro">' +
                cellTwoLineHtml(text) +
                "</span></td>"
              );
            }
            return (
              '<td class="' +
              tdCls +
              '"><button type="button" class="ttl-cell' +
              (draft ? " is-draft" : "") +
              (text ? "" : " is-empty") +
              '" data-edit-key="' +
              esc(key) +
              '" title="' +
              esc(text || key) +
              '">' +
              cellTwoLineHtml(text) +
              "</button></td>"
            );
          })
          .join("");
        return (
          "<tr><th class=\"ttl-date\">" +
          esc(dr.label || dr.date) +
          "</th>" +
          tds +
          "</tr>"
        );
      })
      .join("");

    return (
      '<p class="ttl-meta">' +
      esc(state.day) +
      " · " +
      filtered.length +
      " dates in Autumn term (1 Sep – 17 Dec) · click a cell to edit locally</p>" +
      '<div class="ttl-scroll"><table class="ttl-hours">' +
      "<thead><tr><th class=\"ttl-date\" rowspan=\"2\"><span class=\"ttl-head\">" +
      icoCalendar() +
      "<span>Dates</span></span></th>" +
      headVenues +
      "</tr><tr>" +
      headServices +
      "</tr></thead><tbody>" +
      rowsHtml +
      "</tbody></table></div>"
    );
  }

  /* ---- Sessions board (secondary) ---- */
  function serviceBucket(svc) {
    var s = String(svc || "").toLowerCase();
    if (/day\s*centre/.test(s)) return "day_centre";
    if (/aquatic|swim/.test(s)) return "aquatic";
    if (/climb/.test(s)) return "climbing";
    if (/physical|fitness/.test(s)) return "physical";
    if (/multi/.test(s)) return "multi";
    if (/bespoke/.test(s)) return "bespoke";
    return "other";
  }

  function splitInstructors(raw) {
    return String(raw || "")
      .split(/[,/|]+/)
      .map(function (x) {
        return x.trim();
      })
      .filter(Boolean);
  }

  function parseStartMin(timeSlot) {
    var raw = String(timeSlot || "")
      .replace(/\s*-\s*/g, " to ")
      .replace(/[–—]/g, " to ")
      .trim();
    var m = raw.match(/(\d{1,2})(?:[.:](\d{2}))?/);
    if (!m) return 0;
    var h = Number(m[1]);
    var min = Number(m[2] || 0);
    if (h < 7) h += 12;
    return h * 60 + min;
  }

  function isJulStandingStamp(iso) {
    return /^2026-07-1[1-7]$/.test(String(iso || ""));
  }

  function autumnAnchorForWeekday(dayName) {
    var want = String(dayName || "").trim();
    var d = new Date(2026, 8, 1);
    for (var i = 0; i < 14; i++) {
      var long = [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ][d.getDay()];
      if (long === want) {
        var m = d.getMonth() + 1;
        var day = d.getDate();
        return (
          "2026-" +
          (m < 10 ? "0" : "") +
          m +
          "-" +
          (day < 10 ? "0" : "") +
          day
        );
      }
      d.setDate(d.getDate() + 1);
    }
    return "2026-09-01";
  }

  function seatMatchesService(r) {
    if (state.service === "all") return true;
    var bucket = serviceBucket(r && r.service);
    if (state.service === "day_centre") return bucket === "day_centre";
    if (state.service === "pool") return bucket === "aquatic";
    if (state.service === "bespoke") return bucket === "bespoke";
    return true;
  }

  function sessionRows() {
    var PRC = global.PortalRosterCanonical;
    if (!PRC || typeof PRC.resolveCanonicalRosterRows !== "function") return [];
    var all = PRC.resolveCanonicalRosterRows({ skipDb: true }) || [];
    var list = [];
    all.forEach(function (r) {
      if (!r || String(r.day || "") !== state.day) return;
      var sd = String(r.session_date || "").slice(0, 10);
      if (sd && !isJulStandingStamp(sd) && /^2026-09-/.test(sd)) return;
      if (!seatMatchesService(r)) return;
      list.push(r);
    });
    list.sort(function (a, b) {
      return (
        parseStartMin(a.time_slot) - parseStartMin(b.time_slot) ||
        String(a.client_name || "").localeCompare(String(b.client_name || ""))
      );
    });
    return list;
  }

  function seatPrefill(r) {
    return {
      anchorDate: autumnAnchorForWeekday(state.day),
      client_name: String((r && r.client_name) || "").trim(),
      service: String((r && r.service) || "").trim(),
      time_slot: String((r && r.time_slot) || "").trim(),
      instructors: String((r && r.instructors) || "").trim(),
      venue: String((r && r.venue) || "").trim(),
      area: String((r && r.area) || "").trim(),
      scope: "weekday_term",
      action: "update",
    };
  }

  function seatKey(r, instr) {
    return [
      String((r && r.client_name) || ""),
      String((r && r.time_slot) || ""),
      String(instr || r.instructors || ""),
      String((r && r.venue) || ""),
    ].join("|");
  }

  function renderSessionsBoard() {
    var rows = sessionRows();
    var order = [];
    var map = Object.create(null);
    rows.forEach(function (r) {
      var names = splitInstructors(r.instructors);
      if (!names.length) names = ["Unassigned"];
      names.forEach(function (name) {
        var key = name.toLowerCase();
        if (!map[key]) {
          map[key] = { name: name, cards: [] };
          order.push(key);
        }
        map[key].cards.push({ row: r, instr: name });
      });
    });
    if (!order.length) {
      return '<p class="ttl-empty">No standing seats for ' + esc(state.day) + ".</p>";
    }
    return (
      '<p class="ttl-meta"><strong>Who is booked</strong> — standing week seats (same roster as Services). Click a card to preview the Edit term slot prefill (every matching weekday). One-day covers stay in Schedule &amp; Covers.</p>' +
      '<div class="ttl-board">' +
      order
        .map(function (k) {
          var col = map[k];
          return (
            '<section class="ttl-col"><header class="ttl-col__head">' +
            esc(col.name) +
            "</header><div class=\"ttl-col__body\">" +
            col.cards
              .map(function (item) {
                var r = item.row;
                var sk = seatKey(r, item.instr);
                var on =
                  state.selectedSeat &&
                  seatKey(state.selectedSeat.row, state.selectedSeat.instr) === sk;
                return (
                  '<button type="button" class="ttl-card-ro' +
                  (on ? " is-on" : "") +
                  '" data-seat-key="' +
                  esc(sk) +
                  '"><div class="ttl-card__svc">' +
                  esc(r.service || "") +
                  '</div><div class="ttl-card__who">' +
                  esc(r.client_name || "") +
                  '</div><div class="ttl-card__meta">' +
                  esc(r.time_slot || "") +
                  " · " +
                  esc(r.venue || "") +
                  "</div></button>"
                );
              })
              .join("") +
            "</div></section>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderHoursDrawer(el, key) {
    var parts = key.split("|");
    var cur = state.drafts[key];
    if (cur == null) {
      var sheet = sheetForDay(parts[1] || state.day);
      var found = "";
      (termDates(sheet) || []).forEach(function (dr) {
        (dr.cells || []).forEach(function (c) {
          if (c.editKey === key) found = c.text || "";
        });
      });
      cur = found;
    }
    el.innerHTML =
      '<div class="ttl-drawer__panel">' +
      '<div class="ttl-drawer__head"><strong>Edit hours cell</strong>' +
      '<button type="button" class="ttl-btn ttl-btn--ghost" id="ttlClose">Close</button></div>' +
      '<p class="ttl-drawer__note">LOCAL draft only. Format like standing sheet: <code>Roberto 11-3</code> / <code>Victor 11-4 Office</code>. Admin Who works saves to <code>portal_staff_timetable_cells</code>.</p>' +
      '<p class="ttl-drawer__note"><strong>' +
      esc(parts[0] || "") +
      "</strong> · " +
      esc(parts[1] || "") +
      " · " +
      esc(parts.slice(2).join("|") || "") +
      "</p>" +
      '<label class="ttl-field">Who works / hours<input id="ttlHoursVal" value="' +
      esc(cur) +
      '" /></label>' +
      '<div class="ttl-drawer__actions">' +
      '<button type="button" class="ttl-btn ttl-btn--pri" id="ttlSave">Save local draft</button>' +
      '<button type="button" class="ttl-btn" id="ttlRevert">Revert</button>' +
      "</div></div>" +
      '<button type="button" class="ttl-drawer__scrim" id="ttlScrim" aria-label="Close"></button>';
  }

  function renderSeatDrawer(el, seat) {
    var r = seat.row || {};
    var pre = seatPrefill(
      Object.assign({}, r, { instructors: seat.instr || r.instructors }),
    );
    el.innerHTML =
      '<div class="ttl-drawer__panel">' +
      '<div class="ttl-drawer__head"><strong>Who is booked → Edit term slot</strong>' +
      '<button type="button" class="ttl-btn ttl-btn--ghost" id="ttlClose">Close</button></div>' +
      '<p class="ttl-drawer__note">LOCAL preview only. In <strong>admin → Instructor timetable → Who is booked</strong>, this click opens the real Edit term slot with the same fields (scope = every matching weekday).</p>' +
      '<label class="ttl-field">Anchor date<input readonly value="' +
      esc(pre.anchorDate) +
      '" /></label>' +
      '<label class="ttl-field">Participant<input readonly value="' +
      esc(pre.client_name) +
      '" /></label>' +
      '<label class="ttl-field">Service<input readonly value="' +
      esc(pre.service) +
      '" /></label>' +
      '<label class="ttl-field">Time slot<input readonly value="' +
      esc(pre.time_slot) +
      '" /></label>' +
      '<label class="ttl-field">Instructor(s)<input readonly value="' +
      esc(pre.instructors) +
      '" /></label>' +
      '<label class="ttl-field">Venue<input readonly value="' +
      esc(pre.venue) +
      '" /></label>' +
      '<label class="ttl-field">Pool / area<input readonly value="' +
      esc(pre.area) +
      '" /></label>' +
      '<label class="ttl-field">Apply to<input readonly value="weekday_term (every ' +
      esc(state.day) +
      ')" /></label>' +
      '<div class="ttl-drawer__actions">' +
      '<button type="button" class="ttl-btn" id="ttlClose2">Close</button>' +
      "</div></div>" +
      '<button type="button" class="ttl-drawer__scrim" id="ttlScrim" aria-label="Close"></button>';
  }

  function renderDrawer() {
    var el = document.getElementById("ttlDrawer");
    if (!el) return;
    if (state.selectedSeat) {
      el.hidden = false;
      renderSeatDrawer(el, state.selectedSeat);
      return;
    }
    var key = state.selectedKey;
    if (!key) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    renderHoursDrawer(el, key);
  }

  function paint() {
    var toolbar = document.getElementById("ttlToolbar");
    var board = document.getElementById("ttlBoard");
    if (!toolbar || !board) return;
    toolbar.innerHTML =
      renderTabs() +
      renderDayServiceChips() +
      (state.tab === "hours"
        ? '<div class="ttl-row"><button type="button" class="ttl-btn" id="ttlClearDrafts">Clear local drafts</button></div>'
        : "");
    board.innerHTML =
      state.tab === "hours" ? renderHoursTermTable() : renderSessionsBoard();
    renderDrawer();
    bind();
  }

  function findSeatByKey(sk) {
    var rows = sessionRows();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var names = splitInstructors(r.instructors);
      if (!names.length) names = ["Unassigned"];
      for (var j = 0; j < names.length; j++) {
        if (seatKey(r, names[j]) === sk) {
          return { row: r, instr: names[j] };
        }
      }
    }
    return null;
  }

  function bind() {
    document.querySelectorAll("[data-tab]").forEach(function (btn) {
      btn.onclick = function () {
        state.tab = btn.getAttribute("data-tab") || "sessions";
        state.selectedKey = "";
        state.selectedSeat = null;
        paint();
      };
    });
    document.querySelectorAll("[data-day]").forEach(function (btn) {
      btn.onclick = function () {
        state.day = btn.getAttribute("data-day") || "Monday";
        state.selectedKey = "";
        state.selectedSeat = null;
        paint();
      };
    });
    document.querySelectorAll("[data-service]").forEach(function (btn) {
      btn.onclick = function () {
        state.service = btn.getAttribute("data-service") || "all";
        state.selectedSeat = null;
        paint();
      };
    });
    document.querySelectorAll("[data-edit-key]").forEach(function (btn) {
      btn.onclick = function () {
        state.selectedSeat = null;
        state.selectedKey = btn.getAttribute("data-edit-key") || "";
        paint();
      };
    });
    document.querySelectorAll("[data-seat-key]").forEach(function (btn) {
      btn.onclick = function () {
        state.selectedKey = "";
        state.selectedSeat = findSeatByKey(btn.getAttribute("data-seat-key") || "");
        paint();
      };
    });
    var clear = document.getElementById("ttlClearDrafts");
    if (clear) {
      clear.onclick = function () {
        state.drafts = {};
        saveDrafts();
        paint();
      };
    }
    function close() {
      state.selectedKey = "";
      state.selectedSeat = null;
      paint();
    }
    var c = document.getElementById("ttlClose");
    var c2 = document.getElementById("ttlClose2");
    var s = document.getElementById("ttlScrim");
    if (c) c.onclick = close;
    if (c2) c2.onclick = close;
    if (s) s.onclick = close;
    var save = document.getElementById("ttlSave");
    if (save) {
      save.onclick = function () {
        var v = document.getElementById("ttlHoursVal");
        if (!state.selectedKey || !v) return;
        state.drafts[state.selectedKey] = v.value;
        saveDrafts();
        paint();
      };
    }
    var rev = document.getElementById("ttlRevert");
    if (rev) {
      rev.onclick = function () {
        delete state.drafts[state.selectedKey];
        saveDrafts();
        paint();
      };
    }
  }

  function boot() {
    var today = new Date();
    var dow = today.getDay();
    state.day = DAYS[dow === 0 ? 6 : dow - 1] || "Monday";
    paint();
  }

  global.TermTimetableLocal = { boot: boot, paint: paint };
})(typeof window !== "undefined" ? window : globalThis);
