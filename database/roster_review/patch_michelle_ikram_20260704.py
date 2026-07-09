# -*- coding: utf-8 -*-
"""Michelle + Luliya Ikram 11–4; Michelle shift 10.45–4.15 (Jul 6/8/10 + staffShifts)."""
from __future__ import annotations

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SYNC = ROOT / "database" / "roster_review" / "sync_roster_madre_to_portal.py"
STAFF_CSV = ROOT / "database" / "roster_review" / "staff-shifts.csv"

DATES = {
    "2026-07-06": "Monday",
    "2026-07-08": "Wednesday",
    "2026-07-10": "Friday",
}


def clean(s) -> str:
    return str(s or "").strip()


def ikram_template(seed: dict) -> dict:
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            if st.get("staffKey") != "michelle":
                continue
            for d in st.get("days", []):
                for s in d.get("slots") or []:
                    if clean(s.get("client_name")).lower() == "ikram" and clean(s.get("time_slot")) == "11 to 4":
                        slot = deepcopy(s)
                        slot["instructors"] = "LULIA, MICHELLE"
                        return slot
    raise SystemExit("Michelle Ikram 11-4 template not found")


def patch_michelle_slots(seed: dict, template: dict) -> int:
    n = 0
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            if st.get("staffKey") != "michelle":
                continue
            for d in st.get("days", []):
                date = clean(d.get("sessionDate"))
                if date not in DATES:
                    continue
                d["slots"] = [deepcopy(template)]
                n += 1
    return n


def patch_staff_shifts_madre(seed: dict) -> int:
    n = 0
    for row in seed.get("staffShifts", {}).get("rows") or []:
        if clean(row.get("staff_key")).lower() != "michelle":
            continue
        if clean(row.get("time_range")) != "11-4":
            continue
        row["time_range"] = "10.45-4.15"
        note = clean(row.get("raw_assignment"))
        row["raw_assignment"] = note.replace("11-4", "10.45-4.15") if note else "Michelle 10.45-4.15"
        n += 1
    return n


def patch_staff_shifts_csv() -> int:
    if not STAFF_CSV.exists():
        return 0
    lines = STAFF_CSV.read_text(encoding="utf-8-sig").splitlines()
    if not lines:
        return 0
    out = [lines[0]]
    n = 0
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) >= 5 and parts[2].strip().lower() == "michelle" and parts[4].strip() == "11-4":
            parts[4] = "10.45-4.15"
            if len(parts) >= 6:
                parts[5] = parts[5].replace("11-4", "10.45-4.15")
            line = ",".join(parts)
            n += 1
        out.append(line)
    STAFF_CSV.write_text("\n".join(out) + "\n", encoding="utf-8")
    portal = ROOT / "working_ui" / "portal" / "roster_review" / "staff-shifts.csv"
    if portal.parent.exists():
        portal.write_text(STAFF_CSV.read_text(encoding="utf-8"), encoding="utf-8")
    return n


def main() -> None:
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    template = ikram_template(seed)
    slot_n = patch_michelle_slots(seed, template)
    shift_n = patch_staff_shifts_madre(seed)
    csv_n = patch_staff_shifts_csv()
    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Patched Michelle Ikram slots on {slot_n} day blocks; staffShifts {shift_n}; CSV {csv_n}")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
