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
import sys
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
AFTERSCHOOL_WEEKEND_FROM = "2026-09-05"  # Sat/Sun after-school from club weekend
AFTERSCHOOL_WEEKDAY_FROM = "2026-09-08"  # Week 2 Mon — weekday after-school (e.g. Cyrus Tue)
SESSION_TO = "2026-12-17"
TERM_BREAK_FROM = "2026-10-26"
TERM_BREAK_TO = "2026-10-30"
HALF_TERM_WEEK_STARTS = ["2026-10-26"]

TERM_CLOSED_DATES = ["2026-08-31"] + [
    f"2026-12-{d:02d}" for d in range(18, 32)
]

# Staff no longer on rota (Autumn 26/27).
DEPARTED_STAFF = frozenset({"angel", "giuseppe", "bismark"})


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
        _pairs("Roberto", "11-1", "SwimFarm"),
        _pairs("Emanuel", "11-1", "SwimFarm"),
        _pairs("Fadi", "1-3", "SwimFarm"),
        _pairs("Michelle", "11-4", "SwimFarm"),
        _pairs("Victor", "11-4", "SwimFarm"),  # Ikram
        _pairs("Raul", "11-1", "SwimFarm"),
        _pairs("Emanuel", "1-4", "SwimFarm"),
        _pairs("Youssef", "12.30-3", "SwimFarm"),
        _pairs("Roberto", "4-6.30", "Acton"),
        _pairs("Youssef", "4-6.30", "Acton"),
        _pairs("Dan", "4.30-6.30", "Northolt"),
        _pairs("Luliya", "4.30-6.30", "Northolt"),
        _pairs("Sandra", "4-6", "Westway"),
        _pairs("Godsway", "4.15-6.15", "SwimFarm"),
        _pairs("John", "4.15-6.15", "SwimFarm"),
        _pairs("Emanuel", "4.15-6.15", "SwimFarm"),
    ]


def tuesday_template() -> list[tuple[str, str, str]]:
    return [
        # Morning DC — split cohorts (Ikram / Fadi / Cyrus), not one block per worker.
        _pairs("Roberto", "11-3", "SwimFarm"),  # Ikram
        _pairs("Michelle", "11-4", "SwimFarm"),  # Ikram
        _pairs("Victor", "12.30-3", "SwimFarm"),  # Fadi
        _pairs("Victor", "3.30-5", "SwimFarm"),  # Cyrus bespoke (Thu → Tue)
        _pairs("Raul", "12.30-3", "SwimFarm"),  # Fadi
        _pairs("Michelle", "3-4", "SwimFarm"),  # Ikram
        _pairs("Luliya", "4.30-6.30", "Acton"),
        _pairs("Youssef", "4-6.30", "Acton"),
        _pairs("Javier", "4-6.30", "Acton"),
        _pairs("Aurora", "4.30-6.30", "Acton"),
    ]


def wednesday_template() -> list[tuple[str, str, str]]:
    return [
        _pairs("Roberto", "11-1", "SwimFarm"),
        _pairs("Emanuel", "11-1", "SwimFarm"),
        _pairs("Fadi", "1-3", "SwimFarm"),
        _pairs("Michelle", "11-4", "SwimFarm"),
        _pairs("Virginia", "11-4", "SwimFarm"),
        _pairs("Victor", "1-4", "SwimFarm"),  # Emanuel
        _pairs("Raul", "12.30-3", "SwimFarm"),
        _pairs("Javier", "4-6.30", "Acton"),
        _pairs("Youssef", "4-6.30", "Acton"),
        _pairs("Dan", "4.30-6.30", "Northolt"),
        _pairs("Luliya", "4.30-6.30", "Northolt"),
        _pairs("Godsway", "4.15-6.15", "SwimFarm"),
        _pairs("John", "4.15-6.15", "SwimFarm"),
        _pairs("Emanuel", "4.15-6.15", "SwimFarm"),
    ]


def thursday_template() -> list[tuple[str, str, str]]:
    return [
        _pairs("Roberto", "12.30-3", "SwimFarm"),
        _pairs("Youssef", "12.30-3", "SwimFarm"),
        _pairs("Roberto", "4-6.30", "Acton"),
        _pairs("Youssef", "4-6.30", "Acton"),
        _pairs("Javier", "4-6.30", "Acton"),
        _pairs("Aurora", "4.30-6.30", "Acton"),
        _pairs("Luliya", "4.30-6.30", "Acton"),
    ]


def friday_template() -> list[tuple[str, str, str]]:
    return [
        _pairs("Roberto", "11-1", "SwimFarm"),
        _pairs("Emanuel", "11-1", "SwimFarm"),
        _pairs("Fadi", "1-3", "SwimFarm"),
        _pairs("Michelle", "11-4", "SwimFarm"),
        _pairs("Victor", "11-4", "SwimFarm"),  # Ikram
        _pairs("Raul", "11-1", "SwimFarm"),
        _pairs("Emanuel", "1-3", "SwimFarm"),
        _pairs("Youssef", "12.30-3", "SwimFarm"),
        _pairs("Emanuel", "3-4", "SwimFarm"),
        _pairs("Roberto", "4-6", "Acton"),
        # Fri Hub Bespoke: Emanuel + Victor + Youssef with Tinashe.
        _pairs("Emanuel", "4.15-6.15", "SwimFarm"),
        _pairs("Victor", "4.15-6.15", "SwimFarm"),
        _pairs("Youssef", "4.15-6.15", "SwimFarm"),
    ]


def saturday_template() -> list[tuple[str, str, str]]:
    return [_pairs("Youssef", "9.30-1.30", "SwimFarm")]


def sunday_template() -> list[tuple[str, str, str]]:
    return [
        _pairs("Aurora", "9-3", "SwimFarm"),
        _pairs("Javier", "9-3", "SwimFarm"),
        _pairs("Roberto", "8.45-3.15", "SwimFarm"),
        _pairs("Berta", "9-2.30", "SwimFarm"),
        _pairs("Emanuel", "9.15-2.15", "SwimFarm"),
        _pairs("Godsway", "9.15-2.15", "SwimFarm"),
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
                rows.append(slot(iso, day_name, staff, tr, venue))
        cur += timedelta(days=1)
    rows.sort(key=lambda r: (r["date"], r["day"], r["staff_name"], r["time_range"]))
    return rows


def filter_departed(cfg: dict) -> dict:
    """Drop Angel / Giuseppe / Bismark from weekday and shift maps."""
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
            "termStaffAwayDatesByProfileKey": {},
            "termStaffOffWeekdaysRangeByProfileKey": {
                "roberto": {
                    "from": SESSION_FROM,
                    "to": SESSION_TO,
                    "weekdays": [6],
                },
                "john": {
                    "from": SESSION_FROM,
                    "to": SESSION_TO,
                    "weekdays": [5, 0],
                },
            },
            "termStaffFeedbackCompleteDatesByProfileKey": {},
            "termStaffExtraCalendarDatesByProfileKey": {},
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
    copy_term_to_portal_vic()
    print("Copied term_from_timetable.js to working_ui/")


if __name__ == "__main__":
    main()
