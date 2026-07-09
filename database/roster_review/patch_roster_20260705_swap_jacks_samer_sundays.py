# -*- coding: utf-8 -*-
"""Intercambiar Jack S <-> Samer en TODOS los domingos.

Cliente (5 jul): "cambiar Jack S por Samer" = intercambiar posiciones en los
domingos (recurrente). Cada uno pasa a ocupar los slots del otro, arrastrando su
propio participant_info. Samer no tiene ficha (queda ""), Jack S sí.

Resultado por domingo:
  - Samer:  9:30-10:15 Hub Room (Bismark/Godsway) + 10:15-11 Big Pool (Roberto)
  - Jack S: 9:30-10:15 Big Pool (Javier) + 10:15-11 Hub Room (Giuseppe)

  python database/roster_review/patch_roster_20260705_swap_jacks_samer_sundays.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SYNC = ROOT / "database" / "roster_review" / "sync_roster_madre_to_portal.py"


def clean(v) -> str:
    return str(v or "").strip()


def main():
    seed = json.loads(MADRE.read_text(encoding="utf-8"))

    # canonical participant_info per client
    info = {"jack s": "", "samer": ""}
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            for d in st.get("days", []):
                for sl in d.get("slots") or []:
                    cn = clean(sl.get("client_name")).lower()
                    if cn in info and clean(sl.get("participant_info")) and not info[cn]:
                        info[cn] = clean(sl.get("participant_info"))

    swaps = []
    for w in seed.get("weeks", []):
        s = clean(w.get("start")); e = clean(w.get("end"))
        for st in w.get("staff", []):
            for d in st.get("days", []):
                sd = clean(d.get("sessionDate"))
                if not (s <= sd <= e):
                    continue
                if clean(d.get("weekday")).lower() != "sunday":
                    continue
                for sl in d.get("slots") or []:
                    cn = clean(sl.get("client_name")).lower()
                    if cn == "jack s":
                        sl["client_name"] = "Samer"
                        sl["participant_info"] = info["samer"]
                        swaps.append((sd, "Jack S->Samer", clean(sl.get("time_slot")), clean(st.get("staffKey"))))
                    elif cn == "samer":
                        sl["client_name"] = "Jack S"
                        sl["participant_info"] = info["jack s"]
                        swaps.append((sd, "Samer->Jack S", clean(sl.get("time_slot")), clean(st.get("staffKey"))))

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Slots intercambiados: {len(swaps)}")
    for x in swaps:
        print("  ", x)
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
