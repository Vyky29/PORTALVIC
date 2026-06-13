# -*- coding: utf-8 -*-
"""Export staff pool shifts (Staff Timetable) for term review."""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JSON_PATH = ROOT / "database" / "staff_timetable_machine.json"
OUT_DIR = Path(__file__).resolve().parent
OUT_CSV = OUT_DIR / "staff-shifts.csv"

TERM_FROM = "2026-06-01"
TERM_TO = "2026-07-17"

DAY_ORDER = {
    "Monday": 1,
    "Tuesday": 2,
    "Wednesday": 3,
    "Thursday": 4,
    "Friday": 5,
    "Saturday": 6,
    "Sunday": 7,
}


def main() -> None:
    if not JSON_PATH.exists():
        raise SystemExit(f"Missing {JSON_PATH}")
    records = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    rows: list[dict] = []
    for r in records:
        date = str(r.get("date") or "").strip()[:10]
        if not date or date < TERM_FROM or date > TERM_TO:
            continue
        day = str(r.get("day") or "").strip()
        staff = str(r.get("staff_name") or "").strip()
        if not staff:
            continue
        rows.append(
            {
                "date": date,
                "weekday": day,
                "staff_name": staff,
                "time_range": str(r.get("time_range") or "").strip(),
                "venue": str(r.get("venue") or "").strip(),
                "raw_assignment": str(r.get("raw_assignment") or "").strip(),
            }
        )
    rows.sort(
        key=lambda x: (
            x["date"],
            DAY_ORDER.get(x["weekday"], 9),
            x["staff_name"].lower(),
            x["venue"].lower(),
        )
    )
    fields = ["date", "weekday", "staff_name", "time_range", "venue", "raw_assignment"]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {OUT_CSV.relative_to(ROOT)} ({len(rows)} rows, {TERM_FROM} .. {TERM_TO})")


if __name__ == "__main__":
    main()
