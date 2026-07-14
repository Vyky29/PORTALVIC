/**
 * Public booking offer — MOCK data + filters (Phase A).
 *
 * Source map (live wiring later — do not invent a second capacity DB):
 * - Catalogue copy / prices: supabase/functions/_shared/reenrolment_catalog.ts
 * - Weekly roster times/venues: portal_madre_document + schedule_overrides
 *   (staff_dashboard_spreadsheet_bundle.js is the embedded snapshot of MADRE rows)
 * - Occupancy for existing clients: portal_participant_service_lines (+ payments)
 * - Holiday crash capacity pattern: portal_crash_summer_booking_lines
 * - Parent portal “what’s available” must call the SAME seat helper as this page
 *
 * This file is demo-only: capacity numbers are illustrative.
 */
(function (global) {
  "use strict";

  var TERM_BADGE = "AUTUMN TERM 2026";
  var TERM_LABEL = "Autumn Term 2026";
  var TERM_RANGE = "Tue 1st September 2026 – Fri 18th December 2026";

  var VENUE_LABELS = {
    Acton: "Acton Centre",
    Northolt: "Northolt Centre",
    SwimFarm: "SwimFarm Centre",
    Westway: "Westway",
  };

  var SERVICES = [
    {
      id: "aquatic",
      name: "Aquatic Activity",
      tier: "core",
      ageHint: "From 3 years+",
      durationHint: "Usually 30 minutes",
      priceHint: "From £50 / 30 min session",
      blurb:
        "1:1 or small-group swimming sessions with sensory-aware instructors. We work at the child’s pace — water confidence, regulation, and independence.",
      venues: ["Acton", "Northolt", "SwimFarm"],
    },
    {
      id: "climbing",
      name: "Climbing Activity",
      tier: "core",
      ageHint: "From 3 years+",
      durationHint: "Usually 60 minutes",
      priceHint: "From £75 / 60 min session",
      blurb:
        "Supported climbing sessions that build strength, focus, and confidence. Routes and support levels are matched to each child.",
      venues: ["Westway"],
    },
    {
      id: "physical",
      name: "Physical Activity",
      tier: "core",
      ageHint: "From 12 years+",
      durationHint: "Usually 60 minutes",
      priceHint: "From £75 / 60 min session",
      blurb:
        "Active sessions focused on movement, coordination, and stamina — adapted so every child can take part safely and with clear structure.",
      venues: ["SwimFarm", "Acton"],
    },
    {
      id: "multi",
      name: "Multi-Activity",
      tier: "more",
      ageHint: "From 3 years+",
      durationHint: "Usually 90 minutes",
      priceHint: "From £120 / 90 min session",
      blurb:
        "Longer blocks that combine activities in one visit (for example pool plus land-based work). Ideal when families want variety in a single session.",
      venues: ["SwimFarm", "Northolt"],
    },
    {
      id: "bespoke",
      name: "Bespoke Programme",
      tier: "more",
      ageHint: "From 3 years+",
      durationHint: "Agreed with the office",
      priceHint: "From £125 / 60 min session",
      blurb:
        "A tailored programme built around your child’s goals, support needs, and schedule. Planned with the family and delivery team — enquire to start.",
      venues: ["SwimFarm", "Acton", "Westway"],
      enquireOnly: true,
    },
    {
      id: "day_centre",
      name: "Day Centre",
      tier: "more",
      ageHint: "From 3 years+",
      durationHint: "Multi-hour weekday blocks",
      priceHint: "Funding / bespoke quote",
      blurb:
        "Longer daytime blocks at SwimFarm with pool segments on some days. Places are planned with families and the office — enquire rather than instant-book.",
      venues: ["SwimFarm"],
      enquireOnly: true,
    },
    {
      id: "intensive",
      name: "Intensive Courses & Camps",
      tier: "more",
      ageHint: "From 3 years+",
      durationHint: "Half-term / summer blocks",
      priceHint: "Course packs — ask the office",
      blurb:
        "Holiday intensives and camps (for example climbing and swimming crash weeks). Limited daily places — join the list early; weekly packs often have priority.",
      venues: ["Westway", "Acton", "SwimFarm"],
      enquireOnly: true,
    },
  ];

  /** Illustrative weekly / holiday template — shapes match real MADRE-style slots. */
  var MOCK_SLOTS = [
    { id: "aq-act-mon-1600", serviceId: "aquatic", venue: "Acton", day: "Monday", timeLabel: "4.00 – 4.30", sortTime: "16:00", capacity: 1, taken: 1 },
    { id: "aq-act-mon-1630", serviceId: "aquatic", venue: "Acton", day: "Monday", timeLabel: "4.30 – 5.00", sortTime: "16:30", capacity: 1, taken: 0 },
    { id: "aq-act-mon-1700", serviceId: "aquatic", venue: "Acton", day: "Monday", timeLabel: "5.00 – 5.30", sortTime: "17:00", capacity: 1, taken: 0 },
    { id: "aq-act-wed-1600", serviceId: "aquatic", venue: "Acton", day: "Wednesday", timeLabel: "4.00 – 4.30", sortTime: "16:00", capacity: 1, taken: 1 },
    { id: "aq-act-wed-1630", serviceId: "aquatic", venue: "Acton", day: "Wednesday", timeLabel: "4.30 – 5.15", sortTime: "16:30", capacity: 1, taken: 0 },
    { id: "aq-act-fri-1600", serviceId: "aquatic", venue: "Acton", day: "Friday", timeLabel: "4.00 – 4.30", sortTime: "16:00", capacity: 1, taken: 0 },
    { id: "aq-nor-wed-1700", serviceId: "aquatic", venue: "Northolt", day: "Wednesday", timeLabel: "5.00 – 6.00", sortTime: "17:00", capacity: 1, taken: 1 },
    { id: "aq-nor-wed-1800", serviceId: "aquatic", venue: "Northolt", day: "Wednesday", timeLabel: "6.00 – 6.30", sortTime: "18:00", capacity: 1, taken: 0 },
    { id: "aq-nor-sat-1000", serviceId: "aquatic", venue: "Northolt", day: "Saturday", timeLabel: "10.00 – 10.30", sortTime: "10:00", capacity: 1, taken: 0 },
    { id: "aq-nor-sat-1030", serviceId: "aquatic", venue: "Northolt", day: "Saturday", timeLabel: "10.30 – 11.00", sortTime: "10:30", capacity: 1, taken: 1 },
    { id: "aq-sf-tue-1100", serviceId: "aquatic", venue: "SwimFarm", day: "Tuesday", timeLabel: "11.00 – 12.00", sortTime: "11:00", capacity: 2, taken: 2 },
    { id: "aq-sf-thu-1100", serviceId: "aquatic", venue: "SwimFarm", day: "Thursday", timeLabel: "11.00 – 12.00", sortTime: "11:00", capacity: 2, taken: 1 },

    { id: "cl-ww-tue-1000", serviceId: "climbing", venue: "Westway", day: "Tuesday", timeLabel: "10.00 – 11.00", sortTime: "10:00", capacity: 2, taken: 1 },
    { id: "cl-ww-tue-1100", serviceId: "climbing", venue: "Westway", day: "Tuesday", timeLabel: "11.00 – 12.00", sortTime: "11:00", capacity: 2, taken: 2 },
    { id: "cl-ww-thu-1200", serviceId: "climbing", venue: "Westway", day: "Thursday", timeLabel: "12.00 – 1.00", sortTime: "12:00", capacity: 2, taken: 0 },
    { id: "cl-ww-thu-1300", serviceId: "climbing", venue: "Westway", day: "Thursday", timeLabel: "1.00 – 2.00", sortTime: "13:00", capacity: 2, taken: 1 },
    { id: "cl-ww-sat-1000", serviceId: "climbing", venue: "Westway", day: "Saturday", timeLabel: "10.00 – 11.00", sortTime: "10:00", capacity: 2, taken: 2 },
    { id: "cl-ww-sat-1100", serviceId: "climbing", venue: "Westway", day: "Saturday", timeLabel: "11.00 – 12.00", sortTime: "11:00", capacity: 2, taken: 0 },

    { id: "ph-sf-tue-1400", serviceId: "physical", venue: "SwimFarm", day: "Tuesday", timeLabel: "2.00 – 3.00", sortTime: "14:00", capacity: 2, taken: 1 },
    { id: "ph-sf-thu-1400", serviceId: "physical", venue: "SwimFarm", day: "Thursday", timeLabel: "2.00 – 3.00", sortTime: "14:00", capacity: 2, taken: 2 },
    { id: "ph-act-sat-1100", serviceId: "physical", venue: "Acton", day: "Saturday", timeLabel: "11.00 – 12.00", sortTime: "11:00", capacity: 2, taken: 0 },
    { id: "ph-act-sat-1200", serviceId: "physical", venue: "Acton", day: "Saturday", timeLabel: "12.00 – 1.00", sortTime: "12:00", capacity: 2, taken: 1 },

    { id: "ma-sf-mon-1600", serviceId: "multi", venue: "SwimFarm", day: "Monday", timeLabel: "4.00 – 5.30", sortTime: "16:00", capacity: 2, taken: 2 },
    { id: "ma-sf-wed-1600", serviceId: "multi", venue: "SwimFarm", day: "Wednesday", timeLabel: "4.00 – 5.30", sortTime: "16:00", capacity: 2, taken: 1 },
    { id: "ma-nor-sat-0930", serviceId: "multi", venue: "Northolt", day: "Saturday", timeLabel: "9.30 – 11.00", sortTime: "09:30", capacity: 2, taken: 0 },
    { id: "ma-nor-sat-1130", serviceId: "multi", venue: "Northolt", day: "Saturday", timeLabel: "11.30 – 1.00", sortTime: "11:30", capacity: 2, taken: 2 },

    { id: "bs-sf-tue-1000", serviceId: "bespoke", venue: "SwimFarm", day: "Tuesday", timeLabel: "10.00 – 11.00", sortTime: "10:00", capacity: 1, taken: 1 },
    { id: "bs-act-thu-1500", serviceId: "bespoke", venue: "Acton", day: "Thursday", timeLabel: "3.00 – 4.00", sortTime: "15:00", capacity: 1, taken: 0 },
    { id: "bs-ww-fri-1100", serviceId: "bespoke", venue: "Westway", day: "Friday", timeLabel: "11.00 – 12.00", sortTime: "11:00", capacity: 1, taken: 1 },

    { id: "dc-sf-mon-1100", serviceId: "day_centre", venue: "SwimFarm", day: "Monday", timeLabel: "11.00 – 4.00", sortTime: "11:00", capacity: 4, taken: 4 },
    { id: "dc-sf-wed-1100", serviceId: "day_centre", venue: "SwimFarm", day: "Wednesday", timeLabel: "11.00 – 4.00", sortTime: "11:00", capacity: 4, taken: 3 },
    { id: "dc-sf-fri-1230", serviceId: "day_centre", venue: "SwimFarm", day: "Friday", timeLabel: "12.30 – 3.00", sortTime: "12:30", capacity: 3, taken: 3 },

    { id: "in-ww-tue-1000", serviceId: "intensive", venue: "Westway", day: "Tuesday", timeLabel: "10.00 – 12.00 · Climb camp", sortTime: "10:00", capacity: 2, taken: 2 },
    { id: "in-ww-wed-1000", serviceId: "intensive", venue: "Westway", day: "Wednesday", timeLabel: "10.00 – 12.00 · Climb camp", sortTime: "10:00", capacity: 2, taken: 1 },
    { id: "in-act-thu-1000", serviceId: "intensive", venue: "Acton", day: "Thursday", timeLabel: "10.00 – 12.00 · Swim camp", sortTime: "10:00", capacity: 8, taken: 8 },
    { id: "in-act-fri-1000", serviceId: "intensive", venue: "Acton", day: "Friday", timeLabel: "10.00 – 12.00 · Swim camp", sortTime: "10:00", capacity: 8, taken: 5 },
    { id: "in-sf-mon-1100", serviceId: "intensive", venue: "SwimFarm", day: "Monday", timeLabel: "11.00 – 3.00 · Holiday block", sortTime: "11:00", capacity: 6, taken: 6 },
  ];

  var DAY_ORDER = {
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
    Sunday: 7,
  };

  function seatsLeft(slot) {
    return Math.max(0, Number(slot.capacity || 0) - Number(slot.taken || 0));
  }

  function isFull(slot) {
    return seatsLeft(slot) <= 0;
  }

  function serviceById(id) {
    for (var i = 0; i < SERVICES.length; i++) {
      if (SERVICES[i].id === id) return SERVICES[i];
    }
    return null;
  }

  function venueLabel(venue) {
    var k = String(venue || "").trim();
    return VENUE_LABELS[k] || k;
  }

  /** Group slots: venue → day → slots[] (preserves day/time sort of filterSlots). */
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
        return (DAY_ORDER[a] || 99) - (DAY_ORDER[b] || 99);
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
      services: SERVICES.map(function (s) {
        return { id: s.id, name: s.name };
      }),
      venues: uniqueSorted(MOCK_SLOTS.map(function (s) {
        return s.venue;
      })),
      days: uniqueSorted(MOCK_SLOTS.map(function (s) {
        return s.day;
      })),
      times: uniqueSorted(
        MOCK_SLOTS.map(function (s) {
          return s.timeLabel;
        }).sort(function (a, b) {
          var sa = MOCK_SLOTS.find(function (x) {
            return x.timeLabel === a;
          });
          var sb = MOCK_SLOTS.find(function (x) {
            return x.timeLabel === b;
          });
          return String((sa && sa.sortTime) || "").localeCompare(String((sb && sb.sortTime) || ""));
        })
      ),
    };
  }

  /**
   * @param {{ serviceId?: string, venue?: string, day?: string, timeLabel?: string, hideFull?: boolean }} filters
   */
  function filterSlots(filters) {
    filters = filters || {};
    return MOCK_SLOTS.filter(function (slot) {
      if (filters.serviceId && slot.serviceId !== filters.serviceId) return false;
      if (filters.venue && slot.venue !== filters.venue) return false;
      if (filters.day && slot.day !== filters.day) return false;
      if (filters.timeLabel && slot.timeLabel !== filters.timeLabel) return false;
      if (filters.hideFull && isFull(slot)) return false;
      return true;
    }).sort(function (a, b) {
      var d = (DAY_ORDER[a.day] || 99) - (DAY_ORDER[b.day] || 99);
      if (d) return d;
      var t = String(a.sortTime).localeCompare(String(b.sortTime));
      if (t) return t;
      return String(a.venue).localeCompare(String(b.venue));
    });
  }

  global.PortalBookingOfferMock = {
    SERVICES: SERVICES,
    MOCK_SLOTS: MOCK_SLOTS,
    TERM_BADGE: TERM_BADGE,
    TERM_LABEL: TERM_LABEL,
    TERM_RANGE: TERM_RANGE,
    serviceById: serviceById,
    venueLabel: venueLabel,
    seatsLeft: seatsLeft,
    isFull: isFull,
    filterOptions: filterOptions,
    filterSlots: filterSlots,
    groupSlotsByVenueThenDay: groupSlotsByVenueThenDay,
  };
})(typeof window !== "undefined" ? window : globalThis);
