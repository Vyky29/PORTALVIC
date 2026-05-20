# -*- coding: utf-8 -*-
"""Remove non-existent client Adaam Ah from portal bundle and roster exports."""
from __future__ import annotations

import csv
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "working_ui" / "portal-import-bundle"
CANON = ROOT / "database" / "portal_import_bundle"
ROSTER = ROOT / "database" / "roster_weeks"
CLIENTS_INFO = ROOT / "database" / "clients_info_machine.json"

CLIENT_COLS = ("client", "client_name", "matched_feedback_client")


def is_adaam(row: dict) -> bool:
    for col in CLIENT_COLS:
        v = str(row.get(col) or "").strip().lower()
        if v in ("adaam ah", "adaam"):
            return True
    key = str(row.get("portal_session_key") or row.get("session_key") or "")
    if "adaam_ah" in key.lower():
        return True
    return False


def filter_csv(path: Path) -> int:
    text = path.read_text(encoding="utf-8-sig")
    if "adaam" not in text.lower():
        return 0
    lines = text.splitlines()
    if not lines:
        return 0
    reader = csv.DictReader(lines)
    fieldnames = reader.fieldnames or []
    kept = []
    removed = 0
    for raw in reader:
        if is_adaam(raw):
            removed += 1
            continue
        kept.append(raw)
    if not removed:
        return 0
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        w.writerows(kept)
    return removed


def filter_clients_info() -> int:
    if not CLIENTS_INFO.is_file():
        return 0
    data = json.loads(CLIENTS_INFO.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return 0
    before = len(data)
    data = [r for r in data if str(r.get("client_name") or "").strip().lower() not in ("adaam ah", "adaam")]
    removed = before - len(data)
    if removed:
        CLIENTS_INFO.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return removed


def main() -> None:
    total = 0
    for base in (BUNDLE, CANON, ROSTER):
        if not base.is_dir():
            continue
        for p in sorted(base.glob("*.csv")):
            n = filter_csv(p)
            if n:
                print(f"Removed {n} row(s) from {p.relative_to(ROOT)}")
                total += n
    ci = filter_clients_info()
    if ci:
        print(f"Removed {ci} from clients_info_machine.json")
        total += ci
    if BUNDLE.is_dir():
        if CANON.exists():
            shutil.rmtree(CANON)
        shutil.copytree(BUNDLE, CANON)
    print(f"Done. {total} removal(s).")


if __name__ == "__main__":
    main()
