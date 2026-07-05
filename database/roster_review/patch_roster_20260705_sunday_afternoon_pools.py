#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix Sunday afternoon (2-3) aquatic pool labels for swimming instructors.

The 2-2.30 / 2.30-3 / 2.30-3.30 Sunday aquatic slots had drifted to
"Teaching Pool" (and some lowercase "Big pool"). Per ops, each afternoon swim
client belongs to Big Pool or Small Pool. Scope is strict: weekday Sunday +
service "Aquatic Activity" + afternoon 2/2.30 start, so morning climbing slots
for the same children (e.g. Rodin, Zakariya) are untouched.

Client -> pool (confirmed):
  Rodin  -> Big Pool
  Yoan   -> Small Pool
  Max    -> Small Pool
  Shaan  -> Small Pool
  Zakariya (afternoon aquatic) -> Big Pool
  Faris  -> Big Pool

Run (repo root):
  python database/roster_review/patch_roster_20260705_sunday_afternoon_pools.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"

AFTERNOON_TIMES = {"2 to 2.30", "2.30 to 3", "2.30 to 3.30"}
CLIENT_POOL = {
    "Rodin": "Big Pool",
    "Yoan": "Small Pool",
    "Max": "Small Pool",
    "Shaan": "Small Pool",
    "Zakariya": "Big Pool",
    "Faris": "Big Pool",
}


def main() -> None:
    doc = json.loads(MADRE.read_text(encoding="utf-8"))
    changed = 0
    for wk in doc.get("weeks", []):
        for st in wk.get("staff", []):
            for d in st.get("days", []):
                if str(d.get("weekday", "")).strip().lower() != "sunday":
                    continue
                for s in d.get("slots", []):
                    if str(s.get("service", "")).strip().lower() != "aquatic activity":
                        continue
                    if str(s.get("time_slot", "")).strip() not in AFTERNOON_TIMES:
                        continue
                    client = str(s.get("client_name", "")).strip()
                    pool = CLIENT_POOL.get(client)
                    if not pool:
                        continue
                    if s.get("area") != pool or s.get("pool_note") != pool:
                        print(
                            f"  {d['sessionDate']} {st['staffKey']:<9} {s.get('time_slot'):<12} "
                            f"{client:<10} {s.get('area')!r}->{pool!r}"
                        )
                        s["area"] = pool
                        s["pool_note"] = pool
                        changed += 1
    MADRE.write_text(
        json.dumps(doc, ensure_ascii=True, indent=2), encoding="utf-8"
    )
    print(f"\nUpdated {changed} afternoon aquatic slots.")


if __name__ == "__main__":
    main()
