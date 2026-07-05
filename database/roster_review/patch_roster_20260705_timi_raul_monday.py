# -*- coding: utf-8 -*-
"""Corrige rota Victor/Raul para Timi (aclaración del cliente):

  - Victor: TRABAJA viernes (Timi 11-1) y HOME los lunes.
  - Raul:   HOME los viernes y TRABAJA los lunes -> Timi 11-1 los lunes.
  - Roberto: swim Timi 12-12.30 (sin cambios, ambos días).

La sync (sync_roster_madre_to_portal.py) atribuye cada fila del bundle al
NOMBRE DEL BLOQUE DE STAFF (staffName), no al campo `instructors` del slot.
Por eso Timi debe vivir en el bloque de RAUL para atribuirse a Raul los lunes.

Reglas (aplicadas a TODOS los bloques-semana, para dedupe limpio):
  LUNES (2026-06-29, 07-06, 07-13):
    - victor: quita slots de Timi; garantiza Casa/HOME 11 to 1.
    - raul:   quita slots MANAGER; garantiza Timi 11 to 1 (bloque RAUL).
  VIERNES (2026-06-26, 07-03, 07-10, 07-17):
    - victor: quita slots Casa/HOME; garantiza Timi 11 to 1 (bloque VICTOR).
    - raul:   deja solo Casa/HOME 11 to 4 (Fadi lo cubre Roberto).

  python database/roster_review/patch_roster_20260705_timi_raul_monday.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SYNC = ROOT / "database" / "roster_review" / "sync_roster_madre_to_portal.py"

MON_DATES = {"2026-06-29", "2026-07-06", "2026-07-13"}
FRI_DATES = {"2026-06-26", "2026-07-03", "2026-07-10", "2026-07-17"}


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


def is_home(s: dict) -> bool:
    cn = clean(s.get("client_name")).lower()
    area = clean(s.get("area")).upper()
    return cn in ("casa", "home") or area == "HOME"


def is_timi(s: dict) -> bool:
    return clean(s.get("client_name")).lower() == "timi"


def is_manager(s: dict) -> bool:
    return clean(s.get("client_name")).upper() == "MANAGER"


def find_timi_info(seed: dict) -> str:
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            for d in st.get("days", []):
                for s in d.get("slots") or []:
                    if is_timi(s) and clean(s.get("participant_info")):
                        return clean(s.get("participant_info"))
    return ""


def timi_slot(instructor: str, info: str) -> dict:
    return {
        "time_slot": "11 to 1",
        "client_name": "Timi",
        "service": "Day Centre",
        "area": "Hub Room",
        "pool_note": "Hub Room",
        "venue": "SwimFarm",
        "instructors": instructor,
        "participant_info": info,
    }


def casa_slot(time_slot: str, instructor: str, info: str) -> dict:
    return {
        "time_slot": time_slot,
        "client_name": "Casa",
        "service": "Day Centre",
        "area": "HOME",
        "pool_note": "HOME",
        "venue": "SwimFarm",
        "instructors": instructor,
        "participant_info": info,
    }


def sort_slots(slots: list) -> None:
    slots.sort(key=lambda x: start_minutes(clean(x.get("time_slot"))))


def main() -> None:
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    info = find_timi_info(seed)
    if not info:
        raise SystemExit("No se encontró participant_info de Timi")

    counts = {k: 0 for k in ("v_mon", "r_mon", "v_fri", "r_fri")}

    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            key = clean(st.get("staffKey")).lower()
            if key not in ("victor", "raul"):
                continue
            for d in st.get("days", []):
                date = clean(d.get("sessionDate"))
                slots = d.setdefault("slots", [])

                if key == "victor" and date in MON_DATES:
                    slots[:] = [s for s in slots if not is_timi(s)]
                    if not any(is_home(s) for s in slots):
                        slots.append(casa_slot("11 to 1", "VICTOR", info))
                    sort_slots(slots)
                    counts["v_mon"] += 1

                elif key == "raul" and date in MON_DATES:
                    slots[:] = [s for s in slots if not is_manager(s)]
                    if not any(is_timi(s) and clean(s.get("time_slot")) == "11 to 1" for s in slots):
                        slots.append(timi_slot("RAUL", info))
                    sort_slots(slots)
                    counts["r_mon"] += 1

                elif key == "victor" and date in FRI_DATES:
                    slots[:] = [s for s in slots if not is_home(s)]
                    if not any(is_timi(s) and clean(s.get("time_slot")) == "11 to 1" for s in slots):
                        slots.append(timi_slot("VICTOR", info))
                    sort_slots(slots)
                    counts["v_fri"] += 1

                elif key == "raul" and date in FRI_DATES:
                    slots[:] = [casa_slot("11 to 4", "RAUL", info)]
                    counts["r_fri"] += 1

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Corregido MADRE (Timi Raul lunes / Victor viernes):", counts)
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
