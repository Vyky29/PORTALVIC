#!/usr/bin/env python3
"""Fix roster area/notes: Scott Wed Youssef → Teaching Pool; Sunday SwimFarm 2–3 → Teaching Pool."""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
JSON_PATH = ROOT / "staff_clients_machine.json"
ROSTER_WEEKS = ROOT / "roster_weeks"


def norm(s: str) -> str:
    return str(s or "").strip().lower()


def patch_row(row: dict) -> bool:
    changed = False
    client = norm(row.get("client_name") or row.get("client"))
    day = norm(row.get("day") or row.get("weekday"))
    venue = norm(row.get("venue"))
    slot = norm(row.get("time_slot"))
    instructors = norm(row.get("instructors") or row.get("instructor"))
    area_key = "area" if "area" in row else "notes"
    area = str(row.get(area_key) or "").strip()

    if (
        client == "scott"
        and day == "wednesday"
        and "youssef" in instructors
        and ("5.15" in slot and "6" in slot)
        and area.lower() == "room 2"
    ):
        row[area_key] = "Teaching Pool"
        changed = True

    if (
        day == "sunday"
        and venue in ("swimfarm", "swim farm")
        and area.lower() == "big pool"
        and (
            ("2 to 2.30" in slot or "2 to 2:30" in slot)
            or ("2.30 to 3" in slot or "2:30 to 3" in slot)
        )
    ):
        row[area_key] = "Teaching Pool"
        changed = True

    return changed


def patch_json() -> int:
    rows = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    n = 0
    for row in rows:
        if patch_row(row):
            n += 1
    JSON_PATH.write_text(json.dumps(rows, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    return n


def patch_csv(path: Path) -> int:
    if not path.exists():
        return 0
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    n = 0
    for row in rows:
        mapped = {
            "client_name": row.get("client") or row.get("client_name"),
            "day": row.get("weekday") or row.get("day"),
            "venue": row.get("venue"),
            "time_slot": row.get("time_slot"),
            "instructors": row.get("instructor") or row.get("instructors"),
            "notes": row.get("notes") or row.get("area"),
        }
        if patch_row(mapped):
            key = "notes" if "notes" in row else "area"
            row[key] = mapped["notes"]
            n += 1
    if n:
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(rows)
    return n


def main() -> None:
    jn = patch_json()
    cn = 0
    for csv_path in sorted(ROSTER_WEEKS.glob("*.csv")):
        cn += patch_csv(csv_path)
    print(f"Patched {jn} machine rows, {cn} CSV cells")
    try:
        import build_machine_exports

        build_machine_exports.patch_bundle_rows_from_json()
        deploy_bundle = ROOT.parent / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js"
        src_bundle = OUT / "staff_dashboard_spreadsheet_bundle.js"
        if src_bundle.exists() and deploy_bundle.parent.exists():
            deploy_bundle.write_text(src_bundle.read_text(encoding="utf-8"), encoding="utf-8")
        print("Refreshed staff_dashboard_spreadsheet_bundle.js rows (database + working_ui)")
    except Exception as exc:
        print("bundle refresh:", exc)


if __name__ == "__main__":
    main()
