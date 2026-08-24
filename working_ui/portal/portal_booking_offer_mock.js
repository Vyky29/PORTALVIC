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
  var TERM_RANGE = "Sat 5th September 2026 – Fri 18th December 2026";

  /** Inclusive ISO dates · weekly offer calendar (closures excluded). */
  var TERM_CALENDAR = {
    start: "2026-09-05",
    end: "2026-12-18",
    closedRanges: [{ start: "2026-10-26", end: "2026-10-30" }],
  };

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
    Westway: "Westway Centre",
    Chiswick: "Chiswick / Zoom",
  };

  var SERVICES = [
    {
      id: "aquatic",
      name: "Aquatic Activity",
      tier: "core",
      ageHint: "From 3 years+",
      durationHint: "Usually 30 minutes",
      priceHint: "From £50 / 30 min session",
      pricePerSession: 50,
      blurb:
        "Swimming and hydrotherapy with autism specialists — more than a standard pool lesson. Person-centred sessions with visual supports, focused on water confidence, communication, emotional regulation, and independence at the participant’s pace.",
      venues: ["Acton", "Northolt", "SwimFarm"],
    },
    {
      id: "climbing",
      name: "Climbing Activity",
      tier: "core",
      ageHint: "From 3 years+",
      durationHint: "Usually 60 minutes",
      priceHint: "From £75 / 60 min session",
      pricePerSession: 75,
      blurb:
        "Structured climbing led by autism specialists. Builds agility, balance, coordination, and confidence, with 1:1 support, clear routines, and visual aids so each participant can progress safely.",
      venues: ["Westway"],
    },
    {
      id: "physical",
      name: "Physical Activity",
      tier: "core",
      ageHint: "From 12 years+",
      durationHint: "Usually 60 minutes",
      priceHint: "From £75 / 60 min session",
      pricePerSession: 75,
      blurb:
        "Fitness with personal trainers from our autism specialists team — strength, cardio, and movement circuits. Improves motor skills, energy regulation, and confidence in a structured session every participant can succeed in.",
      venues: ["SwimFarm", "Acton"],
    },
    {
      id: "multi",
      name: "Multi-Activity",
      tier: "more",
      ageHint: "From 3 years+",
      durationHint: "Usually 90 minutes",
      priceHint: "From £120 / 90 min session",
      pricePerSession: 120,
      blurb:
        "Splash & Connect: a 90-minute multidisciplinary block — land-based learning (communication, social skills, independence) plus swimming. One visit that supports mind and body for the participant.",
      venues: ["SwimFarm", "Northolt"],
    },
    {
      id: "bespoke",
      name: "Bespoke Programme",
      tier: "more",
      ageHint: "From 3 years+",
      durationHint: "Agreed with the office",
      priceHint: "From £125 / 60 min session",
      pricePerSession: 125,
      blurb:
        "An individualised 1:1 programme around the participant’s goals — social communication, independence, and emotional and physical well-being. Arranged with the office after enquiry; we do not publish bookable Bespoke slots online.",
      venues: ["SwimFarm", "Acton", "Westway"],
      enquireOnly: true,
    },
    {
      id: "day_centre",
      name: "Day Centre",
      tier: "more",
      ageHint: "From 3 years+",
      durationHint: "Mon–Fri · 11am – 4pm",
      priceHint: "Funding / bespoke quote",
      blurb:
        "A structured weekday at SwimFarm (Mon–Fri, 11am–4pm): circle time, vocational and classroom work, gym, swimming, life skills, and peer activities — with 1:1 on site (2:1 when transitions, personal care, or community trips need it). Places are agreed with the office first.",
      venues: ["SwimFarm"],
      enquireOnly: true,
      infoHours: "Open Monday to Friday, 11am – 4pm at SwimFarm.",
      infoActivities: [
        "Circle time and shared Hub activities with peers",
        "Vocational tasks (packing, matching, envelopes) plus maths and handwriting",
        "Gym circuits, basketball, and structured physical activity",
        "Swimming / aquatic within the day",
        "Lunch, life skills, and group snack",
        "Sensory room and regulation time",
        "Karaoke, film, and end-of-day photo résumé",
        "Community trips (shops, local outings) with 2:1 when planned",
      ],
    },
    {
      id: "counselling",
      name: "Counselling",
      tier: "more",
      ageHint: "Young people & adults",
      durationHint: "Face to face or Zoom",
      priceHint: "Enquire with the office",
      blurb:
        "Counselling for young people and adults with autism and their families. Person-centred sessions to explore what concerns you — face to face in Chiswick or online via Zoom. Short-term (4–6 weeks) or longer; starts with a short assessment call.",
      venues: ["Chiswick"],
      enquireOnly: true,
    },
    {
      id: "intensive",
      name: "Intensive Courses & Camps",
      tier: "more",
      ageHint: "From 3 years+",
      durationHint: "Summer crash + half-term blocks",
      blurb:
        "Holiday crash courses and camps for continuity outside term time — swimming, climbing, and more in short intensive blocks (summer and half terms). Predictable routines, specialist staff, and limited daily places for participants.",
      venues: ["Westway", "Acton"],
      intensiveBlocks: true,
    },
  ];

  /**
   * Intensive / crash blocks (different date ranges — not weekly term slots).
   * Source map: portal_reenrolment_2026_27 RE_CRASH_DATES_2627 + summer crash copy.
   */
  var INTENSIVE_BLOCKS = [
    {
      id: "summer_july",
      badge: "Summer Holidays 2026",
      title: "Summer holiday crash courses",
      range:
        "FULLY BOOKED\nWeek 1: Climbing Mon 20 – Thu 23 July · Aquatic Activity Tue 21 – Fri 24 July\nWeek 2: Tue 28 – Fri 31 July",
      badgeIcon: "sun",
      sort: 1,
      dates: [
        { iso: "2026-07-21", label: "21 Jul" },
        { iso: "2026-07-22", label: "22 Jul" },
        { iso: "2026-07-23", label: "23 Jul" },
        { iso: "2026-07-24", label: "24 Jul" },
      ],
    },
    {
      id: "oct_ht",
      badge: "AUTUMN HALF TERM 2026",
      title: "Autumn half-term intensives",
      range: "Mon 26 – Thu 29 October 2026",
      badgeIcon: "leaf",
      sort: 2,
      dates: [
        { iso: "2026-10-26", label: "26 Oct" },
        { iso: "2026-10-27", label: "27 Oct" },
        { iso: "2026-10-28", label: "28 Oct" },
        { iso: "2026-10-29", label: "29 Oct" },
      ],
    },
    {
      id: "feb_ht",
      badge: "SPRING HALF TERM 2027",
      title: "Spring half-term intensives",
      range: "Mon 15 – Thu 18 February 2027",
      badgeIcon: "leaf",
      sort: 3,
      dates: [
        { iso: "2027-02-15", label: "15 Feb" },
        { iso: "2027-02-16", label: "16 Feb" },
        { iso: "2027-02-17", label: "17 Feb" },
        { iso: "2027-02-18", label: "18 Feb" },
      ],
    },
    {
      id: "may_ht",
      badge: "SUMMER HALF TERM 2027",
      title: "Summer half-term intensives",
      range: "Mon 31 May – Thu 3 June 2027",
      badgeIcon: "leaf",
      sort: 4,
      dates: [
        { iso: "2027-05-31", label: "31 May" },
        { iso: "2027-06-01", label: "1 Jun" },
        { iso: "2027-06-02", label: "2 Jun" },
        { iso: "2027-06-03", label: "3 Jun" },
      ],
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

    /* Bespoke + Day Centre: no public slots (office enquire / assess first). */

    /* Summer crash · Week 1 (Tue–Fri 21–24 July) */
    { id: "in-s1-ww-tue", serviceId: "intensive", blockId: "summer_july", venue: "Westway", day: "Week 1 · Tue 21 Jul", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 2 },
    { id: "in-s1-ww-wed", serviceId: "intensive", blockId: "summer_july", venue: "Westway", day: "Week 1 · Wed 22 Jul", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 2 },
    { id: "in-s1-ww-thu", serviceId: "intensive", blockId: "summer_july", venue: "Westway", day: "Week 1 · Thu 23 Jul", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 2 },
    { id: "in-s1-ww-fri", serviceId: "intensive", blockId: "summer_july", venue: "Westway", day: "Week 1 · Fri 24 Jul", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 2 },
    { id: "in-s1-act-tue", serviceId: "intensive", blockId: "summer_july", venue: "Acton", day: "Week 1 · Tue 21 Jul", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 8 },
    { id: "in-s1-act-wed", serviceId: "intensive", blockId: "summer_july", venue: "Acton", day: "Week 1 · Wed 22 Jul", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 8 },
    { id: "in-s1-act-thu", serviceId: "intensive", blockId: "summer_july", venue: "Acton", day: "Week 1 · Thu 23 Jul", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 8 },
    { id: "in-s1-act-fri", serviceId: "intensive", blockId: "summer_july", venue: "Acton", day: "Week 1 · Fri 24 Jul", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 8 },

    /* Week 2 is fully booked; no bookable public slots are shown. */

    /* October half term 2026 Mon–Thu */
    { id: "in-oct-ww-mon", serviceId: "intensive", blockId: "oct_ht", venue: "Westway", day: "Mon 26 Oct", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 1 },
    { id: "in-oct-ww-tue", serviceId: "intensive", blockId: "oct_ht", venue: "Westway", day: "Tue 27 Oct", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 2 },
    { id: "in-oct-ww-wed", serviceId: "intensive", blockId: "oct_ht", venue: "Westway", day: "Wed 28 Oct", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 0 },
    { id: "in-oct-ww-thu", serviceId: "intensive", blockId: "oct_ht", venue: "Westway", day: "Thu 29 Oct", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 1 },
    { id: "in-oct-act-mon", serviceId: "intensive", blockId: "oct_ht", venue: "Acton", day: "Mon 26 Oct", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 8 },
    { id: "in-oct-act-tue", serviceId: "intensive", blockId: "oct_ht", venue: "Acton", day: "Tue 27 Oct", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 3 },
    { id: "in-oct-act-wed", serviceId: "intensive", blockId: "oct_ht", venue: "Acton", day: "Wed 28 Oct", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 5 },
    { id: "in-oct-act-thu", serviceId: "intensive", blockId: "oct_ht", venue: "Acton", day: "Thu 29 Oct", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 0 },

    /* February half term 2027 Mon–Thu */
    { id: "in-feb-ww-mon", serviceId: "intensive", blockId: "feb_ht", venue: "Westway", day: "Mon 15 Feb", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 0 },
    { id: "in-feb-ww-tue", serviceId: "intensive", blockId: "feb_ht", venue: "Westway", day: "Tue 16 Feb", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 1 },
    { id: "in-feb-ww-wed", serviceId: "intensive", blockId: "feb_ht", venue: "Westway", day: "Wed 17 Feb", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 2 },
    { id: "in-feb-ww-thu", serviceId: "intensive", blockId: "feb_ht", venue: "Westway", day: "Thu 18 Feb", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 0 },
    { id: "in-feb-act-mon", serviceId: "intensive", blockId: "feb_ht", venue: "Acton", day: "Mon 15 Feb", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 2 },
    { id: "in-feb-act-tue", serviceId: "intensive", blockId: "feb_ht", venue: "Acton", day: "Tue 16 Feb", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 8 },
    { id: "in-feb-act-wed", serviceId: "intensive", blockId: "feb_ht", venue: "Acton", day: "Wed 17 Feb", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 4 },
    { id: "in-feb-act-thu", serviceId: "intensive", blockId: "feb_ht", venue: "Acton", day: "Thu 18 Feb", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 1 },

    /* May half term 2027 Mon–Thu */
    { id: "in-may-ww-mon", serviceId: "intensive", blockId: "may_ht", venue: "Westway", day: "Mon 31 May", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 2 },
    { id: "in-may-ww-tue", serviceId: "intensive", blockId: "may_ht", venue: "Westway", day: "Tue 1 Jun", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 0 },
    { id: "in-may-ww-wed", serviceId: "intensive", blockId: "may_ht", venue: "Westway", day: "Wed 2 Jun", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 1 },
    { id: "in-may-ww-thu", serviceId: "intensive", blockId: "may_ht", venue: "Westway", day: "Thu 3 Jun", timeLabel: "10.00 – 12.00 · Climbing", sortTime: "10:00", capacity: 2, taken: 0 },
    { id: "in-may-act-mon", serviceId: "intensive", blockId: "may_ht", venue: "Acton", day: "Mon 31 May", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 6 },
    { id: "in-may-act-tue", serviceId: "intensive", blockId: "may_ht", venue: "Acton", day: "Tue 1 Jun", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 2 },
    { id: "in-may-act-wed", serviceId: "intensive", blockId: "may_ht", venue: "Acton", day: "Wed 2 Jun", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 8 },
    { id: "in-may-act-thu", serviceId: "intensive", blockId: "may_ht", venue: "Acton", day: "Thu 3 Jun", timeLabel: "10.00 – 12.00 · Swimming", sortTime: "10:00", capacity: 8, taken: 3 },
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
    var ranges = TERM_CALENDAR.closedRanges || [];
    for (var i = 0; i < ranges.length; i++) {
      if (iso >= ranges[i].start && iso <= ranges[i].end) return true;
    }
    return false;
  }

  /**
   * All remaining/past session dates for a weekday in the current term.
   * @returns {{ iso: string, label: string, past: boolean }[]}
   */
  function termDatesForWeekday(dayName, asOf) {
    var want = WEEKDAY_NUM[dayName];
    if (want == null) return [];
    var start = parseIsoDate(TERM_CALENDAR.start);
    var end = parseIsoDate(TERM_CALENDAR.end);
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

  /** Remaining sessions + priced total (parents pay remaining only). */
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

  /** Mark intensive block dates past/remaining (chips under Summer / half-term heads). */
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
    for (var i = 0; i < INTENSIVE_BLOCKS.length; i++) {
      if (INTENSIVE_BLOCKS[i].id === id) return INTENSIVE_BLOCKS[i];
    }
    return null;
  }

  /** Intensive slots → ordered blocks with venue→day grouping inside each. */
  function groupIntensiveByBlock(slots) {
    var byBlock = Object.create(null);
    (slots || []).forEach(function (slot) {
      var bid = String(slot.blockId || "").trim() || "other";
      if (!byBlock[bid]) byBlock[bid] = [];
      byBlock[bid].push(slot);
    });
    return INTENSIVE_BLOCKS.map(function (block) {
      var list = byBlock[block.id] || [];
      return {
        block: block,
        venues: groupSlotsByVenueThenDay(list),
      };
    }).filter(function (row) {
      return row.venues.length > 0;
    });
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

  global.PortalBookingOfferMock = {
    SERVICES: SERVICES,
    MOCK_SLOTS: MOCK_SLOTS,
    INTENSIVE_BLOCKS: INTENSIVE_BLOCKS,
    TERM_BADGE: TERM_BADGE,
    TERM_LABEL: TERM_LABEL,
    TERM_RANGE: TERM_RANGE,
    TERM_CALENDAR: TERM_CALENDAR,
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
})(typeof window !== "undefined" ? window : globalThis);
