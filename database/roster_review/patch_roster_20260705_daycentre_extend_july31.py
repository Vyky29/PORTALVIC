# -*- coding: utf-8 -*-
"""Extiende el Day Centre hasta el 31 de julio 2026 (solo mañanas, sin tardes).

El Day Centre sigue abierto 20-24 y 27-31 jul para: Roberto, Luliya, Youssef,
Michelle, Victor y Raul. Se replica el patrón de la última semana del term
(13-17 jul) PERO se quitan los turnos de tarde (after-school, inicio >= 16:00,
piscinas Teaching Pool/Lane). Se mantiene el Day Centre diurno (Hub Room, HOME,
Manager, Big pool) 11:00-16:00.

Añade dos week-blocks nuevos a MADRE (20-24 y 27-31 jul) con los días diurnos de
cada uno de los 6 staff, luego corre la sync.

  python database/roster_review/patch_roster_20260705_daycentre_extend_july31.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SYNC = ROOT / "database" / "roster_review" / "sync_roster_madre_to_portal.py"

STAFF = ("roberto", "luliya", "lulia", "youssef", "michelle", "victor", "raul")

# source_date (última semana term) -> weekday
SRC = {
    "2026-07-13": "Monday",
    "2026-07-14": "Tuesday",
    "2026-07-15": "Wednesday",
    "2026-07-16": "Thursday",
    "2026-07-17": "Friday",
}
# nuevas fechas -> source date (mismo weekday)
NEW_WEEKS = [
    ("2026-07-20", "2026-07-24", {  # semana 20-24
        "2026-07-20": "2026-07-13", "2026-07-21": "2026-07-14",
        "2026-07-22": "2026-07-15", "2026-07-23": "2026-07-16",
        "2026-07-24": "2026-07-17",
    }),
    ("2026-07-27", "2026-07-31", {  # semana 27-31
        "2026-07-27": "2026-07-13", "2026-07-28": "2026-07-14",
        "2026-07-29": "2026-07-15", "2026-07-30": "2026-07-16",
        "2026-07-31": "2026-07-17",
    }),
]


def clean(v) -> str:
    return str(v or "").strip()


def start_min(ts: str) -> int:
    m = re.match(r"(\d{1,2})(?:[.,](\d{2}))?", ts or "")
    if not m:
        return 99999
    h = int(m.group(1))
    mn = int(m.group(2) or 0)
    if h == 12:
        base = 12
    elif 1 <= h <= 6:
        base = h + 12
    else:
        base = h
    return base * 60 + mn


def is_afternoon(slot: dict) -> bool:
    return start_min(clean(slot.get("time_slot"))) >= 16 * 60


def staff_meta_and_daytime_days(seed: dict):
    """Devuelve {staffKey: {"name","venues","days":{src_date:[slots diurnos]}}}."""
    out = {}
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            sk = clean(st.get("staffKey")).lower()
            if sk not in STAFF:
                continue
            meta = out.setdefault(sk, {
                "name": clean(st.get("staffName")) or sk.title(),
                "venues": st.get("venues") or ["SwimFarm"],
                "days": {},
            })
            for d in st.get("days", []):
                sd = clean(d.get("sessionDate"))
                if sd not in SRC:
                    continue
                bucket = meta["days"].setdefault(sd, {})
                for s in d.get("slots") or []:
                    if is_afternoon(s):
                        continue
                    key = (clean(s.get("time_slot")), clean(s.get("client_name")).lower(), clean(s.get("area")).lower())
                    if key not in bucket:
                        bucket[key] = deepcopy(s)
    return out


def main() -> None:
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    meta = staff_meta_and_daytime_days(seed)

    # elimina cualquier week-block previo de las nuevas fechas (idempotente)
    new_starts = {a for a, _b, _m in NEW_WEEKS}
    seed["weeks"] = [w for w in seed.get("weeks", []) if clean(w.get("start")) not in new_starts]

    report = []
    for start, end, mapping in NEW_WEEKS:
        wk = {"start": start, "end": end, "staff": []}
        for sk in STAFF:
            m = meta.get(sk)
            if not m:
                continue
            days = []
            for new_date, src_date in mapping.items():
                src_slots = m["days"].get(src_date) or {}
                if not src_slots:
                    continue
                slots = [deepcopy(s) for s in src_slots.values()]
                slots.sort(key=lambda x: start_min(clean(x.get("time_slot"))))
                days.append({
                    "sessionDate": new_date,
                    "weekday": SRC[src_date],
                    "slots": slots,
                })
            if not days:
                continue
            days.sort(key=lambda d: d["sessionDate"])
            wk["staff"].append({
                "staffKey": sk,
                "staffName": m["name"],
                "venues": m["venues"],
                "days": days,
            })
            report.append(f"  {start}..{end} {sk}: {len(days)} días, "
                          + ", ".join(f"{d['sessionDate']}({len(d['slots'])})" for d in days))
        seed["weeks"].append(wk)

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Day Centre extendido a 31 jul (solo mañanas):")
    print("\n".join(report))
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
