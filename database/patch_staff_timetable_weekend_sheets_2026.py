#!/usr/bin/env python3
"""Patch staff_timetable_machine Sat/Sun rows to match Staff Timetable spreadsheet (Apr–Jul 2026)."""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "database"


def slot(
    date: str,
    day: str,
    staff: str,
    time_range: str,
    venue: str,
    *,
    sort_index: int = 0,
) -> dict:
    raw = f"{staff} {time_range}".strip()
    return {
        "date": date,
        "day": day,
        "venue": venue,
        "staff_name": staff,
        "time_range": time_range,
        "raw_assignment": raw,
        "sort_index": sort_index,
    }


# --- Saturday (Acton) ---
SATURDAY_EARLY = {
    "2026-04-18": [("Roberto", "9:30-11:30"), ("Youssef", "11-12:30")],
    "2026-04-25": [("Roberto", "9:30-11:30"), ("Youssef", "11-12:30")],
    "2026-05-02": [("Roberto", "10:30-11:30"), ("Youssef", "11-12:30")],
    "2026-05-09": [("Roberto", "10:30-11:30"), ("Youssef", "11-12:30")],
    "2026-05-16": [("Roberto", "10:30-11:30"), ("Youssef", "11-12:30")],
}

SATURDAY_LATE = [
    "2026-06-06",
    "2026-06-13",
    "2026-06-20",
    "2026-06-27",
    "2026-07-04",
    "2026-07-11",
]

# Sunday: (staff, time_range, venue) — order = column order in spreadsheet
SUNDAY_SPEC: dict[str, list[tuple[str, str, str]]] = {
    "2026-04-19": [
        ("Berta", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Bismark", "9.15-2.15", "SwimFarm"),
        ("Aurora", "9-3", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Carlos", "10-2", "Westway"),
        ("Alex", "10-2", "Westway"),
    ],
    "2026-04-26": [
        ("Berta", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Bismark", "9.15-2.15", "SwimFarm"),
        ("Aurora", "9-3", "SwimFarm"),
        ("Simon (Sh)", "10-1", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Carlos", "10-2", "Westway"),
        ("Alex", "10-2", "Westway"),
    ],
    "2026-05-03": [
        ("John", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Godsway", "9.15-2.15", "SwimFarm"),
        ("Youssef", "9-3", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Carlos", "10-2", "Westway"),
        ("Bismark", "10-2", "Westway"),
    ],
    "2026-05-10": [
        ("Berta", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Bismark", "9.15-2.15", "SwimFarm"),
        ("Youssef", "9-3", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Carlos", "10-2", "Westway"),
        ("Alex", "10-2", "Westway"),
    ],
    "2026-05-17": [
        ("John", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Godsway", "9.15-2.15", "SwimFarm"),
        ("Aurora", "9-3", "SwimFarm"),
        ("Aida (Sh)", "10-1", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Carlos", "10-2", "Westway"),
        ("Bismark", "10-2", "Westway"),
    ],
    "2026-06-07": [
        ("John", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Bismark", "9.15-2.15", "SwimFarm"),
        ("Dan", "9-3", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Carlos", "10-3", "Westway"),
        ("Alex", "10-3", "Westway"),
    ],
    "2026-06-14": [
        ("John", "9.15-2.15", "SwimFarm"),
        ("Godsway", "9.15-2.15", "SwimFarm"),
        ("Bismark", "9.15-2.15", "SwimFarm"),
        ("Dan", "9-3", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Carlos", "10-3", "Westway"),
        ("Alex", "10-3", "Westway"),
    ],
    "2026-06-21": [
        ("John", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Godsway", "9.15-2.15", "SwimFarm"),
        ("Dan", "9-3", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Bismark", "10-3", "Westway"),
        ("Javi", "10-2", "Westway"),
    ],
    "2026-06-28": [
        ("Berta", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Bismark", "9.15-2.15", "SwimFarm"),
        ("Yusef", "9-3", "SwimFarm"),
        ("Javi", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Carlos", "10-3", "Westway"),
        ("Alex", "10-3", "Westway"),
    ],
    "2026-07-05": [
        ("Berta", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Godsway", "9.15-2.15", "SwimFarm"),
        ("Aurora", "9-3", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Bismark", "10-3", "Westway"),
        ("Alex", "10-3", "Westway"),
    ],
    "2026-07-12": [
        ("Berta", "9.15-2.15", "SwimFarm"),
        ("Giuseppe", "9.15-2.15", "SwimFarm"),
        ("Bismark", "9.15-2.15", "SwimFarm"),
        ("Aurora", "9-3", "SwimFarm"),
        ("Javier", "9-3", "SwimFarm"),
        ("Roberto", "9-3", "SwimFarm"),
        ("Carlos", "10-3", "Westway"),
        ("Alex", "10-3", "Westway"),
    ],
}


def weekend_rows() -> list[dict]:
    rows: list[dict] = []
    for iso, pairs in SATURDAY_EARLY.items():
        for i, (staff, tr) in enumerate(pairs):
            rows.append(slot(iso, "Saturday", staff, tr, "Acton", sort_index=i))
    for iso in SATURDAY_LATE:
        rows.append(slot(iso, "Saturday", "Yusef", "10.30-12.30", "Acton", sort_index=0))
    for iso, triples in SUNDAY_SPEC.items():
        for i, (staff, tr, venue) in enumerate(triples):
            rows.append(slot(iso, "Sunday", staff, tr, venue, sort_index=i))
    return rows


def main() -> None:
    json_path = OUT / "staff_timetable_machine.json"
    records = json.loads(json_path.read_text(encoding="utf-8"))
    patched_dates = set(SATURDAY_EARLY) | set(SATURDAY_LATE) | set(SUNDAY_SPEC)
    kept = [
        r
        for r in records
        if not (
            r.get("day") in ("Saturday", "Sunday")
            and str(r.get("date") or "") in patched_dates
        )
    ]
    merged = kept + weekend_rows()
    def sort_key(r: dict) -> tuple:
        d = r.get("date") or ""
        day = r.get("day") or ""
        if day in ("Saturday", "Sunday"):
            return (d, day, int(r.get("sort_index", 0)))
        return (d, day, r.get("venue") or "", r.get("staff_name") or "")

    merged.sort(key=sort_key)
    json_path.write_text(json.dumps(merged, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    csv_path = OUT / "staff_timetable_machine.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["date", "day", "raw_assignment", "staff_name", "time_range", "venue"],
        )
        w.writeheader()
        for r in merged:
            w.writerow(
                {
                    "date": r["date"],
                    "day": r["day"],
                    "raw_assignment": r["raw_assignment"],
                    "staff_name": r["staff_name"],
                    "time_range": r["time_range"],
                    "venue": r["venue"],
                }
            )
    print(f"Patched {len(patched_dates)} weekend dates ({len(weekend_rows())} rows)")


if __name__ == "__main__":
    main()
