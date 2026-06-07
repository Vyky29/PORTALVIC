/**
 * Portal guide demo roster — loaded only for staff `teflon` / `?portalPreview=teflon`.
 * Not merged into STAFF_DASHBOARD_SOURCE (other staff and admin stay unchanged).
 */
(function () {
  var ISO_TODAY = "2026-06-04";
  var ISO_TOMORROW = "2026-06-05";

  var ROWS = [
    {
      client_name: "Mari Trini",
      day: "Thursday",
      instructors: "TEFLON",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "9 to 10",
      venue: "Acton",
      session_date: ISO_TODAY,
    },
    {
      client_name: "Vitin",
      day: "Thursday",
      instructors: "TEFLON",
      service: "Bespoke Programme",
      area: "Client's Home",
      time_slot: "10 to 11",
      venue: "Chelsea",
      session_date: ISO_TODAY,
    },
    {
      client_name: "Sam",
      day: "Thursday",
      instructors: "TEFLON",
      service: "Multi-Activity",
      area: "Hub Room",
      time_slot: "11 to 12",
      venue: "SwimFarm",
      session_date: ISO_TODAY,
    },
    {
      client_name: "Jordan",
      day: "Thursday",
      instructors: "TEFLON",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "2 to 3",
      venue: "Northolt",
      session_date: ISO_TODAY,
    },
    {
      client_name: "Alex Guide",
      day: "Friday",
      instructors: "TEFLON",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "9.30 to 10.30",
      venue: "Acton",
      session_date: ISO_TOMORROW,
    },
    {
      client_name: "Maya Guide",
      day: "Friday",
      instructors: "TEFLON",
      service: "Bespoke Programme",
      area: "Client's Home",
      time_slot: "10.30 to 11.30",
      venue: "Chelsea",
      session_date: ISO_TOMORROW,
    },
    {
      client_name: "Leo Guide",
      day: "Friday",
      instructors: "TEFLON",
      service: "Multi-Activity",
      area: "Hub Room",
      time_slot: "11.30 to 12.30",
      venue: "SwimFarm",
      session_date: ISO_TOMORROW,
    },
    {
      client_name: "Nia Guide",
      day: "Friday",
      instructors: "TEFLON",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "3 to 4",
      venue: "Northolt",
      session_date: ISO_TOMORROW,
    },
  ];

  var CLIENTS_INFO = [
    {
      client_name: "Mari Trini",
      client_info:
        "1. Goals: Build water confidence and independent entry.\n2. Medical: None.\n3. Communication: Uses visuals and short phrases.",
    },
    {
      client_name: "Sam",
      client_info:
        "1. Goals: Social participation in group activities.\n2. Medical: None known.\n3. Communication: Verbal — prefers calm, step-by-step instructions.",
    },
    {
      client_name: "Vitin",
      client_info:
        "1. Goals: Maintain mobility and routine through home-based bespoke sessions.\n2. Medical: None known.\n3. Communication: Verbal — family present at home visits.",
    },
    {
      client_name: "Jordan",
      client_info:
        "1. Goals: Improve pool entry routine and floating.\n2. Medical: Epilepsy — emergency medication in bag; staff briefed on seizure protocol.\n3. Communication: Non-verbal; responds to gestures and picture cards.",
    },
    {
      client_name: "Alex Guide",
      client_info:
        "1. Goals: Trial aquatic session — guide demo only.\n2. Medical: None.\n3. Communication: Verbal.",
    },
    {
      client_name: "Maya Guide",
      client_info:
        "1. Goals: Home bespoke mobility — guide demo only.\n2. Medical: None known.\n3. Communication: Family present.",
    },
    {
      client_name: "Leo Guide",
      client_info:
        "1. Goals: Hub multi-activity social skills — guide demo only.\n2. Medical: None.\n3. Communication: Step-by-step verbal.",
    },
    {
      client_name: "Nia Guide",
      client_info:
        "1. Goals: Pool routine practice — guide demo only.\n2. Medical: None.\n3. Communication: Picture cards.",
    },
  ];

  /** Card colours for guide photos (sessionReviewMapMemory keys). */
  var REVIEW_BY_ISO = {
    "2026-06-04": [
      { cid: "mari_trini", start: "09:00", scheduled: true },
      { cid: "vitin", start: "10:00" },
      { cid: "sam", start: "11:00", feedbackDone: true },
      { cid: "jordan", start: "14:00", incident: true },
    ],
    "2026-06-05": [
      { cid: "alex_guide", start: "09:30", scheduled: true },
      { cid: "maya_guide", start: "10:30" },
      { cid: "leo_guide", start: "11:30", feedbackDone: true },
      { cid: "nia_guide", start: "15:00", absent: true },
    ],
  };

  var SHOWCASE_ISOS = Object.keys(REVIEW_BY_ISO);

  window.PortalTeflonGuideDemoData = {
    defaultIso: ISO_TODAY,
    tomorrowIso: ISO_TOMORROW,
    showcaseIsos: SHOWCASE_ISOS,
    rows: ROWS,
    clientsInfo: CLIENTS_INFO,
    reviewByIso: REVIEW_BY_ISO,
    profile: {
      staffId: "teflon",
      staffName: "Teflon",
      avatarFile: "portal/staff_photos/teflon.png",
      staffRoleTrack: "swimming",
      canViewAll: false,
    },
    isShowcaseIso: function (iso) {
      return SHOWCASE_ISOS.indexOf(String(iso || "").trim().slice(0, 10)) >= 0;
    },
    weekdayForIso: function (iso) {
      var key = String(iso || "").trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "Thursday";
      try {
        return new Date(key + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long" });
      } catch (_) {
        return "Thursday";
      }
    },
  };
})();
