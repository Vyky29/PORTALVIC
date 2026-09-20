/**
 * Admin — Places / Booking Portal publication (office).
 * Live seats from portal-booking-offer (same source as the public Booking Portal).
 * Public JSON stays anonymous; office UI resolves taken names from the local roster.
 */
(function (global) {
  "use strict";

  var DAY_ORDER = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  var cfg = {
    esc: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    getSupabaseUrl: function () {
      return "";
    },
    getAnonKey: function () {
      return "";
    },
    toast: function () {},
    openView: function () {},
    placeNew: function () {},
    placeExisting: function () {},
  };

  var state = {
    loading: false,
    error: null,
    termLabel: "",
    termRange: "",
    termBadge: "",
    madreUpdatedAt: null,
    servicesById: {},
    slots: [],
    bandHint: "",
    filters: {
      day: "",
      service: "",
      venue: "",
      openOnly: false,
    },
  };

  function configure(options) {
    if (!options) return;
    if (options.esc) cfg.esc = options.esc;
    if (options.getSupabaseUrl) cfg.getSupabaseUrl = options.getSupabaseUrl;
    if (options.getAnonKey) cfg.getAnonKey = options.getAnonKey;
    if (options.toast) cfg.toast = options.toast;
    if (options.openView) cfg.openView = options.openView;
    if (options.placeNew) cfg.placeNew = options.placeNew;
    if (options.placeExisting) cfg.placeExisting = options.placeExisting;
  }

  function esc(s) {
    return cfg.esc(s);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function isIntensiveOrCampSlot(slot) {
    if (!slot) return false;
    var sid = String(slot.serviceId || "").trim().toLowerCase();
    if (sid === "intensive" || sid === "camp" || sid === "crash") return true;
    if (String(slot.blockId || "").trim()) return true;
    var day = String(slot.day || "").trim();
    if (/^week\s*\d/i.test(day)) return true;
    if (/\bjul(y)?\b/i.test(day) && /week/i.test(day)) return true;
    return DAY_ORDER.indexOf(day) < 0 && !!day && !/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(day);
  }

  function termWeekdaySlots(list) {
    return (list || []).filter(function (s) {
      return !isIntensiveOrCampSlot(s);
    });
  }

  function intensiveCampSlots(list) {
    return (list || []).filter(function (s) {
      return isIntensiveOrCampSlot(s);
    });
  }

  function dayFilterOptionsHtml(termDays, intensiveDays, selected) {
    var html = '<option value="">All days</option>';
    if (termDays.length) {
      html += '<optgroup label="Autumn term weekdays">';
      termDays.forEach(function (v) {
        html +=
          '<option value="' +
          esc(v) +
          '"' +
          (v === selected ? " selected" : "") +
          ">" +
          esc(v) +
          "</option>";
      });
      html += "</optgroup>";
    }
    if (intensiveDays.length) {
      html += '<optgroup label="Intensive Courses & Camps">';
      intensiveDays.forEach(function (v) {
        html +=
          '<option value="' +
          esc(v) +
          '"' +
          (v === selected ? " selected" : "") +
          ">" +
          esc(v) +
          "</option>";
      });
      html += "</optgroup>";
    }
    return html;
  }

  function freeOf(slot) {
    var occ = bandSlotOccupancy(slot);
    return Math.max(0, Number(occ.freeSeats) || 0);
  }

  function serviceName(id) {
    var s = state.servicesById[id];
    return (s && s.name) || id || "—";
  }

  function supabaseBase() {
    return String(
      cfg.getSupabaseUrl() ||
        global.SUPABASE_URL ||
        "https://cklpnwhlqsulpmkipmqb.supabase.co"
    ).replace(/\/$/, "");
  }

  function anonKey() {
    return String(cfg.getAnonKey() || global.SUPABASE_ANON_KEY || "").trim();
  }

  function stylesHtml() {
    return (
      '<style id="op2627Styles">' +
      ".op2627{min-width:0}" +
      ".op2627-embed{margin-top:28px;padding-top:20px;border-top:1px solid var(--line,#d8dee8)}" +
      ".op2627-tbl-wrap{overflow-x:auto;min-width:0;width:100%}" +
      ".op2627-tbl{table-layout:fixed;width:100%;min-width:0}" +
      ".op2627-tbl th.op2627-th,.op2627-tbl td.op2627-td{" +
      "text-align:center;vertical-align:top;min-width:0;" +
      "overflow-wrap:break-word;word-break:break-word}" +
      ".op2627-tbl .op2627-td--svc{width:18%}" +
      ".op2627-tbl .op2627-td--venue{width:12%}" +
      ".op2627-tbl .op2627-td--time{width:14%}" +
      ".op2627-tbl .op2627-td--seats{width:38%;text-align:left}" +
      ".op2627-tbl .op2627-td--place{width:18%}" +
      ".op2627-seat-summary{font-size:12px;font-weight:700;color:#0f172a;margin:0 0 6px;line-height:1.35;overflow-wrap:break-word}" +
      ".op2627-seat-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;min-width:0}" +
      ".op2627-seat-list li{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 10px;font-size:12px;line-height:1.35;min-width:0;padding:4px 8px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0}" +
      ".op2627-seat-list li.is-open{background:#f0fdf4;border-color:#bbf7d0;color:#166534}" +
      ".op2627-seat-list li.is-hold{background:#fff7ed;border-color:#fed7aa;color:#9a3412}" +
      ".op2627-seat-list .op2627-seat-name{font-weight:700;color:#0f172a;min-width:0;overflow-wrap:break-word}" +
      ".op2627-seat-list li.is-open .op2627-seat-name{color:#166534}" +
      ".op2627-seat-list li.is-hold .op2627-seat-name{color:#9a3412}" +
      ".op2627-seat-list .op2627-seat-n{font-weight:600;color:#64748b;white-space:nowrap;flex:0 0 auto}" +
      ".op2627-seat-fallback{font-size:12px;color:#64748b;line-height:1.35;overflow-wrap:break-word}" +
      ".op2627-place{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;min-width:0}" +
      ".op2627-place .btn{white-space:nowrap}" +
      ".op2627-band-hint{margin:0 0 10px;font-size:13px;min-width:0;overflow-wrap:break-word}" +
      "</style>"
    );
  }

  function normOfferTimeKey(raw) {
    return String(raw || "")
      .toLowerCase()
      .replace(/\u2013|\u2014/g, "-")
      .replace(/\s*to\s*/g, "-")
      .replace(/\s+/g, "")
      .replace(/(\d)\.(\d)/g, "$1:$2")
      .replace(/:(\d)\b/g, ":$10")
      .replace(/\.00/g, "")
      .replace(/:00/g, "");
  }

  function isEmptySeatName(name) {
    var up = String(name || "")
      .trim()
      .toUpperCase()
      .replace(/[_\s-]+/g, " ");
    if (!up) return true;
    return (
      up === "NO PARTICIPANT" ||
      up === "NO CLIENT" ||
      up === "NOPARTICIPANT" ||
      up === "OPEN" ||
      up === "AVAILABLE" ||
      up === "FREE"
    );
  }

  function isClosedSeatName(name) {
    var up = String(name || "")
      .trim()
      .toUpperCase()
      .replace(/[_\s-]+/g, " ");
    return up === "CLOSED";
  }

  function isOfficeHoldName(name) {
    var up = String(name || "")
      .trim()
      .toUpperCase();
    return up === "ELIA" || up.indexOf("ELIA ") === 0;
  }

  function venueKeysMatch(a, b) {
    var va = String(a || "").trim().toLowerCase();
    var vb = String(b || "").trim().toLowerCase();
    if (!va || !vb) return !va && !vb;
    return va === vb || va.indexOf(vb) >= 0 || vb.indexOf(va) >= 0;
  }

  function serviceKeysMatch(a, b) {
    var sa = String(a || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    var sb = String(b || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!sa || !sb) return true;
    return sa === sb || sa.indexOf(sb) >= 0 || sb.indexOf(sa) >= 0;
  }

  function timesExactMatch(a, b) {
    var ta = normOfferTimeKey(a);
    var tb = normOfferTimeKey(b);
    if (!ta || !tb) return false;
    return ta === tb;
  }

  function occupantsSlotForOffer(slot) {
    var root = global.PORTAL_CAPACITY_CHAIN_OCCUPANTS;
    var by = root && root.bySlotId;
    if (!by || !slot) return null;
    if (slot.id && by[slot.id]) return by[slot.id];
    var keys = Object.keys(by);
    var i;
    for (i = 0; i < keys.length; i++) {
      var o = by[keys[i]];
      if (!o) continue;
      if (String(o.day || "") !== String(slot.day || "")) continue;
      if (!venueKeysMatch(o.venue, slot.venue)) continue;
      if (String(o.serviceId || "") !== String(slot.serviceId || "")) continue;
      if (timesExactMatch(o.timeLabel, slot.timeLabel)) return o;
    }
    return null;
  }

  /**
   * One standing slot per instructor that day — not every term week.
   * Live Booking offer owns taken/free (what parents can still book).
   * Occupant seat lines own the names for this office board.
   */
  function bandSlotOccupancy(slot) {
    var cap = Math.max(0, Number(slot && slot.capacity) || 0);
    var takenSeats = Math.max(0, Number(slot && slot.taken) || 0);
    var freeSeats = Math.max(0, Number(slot && slot.openSeats) || 0);
    if (cap > 0) {
      if (takenSeats + freeSeats !== cap) {
        if (freeSeats > cap) freeSeats = cap;
        takenSeats = Math.max(0, cap - freeSeats);
      }
    } else {
      cap = takenSeats + freeSeats;
    }

    var occ = occupantsSlotForOffer(slot);
    var lines = occ && Array.isArray(occ.seatLines) ? occ.seatLines : [];
    var byParticipant = [];
    var seen = Object.create(null);

    function pushName(raw, hold) {
      var nm = String(raw || "").trim();
      if (!nm || isEmptySeatName(nm) || isClosedSeatName(nm)) return;
      var key = nm.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      byParticipant.push({
        name: nm,
        hold: !!hold || isOfficeHoldName(nm),
      });
    }

    if (lines.length) {
      var lineTaken = 0;
      var lineOpen = 0;
      lines.forEach(function (line) {
        if (!line) return;
        var kind = String(line.kind || "").trim().toLowerCase();
        if (kind === "open") {
          lineOpen += 1;
          return;
        }
        lineTaken += 1;
        pushName(line.client || line.trialClient, kind === "closed" || kind === "hold");
      });
      cap = lines.length;
      takenSeats = lineTaken;
      freeSeats = lineOpen;
    } else {
      (slot && slot.bookedNames ? slot.bookedNames : []).forEach(function (nm) {
        pushName(nm, isOfficeHoldName(nm));
      });
      var instOpen = 0;
      if (Array.isArray(slot && slot.openInstructors)) {
        instOpen = slot.openInstructors.filter(function (n) {
          return String(n || "").trim();
        }).length;
      }
      if (instOpen > freeSeats) {
        freeSeats = instOpen;
        if (cap > 0) takenSeats = Math.max(0, cap - freeSeats);
      }
    }

    byParticipant.sort(function (a, b) {
      return String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        sensitivity: "base",
      });
    });

    return {
      capacity: cap,
      takenSeats: takenSeats,
      freeSeats: freeSeats,
      byParticipant: byParticipant,
      fromOccupants: lines.length > 0,
    };
  }

  function seatOccupancyHtml(slot) {
    var occ = bandSlotOccupancy(slot);
    var cap = occ.capacity;
    var summary =
      '<div class="op2627-seat-summary">' +
      esc(String(occ.takenSeats)) +
      " / " +
      esc(String(cap || "—")) +
      (occ.freeSeats > 0
        ? " · " + esc(String(occ.freeSeats)) + " free"
        : "") +
      "</div>";

    var items = occ.byParticipant
      .map(function (p) {
        return (
          "<li" +
          (p.hold ? ' class="is-hold"' : "") +
          ">" +
          '<span class="op2627-seat-name">' +
          esc(p.name) +
          "</span>" +
          (p.hold
            ? '<span class="op2627-seat-n">office hold</span>'
            : "") +
          "</li>"
        );
      })
      .join("");
    if (occ.freeSeats > 0) {
      items +=
        '<li class="is-open">' +
        '<span class="op2627-seat-name">Open</span>' +
        '<span class="op2627-seat-n">' +
        esc(String(occ.freeSeats)) +
        "</span>" +
        "</li>";
    }
    if (!items) {
      items =
        occ.takenSeats >= cap && cap > 0
          ? '<li><span class="op2627-seat-name">Full</span></li>'
          : '<li class="is-open"><span class="op2627-seat-name">Open</span>' +
            '<span class="op2627-seat-n">' +
            esc(String(cap || 0)) +
            "</span></li>";
    }
    return summary + '<ul class="op2627-seat-list">' + items + "</ul>";
  }

  /**
   * @param {{ embedded?: boolean }} [opts]
   * embedded: section under Services (no standalone page chrome).
   */
  function viewHtml(opts) {
    var embedded = !!(opts && opts.embedded);
    var head = embedded
      ? '<div id="op2627Anchor" class="op2627-embed" style="margin-top:0;min-width:0;scroll-margin-top:14px;padding-top:4px">' +
        '<h2 class="page-title" style="font-size:1.15rem;margin:0 0 6px;min-width:0;overflow-wrap:break-word">1 · Places (Booking Portal)</h2>' +
        '<p class="page-intro" style="max-width:52rem;margin:0 0 12px;min-width:0;overflow-wrap:break-word">' +
        "Same bands as the public Booking Portal. Numbers are slots that day (taken / capacity), not weeks of term. " +
        "Tuesday Acton 4.00 is 3 slots because Aurora starts at 4.30; from 4.30 it is 4 instructors. Climbing Tue/Thu Elia is an office hold (not bookable). " +
        "Who works each seat is on <strong>Services</strong> below. Weekly Autumn days first; Intensive / Camps grouped below." +
        "</p>"
      : '<div class="page-head" style="min-width:0">' +
        '<h2 class="page-title" style="min-width:0;overflow-wrap:break-word">Places 2026/27</h2>' +
        '<p class="page-intro" style="max-width:52rem;min-width:0;overflow-wrap:break-word">' +
        "This board lives under <strong>Services</strong> (section 1 · Places). Opening this shortcut takes you there." +
        "</p></div>";
    var close = embedded ? "</div>" : "";
    return (
      stylesHtml() +
      head +
      '<div id="op2627Root" class="op2627" style="min-width:0">' +
      '<p class="muted" style="margin:0">Loading live places…</p>' +
      "</div>" +
      close
    );
  }

  function titleCaseDay(day) {
    var s = String(day || "").trim();
    if (!s) return "";
    var lower = s.toLowerCase();
    var map = {
      monday: "Monday",
      tuesday: "Tuesday",
      wednesday: "Wednesday",
      thursday: "Thursday",
      friday: "Friday",
      saturday: "Saturday",
      sunday: "Sunday",
    };
    if (map[lower]) return map[lower];
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function resolveServiceId(nameOrId) {
    var raw = String(nameOrId || "").trim();
    if (!raw) return "";
    if (state.servicesById[raw]) return raw;
    var want = raw.toLowerCase().replace(/\s+/g, " ");
    var ids = Object.keys(state.servicesById);
    var i;
    for (i = 0; i < ids.length; i++) {
      var n = String((state.servicesById[ids[i]] && state.servicesById[ids[i]].name) || "")
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (n === want) return ids[i];
    }
    for (i = 0; i < ids.length; i++) {
      var n2 = String((state.servicesById[ids[i]] && state.servicesById[ids[i]].name) || "")
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (n2.indexOf(want) >= 0 || want.indexOf(n2) >= 0) return ids[i];
    }
    var first = want.split(" ")[0];
    if (first.length >= 4) {
      for (i = 0; i < ids.length; i++) {
        var n3 = String((state.servicesById[ids[i]] && state.servicesById[ids[i]].name) || "").toLowerCase();
        if (n3.indexOf(first) >= 0) return ids[i];
      }
    }
    return "";
  }

  /**
   * Filter open-places board to a Services band and scroll into view.
   * @param {{ day?: string, venue?: string, serviceId?: string, serviceName?: string, programme?: string, openOnly?: boolean }} band
   */
  function applyBandFilter(band) {
    band = band || {};
    var day = titleCaseDay(band.day || "");
    var venue = String(band.venue || "").trim();
    var svc =
      String(band.serviceId || "").trim() ||
      resolveServiceId(band.serviceName || band.programme || "");
    state.filters.day = day;
    state.filters.venue = venue;
    state.filters.service = svc;
    if (band.openOnly === false) state.filters.openOnly = false;
    else state.filters.openOnly = true;
    state.bandHint = [day, venue, svc ? serviceName(svc) : String(band.programme || band.serviceName || "").trim()]
      .filter(Boolean)
      .join(" · ");
    render();
    var anchor = $("op2627Anchor") || $("op2627Root");
    if (anchor && typeof anchor.scrollIntoView === "function") {
      try {
        anchor.scrollIntoView({ block: "start", behavior: "smooth" });
      } catch (_e) {
        try {
          anchor.scrollIntoView(true);
        } catch (_e2) {
          /* ignore */
        }
      }
    }
  }

  /** Sync day/venue from Services filter bar (shared filters). */
  function syncFromServicesFilters(filt) {
    filt = filt || {};
    var day = titleCaseDay(filt.day || "");
    var venue = String(filt.venue || "").trim();
    var programme = String(filt.class || filt.programme || "").trim();
    var changed = false;
    if (state.filters.day !== day) {
      state.filters.day = day;
      changed = true;
    }
    if (state.filters.venue !== venue) {
      state.filters.venue = venue;
      changed = true;
    }
    if (programme) {
      var sid = resolveServiceId(programme);
      if (sid && state.filters.service !== sid) {
        state.filters.service = sid;
        changed = true;
      }
    } else if (!programme && filt.clearService) {
      if (state.filters.service) {
        state.filters.service = "";
        changed = true;
      }
    }
    if (changed) {
      state.bandHint = "";
      render();
    }
  }

  function uniqueSorted(values) {
    var map = {};
    (values || []).forEach(function (v) {
      var t = String(v || "").trim();
      if (t) map[t] = 1;
    });
    return Object.keys(map).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function filteredSlots() {
    var f = state.filters;
    return state.slots.filter(function (slot) {
      if (f.day && slot.day !== f.day) return false;
      if (f.service && slot.serviceId !== f.service) return false;
      if (f.venue && slot.venue !== f.venue) return false;
      if (f.openOnly && freeOf(slot) <= 0) return false;
      return true;
    });
  }

  function optionHtml(values, selected, allLabel) {
    var html = '<option value="">' + esc(allLabel) + "</option>";
    values.forEach(function (v) {
      html +=
        '<option value="' +
        esc(v) +
        '"' +
        (v === selected ? " selected" : "") +
        ">" +
        esc(v) +
        "</option>";
    });
    return html;
  }

  function serviceOptionHtml(selected) {
    var html = '<option value="">All services</option>';
    var ids = Object.keys(state.servicesById).sort(function (a, b) {
      return serviceName(a).localeCompare(serviceName(b));
    });
    ids.forEach(function (id) {
      html +=
        '<option value="' +
        esc(id) +
        '"' +
        (id === selected ? " selected" : "") +
        ">" +
        esc(serviceName(id)) +
        "</option>";
    });
    return html;
  }

  function kpiHtml(slots) {
    var openBands = 0;
    var freeSeats = 0;
    var fullBands = 0;
    slots.forEach(function (s) {
      var free = freeOf(s);
      if (free > 0) {
        openBands += 1;
        freeSeats += free;
      } else {
        fullBands += 1;
      }
    });
    return (
      '<div class="grid-kpi grid-kpi--4" style="margin:12px 0 16px">' +
      '<div class="kpi card--premium"><div class="kpi-l">Open bands</div><div class="kpi-v">' +
      esc(String(openBands)) +
      '</div><div class="kpi-s muted">with at least 1 free</div></div>' +
      '<div class="kpi card--premium"><div class="kpi-l">Free slots</div><div class="kpi-v">' +
      esc(String(freeSeats)) +
      '</div><div class="kpi-s muted">across filtered list</div></div>' +
      '<div class="kpi card--premium"><div class="kpi-l">Full bands</div><div class="kpi-v">' +
      esc(String(fullBands)) +
      '</div><div class="kpi-s muted">shown only if toggle off</div></div>' +
      '<div class="kpi card--premium"><div class="kpi-l">Total rows</div><div class="kpi-v">' +
      esc(String(slots.length)) +
      '</div><div class="kpi-s muted">after filters</div></div>' +
      "</div>"
    );
  }

  function slotPayload(slot) {
    return {
      id: slot.id || "",
      serviceId: slot.serviceId || "",
      serviceName: serviceName(slot.serviceId),
      venue: slot.venue || "",
      day: slot.day || "",
      timeLabel: slot.timeLabel || "",
      sortTime: slot.sortTime || "",
      capacity: Number(slot.capacity || 0),
      taken: Number(slot.taken || 0),
      free: freeOf(slot),
      instructors: Array.isArray(slot.instructors) ? slot.instructors.slice() : [],
    };
  }

  function encodeSlotAttr(slot) {
    try {
      return encodeURIComponent(JSON.stringify(slotPayload(slot)));
    } catch (_e) {
      return "";
    }
  }

  function decodeSlotAttr(raw) {
    try {
      return JSON.parse(decodeURIComponent(String(raw || "")));
    } catch (_e) {
      return null;
    }
  }

  function daySectionHtml(day, rows) {
    if (!rows.length) return "";
    var body = rows
      .map(function (slot) {
        var free = freeOf(slot);
        var payload = encodeSlotAttr(slot);
        var placeBtns =
          free > 0
            ? '<div class="op2627-place">' +
              '<button type="button" class="btn btn--pri btn--sm" data-op2627-place="existing" data-op2627-slot="' +
              esc(payload) +
              '">Place existing</button>' +
              '<button type="button" class="btn btn--sec btn--sm" data-op2627-place="new" data-op2627-slot="' +
              esc(payload) +
              '">Place new</button>' +
              "</div>"
            : '<span class="muted">Full</span>';
        return (
          "<tr>" +
          '<td class="op2627-td op2627-td--svc">' +
          esc(serviceName(slot.serviceId)) +
          "</td>" +
          '<td class="op2627-td op2627-td--venue">' +
          esc(slot.venue || "—") +
          "</td>" +
          '<td class="op2627-td op2627-td--time">' +
          esc(slot.timeLabel || "—") +
          "</td>" +
          '<td class="op2627-td op2627-td--seats">' +
          seatOccupancyHtml(slot) +
          "</td>" +
          '<td class="op2627-td op2627-td--place">' +
          placeBtns +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
    return (
      '<div class="card" style="margin-bottom:14px;min-width:0">' +
      '<div class="card-pad" style="min-width:0">' +
      "<h3 style=\"margin:0 0 10px;font-size:1.05rem;min-width:0;overflow-wrap:break-word\">" +
      esc(day) +
      " · " +
      esc(String(rows.length)) +
      " band" +
      (rows.length === 1 ? "" : "s") +
      "</h3>" +
      '<div class="op2627-tbl-wrap">' +
      '<table class="tbl tbl--center op2627-tbl">' +
      "<thead><tr>" +
      '<th class="op2627-th op2627-td--svc">Service</th>' +
      '<th class="op2627-th op2627-td--venue">Venue</th>' +
      '<th class="op2627-th op2627-td--time">Time</th>' +
      '<th class="op2627-th op2627-td--seats">Slots</th>' +
      '<th class="op2627-th op2627-td--place">Place</th>' +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div></div></div>"
    );
  }

  function render() {
    var root = $("op2627Root");
    if (!root) return;

    if (state.loading) {
      root.innerHTML = '<p class="muted" style="margin:0">Loading live places…</p>';
      return;
    }

    if (state.error) {
      root.innerHTML =
        '<div class="card card-pad" style="min-width:0">' +
        '<p style="margin:0 0 8px;min-width:0;overflow-wrap:break-word"><strong>Could not load places.</strong> ' +
        esc(state.error) +
        "</p>" +
        '<button type="button" class="btn btn--pri btn--sm" data-op2627-refresh>Retry</button>' +
        "</div>";
      return;
    }

    var slots = filteredSlots();
    var termSlots = termWeekdaySlots(slots);
    var campSlots = intensiveCampSlots(slots);
    var byDay = {};
    DAY_ORDER.forEach(function (d) {
      byDay[d] = [];
    });
    termSlots.forEach(function (slot) {
      var day = slot.day || "Monday";
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(slot);
    });
    DAY_ORDER.forEach(function (d) {
      byDay[d].sort(function (a, b) {
        var va = String(a.venue || "").localeCompare(String(b.venue || ""));
        if (va) return va;
        return String(a.sortTime || a.timeLabel || "").localeCompare(
          String(b.sortTime || b.timeLabel || "")
        );
      });
    });

    var byCampDay = {};
    campSlots.forEach(function (slot) {
      var day = String(slot.day || "Intensive").trim() || "Intensive";
      if (!byCampDay[day]) byCampDay[day] = [];
      byCampDay[day].push(slot);
    });
    Object.keys(byCampDay).forEach(function (d) {
      byCampDay[d].sort(function (a, b) {
        var va = String(a.venue || "").localeCompare(String(b.venue || ""));
        if (va) return va;
        return String(a.sortTime || a.timeLabel || "").localeCompare(
          String(b.sortTime || b.timeLabel || "")
        );
      });
    });

    var venues = uniqueSorted(
      state.slots.map(function (s) {
        return s.venue;
      })
    );
    var termDaysPresent = uniqueSorted(
      termWeekdaySlots(state.slots).map(function (s) {
        return s.day;
      })
    ).sort(function (a, b) {
      return DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b);
    });
    var intensiveDaysPresent = uniqueSorted(
      intensiveCampSlots(state.slots).map(function (s) {
        return s.day;
      })
    ).sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });

    var metaBits = [];
    if (state.termLabel) metaBits.push(state.termLabel);
    if (state.termRange) metaBits.push(state.termRange);
    if (state.madreUpdatedAt) {
      try {
        metaBits.push(
          "Roster updated " + new Date(state.madreUpdatedAt).toLocaleString("en-GB")
        );
      } catch (_e) {
        /* ignore */
      }
    }

    var sections = DAY_ORDER.map(function (d) {
      return daySectionHtml(d, byDay[d] || []);
    }).join("");

    var campDayKeys = Object.keys(byCampDay).sort(function (a, b) {
      return String(a).localeCompare(String(b));
    });
    var campSections = campDayKeys
      .map(function (d) {
        return daySectionHtml(d, byCampDay[d] || []);
      })
      .join("");
    if (campSections) {
      campSections =
        '<div class="op2627-intensive" style="margin-top:22px;padding-top:14px;border-top:1px dashed var(--line,#e5e7eb);min-width:0">' +
        '<h3 style="margin:0 0 8px;font-size:1.05rem;min-width:0;overflow-wrap:break-word">Intensive Courses &amp; Camps</h3>' +
        '<p class="muted" style="margin:0 0 12px;max-width:52rem;min-width:0;overflow-wrap:break-word">July crash / intensive weeks (not weekly Autumn term days). Kept for Booking Portal — not mixed into Mon–Sun standing.</p>' +
        campSections +
        "</div>";
    }

    if (!slots.length) {
      sections =
        '<div class="card card-pad"><p class="muted" style="margin:0;min-width:0;overflow-wrap:break-word">' +
        (state.filters.openOnly
          ? "No open places match these filters. Turn off “Open places only” to see full bands."
          : "No bands match these filters.") +
        "</p></div>";
      campSections = "";
    } else if (!termSlots.length && campSlots.length) {
      sections =
        '<div class="card card-pad" style="margin-bottom:12px"><p class="muted" style="margin:0;min-width:0;overflow-wrap:break-word">' +
        "No Autumn weekday bands match these filters. Intensive / camp bands (if any) are below." +
        "</p></div>";
    }

    root.innerHTML =
      '<div class="toolbar" style="flex-wrap:wrap;gap:8px;margin-bottom:10px;min-width:0">' +
      '<button type="button" class="btn btn--pri btn--sm" data-op2627-refresh>Refresh</button>' +
      '<a class="btn btn--ghost btn--sm" href="/bookingportal" target="_blank" rel="noopener">Open Booking Portal</a>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-op2627-waitlist>Waiting list</button>' +
      (state.bandHint
        ? '<button type="button" class="btn btn--ghost btn--sm" data-op2627-clear-band>Clear band filter</button>'
        : "") +
      "</div>" +
      (state.bandHint
        ? '<p class="op2627-band-hint muted">Showing band from Services: <strong>' +
          esc(state.bandHint) +
          "</strong></p>"
        : "") +
      (metaBits.length
        ? '<p class="muted" style="margin:0 0 10px;max-width:52rem;min-width:0;overflow-wrap:break-word">' +
          esc(metaBits.join(" · ")) +
          (state.termBadge ? " · " + esc(state.termBadge) : "") +
          "</p>"
        : "") +
      '<div class="card card-pad" style="margin-bottom:12px;min-width:0">' +
      '<div class="toolbar" style="flex-wrap:wrap;gap:10px;align-items:flex-end;min-width:0">' +
      '<label style="min-width:0;display:grid;gap:4px;font-size:12px">' +
      "<span>Day</span>" +
      '<select id="op2627Day" class="inp" style="min-width:10rem">' +
      dayFilterOptionsHtml(termDaysPresent, intensiveDaysPresent, state.filters.day) +
      "</select></label>" +
      '<label style="min-width:0;display:grid;gap:4px;font-size:12px">' +
      "<span>Service</span>" +
      '<select id="op2627Service" class="inp" style="min-width:10rem">' +
      serviceOptionHtml(state.filters.service) +
      "</select></label>" +
      '<label style="min-width:0;display:grid;gap:4px;font-size:12px">' +
      "<span>Venue</span>" +
      '<select id="op2627Venue" class="inp" style="min-width:8rem">' +
      optionHtml(venues, state.filters.venue, "All venues") +
      "</select></label>" +
      '<label class="muted" style="display:inline-flex;align-items:center;gap:6px;min-width:0;font-size:13px">' +
      '<input type="checkbox" id="op2627OpenOnly"' +
      (state.filters.openOnly ? " checked" : "") +
      " /> Open places only</label>" +
      "</div></div>" +
      kpiHtml(slots) +
      sections +
      campSections;
  }

  function applyFiltersFromDom() {
    var dayEl = $("op2627Day");
    var svcEl = $("op2627Service");
    var venueEl = $("op2627Venue");
    var openEl = $("op2627OpenOnly");
    state.filters.day = dayEl ? String(dayEl.value || "") : "";
    state.filters.service = svcEl ? String(svcEl.value || "") : "";
    state.filters.venue = venueEl ? String(venueEl.value || "") : "";
    state.filters.openOnly = openEl ? !!openEl.checked : false;
  }

  function onRootClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-op2627-refresh]")) {
      void load({ toastOnSuccess: true });
      return;
    }
    if (t.closest("[data-op2627-clear-band]")) {
      state.bandHint = "";
      state.filters.day = "";
      state.filters.venue = "";
      state.filters.service = "";
      state.filters.openOnly = false;
      render();
      return;
    }
    if (t.closest("[data-op2627-waitlist]")) {
      try {
        cfg.openView("c4k_waitlist");
      } catch (_e) {
        /* ignore */
      }
      return;
    }
    var placeBtn = t.closest("[data-op2627-place]");
    if (placeBtn) {
      var mode = placeBtn.getAttribute("data-op2627-place") || "";
      var slot = decodeSlotAttr(placeBtn.getAttribute("data-op2627-slot"));
      if (!slot) return;
      try {
        if (mode === "new") cfg.placeNew(slot);
        else cfg.placeExisting(slot);
      } catch (_e2) {
        /* ignore */
      }
    }
  }

  function onRootChange(ev) {
    var t = ev.target;
    if (!t || !t.id) return;
    if (
      t.id === "op2627Day" ||
      t.id === "op2627Service" ||
      t.id === "op2627Venue" ||
      t.id === "op2627OpenOnly"
    ) {
      applyFiltersFromDom();
      state.bandHint = "";
      render();
    }
  }

  function applyPayload(data) {
    state.error = null;
    state.termLabel = data.TERM_LABEL || (data.term && data.term.label) || "Autumn Term 2026";
    state.termRange = data.TERM_RANGE || (data.term && data.term.range) || "";
    state.termBadge = data.TERM_BADGE || (data.term && data.term.badge) || "";
    state.madreUpdatedAt = data.madre_updated_at || null;
    state.servicesById = {};
    (data.SERVICES || []).forEach(function (svc) {
      if (svc && svc.id) state.servicesById[svc.id] = svc;
    });
    state.slots = Array.isArray(data.SLOTS)
      ? data.SLOTS.slice()
      : Array.isArray(data.MOCK_SLOTS)
        ? data.MOCK_SLOTS.slice()
        : [];
  }

  function load(opts) {
    var options = opts || {};
    state.loading = true;
    state.error = null;
    render();
    var key = anonKey();
    if (!key) {
      state.loading = false;
      state.error = "missing_anon_key";
      render();
      return Promise.resolve();
    }
    var url = supabaseBase() + "/functions/v1/portal-booking-offer?include_staff=1";
    return fetch(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + key,
        apikey: key,
        Accept: "application/json",
      },
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || !body || body.ok === false) {
            throw new Error(
              (body && (body.error || body.message || body.code)) ||
                "offer_http_" + res.status,
            );
          }
          applyPayload(body);
          state.loading = false;
          render();
          if (options.toastOnSuccess) {
            try {
              cfg.toast("Open places updated", "ok");
            } catch (_e) {
              /* ignore */
            }
          }
        });
      })
      .catch(function (err) {
        state.loading = false;
        var raw = (err && err.message) || "offer_load_failed";
        if (/Failed to fetch|NetworkError|BOOT_ERROR|offer_http_503/i.test(raw)) {
          state.error =
            "Booking offer is down (server). Tap Retry in a moment.";
        } else {
          state.error = raw;
        }
        render();
      });
  }

  function bindModule() {
    var root = $("op2627Root");
    if (!root) return;
    if (!root._op2627Bound) {
      root._op2627Bound = true;
      root.addEventListener("click", onRootClick);
      root.addEventListener("change", onRootChange);
    }
    void load({ toastOnSuccess: false });
  }

  global.PortalAdminOpenPlaces2627 = {
    configure: configure,
    viewHtml: viewHtml,
    bindModule: bindModule,
    load: load,
    applyBandFilter: applyBandFilter,
    syncFromServicesFilters: syncFromServicesFilters,
    resolveServiceId: resolveServiceId,
  };
})(typeof window !== "undefined" ? window : globalThis);
