#!/usr/bin/env python3
"""Print weekly template roster (no session_date) grouped by day and service.

Re-run: python database/print_roster_template_by_day.py
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
rows = json.loads((ROOT / "database" / "staff_clients_machine.json").read_text(encoding="utf-8"))
templates = [r for r in rows if not r.get("session_date")]

by_day: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
for r in templates:
    day = str(r.get("day") or "?").strip()
    svc = str(r.get("service") or "(no service)").strip()
    by_day[day][svc].append(r)

order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
cols = ("Cliente", "nota", "Instructor", "session time", "venue")

for day in order:
    if day not in by_day:
        continue
    print(f"\n{'=' * 72}")
    print(day.upper())
    print("=" * 72)
    for svc in sorted(by_day[day].keys()):
        print(f"\n--- {svc} ---")
        print(" | ".join(cols))
        print("-" * 72)
        items = sorted(
            by_day[day][svc],
            key=lambda x: (str(x.get("time_slot") or ""), str(x.get("client_name") or "")),
        )
        for r in items:
            note = str(r.get("area") or "").strip()
            print(
                " | ".join(
                    [
                        str(r.get("client_name") or ""),
                        note,
                        str(r.get("instructors") or ""),
                        str(r.get("time_slot") or ""),
                        str(r.get("venue") or ""),
                    ]
                )
            )

print(f"\n{'=' * 72}")
print("TEFLON DEMO (dated sessions for portal guide)")
print("=" * 72)
teflon = [r for r in rows if str(r.get("instructors") or "").upper() == "TEFLON" and r.get("session_date")]
for r in sorted(teflon, key=lambda x: (x.get("session_date") or "", x.get("time_slot") or "")):
    print(
        f"{r.get('session_date')} {r.get('day')} | {r.get('service')} | "
        f"{r.get('client_name')} | {r.get('area')} | {r.get('time_slot')} | {r.get('venue')}"
    )
