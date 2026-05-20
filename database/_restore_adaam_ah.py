# -*- coding: utf-8 -*-
"""Re-insert Adaam Ah Sunday 12:30–14:00 rows removed by mistake."""
from __future__ import annotations

import csv
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "working_ui" / "portal-import-bundle"
CANON = ROOT / "database" / "portal_import_bundle"
ROSTER = ROOT / "database" / "roster_weeks"
CLIENTS_INFO = ROOT / "database" / "clients_info_machine.json"

ADAAM_OVERVIEW = [
    "2026-05-17,Sunday,Adaam Ah,Multi-Activity,12.30 to 1.15,GODSWAY,SwimFarm,Hub Room,2026-05-17|12:30|adaam_ah|hub_room,2026-05-17|adaam_ah|12:30|multi-activity|hub_room",
    "2026-05-17,Sunday,Adaam Ah,Multi-Activity,1.15 to 2,ROBERTO,SwimFarm,Big Pool,2026-05-17|13:15|adaam_ah|big_pool,2026-05-17|adaam_ah|13:15|multi-activity|big_pool",
]

ADAAM_STATUS = [
    "2026-05-17,Sunday,Adaam Ah,Multi-Activity,12.30 to 1.15,GODSWAY,SwimFarm,Hub Room,2026-05-17|12:30|adaam_ah|hub_room,2026-05-17|adaam_ah|12:30|multi-activity|hub_room,sunday_hub_team|bismark_godsway|adaam_ah,feedback_submitted,yes,Adaam Ah,Godsway Yatofo,2026-05-17||adaam_ah",
    "2026-05-17,Sunday,Adaam Ah,Multi-Activity,1.15 to 2,ROBERTO,SwimFarm,Big Pool,2026-05-17|13:15|adaam_ah|big_pool,2026-05-17|13:15|multi-activity|big_pool,,feedback_submitted,yes,Adaam Ah,Roberto Reali,2026-05-17||adaam_ah",
]

ADAAM_FEEDBACK = [
    "2026-05-17,Sunday,Adaam Ah,Multi-Activity,,Yes,4,Independent,Happy/Excited,\"Well involved in all activity, focused, happy and followed instructions\",N/A,,Godsway Yatofo,staff,2026-05-17||adaam_ah,no,yes,yes,no,2026-05-17T13:29:57.41345+00:00",
    "2026-05-17,Sunday,Adaam Ah,Multi-Activity,,Yes,5,Required regular support,Happy/Excited,Backstroke double arms improved.,He always choose sinkers as break time choosing activity.,,Roberto Reali,staff,2026-05-17||adaam_ah,no,yes,yes,no,2026-05-17T15:20:36.75941+00:00",
]


def append_lines(path: Path, lines: list[str], after_substring: str | None = None) -> int:
    text = path.read_text(encoding="utf-8-sig")
    if any(ln.split(",")[3:4] and "Adaam Ah" in ln for ln in lines) and "Adaam Ah" in text:
        return 0
    body = text.rstrip("\n")
    block = "\n".join(lines)
    if after_substring and after_substring in body:
        idx = body.index(after_substring)
        end = body.find("\n", idx)
        if end < 0:
            end = len(body)
        body = body[: end + 1] + block + "\n" + body[end + 1 :]
    else:
        body = body + "\n" + block
    path.write_text(body + "\n", encoding="utf-8")
    return len(lines)


def restore_clients_info() -> int:
    raw = subprocess.check_output(
        ["git", "show", "HEAD:database/clients_info_machine.json"],
        text=True,
        cwd=ROOT,
    )
    data = json.loads(raw)
    entry = next((r for r in data if str(r.get("client_name")) == "Adaam Ah"), None)
    if not entry:
        return 0
    local = json.loads(CLIENTS_INFO.read_text(encoding="utf-8"))
    if any(str(r.get("client_name")) == "Adaam Ah" for r in local):
        return 0
    local.append(entry)
    CLIENTS_INFO.write_text(json.dumps(local, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 1


def main() -> None:
    n = 0
    n += append_lines(
        BUNDLE / "sessions-overview-2026-05-13_19.csv",
        ADAAM_OVERVIEW,
        after_substring="2026-05-17,Sunday,Scott,Climbing",
    )
    n += append_lines(
        BUNDLE / "sessions-with-feedback-status-2026-05-13_19.csv",
        ADAAM_STATUS,
        after_substring="2026-05-17,Sunday,Scott,Climbing",
    )
    n += append_lines(BUNDLE / "session-feedback.csv", ADAAM_FEEDBACK)
    roster = ROSTER / "summer-term-2026-week-2026-05-13_2026-05-19.csv"
    n += append_lines(roster, ADAAM_OVERVIEW, after_substring="2026-05-17,Sunday,Scott,Climbing")
    ci = restore_clients_info()
    if CANON.exists():
        shutil.rmtree(CANON)
    shutil.copytree(BUNDLE, CANON)
    print(f"Restored {n} roster/feedback row(s); clients_info +{ci}")


if __name__ == "__main__":
    main()
