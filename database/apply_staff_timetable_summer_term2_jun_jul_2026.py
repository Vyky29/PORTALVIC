# -*- coding: utf-8 -*-
"""
Apply Summer Term 2 staff pool timetable (2026-06-01 .. 2026-07-17) from the
Jun–Jul 2026 staff rota sheets. Replaces dated rows in that range only.

Run:
  python database/apply_staff_timetable_summer_term2_jun_jul_2026.py
  python database/build_machine_exports.py   # if Staff Timetable xlsx exists; else term JS only via this script
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "database"
TERM2_START = "2026-06-01"
TERM2_END = "2026-07-17"

MONDAYS = [
    "2026-06-01",
    "2026-06-08",
    "2026-06-15",
    "2026-06-22",
    "2026-06-29",
    "2026-07-06",
    "2026-07-13",
]
TUESDAYS = [
    "2026-06-02",
    "2026-06-09",
    "2026-06-16",
    "2026-06-23",
    "2026-06-30",
    "2026-07-07",
    "2026-07-14",
]
WEDNESDAYS = [
    "2026-06-03",
    "2026-06-10",
    "2026-06-17",
    "2026-06-24",
    "2026-07-01",
    "2026-07-08",
    "2026-07-15",
]
THURSDAYS = [
    "2026-06-04",
    "2026-06-11",
    "2026-06-18",
    "2026-06-25",
    "2026-07-02",
    "2026-07-09",
    "2026-07-16",
]
FRIDAYS = [
    "2026-06-05",
    "2026-06-12",
    "2026-06-19",
    "2026-06-26",
    "2026-07-03",
    "2026-07-10",
    "2026-07-17",
]
SATURDAYS = [
    "2026-06-06",
    "2026-06-13",
    "2026-06-20",
    "2026-06-27",
    "2026-07-04",
    "2026-07-11",
]
SUNDAYS = [
    "2026-06-07",
    "2026-06-14",
    "2026-06-21",
    "2026-06-28",
    "2026-07-05",
    "2026-07-12",
]

# Sunday Multi-Activity SwimFarm lead on duty (pool 9.15–2.15 slot).
SUNDAY_LEAD_ON_DUTY: dict[str, str] = {
    "2026-06-07": "John",
    "2026-06-14": "Berta",
    "2026-06-21": "John",
    "2026-06-28": "John",
    "2026-07-05": "Berta",
    "2026-07-12": "Berta",
}

# Michelle off these Wednesday day-centre shifts (Ikram cover = Luliya only).
MICHELLE_OFF_WEDNESDAYS = frozenset({"2026-06-10", "2026-06-17"})
MONDAY_2026_06_29_STAFF_OVERRIDES = (
    ("Carlos", "11-4", "SwimFarm"),
    ("Raul", "11-1", "SwimFarm HOME"),
    ("Raul", "1-4", "SwimFarm Manager"),
)


def slot(date: str, day: str, staff: str, time_range: str, venue: str) -> dict:
    raw = f"{staff} {time_range}".strip()
    return {
        "date": date,
        "day": day,
        "venue": venue,
        "staff_name": staff,
        "time_range": time_range,
        "raw_assignment": raw,
    }


def monday_assignments() -> list[dict]:
    rows: list[dict] = []
    for iso in MONDAYS:
        day_rows = [
            slot(iso, "Monday", "Sandra", "4-6", "Westway"),
            slot(iso, "Monday", "Roberto", "4.30-6.30", "Northolt"),
            slot(iso, "Monday", "Dan", "4.30-6.30", "Northolt"),
            slot(iso, "Monday", "Angel", "4-6.30", "Acton"),
            slot(iso, "Monday", "Youssef", "4.30-6.30", "Acton"),
            slot(iso, "Monday", "John", "4.15-6.15", "SwimFarm"),
            slot(iso, "Monday", "Bismark", "4.15-6.15", "SwimFarm"),
            slot(iso, "Monday", "Giuseppe", "4.15-6.15", "SwimFarm"),
            slot(iso, "Monday", "Luliya", "11-4", "SwimFarm"),
            slot(iso, "Monday", "Michelle", "11-4", "SwimFarm"),
            slot(iso, "Monday", "Roberto", "11-3", "SwimFarm"),
            slot(iso, "Monday", "Youssef", "11-3", "SwimFarm"),
            slot(iso, "Monday", "Raul", "11-4", "SwimFarm"),
            slot(iso, "Monday", "Victor", "11-4", "SwimFarm"),
        ]
        if iso == "2026-06-29":
            day_rows = [
                row
                for row in day_rows
                if row["staff_name"] != "Luliya"
                and not (row["staff_name"] == "Raul" and row["time_range"] == "11-4")
            ]
            day_rows.extend(
                slot(iso, "Monday", staff, time_range, venue)
                for staff, time_range, venue in MONDAY_2026_06_29_STAFF_OVERRIDES
            )
        rows.extend(day_rows)
    return rows


def tuesday_assignments() -> list[dict]:
    rows: list[dict] = []
    for iso in TUESDAYS:
        rows.extend(
            [
                slot(iso, "Tuesday", "Roberto", "4-6.30", "Acton"),
                slot(iso, "Tuesday", "Javier", "4-6.30", "Acton"),
                slot(iso, "Tuesday", "Angel", "4.30-6.30", "Acton"),
                slot(iso, "Tuesday", "Aurora", "4.30-6.30", "Acton"),
                slot(iso, "Tuesday", "Youssef", "4.30-6.30", "Acton"),
                slot(iso, "Tuesday", "Luliya", "11-4", "SwimFarm"),
                slot(iso, "Tuesday", "Michelle", "11-4", "SwimFarm"),
                slot(iso, "Tuesday", "Roberto", "12.30-3", "SwimFarm"),
                slot(iso, "Tuesday", "Victor", "11-4", "SwimFarm"),
            ]
        )
    return rows


def wednesday_assignments() -> list[dict]:
    rows: list[dict] = []
    for iso in WEDNESDAYS:
        acton_ma = "Raul" if iso == "2026-06-24" else "Berta"
        day_rows = [
            slot(iso, "Wednesday", acton_ma, "4.15-6.15", "Acton"),
            slot(iso, "Wednesday", "Giuseppe", "4.15-6.15", "Acton"),
            slot(iso, "Wednesday", "Javier", "4-6.30", "Acton"),
            slot(iso, "Wednesday", "Youssef", "4-6.30", "Acton"),
            slot(iso, "Wednesday", "Roberto", "4.30-6.30", "Northolt"),
            slot(iso, "Wednesday", "Dan", "4.30-6.30", "Northolt"),
            slot(iso, "Wednesday", "John", "4.15-6.15", "SwimFarm"),
            slot(iso, "Wednesday", "Bismark", "4.15-6.15", "SwimFarm"),
            slot(iso, "Wednesday", "Godsway", "4.15-6.15", "SwimFarm"),
            slot(iso, "Wednesday", "Luliya", "11-4", "SwimFarm"),
        ]
        if iso not in MICHELLE_OFF_WEDNESDAYS:
            day_rows.append(slot(iso, "Wednesday", "Michelle", "11-4", "SwimFarm"))
        day_rows.extend(
            [
                slot(iso, "Wednesday", "Roberto", "11-3", "SwimFarm"),
                slot(iso, "Wednesday", "Youssef", "11-3", "SwimFarm"),
                slot(iso, "Wednesday", "Raul", "11-4", "SwimFarm"),
                slot(iso, "Wednesday", "Victor", "11-4", "SwimFarm"),
            ]
        )
        rows.extend(day_rows)
    return rows


def thursday_assignments() -> list[dict]:
    rows: list[dict] = []
    for iso in THURSDAYS:
        third_acton = "Dan" if iso in ("2026-06-04", "2026-06-25") else "Aurora"
        rows.extend(
            [
                slot(iso, "Thursday", "Roberto", "4-6.30", "Acton"),
                slot(iso, "Thursday", "Javier", "4-6.30", "Acton"),
                slot(iso, "Thursday", third_acton, "4-6.30", "Acton"),
                slot(iso, "Thursday", "Simon", "4.30-6.30", "Acton"),
                slot(iso, "Thursday", "Roberto", "12.30-3", "SwimFarm"),
                slot(iso, "Thursday", "Raul", "12.30-3", "SwimFarm"),
            ]
        )
    return rows


def friday_assignments() -> list[dict]:
    rows: list[dict] = []
    for iso in FRIDAYS:
        rows.extend(
            [
                slot(iso, "Friday", "John", "4.15-6.15", "SwimFarm"),
                slot(iso, "Friday", "Bismark", "4.15-6.15", "SwimFarm"),
                slot(iso, "Friday", "Giuseppe", "4.15-6.15", "SwimFarm"),
                slot(iso, "Friday", "Roberto", "4-6.30", "Acton"),
                slot(iso, "Friday", "Luliya", "11-4", "SwimFarm"),
                slot(iso, "Friday", "Michelle", "11-4", "SwimFarm"),
                slot(iso, "Friday", "Roberto", "11-3", "SwimFarm"),
                slot(iso, "Friday", "Youssef", "11-3", "SwimFarm"),
                slot(iso, "Friday", "Raul", "11-4", "SwimFarm"),
                slot(iso, "Friday", "Victor", "11-4", "SwimFarm"),
            ]
        )
    return rows


def saturday_assignments() -> list[dict]:
    return [
        slot(iso, "Saturday", "Youssef", "10.30-12.30", "Acton") for iso in SATURDAYS
    ]


def sunday_assignments() -> list[dict]:
    """Per-date Sunday rota (purple / blue SwimFarm + Westway)."""
    spec: dict[str, list[tuple[str, str, str]]] = {
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
            ("Berta", "9.15-2.15", "SwimFarm"),
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
            ("John", "9.15-2.15", "SwimFarm"),
            ("Giuseppe", "9.15-2.15", "SwimFarm"),
            ("Bismark", "9.15-2.15", "SwimFarm"),
            ("Youssef", "9-3", "SwimFarm"),
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
    rows: list[dict] = []
    for iso, pairs in spec.items():
        for staff, tr, venue in pairs:
            rows.append(slot(iso, "Sunday", staff, tr, venue))
    return rows


def build_summer_term2_rows() -> list[dict]:
    out: list[dict] = []
    for part in (
        monday_assignments,
        tuesday_assignments,
        wednesday_assignments,
        thursday_assignments,
        friday_assignments,
        saturday_assignments,
        sunday_assignments,
    ):
        out.extend(part())
    return out


def in_term2_range(iso: str | None) -> bool:
    return bool(iso and TERM2_START <= iso <= TERM2_END)


def append_rota_alignment_patch(records: list[dict]) -> list[dict]:
    """Dated staff pool rows missing from the sheet but needed for term calendar."""
    patches = [
        slot("2026-05-17", "Sunday", "Roberto", "9-3", "SwimFarm"),
        slot("2026-05-22", "Friday", "Roberto", "4-6.30", "Acton"),
    ]
    seen = {
        (r.get("date"), r.get("staff_name"), r.get("venue"), r.get("time_range"))
        for r in records
    }
    for p in patches:
        k = (p.get("date"), p.get("staff_name"), p.get("venue"), p.get("time_range"))
        if k not in seen:
            records.append(p)
            seen.add(k)
    records.sort(
        key=lambda r: (
            r.get("date") or "",
            r.get("day") or "",
            r.get("staff_name") or "",
        )
    )
    return records


def write_exports(records: list[dict]) -> None:
    json_path = OUT / "staff_timetable_machine.json"
    csv_path = OUT / "staff_timetable_machine.csv"
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=True, indent=2)
        f.write("\n")
    fieldnames = ["date", "day", "raw_assignment", "staff_name", "time_range", "venue"]
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in records:
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


def refresh_term_js(records: list[dict]) -> None:
    sys.path.insert(0, str(OUT.parent))
    from build_machine_exports import (  # noqa: E402
        copy_term_to_working_ui,
        write_term_from_timetable_js,
    )

    roster_path = OUT / "staff_clients_machine.json"
    roster_rows = (
        json.loads(roster_path.read_text(encoding="utf-8"))
        if roster_path.exists()
        else []
    )
    write_term_from_timetable_js(records, roster_rows)
    copy_term_to_working_ui()


# Aurora SwimFarm Sunday clients only when she is on the pool rota (5 & 12 Jul 2026).
AURORA_SUNDAY_SHIFT_DATES = frozenset({"2026-07-05", "2026-07-12"})
SUNDAY_COVER_INSTRUCTOR = "DAN"


def sunday_swimfarm_cover_instructor(records: list[dict], iso: str) -> str:
    """First 9-3 SwimFarm instructor on this Sunday (prefer Dan when listed)."""
    names: list[str] = []
    for r in records:
        if str(r.get("date") or "").strip()[:10] != iso:
            continue
        if str(r.get("day") or "").strip() != "Sunday":
            continue
        if str(r.get("venue") or "").strip() != "SwimFarm":
            continue
        if str(r.get("time_range") or "").strip() != "9-3":
            continue
        nm = str(r.get("staff_name") or "").strip()
        if not nm or nm.lower() == "aurora":
            continue
        names.append(nm)
    if not names:
        return SUNDAY_COVER_INSTRUCTOR
    for pref in ("Dan", "DAN"):
        for nm in names:
            if nm.lower() == pref.lower():
                return nm.upper() if nm.isupper() else nm
    return names[0].upper() if names[0].isupper() else names[0]


def aurora_sunday_shift_dates_from_timetable(records: list[dict]) -> frozenset[str]:
    out: set[str] = set()
    for r in records:
        iso = str(r.get("date") or "").strip()[:10]
        if not in_term2_range(iso):
            continue
        if str(r.get("day") or "").strip() != "Sunday":
            continue
        if str(r.get("staff_name") or "").strip().lower() != "aurora":
            continue
        out.add(iso)
    return frozenset(out) if out else AURORA_SUNDAY_SHIFT_DATES


def patch_aurora_sunday_client_roster(
    shift_dates: frozenset[str], timetable: list[dict]
) -> int:
    """Client roster: Aurora Sunday rows only on her timetable Sundays; else pool cover."""
    json_path = OUT / "staff_clients_machine.json"
    if not json_path.exists():
        return 0
    rows = json.loads(json_path.read_text(encoding="utf-8"))
    n = 0
    for row in rows:
        iso = str(row.get("session_date") or "").strip()[:10]
        if not in_term2_range(iso):
            continue
        if str(row.get("day") or "").strip() != "Sunday":
            continue
        if str(row.get("instructors") or "").strip().upper() != "AURORA":
            continue
        if iso in shift_dates:
            continue
        cover = sunday_swimfarm_cover_instructor(timetable, iso).upper()
        row["instructors"] = cover
        n += 1
    if n:
        json_path.write_text(json.dumps(rows, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    dan_sunday_shifts = {
        str(r.get("date") or "").strip()[:10]
        for r in timetable
        if in_term2_range(str(r.get("date") or ""))
        and str(r.get("day") or "").strip() == "Sunday"
        and str(r.get("staff_name") or "").strip().lower() == "dan"
    }
    n_fix = 0
    for row in rows:
        iso = str(row.get("session_date") or "").strip()[:10]
        if not in_term2_range(iso):
            continue
        if str(row.get("day") or "").strip() != "Sunday":
            continue
        if iso in shift_dates:
            continue
        if str(row.get("instructors") or "").strip().upper() != "DAN":
            continue
        if iso in dan_sunday_shifts:
            continue
        row["instructors"] = sunday_swimfarm_cover_instructor(timetable, iso).upper()
        n_fix += 1
    if n_fix:
        json_path.write_text(json.dumps(rows, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    n += n_fix
    weeks_dir = OUT / "roster_weeks"
    if weeks_dir.is_dir():
        instr_key = "instructors"
        for path in sorted(weeks_dir.glob("*.csv")):
            text = path.read_text(encoding="utf-8-sig")
            if not text.strip():
                continue
            rows_in = list(csv.DictReader(text.splitlines()))
            if not rows_in:
                continue
            fieldnames = list(rows_in[0].keys())
            if "instructor" in fieldnames:
                instr_key = "instructor"
            file_changed = False
            for row in rows_in:
                iso = (row.get("date") or row.get("session_date") or "").strip()[:10]
                if not in_term2_range(iso):
                    continue
                if (row.get("weekday") or row.get("day") or "").strip() != "Sunday":
                    continue
                if (row.get(instr_key) or "").strip().upper() != "AURORA":
                    continue
                if iso in shift_dates:
                    continue
                cover = sunday_swimfarm_cover_instructor(timetable, iso).upper()
                row[instr_key] = cover
                file_changed = True
            if file_changed:
                with path.open("w", newline="", encoding="utf-8") as f:
                    w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
                    w.writeheader()
                    w.writerows(rows_in)
    return n


def patch_roster_week_sunday_ma_leads() -> int:
    """Set Sunday SwimFarm Multi-Activity lead column to the on-duty lead only."""
    weeks_dir = OUT / "roster_weeks"
    if not weeks_dir.is_dir():
        return 0
    changed = 0
    for path in sorted(weeks_dir.glob("*.csv")):
        text = path.read_text(encoding="utf-8-sig")
        if not text.strip():
            continue
        rows_in: list[dict[str, str]] = list(csv.DictReader(text.splitlines()))
        if not rows_in:
            continue
        fieldnames = list(rows_in[0].keys())
        file_changed = False
        for row in rows_in:
            iso = (row.get("date") or row.get("session_date") or "").strip()
            lead = SUNDAY_LEAD_ON_DUTY.get(iso)
            if not lead:
                continue
            day = (row.get("weekday") or row.get("day") or "").strip()
            service = (row.get("service") or "").strip()
            venue = (row.get("venue") or "").strip()
            instr_key = "instructor" if "instructor" in row else "instructors"
            instr = (row.get(instr_key) or "").strip()
            if (
                day == "Sunday"
                and service == "Multi-Activity"
                and venue == "SwimFarm"
                and instr.upper() == "JOHN, BERTA"
            ):
                row[instr_key] = lead.upper()
                file_changed = True
        if not file_changed:
            continue
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows_in)
        changed += 1
    return changed


def patch_bundle_sunday_lead_overrides() -> None:
    sys.path.insert(0, str(OUT.parent))
    from build_machine_exports import (  # noqa: E402
        copy_spreadsheet_js_to_working_ui,
        normalize_bundle_portal_asset_urls,
        patch_bundle_rows_from_json,
    )

    overrides = {
        iso: {
            "leadOnDuty": lead,
            "replaceInstructor": {"JOHN, BERTA": lead.upper()},
        }
        for iso, lead in SUNDAY_LEAD_ON_DUTY.items()
    }
    bundle_path = OUT / "staff_dashboard_spreadsheet_bundle.js"
    if not bundle_path.exists():
        return
    src = bundle_path.read_text(encoding="utf-8")
    payload = json.dumps(overrides, ensure_ascii=True, indent=2)
    key = '"sundayDateOverrides":'
    if key in src:
        i = src.find(key)
        j = src.find("{", i)
        depth = 0
        k = j
        end = -1
        while k < len(src):
            c = src[k]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    end = k + 1
                    break
            k += 1
        if end > j:
            src = src[:j] + payload + src[end:]
    else:
        anchor = '"staffProfiles":'
        i = src.find(anchor)
        if i < 0:
            return
        src = src[:i] + f'"sundayDateOverrides": {payload},\n  ' + src[i:]
    src = normalize_bundle_portal_asset_urls(src)
    bundle_path.write_text(src, encoding="utf-8")
    patch_bundle_rows_from_json()
    copy_spreadsheet_js_to_working_ui()


def main() -> None:
    json_path = OUT / "staff_timetable_machine.json"
    existing: list[dict] = []
    if json_path.exists():
        existing = json.loads(json_path.read_text(encoding="utf-8"))
    kept = [r for r in existing if not in_term2_range(r.get("date"))]
    new_rows = build_summer_term2_rows()
    merged = append_rota_alignment_patch(kept + new_rows)
    write_exports(merged)
    aurora_sundays = aurora_sunday_shift_dates_from_timetable(merged)
    n_aurora = patch_aurora_sunday_client_roster(aurora_sundays, merged)
    n_weeks = patch_roster_week_sunday_ma_leads()
    refresh_term_js(merged)
    try:
        from import_roster_week_csv import import_all_roster_weeks  # noqa: E402

        n_roster = import_all_roster_weeks()
    except Exception as exc:
        n_roster = 0
        print("import_roster_week_csv:", exc)
    patch_bundle_sunday_lead_overrides()
    try:
        from build_machine_exports import patch_bundle_rows_from_json, copy_spreadsheet_js_to_working_ui  # noqa: E402

        patch_bundle_rows_from_json()
        copy_spreadsheet_js_to_working_ui()
        portal_shared = ROOT / "working_ui" / "portal-shared-js" / "staff_dashboard_spreadsheet_bundle.js"
        bundle = OUT / "staff_dashboard_spreadsheet_bundle.js"
        if bundle.exists() and portal_shared.parent.is_dir():
            portal_shared.write_text(bundle.read_text(encoding="utf-8"), encoding="utf-8")
    except Exception as exc:
        print("bundle sync:", exc)
    print(
        f"Summer Term 2 staff timetable: {len(new_rows)} rows "
        f"({TERM2_START}..{TERM2_END}); kept {len(kept)} outside range; total {len(merged)}"
    )
    print(f"Sunday MA lead roster weeks patched: {n_weeks}; Aurora Sunday client rows to Dan cover: {n_aurora}; dated roster rows merged: {n_roster}")


if __name__ == "__main__":
    main()
