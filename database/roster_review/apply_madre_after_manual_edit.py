#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Run after any manual edit to roster_term_master.json (MADRE).

  python database/roster_review/apply_madre_after_manual_edit.py

Steps:
  1. Validate MADRE JSON exists
  2. Mirror MADRE → roster_term_master_seed.json
  3. sync_roster_madre_to_portal.py (bundle, boot, feedback merges)
  4. Export staff-shifts review CSV from MADRE staffShifts (optional artifact)

Agents: run this whenever working_ui/portal/roster_term_master.json changes.
"""
from __future__ import annotations

import csv
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SEED = ROOT / "working_ui" / "portal" / "roster_term_master_seed.json"
SYNC = ROOT / "database" / "roster_review" / "sync_roster_madre_to_portal.py"
BOOT = ROOT / "database" / "roster_review" / "build_roster_term_master_seed_boot.py"
STAFF_CSV = ROOT / "database" / "roster_review" / "staff-shifts.csv"
PY = sys.executable


def export_staff_shifts_csv(madre: dict) -> int:
    ss = madre.get("staffShifts") or {}
    rows = ss.get("rows") or []
    if not rows:
        return 0
    STAFF_CSV.parent.mkdir(parents=True, exist_ok=True)
    with STAFF_CSV.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["date", "weekday", "staff_name", "venue", "time_range", "raw_assignment"],
        )
        w.writeheader()
        for r in rows:
            w.writerow(
                {
                    "date": r.get("session_date") or "",
                    "weekday": r.get("day") or "",
                    "staff_name": r.get("staff_name") or "",
                    "venue": r.get("venue") or "",
                    "time_range": r.get("time_range") or "",
                    "raw_assignment": r.get("raw_assignment")
                    or f"{r.get('staff_name', '')} {r.get('time_range', '')}".strip(),
                }
            )
    portal_csv = ROOT / "working_ui" / "portal" / "roster_review" / "staff-shifts.csv"
    portal_csv.parent.mkdir(parents=True, exist_ok=True)
    portal_csv.write_text(STAFF_CSV.read_text(encoding="utf-8"), encoding="utf-8")
    return len(rows)


def main() -> None:
    if not MADRE.is_file():
        raise SystemExit(f"MADRE not found: {MADRE}")
    madre = json.loads(MADRE.read_text(encoding="utf-8"))
    meta = madre.setdefault("meta", {})
    meta["schemaVersion"] = meta.get("schemaVersion") or 2
    SEED.write_text(json.dumps(madre, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    print(f"Mirrored MADRE → {SEED.relative_to(ROOT)}")

    subprocess.run([PY, str(SYNC)], cwd=str(ROOT), check=True)

    seed_script = ROOT / "database" / "roster_review" / "seed_portal_madre_document.py"
    if seed_script.is_file() and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        print("Pushing live MADRE to Supabase…")
        subprocess.run([PY, str(seed_script)], cwd=str(ROOT), check=False)
    elif seed_script.is_file():
        print("Skip Supabase seed (set SUPABASE_SERVICE_ROLE_KEY to push live MADRE).")

    n_staff = export_staff_shifts_csv(madre)
    if n_staff:
        print(f"Exported {n_staff} staff shift rows → {STAFF_CSV.relative_to(ROOT)}")

    print("\nMADRE apply complete. Commit + push working_ui/portal/ for Vercel deploy.")


if __name__ == "__main__":
    main()
