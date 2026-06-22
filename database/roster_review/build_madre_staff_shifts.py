# -*- coding: utf-8 -*-
"""
Embed Summer Term 2 staff pool shifts (2026-06-01 .. 2026-07-17) into MADRE staffShifts section.

  python database/roster_review/build_madre_staff_shifts.py

Source: database/staff_timetable_machine.json
Target: working_ui/portal/roster_term_master.json (+ seed copy)
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TIMETABLE = ROOT / "database" / "staff_timetable_machine.json"
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SEED = ROOT / "working_ui" / "portal" / "roster_term_master_seed.json"
TERM_FROM = "2026-06-01"
TERM_TO = "2026-07-17"


def norm_staff_key(name: str) -> str:
    return (name or "").strip().lower().replace(" ", "_")


def load_term_shifts() -> list[dict]:
    rows = json.loads(TIMETABLE.read_text(encoding="utf-8"))
    out: list[dict] = []
    for r in rows:
        iso = str(r.get("date") or "")[:10]
        if not iso or iso < TERM_FROM or iso > TERM_TO:
            continue
        out.append(
            {
                "session_date": iso,
                "day": str(r.get("day") or "").strip(),
                "staff_key": norm_staff_key(str(r.get("staff_name") or "")),
                "staff_name": str(r.get("staff_name") or "").strip(),
                "venue": str(r.get("venue") or "").strip(),
                "time_range": str(r.get("time_range") or "").strip(),
                "raw_assignment": str(r.get("raw_assignment") or "").strip(),
            }
        )
    out.sort(key=lambda x: (x["session_date"], x["staff_key"], x["venue"], x["time_range"]))
    return out


def patch_madre(path: Path, shifts: list[dict]) -> None:
    if not path.is_file():
        print("skip (missing):", path)
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    meta = data.setdefault("meta", {})
    meta["schemaVersion"] = 2
    meta["termFrom"] = meta.get("termFrom") or TERM_FROM
    meta["termTo"] = meta.get("termTo") or TERM_TO
    meta["staffShiftsSource"] = "staff_timetable_machine.json"
    meta["staffShiftsNote"] = (
        "Turnos pool/day centre por fecha. Editar en pestaña Staff del editor MADRE "
        "o plegar overrides desde portal_madre_fold_queue."
    )
    data["staffShifts"] = {
        "termFrom": TERM_FROM,
        "termTo": TERM_TO,
        "rows": shifts,
    }
    path.write_text(json.dumps(data, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    print("patched", path, "staffShifts.rows =", len(shifts))


def main() -> None:
    shifts = load_term_shifts()
    if not shifts:
        raise SystemExit(f"No staff shifts in {TERM_FROM}..{TERM_TO} in {TIMETABLE}")
    patch_madre(MADRE, shifts)
    patch_madre(SEED, shifts)
    print("Done. Regenerate boot: python database/roster_review/build_roster_term_master_seed_boot.py")


if __name__ == "__main__":
    main()
