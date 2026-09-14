# -*- coding: utf-8 -*-
"""
Autumn Term 2026 staff pool timetable + term_from_timetable.js for staff dashboard.

Calendar view: Mon 31 Aug 2026 (closed) through Wed 31 Dec 2026.
Sessions: Tue 1 Sep 2026 .. Thu 17 Dec 2026 (closed from 18 Dec).
Half term: Mon 26 Oct .. Fri 30 Oct 2026.

Run:
  python database/apply_staff_timetable_autumn_2026.py
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "database"
sys.path.insert(0, str(OUT.parent))

from build_machine_exports import (  # noqa: E402
    merge_dashboard_weekday_maps,
    merge_term_staff_shift_date_maps,
    merge_term_staff_weekday_maps,
    term_staff_shift_dates_by_profile_key,
    term_staff_shift_dates_from_roster_machine_rows,
    term_staff_weekday_indices_from_roster_machine_rows,
    term_staff_weekday_indices_from_timetable_records,
    _month_range_keys,
)

CALENDAR_FROM = "2026-08-31"
CALENDAR_TO = "2026-12-31"
SESSION_FROM = "2026-09-01"  # Day Centre only Mon 1 Sep
AFTERSCHOOL_WEEKEND_FROM = "2026-09-05"  # Sat/Sun after-school (first club weekend)
AFTERSCHOOL_WEEKDAY_FROM = "2026-09-07"  # Mon 7 Sep — weekday after-schools / evenings
SESSION_TO = "2026-12-17"
TERM_BREAK_FROM = "2026-10-26"
TERM_BREAK_TO = "2026-10-30"
HALF_TERM_WEEK_STARTS = ["2026-10-26"]

TERM_CLOSED_DATES = ["2026-08-31"] + [
    f"2026-12-{d:02d}" for d in range(18, 32)
]

# Staff no longer on rota (Autumn 26/27). Bismark returned Hub Tinashe from Wed 9 Sep.
DEPARTED_STAFF = frozenset({"angel", "giuseppe"})


def slot(date_iso: str, day: str, staff: str, time_range: str, venue: str) -> dict:
    raw = f"{staff} {time_range}".strip()
    return {
        "date": date_iso,
        "day": day,
        "venue": venue,
        "staff_name": staff,
        "time_range": time_range,
        "raw_assignment": raw,
    }


def _pairs(staff: str, time_range: str, venue: str) -> tuple[str, str, str]:
    return (staff, time_range, venue)


def monday_template() -> list[tuple[str, str, str]]:
    return [
        # Day Centre staff only: Michelle, Luliya, Raul, Roberto, Victor, Youssef (Mon).
        # Victor Office day = Monday 11-3. Raul 11-4.
        _pairs("Michelle", "10.45-4.15", "SwimFarm"),
        _pairs("Luliya", "11-3", "SwimFarm"),
        _pairs("Raul", "11-4", "SwimFarm"),
        _pairs("Roberto", "11-3", "SwimFarm"),
        _pairs("Victor", "11-3 Office", "SwimFarm"),
        _pairs("Youssef", "12.30-3", "SwimFarm"),
        # After-school pool
        _pairs("Roberto", "4-6.30", "Acton"),
        _pairs("Youssef", "4-6.30", "Acton"),
        _pairs("Dan", "4.30-6.30", "Northolt"),
        _pairs("Luliya", "4.30-6.30", "Northolt"),
        _pairs("Sandra", "4-6", "Westway"),
        # Hub Bespoke Mon seats 1–2 standing; seat 3 dated in build_autumn_rows
        _pairs("Godsway", "4.15-6.15", "SwimFarm"),
        _pairs("John", "4.15-6.15", "SwimFarm"),
    ]


def tuesday_template() -> list[tuple[str, str, str]]:
    return [
        # Day Centre (no Youssef Tue). Raul off floor → Office.
        _pairs("Michelle", "10.45-4.15", "SwimFarm"),
        _pairs("Luliya", "11-3", "SwimFarm"),
        _pairs("Raul", "Office", "SwimFarm"),
        _pairs("Roberto", "11-3", "SwimFarm"),
        _pairs("Victor", "12.30-3", "SwimFarm"),
        _pairs("Victor", "3.30-5", "SwimFarm"),  # Cyrus Bespoke (own column)
        # Tue Acton AS pool (no Youssef)
        _pairs("Roberto", "4-6.30", "Acton"),
        _pairs("Luliya", "4-6.30", "Acton"),
        _pairs("Javier", "4-6.30", "Acton"),
        _pairs("Aurora", "4.30-6.30", "Acton"),
    ]


def wednesday_template() -> list[tuple[str, str, str]]:
    return [
        # Day Centre (no Youssef Wed) — Raul + Victor both on floor 11-4.
        _pairs("Michelle", "10.45-4.15", "SwimFarm"),
        _pairs("Luliya", "11-3", "SwimFarm"),
        _pairs("Raul", "11-4", "SwimFarm"),
        _pairs("Roberto", "11-3", "SwimFarm"),
        _pairs("Victor", "11-4", "SwimFarm"),
        _pairs("Javier", "4-6.30", "Acton"),
        _pairs("Youssef", "4-6.30", "Acton"),
        _pairs("Dan", "4.30-6.30", "Northolt"),
        _pairs("Luliya", "4.30-6.30", "Northolt"),
        # Hub Bespoke Wed = Godsway + Bismark + John (Emmanuel covers John on dated Weds only)
        _pairs("Godsway", "4.15-6.15", "SwimFarm"),
        _pairs("Bismark", "4.15-6.15", "SwimFarm"),
        _pairs("John", "4.15-6.15", "SwimFarm"),
    ]


def thursday_template() -> list[tuple[str, str, str]]:
    return [
        # Day Centre Thu: Roberto + Youssef (Michelle/Luliya/Raul/Victor not Thu DC)
        _pairs("Roberto", "12.15-3.15", "SwimFarm"),
        _pairs("Youssef", "12.30-3", "SwimFarm"),
        # Thu Acton AS
        _pairs("Roberto", "4-6.30", "Acton"),
        _pairs("Simon", "4-6.30", "Acton"),
        _pairs("Javier", "4-6.30", "Acton"),
        _pairs("Aurora", "4.30-6.30", "Acton"),
    ]


def friday_template() -> list[tuple[str, str, str]]:
    return [
        # Day Centre staff only + Youssef Fri — Victor + Raul + Roberto 11-4.
        _pairs("Michelle", "10.45-4.15", "SwimFarm"),
        _pairs("Luliya", "11-4", "SwimFarm"),
        _pairs("Raul", "11-4", "SwimFarm"),
        _pairs("Roberto", "11-4", "SwimFarm"),
        _pairs("Victor", "11-4", "SwimFarm"),
        _pairs("Youssef", "12.30-3", "SwimFarm"),
        _pairs("Youssef", "4-6", "Acton"),
        # Fri Hub Bespoke = Bismark + Roberto + Emmanuel
        _pairs("Bismark", "4.15-6.15", "SwimFarm"),
        _pairs("Roberto", "4.15-6.15", "SwimFarm"),
        _pairs("Emmanuel", "4.15-6.15", "SwimFarm"),
    ]


def saturday_template() -> list[tuple[str, str, str]]:
    # First weekend Sat 5 Sep — Acton Aquatic (not Day Centre).
    return [_pairs("Youssef", "9.30-1", "Acton")]


def sunday_template() -> list[tuple[str, str, str]]:
    return [
        # Aquatic (+ same hours when duplicated into Multi columns).
        _pairs("Aurora", "9-3", "SwimFarm"),
        _pairs("Javier", "9-3", "SwimFarm"),
        _pairs("Roberto", "8.45-3.15", "SwimFarm"),
        # Hub Lead 9-2.30; Hub MA seats 9.30-2.
        _pairs("Berta", "9-2.30", "SwimFarm"),
        # Standing Hub Multi; Sun 6 Sep John covers (Emmanuel off) via dated row below.
        _pairs("Emmanuel", "9.30-2", "SwimFarm"),
        _pairs("Godsway", "9.30-2", "SwimFarm"),
        # Westway Climbing (weekend)
        _pairs("Alex", "10-2", "Westway"),
        _pairs("Carlos", "10-4", "Westway"),
    ]


WEEKDAY_TEMPLATES: dict[int, tuple[str, list]] = {
    0: ("Sunday", sunday_template),
    1: ("Monday", monday_template),
    2: ("Tuesday", tuesday_template),
    3: ("Wednesday", wednesday_template),
    4: ("Thursday", thursday_template),
    5: ("Friday", friday_template),
    6: ("Saturday", saturday_template),
}


def parse_iso(s: str) -> date:
    y, m, d = [int(x) for x in s.split("-")]
    return date(y, m, d)


def iso_from_date(d: date) -> str:
    return d.isoformat()


def is_session_day(d: date) -> bool:
    iso = iso_from_date(d)
    if iso < SESSION_FROM or iso > SESSION_TO:
        return False
    if TERM_BREAK_FROM <= iso <= TERM_BREAK_TO:
        return False
    if iso in TERM_CLOSED_DATES:
        return False
    return True


def build_autumn_rows() -> list[dict]:
    rows: list[dict] = []
    cur = parse_iso(SESSION_FROM)
    end = parse_iso(SESSION_TO)
    while cur <= end:
        if is_session_day(cur):
            wd = cur.weekday()
            # Python: Mon=0 .. Sun=6 → grid Sun=0 .. Sat=6
            grid = (wd + 1) % 7
            day_name, fn = WEEKDAY_TEMPLATES[grid]
            iso = iso_from_date(cur)
            for staff, tr, venue in fn():
                if not _assignment_allowed(iso, tr):
                    continue
                # Bismark Hub Tinashe: Wed/Fri from 9 Sep; Mon from 14 Sep.
                if staff.lower() == "bismark":
                    if day_name == "Monday" and iso < "2026-09-14":
                        continue
                    if day_name in ("Wednesday", "Friday") and iso < "2026-09-09":
                        continue
                # Tue Acton 8 Sep only: Javier seat empty (day off; Aurora covered by Javi).
                if (
                    day_name == "Tuesday"
                    and iso == "2026-09-08"
                    and staff.lower() == "javier"
                    and venue.lower() == "acton"
                ):
                    continue
                # Tue Cyrus Bespoke (Victor 3.30-5): starts 15 Sep.
                if (
                    day_name == "Tuesday"
                    and staff.lower() == "victor"
                    and venue.lower().replace(" ", "") in ("swimfarm", "swimfarmcentre")
                    and "3.30" in _norm(tr).replace(":", ".")
                    and iso < "2026-09-15"
                ):
                    continue
                # Tue 8 Sep: Raul takes Victor DC 12.30-3; Victor → Office.
                if (
                    day_name == "Tuesday"
                    and iso == "2026-09-08"
                    and venue.lower().replace(" ", "") in ("swimfarm", "swimfarmcentre")
                ):
                    if staff.lower() == "victor" and "12.30" in _norm(tr).replace(
                        ":", "."
                    ):
                        rows.append(slot(iso, day_name, "Victor", "Office", "SwimFarm"))
                        continue
                    if staff.lower() == "raul" and _norm(tr).lower() == "office":
                        rows.append(
                            slot(iso, day_name, "Raul", "12.30-3", "SwimFarm")
                        )
                        continue
                # Sun 6 Sep: Emmanuel off — John covers Hub Multi book (LOCAL week-1).
                if (
                    day_name == "Sunday"
                    and iso == "2026-09-06"
                    and staff.lower() == "emmanuel"
                ):
                    continue
                # Thu 3 / 10 / 17 Sep:
                # Keep Roberto+Youssef DC rows so the date exists; hours align paints CLOSED.
                # Roberto Acton Aquatic OPEN on 10 + 17 (week-1 Acton already CLOSED on 3).
                if day_name == "Thursday" and iso in (
                    "2026-09-03",
                    "2026-09-10",
                    "2026-09-17",
                ):
                    vslug = venue.lower().replace(" ", "")
                    if (
                        staff.lower() == "roberto"
                        and vslug == "acton"
                        and iso == "2026-09-03"
                    ):
                        continue
                    if staff.lower() == "emmanuel":
                        continue
                # Sun 13 Sep: Javier started 9.30 (full day block from then).
                if (
                    day_name == "Sunday"
                    and iso == "2026-09-13"
                    and staff.lower() == "javier"
                    and venue.lower().replace(" ", "") in ("swimfarm", "swimfarmcentre")
                    and _norm(tr).replace(":", ".") == "9-3"
                ):
                    rows.append(slot(iso, day_name, "Javier", "9.30-3", "SwimFarm"))
                    continue
                # Wed Roberto DC: 11-4 on first three Wednesdays (2 / 9 / 16 Sep).
                if (
                    day_name == "Wednesday"
                    and iso in ("2026-09-02", "2026-09-09", "2026-09-16")
                    and staff.lower() == "roberto"
                    and venue.lower().replace(" ", "") in ("swimfarm", "swimfarmcentre")
                    and _norm(tr).replace(":", ".") == "11-3"
                ):
                    rows.append(slot(iso, day_name, "Roberto", "11-4", "SwimFarm"))
                    continue
                # Wed Hub Bespoke: Emmanuel covers John on 9 / 16 / 23 Sep only
                # (standing Wed seat is John). Skip John's standing those days.
                if (
                    day_name == "Wednesday"
                    and iso in ("2026-09-09", "2026-09-16", "2026-09-23")
                    and staff.lower() == "john"
                    and venue.lower().replace(" ", "") in ("swimfarm", "swimfarmcentre")
                    and tr.replace(":", ".").startswith("4.15")
                ):
                    continue
                rows.append(slot(iso, day_name, staff, tr, venue))
            # Mon Hub Bespoke seat 3: Victor 7 Sep; Bismark from 14 Sep (not Emmanuel).
            if day_name == "Monday" and _assignment_allowed(iso, "4.15-6.15"):
                if iso == "2026-09-07":
                    rows.append(slot(iso, day_name, "Victor", "4.15-6.15", "SwimFarm"))
                elif iso >= "2026-09-14":
                    rows.append(slot(iso, day_name, "Bismark", "4.15-6.15", "SwimFarm"))
            # Wed Hub Bespoke: Emmanuel covers John (Tinashe) on 9 / 16 / 23 Sep.
            if (
                day_name == "Wednesday"
                and iso in ("2026-09-09", "2026-09-16", "2026-09-23")
                and _assignment_allowed(iso, "4.15-6.15")
            ):
                rows.append(slot(iso, day_name, "Emmanuel", "4.15-6.15", "SwimFarm"))
            # Sun 6 Sep: John covers Emmanuel Hub Multi hours.
            if day_name == "Sunday" and iso == "2026-09-06":
                rows.append(slot(iso, day_name, "John", "9.30-2", "SwimFarm"))
        cur += timedelta(days=1)

    # Emmanuel Hub Bespoke on cover Weds: SHADOWING under the hours.
    for r in rows:
        if str(r.get("staff_name") or "").lower() != "emmanuel":
            continue
        if str(r.get("date") or "")[:10] not in ("2026-09-09", "2026-09-16", "2026-09-23"):
            continue
        tr = _norm(r.get("time_range", "")).replace(":", ".")
        if not tr.startswith("4.15"):
            continue
        r["raw_assignment"] = f"{_norm(r.get('staff_name'))} {_norm(r.get('time_range'))} SHADOWING"

    rows.sort(key=lambda r: (r["date"], r["day"], r["staff_name"], r["time_range"]))
    return rows


def filter_departed(cfg: dict) -> dict:
    """Drop Angel / Giuseppe from weekday and shift maps."""
    out = dict(cfg)
    for key in (
        "termStaffWeekdayIndicesByProfileKey",
        "termStaffWeekdayIndicesDashboardByProfileKey",
        "termStaffShiftDatesByProfileKey",
    ):
        m = out.get(key)
        if isinstance(m, dict):
            out[key] = {k: v for k, v in m.items() if k not in DEPARTED_STAFF}
    return out


def write_autumn_term_js(records: list[dict], roster_rows: list | None = None) -> None:
    path = OUT / "term_from_timetable.js"
    dates = sorted({r["date"] for r in records if r.get("date")})
    if not dates:
        raise SystemExit("No autumn timetable dates generated")
    first_s, last_s = dates[0], dates[-1]

    view_from = CALENDAR_FROM
    view_to = CALENDAR_TO
    tt_term = [r for r in records if r.get("date") and view_from <= r["date"] <= last_s]
    roster_term = [
        r
        for r in roster_rows or []
        if str(r.get("session_date") or "")[:10] >= SESSION_FROM
        and str(r.get("session_date") or "")[:10] <= SESSION_TO
    ]

    wd_tt = term_staff_weekday_indices_from_timetable_records(tt_term)
    wd_roster = term_staff_weekday_indices_from_roster_machine_rows(roster_term)
    staff_wd = merge_term_staff_weekday_maps(wd_tt, wd_roster)
    staff_wd_dashboard = merge_dashboard_weekday_maps(wd_tt, wd_roster)

    shift_tt = term_staff_shift_dates_by_profile_key(tt_term, view_from, view_to)
    shift_roster = term_staff_shift_dates_from_roster_machine_rows(
        roster_term, view_from, view_to
    )
    shift_dates = merge_term_staff_shift_date_maps(shift_tt, shift_roster)

    # John: standing Mon/Wed only. Sunday Hub Multi = 6 Sep cover only (not 13 Sep / standing).
    john_sunday_cover = {"2026-09-06"}
    for key in ("john",):
        if key in staff_wd:
            staff_wd[key] = [d for d in staff_wd[key] if d != 0]
        if key in staff_wd_dashboard:
            staff_wd_dashboard[key] = [d for d in staff_wd_dashboard[key] if d != 0]
        if key in shift_dates:
            shift_dates[key] = [
                d
                for d in shift_dates[key]
                if parse_iso(d).weekday() != 6 or d in john_sunday_cover
            ]
            for extra in sorted(john_sunday_cover):
                if extra not in shift_dates[key]:
                    shift_dates[key].append(extra)
            shift_dates[key].sort()

    # Emmanuel standing: Sunday + Friday only. Wed Hub Bespoke is John;
    # Emmanuel covers John on dated Weds (9 / 16 / 23 Sep) only.
    emmanuel_wed_covers = {"2026-09-09", "2026-09-16", "2026-09-23"}
    if "emmanuel" in staff_wd:
        staff_wd["emmanuel"] = [d for d in staff_wd["emmanuel"] if d in (0, 5)]
    if "emmanuel" in staff_wd_dashboard:
        staff_wd_dashboard["emmanuel"] = [
            d for d in staff_wd_dashboard["emmanuel"] if d in (0, 5)
        ]
    if "emmanuel" in shift_dates:
        shift_dates["emmanuel"] = [
            d
            for d in shift_dates["emmanuel"]
            if parse_iso(d).weekday() != 2 or d in emmanuel_wed_covers
        ]
        for extra in sorted(emmanuel_wed_covers):
            if extra not in shift_dates["emmanuel"]:
                shift_dates["emmanuel"].append(extra)
        shift_dates["emmanuel"].sort()

    # Aurora day off → Luliya pool (Sun 13 Sep + Sun 4 Oct) + Acton offs already in DB.
    aurora_away = {"2026-09-08", "2026-09-13", "2026-09-15", "2026-10-04"}
    if "aurora" in shift_dates:
        shift_dates["aurora"] = [d for d in shift_dates["aurora"] if d not in aurora_away]
        shift_dates["aurora"].sort()

    view_month_keys = _month_range_keys(view_from, view_to)
    dashboard_months = [mm - 1 for _, mm in view_month_keys]
    dashboard_year = view_month_keys[0][0] if view_month_keys else 2026
    dashboard_first_dom: dict[str, int] = {}
    all_view_dates = sorted(
        set(dates)
        | {CALENDAR_FROM}
        | {f"2026-12-{d:02d}" for d in range(18, 32)}
    )
    for mi in dashboard_months:
        prefix = f"{dashboard_year:04d}-{mi + 1:02d}-"
        in_month = [d for d in all_view_dates if d.startswith(prefix) and view_from <= d <= view_to]
        if not in_month:
            continue
        first_day = min(int(d.split("-")[2]) for d in in_month)
        if first_day > 1:
            dashboard_first_dom[str(mi)] = first_day

    payload = filter_departed(
        {
            "termName": "Autumn Term 2026",
            "termCalendarYear": 2026,
            "termCalendarMonths": dashboard_months,
            "termCalendarFirstDom": dashboard_first_dom,
            "termDashboardCalendarYear": dashboard_year,
            "termDashboardCalendarMonths": dashboard_months,
            "termDashboardCalendarFirstDom": dashboard_first_dom,
            "termDashboardCalendarFrom": view_from,
            "termDashboardCalendarTo": view_to,
            "termDashboardCalendarToDayCentre": SESSION_TO,
            "termStaffDayCentreCalendarKeys": [
                "michelle",
                "luliya",
                "victor",
                "raul",
                "roberto",
                "youssef",
            ],
            "firstDate": first_s,
            "lastDate": last_s,
            "termBreakFrom": TERM_BREAK_FROM,
            "termBreakTo": TERM_BREAK_TO,
            "termResumeDate": SESSION_FROM,
            "termAfterSchoolWeekendFrom": AFTERSCHOOL_WEEKEND_FROM,
            "termAfterSchoolWeekdayFrom": AFTERSCHOOL_WEEKDAY_FROM,
            "termSummerDatedRosterFrom": "2026-06-01",
            "termSummerDatedRosterThrough": "2026-07-19",
            "termFeedbackReminderFromIso": SESSION_FROM,
            "termClosedDates": TERM_CLOSED_DATES,
            "termStaffAwayDatesByProfileKey": {
                "aurora": sorted(aurora_away),
            },
            "termStaffOffWeekdaysRangeByProfileKey": {
                "roberto": {
                    "from": SESSION_FROM,
                    "to": SESSION_TO,
                    "weekdays": [6],
                },
                "john": {
                    "from": SESSION_FROM,
                    "to": SESSION_TO,
                    # Friday + Sunday off standing. Sun 6 Sep Hub Multi cover = extra calendar date.
                    "weekdays": [5, 0],
                },
                # Luliya OFF Thursdays (Acton Thu = Roberto / Simon / Javier / Aurora).
                "luliya": {
                    "from": SESSION_FROM,
                    "to": SESSION_TO,
                    "weekdays": [4],
                },
                # Emmanuel standing Fri+Sun only (Wed = John; dated covers via extra dates).
                "emmanuel": {
                    "from": SESSION_FROM,
                    "to": SESSION_TO,
                    "weekdays": [1, 2, 3, 4, 6],
                },
            },
            "termStaffFeedbackCompleteDatesByProfileKey": {},
            "termStaffExtraCalendarDatesByProfileKey": {
                "john": ["2026-09-06"],
                "emmanuel": sorted(emmanuel_wed_covers),
            },
            "termStaffCatchUpFeedbackDatesByProfileKey": {},
            "termStaffCatchUpFeedbackDoneClientsByDateByProfileKey": {},
            "termStaffLateSubmissionBypassProfileKeys": [],
            "termClientFirstSessionDate": {
                "cyrus": "2026-09-09",
            },
            "termHalfTermWeekStarts": HALF_TERM_WEEK_STARTS,
            "termStaffWeekdayIndicesByProfileKey": staff_wd,
            "termStaffWeekdayIndicesDashboardByProfileKey": staff_wd_dashboard,
            "termStaffShiftDatesByProfileKey": shift_dates,
        }
    )

    body = (
        "// Auto-generated by database/apply_staff_timetable_autumn_2026.py\n"
        "// Re-run: python database/apply_staff_timetable_autumn_2026.py\n"
        "window.PORTAL_TERM_FROM_TIMETABLE = "
        + json.dumps(payload, indent=2, ensure_ascii=False)
        + ";\n"
    )
    path.write_text(body, encoding="utf-8")
    print(f"Wrote {path} ({len(records)} shift rows, view {view_from}..{view_to})")


def copy_term_to_portal_vic() -> None:
    src = OUT / "term_from_timetable.js"
    if not src.exists():
        return
    text = src.read_text(encoding="utf-8")
    for rel in (
        "term_from_timetable.js",
        "portal/term_from_timetable.js",
        "portal-shared-js/term_from_timetable.js",
    ):
        dst = ROOT / "working_ui" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text, encoding="utf-8")


VENUE_ORDER = ["Westway", "Northolt", "Acton", "SwimFarm"]
HOUR_SHEETS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]
# Reference "today" for completed vs confirmed row status when regenerating.
HOURS_STATUS_TODAY = "2026-08-28"


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def _venue_style(venue: str) -> str:
    v = venue.lower()
    if v == "westway":
        return "westway"
    if v == "northolt":
        return "northolt"
    if v == "acton":
        return "acton"
    if v in ("swimfarm", "swim farm"):
        return "swimfarm"
    return "default"


def _hours_band(time_range: str) -> str:
    tr = _norm(time_range).lower().replace(":", ".")
    if tr == "office" or tr.endswith(" office"):
        return "day_centre"
    # Hub Bespoke evening seats + Tue Cyrus (Victor 3.30-5).
    if re.match(r"^4\.15", tr) or re.match(r"^3\.30", tr):
        return "bespoke"
    # Michelle DC paid band 10.45; Roberto Thu DC 12.15; core DC morning/midday.
    # Do NOT treat 9.30 as DC — weekend Acton (Youssef Sat) / Sunday MA starts 9.30.
    if re.match(r"^(10\.45|11|12\.|1\b)", tr):
        return "day_centre"
    # Sunday Aquatic afternoon-only (e.g. Javier 13 Sep 2-3) + morning/pool bands.
    if re.match(r"^(2\b|4|8\.|9|10)", tr):
        return "pool"
    return "other"


def _pre_afterschool(iso: str) -> bool:
    """Week-1 before afterschool/weekends open (DC only on weekdays 1–4 Sep)."""
    d = parse_iso(iso)
    wd = d.weekday()  # Mon=0 .. Sun=6
    if wd <= 4:
        return iso < AFTERSCHOOL_WEEKDAY_FROM
    return iso < AFTERSCHOOL_WEEKEND_FROM


def _is_dc_hours_entry(entry: dict) -> bool:
    """True when the standing column is Day Centre (not afterschool / Bespoke)."""
    text = _norm(entry.get("text", ""))
    band = str(entry.get("band") or "").lower()
    compact = text.lower().replace(" ", "")
    if "4.15-6.15" in compact or "4.15–6.15" in compact:
        return False
    if band in ("pool", "bespoke", "aquatic"):
        return False
    m = re.search(
        r"(\d{1,2}(?:[.:]\d{2})?\s*-\s*\d{1,2}(?:[.:]\d{2})?)",
        text,
    )
    tr = m.group(1) if m else ""
    if tr and _is_afternoon_pool(tr):
        return False
    return True


# Dates with seat exceptions — never use as standing column template.
HOURS_TEMPLATE_SKIP_DATES = frozenset(
    {
        "2026-09-06",  # John covers Emmanuel Hub
        "2026-09-08",  # Javier Acton empty; Victor/Raul Office swap; Cyrus not yet
        "2026-09-13",  # Javier 9.30 start
        "2026-09-03",  # Thu Roberto/Emmanuel CLOSED
        "2026-09-10",
        "2026-09-17",
    }
)

# Thu early Sep: Roberto DC + Youssef DC CLOSED; Roberto Acton open from 10 Sep.
THU_ROBERTO_DC_CLOSED = frozenset(
    {"2026-09-03", "2026-09-10", "2026-09-17"}
)
THU_YOUSSEF_DC_CLOSED = frozenset(
    {"2026-09-03", "2026-09-10", "2026-09-17"}
)


def _standing_ref_date(
    dates_sorted: list[str],
    day: str,
    by_date_venue: dict | None = None,
    venue_slots: dict | None = None,
) -> str:
    """Standing column template = fullest date on/after afterschool open (not a thin cover week)."""
    wd_name = (day or "").strip().lower()
    if wd_name in ("saturday", "sunday"):
        floor = AFTERSCHOOL_WEEKEND_FROM
    else:
        floor = AFTERSCHOOL_WEEKDAY_FROM
    candidates = [d for d in dates_sorted if d >= floor]
    if not candidates:
        return dates_sorted[-1] if dates_sorted else ""
    preferred = [d for d in candidates if d not in HOURS_TEMPLATE_SKIP_DATES] or candidates
    if not by_date_venue or not venue_slots:
        return preferred[0]

    def score(iso: str) -> int:
        total = 0
        for venue in venue_slots:
            total += len((by_date_venue.get(iso) or {}).get(venue) or [])
        return total

    return max(preferred, key=score)


def _hours_staff_key(text: str) -> str:
    m = re.match(r"^([A-Za-z]+)", _norm(text))
    return (m.group(1) if m else "").lower()


def _hours_time_key(text: str) -> str:
    m = re.search(
        r"(\d{1,2}(?:[.:]\d{2})?\s*-\s*\d{1,2}(?:[.:]\d{2})?)",
        _norm(text),
    )
    if not m:
        return ""
    return re.sub(r"\s+", "", m.group(1)).replace(":", ".")


def _align_venue_row(
    template: list[dict],
    available: list[dict],
    iso: str,
) -> list[dict]:
    """
    Map this date's assignments onto standing column order.
    Week-1 non-Day Centre seats that are not yet open → CLOSED.
    Time-band fallback only for cover swaps (e.g. John → Emmanuel hours),
    never steal another standing name that shares the same clock (Acton 4-6.30).
    """
    avail = [dict(x) for x in (available or [])]
    used = [False] * len(avail)
    standing_names = {
        _hours_staff_key(ref.get("text", ""))
        for ref in template
        if _hours_staff_key(ref.get("text", ""))
    }
    out: list[dict] = []
    for ref in template:
        ref_text = _norm(ref.get("text", ""))
        ref_band = str(ref.get("band") or "")
        ref_who = _hours_staff_key(ref_text)
        # Tue 8 Sep: Raul → Victor DC column; Victor → Office column.
        if iso == "2026-09-08" and parse_iso(iso).weekday() == 1:
            want = None
            if ref_who == "raul" and re.search(r"\boffice\b", ref_text, re.I):
                want = "victor office"
            elif ref_who == "victor" and "12.30" in _norm(ref_text).replace(":", "."):
                want = "raul 12.30-3"
            if want:
                for j, ent in enumerate(avail):
                    if used[j]:
                        continue
                    if _norm(ent.get("text", "")).lower().replace(":", ".") == want:
                        used[j] = True
                        out.append(avail[j])
                        break
                else:
                    if want.startswith("victor"):
                        out.append({"text": "Victor Office", "band": "day_centre"})
                    else:
                        out.append({"text": "Raul 12.30-3", "band": "day_centre"})
                continue
        # Early CLOSED overrides (before name/time match can steal the seat).
        if (
            iso in THU_ROBERTO_DC_CLOSED
            and ref_who == "roberto"
            and _is_dc_hours_entry(ref)
        ):
            out.append({"text": "CLOSED", "band": ref_band or "day_centre"})
            continue
        if (
            iso in THU_YOUSSEF_DC_CLOSED
            and ref_who == "youssef"
            and _is_dc_hours_entry(ref)
        ):
            out.append({"text": "CLOSED", "band": ref_band or "day_centre"})
            continue
        # Tue Cyrus Bespoke before 15 Sep → CLOSED.
        if (
            iso < "2026-09-15"
            and parse_iso(iso).weekday() == 1
            and ref_who == "victor"
            and "3.30" in _norm(ref_text).replace(":", ".")
        ):
            out.append({"text": "CLOSED", "band": ref_band or "bespoke"})
            continue
        match_i = None
        for j, ent in enumerate(avail):
            if used[j]:
                continue
            if _norm(ent.get("text", "")) == ref_text:
                match_i = j
                break
        if match_i is None:
            ref_time = _hours_time_key(ref_text)
            if ref_time:
                for j, ent in enumerate(avail):
                    if used[j]:
                        continue
                    if _hours_time_key(ent.get("text", "")) != ref_time:
                        continue
                    who = _hours_staff_key(ent.get("text", ""))
                    # Cover in same hours (John for Emmanuel). Do not pull Luliya into Javier.
                    if who and who in standing_names and who != ref_who:
                        continue
                    match_i = j
                    break
        # Same person, different clock (e.g. Roberto 11-3 → 11-4 on early Wednesdays).
        # Do not pull DC Roberto into Bespoke Roberto column (or the reverse).
        if match_i is None and ref_who:
            name_hits = [
                j
                for j, ent in enumerate(avail)
                if not used[j] and _hours_staff_key(ent.get("text", "")) == ref_who
            ]
            if len(name_hits) == 1:
                ent = avail[name_hits[0]]
                ref_dc = _is_dc_hours_entry(ref)
                ent_dc = _is_dc_hours_entry(ent)
                ref_bespoke = "4.15-6.15" in _norm(ref_text).lower().replace(" ", "")
                ent_bespoke = "4.15-6.15" in _norm(ent.get("text", "")).lower().replace(
                    " ", ""
                )
                if ref_dc == ent_dc and ref_bespoke == ent_bespoke:
                    match_i = name_hits[0]
        if match_i is not None:
            used[match_i] = True
            out.append(avail[match_i])
            continue
        if _pre_afterschool(iso) and not _is_dc_hours_entry(ref):
            out.append({"text": "CLOSED", "band": ref_band or "pool"})
            continue
        out.append({"text": "", "band": ref_band})
    return out


# Hub Bespoke seat order by weekday (seat 1 / 2 / 3)
_HUB_BESPOKE_ORDER = {
    "Monday": ["godsway", "john", "bismark", "victor", "emmanuel", "raul"],
    "Wednesday": ["godsway", "bismark", "john", "emmanuel"],
    "Friday": ["bismark", "roberto", "emmanuel"],
}


def _swimfarm_hours_sort_key(entry: dict, day: str = "") -> tuple:
    text = _norm(entry.get("text", ""))
    name = text.split(" ")[0].lower() if text else ""
    compact = text.lower().replace(" ", "")
    if "4.15-6.15" in compact or "4.15–6.15" in compact:
        order = _HUB_BESPOKE_ORDER.get(day) or [
            "godsway",
            "john",
            "bismark",
            "roberto",
            "emmanuel",
            "victor",
            "raul",
        ]
        try:
            rank = order.index(name)
        except ValueError:
            rank = 50
        return (0, rank, text)
    return (1, name, text)


def _is_afternoon_pool(time_range: str) -> bool:
    tr = _norm(time_range).lower().replace(":", ".")
    return bool(re.match(r"^(3\.30|4)", tr))


def _assignment_allowed(iso: str, time_range: str) -> bool:
    """Skip weekday after-school before Mon 7 Sep; weekend before 5–6 Sep."""
    d = parse_iso(iso)
    wd = d.weekday()  # Mon=0 .. Sun=6
    if wd <= 4 and iso < AFTERSCHOOL_WEEKDAY_FROM and _is_afternoon_pool(time_range):
        return False
    if wd >= 5 and iso < AFTERSCHOOL_WEEKEND_FROM:
        return False
    return True


def _format_date_label(iso: str) -> str:
    try:
        return parse_iso(iso).strftime("%d-%b-%Y")
    except Exception:
        return iso


def _date_row_status(d: str) -> str:
    if d in set(TERM_CLOSED_DATES) or (TERM_BREAK_FROM <= d <= TERM_BREAK_TO):
        return "closed"
    return "completed" if d < HOURS_STATUS_TODAY else "confirmed"


def _assignment_tone(raw: str) -> str:
    t = _norm(raw)
    if not t:
        return ""
    low = t.lower()
    if low == "closed":
        return "closed"
    if "training" in low:
        return "training"
    if "(sh)" in low or "aida" in low:
        return "shadow"
    if re.search(r"\bjavi\b", low) or re.search(r"\braúl\b|\braul\b", low, re.I):
        return "cover"
    if "godsway" in low:
        return "updated"
    if low in ("n/a", "na"):
        return "na"
    return ""


def _hour_cell(text: str, tone: str, date_iso: str, day: str, col_key: str, band: str = "") -> dict:
    out = {
        "text": text,
        "tone": tone,
        "editKey": f"{date_iso}|{day}|{col_key}",
    }
    if band:
        out["band"] = band
    return out


def build_autumn_staff_hours(records: list[dict]) -> dict:
    """Dated Staff hours sheets for Autumn 26/27 (no summer Excel / departed staff)."""
    by_day: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        day = _norm(r.get("day", ""))
        if day not in HOUR_SHEETS:
            continue
        staff = _norm(r.get("staff_name", ""))
        if staff.lower() in DEPARTED_STAFF:
            continue
        iso = _norm(r.get("date", ""))[:10]
        tr = _norm(r.get("time_range", ""))
        if not iso or not _assignment_allowed(iso, tr):
            continue
        by_day[day].append(r)

    sheets: dict[str, dict] = {}
    for day in HOUR_SHEETS:
        recs = by_day.get(day, [])
        if not recs:
            sheets[day] = {"venueGroups": [], "dates": [], "placeholder": True}
            continue

        venue_slots: dict[str, int] = defaultdict(int)
        by_date_venue: dict[str, dict[str, list[dict]]] = defaultdict(lambda: defaultdict(list))
        for r in recs:
            d = _norm(r.get("date", ""))[:10]
            venue = _norm(r.get("venue", "")) or "—"
            raw = _norm(r.get("raw_assignment", "")) or (
                f"{_norm(r.get('staff_name', ''))} {_norm(r.get('time_range', ''))}".strip()
            )
            if not d or not raw:
                continue
            by_date_venue[d][venue].append(
                {"text": raw, "band": _hours_band(_norm(r.get("time_range", "")))}
            )
            venue_slots[venue] = max(venue_slots[venue], len(by_date_venue[d][venue]))

        # Stable Hub Bespoke seat order (Godsway / John / seat 3…) then Day Centre.
        for d, venues in by_date_venue.items():
            for venue, vals in venues.items():
                if venue.lower().replace(" ", "") in ("swimfarm", "swimfarmcentre"):
                    vals.sort(key=lambda e: _swimfarm_hours_sort_key(e, day))
        venue_groups = []
        for venue in sorted(
            venue_slots.keys(),
            key=lambda v: VENUE_ORDER.index(v) if v in VENUE_ORDER else 99,
        ):
            n = venue_slots[venue]
            venue_groups.append(
                {
                    "venue": venue,
                    "style": _venue_style(venue),
                    "span": n,
                    "labels": [venue] * n,
                }
            )

        dates_sorted = sorted(by_date_venue.keys())
        ref_iso = _standing_ref_date(dates_sorted, day, by_date_venue, venue_slots)
        # Standing column template per venue (afterschool/Bespoke seats included).
        venue_template: dict[str, list[dict]] = {}
        for g in venue_groups:
            venue = g["venue"]
            ref_vals = list(by_date_venue.get(ref_iso, {}).get(venue, []))
            while len(ref_vals) < g["span"]:
                ref_vals.append({"text": "", "band": "pool"})
            venue_template[venue] = ref_vals[: g["span"]]

        date_rows = []
        for d in dates_sorted:
            cells = []
            for g in venue_groups:
                venue = g["venue"]
                template = venue_template.get(venue) or [
                    {"text": "", "band": ""} for _ in range(g["span"])
                ]
                available = by_date_venue[d].get(venue, [])
                aligned = _align_venue_row(template, available, d)
                for i in range(g["span"]):
                    entry = aligned[i] if i < len(aligned) else {}
                    val = entry.get("text", "") if isinstance(entry, dict) else ""
                    band = entry.get("band", "") if isinstance(entry, dict) else ""
                    cells.append(
                        _hour_cell(val, _assignment_tone(val), d, day, f"{venue}:{i}", band)
                    )
            date_rows.append(
                {
                    "date": d,
                    "label": _format_date_label(d),
                    "status": _date_row_status(d),
                    "cells": cells,
                }
            )

        sheets[day] = {
            "venueGroups": venue_groups,
            "dates": date_rows,
            "placeholder": not date_rows,
        }
    return sheets


def write_autumn_staff_hours_js(records: list[dict]) -> None:
    hours = build_autumn_staff_hours(records)
    payload = {
        "meta": {
            "hoursFrom": SESSION_FROM,
            "hoursTo": SESSION_TO,
            "termBreakFrom": TERM_BREAK_FROM,
            "termBreakTo": TERM_BREAK_TO,
            "timetableSource": "database/apply_staff_timetable_autumn_2026.py",
            "hoursLabel": "Autumn Term 2026 (1 Sep - 17 Dec)",
        },
        "staffHours": hours,
    }
    body = (
        "// Auto-generated by database/apply_staff_timetable_autumn_2026.py\n"
        "// Re-run: python database/apply_staff_timetable_autumn_2026.py\n"
        "window.PORTAL_AUTUMN_STAFF_HOURS = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    for rel in (
        "portal/autumn_staff_hours_reference.js",
        "portal-shared-js/autumn_staff_hours_reference.js",
    ):
        dst = ROOT / "working_ui" / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(body, encoding="utf-8")
    print(f"Wrote autumn staff hours reference ({len(body) // 1024} KB)")


def main() -> None:
    records = build_autumn_rows()
    json_path = OUT / "staff_timetable_machine.json"
    roster_path = OUT / "staff_clients_machine.json"
    roster_rows = (
        json.loads(roster_path.read_text(encoding="utf-8"))
        if roster_path.exists()
        else []
    )
    # Keep historical summer rows; append/replace autumn dated pool shifts.
    existing: list[dict] = []
    if json_path.exists():
        existing = json.loads(json_path.read_text(encoding="utf-8"))
    kept = [
        r
        for r in existing
        if not (
            str(r.get("date") or "")[:10] >= SESSION_FROM
            and str(r.get("date") or "")[:10] <= CALENDAR_TO
        )
    ]
    merged = kept + records
    merged.sort(key=lambda r: (r.get("date") or "", r.get("day") or "", r.get("staff_name") or ""))
    json_path.write_text(json.dumps(merged, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"Wrote {json_path} ({len(records)} autumn rows, {len(merged)} total)")

    write_autumn_term_js(records, roster_rows)
    write_autumn_staff_hours_js(records)
    copy_term_to_portal_vic()
    print("Copied term_from_timetable.js to working_ui/")


if __name__ == "__main__":
    main()
