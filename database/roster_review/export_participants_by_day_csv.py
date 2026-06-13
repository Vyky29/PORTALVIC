# -*- coding: utf-8 -*-
"""Export current portal bundle roster → editable review CSV (area notes)."""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js"
OUT_DIR = Path(__file__).resolve().parent
OUT_CSV = OUT_DIR / "participants-by-day-area-notes.csv"
OUT_SUMMARY = OUT_DIR / "participants-by-day-area-notes-summary.txt"

DAY_ORDER = {
    "Monday": 1,
    "Tuesday": 2,
    "Wednesday": 3,
    "Thursday": 4,
    "Friday": 5,
    "Saturday": 6,
    "Sunday": 7,
}


def load_bundle_rows(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    m = re.search(
        r"window\.STAFF_DASHBOARD_SOURCE\s*=\s*(\{[\s\S]*\})\s*;\s*\n\}\)\(\);?\s*$",
        text,
    )
    if not m:
        raise SystemExit(f"Could not parse bundle: {path}")
    return json.loads(m.group(1)).get("rows") or []


def sort_key(row: dict) -> tuple:
    sd = str(row.get("session_date") or "9999-12-31").strip()[:10]
    day = str(row.get("day") or "").strip()
    return (
        sd,
        DAY_ORDER.get(day, 9),
        day,
        str(row.get("time_slot") or "").strip(),
        str(row.get("client_name") or "").strip().lower(),
        str(row.get("venue") or "").strip().lower(),
    )


def main() -> None:
    rows = load_bundle_rows(BUNDLE)
    exported: list[dict] = []
    for r in rows:
        client = str(r.get("client_name") or "").strip()
        if not client or client.upper() == "CLOSED":
            continue
        exported.append(
            {
                "date": str(r.get("session_date") or "").strip()[:10],
                "weekday": str(r.get("day") or "").strip(),
                "client": client,
                "service": str(r.get("service") or "").strip(),
                "time_slot": str(r.get("time_slot") or "").strip(),
                "instructor": str(r.get("instructors") or "").strip(),
                "venue": str(r.get("venue") or "").strip(),
                "notes": str(r.get("area") or "").strip(),
            }
        )
    exported.sort(key=lambda x: sort_key(
        {
            "session_date": x["date"],
            "day": x["weekday"],
            "time_slot": x["time_slot"],
            "client_name": x["client"],
            "venue": x["venue"],
        }
    ))

    fields = ["date", "weekday", "client", "service", "time_slot", "instructor", "venue", "notes"]
    with OUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(exported)

    dates = sorted({r["date"] for r in exported if r["date"]})
    from collections import Counter

    area_counts = Counter(r["notes"] for r in exported if r["notes"])
    lines = [
        "PORTALVIC — Roster review export (area notes)",
        f"Source: {BUNDLE.relative_to(ROOT)}",
        f"Rows: {len(exported)}",
        f"Date range: {dates[0] if dates else '—'} → {dates[-1] if dates else '—'}",
        "",
        "Edit column 'notes' only (or fix client/time/venue if wrong).",
        "Then run: python database/roster_review/apply_participants_by_day_csv.py",
        "",
        "Area counts:",
    ]
    for k, v in area_counts.most_common():
        lines.append(f"  {k or '(empty)'}: {v}")
    OUT_SUMMARY.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_CSV.relative_to(ROOT)} ({len(exported)} rows)")
    print(f"Wrote {OUT_SUMMARY.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
