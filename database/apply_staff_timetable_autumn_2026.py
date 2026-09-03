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
        # Roberto DC part-time 21h band: Mon–Wed 11-3, Thu 12.15-3.15, Fri 11-3 + Fri Hub 4.15-6.15.
        _pairs("Roberto", "11-3", "SwimFarm"),
        _pairs("Emanuel", "11-1", "SwimFarm"),
        _pairs("Fadi", "1-3", "SwimFarm"),
        _pairs("Michelle", "10.45-4.15", "SwimFarm"),
        _pairs("Luliya", "11-3", "SwimFarm"),  # Ikram
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
        _pairs("Michelle", "10.45-4.15", "SwimFarm"),  # paid band (clients 11-4)
        _pairs("Luliya", "11-3", "SwimFarm"),  # Ikram
        _pairs("Victor", "12.30-3", "SwimFarm"),  # Fadi
        _pairs("Victor", "3.30-5", "SwimFarm"),  # Cyrus bespoke (Thu → Tue)
        _pairs("Raul", "12.30-3", "SwimFarm"),  # Fadi
        # Tue Acton AS pool: Roberto, Luliya, Javier, Aurora (no Youssef).
        _pairs("Roberto", "4-6.30", "Acton"),
        _pairs("Luliya", "4-6.30", "Acton"),
        _pairs("Javier", "4-6.30", "Acton"),
        _pairs("Aurora", "4.30-6.30", "Acton"),
    ]


def wednesday_template() -> list[tuple[str, str, str]]:
    return [
        # Roberto DC 11-3 (no Wed Acton).
        _pairs("Roberto", "11-3", "SwimFarm"),
        _pairs("Michelle", "10.45-4.15", "SwimFarm"),
        _pairs("Luliya", "11-3", "SwimFarm"),  # Ikram
        _pairs("Victor", "12.30-3", "SwimFarm"),  # Fadi
        _pairs("Victor", "3-4", "SwimFarm"),  # Ikram
        _pairs("Raul", "12.30-3", "SwimFarm"),  # Fadi
        _pairs("Raul", "3-4", "SwimFarm"),  # Emanuel
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
        _pairs("Roberto", "12.15-3.15", "SwimFarm"),
        _pairs("Youssef", "12.30-3", "SwimFarm"),
        # Thu Acton AS: Roberto / Simon / Javier / Aurora — Luliya OFF Thursdays.
        _pairs("Roberto", "4-6.30", "Acton"),
        _pairs("Simon", "4-6.30", "Acton"),
        _pairs("Javier", "4-6.30", "Acton"),
        _pairs("Aurora", "4.30-6.30", "Acton"),
    ]


def friday_template() -> list[tuple[str, str, str]]:
    return [
        _pairs("Roberto", "11-3", "SwimFarm"),
        _pairs("Emanuel", "11-1", "SwimFarm"),
        _pairs("Fadi", "1-3", "SwimFarm"),
        _pairs("Michelle", "10.45-4.15", "SwimFarm"),
        _pairs("Luliya", "11-4", "SwimFarm"),  # Ikram
        _pairs("Victor", "11-4", "SwimFarm"),  # Ikram
        _pairs("Raul", "11-1", "SwimFarm"),
        _pairs("Emanuel", "1-3", "SwimFarm"),
        # Youssef DC 12.30–16:00 (Fadi + Emanuel) then Acton aquatic (not Roberto).
        _pairs("Youssef", "12.30-4", "SwimFarm"),
        _pairs("Youssef", "4-6", "Acton"),
        # Fri Hub Bespoke in Roberto's 21h DC contract (Tinashe).
        _pairs("Roberto", "4.15-6.15", "SwimFarm"),
    ]


def saturday_template() -> list[tuple[str, str, str]]:
    return [_pairs("Youssef", "9.30-1.30", "SwimFarm")]


def sunday_template() -> list[tuple[str, str, str]]:
    return [
        _pairs("Aurora", "9-3", "SwimFarm"),
        _pairs("Javier", "9-3", "SwimFarm"),
        _pairs("Roberto", "8.45-3.15", "SwimFarm"),
        _pairs("Berta", "9-2.30", "SwimFarm"),
        # John is NOT standing Sunday — Mon/Wed only; 6 Sep Hub Multi cover via extra calendar date.
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
                if not _assignment_allowed(iso, tr):
                    continue
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
                "lulia",
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
                    # Friday + Sunday off standing. Sun 6 Sep Hub Multi cover = extra calendar date.
                    "weekdays": [5, 0],
                },
                # Luliya OFF Thursdays (Acton Thu = Roberto / Simon / Javier / Aurora).
                "lulia": {
                    "from": SESSION_FROM,
                    "to": SESSION_TO,
                    "weekdays": [4],
                },
            },
            "termStaffFeedbackCompleteDatesByProfileKey": {},
            "termStaffExtraCalendarDatesByProfileKey": {
                "john": ["2026-09-06"],
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
    if re.match(r"^(11|12\.30|1\b|9\.30|9:30)", tr):
        return "day_centre"
    if re.match(r"^(3\.30|4|8\.|9|10)", tr):
        return "pool"
    return "other"


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
        date_rows = []
        for d in dates_sorted:
            cells = []
            for g in venue_groups:
                venue = g["venue"]
                vals = by_date_venue[d].get(venue, [])
                for i in range(g["span"]):
                    entry = vals[i] if i < len(vals) else {}
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
