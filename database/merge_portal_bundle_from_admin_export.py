# -*- coding: utf-8 -*-
"""Merge portal-import-bundle CSVs from the admin Supabase export project.

Default source (Portal 2026 exports):
  C:\\Users\\info\\OneDrive\\Desktop\\Portals\\Portal 2026\\exports\\portal-import-bundle

Merges session-feedback, cancellations, and absents from last Wednesday through today
into working_ui/portal-import-bundle/, then you should run:

  python database/import_portal_bundle.py

Usage:
  python database/merge_portal_bundle_from_admin_export.py
  python database/merge_portal_bundle_from_admin_export.py --source "D:\\path\\to\\portal-import-bundle"
  python database/merge_portal_bundle_from_admin_export.py --from 2026-05-20 --through 2026-05-22
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(
    r"C:\Users\info\OneDrive\Desktop\Portals\Portal 2026\exports\portal-import-bundle"
)
DEST = ROOT / "working_ui" / "portal-import-bundle"

DATE_COL = {
    "session-feedback.csv": "session_date",
    "cancellations.csv": "session_date",
    "absents.csv": "session_date",
}


def wednesday_on_or_before(d: date) -> date:
    back = (d.weekday() - 2) % 7
    return d - timedelta(days=back)


def row_date(row: dict, col: str) -> str:
    return str(row.get(col) or "").strip()[:10]


def merge_csv(name: str, source: Path, dest: Path, from_iso: str, through_iso: str) -> tuple[int, int, int]:
    col = DATE_COL[name]
    src_rows = list(csv.DictReader(source.read_text(encoding="utf-8-sig").splitlines()))
    if dest.is_file():
        dst_rows = list(csv.DictReader(dest.read_text(encoding="utf-8-sig").splitlines()))
    else:
        dst_rows = []
    fieldnames = list(src_rows[0].keys()) if src_rows else (list(dst_rows[0].keys()) if dst_rows else [])
    if not fieldnames:
        return 0, 0, 0

    kept = [r for r in dst_rows if row_date(r, col) and (row_date(r, col) < from_iso or row_date(r, col) > through_iso)]
    incoming = [r for r in src_rows if from_iso <= row_date(r, col) <= through_iso]
    merged = kept + incoming
    merged.sort(key=lambda r: (row_date(r, col), str(r.get("client_name") or r.get("weekday") or "")))

    with dest.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        for r in merged:
            w.writerow(r)
    return len(kept), len(incoming), len(merged)


def copy_status_overviews(source: Path, dest: Path) -> list[str]:
    copied: list[str] = []
    for pattern in ("sessions-with-feedback-status-*.csv", "sessions-overview-*.csv"):
        for src in sorted(source.glob(pattern)):
            shutil.copy2(src, dest / src.name)
            copied.append(src.name)
    return copied


def update_manifest(dest: Path, counts: dict[str, int]) -> None:
    manifest_path = dest / "manifest.json"
    data: dict = {}
    if manifest_path.is_file():
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            data = {}
    files = data.get("files") if isinstance(data.get("files"), dict) else {}
    files.update(counts)
    data["files"] = files
    data["generated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    data["merged_from_admin_export"] = True
    manifest_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--dest", type=Path, default=DEST)
    ap.add_argument("--from", dest="from_iso", default=None)
    ap.add_argument("--through", dest="through_iso", default=None)
    args = ap.parse_args()

    source: Path = args.source
    dest: Path = args.dest
    if not source.is_dir():
        raise SystemExit(f"Missing source bundle: {source}")
    dest.mkdir(parents=True, exist_ok=True)

    today = date.today()
    from_iso = args.from_iso or wednesday_on_or_before(today).isoformat()
    through_iso = args.through_iso or today.isoformat()

    print(f"Source: {source}")
    print(f"Dest:   {dest}")
    print(f"Date range (inclusive): {from_iso} .. {through_iso}")

    counts: dict[str, int] = {}
    for name in DATE_COL:
        src = source / name
        if not src.is_file():
            print(f"Skip missing {name}")
            continue
        kept, added, total = merge_csv(name, src, dest / name, from_iso, through_iso)
        counts[name] = total
        print(f"{name}: kept {kept} outside range, added {added} from source, total {total}")

    copied = copy_status_overviews(source, dest)
    if copied:
        print("Copied overview/status:", ", ".join(copied))

    logic = source / "FEEDBACK-COMPLETION-LOGIC.md"
    if logic.is_file():
        shutil.copy2(logic, dest / logic.name)

    update_manifest(dest, counts)
    print("Done. Next: python database/import_portal_bundle.py")


if __name__ == "__main__":
    main()
