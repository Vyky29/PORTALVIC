/**
 * Public booking offer — live MADRE weekly seats + summer crash capacity.
 * Edge Function: portal-booking-offer
 */
(function (global) {
  "use strict";

  var WEEKDAY_NUM = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  var VENUE_LABELS = {
    Acton: "Acton Centre",
    Northolt: "Northolt Centre",
    SwimFarm: "SwimFarm Centre",
    Westway: "Westway",
  };

  var DAY_ORDER = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };

  var state = {
    source: "loading",
    error: null,
    SERVICES: [],
    MOCK_SLOTS: [],
    INTENSIVE_BLOCKS: [],
    TERM_BADGE: "",
    TERM_LABEL: "",
    TERM_RANGE: "",
    TERM_CALENDAR: { start: "", end: "", closedRanges: [] },
    stats: null,
  };

  function supabaseUrl() {
    return String(global.SUPABASE_URL || "https://cklpnwhlqsulpmkipmqb.supabase.co").replace(
      /\/$/,
      ""
    );
  }

  function anonKey() {
    return String(global.SUPABASE_ANON_KEY || "").trim();
  }

  function applyPayload(data) {
    state.source = data.source || "live";
    state.error = null;
    state.SERVICES = Array.isArray(data.SERVICES) ? data.SERVICES : [];
    state.MOCK_SLOTS = Array.isArray(data.MOCK_SLOTS) ? data.MOCK_SLOTS : [];
    state.INTENSIVE_BLOCKS = Array.isArray(data.INTENSIVE_BLOCKS) ? data.INTENSIVE_BLOCKS : [];
    state.TERM_BADGE = data.TERM_BADGE || (data.term && data.term.badge) || "";
    state.TERM_LABEL = data.TERM_LABEL || (data.term && data.term.label) || "";
    state.TERM_RANGE = data.TERM_RANGE || (data.term && data.term.range) || "";
    state.TERM_CALENDAR = data.TERM_CALENDAR || {
      start: "",
      end: "",
      closedRanges: [],
    };
    state.stats = data.stats || null;
  }

  /**
   * Fetch live offer. Resolves with the API object (same helpers).
   * @returns {Promise<object>}
   */
  function load() {
    var key = anonKey();
    var url = supabaseUrl() + "/functions/v1/portal-booking-offer";
    if (!key) {
      state.source = "error";
      state.error = "missing_anon_key";
      return Promise.reject(new Error("missing_anon_key"));
    }
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
            var err = (body && body.error) || "offer_http_" + res.status;
            throw new Error(err);
          }
          applyPayload(body);
          return api;
        });
      })
      .catch(function (err) {
        state.source = "error";
        state.error = (err && err.message) || "offer_load_failed";
        throw err;
      });
  }

  function seatsLeft(slot) {
    return Math.max(0, Number(slot.capacity || 0) - Number(slot.taken || 0));
  }

  function isFull(slot) {
    return seatsLeft(slot) <= 0;
  }

  function serviceById(id) {
    for (var i = 0; i < state.SERVICES.length; i++) {
      if (state.SERVICES[i].id === id) return state.SERVICES[i];
    }
    return null;
  }

  function parseIsoDate(iso) {
    var p = String(iso || "").split("-");
    if (p.length !== 3) return null;
    return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  }

  function toIsoDate(d) {
    var y = d.getUTCFullYear();
    var m = String(d.getUTCMonth() + 1).padStart(2, "0");
    var day = String(d.getUTCDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function isInClosedRange(iso) {
    var ranges = (state.TERM_CALENDAR && state.TERM_CALENDAR.closedRanges) || [];
    for (var i = 0; i < ranges.length; i++) {
      if (iso >= ranges[i].start && iso <= ranges[i].end) return true;
    }
    return false;
  }

  function termDatesForWeekday(dayName, asOf) {
    var want = WEEKDAY_NUM[dayName];
    if (want == null) return [];
    var start = parseIsoDate(state.TERM_CALENDAR.start);
    var end = parseIsoDate(state.TERM_CALENDAR.end);
    if (!start || !end) return [];
    var today = asOf ? parseIsoDate(asOf) || asOf : new Date();
    if (!(today instanceof Date) || isNaN(today.getTime())) today = new Date();
    var todayIso = toIsoDate(
      new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    );
    var out = [];
    var cur = new Date(start.getTime());
    while (cur.getUTCDay() !== want) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      if (cur > end) return out;
    }
    while (cur <= end) {
      var iso = toIsoDate(cur);
      if (!isInClosedRange(iso)) {
        out.push({
          iso: iso,
          label: formatChipDate(cur),
          past: iso < todayIso,
        });
      }
      cur.setUTCDate(cur.getUTCDate() + 7);
    }
    return out;
  }

  function formatChipDate(d) {
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return d.getUTCDate() + " " + months[d.getUTCMonth()];
  }

  function remainingTermPrice(dayName, pricePerSession, asOf) {
    var dates = termDatesForWeekday(dayName, asOf);
    var remaining = dates.filter(function (d) {
      return !d.past;
    });
    var unit = pricePerSession == null ? null : Number(pricePerSession);
    var total =
      unit == null || !isFinite(unit)
        ? null
        : Math.round(unit * remaining.length * 100) / 100;
    return {
      dates: dates,
      totalDates: dates.length,
      remainingCount: remaining.length,
      pastCount: dates.length - remaining.length,
      pricePerSession: unit,
      remainingTotal: total,
    };
  }

  function formatPounds(n) {
    if (n == null || !isFinite(n)) return null;
    return "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function intensiveBlockDateChips(block, asOf) {
    var dates = (block && block.dates) || [];
    var today = asOf instanceof Date ? asOf : asOf ? parseIsoDate(asOf) : new Date();
    if (!(today instanceof Date) || isNaN(today.getTime())) today = new Date();
    var todayIso = toIsoDate(
      new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
    );
    return dates.map(function (d) {
      return {
        iso: d.iso,
        label: d.label,
        past: String(d.iso) < todayIso,
      };
    });
  }

  function venueLabel(venue) {
    var k = String(venue || "").trim();
    return VENUE_LABELS[k] || k;
  }

  function blockById(id) {
    for (var i = 0; i < state.INTENSIVE_BLOCKS.length; i++) {
      if (state.INTENSIVE_BLOCKS[i].id === id) return state.INTENSIVE_BLOCKS[i];
    }
    return null;
  }

  function groupIntensiveByBlock(slots) {
    var byBlock = Object.create(null);
    (slots || []).forEach(function (slot) {
      var bid = String(slot.blockId || "").trim() || "other";
      if (!byBlock[bid]) byBlock[bid] = [];
      byBlock[bid].push(slot);
    });
    return state.INTENSIVE_BLOCKS.map(function (block) {
      var list = byBlock[block.id] || [];
      return {
        block: block,
        venues: groupSlotsByVenueThenDay(list),
      };
    }).filter(function (row) {
      return row.venues.length > 0 || !!(row.block && row.block.enquireOnly);
    });
  }

  function groupSlotsByVenueThenDay(slots) {
    var byVenue = Object.create(null);
    var venueOrder = [];
    (slots || []).forEach(function (slot) {
      var v = String(slot.venue || "").trim() || "Venue";
      if (!byVenue[v]) {
        byVenue[v] = Object.create(null);
        venueOrder.push(v);
      }
      var d = String(slot.day || "").trim() || "Day";
      if (!byVenue[v][d]) byVenue[v][d] = [];
      byVenue[v][d].push(slot);
    });
    venueOrder.sort(function (a, b) {
      return a.localeCompare(b, "en");
    });
    return venueOrder.map(function (venue) {
      var daysMap = byVenue[venue];
      var dayKeys = Object.keys(daysMap).sort(function (a, b) {
        if (DAY_ORDER[a] && DAY_ORDER[b]) return DAY_ORDER[a] - DAY_ORDER[b];
        return a.localeCompare(b, "en");
      });
      return {
        venue: venue,
        venueLabel: venueLabel(venue),
        days: dayKeys.map(function (day) {
          return { day: day, slots: daysMap[day] };
        }),
      };
    });
  }

  function uniqueSorted(values) {
    var seen = Object.create(null);
    var out = [];
    values.forEach(function (v) {
      var k = String(v || "").trim();
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(k);
    });
    out.sort(function (a, b) {
      if (DAY_ORDER[a] && DAY_ORDER[b]) return DAY_ORDER[a] - DAY_ORDER[b];
      return a.localeCompare(b, "en");
    });
    return out;
  }

  function filterOptions() {
    return {
      services: state.SERVICES.map(function (s) {
        return { id: s.id, name: s.name };
      }),
      venues: uniqueSorted(
        state.MOCK_SLOTS.map(function (s) {
          return s.venue;
        })
      ),
      days: uniqueSorted(
        state.MOCK_SLOTS.map(function (s) {
          return s.day;
        }).filter(function (d) {
          return DAY_ORDER[d];
        })
      ),
      times: uniqueSorted(
        state.MOCK_SLOTS.map(function (s) {
          return s.timeLabel;
        }).sort(function (a, b) {
          var sa = state.MOCK_SLOTS.find(function (x) {
            return x.timeLabel === a;
          });
          var sb = state.MOCK_SLOTS.find(function (x) {
            return x.timeLabel === b;
          });
          return String((sa && sa.sortTime) || "").localeCompare(
            String((sb && sb.sortTime) || "")
          );
        })
      ),
    };
  }

  function filterSlots(filters) {
    filters = filters || {};
    return state.MOCK_SLOTS.filter(function (slot) {
      if (filters.serviceId && slot.serviceId !== filters.serviceId) return false;
      if (filters.venue && slot.venue !== filters.venue) return false;
      if (filters.day && slot.day !== filters.day) return false;
      if (filters.timeLabel && slot.timeLabel !== filters.timeLabel) return false;
      if (filters.hideFull && isFull(slot)) return false;
      return true;
    }).sort(function (a, b) {
      var da = DAY_ORDER[a.day];
      var db = DAY_ORDER[b.day];
      if (da && db && da !== db) return da - db;
      var ds = String(a.day || "").localeCompare(String(b.day || ""), "en");
      if (ds) return ds;
      var t = String(a.sortTime).localeCompare(String(b.sortTime));
      if (t) return t;
      return String(a.venue).localeCompare(String(b.venue));
    });
  }

  var api = {
    load: load,
    get source() {
      return state.source;
    },
    get error() {
      return state.error;
    },
    get stats() {
      return state.stats;
    },
    get SERVICES() {
      return state.SERVICES;
    },
    get MOCK_SLOTS() {
      return state.MOCK_SLOTS;
    },
    get INTENSIVE_BLOCKS() {
      return state.INTENSIVE_BLOCKS;
    },
    get TERM_BADGE() {
      return state.TERM_BADGE;
    },
    get TERM_LABEL() {
      return state.TERM_LABEL;
    },
    get TERM_RANGE() {
      return state.TERM_RANGE;
    },
    get TERM_CALENDAR() {
      return state.TERM_CALENDAR;
    },
    serviceById: serviceById,
    venueLabel: venueLabel,
    blockById: blockById,
    seatsLeft: seatsLeft,
    isFull: isFull,
    filterOptions: filterOptions,
    filterSlots: filterSlots,
    groupSlotsByVenueThenDay: groupSlotsByVenueThenDay,
    groupIntensiveByBlock: groupIntensiveByBlock,
    termDatesForWeekday: termDatesForWeekday,
    remainingTermPrice: remainingTermPrice,
    formatPounds: formatPounds,
    intensiveBlockDateChips: intensiveBlockDateChips,
  };

  global.PortalBookingOffer = api;
})(typeof window !== "undefined" ? window : globalThis);
