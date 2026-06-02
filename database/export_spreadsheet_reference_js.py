#!/usr/bin/env python3
"""Export compact JS for admin spreadsheet reference (sessions grid + staff hours)."""
from __future__ import annotations

import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "database"
OUT = ROOT / "working_ui" / "portal" / "spreadsheet_reference_data.js"

VENUE_ORDER = ["Westway", "Northolt", "Acton", "SwimFarm"]
WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]
HOUR_SHEETS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
SESSION_WEEK_CSV = DB / "roster_weeks" / "summer-term-2-week-2026-06-01_2026-06-07.csv"
TERM_BREAK_FROM = "2026-05-23"
TERM_BREAK_TO = "2026-05-31"
TERM_CLOSED = {"2026-05-04"}
HOURS_FROM = "2026-06-01"


def is_pool_hours_row(rec: dict) -> bool:
    """Staff Timetable pool columns only (exclude day-centre 11–4 rows)."""
    tr = norm(rec.get("time_range", "")).replace(":", ".")
    if not tr:
        raw = norm(rec.get("raw_assignment", ""))
        m = re.search(r"(\d[\d\.:]*)\s*-\s*(\d)", raw)
        tr = m.group(1) if m else ""
    if re.match(r"^(4|3\.30|3\.30)", tr):
        return True
    if re.match(r"^(9|10)\b", tr):
        return True
    return False


def hour_cell(text: str, tone: str, date: str, day: str, col_key: str) -> dict:
    return {
        "text": text,
        "tone": tone,
        "editKey": f"{date}|{day}|{col_key}",
    }


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def time_sort_key(slot: str) -> tuple:
    s = norm(slot).lower().replace(".", ":")
    m = re.match(r"(\d{1,2})(?::(\d{2}))?", s)
    if not m:
        return (99, 99, slot)
    h = int(m.group(1))
    mi = int(m.group(2) or 0)
    if h < 8:
        h += 12
    return (h, mi, slot)


def cell_kind(client: str) -> str:
    u = norm(client).upper()
    if u == "CLOSED":
        return "closed"
    if u in ("NO CLIENT", "N/A", "NA", "-", ""):
        return "available"
    return "client"


