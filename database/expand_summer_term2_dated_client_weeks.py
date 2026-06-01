# -*- coding: utf-8 -*-
"""
Expand Summer Term 2 client template (apply_term_roster_jun_jul_2026) into dated rows
for every calendar day 2026-06-01 .. 2026-07-17, with staff-rota overrides (Berta/Raul,
Aurora/Dan). Writes week CSVs under database/roster_weeks/ and merges into
staff_clients_machine.json.

Run after:
  python database/apply_term_roster_jun_jul_2026.py
  python database/apply_staff_timetable_summer_term2_jun_jul_2026.py

Then:
  python database/expand_summer_term2_dated_client_weeks.py
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "database"
ROSTER_WEEKS = OUT / "roster_weeks"
JSON_PATH = OUT / "staff_clients_machine.json"
TERM2_START = date(2026, 6, 1)
TERM2_END = date(2026, 7, 17)

# Instructor swaps on specific dates (staff pool rota deltas).
_INSTRUCTOR_SWAPS: dict[str, list[tuple[str, str]]] = {
    "2026-06-24": [("BERTA", "RAUL")],
    "2026-06-04": [("AURORA", "DAN")],
    "2026-06-25": [("AURORA", "DAN")],
}


def _load_template_builder():
    sys.path.insert(0, str(OUT))
    from apply_term_roster_jun_jul_2026 import build_template  # noqa: E402

    return build_template


def _weekday_long(d: date) -> str:
    return d.strftime("%A")


def _apply_instructor_swaps(instructors: str, iso: str) -> str:
    swaps = _INSTRUCTOR_SWAPS.get(iso)
    if not swaps or not instructors:
        return instructors
    out = instructors
    for old, new in swaps:
        out = out.replace(old, new)
    return out


def _template_by_weekday(template: list[dict]) -> dict[str, list[dict]]:
    by_day: dict[str, list[dict]] = {}
    for row in template:
        day = str(row.get("day") or "").strip()
        if day:
            by_day.setdefault(day, []).append(row)
    return by_day


def _load_template_from_machine() -> list[dict]:
    if not JSON_PATH.exists():
        return _load_template_builder()()
    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    template = [r for r in rows if not r.get("session_date")]
    return template if template else _load_template_builder()()


def expand_dated_rows() -> list[dict]:
    template = _load_template_from_machine()
    by_day = _template_by_weekday(template)
    rows: list[dict] = []
    cur = TERM2_START
    while cur <= TERM2_END:
        iso = cur.isoformat()
        day = _weekday_long(cur)
        for base in by_day.get(day, []):
            inst = _apply_instructor_swaps(str(base.get("instructors") or ""), iso)
            rows.append(
                {
                    "client_name": base["client_name"],
                    "day": day,
                    "instructors": inst,
                    "service": base.get("service", ""),
                    "area": base.get("area", ""),
                    "time_slot": base.get("time_slot", ""),
                    "venue": base.get("venue", ""),
                    "session_date": iso,
                }
            )
        cur += timedelta(days=1)
    return rows


def _monday_of_week(d: date) -> date:
    return d - timedelta(days=(d.weekday()))


def write_week_csvs(dated_rows: list[dict]) -> list[Path]:
    ROSTER_WEEKS.mkdir(parents=True, exist_ok=True)
    by_week: dict[tuple[date, date], list[dict]] = {}
    for r in dated_rows:
        iso = str(r.get("session_date") or "")[:10]
        if not iso:
            continue
        d = date.fromisoformat(iso)
        mon = _monday_of_week(d)
        sun = mon + timedelta(days=6)
        by_week.setdefault((mon, sun), []).append(r)

    paths: list[Path] = []
    fieldnames = [
        "date",
        "weekday",
        "client",
        "service",
        "time_slot",
        "instructor",
        "venue",
        "notes",
    ]
    for (mon, sun), week_rows in sorted(by_week.items()):
        path = ROSTER_WEEKS / (
            f"summer-term-2-week-{mon.isoformat()}_{sun.isoformat()}.csv"
        )
        week_rows.sort(
            key=lambda r: (
                r.get("session_date", ""),
                r.get("time_slot", ""),
                r.get("client_name", ""),
            )
        )
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for r in week_rows:
                w.writerow(
                    {
                        "date": r["session_date"],
                        "weekday": r["day"],
                        "client": r["client_name"],
                        "service": r.get("service", ""),
                        "time_slot": r.get("time_slot", ""),
                        "instructor": r.get("instructors", ""),
                        "venue": r.get("venue", ""),
                        "notes": r.get("area", ""),
                    }
                )
        paths.append(path)
    return paths


def merge_into_machine(dated_rows: list[dict]) -> int:
    sys.path.insert(0, str(OUT))
    from import_roster_week_csv import merge_dated_week_rows_into_machine  # noqa: E402

    existing: list[dict] = []
    if JSON_PATH.exists():
        existing = json.loads(JSON_PATH.read_text(encoding="utf-8"))

    # Drop prior Summer Term 2 dated rows (re-run safe).
    kept = [
        r
        for r in existing
        if not (
            r.get("session_date")
            and TERM2_START.isoformat()
            <= str(r["session_date"])[:10]
            <= TERM2_END.isoformat()
        )
    ]
    merged = merge_dated_week_rows_into_machine(kept, dated_rows)
    JSON_PATH.write_text(
        json.dumps(merged, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return len(dated_rows)


def patch_portal_bundle() -> None:
    sys.path.insert(0, str(OUT.parent))
    from build_machine_exports import (  # noqa: E402
        copy_spreadsheet_js_to_working_ui,
        copy_term_to_working_ui,
        patch_bundle_rows_from_json,
        write_term_from_timetable_js,
    )

    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    tt_path = OUT / "staff_timetable_machine.json"
    tt = (
        json.loads(tt_path.read_text(encoding="utf-8"))
        if tt_path.exists()
        else []
    )
    write_term_from_timetable_js(tt, rows)
    patch_bundle_rows_from_json()
    copy_term_to_working_ui()
    copy_spreadsheet_js_to_working_ui()


def main() -> None:
    dated = expand_dated_rows()
    paths = write_week_csvs(dated)
    n = merge_into_machine(dated)
    patch_portal_bundle()
    print(
        f"Summer Term 2 clients: {n} dated rows ({TERM2_START}..{TERM2_END}), "
        f"{len(paths)} week CSVs"
    )
    for p in paths:
        print(f"  {p.name}")


if __name__ == "__main__":
    main()
