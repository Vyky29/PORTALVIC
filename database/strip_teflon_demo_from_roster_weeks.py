#!/usr/bin/env python3
"""Remove TEFLON / Mari Trini demo rows from summer term 2 roster week CSVs."""
from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEEKS = ROOT / "database" / "roster_weeks"


def drop_row(row: dict) -> bool:
    inst = (row.get("instructor") or "").strip().upper()
    client = (row.get("client") or "").strip().lower()
    if inst == "TEFLON":
        return True
    if client in ("mari trini", "vitin"):
        return True
    return False


def main() -> None:
    n = 0
    for path in sorted(WEEKS.glob("summer-term-2-week-*.csv")):
        rows = list(csv.DictReader(path.open(encoding="utf-8", newline="")))
        if not rows:
            continue
        kept = [r for r in rows if not drop_row(r)]
        removed = len(rows) - len(kept)
        if not removed:
            continue
        n += removed
        with path.open("w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=rows[0].keys())
            w.writeheader()
            w.writerows(kept)
        print(path.name, "-", removed)
    print("removed", n, "rows")


if __name__ == "__main__":
    main()