def load_session_week() -> list[dict]:
    if not SESSION_WEEK_CSV.exists():
        raise SystemExit(f"Missing {SESSION_WEEK_CSV}")
    rows = []
    with SESSION_WEEK_CSV.open(encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            rows.append(
                {
                    "weekday": norm(r.get("weekday", "")),
                    "client": norm(r.get("client", "")),
                    "service": norm(r.get("service", "")),
                    "time_slot": norm(r.get("time_slot", "")),
                    "instructor": norm(r.get("instructor", "")),
                    "venue": norm(r.get("venue", "")),
                    "notes": norm(r.get("notes", "")),
                }
            )
    return rows


def build_session_grids(rows: list[dict]) -> dict:
    by_day: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["weekday"]:
            by_day[r["weekday"]].append(r)

    grids = {}
    for day in WEEKDAYS:
        day_rows = by_day.get(day, [])
        if not day_rows:
            grids[day] = {"columns": [], "rows": []}
            continue

        col_keys: list[str] = []
        col_meta: dict[str, dict] = {}

        def col_key(r: dict) -> str:
            return "|".join([r["instructor"].upper(), r["venue"], r["service"]])

        for r in day_rows:
            k = col_key(r)
            if k not in col_meta:
                col_meta[k] = {
                    "id": k,
                    "instructors": r["instructor"],
                    "venue": r["venue"],
                    "service": r["service"],
                    "venueRank": VENUE_ORDER.index(r["venue"])
                    if r["venue"] in VENUE_ORDER
                    else 99,
                }
                col_keys.append(k)

        col_keys.sort(
            key=lambda k: (
                col_meta[k]["venueRank"],
                col_meta[k]["service"].lower(),
                col_meta[k]["instructors"].lower(),
            )
        )

        slots: set[str] = set()
        cells: dict[tuple[str, str], dict] = {}
        for r in day_rows:
            slots.add(r["time_slot"])
            k = col_key(r)
            ck = (r["time_slot"], k)
            cells[ck] = {
                "label": r["client"],
                "kind": cell_kind(r["client"]),
            }

        slot_list = sorted(slots, key=time_sort_key)
        columns = [
            {
                "id": k,
                "title": col_meta[k]["instructors"],
                "subtitle": f"{col_meta[k]['service']} ({col_meta[k]['venue']})",
                "venue": col_meta[k]["venue"],
                "service": col_meta[k]["service"],
            }
            for k in col_keys
        ]
        grid_rows = []
        for slot in slot_list:
            grid_rows.append(
                {
                    "time": slot,
                    "cells": [
                        cells.get((slot, k), {"label": "", "kind": "empty"})
                        for k in col_keys
                    ],
                }
            )
        grids[day] = {"columns": columns, "rows": grid_rows}
    return grids


def venue_header_style(venue: str) -> str:
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


def date_row_status(d: str, today: str = "2026-06-01") -> str:
    if d in TERM_CLOSED or (TERM_BREAK_FROM <= d <= TERM_BREAK_TO):
        return "closed"
    return "completed" if d < today else "confirmed"


def build_saturday_hours_sheet(recs: list[dict]) -> dict:
    term_recs = [
        r
        for r in recs
        if r.get("date")
        and HOURS_FROM <= r["date"] <= "2026-07-17"
        and not (TERM_BREAK_FROM <= r["date"] <= TERM_BREAK_TO)
        and is_pool_hours_row(r)
    ]
    late_dates = sorted({r["date"] for r in term_recs})

    def rows_for(dates: list[str], cols: int) -> list[dict]:
        out = []
        for d in dates:
            day = "Saturday"
            cells = []
            vals = [
                norm(r.get("raw_assignment", ""))
                for r in sorted(
                    [x for x in term_recs if x["date"] == d],
                    key=lambda x: int(x.get("sort_index", 0)),
                )
            ]
            for i in range(cols):
                val = vals[i] if i < len(vals) else ""
                cells.append(hour_cell(val, assignment_tone(val), d, day, f"Acton:{i}"))
            out.append(
                {
                    "date": d,
                    "label": format_date_label(d),
                    "status": date_row_status(d),
                    "cells": cells,
                }
            )
        return out

    if not late_dates:
        return {"blocks": [], "placeholder": True}
    return {
        "blocks": [
            {
                "venueGroups": [
                    {"venue": "Acton", "style": "acton", "span": 1, "labels": ["Acton"]}
                ],
                "dates": rows_for(late_dates, 1),
            }
        ],
        "placeholder": False,
    }


def sunday_cells_for_date(day_recs: list[dict]) -> tuple[list[dict], list[dict]]:
    """MA (9.15-2.15) · Aquatic (9-3 / shadow) · Westway — column order from patch row order."""
    ma: list[str] = []
    aq: list[str] = []
    ww: list[str] = []
    for r in sorted(day_recs, key=lambda x: int(x.get("sort_index", 0))):
        raw = norm(r.get("raw_assignment", "")) or (
            f"{norm(r.get('staff_name', ''))} {norm(r.get('time_range', ''))}".strip()
        )
        if not raw:
            continue
        venue = norm(r.get("venue", ""))
        tr = norm(r.get("time_range", ""))
        if venue == "Westway":
            ww.append(raw)
        elif tr.startswith("9.15") or tr.startswith("9:15"):
            ma.append(raw)
        else:
            aq.append(raw)

    max_aq = 4
    while len(ma) < 3:
        ma.append("")
    while len(aq) < max_aq:
        aq.append("")
    while len(ww) < 2:
        ww.append("")

    cells = []
    d = norm(day_recs[0].get("date", "")) if day_recs else ""
    day = "Sunday"
    for i, val in enumerate(ma[:3]):
        cells.append(hour_cell(val, assignment_tone(val), d, day, f"SwimFarm-ma:{i}"))
    for i, val in enumerate(aq[:max_aq]):
        cells.append(hour_cell(val, assignment_tone(val), d, day, f"SwimFarm-aq:{i}"))
    for i, val in enumerate(ww[:2]):
        cells.append(hour_cell(val, assignment_tone(val), d, day, f"Westway:{i}"))

    venue_groups = [
        {"venue": "SwimFarm", "style": "swimfarm-ma", "span": 3, "labels": ["SwimFarm"] * 3},
        {"venue": "SwimFarm", "style": "swimfarm", "span": max_aq, "labels": ["SwimFarm"] * max_aq},
        {"venue": "Westway", "style": "westway", "span": 2, "labels": ["Westway", "Westway"]},
    ]
    return venue_groups, cells


def build_sunday_hours_sheet(recs: list[dict]) -> dict:
    term_recs = [
        r
        for r in recs
        if r.get("date")
        and HOURS_FROM <= r["date"] <= "2026-07-17"
        and not (TERM_BREAK_FROM <= r["date"] <= TERM_BREAK_TO)
        and is_pool_hours_row(r)
    ]
    dates_sorted = sorted({r["date"] for r in term_recs})
    venue_groups = [
        {"venue": "SwimFarm", "style": "swimfarm-ma", "span": 3, "labels": ["SwimFarm"] * 3},
        {"venue": "SwimFarm", "style": "swimfarm", "span": 4, "labels": ["SwimFarm"] * 4},
        {"venue": "Westway", "style": "westway", "span": 2, "labels": ["Westway", "Westway"]},
    ]
    date_rows = []
    for d in dates_sorted:
        day_recs = [r for r in term_recs if r["date"] == d]
        _, cells = sunday_cells_for_date(day_recs)
        date_rows.append(
            {
                "date": d,
                "label": format_date_label(d),
                "status": date_row_status(d),
                "cells": cells,
            }
        )
    return {
        "venueGroups": venue_groups,
        "dates": date_rows,
        "placeholder": not date_rows,
    }


def build_staff_hours(tt: list[dict]) -> dict:
    by_day: dict[str, list[dict]] = defaultdict(list)
    for r in tt:
        day = norm(r.get("day", ""))
        if day in HOUR_SHEETS:
            by_day[day].append(r)

    sheets = {}
    for day in HOUR_SHEETS:
        recs = by_day.get(day, [])
        if not recs:
            sheets[day] = {"venueGroups": [], "dates": [], "placeholder": True}
            continue
        if day == "Saturday":
            sheets[day] = build_saturday_hours_sheet(recs)
            continue
        if day == "Sunday":
            sheets[day] = build_sunday_hours_sheet(recs)
            continue

        # Column order from earliest dated row in term 2 window
        def date_key(d: str) -> str:
            return d or "9999-99-99"

        term_recs = [
            r
            for r in recs
            if r.get("date")
            and HOURS_FROM <= r["date"] <= "2026-07-17"
            and not (TERM_BREAK_FROM <= r["date"] <= TERM_BREAK_TO)
            and r["date"] not in TERM_CLOSED
            and is_pool_hours_row(r)
        ]

        dates_sorted = sorted(
            {norm(r.get("date", "")) for r in term_recs if norm(r.get("date", ""))},
            key=date_key,
        )

        jun_recs = [r for r in term_recs if r["date"] >= HOURS_FROM]
        venue_slots: dict[str, int] = defaultdict(int)
        by_date_venue: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
        for r in jun_recs:
            d = norm(r.get("date", ""))
            venue = norm(r.get("venue", "")) or "—"
            raw = norm(r.get("raw_assignment", "")) or (
                f"{norm(r.get('staff_name', ''))} {norm(r.get('time_range', ''))}".strip()
            )
            if not d or not raw:
                continue
            by_date_venue[d][venue].append(raw)
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
                    "style": venue_header_style(venue),
                    "span": n,
                    "labels": [venue] * n,
                }
            )

        flat_cols: list[str] = []
        for g in venue_groups:
            flat_cols.extend([g["venue"]] * g["span"])

        date_rows = []
        for d in dates_sorted:
            if d < HOURS_FROM:
                continue
            cells = []
            for g in venue_groups:
                venue = g["venue"]
                vals = by_date_venue[d].get(venue, [])
                for i in range(g["span"]):
                    val = vals[i] if i < len(vals) else ""
                    cells.append(
                        hour_cell(val, assignment_tone(val), d, day, f"{venue}:{i}")
                    )
            status = date_row_status(d)
            date_rows.append(
                {
                    "date": d,
                    "label": format_date_label(d),
                    "status": status,
                    "cells": cells,
                }
            )

        sheets[day] = {
            "venueGroups": venue_groups,
            "dates": date_rows,
            "placeholder": not date_rows,
        }

    return sheets


