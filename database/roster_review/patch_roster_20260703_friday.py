# -*- coding: utf-8 -*-
"""One-off: Friday 2026-07-03 roster + staff shifts (Victor/Timi, Youssef blocks, Raul HOME)."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATE = "2026-07-03"
DAY = "Friday"

BUNDLE_PATHS = [
    ROOT / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal-shared-js" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "database" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "staff_dashboard_spreadsheet_bundle.js",
]

PART_CSV = ROOT / "database" / "roster_review" / "participants-by-day-area-notes.csv"
STAFF_CSV = ROOT / "database" / "roster_review" / "staff-shifts.csv"

# Rows to insert (one row per instructor when co-teaching uses separate bundle rows)
NEW_ROWS = [
    {
        "client_name": "MANAGER",
        "day": DAY,
        "instructors": "VICTOR",
        "service": "Day Centre",
        "area": "Hub · Manager",
        "time_slot": "11 to 3",
        "venue": "SwimFarm",
        "session_date": DATE,
    },
    {
        "client_name": "Timi",
        "day": DAY,
        "instructors": "VICTOR",
        "service": "Day Centre",
        "area": "Hub Room",
        "time_slot": "11 to 1",
        "venue": "SwimFarm",
        "session_date": DATE,
    },
    {
        "client_name": "Ikram",
        "day": DAY,
        "instructors": "YOUSSEF",
        "service": "Day Centre",
        "area": "Hub Room",
        "time_slot": "11 to 12",
        "venue": "SwimFarm",
        "session_date": DATE,
    },
    {
        "client_name": "Emanuel",
        "day": DAY,
        "instructors": "YOUSSEF",
        "service": "Aquatic Activity",
        "area": "Teaching Pool",
        "time_slot": "12 to 1",
        "venue": "SwimFarm",
        "session_date": DATE,
    },
    {
        "client_name": "Emanuel",
        "day": DAY,
        "instructors": "VICTOR",
        "service": "Day Centre",
        "area": "Hub Room",
        "time_slot": "1 to 3",
        "venue": "SwimFarm",
        "session_date": DATE,
    },
    {
        "client_name": "Emanuel",
        "day": DAY,
        "instructors": "YOUSSEF",
        "service": "Day Centre",
        "area": "Hub Room",
        "time_slot": "3 to 4",
        "venue": "SwimFarm",
        "session_date": DATE,
    },
    {
        "client_name": "Fadi",
        "day": DAY,
        "instructors": "YOUSSEF",
        "service": "Day Centre",
        "area": "Hub Room",
        "time_slot": "1 to 3",
        "venue": "SwimFarm",
        "session_date": DATE,
    },
    {
        "client_name": "HOME",
        "day": DAY,
        "instructors": "RAUL",
        "service": "Day Centre",
        "area": "HOME",
        "time_slot": "11 to 4",
        "venue": "SwimFarm",
        "session_date": DATE,
    },
    {
        "client_name": "Elijah",
        "day": DAY,
        "instructors": "ROBERTO",
        "service": "Aquatic Activity",
        "area": "Teaching Pool",
        "time_slot": "4 to 4.30",
        "venue": "Acton",
        "session_date": DATE,
    },
    {
        "client_name": "Ikram",
        "day": DAY,
        "instructors": "LULIYA",
        "service": "Day Centre",
        "area": "Hub Room",
        "time_slot": "11 to 4",
        "venue": "SwimFarm",
        "session_date": DATE,
    },
]

REMOVE_KEYS = {
    (DATE, "emanuel", "michelle", "11 to 4"),
    (DATE, "ikram", "youssef", "11 to 4"),
    (DATE, "fadi", "raul", "12.30 to 3"),
    (DATE, "fadi", "roberto", "12.30 to 3"),
    (DATE, "home", "victor", "11 to 4"),
}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip()).lower()


def row_key(r: dict) -> tuple:
    return (
        str(r.get("session_date") or "")[:10],
        norm(r.get("client_name")),
        norm(r.get("instructors")),
        norm(r.get("time_slot")),
    )


def parse_bundle(path: Path) -> tuple[str, str, str, dict]:
    text = path.read_text(encoding="utf-8")
    m = re.search(
        r"(window\.STAFF_DASHBOARD_SOURCE\s*=\s*)(\{[\s\S]*\})(\s*;\s*\n\}\)\(\);?\s*$)",
        text,
    )
    if not m:
        raise SystemExit(f"Could not parse bundle: {path}")
    return m.group(1), m.group(2), m.group(3), json.loads(m.group(2))


def patch_bundle(path: Path) -> tuple[int, int]:
    prefix, _body, suffix, data = parse_bundle(path)
    rows = data.get("rows") or []
    kept = []
    removed = 0
    for r in rows:
        if str(r.get("session_date") or "")[:10] != DATE:
            kept.append(r)
            continue
        k = row_key(r)
        if k in REMOVE_KEYS:
            removed += 1
            continue
        # drop other dated rows for clients we're fully replacing
        cn = norm(r.get("client_name"))
        if cn in ("emanuel", "ikram", "fadi", "home", "timi") and k not in {
            row_key(x) for x in NEW_ROWS
        }:
            removed += 1
            continue
        kept.append(r)
    existing = {row_key(r) for r in kept}
    added = 0
    for nr in NEW_ROWS:
        if row_key(nr) not in existing:
            kept.append(nr)
            added += 1
            existing.add(row_key(nr))
    kept.sort(
        key=lambda r: (
            str(r.get("session_date") or ""),
            str(r.get("day") or ""),
            norm(r.get("client_name")),
            norm(r.get("time_slot")),
        )
    )
    data["rows"] = kept
    path.write_text(prefix + json.dumps(data, indent=2, ensure_ascii=False) + suffix, encoding="utf-8")
    return removed, added


def patch_csv_participants() -> None:
    lines = PART_CSV.read_text(encoding="utf-8-sig").splitlines()
    if not lines:
        return
    header = lines[0]
    out = [header]
    skip_dates = {
        (DATE, "emanuel"),
        (DATE, "ikram"),
        (DATE, "timi"),
        (DATE, "fadi"),
    }
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) < 8:
            out.append(line)
            continue
        d = parts[0].strip()
        client = parts[2].strip().lower()
        if d == DATE and client in ("emanuel", "ikram", "timi", "fadi"):
            continue
        out.append(line)
    csv_rows = [
        f"{DATE},{DAY},Timi,Day Centre,11 to 1,VICTOR,SwimFarm,Hub Room",
        f"{DATE},{DAY},Ikram,Day Centre,11 to 12,YOUSSEF,SwimFarm,Hub Room",
        f"{DATE},{DAY},Ikram,Day Centre,11 to 4,LULIA,SwimFarm,Hub Room",
        f"{DATE},{DAY},Emanuel,Aquatic Activity,12 to 1,YOUSSEF,SwimFarm,Teaching Pool",
        f"{DATE},{DAY},Emanuel,Day Centre,1 to 3,VICTOR,SwimFarm,Hub Room",
        f"{DATE},{DAY},Emanuel,Day Centre,3 to 4,YOUSSEF,SwimFarm,Hub Room",
        f"{DATE},{DAY},Fadi,Day Centre,1 to 3,YOUSSEF,SwimFarm,Hub Room",
        f"{DATE},{DAY},Elijah,Aquatic Activity,4 to 4.30,ROBERTO,Acton,Teaching Pool",
    ]
    out.extend(csv_rows)
    PART_CSV.write_text("\n".join(out) + "\n", encoding="utf-8")
    portal_csv = ROOT / "working_ui" / "portal" / "roster_review" / "participants-by-day-area-notes.csv"
    portal_shifts = ROOT / "working_ui" / "portal" / "roster_review" / "participants-shifts.csv"
    if portal_csv.parent.exists():
        portal_csv.write_text(PART_CSV.read_text(encoding="utf-8"), encoding="utf-8")
    if portal_shifts.parent.exists():
        portal_shifts.write_text(PART_CSV.read_text(encoding="utf-8"), encoding="utf-8")


def patch_staff_shifts() -> None:
    lines = STAFF_CSV.read_text(encoding="utf-8-sig").splitlines()
    out = [lines[0]] if lines else ["date,weekday,staff,venue,time_range,raw_assignment"]
    replacements = {
        "raul": f"{DATE},{DAY},Raul,HOME,11-4,Raul HOME 11-4",
        "victor": f"{DATE},{DAY},Victor,SwimFarm,11-3,Victor 11-1 Timi; 1-3 Emanuel",
        "youssef": f"{DATE},{DAY},Youssef,SwimFarm,11-4,Youssef 11-12 Ikram; 12-1 Emanuel; 1-3 Fadi; 3-4 Emanuel",
    }
    seen = set()
    for line in lines[1:]:
        if not line.strip() or not line.startswith(DATE):
            out.append(line)
            continue
        staff = line.split(",")[2].strip().lower() if len(line.split(",")) > 2 else ""
        if staff in replacements:
            if staff not in seen:
                out.append(replacements[staff])
                seen.add(staff)
            continue
        if staff == "michelle":
            continue
        out.append(line)
    for staff, row in replacements.items():
        if staff not in seen:
            out.append(row)
    text = "\n".join(out) + "\n"
    STAFF_CSV.write_text(text, encoding="utf-8")
    portal_staff = ROOT / "working_ui" / "portal" / "roster_review" / "staff-shifts.csv"
    if portal_staff.parent.exists():
        portal_staff.write_text(text, encoding="utf-8")


def main() -> None:
    for path in BUNDLE_PATHS:
        if not path.exists():
            print(f"skip {path}")
            continue
        removed, added = patch_bundle(path)
        print(f"{path.relative_to(ROOT)}: removed {removed}, added {added}")
    patch_csv_participants()
    patch_staff_shifts()
    print("CSV + staff-shifts updated.")


if __name__ == "__main__":
    main()
