# -*- coding: utf-8 -*-
"""
One-shot: staff pool hours + client sessions for Summer Term 2 (2026-06-01 .. 2026-07-17).

  python database/sync_summer_term2_roster.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable


def run(script: str) -> None:
    path = ROOT / "database" / script
    print(f"\n>> {script}")
    subprocess.run([PY, str(path)], cwd=str(ROOT), check=True)


def main() -> None:
    run("apply_term_roster_jun_jul_2026.py")
    run("apply_staff_timetable_summer_term2_jun_jul_2026.py")
    run("expand_summer_term2_dated_client_weeks.py")
    print("\nDone. Deploy working_ui/portal/ to Vercel.")


if __name__ == "__main__":
    main()
