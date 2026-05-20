# -*- coding: utf-8 -*-
"""Merge typo Aadam Ah → Aydaan Ah in portal-import-bundle and roster_weeks."""
from __future__ import annotations

import csv
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE = ROOT / "working_ui" / "portal-import-bundle"
CANON = ROOT / "database" / "portal_import_bundle"
ROSTER = ROOT / "database" / "roster_weeks"


def fix_text(s: str) -> str:
    if not s:
        return s
    t = str(s)
    t = t.replace("Aadam Ah", "Aydaan Ah")
    t = t.replace("aadam_ah", "aydaan_ah")
    # feedback matched short name
    if t == "Aadam":
        return "Aydaan"
    return t


def fix_csv(path: Path) -> int:
    text = path.read_text(encoding="utf-8-sig")
    if "Aadam" not in text and "aadam" not in text:
        return 0
    lines = text.splitlines()
    if not lines:
        return 0
    reader = csv.DictReader(lines)
    fieldnames = reader.fieldnames or []
    rows = []
    n = 0
    for raw in reader:
        changed = False
        out = {}
        for k, v in raw.items():
            nv = fix_text(v)
            if nv != v:
                changed = True
            out[k] = nv
        if changed:
            n += 1
        rows.append(out)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    return n


def main() -> None:
    paths: list[Path] = []
    for base in (BUNDLE, CANON, ROSTER):
        if not base.is_dir():
            continue
        paths.extend(base.glob("*.csv"))
    total = 0
    for p in sorted(set(paths)):
        c = fix_csv(p)
        if c:
            print(f"Fixed {c} rows in {p.relative_to(ROOT)}")
            total += c
    if CANON.exists() and BUNDLE.is_dir():
        if CANON.exists():
            shutil.rmtree(CANON)
        shutil.copytree(BUNDLE, CANON)
        print("Synced database/portal_import_bundle from working_ui/portal-import-bundle")
    print(f"Done. {total} row(s) updated.")


if __name__ == "__main__":
    main()
