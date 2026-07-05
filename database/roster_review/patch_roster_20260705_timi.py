# -*- coding: utf-8 -*-
"""Timi resto de term: Day Centre 11-1 (VICTOR) + swim 12-12.30 (ROBERTO).

Normaliza a Timi en los lunes y viernes hasta fin de term (2026-07-17):
  - VICTOR: Day Centre "11 to 1" (reemplaza el hueco Casa/HOME donde exista).
  - ROBERTO: Day Centre "12 to 12.30" (swim), como sus lunes actuales.

Incluye backfill de sesiones pasadas (26 jun y 3 jul) para que salgan como
pendientes de feedback. Idempotente: si el slot ya existe, lo deja igual.

  python database/roster_review/patch_roster_20260705_timi.py
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

# (fecha, weekday) -> lunes y viernes del resto de term (incl. backfill pasado)
DATES = [
    ("2026-06-26", "Friday"),
    ("2026-06-29", "Monday"),
    ("2026-07-03", "Friday"),
    ("2026-07-06", "Monday"),
    ("2026-07-10", "Friday"),
    ("2026-07-13", "Monday"),
    ("2026-07-17", "Friday"),
]

VICTOR_SLOT = {"time_slot": "11 to 1", "service": "Day Centre", "instructor": "VICTOR"}
ROBERTO_SLOT = {"time_slot": "12 to 12.30", "service": "Day Centre", "instructor": "ROBERTO"}


def clean(v) -> str:
    return str(v or "").strip()


def start_minutes(ts: str) -> int:
    m = re.match(r"(\d{1,2})(?:\.(\d{2}))?", ts or "")
    if not m:
        return 99999
    h = int(m.group(1))
    mn = int(m.group(2) or 0)
    if h <= 6 and "." not in (ts or ""):
        h += 12
    return h * 60 + mn


def find_timi_info(seed: dict) -> str:
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            for d in st.get("days", []):
                for s in d.get("slots") or []:
                    if clean(s.get("client_name")).lower() == "timi":
                        info = clean(s.get("participant_info"))
                        if info:
                            return info
    return ""


def week_for_date(seed: dict, date: str) -> dict | None:
    for w in seed.get("weeks", []):
        if clean(w.get("start")) <= date <= clean(w.get("end")):
            return w
    return None


def find_staff_day(seed: dict, staff_key: str, date: str):
    """Devuelve (staff_block, day) si ya existe ese día para ese staff en cualquier semana."""
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            if clean(st.get("staffKey")) != staff_key:
                continue
            for d in st.get("days", []):
                if clean(d.get("sessionDate")) == date:
                    return st, d
    return None, None


def ensure_staff_block(week: dict, staff_key: str, staff_name: str) -> dict:
    for st in week.setdefault("staff", []):
        if clean(st.get("staffKey")) == staff_key:
            return st
    st = {"staffKey": staff_key, "staffName": staff_name, "venues": ["SwimFarm"], "days": []}
    week["staff"].append(st)
    return st


def ensure_day(seed: dict, staff_key: str, staff_name: str, date: str, weekday: str) -> dict:
    _, day = find_staff_day(seed, staff_key, date)
    if day is not None:
        return day
    week = week_for_date(seed, date)
    if week is None:
        raise SystemExit(f"No hay semana que contenga {date}")
    st = ensure_staff_block(week, staff_key, staff_name)
    day = {"sessionDate": date, "weekday": weekday, "slots": []}
    st.setdefault("days", []).append(day)
    st["days"].sort(key=lambda d: clean(d.get("sessionDate")))
    return day


def make_timi_slot(time_slot: str, service: str, instructor: str, info: str) -> dict:
    return {
        "time_slot": time_slot,
        "client_name": "Timi",
        "service": service,
        "area": "Hub Room",
        "pool_note": "Hub Room",
        "venue": "SwimFarm",
        "instructors": instructor,
        "participant_info": info,
    }


def upsert_timi(day: dict, spec: dict, info: str) -> str:
    slots = day.setdefault("slots", [])
    new_slot = make_timi_slot(spec["time_slot"], spec["service"], spec["instructor"], info)
    # 1) Timi ya presente en ese horario -> asegurar campos.
    for i, s in enumerate(slots):
        if clean(s.get("client_name")).lower() == "timi" and clean(s.get("time_slot")) == spec["time_slot"]:
            if s == new_slot:
                return "ok"
            slots[i] = new_slot
            return "updated"
    # 2) Hueco Casa/HOME ocupando ese mismo horario -> reemplazar por Timi.
    for i, s in enumerate(slots):
        if clean(s.get("time_slot")) == spec["time_slot"] and clean(s.get("client_name")).lower() in ("casa", "home", ""):
            slots[i] = new_slot
            slots.sort(key=lambda x: start_minutes(clean(x.get("time_slot"))))
            return "replaced-home"
    # 3) Añadir nuevo slot.
    slots.append(new_slot)
    slots.sort(key=lambda x: start_minutes(clean(x.get("time_slot"))))
    return "added"


def main() -> None:
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    info = find_timi_info(seed)
    if not info:
        raise SystemExit("No se encontró participant_info de Timi para plantilla")

    report = []
    for date, weekday in DATES:
        vday = ensure_day(seed, "victor", "Victor", date, weekday)
        vres = upsert_timi(vday, VICTOR_SLOT, info)
        rday = ensure_day(seed, "roberto", "Roberto", date, weekday)
        rres = upsert_timi(rday, ROBERTO_SLOT, info)
        report.append(f"  {date} {weekday}: victor 11-1 [{vres}] | roberto 12-12.30 [{rres}]")

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Patched MADRE (Timi):")
    print("\n".join(report))
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