def assignment_tone(raw: str) -> str:
    t = norm(raw)
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


def format_date_label(iso: str) -> str:
    try:
        y, m, d = iso.split("-")
        from datetime import date

        dt = date(int(y), int(m), int(d))
        return dt.strftime("%d-%b-%Y")
    except Exception:
        return iso


def main() -> None:
    session_rows = load_session_week()
    session_grids = build_session_grids(session_rows)
    tt_path = DB / "staff_timetable_machine.json"
    tt = json.loads(tt_path.read_text(encoding="utf-8"))
    staff_hours = build_staff_hours(tt)

    payload = {
        "meta": {
            "sessionSource": SESSION_WEEK_CSV.name,
            "sessionWeekLabel": "1–7 Jun 2026 (Summer term 2)",
            "hoursFrom": HOURS_FROM,
            "timetableSource": "staff_timetable_machine.json",
            "termBreakFrom": TERM_BREAK_FROM,
            "termBreakTo": TERM_BREAK_TO,
        },
        "sessionGrids": session_grids,
        "staffHours": staff_hours,
    }

    body = (
        "// Auto-generated by database/export_spreadsheet_reference_js.py — do not edit by hand.\n"
        "window.PORTAL_SPREADSHEET_REFERENCE = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    OUT.write_text(body, encoding="utf-8")
    print(f"Wrote {OUT} ({len(body) // 1024} KB)")


if __name__ == "__main__":
    main()
