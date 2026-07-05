# -*- coding: utf-8 -*-
"""Fija el horario Day Centre del 6 al 31 jul (datos del cliente, 5 jul).

Reglas (a partir del 6 jul):
  - Youssef: Emmanuel 11-1, Fadi 1-3; viernes además Emmanuel 3-4.
    (en sus días de day centre = Lun/Mié/Vie). Se conservan las after-school >=16:00.
  - Michelle y Luliya (lulia): Ikram 11-4 siempre (todos sus días).
  - Roberto: Fadi 12.30-3 siempre; los lunes además ACAT 11-12 y Timi 12-12.30.
    (aplica a TODOS los lunes 6/13/20/27; revierte el "empieza 12.30" del 20).

  python database/roster_review/patch_roster_20260705_daycentre_july_schedule.py
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

DATE_FROM, DATE_TO = "2026-07-06", "2026-07-31"
AFTERSCHOOL = 16 * 60  # slots que empiezan >= 16:00 se conservan


def clean(v) -> str:
    return str(v or "").strip()


def start_min(ts: str) -> int:
    m = re.match(r"(\d{1,2})(?:[.,](\d{2}))?", ts or "")
    if not m:
        return 99999
    h = int(m.group(1)); mn = int(m.group(2) or 0)
    base = 12 if h == 12 else (h + 12 if 1 <= h <= 6 else h)
    return base * 60 + mn


def build_info_map(seed):
    info = {}
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            for d in st.get("days", []):
                for s in d.get("slots") or []:
                    cn = clean(s.get("client_name")).lower()
                    if cn and cn not in info and clean(s.get("participant_info")):
                        info[cn] = clean(s.get("participant_info"))
    return info


def main():
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    info = build_info_map(seed)

    def slot(time, client, instr):
        return {
            "time_slot": time, "client_name": client, "service": "Day Centre",
            "area": "Hub Room", "pool_note": "Hub Room", "venue": "SwimFarm",
            "instructors": instr, "participant_info": info.get(client.lower(), ""),
        }

    counts = {"youssef": 0, "michelle": 0, "lulia": 0, "roberto": 0}

    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            sk = clean(st.get("staffKey")).lower()
            if sk not in counts:
                continue
            for d in st.get("days", []):
                sd = clean(d.get("sessionDate"))
                if not (DATE_FROM <= sd <= DATE_TO):
                    continue
                wd = clean(d.get("weekday")).lower()
                after = [s for s in (d.get("slots") or []) if start_min(clean(s.get("time_slot"))) >= AFTERSCHOOL]

                if sk == "youssef":
                    if wd not in ("monday", "wednesday", "friday"):
                        continue
                    new = [slot("11 to 1", "Emmanuel", "YOUSSEF"), slot("1 to 3", "Fadi", "YOUSSEF")]
                    if wd == "friday":
                        new.append(slot("3 to 4", "Emmanuel", "YOUSSEF"))
                    d["slots"] = new + after
                    counts[sk] += 1

                elif sk in ("michelle", "lulia"):
                    instr = "LULIA, MICHELLE"
                    d["slots"] = [slot("11 to 4", "Ikram", instr)] + after
                    counts[sk] += 1

                elif sk == "roberto":
                    if wd == "monday":
                        day_slots = [slot("11 to 12", "ACAT", "ROBERTO"),
                                     slot("12 to 12.30", "Timi", "ROBERTO"),
                                     slot("12.30 to 3", "Fadi", "ROBERTO")]
                        d["slots"] = day_slots + after
                        counts[sk] += 1
                    else:
                        # no-Mondays: garantizar Fadi 12.30-3 como day centre
                        day_slots = [slot("12.30 to 3", "Fadi", "ROBERTO")]
                        d["slots"] = day_slots + after
                        counts[sk] += 1

                d["slots"].sort(key=lambda x: start_min(clean(x.get("time_slot"))))

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Días actualizados:", counts)
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
