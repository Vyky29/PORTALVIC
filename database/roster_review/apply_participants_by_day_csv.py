# -*- coding: utf-8 -*-
"""
Apply edited participants-by-day-area-notes.csv back to spreadsheet bundles.

Updates only the `area` field (from CSV column `notes`) on matching roster rows.
Matching key: date + weekday + client + service + time_slot + venue.
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEW_CSV = Path(__file__).resolve().parent / "participants-by-day-area-notes.csv"

BUNDLE_PATHS = [
    ROOT / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal-shared-js" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "database" / "staff_dashboard_spreadsheet_bundle.js",
]


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip()).lower()


def row_key(date: str, weekday: str, client: str, service: str, time_slot: str, venue: str) -> tuple:
    return (
        str(date or "").strip()[:10],
        norm(weekday),
        norm(client),
        norm(service),
        norm(time_slot),
        norm(venue),
    )


def load_review_map(path: Path) -> dict[tuple, str]:
    if not path.exists():
        raise SystemExit(f"Missing review CSV: {path}")
    out: dict[tuple, str] = {}
    dupes: list[tuple] = []
    with path.open(newline="", encoding="utf-8-sig") as f:
        for raw in csv.DictReader(f):
            notes = str(raw.get("notes") or "").strip()
            k = row_key(
                raw.get("date") or "",
                raw.get("weekday") or "",
                raw.get("client") or "",
                raw.get("service") or "",
                raw.get("time_slot") or "",
                raw.get("venue") or "",
            )
            if k in out and out[k] != notes:
                dupes.append(k)
            out[k] = notes
    if dupes:
        print(f"Warning: {len(dupes)} duplicate keys in CSV with conflicting notes (last wins)")
    return out


def bundle_row_key(r: dict) -> tuple:
    sd = str(r.get("session_date") or "").strip()[:10]
    return row_key(
        sd,
        r.get("day") or "",
        r.get("client_name") or "",
        r.get("service") or "",
        r.get("time_slot") or "",
        r.get("venue") or "",
    )


def parse_bundle(path: Path) -> tuple[str, str, str, dict]:
    text = path.read_text(encoding="utf-8")
    m = re.search(
        r"(window\.STAFF_DASHBOARD_SOURCE\s*=\s*)(\{[\s\S]*\})(\s*;\s*\n\}\)\(\);?\s*$)",
        text,
    )
    if not m:
        raise SystemExit(f"Could not parse bundle: {path}")
    data = json.loads(m.group(2))
    return m.group(1), m.group(2), m.group(3), data


def apply_to_bundle(path: Path, review: dict[tuple, str]) -> tuple[int, int, list[str]]:
    prefix, _body, suffix, data = parse_bundle(path)
    rows = data.get("rows") or []
    updated = 0
    unmatched: list[str] = []
    for r in rows:
        k = bundle_row_key(r)
        if k not in review:
            continue
        new_area = review[k]
        old_area = str(r.get("area") or "").strip()
        if old_area != new_area:
            r["area"] = new_area
            updated += 1
    matched_keys = {bundle_row_key(r) for r in rows if bundle_row_key(r) in review}
    for k in review:
        if k not in matched_keys:
            d, wd, client, svc, ts, venue = k
            unmatched.append(f"{d or 'template'}\t{wd}\t{client}\t{svc}\t{ts}\t{venue}\t→ {review[k]}")
    new_json = json.dumps(data, indent=2, ensure_ascii=False)
    path.write_text(prefix + new_json + suffix, encoding="utf-8")
    return updated, len(matched_keys), unmatched


def main() -> None:
    review = load_review_map(REVIEW_CSV)
    print(f"Loaded {len(review)} review rows from {REVIEW_CSV.relative_to(ROOT)}")
    total_updated = 0
    all_unmatched: list[str] = []
    for path in BUNDLE_PATHS:
        if not path.exists():
            print(f"Skip (missing): {path.relative_to(ROOT)}")
            continue
        updated, matched, unmatched = apply_to_bundle(path, review)
        total_updated += updated
        all_unmatched.extend(unmatched)
        print(f"{path.relative_to(ROOT)}: {updated} area updates ({matched} keys matched)")
    if all_unmatched:
        uniq = sorted(set(all_unmatched))
        print(f"\nWarning: {len(uniq)} CSV rows did not match any bundle row (first 20):")
        for line in uniq[:20]:
            print(" ", line)
    print(f"\nDone. Total area field updates: {total_updated}")
    print("Next: commit + push working_ui/portal/ for Vercel deploy.")


if __name__ == "__main__":
    main()
