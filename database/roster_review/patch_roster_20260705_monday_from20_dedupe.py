# -*- coding: utf-8 -*-
"""Lunes desde 20 jul + limpieza de días fuera de rango en la MADRE.

Cliente (5 jul): "a partir del 20 Roberto empieza a las 12.30 y Timi está con
Raul de 11 a 1 pm". => Lunes 20 y 27 jul: Roberto SOLO Fadi 12.30-3 (se quita
ACAT 11-12 y Timi 12-12.30). Timi 11-1 con Raul ya existe. Lunes 6 y 13 jul
se mantienen con ACAT+Timi+Fadi.

Además se detectó corrupción: 216 días con sessionDate fuera del rango de su
semana (duplicados de 06-29/07-06/07-13 metidos en semanas de junio). Todos
tienen copia válida en su semana correcta, así que se eliminan los fuera de
rango. Las sesiones "Casa" (home) de Victor estaban etiquetadas instr=ROBERTO
por error -> se corrigen a VICTOR.

  python database/roster_review/patch_roster_20260705_monday_from20_dedupe.py
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

FROM_MONDAY = "2026-07-20"
AFTERSCHOOL = 16 * 60


def clean(v) -> str:
    return str(v or "").strip()


def start_min(ts: str) -> int:
    m = re.match(r"(\d{1,2})(?:[.,](\d{2}))?", ts or "")
    if not m:
        return 99999
    h = int(m.group(1)); mn = int(m.group(2) or 0)
    base = 12 if h == 12 else (h + 12 if 1 <= h <= 6 else h)
    return base * 60 + mn


def main():
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    weeks = seed.get("weeks", [])

    # A) remove day entries whose sessionDate is outside their week's [start,end]
    removed = 0
    for w in weeks:
        s = clean(w.get("start")); e = clean(w.get("end"))
        for st in w.get("staff", []):
            days = st.get("days") or []
            keep = [d for d in days if s <= clean(d.get("sessionDate")) <= e]
            removed += len(days) - len(keep)
            st["days"] = keep

    # B) fix Victor "Casa"/home sessions mislabeled instr=ROBERTO -> VICTOR
    fixed_victor = 0
    for w in weeks:
        for st in w.get("staff", []):
            if clean(st.get("staffKey")).lower() != "victor":
                continue
            for d in st.get("days", []):
                for slot in d.get("slots") or []:
                    if clean(slot.get("client_name")).lower() in ("casa", "home") \
                            and clean(slot.get("instructors")).upper() != "VICTOR":
                        slot["instructors"] = "VICTOR"
                        fixed_victor += 1

    # C) Roberto Mondays >= 20 jul: keep only Fadi (12.30-3) + after-school
    changed = []
    for w in weeks:
        for st in w.get("staff", []):
            if clean(st.get("staffKey")).lower() != "roberto":
                continue
            for d in st.get("days", []):
                sd = clean(d.get("sessionDate"))
                if clean(d.get("weekday")).lower() != "monday" or sd < FROM_MONDAY:
                    continue
                kept = [s for s in (d.get("slots") or [])
                        if clean(s.get("client_name")).lower() == "fadi"
                        or start_min(clean(s.get("time_slot"))) >= AFTERSCHOOL]
                for s in kept:
                    if clean(s.get("client_name")).lower() == "fadi":
                        s["time_slot"] = "12.30 to 3"
                kept.sort(key=lambda x: start_min(clean(x.get("time_slot"))))
                d["slots"] = kept
                changed.append(sd)

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Días fuera de rango eliminados:", removed)
    print("Victor 'Casa' instr corregidos a VICTOR:", fixed_victor)
    print("Roberto lunes >=20 jul (solo Fadi):", sorted(set(changed)))
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
