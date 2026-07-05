# -*- coding: utf-8 -*-
"""Ajuste horario de Roberto:

  1) El swim de Timi (12 a 12.30) con Roberto es SOLO los lunes (termina con ACAT
     a las 12). Se quita de TODOS los viernes (se había añadido de más).
  2) A partir de la semana del 20 jul, Roberto empieza a las 12.30 con Fadi:
     en las semanas de extensión (sessionDate >= 2026-07-20) se quitan de sus
     LUNES el ACAT (11 a 12) y el swim de Timi (12 a 12.30) -> queda Fadi 12.30-3.

Semanas actuales (hasta 17 jul): los lunes de Roberto mantienen ACAT + swim.

  python database/roster_review/patch_roster_20260705_roberto_swim_fadi.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SYNC = ROOT / "database" / "roster_review" / "sync_roster_madre_to_portal.py"

EXT_FROM = "2026-07-20"


def clean(v) -> str:
    return str(v or "").strip()


def is_timi_swim(s: dict) -> bool:
    return clean(s.get("client_name")).lower() == "timi" and clean(s.get("time_slot")) == "12 to 12.30"


def is_acat(s: dict) -> bool:
    return clean(s.get("client_name")).lower() == "acat"


def main() -> None:
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    removed_fri_swim = 0
    removed_ext_mon = 0

    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            if clean(st.get("staffKey")).lower() != "roberto":
                continue
            for d in st.get("days", []):
                wd = clean(d.get("weekday"))
                date = clean(d.get("sessionDate"))
                slots = d.get("slots") or []
                before = len(slots)

                if wd == "Friday":
                    slots = [s for s in slots if not is_timi_swim(s)]
                    removed_fri_swim += before - len(slots)

                if wd == "Monday" and date >= EXT_FROM:
                    n0 = len(slots)
                    slots = [s for s in slots if not is_timi_swim(s) and not is_acat(s)]
                    removed_ext_mon += n0 - len(slots)

                d["slots"] = slots

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Roberto: swim viernes quitado={removed_fri_swim}; lunes extensión (ACAT+swim) quitado={removed_ext_mon}")
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
