# -*- coding: utf-8 -*-
"""Import dated roster week CSV exports into staff_clients_machine.json."""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "database"
ROSTER_WEEKS = OUT / "roster_weeks"
PORTAL_WEEKS = ROOT / "working_ui" / "portal"
MACHINE_JSON = OUT / "staff_clients_machine.json"


def norm_text(v) -> str:
    if v is None:
        return ""
    return str(v).replace("\t", " ").strip()


def row_dedupe_key(r: dict) -> tuple:
    return (
        norm_text(r.get("session_date")),
        norm_text(r.get("client_name")).lower(),
        norm_text(r.get("time_slot")).lower(),
        norm_text(r.get("instructors")).lower(),
        norm_text(r.get("venue")).lower(),
    )


def csv_path_to_machine_rows(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8-sig")
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []
    reader = csv.DictReader(lines)
    out: list[dict] = []
    for raw in reader:
        date_iso = norm_text(raw.get("date") or raw.get("session_date"))
        if not date_iso or len(date_iso) < 10:
            continue
        day = norm_text(raw.get("weekday") or raw.get("day"))
        client = norm_text(raw.get("client") or raw.get("client_name"))
        if not client:
            continue
        instructors = norm_text(raw.get("instructor") or raw.get("instructors"))
        service = norm_text(raw.get("service"))
        time_slot = norm_text(raw.get("time_slot") or raw.get("time"))
        venue = norm_text(raw.get("venue"))
        area = norm_text(raw.get("notes") or raw.get("area") or raw.get("pool"))
        out.append(
            {
                "client_name": client,
                "day": day,
                "instructors": instructors,
                "service": service,
                "area": area,
                "time_slot": time_slot,
                "venue": venue,
                "session_date": date_iso[:10],
            }
        )
    return out


def discover_week_csv_paths() -> list[Path]:
    paths: list[Path] = []
    for base in (ROSTER_WEEKS, PORTAL_WEEKS):
        if not base.is_dir():
            continue
        for pat in ("*.csv", "*-sessions-only*.json.js", "*-sessions-only*.csv"):
            paths.extend(sorted(base.glob(pat)))
    seen: set[str] = set()
    uniq: list[Path] = []
    for p in paths:
        key = str(p.resolve()).lower()
        if key in seen:
            continue
        seen.add(key)
        uniq.append(p)
    return uniq


def merge_dated_week_rows_into_machine(base_rows: list[dict], dated_rows: list[dict]) -> list[dict]:
    """Keep recurring rows; add/replace dated rows for the same session_date keys."""
    dated_by_key: dict[tuple, dict] = {}
    for r in dated_rows:
        sd = norm_text(r.get("session_date"))
        if not sd:
            continue
        dated_by_key[row_dedupe_key(r)] = r

    dated_dates = {norm_text(r.get("session_date")) for r in dated_rows if norm_text(r.get("session_date"))}

    kept: list[dict] = []
    for r in base_rows or []:
        sd = norm_text(r.get("session_date"))
        if sd:
            k = row_dedupe_key(r)
            if k in dated_by_key:
                continue
            if sd in dated_dates:
                continue
        kept.append(r)

    merged = kept + list(dated_by_key.values())
    merged.sort(
        key=lambda r: (
            norm_text(r.get("session_date")) or "9999",
            norm_text(r.get("day")),
            norm_text(r.get("time_slot")),
            norm_text(r.get("client_name")),
        )
    )
    return merged


def import_all_roster_weeks() -> int:
    week_paths = discover_week_csv_paths()
    if not week_paths:
        return 0

    all_dated: list[dict] = []
    for path in week_paths:
        all_dated.extend(csv_path_to_machine_rows(path))

    if not all_dated:
        return 0

    base: list[dict] = []
    if MACHINE_JSON.exists():
        base = json.loads(MACHINE_JSON.read_text(encoding="utf-8"))

    merged = merge_dated_week_rows_into_machine(base, all_dated)
    MACHINE_JSON.write_text(json.dumps(merged, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")

    # mirror csv for inspection
    csv_path = OUT / "staff_clients_machine.csv"
    if merged:
        fields = sorted({k for row in merged for k in row.keys()})
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for row in merged:
                w.writerow(row)

    return len(all_dated)


if __name__ == "__main__":
    n = import_all_roster_weeks()
    print(f"Imported {n} dated roster rows from week CSV files")
