# -*- coding: utf-8 -*-
"""Regenerate all roster review CSVs + copy to working_ui for the table editor."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
PY = sys.executable
PORTAL_DIR = ROOT / "working_ui" / "portal" / "roster_review"


def run(script: str) -> None:
    subprocess.run([PY, str(HERE / script)], cwd=str(ROOT), check=True)


def main() -> None:
    run("export_participants_by_day_csv.py")
    run("export_staff_shifts_csv.py")
    PORTAL_DIR.mkdir(parents=True, exist_ok=True)
    copies = [
        (HERE / "participants-by-day-area-notes.csv", PORTAL_DIR / "participants-shifts.csv"),
        (HERE / "staff-shifts.csv", PORTAL_DIR / "staff-shifts.csv"),
        (HERE / "participants-by-day-area-notes.csv", PORTAL_DIR / "participants-by-day-area-notes.csv"),
    ]
    for src, dst in copies:
        if src.exists():
            shutil.copy2(src, dst)
            print(f"Copied → {dst.relative_to(ROOT)}")
    print("\nOpen in browser (after deploy or local server):")
    print("  working_ui/roster_review.html")
    print("  CSV source of truth: database/roster_review/")


if __name__ == "__main__":
    main()
