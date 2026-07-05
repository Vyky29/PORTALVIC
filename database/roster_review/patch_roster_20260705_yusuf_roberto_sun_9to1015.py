# -*- coding: utf-8 -*-
"""Yusuf Ah con Roberto los domingos: un solo bloque 9-10.15 (Multi, Big Pool).

Antes eran 2 slots (9-9.30 Aquatic/Small Pool + 9.30-10.15 Multi/Big Pool) que
el dashboard fusionaba en una tarjeta pero mostraba "9.30 a 10.15". El cliente
quiere que a Roberto le salga "9 a 10.15" como una sola sesión. Se colapsan
ambos en un único slot 9-10.15 Multi-Activity (Big Pool). El feedback ya era
una sola unidad, así que no cambia.

  python database/roster_review/patch_roster_20260705_yusuf_roberto_sun_9to1015.py
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


def clean(v) -> str:
    return str(v or "").strip()


def start_min(ts: str) -> int:
    m = re.match(r"(\d{1,2})(?:[.,](\d{2}))?", ts or "")
    if not m:
        return 99999
    h = int(m.group(1)); mn = int(m.group(2) or 0)
    base = 12 if h == 12 else (h + 12 if 1 <= h <= 6 else h)
    return base * 60 + mn


def is_yusuf(s) -> bool:
    return clean(s.get("client_name")).lower() in ("yusuf ah", "yusuf_ah")


def main():
    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    changed = []
    for w in seed.get("weeks", []):
        s = clean(w.get("start")); e = clean(w.get("end"))
        for st in w.get("staff", []):
            if clean(st.get("staffKey")).lower() != "roberto":
                continue
            for d in st.get("days", []):
                sd = clean(d.get("sessionDate"))
                if not (s <= sd <= e):
                    continue
                if clean(d.get("weekday")).lower() != "sunday":
                    continue
                slots = d.get("slots") or []
                yus = [x for x in slots if is_yusuf(x)]
                times = {clean(x.get("time_slot")) for x in yus}
                if times != {"9 to 9.30", "9.30 to 10.15"}:
                    continue
                # preserve participant_info from either slot
                info = ""
                for x in yus:
                    if clean(x.get("participant_info")):
                        info = clean(x.get("participant_info")); break
                merged = {
                    "time_slot": "9 to 10.15", "client_name": "Yusuf Ah",
                    "service": "Multi-Activity", "area": "Big Pool",
                    "pool_note": "Big Pool", "venue": "SwimFarm",
                    "instructors": "ROBERTO", "participant_info": info,
                }
                rest = [x for x in slots if not is_yusuf(x)]
                rest.append(merged)
                rest.sort(key=lambda x: start_min(clean(x.get("time_slot"))))
                d["slots"] = rest
                changed.append(sd)

    MADRE.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("Domingos Yusuf+Roberto fusionados a 9-10.15:", sorted(set(changed)))
    print("Running sync…")
    subprocess.run([sys.executable, str(SYNC)], cwd=str(ROOT), check=True)


if __name__ == "__main__":
    main()
