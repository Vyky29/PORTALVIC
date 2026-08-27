# -*- coding: utf-8 -*-
"""
Export Autumn 26/27 weekly staff pool + participant instructor cross-ref CSVs.

Run:
  python database/roster_exports/export_autumn_2026_staff_crossref.py
"""
from __future__ import annotations

import csv
import importlib.util
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent

AUTUMN_SCRIPT = ROOT / "database" / "apply_staff_timetable_autumn_2026.py"
SUMMER_REF = ROOT / "database" / "roster_exports" / "weekly-template-reference.txt"

DAY_ORDER = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
]

VENUE_LABEL = {
    "SwimFarm": "Hub / Day Centre",
    "Acton": "Acton",
    "Northolt": "Northolt",
    "Westway": "Westway",
}

# Autumn instructor overrides vs summer weekly-template-reference (Roberto off Northolt; Angel/Giuseppe/Bismark gone).
INSTRUCTOR_OVERRIDE: dict[tuple[str, str, str, str], str] = {
    # weekday, venue, time_norm, participant_key -> autumn instructor
    ("Monday", "Northolt", "4.30 to 5", "yunis"): "Dan",
    ("Monday", "Northolt", "4.30 to 5", "trial_new"): "Dan",
    ("Monday", "Northolt", "5 to 6", "amar ra"): "Dan",
    ("Monday", "Northolt", "5 to 5.30", "gemma"): "Dan",
    ("Monday", "Northolt", "5.30 to 6", "zayana"): "Dan",
    ("Monday", "Northolt", "6 to 6.30", "adaam ah"): "Dan",
    ("Monday", "Northolt", "6 to 6.30", "yamik"): "Luliya",
    ("Monday", "SwimFarm", "4.30 to 6", "tinashe"): "TBC (was Bismark/Giuseppe/John)",
}


