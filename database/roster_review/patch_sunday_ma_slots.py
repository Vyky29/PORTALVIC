# -*- coding: utf-8 -*-
"""Sunday MA: last block 1.15–2 (not 1–2.45); Jul 5 leader John not Berta; shift times."""
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

JUL5 = "2026-07-05"


def clean(s) -> str:
    return str(s or "").strip()


def fix_sunday_last_slots(seed: dict) -> int:
    n = 0
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            for d in st.get("days", []):
                if clean(d.get("weekday")) != "Sunday":
                    continue
                for s in d.get("slots") or []:
                    ts = clean(s.get("time_slot"))
                    if ts in ("1 to 2.45", "1-2.45"):
                        s["time_slot"] = "1.15 to 2"
                        n += 1
    return n


def swap_berta_jul5_to_john(seed: dict) -> bool:
    """Week block containing 2026-07-05: Berta Sunday → John."""
    for w in seed.get("weeks", []):
        berta = john = None
        for st in w.get("staff", []):
            if st.get("staffKey") == "berta":
                berta = st
            elif st.get("staffKey") == "john":
                john = st
        if not berta or not john:
            continue
        berta_day = None
        berta_idx = None
        for i, d in enumerate(berta.get("days") or []):
            if clean(d.get("sessionDate")) == JUL5 and clean(d.get("weekday")) == "Sunday":
                berta_day = d
                berta_idx = i
                break
        if not berta_day:
            continue
        slots = []
        for s in berta_day.get("slots") or []:
            slot = deepcopy(s)
            slot["instructors"] = "JOHN"
            ts = clean(slot.get("time_slot"))
            if ts in ("1 to 2.45", "1-2.45"):
                slot["time_slot"] = "1.15 to 2"
            slots.append(slot)
        john_days = john.setdefault("days", [])
        john_days = [d for d in john_days if clean(d.get("sessionDate")) != JUL5]
        john_days.append(
            {
                "sessionDate": JUL5,
                "weekday": "Sunday",
                "slots": slots,
            }
        )
        john_days.sort(key=lambda d: clean(d.get("sessionDate")))
        john["days"] = john_days
        berta["days"] = [d for j, d in enumerate(berta.get("days") or []) if j != berta_idx]
        return True
    return False


def patch_staff_shifts_madre(seed: dict) -> int:
    n = 0
    for row in seed.get("staffShifts", {}).get("rows") or []:
        if clean(row.get("day")) != "Sunday":
            continue
        key = clean(row.get("staff_key")).lower()
        if key == "roberto" and clean(row.get("time_range")) in ("9-3", "9.00-3"):
            row["time_range"] = "8.45-3.15"
            row["raw_assignment"] = "Roberto 8.45-3.15"
            n += 1
        elif key == "john" and clean(row.get("time_range")) in ("9.15-2.15", "9-2.15"):
            row["time_range"] = "9-2.30"
            row["raw_assignment"] = "John 9-2.30"
            n += 1
        elif key == "berta" and clean(row.get("session_date")) == JUL5:
            row["staff_key"] = "john"
            row["staff_name"] = "John"
            row["time_range"] = "9-2.30"
            row["raw_assignment"] = "John 9-2.30"
            n += 1
    return n


def patch_staff_shifts_csv() -> int:
    if not STAFF_CSV.exists():
        return 0
    lines = STAFF_CSV.read_text(encoding="utf-8-sig").splitlines()
    out = [lines[0]] if lines else []
    n = 0
    for line in lines[1:]:
        if not line.strip():
            continue
        parts = line.split(",")
        if len(parts) < 6:
            out.append(line)
            continue
        date, weekday, staff, venue, tr, raw = parts[0], parts[1], parts[2], parts[3], parts[4], ",".join(parts[5:])
        if weekday != "Sunday":
            out.append(line)
            continue
        sl = staff.lower()
        if sl == "roberto" and tr == "9-3":
            tr, raw = "8.45-3.15", "Roberto 8.45-3.15"
            n += 1
        elif sl == "john" and tr == "9.15-2.15":
            tr, raw = "9-2.30", "John 9-2.30"
            n += 1
        elif sl == "berta" and date == JUL5:
            staff, tr, raw = "John", "9-2.30", "John 9-2.30"
            n += 1
        out.append(f"{date},{weekday},{staff},{venue},{tr},{raw}")
    text = "\n".join(out) + "\n"
    STAFF_CSV.write_text(text, encoding="utf-8")
    portal = ROOT / "working_ui" / "portal" / "roster_review" / "staff-shifts.csv"
    if portal.parent.exists():
        portal.write_text(text, encoding="utf-8")
    return n


def main() -> None:
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    n245 = fix_sunday_last_slots(seed)
    swapped = swap_berta_jul5_to_john(seed)
    nsh = patch_staff_shifts_madre(seed)
    ncsv = patch_staff_shifts_csv()
    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Fixed {n245} Sunday 2.45 slots; Jul5 John swap={swapped}; staffShifts {nsh}; CSV {ncsv}")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
