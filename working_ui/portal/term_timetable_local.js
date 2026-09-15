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
    { id: "pool", label: "Afterschool & weekends" },
    { id: "bespoke", label: "Bespoke" },
  ];
  var DRAFT_KEY = "term_timetable_local_hours_draft_v1";
  var TERM_FROM = "2026-09-01";
  var TERM_TO = "2026-12-17";

  var state = {
    tab: "hours",
    day: "Monday",
    service: "all",
    drafts: loadDrafts(),
    selectedKey: "",
    selectedSeat: null,
    /** iso YYYY-MM-DD -> [{ key, label }] from staff_unavailability snap */
    dayOffByDate: Object.create(null),
    dayOffLoaded: false,
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
    if (/^closed$/i.test(parts.name) && !parts.time) {
      return '<span class="ttl-cell__closed">CLOSED</span>';
    }
    var shadow = "";
    var timeShow = parts.time;
    var sm = String(parts.time || "").match(/^(.*?)(?:\s+)(SHADOWING)\s*$/i);
    if (sm) {
      timeShow = String(sm[1] || "").trim();
      shadow = String(sm[2] || "SHADOWING").toUpperCase();
    }
    var badge = "";
    if (opts.cover) {
      badge =
        '<span class="ttl-cover-badge" title="Cover for day off (Dates column)">Cover</span>';
    } else if (opts.away) {
      badge =
        '<span class="ttl-dayoff-badge" title="Day off — no cover named in reason">Day off</span>';
    }
    if (!timeShow && !shadow) {
      return (
        '<span class="ttl-cell__name">' +
        esc(parts.name) +
        "</span>" +
        badge
      );
    }
    return (
      '<span class="ttl-cell__name">' +
      esc(parts.name) +
      "</span>" +
      (timeShow
        ? '<span class="ttl-cell__time">' + esc(timeShow) + "</span>"
        : "") +
      (shadow
        ? '<span class="ttl-cell__shadow">' + esc(shadow) + "</span>"
        : "") +
      badge
    );
  }

  function staffNameKey(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z]/g, "");
  }

  function dayOffsForIso(iso) {
    return state.dayOffByDate[String(iso || "").slice(0, 10)] || [];
  }

  /** Dates chip: first name only (Aurora Garcia → Aurora). */
  function dayOffDisplayName(label) {
    var raw = String(label || "").replace(/\s+/g, " ").trim();
    if (!raw) return "";
    return raw.split(/\s+/)[0] || raw;
  }

  function dayOffEntryForStaff(staffRaw, iso) {
    var key = staffNameKey(staffRaw);
    if (!key) return null;
    var found = null;
    dayOffsForIso(iso).some(function (x) {
      var ok = staffNameKey(x.key || x.label || "");
      if (!ok) return false;
      if (ok === key || ok.indexOf(key) === 0 || key.indexOf(ok) === 0) {
        found = x;
        return true;
      }
      return false;
    });
    return found;
  }

  function staffAwayOnIso(staffRaw, iso) {
    return !!dayOffEntryForStaff(staffRaw, iso);
  }

  /** Dates column = who requested off. Work cell = cover on rota (same hours). */
  function applyCoverOnRota(text, iso) {
    var parts = splitNameTime(text);
    if (!parts.name || !iso) {
      return { text: text, cover: false, awayNoCover: false };
    }
    var off = dayOffEntryForStaff(parts.name, iso);
    if (!off) return { text: text, cover: false, awayNoCover: false };
    var cover = String(off.coverName || "").trim();
    if (!cover) {
      return { text: text, cover: false, awayNoCover: true };
    }
    var next = cover + (parts.time ? " " + parts.time : "");
    return { text: next, cover: true, awayNoCover: false };
  }

  function dateDayOffChipsHtml(iso) {
    var offs = dayOffsForIso(iso);
    if (!offs.length) return "";
    return (
      '<div class="ttl-date-dayoffs" title="Who requested day off (staff_unavailability)">' +
      offs
        .map(function (o) {
          return (
            '<span class="ttl-dayoff-chip">' +
            '<span class="ttl-dayoff-chip__name">' +
            esc(dayOffDisplayName(o.label || o.key)) +
            "</span>" +
            '<span class="ttl-dayoff-chip__label">Day off</span>' +
            "</span>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function loadDayOffs() {
    return fetch("/portal/_local_staff_unavailability.json?v=" + Date.now(), {
      cache: "no-store",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("no_snap");
        return res.json();
      })
      .then(function (data) {
        state.dayOffByDate =
          data && data.byDate ? data.byDate : Object.create(null);
        state.dayOffLoaded = true;
      })
      .catch(function () {
        state.dayOffByDate = Object.create(null);
        state.dayOffLoaded = false;
      });
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
    if (st === "westway") return "Fitness";
    return "";
  }

  /**
   * Sunday SwimFarm Who-works seats:
   * - Aquatic (3): Aurora, Javier, Roberto — also duplicated into Multi.
   * - Multi (6): Hub Berta / Emmanuel|John / Godsway + the 3 aquatic instructors.
   */
  var SUNDAY_SF_AQUATIC = {
    aurora: 1,
    javier: 1,
    javi: 1,
    roberto: 1,
  };
  var SUNDAY_SF_MULTI_HUB = {
    berta: 1,
    emmanuel: 1,
    godsway: 1,
    john: 1,
  };

  function staffKeyFromHoursText(text) {
    var m = String(text || "")
      .trim()
      .match(/^([A-Za-z]+)/);
    return m ? m[1].toLowerCase() : "";
  }

  function cellIsOffice(text, band) {
    if (String(band || "").toLowerCase() === "office") return true;
    return /\boffice\b/i.test(String(text || ""));
  }

  function columnServiceFromCell(venueStyle, cell, dayName) {
    var st = String(venueStyle || "");
    var day = String(dayName || "").toLowerCase();
    var band = String((cell && cell.band) || "")
      .toLowerCase()
      .trim();
    var text = String((cell && cell.text) || "");
    var closed = /^closed$/i.test(text.trim());
    if (st === "northolt" || st === "acton") return "Aquatic Activity";
    if (st === "westway") {
      /* Weekday Sandra = Fitness/Physical; Sunday Alex/Carlos = Climbing. */
      if (day === "sunday") return "Climbing";
      return "Fitness";
    }
    if (st.indexOf("swimfarm") < 0) return venueServiceUnderName(st) || "";
    if (day === "saturday") {
      return "Aquatic Activity";
    }
    if (day === "sunday") {
      if (band === "day_centre" || band === "dc") return "Day Centre";
      if (band === "bespoke" || /\b4\.15-6\.15\b/.test(text)) return "Bespoke";
      var who = staffKeyFromHoursText(text);
      if (SUNDAY_SF_AQUATIC[who]) return "Aquatic Activity";
      if (SUNDAY_SF_MULTI_HUB[who]) return "Multi-Activity";
      if (closed && band === "pool") return "Aquatic Activity";
      return "Multi-Activity";
    }
    /* Office stays under Day Centre service; seat header says Office (not Seat N). */
    if (closed) {
      if (band === "bespoke") return "Bespoke";
      if (band === "pool" || band === "aquatic") return "Aquatic Activity";
      if (band === "day_centre" || band === "dc" || band === "office")
        return "Day Centre";
    }
    if (
      /\b4\.15\s*-\s*6\.15\b/.test(text) ||
      /\b4\.15-6\.15\b/.test(text) ||
      /\b3\.30\s*-\s*5\b/.test(text) ||
      /\b3\.30-5\b/.test(text)
    ) {
      return "Bespoke";
    }
    if (band === "bespoke") return "Bespoke";
    if (band === "day_centre" || band === "dc" || band === "office")
      return "Day Centre";
    if (cellIsOffice(text, band)) return "Day Centre";
    /* Hub Bespoke only — do NOT match Michelle DC paid band 10.45-4.15 */
    if (band === "pool" && /\b4\.15\s*-\s*6\.15\b/.test(text)) return "Bespoke";
    if (band === "pool" || band === "other" || !band) return "Day Centre";
    return "Day Centre";
  }

  /** Majority service label per column (from dated cells). */
  function inferColumnServices(groups, dates, dayName) {
    var labels = flattenVenueLabels(groups);
    return labels.map(function (lab, i) {
      var counts = Object.create(null);
      (dates || []).forEach(function (dr) {
        var cell = (dr.cells || [])[i];
        if (!cell) return;
        var raw = String(cell.text || "").trim();
        if (!raw && !(cell.band || "").trim()) return;
        var svc = columnServiceFromCell(lab.style, cell, dayName);
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
      var weekendSun = String(dayName || "").toLowerCase() === "sunday";
      var weekendSat = String(dayName || "").toLowerCase() === "saturday";
      if (String(lab.style || "").indexOf("swimfarm") >= 0) {
        if (weekendSat) return "Aquatic Activity";
        if (weekendSun) return "Aquatic & Multi-Activity";
        return "Day Centre";
      }
      return venueServiceUnderName(lab.style) || "";
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
          svcStart: true,
        });
        i += run;
      }
      col += span;
    });
    return segs;
  }

  function serviceSlug(label) {
    return String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /** Majority of dated cells in this column are Office duty. */
  function columnIsOfficeSeat(dates, colIdx) {
    var officeN = 0;
    var n = 0;
    (dates || []).forEach(function (dr) {
      var cell = (dr.cells || [])[colIdx];
      if (!cell) return;
      var raw = String(cell.text || "").trim();
      if (!raw) return;
      n += 1;
      if (cellIsOffice(raw, cell.band)) officeN += 1;
    });
    return n > 0 && officeN * 2 >= n;
  }

  /** SwimFarm: Bespoke, then Day Centre / Aquatic / Multi. */
  function serviceSortRank(svc, venueStyle) {
    var s = String(svc || "");
    var st = String(venueStyle || "");
    if (st.indexOf("swimfarm") >= 0) {
      if (s === "Bespoke") return 0;
      if (s === "Aquatic Activity" || s === "Aquatic & Multi-Activity") return 1;
      if (s === "Multi-Activity" || s === "Day Centre") return 2;
      return 3;
    }
    return 0;
  }

  /**
   * Sunday SwimFarm: Aquatic instructors also occupy Multi seats
   * (3 Aquatic + 6 Multi = Hub trio + the same 3 aquatic columns).
   */
  function expandSundayAquaticIntoMulti(groups, dates, columnServices, dayName) {
    if (String(dayName || "").toLowerCase() !== "sunday") {
      return { groups: groups, dates: dates, columnServices: columnServices };
    }
    var aquaticIdx = [];
    var multiHubIdx = [];
    var otherByGroup = [];
    var col = 0;
    (groups || []).forEach(function (g, gi) {
      otherByGroup[gi] = [];
      var span = Number(g.span) || 1;
      var isSf = String(g.style || "").indexOf("swimfarm") >= 0;
      for (var i = 0; i < span; i++) {
        var idx = col + i;
        var svc = columnServices[idx] || "";
        if (!isSf) {
          otherByGroup[gi].push(idx);
          continue;
        }
        if (svc === "Aquatic Activity" || svc === "Aquatic & Multi-Activity") {
          aquaticIdx.push(idx);
        } else if (svc === "Multi-Activity") {
          multiHubIdx.push(idx);
        } else {
          otherByGroup[gi].push(idx);
        }
      }
      col += span;
    });
    if (!aquaticIdx.length) {
      return { groups: groups, dates: dates, columnServices: columnServices };
    }
    /* Multi seats = Hub first, then Aquatic instructors (also in Aquatic). */
    var multiIdx = multiHubIdx.concat(aquaticIdx);
    var aquaticInMultiFrom = multiHubIdx.length;
    var newGroups = [];
    var order = [];
    var newServices = [];
    col = 0;
    (groups || []).forEach(function (g, gi) {
      var span = Number(g.span) || 1;
      var isSf = String(g.style || "").indexOf("swimfarm") >= 0;
      if (!isSf) {
        var keep = otherByGroup[gi] || [];
        keep.forEach(function (oldIdx) {
          order.push(oldIdx);
          newServices.push(columnServices[oldIdx] || "");
        });
        newGroups.push(
          Object.assign({}, g, {
            span: keep.length,
            labels: keep.map(function () {
              return g.venue || "SwimFarm";
            }),
          }),
        );
        col += span;
        return;
      }
      var sfOrder = aquaticIdx.concat(multiIdx).concat(otherByGroup[gi] || []);
      sfOrder.forEach(function (oldIdx, j) {
        order.push(oldIdx);
        if (j < aquaticIdx.length) {
          newServices.push("Aquatic Activity");
        } else if (j < aquaticIdx.length + multiIdx.length) {
          newServices.push("Multi-Activity");
        } else {
          newServices.push(columnServices[oldIdx] || "");
        }
      });
      newGroups.push(
        Object.assign({}, g, {
          span: sfOrder.length,
          labels: sfOrder.map(function () {
            return g.venue || "SwimFarm";
          }),
        }),
      );
      col += span;
    });
    function cellWithMaHours(src) {
      /* Aquatic instructors keep the same hours in AA and MA columns. */
      return Object.assign({}, src);
    }
    var newDates = (dates || []).map(function (dr) {
      var cells = dr.cells || [];
      return Object.assign({}, dr, {
        cells: order.map(function (oldIdx, newCol) {
          var src = cells[oldIdx] || { text: "", editKey: "", band: "" };
          var aqCount = aquaticIdx.length;
          var multiCount = multiIdx.length;
          if (
            newCol >= aqCount &&
            newCol < aqCount + multiCount &&
            newCol - aqCount >= aquaticInMultiFrom
          ) {
            return cellWithMaHours(src);
          }
          return Object.assign({}, src);
        }),
      });
    });
    return { groups: newGroups, dates: newDates, columnServices: newServices };
  }

  function reorderColumnsByService(groups, dates, dayName) {
    var columnServices = inferColumnServices(groups, dates, dayName);
    var order = [];
    var col = 0;
    (groups || []).forEach(function (g) {
      var span = Number(g.span) || 1;
      var idxs = [];
      for (var i = 0; i < span; i++) idxs.push(col + i);
      idxs.sort(function (a, b) {
        var rank =
          serviceSortRank(columnServices[a], g.style) -
          serviceSortRank(columnServices[b], g.style);
        if (rank) return rank;
        /* Within Day Centre, Office seat first. */
        var oa =
          columnServices[a] === "Day Centre" && columnIsOfficeSeat(dates, a)
            ? 0
            : 1;
        var ob =
          columnServices[b] === "Day Centre" && columnIsOfficeSeat(dates, b)
            ? 0
            : 1;
        if (oa !== ob) return oa - ob;
        return a - b;
      });
      idxs.forEach(function (oldIdx) {
        order.push(oldIdx);
      });
      col += span;
    });
    var changed = order.some(function (oldIdx, newIdx) {
      return oldIdx !== newIdx;
    });
    var newServices = columnServices;
    var newDates = dates;
    var newGroups = groups;
    if (changed) {
      newServices = order.map(function (oldIdx) {
        return columnServices[oldIdx] || "";
      });
      newDates = (dates || []).map(function (dr) {
        var cells = dr.cells || [];
        return Object.assign({}, dr, {
          cells: order.map(function (oldIdx) {
            return cells[oldIdx] || { text: "", editKey: "", band: "" };
          }),
        });
      });
    }
    return expandSundayAquaticIntoMulti(
      newGroups,
      newDates,
      newServices,
      dayName,
    );
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
    return "";
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
    if (!dates.length) {
      return '<p class="ttl-empty">No Autumn dates for this weekday.</p>';
    }

    var reordered = reorderColumnsByService(groups, dates, state.day);
    groups = reordered.groups;
    dates = reordered.dates;
    var labels = flattenVenueLabels(groups);
    var columnServices = reordered.columnServices;

    var filtered = dates.filter(function (dr) {
      if (state.service === "all") return true;
      return (dr.cells || []).some(function (c) {
        return cellMatchesService(c, state.service) && cellText(c);
      });
    });

    var svcSegs = serviceHeaderSegments(groups, columnServices);

    var headVenues = "";
    groups.forEach(function (g) {
      var st = g.style || "default";
      headVenues +=
        '<th colspan="' +
        (Number(g.span) || 1) +
        '" class="ttl-v--' +
        esc(st) +
        ' ttl-v-start"><span class="ttl-head">' +
        icoVenue(st) +
        "<span>" +
        esc(g.venue || "") +
        "</span></span></th>";
    });

    var headServices = "";
    svcSegs.forEach(function (seg) {
      var slug = serviceSlug(seg.label);
      headServices +=
        '<th colspan="' +
        seg.span +
        '" class="ttl-svc ttl-v--' +
        esc(seg.style) +
        (seg.start ? " ttl-v-start" : "") +
        (seg.svcStart && !seg.start ? " ttl-svc-start" : "") +
        (slug ? " ttl-svc--" + esc(slug) : "") +
        '">' +
        esc(seg.label || "") +
        "</th>";
    });

    var headSeats = "";
    var seatCol = 0;
    (groups || []).forEach(function (g) {
      var span = Number(g.span) || 1;
      var st = g.style || "default";
      var isSf = String(st).indexOf("swimfarm") >= 0;
      if (isSf) {
        /* SwimFarm: Seat 1..n within each service; Office seat labeled Office. */
        var i = 0;
        while (i < span) {
          var svc = columnServices[seatCol] || "";
          var run = 1;
          while (
            i + run < span &&
            columnServices[seatCol + run] === svc
          ) {
            run += 1;
          }
          var slug = serviceSlug(svc);
          var floorSeat = 0;
          for (var s = 1; s <= run; s++) {
            var labSf = labels[seatCol] || {};
            var isOfficeSeat =
              svc === "Day Centre" && columnIsOfficeSeat(dates, seatCol);
            var seatLabel = isOfficeSeat ? "Office" : "Seat " + (++floorSeat);
            headSeats +=
              '<th class="ttl-seat ttl-v--' +
              esc(st) +
              (labSf.idx === 0 && s === 1 ? " ttl-v-start" : "") +
              (s === 1 && i > 0 ? " ttl-svc-start" : "") +
              (slug ? " ttl-svc--" + esc(slug) : "") +
              (isOfficeSeat ? " ttl-seat--office" : "") +
              '">' +
              esc(seatLabel) +
              "</th>";
            seatCol += 1;
          }
          i += run;
        }
      } else {
        /* Each venue (Westway / Northolt / Acton) restarts at Seat 1. */
        for (var s2 = 1; s2 <= span; s2++) {
          var lab = labels[seatCol] || {};
          var slug2 = serviceSlug(columnServices[seatCol] || "");
          headSeats +=
            '<th class="ttl-seat ttl-v--' +
            esc(st) +
            (s2 === 1 ? " ttl-v-start" : "") +
            (slug2 ? " ttl-svc--" + esc(slug2) : "") +
            '">Seat ' +
            s2 +
            "</th>";
          seatCol += 1;
        }
      }
    });

    var rowsHtml = filtered
      .map(function (dr) {
        var iso = String((dr && dr.date) || "").slice(0, 10);
        var cells = dr.cells || [];
        var tds = labels
          .map(function (lab, i) {
            var cell = cells[i] || { text: "", editKey: "" };
            var svcSlug = serviceSlug(columnServices[i] || "");
            var prevSlug = i > 0 ? serviceSlug(columnServices[i - 1] || "") : "";
            var tdCls =
              "ttl-v-body--" +
              esc(lab.style || "default") +
              (lab.idx === 0 ? " ttl-v-start" : "") +
              (svcSlug && String(lab.style || "").indexOf("swimfarm") >= 0
                ? " ttl-sf-svc--" + esc(svcSlug)
                : "") +
              (svcSlug && prevSlug && svcSlug !== prevSlug ? " ttl-svc-start" : "");
            if (state.service !== "all" && !cellMatchesService(cell, state.service)) {
              return '<td class="' + tdCls + ' ttl-muted">—</td>';
            }
            var text = cellText(cell);
            var painted = applyCoverOnRota(text, iso);
            text = painted.text;
            var parts = splitNameTime(text);
            var isCover = !!painted.cover;
            var awayNoCover = !!painted.awayNoCover;
            var isClosed = /^closed$/i.test(String(text || "").trim());
            var draft = cell.editKey && state.drafts[cell.editKey] != null;
            var key = cell.editKey || "";
            if (!key) {
              return (
                '<td class="' +
                tdCls +
                '"><span class="ttl-cell-ro' +
                (isCover ? " is-cover" : "") +
                (awayNoCover ? " is-dayoff" : "") +
                (isClosed ? " is-closed" : "") +
                '">' +
                cellTwoLineHtml(text, {
                  cover: isCover,
                  away: awayNoCover,
                }) +
                "</span></td>"
              );
            }
            return (
              '<td class="' +
              tdCls +
              '"><button type="button" class="ttl-cell' +
              (draft ? " is-draft" : "") +
              (isCover ? " is-cover" : "") +
              (awayNoCover ? " is-dayoff" : "") +
              (isClosed ? " is-closed" : "") +
              (text ? "" : " is-empty") +
              '" data-edit-key="' +
              esc(key) +
              '" title="' +
              esc(text || key) +
              (isCover ? " · Cover on rota" : "") +
              (awayNoCover ? " · Day off (no cover named)" : "") +
              '">' +
              cellTwoLineHtml(text, {
                cover: isCover,
                away: awayNoCover,
              }) +
              "</button></td>"
            );
          })
          .join("");
        return (
          '<tr class="' +
          (dayOffsForIso(iso).length ? "ttl-row--has-dayoff" : "") +
          '"><th class="ttl-date">' +
          '<div class="ttl-date__label">' +
          esc(dr.label || dr.date) +
          "</div>" +
          dateDayOffChipsHtml(iso) +
          "</th>" +
          tds +
          "</tr>"
        );
      })
      .join("");

    var offNote = state.dayOffLoaded
      ? " · day offs from staff_unavailability snap"
      : " · no day-off snap (run local-staff-unavailability-snap)";

    return (
      '<p class="ttl-meta">' +
      esc(state.day) +
      " · " +
      filtered.length +
      " dates in Autumn term (1 Sep – 17 Dec) · click a cell to edit locally" +
      offNote +
      "</p>" +
      '<div class="ttl-scroll"><table class="ttl-hours">' +
      "<thead><tr><th class=\"ttl-date\" rowspan=\"3\"><span class=\"ttl-head\">" +
      icoCalendar() +
      "<span>Dates</span></span></th>" +
      headVenues +
      "</tr><tr>" +
      headServices +
      "</tr><tr>" +
      headSeats +
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

  var FIXED_VENUES = ["Acton", "Northolt", "SwimFarm", "Westway", "Home"];
  var FIXED_AREAS = [
    "Teaching Pool",
    "Big Pool",
    "Small Pool",
    "Lane (SE)",
    "Lane (DE)",
    "Hub Room",
    "Room 2",
    "Gym",
    "Wall",
    "Day Centre",
    "Bespoke",
    "Home",
  ];
  var FIXED_SERVICES = [
    "Aquatic Activity",
    "Aquatic & Multi-Activity",
    "Multi-Activity",
    "Day Centre",
    "Bespoke",
    "Bespoke Programme",
    "Climbing Activity",
  ];

  function allStandingRows() {
    var PRC = global.PortalRosterCanonical;
    if (!PRC || typeof PRC.resolveCanonicalRosterRows !== "function") return [];
    var all = PRC.resolveCanonicalRosterRows({ skipDb: true }) || [];
    return all.filter(function (r) {
      if (!r) return false;
      var sd = String(r.session_date || "").slice(0, 10);
      if (sd && !isJulStandingStamp(sd) && /^2026-09-/.test(sd)) return false;
      return true;
    });
  }

  function uniqSorted(list) {
    var seen = Object.create(null);
    var out = [];
    (list || []).forEach(function (v) {
      var s = String(v == null ? "" : v).trim();
      if (!s) return;
      var k = s.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      out.push(s);
    });
    out.sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
    return out;
  }

  function ensureOption(list, current) {
    var cur = String(current || "").trim();
    if (!cur) return list.slice();
    var low = cur.toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]).toLowerCase() === low) return list.slice();
    }
    return [cur].concat(list);
  }

  function selectHtml(id, options, current, emptyLabel) {
    var cur = String(current || "").trim();
    var opts = ensureOption(options || [], cur);
    var html =
      '<select id="' +
      esc(id) +
      '">' +
      (emptyLabel
        ? '<option value="">' + esc(emptyLabel) + "</option>"
        : "");
    opts.forEach(function (v) {
      html +=
        '<option value="' +
        esc(v) +
        '"' +
        (String(v) === cur ? " selected" : "") +
        ">" +
        esc(v) +
        "</option>";
    });
    return html + "</select>";
  }

  function seatEditOptions(pre) {
    var rows = allStandingRows();
    var participants = [];
    var services = FIXED_SERVICES.slice();
    var times = [];
    var instructors = [];
    var venues = FIXED_VENUES.slice();
    var areas = FIXED_AREAS.slice();
    rows.forEach(function (r) {
      participants.push(r.client_name);
      services.push(r.service);
      times.push(r.time_slot);
      venues.push(r.venue);
      areas.push(r.area);
      splitInstructors(r.instructors).forEach(function (n) {
        instructors.push(n);
      });
    });
    if (pre.instructors) instructors.push(pre.instructors);
    return {
      participants: ensureOption(uniqSorted(participants), pre.client_name),
      services: ensureOption(uniqSorted(services), pre.service),
      times: ensureOption(uniqSorted(times), pre.time_slot),
      instructors: ensureOption(uniqSorted(instructors), pre.instructors),
      venues: ensureOption(uniqSorted(venues), pre.venue),
      areas: ensureOption(uniqSorted(areas), pre.area),
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
                  (r.venue ? " · " + esc(String(r.venue).trim()) : "") +
                  "</div>" +
                  (String(r.area || "").trim()
                    ? '<div class="ttl-card__area">' + esc(String(r.area).trim()) + "</div>"
                    : "") +
                  "</button>"
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
    var opts = seatEditOptions(pre);
    var wd = esc(state.day);
    el.innerHTML =
      '<div class="ttl-drawer__panel">' +
      '<div class="ttl-drawer__head"><strong>Who is booked → Edit term slot</strong>' +
      '<button type="button" class="ttl-btn ttl-btn--ghost" id="ttlClose">Close</button></div>' +
      '<p class="ttl-drawer__note">LOCAL preview — all fields selectable (no save). In admin, the same click opens the real Edit term slot.</p>' +
      '<label class="ttl-field">Anchor date<input type="date" id="ttlSeatAnchor" value="' +
      esc(pre.anchorDate) +
      '" /></label>' +
      '<label class="ttl-field">Participant' +
      selectHtml("ttlSeatClient", opts.participants, pre.client_name, "Pick participant") +
      "</label>" +
      '<label class="ttl-field">Service' +
      selectHtml("ttlSeatService", opts.services, pre.service, "Pick service") +
      "</label>" +
      '<label class="ttl-field">Time slot' +
      selectHtml("ttlSeatTime", opts.times, pre.time_slot, "Pick time") +
      "</label>" +
      '<label class="ttl-field">Instructor(s)' +
      selectHtml("ttlSeatInstr", opts.instructors, pre.instructors, "Pick instructor") +
      "</label>" +
      '<label class="ttl-field">Venue' +
      selectHtml("ttlSeatVenue", opts.venues, pre.venue, "Pick venue") +
      "</label>" +
      '<label class="ttl-field">Pool / area' +
      selectHtml("ttlSeatArea", opts.areas, pre.area, "Pick pool / area") +
      "</label>" +
      '<div class="ttl-field">Action<div class="ttl-pills" role="group">' +
      '<label class="ttl-pill"><input type="radio" name="ttlSeatAction" value="update" checked /> Update slot</label>' +
      '<label class="ttl-pill ttl-pill--warn"><input type="radio" name="ttlSeatAction" value="cancel_service" /> Cancel service</label>' +
      '<label class="ttl-pill"><input type="radio" name="ttlSeatAction" value="no_participant" /> No participant</label>' +
      "</div></div>" +
      '<div class="ttl-field">Apply to<div class="ttl-pills" role="group">' +
      '<label class="ttl-pill"><input type="radio" name="ttlSeatScope" value="single_day" /> This day only</label>' +
      '<label class="ttl-pill"><input type="radio" name="ttlSeatScope" value="weekday_term" checked /> Every ' +
      wd +
      " until end of term</label>" +
      '<label class="ttl-pill"><input type="radio" name="ttlSeatScope" value="rest_of_term" /> Rest of term (from anchor)</label>' +
      '<label class="ttl-pill"><input type="radio" name="ttlSeatScope" value="pick_sessions" /> Selected sessions</label>' +
      "</div></div>" +
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
      renderDayServiceChips() +
      '<div class="ttl-row"><button type="button" class="ttl-btn" id="ttlClearDrafts">Clear local drafts</button></div>';
    board.innerHTML = renderHoursTermTable();
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
        state.tab = "hours";
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
    try {
      var q = new URLSearchParams(global.location.search || "");
      state.tab = "hours";
      var dayQ = String(q.get("day") || "");
      if (DAYS.indexOf(dayQ) >= 0) state.day = dayQ;
      else state.day = "Monday";
    } catch (_e) {
      state.day = "Monday";
    }
    loadDayOffs().then(function () {
      paint();
    });
    paint();
  }

  global.TermTimetableLocal = { boot: boot, paint: paint };
})(typeof window !== "undefined" ? window : globalThis);