def load_autumn_templates() -> dict[str, list[tuple[str, str, str]]]:
    import sys

    sys.path.insert(0, str(ROOT / "database"))
    spec = importlib.util.spec_from_file_location("autumn_tt", AUTUMN_SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore
    return {
        "Monday": mod.monday_template(),
        "Tuesday": mod.tuesday_template(),
        "Wednesday": mod.wednesday_template(),
        "Thursday": mod.thursday_template(),
        "Friday": mod.friday_template(),
        "Saturday": mod.saturday_template(),
        "Sunday": mod.sunday_template(),
    }


def norm_time(s: str) -> str:
    t = re.sub(r"\s+", " ", str(s or "").strip().lower())
    t = t.replace(".", ".")
    return t


def staff_at_slot(
    templates: dict[str, list[tuple[str, str, str]]],
    day: str,
    venue: str,
    time_range: str,
) -> list[str]:
    """Staff on pool rota whose shift overlaps this slot (same venue, same day)."""
    venue_map = {"Hub / Day Centre": "SwimFarm", "SwimFarm": "SwimFarm"}
    v = venue_map.get(venue, venue)
    out: list[str] = []
    for staff, tr, ven in templates.get(day, []):
        if ven != v:
            continue
        if tr == time_range or _times_overlap(tr, time_range):
            out.append(staff)
    return sorted(set(out), key=str.lower)


def _times_overlap(a: str, b: str) -> bool:
    """Rough overlap: if identical or one contains the other's start."""
    if a == b:
        return True
    # e.g. staff 4.30-6.30 covers participant 4.30-5
    def start_end(s: str) -> tuple[float, float]:
        parts = re.split(r"[-–]", s.replace(":", "."))
        if len(parts) < 2:
            return (0.0, 24.0)

        def parse_h(x: str) -> float:
            x = x.strip().lower().replace("30", ".5")
            if not x:
                return 0.0
            try:
                return float(x)
            except ValueError:
                m = re.match(r"(\d+)", x)
                return float(m.group(1)) if m else 0.0

        return parse_h(parts[0]), parse_h(parts[1])

    a0, a1 = start_end(a)
    b0, b1 = start_end(b)
    return a0 <= b0 and a1 >= b1


def parse_summer_reference() -> list[dict]:
    rows: list[dict] = []
    if not SUMMER_REF.exists():
        return rows
    text = SUMMER_REF.read_text(encoding="utf-8")
    day = ""
    section = ""
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("="):
            continue
        m = re.match(r"^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s*$", line, re.I)
        if m:
            day = m.group(1).capitalize()
            if day == "Wednesday":
                day = "Wednesday"
            continue
        if line.startswith("---") and line.endswith("---"):
            section = line.strip("- ").strip()
            continue
        if "|" not in line or line.lower().startswith("cliente"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) < 5:
            continue
        client, _note, instructor, time_range, venue = parts[:5]
        rows.append(
            {
                "weekday": day,
                "service": section,
                "participant": client,
                "summer_instructor": instructor,
                "time_range": time_range,
                "venue": venue,
            }
        )
    return rows


def autumn_instructor(row: dict) -> str:
    key = (
        row["weekday"],
        row["venue"],
        norm_time(row["time_range"]),
        row["participant"].strip().lower(),
    )
    if key in INSTRUCTOR_OVERRIDE:
        return INSTRUCTOR_OVERRIDE[key]
    inst = row["summer_instructor"]
    # Roberto no longer on Northolt Mon — route to Dan/Luliya pool.
    if row["weekday"] == "Monday" and row["venue"] == "Northolt" and "ROBERTO" in inst.upper():
        return "Dan (was Roberto)"
    if any(x in inst.upper() for x in ("ANGEL", "GIUSEPPE", "BISMARK")):
        return "TBC / departed"
    return inst


def export_staff_weekly_csv(templates: dict[str, list[tuple[str, str, str]]]) -> Path:
    out_path = OUT / "autumn-2026-staff-pool-weekly.csv"
    fields = [
        "weekday",
        "venue_label",
        "venue_code",
        "time_range",
        "staff_name",
        "co_staff_same_slot",
        "cohort_note",
    ]
    cohort_notes = {
        ("Tuesday", "Roberto", "11-3"): "Day Centre · Ikram",
        ("Tuesday", "Michelle", "11-4"): "Day Centre · Ikram",
        ("Tuesday", "Victor", "12.30-3"): "Day Centre · Fadi",
        ("Tuesday", "Victor", "3.30-5"): "Aquatic · Cyrus (participant)",
        ("Tuesday", "Raul", "12.30-3"): "Day Centre · Fadi",
        ("Tuesday", "Michelle", "3-4"): "Day Centre · Ikram",
        ("Monday", "Dan", "4.30-6.30"): "Northolt aquatic pool",
        ("Monday", "Luliya", "4.30-6.30"): "Northolt aquatic pool",
    }
    rows: list[dict] = []
    for day in DAY_ORDER:
        slots = templates.get(day, [])
        by_slot: dict[tuple[str, str], list[str]] = defaultdict(list)
        for staff, tr, venue in slots:
            by_slot[(venue, tr)].append(staff)
        for (venue, tr), names in sorted(by_slot.items(), key=lambda x: (x[0][0], x[0][1])):
            names_sorted = sorted(names, key=str.lower)
            co = ", ".join(n for n in names_sorted)
            for staff in names_sorted:
                note = ""
                for (d, s, t), msg in cohort_notes.items():
                    if d == day and s == staff and t == tr:
                        note = msg
                rows.append(
                    {
                        "weekday": day,
                        "venue_label": VENUE_LABEL.get(venue, venue),
                        "venue_code": venue,
                        "time_range": tr,
                        "staff_name": staff,
                        "co_staff_same_slot": ", ".join(n for n in names_sorted if n != staff) or "—",
                        "cohort_note": note,
                    }
                )
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return out_path


def export_crossref_csv(
    templates: dict[str, list[tuple[str, str, str]]],
    participants: list[dict],
) -> Path:
    out_path = OUT / "autumn-2026-participant-vs-staff-crossref.csv"
    fields = [
        "weekday",
        "service",
        "participant",
        "time_range",
        "venue",
        "summer_instructor",
        "autumn_instructor_planned",
        "staff_pool_on_duty",
        "booking_match",
        "notes",
    ]
    rows: list[dict] = []
    # Explicit trial row (Reshma / Rayden)
    mon_northolt_staff = staff_at_slot(templates, "Monday", "Northolt", "4.30-6.30")
    rows.append(
        {
            "weekday": "Monday",
            "service": "Aquatic Activity",
            "participant": "Rayden Rana (trial INV-P-0370)",
            "time_range": "4.30 to 5",
            "venue": "Northolt",
            "summer_instructor": "—",
            "autumn_instructor_planned": "Dan",
            "staff_pool_on_duty": ", ".join(mon_northolt_staff),
            "booking_match": "OK" if "Dan" in mon_northolt_staff else "CHECK",
            "notes": "Trial assigned to Dan (Northolt Mon 4.30-5); Luliya also on pool 4.30-6.30",
        }
    )
    for p in participants:
        autumn = autumn_instructor(p)
        pool = staff_at_slot(
            templates,
            p["weekday"],
            p["venue"],
            p["time_range"].replace(" to ", "-").replace(" ", ""),
        )
        if not pool:
            pool = staff_at_slot(templates, p["weekday"], p["venue"], "4.30-6.30")
        pool_str = ", ".join(pool) if pool else "—"
        match = "—"
        notes = ""
        if "TBC" in autumn or "departed" in autumn:
            match = "GAP"
            notes = "Instructor left or bespoke block needs reassignment"
        elif autumn.startswith("Dan") and "Dan" in pool_str:
            match = "OK"
        elif any(name.split()[0] in pool_str for name in autumn.replace(",", " ").split() if name):
            match = "OK"
        elif pool_str == "—":
            match = "NO_POOL"
        else:
            match = "CHECK"
        rows.append(
            {
                **p,
                "summer_instructor": p["summer_instructor"],
                "autumn_instructor_planned": autumn,
                "staff_pool_on_duty": pool_str,
                "booking_match": match,
                "notes": notes,
            }
        )
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    return out_path


def main() -> None:
    templates = load_autumn_templates()
    participants = parse_summer_reference()
    p1 = export_staff_weekly_csv(templates)
    p2 = export_crossref_csv(templates, participants)
    print(f"Wrote {p1.relative_to(ROOT)} ({sum(1 for _ in p1.open()) - 1} rows)")
    print(f"Wrote {p2.relative_to(ROOT)} ({sum(1 for _ in p2.open()) - 1} rows)")


if __name__ == "__main__":
    main()
