/**
 * Single roster resolution pipeline for admin + staff dashboards.
 *
 * Runtime truth:
 *   1. Base rows: `staff_dashboard_spreadsheet_bundle.js` → STAFF_DASHBOARD_SOURCE.rows
 *   2. Overlay: Supabase `portal_roster_rows` (templates + dated exceptions)
 *   3. Autumn 26/27 standing patches (Day Centre who-with-whom + Hub Bespoke rota + Cyrus)
 *
 * Day-of operational changes (cover, cancel, add) stay in `schedule_overrides` and are
 * applied when building today's session cards — not duplicated here.
 *
 * Deprecated for roster (do not use to build rows):
 *   - SESSION_FEEDBACK_STATUS_PORTAL_SOURCE projection
 *   - ROSTER_TERM_MASTER_DASHBOARD_ROWS at runtime (build/export seed only)
 *   - Multiple copies of the bundle outside working_ui/portal/
 */
(function (global) {
  "use strict";

  var SOURCE_ID = "live_madre+bundle+portal_roster_rows";
  var SOURCE_VERSION = 95;

  /** Standing snap dates (pre-crash) — Services / staff weekday projection source. */
  var DAY_CENTRE_STANDING_ISO = {
    monday: "2026-07-13",
    tuesday: "2026-07-14",
    wednesday: "2026-07-15",
    thursday: "2026-07-16",
    friday: "2026-07-17",
  };

  var DAY_CENTRE_STANDING_ISO_SET = {
    "2026-07-13": 1,
    "2026-07-14": 1,
    "2026-07-15": 1,
    "2026-07-16": 1,
    "2026-07-17": 1,
  };

  /**
   * Autumn 26/27 Day Centre standing (ops truth for Services + staff snap).
   * Order = board column order. Times match MADRE-style "11 to 1" / "12.30 to 3".
   * Cyrus (Victor Tue 3.30-5) is Bespoke — not listed here; see CYRUS_BESPOKE_ROW.
   * Youssef Acton days (Mon/Thu): DC ends 15:00 then pool from 16:00.
   * Friday: Roberto DC 11-3 then Hub Bespoke Tinashe 4.15-6.15 with Bismark + Emanuel (from Fri 11);
   * Youssef DC through 16:00 then Acton aquatic.
   */
  var AUTUMN_DAY_CENTRE_BOARD = {
    monday: [
      {
        staff: "Roberto",
        clients: [
          { name: "Emanuel", time: "11 to 1" },
          { name: "Fadi", time: "1 to 3" },
        ],
      },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      /* Victor OFF Mondays and Thursdays (DC) */
      { staff: "Victor", clients: [] },
      {
        staff: "Raul",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "1 to 4" },
        ],
      },
      { staff: "Youssef", clients: [{ name: "Fadi", time: "12.30 to 3" }] },
    ],
    tuesday: [
      {
        staff: "Roberto",
        clients: [
          { name: "ACAT", time: "11 to 12" },
          { name: "Ikram", time: "12 to 3" },
        ],
      },
      /* Michelle Tue: Ikram 11–12, Manager 12–3, Ikram 3–4. */
      {
        staff: "Michelle",
        clients: [
          { name: "Ikram", time: "11 to 12" },
          { name: "Manager", time: "12 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      /* Raul OFF Tuesdays (no DC). Ikram 3-4 stays Michelle; Fadi cancelled while absent to 18 Sep. */
      { staff: "Raul", clients: [] },
      /* Victor Tue: Cyrus Bespoke 3.30–5 (not DC) — see CYRUS_BESPOKE_ROW. */
      { staff: "Victor", clients: [] },
      { staff: "Youssef", clients: [] },
    ],
    wednesday: [
      {
        staff: "Roberto",
        /* Wed: Emanuel morning + Fadi through 15:00; no Emanuel 3–4 */
        clients: [
          { name: "Emanuel", time: "11 to 12.30" },
          { name: "Fadi", time: "12.30 to 3" },
        ],
      },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      {
        staff: "Victor",
        clients: [
          /* Fadi Wed is Roberto + Raul; Victor has Emanuel mid-block */
          { name: "Emanuel", time: "12.30 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      {
        staff: "Raul",
        clients: [
          { name: "Fadi", time: "12.30 to 3" },
          { name: "Emanuel", time: "3 to 4" },
        ],
      },
    ],
    thursday: [
      { staff: "Roberto", clients: [{ name: "Fadi", time: "12.30 to 3" }] },
      { staff: "Youssef", clients: [{ name: "Fadi", time: "12.30 to 3" }] },
    ],
    friday: [
      {
        staff: "Roberto",
        clients: [
          { name: "Emanuel", time: "11 to 1" },
          { name: "Fadi", time: "1 to 3" },
        ],
      },
      /* Michelle + Luliya Ikram to 4; Victor + Raul Timi then Emanuel 1–4; Youssef Fadi to 3 (Acton from 4). */
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
      {
        staff: "Victor",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "1 to 4" },
        ],
      },
      {
        staff: "Raul",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "1 to 4" },
        ],
      },
      {
        staff: "Youssef",
        clients: [{ name: "Fadi", time: "12.30 to 3" }],
      },
    ],
  };

  var CYRUS_BESPOKE_ROW = {
    client_name: "Cyrus",
    day: "Tuesday",
    instructors: "VICTOR",
    service: "Bespoke Programme",
    area: "Hub Room",
    time_slot: "3.30 to 5",
    venue: "SwimFarm",
    session_date: "2026-07-14",
  };

  /**
   * Autumn 26/27 Hub afternoon Bespoke — LOCAL EXTRA standing (from Wed 9 Sep 2026):
   * Mon: Godsway / John / Raul / Bismark (+ Emanuel from Mon 14);
   * Wed: Godsway / Bismark / Emanuel (shadowing Bismark) from Wed 9; John when not off
   *     (John day off Wed 9 + Wed 15 + Wed 16); Raul off Tinashe Wed from 9;
   * Fri: Bespoke Bismark / Roberto / Emanuel (from Fri 11).
   * Tue/Thu Hub: no Bespoke afternoon shift (Cyrus Tue is Victor 3.30-5 only).
   */
  var AUTUMN_BESPOKE_HUB_ROWS = [
    {
      client_name: "Tinashe",
      day: "Monday",
      instructors: "GODSWAY",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-13",
    },
    {
      client_name: "Tinashe",
      day: "Monday",
      instructors: "JOHN",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-13",
    },
    {
      client_name: "Tinashe",
      day: "Monday",
      instructors: "RAUL",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-13",
    },
    {
      client_name: "Tinashe",
      day: "Monday",
      instructors: "BISMARK",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-13",
    },
    {
      client_name: "Tinashe",
      day: "Monday",
      instructors: "EMANUEL",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-13",
    },
    {
      client_name: "Tinashe",
      day: "Wednesday",
      instructors: "GODSWAY",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-15",
    },
    {
      client_name: "Tinashe",
      day: "Wednesday",
      instructors: "JOHN",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-15",
    },
    {
      client_name: "Tinashe",
      day: "Wednesday",
      instructors: "BISMARK",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-15",
    },
    {
      client_name: "Tinashe",
      day: "Wednesday",
      instructors: "EMANUEL",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-15",
    },
    /* Pre-Wed-9 history: Raul still on Wed template; stripped from 2026-09-09 via remap. */
    {
      client_name: "Tinashe",
      day: "Wednesday",
      instructors: "RAUL",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-15",
    },
    {
      client_name: "Tinashe",
      day: "Friday",
      instructors: "ROBERTO",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-17",
    },
    {
      client_name: "Tinashe",
      day: "Friday",
      instructors: "BISMARK",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-17",
    },
    {
      client_name: "Tinashe",
      day: "Friday",
      instructors: "EMANUEL",
      service: "Bespoke Programme",
      area: "Hub Room",
      time_slot: "4.30 to 6",
      venue: "SwimFarm",
      session_date: "2026-07-17",
    },
  ];

  /** Week 1 DC only (Tue 1 – Fri 4 Sep 2026). Dated rows so Today cards match ops, not Jul snap. */
  var WEEK1_DC_ISO = {
    tuesday: "2026-09-01",
    wednesday: "2026-09-02",
    thursday: "2026-09-03",
    friday: "2026-09-04",
  };
  var WEEK1_DC_BOARD = {
    tuesday: [
      { staff: "Roberto", clients: [{ name: "Ikram", time: "11 to 3" }] },
      {
        staff: "Michelle",
        clients: [
          { name: "Manager", time: "11 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
    ],
    wednesday: [
      { staff: "Roberto", clients: [{ name: "Emanuel", time: "11 to 4" }] },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
    ],
    thursday: [
      { staff: "Roberto", clients: [] },
      { staff: "Youssef", clients: [] },
    ],
    friday: [
      { staff: "Roberto", clients: [{ name: "Emanuel", time: "11 to 4" }] },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Victor", clients: [{ name: "Timi", time: "11 to 1" }] },
      { staff: "Raul", clients: [{ name: "Timi", time: "11 to 1" }] },
      { staff: "Youssef", clients: [] },
    ],
  };

  function autumnWeek1DayCentreRows() {
    var out = [];
    Object.keys(WEEK1_DC_BOARD).forEach(function (dk) {
      var iso = WEEK1_DC_ISO[dk];
      var dayTitle = DOW_TITLE[dk] || dk;
      (WEEK1_DC_BOARD[dk] || []).forEach(function (col) {
        (col.clients || []).forEach(function (c) {
          out.push({
            client_name: c.name,
            day: dayTitle,
            instructors: String(col.staff || "").toUpperCase(),
            service: "Day Centre",
            area: c.name && String(c.name).toLowerCase() === "manager" ? "Hub · Manager" : "Hub Room",
            time_slot: c.time,
            venue: "SwimFarm",
            session_date: iso,
          });
        });
      });
    });
    return out;
  }

  /**
   * Standing Tue Acton AS (from Mon 7 Sep): Roberto / Aurora / Javier / Luliya.
   * Serine → Roberto 4.30–5.30; Logan → Luliya 5–5.30; Richard → Roberto; no Youssef.
   */
  /**
   * Acton Tue pool notes: match Summer where known (Junaid Lane SE; Adam Mahmmoud = Teaching Pool).
   * Aydaan + Adaam 6–6.30 (Javier Lane SE / Luliya Teaching Pool). Aurora 5.30 open.
   */
  var AUTUMN_ACTON_TUESDAY_BOARD = [
    { staff: "ROBERTO", name: "Christian Abate", time: "4 to 4.30", area: "Lane (DE)" },
    { staff: "ROBERTO", name: "Serine", time: "4.30 to 5.30", area: "Lane (DE)" },
    { staff: "ROBERTO", name: "No participant", time: "5.30 to 6", area: "Lane (DE)" },
    { staff: "ROBERTO", name: "Richard", time: "6 to 6.30", area: "Lane (DE)" },
    /* On shift from 4 — empty seat is open (No participant), never Closed. */
    { staff: "LULIYA", name: "Emmanuel Abate", time: "4 to 4.30", area: "Lane (DE)" },
    { staff: "LULIYA", name: "No participant", time: "4.30 to 5", area: "Lane (DE)" },
    { staff: "LULIYA", name: "Logan", time: "5 to 5.30", area: "Lane (DE)" },
    { staff: "LULIYA", name: "No participant", time: "5.30 to 6", area: "Lane (DE)" },
    { staff: "LULIYA", name: "Adaam Ah", time: "6 to 6.30", area: "Teaching Pool" },
    /* Invoice INV-P-0139: Aquatic 60' Tue 4–5 Acton (same as Thu). */
    { staff: "JAVIER", name: "Ayman", time: "4 to 5", area: "Lane (DE)" },
    { staff: "JAVIER", name: "Linda", time: "5 to 5.30", area: "Lane (SE)" },
    { staff: "JAVIER", name: "Rayan Ta", time: "5.30 to 6", area: "Lane (DE)" },
    { staff: "JAVIER", name: "Aydaan Ah", time: "6 to 6.30", area: "Lane (SE)" },
    { staff: "AURORA", name: "Closed", time: "4 to 4.30", area: "Lane (DE)" },
    { staff: "AURORA", name: "Adam Mahmmoud", time: "4.30 to 5", area: "Teaching Pool" },
    { staff: "AURORA", name: "Junaid", time: "5 to 5.30", area: "Lane (SE)" },
    { staff: "AURORA", name: "No participant", time: "5.30 to 6", area: "Lane (SE)" },
    { staff: "AURORA", name: "Anas", time: "6 to 6.30", area: "Lane (DE)" },
  ];

  function autumnActonTuesdayStandingRows() {
    var iso = DAY_CENTRE_STANDING_ISO.tuesday;
    return AUTUMN_ACTON_TUESDAY_BOARD.map(function (slot) {
      return {
        client_name: slot.name,
        day: "Tuesday",
        instructors: slot.staff,
        service: "Aquatic Activity",
        area: slot.area || "Lane (DE)",
        time_slot: slot.time,
        venue: "Acton",
        session_date: iso,
      };
    });
  }

  function isAutumnWeek1DcIso(iso) {
    var d = normIso(iso);
    return d >= "2026-09-01" && d <= "2026-09-04";
  }

  /**
   * Fadi (CLIENT) away until Mon 21 Sep 2026 — still paint his DC seats as Cancelled
   * (Joelle pattern), not Absent and not No participant.
   * Fri 11 – Fri 18: Victor's reshuffled DC boards (others cover); Fadi Cancelled overlays.
   */
  var FADI_ABSENT_DC_UNTIL = "2026-09-21";
  var FADI_ABSENT_DC_BOARD_FROM = "2026-09-11";
  var FADI_ABSENT_DC_BOARD = {
    monday: [
      { staff: "Roberto", clients: [{ name: "Emanuel", time: "11 to 3" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      { staff: "Youssef", clients: [{ name: "Ikram", time: "11 to 3" }] },
      {
        staff: "Victor",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "3 to 4" },
        ],
      },
      {
        staff: "Michelle",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      {
        staff: "Raul",
        clients: [
          { name: "Office", time: "11 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
    ],
    tuesday: [
      {
        staff: "Roberto",
        clients: [
          { name: "ACAT", time: "11 to 12" },
          { name: "Ikram", time: "12 to 3" },
        ],
      },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      {
        staff: "Michelle",
        clients: [
          { name: "Ikram", time: "11 to 12" },
          { name: "Manager", time: "12 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      {
        staff: "Victor",
        clients: [
          { name: "Office", time: "11 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      { staff: "Raul", clients: [{ name: "Office", time: "11 to 4" }] },
      { staff: "Youssef", clients: [] },
    ],
    wednesday: [
      { staff: "Roberto", clients: [{ name: "Emanuel", time: "11 to 4" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 3" }] },
      {
        staff: "Raul",
        clients: [
          { name: "Office", time: "11 to 3" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      { staff: "Michelle", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Victor", clients: [{ name: "Office", time: "11 to 4" }] },
      { staff: "Youssef", clients: [] },
    ],
    thursday: [
      { staff: "Roberto", clients: [] },
      { staff: "Luliya", clients: [] },
      { staff: "Michelle", clients: [] },
      { staff: "Youssef", clients: [] },
      { staff: "Raul", clients: [{ name: "Office", time: "11 to 4" }] },
      { staff: "Victor", clients: [{ name: "Office", time: "11 to 4" }] },
    ],
    friday: [
      { staff: "Roberto", clients: [{ name: "Emanuel", time: "11 to 3" }] },
      { staff: "Luliya", clients: [{ name: "Ikram", time: "11 to 4" }] },
      { staff: "Youssef", clients: [{ name: "Ikram", time: "11 to 3" }] },
      {
        staff: "Victor",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "3 to 4" },
        ],
      },
      {
        staff: "Michelle",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Ikram", time: "3 to 4" },
        ],
      },
      {
        staff: "Raul",
        clients: [
          { name: "Timi", time: "11 to 1" },
          { name: "Emanuel", time: "3 to 4" },
        ],
      },
    ],
  };

  function isFadiAbsentDcWindowIso(iso) {
    var d = normIso(iso);
    return !!(d && d >= "2026-09-01" && d < FADI_ABSENT_DC_UNTIL);
  }

  function isFadiAbsentDcBoardIso(iso) {
    var d = normIso(iso);
    if (!d || d < FADI_ABSENT_DC_BOARD_FROM || d >= FADI_ABSENT_DC_UNTIL) return false;
    try {
      var dow = new Date(d + "T12:00:00").getDay();
      return dow >= 1 && dow <= 5;
    } catch (_) {
      return false;
    }
  }

  function fadiAbsentDcBoardDates() {
    var out = [];
    var cur = new Date(FADI_ABSENT_DC_BOARD_FROM + "T12:00:00");
    var end = new Date(FADI_ABSENT_DC_UNTIL + "T12:00:00");
    while (cur < end) {
      var dow = cur.getDay();
      if (dow >= 1 && dow <= 5) {
        var y = cur.getFullYear();
        var m = String(cur.getMonth() + 1).padStart(2, "0");
        var day = String(cur.getDate()).padStart(2, "0");
        out.push(y + "-" + m + "-" + day);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function areaForDcClient(name) {
    var n = String(name || "").trim().toLowerCase();
    if (n === "manager") return "Hub · Manager";
    if (n === "office") return "Hub · Office";
    if (n === "acat") return "Hub · ACAT";
    return "Hub Room";
  }

  function autumnFadiAbsentDayCentreRows() {
    var out = [];
    fadiAbsentDcBoardDates().forEach(function (iso) {
      var dow = new Date(iso + "T12:00:00").getDay();
      var dk =
        dow === 1
          ? "monday"
          : dow === 2
            ? "tuesday"
            : dow === 3
              ? "wednesday"
              : dow === 4
                ? "thursday"
                : "friday";
      var dayTitle = DOW_TITLE[dk] || dk;
      (FADI_ABSENT_DC_BOARD[dk] || []).forEach(function (col) {
        (col.clients || []).forEach(function (c) {
          out.push({
            client_name: c.name,
            day: dayTitle,
            instructors: String(col.staff || "").toUpperCase(),
            service: "Day Centre",
            area: areaForDcClient(c.name),
            time_slot: c.time,
            venue: "SwimFarm",
            session_date: iso,
          });
        });
      });
    });
    return out;
  }

  function autumnFadiCancelledSeatRows() {
    var out = [];
    var cur = new Date("2026-09-01T12:00:00");
    var end = new Date(FADI_ABSENT_DC_UNTIL + "T12:00:00");
    while (cur < end) {
      var dow = cur.getDay();
      if (dow >= 1 && dow <= 5) {
        var y = cur.getFullYear();
        var m = String(cur.getMonth() + 1).padStart(2, "0");
        var dayNum = String(cur.getDate()).padStart(2, "0");
        var iso = y + "-" + m + "-" + dayNum;
        var dk =
          dow === 1
            ? "monday"
            : dow === 2
              ? "tuesday"
              : dow === 3
                ? "wednesday"
                : dow === 4
                  ? "thursday"
                  : "friday";
        var dayTitle = DOW_TITLE[dk] || dk;
        /*
         * Fadi-board Thursdays (e.g. 17 Sep): DC is Office-only (Raul+Victor).
         * Roberto/Youssef/Luliya/Michelle are standing-off empty — do not inject
         * Fadi Cancelled seats (that forced fake day-off / COVER NEEDED paint).
         */
        if (isFadiAbsentDcBoardIso(iso) && dow === 4) {
          cur.setDate(cur.getDate() + 1);
          continue;
        }
        (AUTUMN_DAY_CENTRE_BOARD[dk] || []).forEach(function (col) {
          (col.clients || []).forEach(function (c) {
            if (!/^fadi\b/i.test(String(c.name || "").trim())) return;
            out.push({
              client_name: "Fadi",
              day: dayTitle,
              instructors: String(col.staff || "").toUpperCase(),
              service: "Day Centre",
              area: "Hub Room",
              time_slot: c.time,
              venue: "SwimFarm",
              session_date: iso,
            });
          });
        });
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function applyFadiAbsentDayCentre(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var d = normIso(r.session_date);
      if (isDayCentreService(r.service) && isFadiAbsentDcBoardIso(d)) return;
      /* Drop stale No participant placeholders that hid Fadi Cancelled seats. */
      if (
        isDayCentreService(r.service) &&
        isFadiAbsentDcWindowIso(d) &&
        /^no participant\b/i.test(String(r.client_name || "").trim()) &&
        /swimfarm/i.test(String(r.venue || "")) &&
        /\b(roberto|youssef|raul)\b/i.test(String(r.instructors || ""))
      ) {
        var openSlot = String(r.time_slot || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (
          openSlot.indexOf("12.30 to 3") === 0 ||
          openSlot.indexOf("12:30 to 3") === 0 ||
          openSlot === "1 to 3" ||
          openSlot.indexOf("1 to 3") === 0
        ) {
          return;
        }
      }
      out.push(r);
    });
    autumnFadiAbsentDayCentreRows().forEach(function (row) {
      out.push(row);
    });
    /* Always paint Fadi Cancelled seats through Sun 20 (return Mon 21). */
    autumnFadiCancelledSeatRows().forEach(function (row) {
      out.push(row);
    });
    return out;
  }

  /** True when this Day Centre row is the Jul standing snap used for Mon 7+ projection. */
  function isAutumnDcStandingTemplateRow(row) {
    if (!row || !isDayCentreService(row.service)) return false;
    return isAutumnStandingTemplateIso(row.session_date);
  }

  function isTuesdayActonAquaticStandingRow(row) {
    if (!row) return false;
    if (!isActonVenue(row.venue)) return false;
    if (normalizeDowKey(row.day) !== "tuesday") return false;
    /*
     * Empty-service junk (e.g. bundle "cayra"/"richard" 16.30 rows under ANGEL) must
     * also be replaced — otherwise Autumn weekday snap resurrects Angel's old book.
     */
    if (!isAquaticService(row.service) && String(row.service || "").trim()) return false;
    var d = normIso(row.session_date);
    if (!d) return true;
    if (d >= AUTUMN_DC_REPLACE_FROM && d <= AUTUMN_DC_REPLACE_THROUGH) return true;
    return false;
  }

  /**
   * No Autumn Term 2026 sessions (LOCAL has no columns). Summer / MADRE leftovers
   * must not project onto Sep+ Today or Term calendars.
   */
  var AUTUMN_NO_SESSION_STAFF_KEYS = ["angel", "giuseppe", "andres"];
  var AUTUMN_NO_SESSION_INSTRUCTOR_RE =
    /\b(angel|giuseppe|andres|andr[eé]s)\b/i;

  function isAutumnNoSessionStaffKey(staffKey) {
    var id = String(staffKey || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (!id) return false;
    if (id === "andres" || id === "andrés" || id === "andresx") return true;
    return AUTUMN_NO_SESSION_STAFF_KEYS.indexOf(id) >= 0;
  }

  function scrubDepartedAutumnInstructorRows(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var row = r;
      /* DB overlays may reintroduce summer Multi names — remap again before scrub. */
      if (isMultiActivityService(row.service)) {
        var mapped = remapAutumnMultiInstructorsStanding(row.instructors);
        if (mapped !== String(row.instructors || "").trim()) {
          row = Object.assign({}, row, { instructors: mapped });
        }
      }
      var inst = String(row.instructors || "").trim();
      if (!AUTUMN_NO_SESSION_INSTRUCTOR_RE.test(inst)) {
        out.push(row);
        return;
      }
      /* Strip departed co-instructors; keep the seat if anyone Autumn remains. */
      var kept = inst
        .split(/[,+/]| and /i)
        .map(function (p) {
          return String(p || "").trim();
        })
        .filter(function (p) {
          return p && !AUTUMN_NO_SESSION_INSTRUCTOR_RE.test(p);
        });
      if (!kept.length) return;
      out.push(Object.assign({}, row, { instructors: kept.join(", ").toUpperCase() }));
    });
    return out;
  }

  /** @deprecated use scrubDepartedAutumnInstructorRows */
  function scrubDepartedAngelInstructorRows(rows) {
    return scrubDepartedAutumnInstructorRows(rows);
  }

  function applyAutumnWeek1DayCentre(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (isDayCentreService(r.service) && isAutumnWeek1DcIso(r.session_date)) return;
      out.push(r);
    });
    autumnWeek1DayCentreRows().forEach(function (row) {
      out.push(row);
    });
    return out;
  }

  /**
   * Board re-inject (Tue Acton / Sunday pool) runs AFTER portal_roster_rows merge
   * and would otherwise wipe pool/area notes saved from Edit term slot.
   * Only honour an area that exists on an active cache row — never summer MADRE leftovers.
   */
  function dbAreaOverrideForStandingSlot(row) {
    var list = global.PORTAL_ROSTER_ROWS_CACHE;
    if (!row || !Array.isArray(list) || !list.length) return "";
    var day = String(row.day || "").trim().toLowerCase();
    var cn = String(row.client_name || "").trim().toLowerCase();
    var ts = String(row.time_slot || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    var instr = String(row.instructors || "").trim().toLowerCase();
    var venue = String(row.venue || "").trim().toLowerCase();
    var i;
    for (i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d || String(d.status || "active") !== "active") continue;
      if (String(d.client_name || "").trim().toLowerCase() !== cn) continue;
      if (String(d.day || "").trim().toLowerCase() !== day) continue;
      var dts = String(d.time_slot || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (dts !== ts) continue;
      var din = String(d.instructors || "").trim().toLowerCase();
      if (din && instr && din !== instr) continue;
      var dv = String(d.venue || "").trim().toLowerCase();
      if (dv && venue && dv !== venue) continue;
      var a = String(d.area || "").trim();
      if (a) return a;
    }
    return "";
  }

  function applyStandingSlotAreaFromDb(row) {
    var copy = Object.assign({}, row);
    var ov = dbAreaOverrideForStandingSlot(copy);
    if (ov) copy.area = ov;
    return copy;
  }

  function applyAutumnActonTuesdayStanding(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (isTuesdayActonAquaticStandingRow(r)) return;
      out.push(r);
    });
    autumnActonTuesdayStandingRows().forEach(function (row) {
      out.push(applyStandingSlotAreaFromDb(row));
    });
    return out;
  }

  /**
   * Re-inject Thu Acton AFTER portal_roster_rows merge.
   * Standing stamp is 2026-07-16; summer dated rows for that ISO (e.g. Yunis Hussein
   * Teaching Pool, Yossi Sium blank area) otherwise overwrite Autumn board pool notes.
   */
  function applyAutumnActonThursdayStanding(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (isThursdayActonAquaticStandingRow(r)) return;
      out.push(r);
    });
    autumnActonThursdayStandingRows().forEach(function (row) {
      out.push(applyStandingSlotAreaFromDb(row));
    });
    return out;
  }

  var DOW_TITLE = {
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  };

  function normIso(v) {
    var s = String(v || "").trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  }

  function rosterSlug(v) {
    return String(v || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function normalizeDowKey(dow) {
    var s = String(dow || "")
      .trim()
      .toLowerCase();
    if (s.indexOf("mon") === 0) return "monday";
    if (s.indexOf("tue") === 0) return "tuesday";
    if (s.indexOf("wed") === 0) return "wednesday";
    if (s.indexOf("thu") === 0) return "thursday";
    if (s.indexOf("fri") === 0) return "friday";
    if (s.indexOf("sat") === 0) return "saturday";
    if (s.indexOf("sun") === 0) return "sunday";
    return s;
  }

  function isDayCentreService(service) {
    return /day\s*centre/i.test(String(service || ""));
  }

  function parseHmToMinutes(timeSlot) {
    var raw = String(timeSlot || "")
      .replace(/\s*-\s*/g, " to ")
      .replace(/\s+/g, " ")
      .trim();
    var parts = raw.split(/\s+to\s+/i);
    if (parts.length < 2) return { startMin: 0, endMin: 0, duration: 0 };
    function one(p) {
      var m = String(p || "")
        .trim()
        .match(/^(\d{1,2})(?:[:.](\d{2}))?/);
      if (!m) return 0;
      var h = parseInt(m[1], 10) || 0;
      var min = parseInt(m[2] || "0", 10) || 0;
      if (h < 8) h += 12;
      return h * 60 + min;
    }
    var startMin = one(parts[0]);
    var endMin = one(parts[1]);
    var duration = endMin - startMin;
    if (duration < 0) duration += 24 * 60;
    return { startMin: startMin, endMin: endMin, duration: duration };
  }

  function dedupeRosterAdapterRows(rows) {
    var fold = global.PortalMadreFold;
    if (fold && typeof fold.dedupeRosterAdapterRows === "function") {
      return fold.dedupeRosterAdapterRows(rows);
    }
    var seen = Object.create(null);
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r) return;
      var key = [
        String(r.session_date || "").trim().slice(0, 10),
        String(r.day || "").trim(),
        rosterSlug(r.client_name),
        String(r.instructors || "").trim().toUpperCase(),
        String(r.time_slot || "").trim(),
        rosterSlug(r.service),
        String(r.area || "").trim(),
        String(r.venue || "").trim(),
      ].join("\0");
      if (seen[key]) return;
      seen[key] = true;
      out.push(r);
    });
    return out;
  }

  /** Prefer live Supabase MADRE; fallback to shipped bundle. */
  function getBundleBaseRows() {
    var live = global.PORTAL_MADRE_LIVE;
    if (live && Array.isArray(live.rows) && live.rows.length) {
      return live.rows.slice();
    }
    var src = global.STAFF_DASHBOARD_SOURCE;
    if (!src || !Array.isArray(src.rows) || !src.rows.length) return [];
    return src.rows.slice();
  }

  function applyPortalRosterDbRows(rows) {
    var cache = global.PORTAL_ROSTER_ROWS_CACHE;
    var list = Array.isArray(cache) ? cache : [];
    if (!list.length) return rows;
    var mergeFn =
      global.PortalRosterRowsMerge &&
      typeof global.PortalRosterRowsMerge.mergePortalRosterRows === "function"
        ? global.PortalRosterRowsMerge.mergePortalRosterRows
        : null;
    if (!mergeFn) return rows;
    return mergeFn(rows, list);
  }

  /**
   * Autumn 26/27 Northolt aquatic standing (Services truth — not summer Roberto book).
   * Source: admin Services Mon 7 Sep / Wed 9 Sep 2026 grids.
   */
  var AUTUMN_NORTHOLT_AQUATIC_BOARD = {
    monday: [
      {
        staff: "Dan",
        clients: [
          { name: "Muhammad", time: "4.30 to 5" },
          { name: "Amar Rai", time: "5 to 5.30" },
          { name: "Amar Rai", time: "5.30 to 6" },
          { name: "Amaar Ah", time: "6 to 6.30" },
        ],
      },
      {
        staff: "Luliya",
        clients: [
          { name: "No participant", time: "4.30 to 5" },
          { name: "Gemma", time: "5 to 5.30" },
          { name: "Zayana", time: "5.30 to 6" },
          { name: "Yamik", time: "6 to 6.30" },
        ],
      },
    ],
    wednesday: [
      {
        staff: "Dan",
        clients: [
          { name: "Tyson", time: "4.30 to 5" },
          { name: "Ruben", time: "5 to 5.30" },
          { name: "Amar Rai", time: "5.30 to 6" },
          { name: "No participant", time: "6 to 6.30" },
        ],
      },
      {
        staff: "Luliya",
        clients: [
          { name: "Vithura", time: "4.30 to 5" },
          { name: "Amar Rai", time: "5 to 5.30" },
          { name: "Amber", time: "5.30 to 6" },
          { name: "No participant", time: "6 to 6.30" },
        ],
      },
    ],
  };

  function autumnNortholtAquaticStandingRows() {
    var out = [];
    Object.keys(AUTUMN_NORTHOLT_AQUATIC_BOARD).forEach(function (dk) {
      var iso = DAY_CENTRE_STANDING_ISO[dk];
      var dayTitle = DOW_TITLE[dk] || dk;
      var cols = AUTUMN_NORTHOLT_AQUATIC_BOARD[dk] || [];
      cols.forEach(function (col) {
        (col.clients || []).forEach(function (c) {
          out.push({
            client_name: c.name,
            day: dayTitle,
            instructors: String(col.staff || "").toUpperCase(),
            service: "Aquatic Activity",
            area: "Teaching Pool",
            time_slot: c.time,
            venue: "Northolt",
            session_date: iso,
          });
        });
      });
    });
    return out;
  }

  function autumnDayCentreStandingRows() {
    var out = [];
    Object.keys(AUTUMN_DAY_CENTRE_BOARD).forEach(function (dk) {
      var iso = DAY_CENTRE_STANDING_ISO[dk];
      var dayTitle = DOW_TITLE[dk] || dk;
      var cols = AUTUMN_DAY_CENTRE_BOARD[dk] || [];
      cols.forEach(function (col) {
        (col.clients || []).forEach(function (c) {
          out.push({
            client_name: c.name,
            day: dayTitle,
            instructors: String(col.staff || "").toUpperCase(),
            service: "Day Centre",
            area: "Hub Room",
            time_slot: c.time,
            venue: "SwimFarm",
            session_date: iso,
          });
        });
      });
    });
    return out;
  }

  /**
   * Mon 7 Sep 2026: Raul OFF — Victor covers his seats.
   * Do NOT inject a Victor-only Tinashe / Emanuel dated row: Overview suppresses
   * standing same-client Bespoke/DC for the week when a dated row exists, which
   * dropped Godsway + John (and Roberto's Emanuel 11–1). Remap + schedule_overrides
   * paint Raul→Victor; keep standing co-instructors.
   * Dated rows here are only Westway Physical (Sandra→Javi) — those clients have
   * no other standing instructors that day.
   */
  function autumnMondaySep7VictorCoverRows() {
    return [];
  }

  /** Mon 7 Sep: Sandra OFF — Javi covers Westway Physical (Ayaan / Serine). */
  function autumnMondaySep7JaviPhysicalCoverRows() {
    return [
      {
        client_name: "Ayaan",
        day: "Monday",
        instructors: "JAVI",
        service: "Physical Activity",
        area: "Gym",
        time_slot: "4 to 5",
        venue: "Westway",
        session_date: "2026-09-07",
      },
      {
        client_name: "Serine",
        day: "Monday",
        instructors: "JAVI",
        service: "Physical Activity",
        area: "Gym",
        time_slot: "5 to 6",
        venue: "Westway",
        session_date: "2026-09-07",
      },
    ];
  }

  /** Thu 10 Sep: Yassir last Acton Aquatic session (seat open from Thu 17). */
  function autumnThursdaySep10YassirLastSessionRows() {
    return [
      {
        client_name: "Yassir",
        day: "Thursday",
        instructors: "ROBERTO",
        service: "Aquatic Activity",
        area: "Teaching Pool",
        time_slot: "4.30 to 5",
        venue: "Acton",
        session_date: "2026-09-10",
      },
    ];
  }

  /** Keep Yassir named on Thu 10; do not also leave a standing open twin that day. */
  function scrubAndEnsureSep10YassirLastSession(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (normIso(r.session_date) !== "2026-09-10") {
        out.push(r);
        return;
      }
      var slot = String(r.time_slot || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      var isYassirBand =
        /acton/i.test(String(r.venue || "")) &&
        /aquatic|swim/i.test(String(r.service || "")) &&
        /roberto/i.test(String(r.instructors || "")) &&
        (slot === "4.30 to 5" || slot === "4:30 to 5" || slot.indexOf("4.30 to 5") === 0);
      if (isYassirBand) return;
      out.push(r);
    });
    autumnThursdaySep10YassirLastSessionRows().forEach(function (row) {
      out.push(row);
    });
    return out;
  }

  /** Fri 11 Sep: Amaar last Acton Aquatic with Youssef (seat open from Fri 18). */
  function autumnFridaySep11AmaarLastSessionRows() {
    return [
      {
        client_name: "Amaar Ah",
        day: "Friday",
        instructors: "YOUSSEF",
        service: "Aquatic Activity",
        area: "Teaching Pool",
        time_slot: "5.30 to 6",
        venue: "Acton",
        session_date: "2026-09-11",
      },
    ];
  }

  /** Keep Amaar named on Fri 11; do not also leave a standing open twin that day. */
  function scrubAndEnsureSep11AmaarLastSession(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (normIso(r.session_date) !== "2026-09-11") {
        out.push(r);
        return;
      }
      var slot = String(r.time_slot || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      var isAmaarBand =
        /acton/i.test(String(r.venue || "")) &&
        /aquatic|swim/i.test(String(r.service || "")) &&
        /youssef\b/i.test(String(r.instructors || "")) &&
        (slot === "5.30 to 6" ||
          slot === "5:30 to 6" ||
          slot.indexOf("5.30 to 6") === 0 ||
          slot.indexOf("5:30 to 6") === 0);
      if (isAmaarBand) return;
      out.push(r);
    });
    autumnFridaySep11AmaarLastSessionRows().forEach(function (row) {
      out.push(row);
    });
    return out;
  }

  /** Mon 7 Sep: Abodi last Acton Aquatic session (parent cancel; seat open from Mon 14). */
  function autumnMondaySep7AbodiLastSessionRows() {
    return [
      {
        client_name: "Abodi Pa",
        day: "Monday",
        instructors: "YOUSSEF",
        service: "Aquatic Activity",
        area: "Teaching Pool",
        time_slot: "5.30 to 6.30",
        venue: "Acton",
        session_date: "2026-09-07",
      },
    ];
  }

  /** Drop Raul/Sandra Mon 7 dated seats if any; inject Javi Physical + Abodi last session. */
  function scrubAndEnsureSep7VictorRaulCover(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (normIso(r.session_date) !== "2026-09-07") {
        out.push(r);
        return;
      }
      var inst = String(r.instructors || "");
      var isRaulOnly = /\braul\b/i.test(inst) && !/\bvictor\b/i.test(inst);
      var isSandraOnly = /\bsandra\b/i.test(inst) && !/\bjavi\b/i.test(inst);
      var isDc = isDayCentreService(r.service);
      var isTin =
        isBespokeService(r.service) &&
        /^tinashe\b/i.test(String(r.client_name || "").trim());
      var isWestwayPa =
        isPhysicalActivityService(r.service) &&
        /westway/i.test(String(r.venue || ""));
      if (isRaulOnly && (isDc || isTin)) return;
      if (isSandraOnly && isWestwayPa) return;
      /* Stale Victor-only Tinashe dated row (pre-fix) — drop so Godsway/John project. */
      if (
        isTin &&
        /\bvictor\b/i.test(inst) &&
        !/\b(godsway|john)\b/i.test(inst)
      ) {
        return;
      }
      out.push(r);
    });
    autumnMondaySep7JaviPhysicalCoverRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    autumnMondaySep7AbodiLastSessionRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    return out;
  }

  /**
   * Tue 8 Sep: Aurora OFF — redistribute Acton Aquatic.
   * Adam Mahmmoud → Roberto 4.30–5 · Junaid → Roberto 5.30–6 (+30') ·
   * Aydaan Ah → Luliya 5.30–6 · Anas was on Javier then moved with his book.
   * Javier Marquez OFF same day: Ayman 4–4.30 → Roberto; Ayman 4.30–5 + Linda / Rayan Ta → Javi Palankas.
   * Anas: absent Tue 8 (was cover→Luliya); makeup Thu 10 Aurora only 6–6.30 (Simon leaves at 6).
   */
  function autumnTuesdaySep8ActonRedistributeRows() {
    var iso = "2026-09-08";
    function mapBook(staff, slots) {
      return slots.map(function (slot) {
        return {
          client_name: slot.name,
          day: "Tuesday",
          instructors: staff,
          service: "Aquatic Activity",
          area: slot.area || "Lane (DE)",
          time_slot: slot.time,
          venue: "Acton",
          session_date: iso,
        };
      });
    }
    /* Pool notes follow Summer (Adam Teaching Pool; Junaid + Aydaan Lane SE). */
    var roberto = [
      { name: "Ayman", time: "4 to 4.30", area: "Lane (DE)" },
      { name: "Adam Mahmmoud", time: "4.30 to 5", area: "Teaching Pool" },
      { name: "Logan", time: "5 to 5.30", area: "Lane (DE)" },
      { name: "Junaid", time: "5.30 to 6", area: "Lane (SE)" },
      { name: "Richard", time: "6 to 6.30", area: "Lane (DE)" },
    ];
    var luliya = [
      { name: "No participant", time: "4 to 4.30", area: "Lane (DE)" },
      { name: "Serine", time: "4.30 to 5.30", area: "Lane (DE)" },
      { name: "Aydaan Ah", time: "5.30 to 6", area: "Lane (SE)" },
      { name: "No participant", time: "6 to 6.30", area: "Lane (DE)" },
    ];
    var javiPalankas = [
      { name: "Ayman", time: "4.30 to 5", area: "Lane (DE)" },
      { name: "Linda", time: "5 to 5.30", area: "Lane (SE)" },
      { name: "Rayan Ta", time: "5.30 to 6", area: "Lane (DE)" },
    ];
    return []
      .concat(mapBook("ROBERTO", roberto))
      .concat(mapBook("LULIYA", luliya))
      .concat(mapBook("JAVI", javiPalankas));
  }

  function scrubAndEnsureSep8ActonRedistribute(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (normIso(r.session_date) !== "2026-09-08") {
        out.push(r);
        return;
      }
      if (
        isAquaticService(r.service) &&
        /acton/i.test(String(r.venue || "")) &&
        /\b(roberto|luliya|lulia|javier|aurora|javi)\b/i.test(String(r.instructors || ""))
      ) {
        return;
      }
      out.push(r);
    });
    autumnTuesdaySep8ActonRedistributeRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    return out;
  }

  /**
   * Thu 10 Sep: Joelle 5.30–6 taught; 6–6.30 cancelled on Aurora (Cancelled chip) + Anas makeup.
   * Simon 6–6.30 open today only (Joelle second half gone). Roberto keeps Maiyar.
   */
  function autumnThursdaySep10AnasMakeupRows() {
    var iso = "2026-09-10";
    function mapBook(staff, slots) {
      return slots.map(function (slot) {
        var area = "Lane (DE)";
        if (/^joelle\b/i.test(String(slot.name || ""))) area = "Teaching Pool";
        if (/^no participant\b/i.test(String(slot.name || ""))) area = slot.area || "Teaching Pool";
        return {
          client_name: slot.name,
          day: "Thursday",
          instructors: staff,
          service: "Aquatic Activity",
          area: area,
          time_slot: slot.time,
          venue: "Acton",
          session_date: iso,
        };
      });
    }
    return []
      .concat(
        mapBook("AURORA", [
          { name: "Joelle", time: "5.30 to 6" },
          { name: "Joelle", time: "6 to 6.30" },
          { name: "Anas", time: "6 to 6.30" },
        ]),
      )
      .concat(
        mapBook("SIMON", [
          { name: "Joelle", time: "5.30 to 6" },
          { name: "No participant", time: "6 to 6.30", area: "Teaching Pool" },
        ]),
      );
  }

  function scrubAndEnsureSep10AnasMakeup(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var d = normIso(r.session_date);
      /*
       * Thu Acton Joelle / Anas on Aurora+Simon for 10 Sep is owned by the dated inject below.
       * Drop standing Jul Joelle (and any dated Sep 10 copies) so Simon 6–6.30 open + Aurora
       * Joelle Cancelled + Anas makeup win — Roberto Maiyar is untouched.
       */
      if (
        isAquaticService(r.service) &&
        /acton/i.test(String(r.venue || "")) &&
        /\b(aurora|simon)\b/i.test(String(r.instructors || "")) &&
        /^(joelle|anas)\b/i.test(String(r.client_name || "").trim())
      ) {
        if (!d || d === "2026-09-10" || isAutumnStandingTemplateIso(d)) return;
      }
      if (d === "2026-09-10") {
        if (
          isAquaticService(r.service) &&
          /acton/i.test(String(r.venue || "")) &&
          /\bsimon\b/i.test(String(r.instructors || "")) &&
          /^no participant\b/i.test(String(r.client_name || "").trim())
        ) {
          var simonOpen = String(r.time_slot || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
          if (simonOpen === "6 to 6.30" || simonOpen.indexOf("6 to 6.30") === 0) return;
        }
        /* Stale Roberto open from the mistaken Maiyar clear — standing Maiyar owns the seat. */
        if (
          isAquaticService(r.service) &&
          /acton/i.test(String(r.venue || "")) &&
          /\broberto\b/i.test(String(r.instructors || "")) &&
          /^no participant\b/i.test(String(r.client_name || "").trim())
        ) {
          var robOpen = String(r.time_slot || "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();
          if (robOpen === "6 to 6.30" || robOpen.indexOf("6 to 6.30") === 0) return;
        }
      }
      out.push(r);
    });
    autumnThursdaySep10AnasMakeupRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    return out;
  }

  function rowDedupeKey(row) {
    return [
      String(row.session_date || "").trim().slice(0, 10),
      String(row.day || "").trim(),
      rosterSlug(row.client_name),
      String(row.instructors || "").trim().toUpperCase(),
      String(row.time_slot || "").trim(),
      rosterSlug(row.service),
      String(row.area || "").trim(),
      String(row.venue || "").trim(),
    ].join("\0");
  }

  function isBespokeService(service) {
    return /bespoke/i.test(String(service || ""));
  }

  function isMultiActivityService(service) {
    return /multi[\s-]*activity/i.test(String(service || ""));
  }

  function isPhysicalActivityService(service) {
    return /physical|fitness/i.test(String(service || ""));
  }

  /** Sun 6 Sep 2026: Emanuel off — John covers his Hub Multi book (dated so Today matches). */
  var SEP6_2026_JOHN_EMANUEL_HUB_MULTI = [
    { client_name: "Jack S", time_slot: "9.30 to 10.15" },
    { client_name: "Zaid", time_slot: "10.15 to 11" },
    { client_name: "Eiji", time_slot: "11 to 11.45" },
    { client_name: "Hazem", time_slot: "11.45 to 12.30" },
    { client_name: "Haneef", time_slot: "12.30 to 1.15" },
    { client_name: "Rayyan F", time_slot: "1.15 to 2" },
  ];

  /** Sun 6 Sep 2026: Berta Lead keeps the Hub Multi book that was on John. */
  var SEP6_2026_BERTA_HUB_MULTI = [
    { client_name: "Jack W", time_slot: "9.30 to 10.15" },
    { client_name: "Adam Ab", time_slot: "10.15 to 11" },
    { client_name: "Cyrus", time_slot: "11 to 11.45" },
    { client_name: "Arthur Ma", time_slot: "11.45 to 12.30" },
    { client_name: "Erik", time_slot: "12.30 to 1.15" },
    { client_name: "Aydaan Ah", time_slot: "1.15 to 2" },
  ];

  function autumnSundaySep6HubCoverRows() {
    var john = SEP6_2026_JOHN_EMANUEL_HUB_MULTI.map(function (slot) {
      return {
        client_name: slot.client_name,
        day: "Sunday",
        instructors: "JOHN",
        service: "Multi-Activity",
        area: "Hub Room",
        time_slot: slot.time_slot,
        venue: "SwimFarm",
        session_date: "2026-09-06",
      };
    });
    var berta = SEP6_2026_BERTA_HUB_MULTI.map(function (slot) {
      return {
        client_name: slot.client_name,
        day: "Sunday",
        instructors: "BERTA",
        service: "Multi-Activity",
        area: "Hub Room",
        time_slot: slot.time_slot,
        venue: "SwimFarm",
        session_date: "2026-09-06",
      };
    });
    var godsway = AUTUMN_SUNDAY_HUB_GODSWAY.map(function (slot) {
      return {
        client_name: slot.client_name,
        day: "Sunday",
        instructors: "GODSWAY",
        service: "Multi-Activity",
        area: "Hub Room",
        time_slot: slot.time_slot,
        venue: "SwimFarm",
        session_date: "2026-09-06",
      };
    });
    return john.concat(berta).concat(godsway);
  }

  /** Sun 6 Sep: Javier pool book (LOCAL DATE_EXTRA) — Aquatic Zaid trial + Multi, dated so projection cannot drop the trial. */
  function autumnSundaySep6JavierPoolRows() {
    var seats = [
      {
        client_name: "Zaid (Trial)",
        service: "Aquatic Activity",
        area: "Small Pool",
        time_slot: "9 to 9.30",
      },
      {
        client_name: "Zaid",
        service: "Multi-Activity",
        area: "Small Pool",
        time_slot: "9.30 to 10.15",
      },
      {
        client_name: "Jack S",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "10.15 to 11",
      },
      {
        client_name: "Hazem",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "11 to 11.45",
      },
      {
        client_name: "Eiji",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "11.45 to 12.30",
      },
      {
        client_name: "Rayyan F",
        service: "Multi-Activity",
        area: "Small Pool",
        time_slot: "12.30 to 1.15",
      },
      {
        client_name: "Haneef",
        service: "Multi-Activity",
        area: "Small Pool",
        time_slot: "1.15 to 2",
      },
      {
        client_name: "Max",
        service: "Aquatic Activity",
        area: "Big Pool",
        time_slot: "2 to 2.30",
      },
      {
        client_name: "Shaan",
        service: "Aquatic Activity",
        area: "Big Pool",
        time_slot: "2.30 to 3",
      },
    ];
    return seats.map(function (slot) {
      return {
        client_name: slot.client_name,
        day: "Sunday",
        instructors: "JAVIER",
        service: slot.service,
        area: slot.area,
        time_slot: slot.time_slot,
        venue: "SwimFarm",
        session_date: "2026-09-06",
      };
    });
  }

  /**
   * Sun 6: drop any dated Javier SwimFarm pool/aquatic rows then re-inject LOCAL book
   * (Zaid trial 9–9.30 + Multi 9.30–10.15 …). Standing Autumn Sunday (13 Sep) is
   * separate — never project summer weeks onto workers.
   */
  function scrubAndEnsureSep6JavierPool(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (
        normIso(r.session_date) === "2026-09-06" &&
        /\bjavier\b/i.test(String(r.instructors || "")) &&
        /swimfarm/i.test(String(r.venue || "SwimFarm")) &&
        !/hub/i.test(String(r.area || "")) &&
        (isMultiActivityService(r.service) || isAquaticService(r.service))
      ) {
        return;
      }
      out.push(r);
    });
    autumnSundaySep6JavierPoolRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    return out;
  }

  /**
   * LOCAL EXTRA Sunday standing pool (SwimFarm) — Autumn truth, stamped 13 Sep.
   * Sun 6 DATE_EXTRA overlay is applied separately (Yusuf↔Simon swap).
   */
  function autumnSundayStandingPoolRows() {
    var iso = WEEKEND_STANDING_ISO.sunday;
    function mapBook(staff, seats) {
      return seats.map(function (slot) {
        return {
          client_name: slot.client_name,
          day: "Sunday",
          instructors: staff,
          service: slot.service,
          area: slot.area,
          time_slot: slot.time_slot,
          venue: "SwimFarm",
          session_date: iso,
        };
      });
    }
    var roberto = [
      { client_name: "Yusuf Ah", service: "Aquatic Activity", area: "Big Pool", time_slot: "9 to 9.30" },
      { client_name: "Yusuf Ah", service: "Multi-Activity", area: "Big Pool", time_slot: "9.30 to 10.15" },
      { client_name: "Samer", service: "Multi-Activity", area: "Big Pool", time_slot: "10.15 to 11" },
      { client_name: "Gabriel", service: "Multi-Activity", area: "Big Pool", time_slot: "11 to 11.45" },
      { client_name: "Arthur Mo", service: "Multi-Activity", area: "Big Pool", time_slot: "11.45 to 12.30" },
      { client_name: "Amaar Ah", service: "Multi-Activity", area: "Big Pool", time_slot: "12.30 to 1.15" },
      { client_name: "Adaam Ah", service: "Multi-Activity", area: "Big Pool", time_slot: "1.15 to 2" },
      { client_name: "Rodin", service: "Aquatic Activity", area: "Big Pool", time_slot: "2 to 2.30" },
      { client_name: "Yoan", service: "Aquatic Activity", area: "Big Pool", time_slot: "2.30 to 3" },
    ];
    var aurora = [
      { client_name: "Simon", service: "Aquatic Activity", area: "Small Pool", time_slot: "9 to 9.30" },
      { client_name: "Adam Ab", service: "Multi-Activity", area: "Small Pool", time_slot: "9.30 to 10.15" },
      { client_name: "Jack W", service: "Multi-Activity", area: "Big Pool", time_slot: "10.15 to 11" },
      { client_name: "Arthur Ma", service: "Multi-Activity", area: "Small Pool", time_slot: "11 to 11.45" },
      { client_name: "Cyrus", service: "Multi-Activity", area: "Small Pool", time_slot: "11.45 to 12.30" },
      { client_name: "Aydaan Ah", service: "Multi-Activity", area: "Big Pool", time_slot: "12.30 to 1.15" },
      { client_name: "Erik", service: "Multi-Activity", area: "Big Pool", time_slot: "1.15 to 2" },
      { client_name: "Zakariya", service: "Aquatic Activity", area: "Big Pool", time_slot: "2 to 2.30" },
      { client_name: "Faris", service: "Aquatic Activity", area: "Big Pool", time_slot: "2.30 to 3" },
    ];
    var javier = [
      { client_name: "Zaid (Trial)", service: "Aquatic Activity", area: "Small Pool", time_slot: "9 to 9.30" },
      { client_name: "Zaid", service: "Multi-Activity", area: "Small Pool", time_slot: "9.30 to 10.15" },
      { client_name: "Jack S", service: "Multi-Activity", area: "Big Pool", time_slot: "10.15 to 11" },
      { client_name: "Hazem", service: "Multi-Activity", area: "Big Pool", time_slot: "11 to 11.45" },
      { client_name: "Eiji", service: "Multi-Activity", area: "Big Pool", time_slot: "11.45 to 12.30" },
      { client_name: "Rayyan F", service: "Multi-Activity", area: "Small Pool", time_slot: "12.30 to 1.15" },
      { client_name: "Haneef", service: "Multi-Activity", area: "Small Pool", time_slot: "1.15 to 2" },
      { client_name: "Max", service: "Aquatic Activity", area: "Big Pool", time_slot: "2 to 2.30" },
      { client_name: "Shaan", service: "Aquatic Activity", area: "Big Pool", time_slot: "2.30 to 3" },
    ];
    return mapBook("ROBERTO", roberto)
      .concat(mapBook("AURORA", aurora))
      .concat(mapBook("JAVIER", javier));
  }

  function isSundaySwimfarmPoolStaffRow(r) {
    if (!r) return false;
    if (!/\b(aurora|roberto|javier)\b/i.test(String(r.instructors || ""))) return false;
    if (!/swimfarm/i.test(String(r.venue || "SwimFarm"))) return false;
    if (/hub/i.test(String(r.area || ""))) return false;
    if (!(isMultiActivityService(r.service) || isAquaticService(r.service))) return false;
    var day = normalizeDowKey(r.day);
    if (day === "sunday") return true;
    var d = normIso(r.session_date);
    if (!d) return false;
    try {
      var dt = new Date(d + "T12:00:00");
      return !isNaN(dt.getTime()) && dt.getDay() === 0;
    } catch (_) {
      return false;
    }
  }

  /** Drop summer/legacy Sunday pool books; inject LOCAL EXTRA standing (13 Sep stamp). */
  function scrubAndEnsureAutumnSundayPoolStanding(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (isSundaySwimfarmPoolStaffRow(r)) return;
      out.push(r);
    });
    autumnSundayStandingPoolRows().forEach(function (row) {
      out.push(applyStandingSlotAreaFromDb(row));
    });
    return out;
  }

  /**
   * Sun 6 one-off: Aurora Yusuf Aquatic 9–9.30 (Small); Roberto Simon Aquatic 9–9.30 (Big)
   * + Yusuf Multi 9.30–10.15 with Roberto. Full LOCAL DATE_EXTRA books for both staff.
   * Different instructors → two Yusuf feedbacks (no AA↔MA merge that day).
   */
  function autumnSundaySep6AuroraRobertoPoolRows() {
    var roberto = [
      {
        client_name: "Simon",
        service: "Aquatic Activity",
        area: "Big Pool",
        time_slot: "9 to 9.30",
      },
      {
        client_name: "Yusuf Ah",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "9.30 to 10.15",
      },
      {
        client_name: "Samer",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "10.15 to 11",
      },
      {
        client_name: "Gabriel",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "11 to 11.45",
      },
      {
        client_name: "Arthur Mo",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "11.45 to 12.30",
      },
      {
        client_name: "Amaar Ah",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "12.30 to 1.15",
      },
      {
        client_name: "Adaam Ah",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "1.15 to 2",
      },
      {
        client_name: "Rodin",
        service: "Aquatic Activity",
        area: "Big Pool",
        time_slot: "2 to 2.30",
      },
      {
        client_name: "Yoan",
        service: "Aquatic Activity",
        area: "Big Pool",
        time_slot: "2.30 to 3",
      },
    ].map(function (slot) {
      return {
        client_name: slot.client_name,
        day: "Sunday",
        instructors: "ROBERTO",
        service: slot.service,
        area: slot.area,
        time_slot: slot.time_slot,
        venue: "SwimFarm",
        session_date: "2026-09-06",
      };
    });
    var aurora = [
      {
        client_name: "Yusuf Ah",
        service: "Aquatic Activity",
        area: "Small Pool",
        time_slot: "9 to 9.30",
      },
      {
        client_name: "Adam Ab",
        service: "Multi-Activity",
        area: "Small Pool",
        time_slot: "9.30 to 10.15",
      },
      {
        client_name: "Jack W",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "10.15 to 11",
      },
      {
        client_name: "Arthur Ma",
        service: "Multi-Activity",
        area: "Small Pool",
        time_slot: "11 to 11.45",
      },
      {
        client_name: "Cyrus",
        service: "Multi-Activity",
        area: "Small Pool",
        time_slot: "11.45 to 12.30",
      },
      {
        client_name: "Aydaan Ah",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "12.30 to 1.15",
      },
      {
        client_name: "Erik",
        service: "Multi-Activity",
        area: "Big Pool",
        time_slot: "1.15 to 2",
      },
      {
        client_name: "Zakariya",
        service: "Aquatic Activity",
        area: "Big Pool",
        time_slot: "2 to 2.30",
      },
      {
        client_name: "Faris",
        service: "Aquatic Activity",
        area: "Big Pool",
        time_slot: "2.30 to 3",
      },
    ].map(function (slot) {
      return {
        client_name: slot.client_name,
        day: "Sunday",
        instructors: "AURORA",
        service: slot.service,
        area: slot.area,
        time_slot: slot.time_slot,
        venue: "SwimFarm",
        session_date: "2026-09-06",
      };
    });
    return roberto.concat(aurora);
  }

  function scrubAndEnsureSep6AuroraRobertoPool(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (
        normIso(r.session_date) === "2026-09-06" &&
        /\b(aurora|roberto)\b/i.test(String(r.instructors || "")) &&
        /swimfarm/i.test(String(r.venue || "SwimFarm")) &&
        !/hub/i.test(String(r.area || "")) &&
        (isMultiActivityService(r.service) || isAquaticService(r.service))
      ) {
        return;
      }
      out.push(r);
    });
    autumnSundaySep6AuroraRobertoPoolRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    return out;
  }

  /**
   * Autumn Sunday Hub Multi standing remaps (snap-date agnostic).
   * Standing books (already named): Emmanuel = Godsway summer; Godsway = Bismark summer;
   * Berta Lead = John summer (John only worked Sun 6 via dated cover).
   * Summer/DB leftovers still use old names:
   * - BISMARK → GODSWAY; GIUSEPPE → EMANUEL; JOHN → BERTA
   * Do NOT map GODSWAY→EMANUEL here — standing Godsway rows would steal Emmanuel's book.
   * Sun 6 Sep: dated autumnSundaySep6HubCoverRows give John the Emanuel book.
   */
  function remapAutumnMultiInstructorsStanding(instructorsRaw) {
    var s = String(instructorsRaw || "").trim();
    if (!s) return s;
    return s
      .replace(/\bBISMARK\b/gi, "GODSWAY")
      .replace(/\bBISMARCK\b/gi, "GODSWAY")
      .replace(/\bGIUSEPPE\b/gi, "EMANUEL")
      /* Standing: Berta Lead keeps the Hub book that summer stored under John.
       * Sun 6 dated cover re-injects JOHN for the Emanuel book after this remap. */
      .replace(/\bJOHN\b/gi, "BERTA");
  }

  /**
   * Resolve instructors for a *calendar* day (Today / team strip).
   * Standing Multi remaps are usually already on the row; this adds date-specific covers.
   */
  function resolveAutumnInstructorsForCalendarDate(instructorsRaw, calendarIso, meta) {
    meta = meta || {};
    var s = String(instructorsRaw || "").trim();
    if (!s) return s;
    var iso = String(calendarIso || "").trim().slice(0, 10);
    var service = meta.service || "";
    var day = normalizeDowKey(meta.day) || "";
    if (!day && iso) {
      try {
        var dt = new Date(iso + "T12:00:00");
        if (!isNaN(dt.getTime())) {
          day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][
            dt.getDay()
          ];
        }
      } catch (_) {}
    }
    if (isMultiActivityService(service)) {
      if (iso === "2026-09-06") {
        /*
         * Sun 6 LOCAL: John covers Emanuel Hub book; Berta Lead keeps Jack W book.
         * Do NOT run JOHN→BERTA first — that turned John's dated cover into Berta and
         * stacked both Hub books on Berta in Schedule & Covers / Today.
         */
        s = s
          .replace(/\bBISMARK\b/gi, "GODSWAY")
          .replace(/\bBISMARCK\b/gi, "GODSWAY")
          .replace(/\bGIUSEPPE\b/gi, "EMANUEL")
          .replace(/\bEMANUEL\b/gi, "JOHN");
        /* Leave JOHN and BERTA as-is. */
      } else {
        s = remapAutumnMultiInstructorsStanding(s);
      }
    }
    if (isBespokeService(service)) {
      var clientTin = String((meta && meta.clientName) || (meta && meta.client_name) || "")
        .trim()
        .toLowerCase();
      var isTinashe = /^tinashe\b/.test(clientTin) || clientTin === "tinashe";
      /* Mon 1–13 Sep: Emanuel not on Mon Tinashe yet → drop Emanuel seat (Raul stays). */
      if (iso && iso >= "2026-09-01" && iso < "2026-09-14" && day === "monday") {
        if (/\bemanuel\b/i.test(s) && !/\b(godsway|john|raul|bismark|victor)\b/i.test(s)) {
          s = "";
        } else {
          s = s.replace(/\bEMANUEL\b/gi, "");
        }
      }
      /* Wed: Emanuel on Tinashe from Wed 9 (shadowing Bismark). */
      if (iso && iso < "2026-09-09" && day === "wednesday") {
        if (/\bemanuel\b/i.test(s) && !/\b(godsway|john|raul|bismark)\b/i.test(s)) {
          s = "";
        } else {
          s = s.replace(/\bEMANUEL\b/gi, "");
        }
      }
      /* Fri: Emanuel on Tinashe from Fri 11 Sep. */
      if (iso && iso < "2026-09-11" && day === "friday") {
        if (/\bemanuel\b/i.test(s) && !/\b(roberto|bismark)\b/i.test(s)) {
          s = "";
        } else {
          s = s.replace(/\bEMANUEL\b/gi, "");
        }
      }
      /* Bismark: Wed/Fri from 9 Sep; Mon from 14 Sep. */
      if (isTinashe && iso) {
        if (day === "monday" && iso < "2026-09-14") {
          if (/\bbismark\b|\bbismarck\b/i.test(s) && !/\b(godsway|john|raul|emanuel|victor)\b/i.test(s)) {
            s = "";
          } else {
            s = s.replace(/\bBISMARK\b/gi, "").replace(/\bBISMARCK\b/gi, "");
          }
        }
        if ((day === "wednesday" || day === "friday") && iso < "2026-09-09") {
          if (/\bbismark\b|\bbismarck\b/i.test(s) && !/\b(godsway|john|raul|roberto|emanuel)\b/i.test(s)) {
            s = "";
          } else {
            s = s.replace(/\bBISMARK\b/gi, "").replace(/\bBISMARCK\b/gi, "");
          }
        }
        /* Wed from 9 Sep: Raul off Tinashe (keeps DC when he has it). */
        if (day === "wednesday" && iso >= "2026-09-09") {
          if (/\braul\b/i.test(s) && !/\b(godsway|john|bismark|emanuel)\b/i.test(s)) {
            s = "";
          } else {
            s = s.replace(/\bRAUL\b/gi, "");
          }
        }
        /* Wed 9 + Wed 15 + Wed 16: John day off — Tinashe = Godsway + Bismark + Emanuel. */
        if (
          day === "wednesday" &&
          (iso === "2026-09-09" || iso === "2026-09-15" || iso === "2026-09-16")
        ) {
          if (/\bjohn\b/i.test(s) && !/\b(godsway|bismark|emanuel)\b/i.test(s)) {
            s = "";
          } else {
            s = s.replace(/\bJOHN\b/gi, "");
          }
        }
      }
      /* Mon 7 Sep only: Raul OFF → Victor covers Tinashe (with Godsway + John). */
      if (iso === "2026-09-07" && day === "monday") {
        s = s.replace(/\bRAUL\b/gi, "VICTOR");
      }
      s = String(s || "")
        .replace(/^[,\s/|]+|[,\s/|]+$/g, "")
        .replace(/\s*,\s*,+/g, ",")
        .trim();
    }
    /* Mon 7 Sep: Raul OFF → Victor covers Day Centre (Timi + Emanuel). */
    if (
      iso === "2026-09-07" &&
      day === "monday" &&
      isDayCentreService(service)
    ) {
      s = s.replace(/\bRAUL\b/gi, "VICTOR");
    }
    /* Mon 7 Sep: Sandra day off → Javi Palankas covers Westway Physical (Ayaan / Serine). */
    if (
      iso === "2026-09-07" &&
      day === "monday" &&
      isPhysicalActivityService(service)
    ) {
      var venuePa = String((meta && meta.venue) || "").trim().toLowerCase();
      if (!venuePa || venuePa.indexOf("westway") >= 0) {
        s = s.replace(/\bSANDRA\b/gi, "JAVI");
      }
    }
    /* Wed 9 Sep: Fadi absent — Victor has no DC after reshuffle (not a day-off request).
     * Roberto covers full Emanuel; Raul takes Victor Ikram 3-4. */
    if (iso === "2026-09-09" && day === "wednesday" && isDayCentreService(service)) {
      var clientWed9 = String((meta && meta.clientName) || (meta && meta.client_name) || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
      if (!clientWed9 && meta && meta.client_id) clientWed9 = String(meta.client_id).toLowerCase();
      if (/^emanuel\b/.test(clientWed9) || clientWed9 === "emanuel") {
        s = "ROBERTO";
      } else if (/^ikram\b/.test(clientWed9) || clientWed9 === "ikram") {
        /* Michelle 11-4 + Luliya 11-3 stay; Raul takes 3-4 (Victor's block). */
        if (/\bvictor\b/i.test(s)) s = s.replace(/\bVICTOR\b/gi, "RAUL");
      } else if (/^fadi\b/.test(clientWed9) || clientWed9 === "fadi") {
        s = s; /* absence handled via overrides */
      } else if (/\bvictor\b/i.test(s) && !/\b(roberto|raul|michelle|luliya)\b/i.test(s)) {
        s = "";
      }
    }
    /* Tue 15 Sep only: Aurora day off → Javi Palankas covers her Acton Aquatic book. */
    if (iso === "2026-09-15" && day === "tuesday" && isAquaticService(service)) {
      if (!meta.venue || isActonVenue(meta.venue)) {
        s = s.replace(/\bAURORA\b/gi, "JAVI");
      }
    }
    /* Sun 13 Sep + 4 Oct only: Aurora day off → Luliya covers SwimFarm pool book. */
    if (
      (iso === "2026-09-13" || iso === "2026-10-04") &&
      day === "sunday" &&
      (isMultiActivityService(service) || isAquaticService(service))
    ) {
      var venueSun = String((meta && meta.venue) || "").trim().toLowerCase();
      if (!venueSun || venueSun.indexOf("swimfarm") >= 0) {
        var areaSun = String((meta && meta.area) || "").trim().toLowerCase();
        if (areaSun.indexOf("hub") < 0) {
          s = s.replace(/\bAURORA\b/gi, "LULIYA");
        }
      }
    }
    /* Berta day off Sun 13 / 20 Sep / 4 Oct — Hub Lead book stays COVER NEEDED (no named cover yet). */
    if (
      (iso === "2026-09-13" || iso === "2026-09-20" || iso === "2026-10-04") &&
      day === "sunday" &&
      isMultiActivityService(service)
    ) {
      var areaBerta = String((meta && meta.area) || "").trim().toLowerCase();
      if (areaBerta.indexOf("hub") >= 0 || /\bberta\b/i.test(s)) {
        /* Keep Berta as anchor for COVER NEEDED paint — do not remap to another staff. */
        s = s;
      }
    }
    return s;
  }

  /** @deprecated use resolveAutumnInstructorsForCalendarDate for calendar days */
  function remapAutumnMultiInstructors(instructorsRaw, sessionDateIso) {
    return resolveAutumnInstructorsForCalendarDate(instructorsRaw, sessionDateIso, {
      service: "Multi-Activity",
    });
  }

  /** Autumn Acton pool remaps for departed / cover staff. */
  function remapAutumnActonPoolInstructors(row) {
    if (!row) return null;
    if (!isAquaticService(row.service)) return null;
    if (!isActonVenue(row.venue)) return null;
    var day = normalizeDowKey(row.day);
    var raw = String(row.instructors || "").trim();
    if (!raw) return null;
    var client = String(row.client_name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    /* Monday: Roberto takes Angel's Acton book (Adam P / Steven / Mario). */
    if (day === "monday" && /\bangel\b/i.test(raw)) {
      if (/\broberto\b/i.test(raw)) return null;
      return { instructors: "ROBERTO" };
    }

    /* Friday: Acton aquatic (Adam Pi / Amaar) → Youssef (not Roberto). */
    if (day === "friday" && isActonVenue(row.venue) && /\broberto\b/i.test(raw)) {
      if (/\byoussef\b/i.test(raw)) return null;
      return { instructors: "YOUSSEF" };
    }

    if (day === "tuesday") {
      /* Standing Tue Acton: Roberto / Aurora / Javier / Luliya (no Youssef). */
      if (/^logan\b/.test(client) || client === "richard") {
        if (/\broberto\b/i.test(raw)) return null;
        return { instructors: "ROBERTO" };
      }
      if (/^serine\b/.test(client)) {
        if (/\bluliya\b|\blulia\b|\baida\b/i.test(raw)) return null;
        return { instructors: "LULIYA" };
      }
      if (/^rayan\s*ta\b/.test(client)) {
        if (/\bjavier\b/i.test(raw)) return null;
        return { instructors: "JAVIER" };
      }
      if (/\bangel\b/i.test(raw) && /^cayra\b/.test(client)) {
        if (/\bluliya\b|\blulia\b|\baida\b/i.test(raw)) return null;
        return { instructors: "LULIYA" };
      }
      return null;
    }

    /* Thursday Acton: Simon keeps Elijah / Yuri (not Luliya). Elijah off Aurora → Simon. */
    if (day === "thursday") {
      if (/^elijah\b/.test(client)) {
        if (/\bsimon\b/i.test(raw)) return null;
        return { instructors: "SIMON" };
      }
      if (/^yuri\b/.test(client)) {
        if (/\bsimon\b/i.test(raw)) return null;
        return { instructors: "SIMON" };
      }
    }

    return null;
  }

  function isAquaticService(service) {
    return /aquatic/i.test(String(service || ""));
  }

  function isYoussefInstructor(instructorsRaw) {
    return /\byoussef\b/i.test(String(instructorsRaw || ""));
  }

  function isActonVenue(venue) {
    return /acton/i.test(String(venue || ""));
  }

  function isYoussefActon430ClosedSlot(row) {
    if (!row) return false;
    if (!/^closed$/i.test(String(row.client_name || "").trim())) return false;
    if (!isAquaticService(row.service)) return false;
    if (!isActonVenue(row.venue)) return false;
    if (!isYoussefInstructor(row.instructors)) return false;
    var day = normalizeDowKey(row.day);
    if (day && day !== "monday" && day !== "tuesday" && day !== "wednesday") return false;
    var slot = String(row.time_slot || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return (
      slot === "4 to 4.30" ||
      slot === "4.00 to 4.30" ||
      slot === "4:00 to 4:30" ||
      slot.indexOf("4 to 4.30") === 0
    );
  }

  /**
   * Erik Ndregjoni Multi Sun 12.30–2 (INV-P-0461 paid/partial).
   * Restore name if a summer snap left the seat as No participant / HOLD WAITLIST.
   */
  function restoreErikSundayMultiSeat(row) {
    if (!row || !isMultiActivityService(row.service)) return null;
    if (normalizeDowKey(row.day) !== "sunday") return null;
    if (!/swimfarm/i.test(String(row.venue || ""))) return null;
    var cn = String(row.client_name || "").trim();
    if (!/^(no participant|no client|hold waitlist|closed)$/i.test(cn)) return null;
    var slot = String(row.time_slot || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/:/g, ".");
    var area = String(row.area || "").toLowerCase();
    var inst = String(row.instructors || "");
    var hubHalf =
      (slot === "12.30 to 1.15" || slot.indexOf("12.30 to 1.15") === 0) &&
      (/hub/i.test(area) || /\bberta\b|\bjohn\b/i.test(inst));
    var poolHalf =
      (slot === "1.15 to 2" || slot.indexOf("1.15 to 2") === 0) &&
      (/big\s*pool/i.test(area) || /\baurora\b|\bdan\b|\byoussef\b/i.test(inst));
    if (!hubHalf && !poolHalf) return null;
    return { client_name: "Erik" };
  }

  /**
   * Former Jack S <-> Samer Sunday Multi swap (Jack pool-first) retired 5 Sep 2026.
   * Standing now: Jack S Hub 9.30 then Big Pool 10.15; Samer Hub 9.30 then Big Pool 10.15
   * (different instructor books). Keep no-op so older call sites stay safe.
   */
  function enforceJackSSamerSundayMultiSwap(row) {
    return null;
  }

  function normSundayMultiTimeSlot(raw) {
    return String(raw || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/:/g, ".");
  }

  /**
   * Autumn Sunday Javier pool book (LOCAL EXTRA / DATE_EXTRA truth):
   * - Zaid: Small Pool 9.30–10.15 (not summer 10.15–11 that overlapped Hub)
   * - Jack S: Big Pool 10.15–11 (after Hub 9.30)
   * Aquatic 9–9.30 for Zaid is injected separately (trial split in Sessions Overview).
   */
  function enforceAutumnSundayJavierPoolBook(row) {
    if (!row || !isMultiActivityService(row.service)) return null;
    if (normalizeDowKey(row.day) !== "sunday") return null;
    if (!/swimfarm/i.test(String(row.venue || "SwimFarm"))) return null;
    if (!/\bjavier\b/i.test(String(row.instructors || ""))) return null;
    var cn = String(row.client_name || "").trim();
    var slot = normSundayMultiTimeSlot(row.time_slot);
    var area = String(row.area || "").toLowerCase();
    if (/^zaid\b/i.test(cn) && /small\s*pool/i.test(area)) {
      if (slot === "10.15 to 11" || slot.indexOf("10.15 to 11") === 0) {
        return { time_slot: "9.30 to 10.15" };
      }
    }
    if (/^jack\s*s\b/i.test(cn) && /big\s*pool/i.test(area)) {
      if (slot === "9.30 to 10.15" || slot.indexOf("9.30 to 10.15") === 0) {
        return { time_slot: "10.15 to 11" };
      }
    }
    return null;
  }

  /**
   * Autumn Sunday Hub Multi for Jack S + Zaid (LOCAL):
   * Jack S Hub 9.30 then pool 10.15; Zaid pool 9.30 then Hub 10.15.
   * Summer snap had them reversed on Hub (Jack S 10.15 + Zaid 9.30) so both
   * overlapped their Javier pool half with the same clock.
   */
  function enforceAutumnSundayJackSZaidHubBook(row) {
    if (!row || !isMultiActivityService(row.service)) return null;
    if (normalizeDowKey(row.day) !== "sunday") return null;
    if (!/swimfarm/i.test(String(row.venue || "SwimFarm"))) return null;
    if (!/hub/i.test(String(row.area || ""))) return null;
    /* Dated Sep 6 Hub cover owns that day — do not rewrite those rows. */
    if (normIso(row.session_date) === "2026-09-06") return null;
    var cn = String(row.client_name || "").trim();
    var slot = normSundayMultiTimeSlot(row.time_slot);
    if (/^jack\s*s\b/i.test(cn)) {
      if (slot === "10.15 to 11" || slot.indexOf("10.15 to 11") === 0) {
        return { time_slot: "9.30 to 10.15" };
      }
    }
    if (/^zaid\b/i.test(cn)) {
      if (slot === "9.30 to 10.15" || slot.indexOf("9.30 to 10.15") === 0) {
        return { time_slot: "10.15 to 11" };
      }
    }
    return null;
  }

  /**
   * Autumn Sunday Roberto Big Pool: Yusuf is Aquatic 9–9.30 + Multi 9.30–10.15
   * (same pattern as Zaid/Javier). Feedback merge still paints both as one unit.
   * Collapse any summer "9 to 10.15" Multi back to Multi 9.30–10.15.
   */
  function enforceAutumnSundayRobertoYusufPoolBook(row) {
    if (!row || !isMultiActivityService(row.service)) return null;
    if (normalizeDowKey(row.day) !== "sunday") return null;
    if (!/swimfarm/i.test(String(row.venue || "SwimFarm"))) return null;
    if (!/\broberto\b/i.test(String(row.instructors || ""))) return null;
    var cn = String(row.client_name || "").trim();
    if (!/^yusuf\b/i.test(cn)) return null;
    var area = String(row.area || "").toLowerCase();
    if (area && area.indexOf("big") < 0) return null;
    var slot = normSundayMultiTimeSlot(row.time_slot);
    if (slot === "9 to 10.15" || slot.indexOf("9 to 10.15") === 0) {
      return { time_slot: "9.30 to 10.15" };
    }
    return null;
  }

  /** Standing-template Aquatic 9–9.30 Yusuf+Roberto (pairs with Multi 9.30–10.15). */
  function autumnSundayYusufRobertoAquaticStandingRows() {
    return [
      {
        client_name: "Yusuf Ah",
        day: "Sunday",
        instructors: "ROBERTO",
        service: "Aquatic Activity",
        area: "Big Pool",
        time_slot: "9 to 9.30",
        venue: "SwimFarm",
        session_date: WEEKEND_STANDING_ISO.sunday,
      },
    ];
  }

  /**
   * Dated cover Sundays only (13 Sep / 4 Oct): Aurora pool → Luliya.
   * Standing template rows stay AURORA; calendar remap applies on those dates.
   */
  function remapAutumnSundayAuroraPoolToLuliya(row) {
    if (!row) return null;
    var iso = normIso(row.session_date);
    if (iso !== "2026-09-13" && iso !== "2026-10-04") return null;
    if (normalizeDowKey(row.day) !== "sunday") return null;
    if (!isMultiActivityService(row.service) && !isAquaticService(row.service)) return null;
    if (!/swimfarm/i.test(String(row.venue || "SwimFarm"))) return null;
    if (/hub/i.test(String(row.area || ""))) return null;
    var raw = String(row.instructors || "").trim();
    if (!/\baurora\b/i.test(raw)) return null;
    var mapped = raw.replace(/\bAURORA\b/gi, "LULIYA");
    if (mapped === raw) return null;
    return { instructors: mapped };
  }

  /** Standing-template Aquatic 9–9.30 trial — LOCAL Javier pool (separate from Multi 9.30–10.15). */
  function autumnSundayZaidJavierAquaticStandingRows() {
    return [
      {
        client_name: "Zaid (Trial)",
        day: "Sunday",
        instructors: "JAVIER",
        service: "Aquatic Activity",
        area: "Small Pool",
        time_slot: "9 to 9.30",
        venue: "SwimFarm",
        session_date: WEEKEND_STANDING_ISO.sunday,
      },
    ];
  }

  var YOUSSEF_ACTON_OPEN_430_ROWS = [
    {
      client_name: "No participant",
      day: "Monday",
      instructors: "YOUSSEF",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "4 to 4.30",
      venue: "Acton",
      session_date: "2026-07-13",
    },
    /* Tuesday Acton: Youssef is not on the Autumn pool. Opens sit on Roberto. */
    {
      client_name: "No participant",
      day: "Wednesday",
      instructors: "YOUSSEF",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "4 to 4.30",
      venue: "Acton",
      session_date: "2026-07-15",
    },
  ];

  /** Angel's Monday Acton book → Roberto (inject if live MADRE dropped Angel without successor). */
  var ROBERTO_MONDAY_ACTON_FROM_ANGEL = [
    {
      client_name: "Adam P",
      day: "Monday",
      instructors: "ROBERTO",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "4 to 5.30",
      venue: "Acton",
      session_date: "2026-07-13",
    },
    {
      client_name: "Steven",
      day: "Monday",
      instructors: "ROBERTO",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "5.30 to 6",
      venue: "Acton",
      session_date: "2026-07-13",
    },
    {
      client_name: "Mario",
      day: "Monday",
      instructors: "ROBERTO",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "6 to 6.30",
      venue: "Acton",
      session_date: "2026-07-13",
    },
  ];

  /** Friday Acton aquatic → Youssef (was Roberto). */
  var YOUSSEF_FRIDAY_ACTON_FROM_ROBERTO = [
    {
      client_name: "Adam Pi",
      day: "Friday",
      instructors: "YOUSSEF",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "4 to 5.30",
      venue: "Acton",
      session_date: "2026-07-17",
    },
    {
      client_name: "No participant",
      day: "Friday",
      instructors: "YOUSSEF",
      service: "Aquatic Activity",
      area: "Teaching Pool",
      time_slot: "5.30 to 6",
      venue: "Acton",
      session_date: "2026-07-17",
    },
  ];

  /**
   * Standing Thu Acton AS: Roberto / Simon / Javier / Aurora (no Luliya).
   * Elijah + Yuri with Simon; Aurora CLOSED 4–4.30 (starts 4.30). Eiji aquatic withdrawn.
   * Simon 4–6.30 (Joelle 2:1 last hour). Gap 4.30–5 is open (No participant), not Closed.
   * Yunis + Maiyar with Roberto; Joelle 5.30–6.30 Aurora + Simon 2:1 (both halves).
   */
  var AUTUMN_ACTON_THURSDAY_BOARD = [
    { staff: "ROBERTO", name: "Tom", time: "4 to 4.30", area: "Teaching Pool" },
    /* Yassir last session Thu 10 Sep — standing open from Thu 17 (dated row keeps today). */
    { staff: "ROBERTO", name: "No participant", time: "4.30 to 5", area: "Teaching Pool" },
    { staff: "ROBERTO", name: "Yossi", time: "5 to 5.30", area: "Lane (DE)" },
    { staff: "ROBERTO", name: "Yunis", time: "5.30 to 6", area: "Lane (SE)" },
    { staff: "ROBERTO", name: "Maiyar", time: "6 to 6.30", area: "Lane (DE)" },
    { staff: "SIMON", name: "Elijah", time: "4 to 4.30", area: "Teaching Pool" },
    { staff: "SIMON", name: "No participant", time: "4.30 to 5", area: "Teaching Pool" },
    { staff: "SIMON", name: "Yuri", time: "5 to 5.30", area: "Teaching Pool" },
    { staff: "SIMON", name: "Joelle", time: "5.30 to 6", area: "Teaching Pool" },
    { staff: "SIMON", name: "Joelle", time: "6 to 6.30", area: "Teaching Pool" },
    { staff: "JAVIER", name: "Ayman", time: "4 to 5", area: "Teaching Pool" },
    { staff: "JAVIER", name: "Khalid Ab", time: "5 to 5.30", area: "Teaching Pool" },
    { staff: "JAVIER", name: "Mohamed", time: "5.30 to 6.30", area: "Lane (DE)" },
    { staff: "AURORA", name: "Closed", time: "4 to 4.30", area: "Teaching Pool" },
    { staff: "AURORA", name: "Aqsa", time: "4.30 to 5.30", area: "Teaching Pool" },
    { staff: "AURORA", name: "Joelle", time: "5.30 to 6", area: "Teaching Pool" },
    { staff: "AURORA", name: "Joelle", time: "6 to 6.30", area: "Teaching Pool" },
  ];

  function autumnActonThursdayStandingRows() {
    var iso = DAY_CENTRE_STANDING_ISO.thursday;
    return AUTUMN_ACTON_THURSDAY_BOARD.map(function (slot) {
      return {
        client_name: slot.name,
        day: "Thursday",
        instructors: slot.staff,
        service: "Aquatic Activity",
        area: slot.area || "Teaching Pool",
        time_slot: slot.time,
        venue: "Acton",
        session_date: iso,
      };
    });
  }

  /**
   * Autumn Sunday Westway climbing (60' books).
   * Scott de Wolff not renewing — 12–1 open. Alex 2–3 + 3–4 open. Patrick 3–4 Carlos.
   * Stamp = first standing Autumn Sunday (13 Sep), never a summer week.
   */
  var WEEKEND_STANDING_ISO = {
    saturday: "2026-09-12",
    sunday: "2026-09-13",
  };

  /**
   * Autumn Saturday Acton aquatic (LOCAL weekend board) — Youssef 9.30–1.
   * Stamp = first standing Autumn Saturday (12 Sep). Projects onto Sat 5 Sep+ via
   * WEEKEND_STANDING_ISO.saturday (summer Sat history is purged).
   */
  var AUTUMN_SATURDAY_ACTON_BOARD = [
    { name: "No participant", time: "9.30 to 10" },
    { name: "No participant", time: "10 to 10.30" },
    { name: "Emani", time: "10.30 to 11" },
    { name: "No participant", time: "11 to 11.30" },
    { name: "No participant", time: "11.30 to 12" },
    { name: "Saaib", time: "12 to 12.30" },
    { name: "No participant", time: "12.30 to 1" },
  ];

  function autumnSaturdayActonStandingRows() {
    var iso = WEEKEND_STANDING_ISO.saturday;
    return AUTUMN_SATURDAY_ACTON_BOARD.map(function (slot) {
      return {
        client_name: slot.name,
        day: "Saturday",
        instructors: "YOUSSEF",
        service: "Aquatic Activity",
        area: "Teaching Pool",
        time_slot: slot.time,
        venue: "Acton",
        session_date: iso,
      };
    });
  }

  function isSaturdayActonAquaticStandingRow(row) {
    if (!row || !isAquaticService(row.service) || !isActonVenue(row.venue)) return false;
    var day = normalizeDowKey(row.day);
    var d = normIso(row.session_date);
    if (day !== "saturday") {
      if (!d) return false;
      try {
        var dt = new Date(d + "T12:00:00");
        if (isNaN(dt.getTime()) || dt.getDay() !== 6) return false;
      } catch (_) {
        return false;
      }
    }
    /* Undated + summer history — rebuild from AUTUMN_SATURDAY_ACTON_BOARD. Keep dated Sep+ MADRE. */
    if (!d) return true;
    if (d >= AUTUMN_DC_REPLACE_FROM && d <= AUTUMN_DC_REPLACE_THROUGH) return true;
    if (d === WEEKEND_STANDING_ISO.saturday) return true;
    return false;
  }

  var AUTUMN_SUNDAY_CLIMBING_BOARD = [
    { staff: "ALEX", name: "Eiji", time: "10 to 11" },
    { staff: "ALEX", name: "Yusef", time: "11 to 12" },
    { staff: "ALEX", name: "No participant", time: "12 to 1" },
    { staff: "ALEX", name: "Rodin", time: "1 to 2" },
    { staff: "ALEX", name: "No participant", time: "2 to 3" },
    { staff: "ALEX", name: "No participant", time: "3 to 4" },
    { staff: "CARLOS", name: "Hazem", time: "10 to 11" },
    { staff: "CARLOS", name: "Zaid", time: "11 to 12" },
    { staff: "CARLOS", name: "Serine", time: "12 to 1" },
    { staff: "CARLOS", name: "Zakariya", time: "1 to 2" },
    { staff: "CARLOS", name: "No participant", time: "2 to 3" },
    { staff: "CARLOS", name: "Patrick", time: "3 to 4" },
  ];

  function isClimbingService(service) {
    return /climb/i.test(String(service || ""));
  }

  function isWestwayVenue(venue) {
    return /westway/i.test(String(venue || ""));
  }

  function autumnSundayClimbingStandingRows() {
    var iso = WEEKEND_STANDING_ISO.sunday;
    return autumnSundayClimbingRowsForIso(iso);
  }

  function autumnSundayClimbingRowsForIso(iso) {
    var stamp = normIso(iso) || WEEKEND_STANDING_ISO.sunday;
    return AUTUMN_SUNDAY_CLIMBING_BOARD.map(function (slot) {
      return {
        client_name: slot.name,
        day: "Sunday",
        instructors: slot.staff,
        service: "Climbing Activity",
        area: "Wall",
        time_slot: slot.time,
        venue: "Westway",
        session_date: stamp,
      };
    });
  }

  /**
   * Sun 6 Sep Westway climb (LOCAL EXTRA Alex/Carlos) — dated for that day.
   * Standing stamp stays 13 Sep for later Sundays; do not leave Sep 6 on July-only projection.
   */
  function scrubAndEnsureSep6Climbing(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (
        isSundayWestwayClimbingStandingRow(r) &&
        normIso(r.session_date) === "2026-09-06"
      ) {
        return;
      }
      out.push(r);
    });
    autumnSundayClimbingRowsForIso("2026-09-06").forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    return out;
  }

  function isSundayWestwayClimbingStandingRow(row) {
    if (!row) return false;
    if (!isClimbingService(row.service) || !isWestwayVenue(row.venue)) return false;
    if (normalizeDowKey(row.day) !== "sunday") return false;
    return true;
  }

  function isThursdayActonAquaticStandingRow(row) {
    if (!row) return false;
    if (!isAquaticService(row.service) || !isActonVenue(row.venue)) return false;
    if (normalizeDowKey(row.day) !== "thursday") return false;
    var d = normIso(row.session_date);
    if (!d) return true;
    if (d >= AUTUMN_DC_REPLACE_FROM && d <= AUTUMN_DC_REPLACE_THROUGH) return true;
    return false;
  }

  function mondayActonClientKey(name) {
    var s = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (/^adam\s*p/.test(s)) return "adam_p";
    if (/^steven\b/.test(s)) return "steven";
    if (/^mario\b/.test(s)) return "mario";
    return s.replace(/[^a-z0-9]+/g, "_");
  }

  function hasMondayActonClient(rows, clientKey) {
    var iso = DAY_CENTRE_STANDING_ISO.monday;
    return (rows || []).some(function (r) {
      if (!r) return false;
      if (normIso(r.session_date) !== iso) return false;
      if (!isActonVenue(r.venue) || !isAquaticService(r.service)) return false;
      return mondayActonClientKey(r.client_name) === clientKey;
    });
  }

  function thursdayActonClientKey(name) {
    var s = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (/^yuri\b/.test(s)) return "yuri";
    if (/^eiji\b/.test(s)) return "eiji";
    return s.replace(/[^a-z0-9]+/g, "_");
  }

  function hasThursdayActonClient(rows, clientKey) {
    var iso = DAY_CENTRE_STANDING_ISO.thursday;
    return (rows || []).some(function (r) {
      if (!r) return false;
      if (normIso(r.session_date) !== iso) return false;
      if (!isActonVenue(r.venue) || !isAquaticService(r.service)) return false;
      return thursdayActonClientKey(r.client_name) === clientKey;
    });
  }

  function fridayActonClientKey(name) {
    var s = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (/^adam\s*pi/.test(s) || /^adam\s*p\b/.test(s)) return "adam_pi";
    if (/^amaar/.test(s)) return "amaar";
    return s.replace(/[^a-z0-9]+/g, "_");
  }

  function hasFridayActonClient(rows, clientKey) {
    var iso = DAY_CENTRE_STANDING_ISO.friday;
    return (rows || []).some(function (r) {
      if (!r) return false;
      if (normIso(r.session_date) !== iso) return false;
      if (!isActonVenue(r.venue) || !isAquaticService(r.service)) return false;
      return fridayActonClientKey(r.client_name) === clientKey;
    });
  }

  /**
   * Autumn template stamp dates (NOT summer truth).
   * Weekend stamps are real Autumn Sundays (12–13 Sep).
   * Weekday DC stamps remain Jul 13–17 until those boards move to Sep weekdays.
   */
  var AUTUMN_TERM_FROM_ISO = "2026-09-01";
  /** While applying Autumn patches, drop summer DC/Hub rows in this window before re-injecting LOCAL boards. */
  var AUTUMN_DC_REPLACE_FROM = "2026-06-01";
  var AUTUMN_DC_REPLACE_THROUGH = "2026-07-19";
  var AUTUMN_STANDING_TEMPLATE_ISO_SET = {
    "2026-09-12": 1 /* Sat weekend standing */,
    "2026-09-13": 1 /* Sun Multi/Climb/pool standing */,
    "2026-07-13": 1 /* Mon DC stamp (temporary) */,
    "2026-07-14": 1 /* Tue */,
    "2026-07-15": 1 /* Wed */,
    "2026-07-16": 1 /* Thu */,
    "2026-07-17": 1 /* Fri */,
  };

  function isAutumnStandingTemplateIso(iso) {
    var d = normIso(iso);
    return !!(d && AUTUMN_STANDING_TEMPLATE_ISO_SET[d]);
  }

  function isAutumnTermOrTemplateIso(iso) {
    var d = normIso(iso);
    if (!d) return false;
    if (d >= AUTUMN_TERM_FROM_ISO) return true;
    return !!AUTUMN_STANDING_TEMPLATE_ISO_SET[d];
  }

  /**
   * Drop summer history weeks. Autumn dashboards must never project May/Jun/early-Jul
   * books — only Autumn template stamps (Jul 11–17 LOCAL boards) + dated Sep+ rows.
   */
  function purgeSummerHistoryOutsideAutumnTemplates(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var d = normIso(r.session_date);
      if (!d) return;
      if (!isAutumnTermOrTemplateIso(d)) return;
      out.push(r);
    });
    return out;
  }

  /**
   * Autumn 26/27 standing patches on snap dates (13–17 Jul):
   * - Replace summer Day Centre who-with-whom with Autumn DC board
   *   (drop all DC rows in the summer dated window for weekdays on the board —
   *   not only 13–17 Jul — so June ACAT/Fadi snaps cannot win Autumn projection)
   * - Replace summer Hub Bespoke with Autumn rota staff + Tinashe / Cyrus
   * - Multi-Activity: Bismark→Godsway; Giuseppe→Emanuel; John keeps Hub book;
   *   Berta Sunday = Leader (no Multi clients); Sun 6 only: Emanuel→Youssef (Emanuel off)
   * - Acton Mon: Angel → Roberto (Adam P / Steven / Mario)
   * - Acton Tue: Roberto / Aurora / Javier / Luliya (Serine Roberto; Logan Luliya; Richard Roberto; no Youssef)
   * - Acton Thu: Roberto / Simon / Javier / Aurora (Luliya OFF; Simon keeps Elijah / Yuri)
   * - Northolt Mon/Wed: replace summer (Roberto/Dan) with Services Autumn Dan+Luliya book
   * - Luliya: DC Ikram Mon/Tue/Wed 11–3 + Fri 11-4; pool Mon/Wed Northolt 4.30–6.30,
   *   Tue Acton 4–6.30 (not Thu — Simon covers Thu Acton AS)
   * - Roberto Wed DC: Emanuel 11–12.30 + Fadi 12.30–3 (ends 15:00; no Emanuel 3–4)
   * - Tue DC: Roberto ACAT 11–12 + Ikram 12–3; Michelle Ikram 11–12 / Manager 12–3 / Ikram 3–4;
   *   Luliya Ikram 11–3; Raul Fadi 12.30–3 + Ikram 3–4; Victor Cyrus Bespoke 3.30–5 (not DC)
   * - Victor Wed DC: Emanuel 12.30–3 (Fadi with Roberto+Raul), Ikram 3–4
   * - Fri DC: Victor+Raul Emanuel 1–4 (after Timi); Michelle+Luliya Ikram to 16:00;
   *   Youssef Fadi ends 15:00 (Acton from 16:00 — no Emanuel 3–4)
   * - Acton Fri: Roberto → Youssef (Adam Pi / Amaar); Hub Fri Tinashe: Bismark + Roberto + Emanuel (from Fri 11)
   * - Victor OFF Mondays and Thursdays (DC empty — do not show Overview column)
   * - Raul OFF Tuesdays and Thursdays (DC empty — do not show Overview column)
   * - Acton Mon/Tue/Wed 4–4.30 Youssef: CLOSED → open (No participant)
   * - Acton Thu AS: Simon (Elijah 4–4.30, Yuri 5–5.30); Aurora CLOSED 4–4.30
   */
  function applyAutumnStandingParticipantRows(rows) {
    var out = [];
    var opened430 = { monday: false, tuesday: false, wednesday: false };
    function isLuliyaInstructor(instructorsRaw) {
      return /\bluliya\b|\blulia\b|\baida\b/i.test(String(instructorsRaw || ""));
    }
    function isShadowingOnlyRow(r) {
      var cn = String(r.client_name || "").trim().toLowerCase();
      var svc = String(r.service || "").trim().toLowerCase();
      return cn === "shadowing" || svc === "shadowing";
    }
    function isNortholtVenue(venue) {
      return /northolt/i.test(String(venue || ""));
    }
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      var d = normIso(r.session_date);
      /* Drop summer Luliya shadowing-only Northolt rows (not Autumn book). */
      if (isLuliyaInstructor(r.instructors) && isShadowingOnlyRow(r)) return;
      /* Drop summer Tue Acton aquatic — rebuild from AUTUMN_ACTON_TUESDAY_BOARD. */
      if (isTuesdayActonAquaticStandingRow(r)) return;
      /* Drop summer/live Thu Acton aquatic — rebuild from AUTUMN_ACTON_THURSDAY_BOARD. */
      if (isThursdayActonAquaticStandingRow(r)) return;
      /* Drop summer/live Sun Westway climbing — rebuild from AUTUMN_SUNDAY_CLIMBING_BOARD. */
      if (isSundayWestwayClimbingStandingRow(r)) return;
      /* Drop summer/live Sat Acton aquatic — rebuild from AUTUMN_SATURDAY_ACTON_BOARD. */
      if (isSaturdayActonAquaticStandingRow(r)) return;
      if (isDayCentreService(r.service)) {
        var dkDc = normalizeDowKey(r.day);
        if (
          AUTUMN_DAY_CENTRE_BOARD[dkDc] &&
          d &&
          d >= AUTUMN_DC_REPLACE_FROM &&
          d <= AUTUMN_DC_REPLACE_THROUGH
        ) {
          return;
        }
      }
      /* Drop summer Northolt aquatic Mon/Wed — rebuild from AUTUMN_NORTHOLT_AQUATIC_BOARD. */
      if (
        isAquaticService(r.service) &&
        isNortholtVenue(r.venue) &&
        d &&
        d >= AUTUMN_DC_REPLACE_FROM &&
        d <= AUTUMN_DC_REPLACE_THROUGH
      ) {
        var dkNh = normalizeDowKey(r.day);
        if (AUTUMN_NORTHOLT_AQUATIC_BOARD[dkNh]) return;
      }
      /* Drop all standing-week Bespoke — rebuild from Autumn Hub rota below. */
      if (isBespokeService(r.service) && DAY_CENTRE_STANDING_ISO_SET[d]) {
        return;
      }
      if (isBespokeService(r.service) && /^cyrus\b/i.test(String(r.client_name || "").trim())) {
        return;
      }
      if (isYoussefActon430ClosedSlot(r)) {
        var dkClosed = normalizeDowKey(r.day) || "monday";
        if (opened430[dkClosed] !== undefined) opened430[dkClosed] = true;
        out.push(
          Object.assign({}, r, {
            client_name: "No participant",
          })
        );
        return;
      }
      var erikPatch = restoreErikSundayMultiSeat(r);
      if (erikPatch) {
        out.push(Object.assign({}, r, erikPatch));
        return;
      }
      var jackSamerPatch = enforceJackSSamerSundayMultiSwap(r);
      if (jackSamerPatch) {
        var swapped = Object.assign({}, r, jackSamerPatch);
        /* Never JOHN→BERTA on dated Sun 6 — scrubAndEnsureSep6HubCover owns that day. */
        if (
          isMultiActivityService(swapped.service) &&
          normIso(swapped.session_date) !== "2026-09-06"
        ) {
          var mappedSwap = remapAutumnMultiInstructorsStanding(swapped.instructors);
          if (mappedSwap !== String(swapped.instructors || "").trim()) {
            swapped.instructors = mappedSwap;
          }
        }
        out.push(swapped);
        return;
      }
      var javierPoolPatch = enforceAutumnSundayJavierPoolBook(r);
      if (javierPoolPatch) {
        out.push(Object.assign({}, r, javierPoolPatch));
        return;
      }
      var yusufRobertoPatch = enforceAutumnSundayRobertoYusufPoolBook(r);
      if (yusufRobertoPatch) {
        out.push(Object.assign({}, r, yusufRobertoPatch));
        return;
      }
      var auroraSunPatch = remapAutumnSundayAuroraPoolToLuliya(r);
      if (auroraSunPatch) {
        out.push(Object.assign({}, r, auroraSunPatch));
        return;
      }
      var hubJackZaidPatch = enforceAutumnSundayJackSZaidHubBook(r);
      if (hubJackZaidPatch) {
        var hubPatched = Object.assign({}, r, hubJackZaidPatch);
        if (isMultiActivityService(hubPatched.service) && normIso(hubPatched.session_date) !== "2026-09-06") {
          var mappedHub = remapAutumnMultiInstructorsStanding(hubPatched.instructors);
          if (mappedHub !== String(hubPatched.instructors || "").trim()) {
            hubPatched.instructors = mappedHub;
          }
        }
        out.push(hubPatched);
        return;
      }
      /* Standing Tue/Wed often omit Youssef 4–4.30 — treat CLOSED / NO CLIENT as open too. */
      if (
        isAquaticService(r.service) &&
        isActonVenue(r.venue) &&
        isYoussefInstructor(r.instructors) &&
        (normalizeDowKey(r.day) === "tuesday" || normalizeDowKey(r.day) === "wednesday")
      ) {
        var slotW = String(r.time_slot || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (
          slotW === "4 to 4.30" ||
          slotW === "4.00 to 4.30" ||
          slotW.indexOf("4 to 4.30") === 0
        ) {
          var dkOpen = normalizeDowKey(r.day);
          if (opened430[dkOpen] !== undefined) opened430[dkOpen] = true;
          var cnW = String(r.client_name || "").trim();
          if (/^(closed|no client|noclient|no_client|available)$/i.test(cnW)) {
            out.push(Object.assign({}, r, { client_name: "No participant" }));
            return;
          }
        }
      }
      /* Luliya Tue Acton 4–4.30: on shift — never leave stale Closed from summer snaps. */
      if (
        isAquaticService(r.service) &&
        isActonVenue(r.venue) &&
        normalizeDowKey(r.day) === "tuesday" &&
        /\bluliya\b|\blulia\b|\baida\b/i.test(String(r.instructors || ""))
      ) {
        var slotL = String(r.time_slot || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (
          slotL === "4 to 4.30" ||
          slotL === "4.00 to 4.30" ||
          slotL.indexOf("4 to 4.30") === 0
        ) {
          var cnL = String(r.client_name || "").trim();
          if (/^(closed|no client|noclient|no_client|available)?$/i.test(cnL) || !cnL) {
            out.push(Object.assign({}, r, { client_name: "No participant" }));
            return;
          }
        }
      }
      /* Wed Acton: Cyrus with Javier is 4–5 only (not 5–5.30). */
      if (
        isAquaticService(r.service) &&
        isActonVenue(r.venue) &&
        normalizeDowKey(r.day) === "wednesday" &&
        /^cyrus\b/i.test(String(r.client_name || "").trim())
      ) {
        var slotC = String(r.time_slot || "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        if (
          slotC === "5 to 5.30" ||
          slotC === "5.00 to 5.30" ||
          slotC === "17 to 17.30" ||
          slotC === "17.00 to 17.30"
        ) {
          out.push(Object.assign({}, r, { client_name: "No participant" }));
          return;
        }
        if (slotC === "4 to 5.30" || slotC === "4.00 to 5.30") {
          out.push(Object.assign({}, r, { time_slot: "4 to 5" }));
          return;
        }
      }
      var poolPatch = remapAutumnActonPoolInstructors(r);
      if (poolPatch) {
        out.push(Object.assign({}, r, poolPatch));
        return;
      }
      if (isMultiActivityService(r.service) && normIso(r.session_date) !== "2026-09-06") {
        var mapped = remapAutumnMultiInstructorsStanding(r.instructors);
        if (mapped !== String(r.instructors || "").trim()) {
          out.push(Object.assign({}, r, { instructors: mapped }));
          return;
        }
      }
      out.push(r);
    });
    autumnDayCentreStandingRows().forEach(function (row) {
      out.push(row);
    });
    autumnNortholtAquaticStandingRows().forEach(function (row) {
      out.push(row);
    });
    AUTUMN_BESPOKE_HUB_ROWS.forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    out.push(Object.assign({}, CYRUS_BESPOKE_ROW));
    YOUSSEF_ACTON_OPEN_430_ROWS.forEach(function (row) {
      var dk = normalizeDowKey(row.day);
      if (opened430[dk]) return;
      out.push(Object.assign({}, row));
    });
    ROBERTO_MONDAY_ACTON_FROM_ANGEL.forEach(function (row) {
      var key = mondayActonClientKey(row.client_name);
      if (hasMondayActonClient(out, key)) return;
      out.push(Object.assign({}, row));
    });
    YOUSSEF_FRIDAY_ACTON_FROM_ROBERTO.forEach(function (row) {
      var key = fridayActonClientKey(row.client_name);
      if (hasFridayActonClient(out, key)) return;
      out.push(Object.assign({}, row));
    });
    autumnActonTuesdayStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    autumnActonThursdayStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    autumnSundayClimbingStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    autumnSaturdayActonStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    autumnSundayZaidJavierAquaticStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    autumnSundayYusufRobertoAquaticStandingRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    /* Sep 6 Hub cover is applied once in resolveCanonicalRosterRows (after DB rows). */
    return out;
  }

  /** LOCAL EXTRA Sunday Hub Multi — Berta Lead book (Jack W…Aydaan). */
  var AUTUMN_SUNDAY_HUB_BERTA = [
    { client_name: "Jack W", time_slot: "9.30 to 10.15" },
    { client_name: "Adam Ab", time_slot: "10.15 to 11" },
    { client_name: "Cyrus", time_slot: "11 to 11.45" },
    { client_name: "Arthur Ma", time_slot: "11.45 to 12.30" },
    { client_name: "Erik", time_slot: "12.30 to 1.15" },
    { client_name: "Aydaan Ah", time_slot: "1.15 to 2" },
  ];

  /** LOCAL EXTRA Sunday Hub Multi — Emanuel book (Jack S…Rayyan F). John covers this on Sun 6 only. */
  var AUTUMN_SUNDAY_HUB_EMANUEL = [
    { client_name: "Jack S", time_slot: "9.30 to 10.15" },
    { client_name: "Zaid", time_slot: "10.15 to 11" },
    { client_name: "Eiji", time_slot: "11 to 11.45" },
    { client_name: "Hazem", time_slot: "11.45 to 12.30" },
    { client_name: "Haneef", time_slot: "12.30 to 1.15" },
    { client_name: "Rayyan F", time_slot: "1.15 to 2" },
  ];

  /** LOCAL EXTRA Sunday Hub Multi — Godsway book (Samer…Amaar Ah). */
  var AUTUMN_SUNDAY_HUB_GODSWAY = [
    { client_name: "Samer", time_slot: "9.30 to 10.15" },
    { client_name: "Yusuf Ah", time_slot: "10.15 to 11" },
    { client_name: "Arthur Mo", time_slot: "11 to 11.45" },
    { client_name: "Gabriel", time_slot: "11.45 to 12.30" },
    { client_name: "Adaam Ah", time_slot: "12.30 to 1.15" },
    { client_name: "Amaar Ah", time_slot: "1.15 to 2" },
  ];

  function isSundaySwimfarmHubMultiRow(r) {
    if (!r || !isMultiActivityService(r.service)) return false;
    if (!/swimfarm/i.test(String(r.venue || "SwimFarm"))) return false;
    var day = normalizeDowKey(r.day);
    var sunday = day === "sunday";
    if (!sunday) {
      var d = normIso(r.session_date);
      if (d) {
        try {
          var dt = new Date(d + "T12:00:00");
          if (!isNaN(dt.getTime()) && dt.getDay() === 0) sunday = true;
        } catch (_) {}
      }
    }
    if (!sunday) return false;
    /* Prefer Hub, but also treat known Hub staff Sunday Multi as Hub books
       (summer rows sometimes omit area and escaped the scrub). */
    if (/hub/i.test(String(r.area || ""))) return true;
    return /\b(john|emanuel|giuseppe|berta|godsway|bismark|bismarck)\b/i.test(
      String(r.instructors || "")
    );
  }

  function autumnSundayStandingHubRows() {
    var iso = WEEKEND_STANDING_ISO.sunday;
    function mapBook(staff, book) {
      return book.map(function (slot) {
        return {
          client_name: slot.client_name,
          day: "Sunday",
          instructors: staff,
          service: "Multi-Activity",
          area: "Hub Room",
          time_slot: slot.time_slot,
          venue: "SwimFarm",
          session_date: iso,
        };
      });
    }
    return mapBook("BERTA", AUTUMN_SUNDAY_HUB_BERTA)
      .concat(mapBook("EMANUEL", AUTUMN_SUNDAY_HUB_EMANUEL))
      .concat(mapBook("GODSWAY", AUTUMN_SUNDAY_HUB_GODSWAY));
  }

  /**
   * Sunday Hub Multi = LOCAL only.
   * Drop legacy summer/DB Sunday Multi for Hub books (with or without Hub in area).
   * Re-inject: standing Berta Lead + Godsway + Emanuel; Sun 6 dated John cover + Berta + Godsway.
   */
  function scrubAndEnsureSep6HubCover(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (isSundaySwimfarmHubMultiRow(r)) {
        var inst = String(r.instructors || "");
        if (/\b(john|emanuel|giuseppe|berta|godsway|bismark|bismarck)\b/i.test(inst)) return;
      }
      out.push(r);
    });
    autumnSundayStandingHubRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    autumnSundaySep6HubCoverRows().forEach(function (row) {
      out.push(Object.assign({}, row));
    });
    return out;
  }

  /**
   * OLD / released clients — never keep their names on Autumn Sessions seats.
   * Exact Joel only (never Joelle). Aug15 unpaid: Karo, Kareena, Shire.
   */
  function isAug15ReleasedFormerClient(name) {
    var n = String(name || "")
      .trim()
      .replace(/\s+/g, " ");
    if (!n) return false;
    if (/^karo\b/i.test(n)) return true;
    if (/^kareena\b/i.test(n)) return true;
    if (/^shire\b/i.test(n)) return true;
    return false;
  }

  /** Joel Hibbert-Nixon — not continuing Autumn 26/27 (exact Joel / Joel …, never Joelle). */
  function isOldJoelNotContinuing(name) {
    var n = String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    return n === "joel" || n.indexOf("joel ") === 0;
  }

  function scrubReleasedFormerClientRows(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r) return;
      if (isAug15ReleasedFormerClient(r.client_name) || isOldJoelNotContinuing(r.client_name)) {
        out.push(Object.assign({}, r, { client_name: "No participant" }));
        return;
      }
      out.push(r);
    });
    return out;
  }

  function scrubAug15ReleasedFormerClientRows(rows) {
    return scrubReleasedFormerClientRows(rows);
  }

  /**
   * Services Day Centre staff board model (ordered columns).
   * @param {string} dowNorm
   * @param {{ coach?: string, participant?: string }|null} [filt]
   */
  function buildDayCentreStaffBoard(dowNorm, filt) {
    var dk = normalizeDowKey(dowNorm);
    var cols = AUTUMN_DAY_CENTRE_BOARD[dk] || [];
    var byStaff = {};
    var staffOrder = [];
    var coachFilt = filt && filt.coach ? String(filt.coach).trim().toLowerCase() : "";
    var paxFilt = filt && filt.participant ? String(filt.participant).trim().toLowerCase() : "";
    cols.forEach(function (col) {
      var snm = String(col.staff || "").trim();
      if (!snm) return;
      if (coachFilt && snm.toLowerCase().indexOf(coachFilt) < 0 && coachFilt.indexOf(snm.toLowerCase()) < 0) {
        return;
      }
      var snKey = snm.toLowerCase();
      var clients = [];
      (col.clients || []).forEach(function (c) {
        var pax = String(c.name || "").trim();
        if (!pax) return;
        if (paxFilt && pax.toLowerCase().indexOf(paxFilt) < 0 && paxFilt.indexOf(pax.toLowerCase()) < 0) {
          return;
        }
        var parsed = parseHmToMinutes(c.time);
        clients.push({
          client: pax,
          time: String(c.time || "").trim(),
          area:
            pax.toLowerCase() === "manager" ? "Hub · Manager" : "Day Centre",
          startMin: parsed.startMin,
          duration: parsed.duration,
        });
      });
      if (!clients.length) return;
      clients.sort(function (a, b) {
        return a.startMin - b.startMin || String(a.client).localeCompare(String(b.client));
      });
      byStaff[snKey] = { key: snKey, name: snm, clients: clients };
      staffOrder.push(snKey);
    });
    return { staffOrder: staffOrder, byStaff: byStaff };
  }

  /**
   * Canonical roster rows for STAFF_DASHBOARD_SOURCE.rows.
   * @param {{ skipDb?: boolean }} [opts]
   */
  function resolveCanonicalRosterRows(opts) {
    opts = opts || {};
    var base = getBundleBaseRows();
    /* Autumn standing first, then portal_roster_rows so dated trials (e.g. Muhammad Mon Northolt) win. */
    var withAutumn = applyAutumnStandingParticipantRows(base);
    var merged = opts.skipDb ? withAutumn.slice() : applyPortalRosterDbRows(withAutumn);
    merged = applyAutumnActonTuesdayStanding(merged);
    merged = applyAutumnActonThursdayStanding(merged);
    merged = scrubDepartedAutumnInstructorRows(merged);
    merged = applyAutumnWeek1DayCentre(merged);
    merged = applyFadiAbsentDayCentre(merged);
    merged = scrubAndEnsureSep6HubCover(merged);
    merged = scrubAndEnsureSep6Climbing(merged);
    merged = scrubAndEnsureAutumnSundayPoolStanding(merged);
    merged = scrubAndEnsureSep6JavierPool(merged);
    merged = scrubAndEnsureSep6AuroraRobertoPool(merged);
    merged = scrubAndEnsureSep7VictorRaulCover(merged);
    merged = scrubAndEnsureSep10YassirLastSession(merged);
    merged = scrubAndEnsureSep11AmaarLastSession(merged);
    merged = scrubAndEnsureSep8ActonRedistribute(merged);
    merged = scrubAndEnsureSep10AnasMakeup(merged);
    merged = scrubAug15ReleasedFormerClientRows(merged);
    /* After all Autumn patches: no summer history weeks left to snap onto Sep+. */
    merged = purgeSummerHistoryOutsideAutumnTemplates(merged);
    return dedupeRosterAdapterRows(merged);
  }

  function resolveCanonicalStaffDashboardSource() {
    var base = global.STAFF_DASHBOARD_SOURCE || {};
    var rows = resolveCanonicalRosterRows();
    return Object.assign({}, base, {
      rows: rows,
      rosterSourceId: SOURCE_ID,
      rosterSourceVersion: SOURCE_VERSION,
      rosterSourceNote:
        global.PORTAL_MADRE_LIVE && global.PORTAL_MADRE_LIVE.rows
          ? "Autumn LOCAL standing templates + dated Sep+ (summer history purged)"
          : "Autumn LOCAL standing templates + dated Sep+ (summer history purged)",
    });
  }

  function getCanonicalRosterMeta() {
    var bundleCount = getBundleBaseRows().length;
    var dbCount = Array.isArray(global.PORTAL_ROSTER_ROWS_CACHE)
      ? global.PORTAL_ROSTER_ROWS_CACHE.length
      : 0;
    var resolved = resolveCanonicalRosterRows();
    return {
      sourceId: SOURCE_ID,
      version: SOURCE_VERSION,
      bundleRowCount: bundleCount,
      portalRosterRowsCached: dbCount,
      resolvedRowCount: resolved.length,
    };
  }

  /**
   * Hub Bespoke Tinashe template staff for a weekday (before date remaps).
   * Used so Overview can still paint a day-off Tinashe card when remap strips them (John Wed 9/15/16).
   */
  function autumnHubBespokeStandingHasStaff(dayName, staffRaw) {
    var wantDay = String(dayName || "")
      .trim()
      .toLowerCase();
    var wantStaff = String(staffRaw || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)[0]
      .replace(/[^a-z0-9]+/g, "");
    if (!wantDay || !wantStaff) return false;
    for (var i = 0; i < AUTUMN_BESPOKE_HUB_ROWS.length; i++) {
      var row = AUTUMN_BESPOKE_HUB_ROWS[i];
      if (String(row.day || "").trim().toLowerCase() !== wantDay) continue;
      var inst = String(row.instructors || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");
      if (inst === wantStaff || inst.indexOf(wantStaff) === 0) return true;
    }
    return false;
  }

  /**
   * Standing "does not work this weekday" — hide empty Overview columns.
   * Not the same as day-off-requested (staff_unavailability): that DOES paint Overview.
   * Victor: Mon + Thu. Raul: Tue + Thu.
   * Fri 11 – Fri 18 (Fadi away boards): Victor + Raul work Office those days;
   * Thu: Luliya / Michelle / Youssef have no seats (hide). Roberto keeps Acton AS.
   */
  function autumnStaffStandingOffOnIso(iso, staffRaw) {
    var d = normIso(iso);
    if (!d) return false;
    var key = String(staffRaw || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    if (!key) return false;
    var dow = -1;
    try {
      var dt = new Date(d + "T12:00:00");
      if (!isNaN(dt.getTime())) dow = dt.getDay();
    } catch (_) {}
    if (dow < 0) return false;
    /* 0 Sun … 1 Mon 2 Tue 3 Wed 4 Thu 5 Fri 6 Sat */
    if (isFadiAbsentDcBoardIso(d)) {
      if (key === "victor" || key.indexOf("victor") === 0) return false;
      if (key === "raul" || key.indexOf("raul") === 0) return false;
      /* Roberto still works Acton Thu — not standing off. */
      if (key === "roberto" || key.indexOf("roberto") === 0) return false;
      if (
        key === "luliya" ||
        key.indexOf("luliya") === 0 ||
        key === "michelle" ||
        key.indexOf("michelle") === 0 ||
        key === "youssef" ||
        key.indexOf("youssef") === 0
      ) {
        return dow === 4;
      }
      return false;
    }
    if (key === "victor" || key.indexOf("victor") === 0) {
      return dow === 1 || dow === 4;
    }
    if (key === "raul" || key.indexOf("raul") === 0) {
      return dow === 2 || dow === 4;
    }
    return false;
  }

  global.PortalRosterCanonical = {
    SOURCE_ID: SOURCE_ID,
    SOURCE_VERSION: SOURCE_VERSION,
    getBundleBaseRows: getBundleBaseRows,
    applyPortalRosterDbRows: applyPortalRosterDbRows,
    applyAutumnStandingParticipantRows: applyAutumnStandingParticipantRows,
    resolveCanonicalRosterRows: resolveCanonicalRosterRows,
    resolveCanonicalStaffDashboardSource: resolveCanonicalStaffDashboardSource,
    remapAutumnMultiInstructorsStanding: remapAutumnMultiInstructorsStanding,
    resolveAutumnInstructorsForCalendarDate: resolveAutumnInstructorsForCalendarDate,
    remapAutumnMultiInstructors: remapAutumnMultiInstructors,
    getCanonicalRosterMeta: getCanonicalRosterMeta,
    autumnStaffStandingOffOnIso: autumnStaffStandingOffOnIso,
    autumnHubBespokeStandingHasStaff: autumnHubBespokeStandingHasStaff,
    buildDayCentreStaffBoard: buildDayCentreStaffBoard,
    autumnDayCentreStandingRows: autumnDayCentreStandingRows,
    DAY_CENTRE_STANDING_ISO: DAY_CENTRE_STANDING_ISO,
    WEEKEND_STANDING_ISO: WEEKEND_STANDING_ISO,
    AUTUMN_DAY_CENTRE_BOARD: AUTUMN_DAY_CENTRE_BOARD,
    WEEK1_DC_BOARD: WEEK1_DC_BOARD,
    isAutumnWeek1DcIso: isAutumnWeek1DcIso,
    FADI_ABSENT_DC_BOARD: FADI_ABSENT_DC_BOARD,
    isFadiAbsentDcWindowIso: isFadiAbsentDcWindowIso,
    isFadiAbsentDcBoardIso: isFadiAbsentDcBoardIso,
    isAutumnDcStandingTemplateRow: isAutumnDcStandingTemplateRow,
    AUTUMN_NO_SESSION_STAFF_KEYS: AUTUMN_NO_SESSION_STAFF_KEYS,
    AUTUMN_TERM_FROM_ISO: AUTUMN_TERM_FROM_ISO,
    AUTUMN_STANDING_TEMPLATE_ISO_SET: AUTUMN_STANDING_TEMPLATE_ISO_SET,
    isAutumnStandingTemplateIso: isAutumnStandingTemplateIso,
    isAutumnTermOrTemplateIso: isAutumnTermOrTemplateIso,
    isAutumnNoSessionStaffKey: isAutumnNoSessionStaffKey,
    scrubDepartedAutumnInstructorRows: scrubDepartedAutumnInstructorRows,
    scrubDepartedAngelInstructorRows: scrubDepartedAngelInstructorRows,
    scrubAug15ReleasedFormerClientRows: scrubAug15ReleasedFormerClientRows,
    isAug15ReleasedFormerClient: isAug15ReleasedFormerClient,
    purgeSummerHistoryOutsideAutumnTemplates: purgeSummerHistoryOutsideAutumnTemplates,
    normIso: normIso,
  };
})(typeof window !== "undefined" ? window : globalThis);
