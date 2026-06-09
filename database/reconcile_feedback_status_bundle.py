# -*- coding: utf-8 -*-
"""Mark sessions-with-feedback-status rows as submitted when session-feedback data exists.

Uses the same join ideas as FEEDBACK-COMPLETION-LOGIC.md (portal_session_key, date||client_slug,
feedback_unit_key, merge groups). Run before export_status_js in import_portal_bundle.py.

  python database/reconcile_feedback_status_bundle.py
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUNDLE_DEFAULT = ROOT / "working_ui" / "portal-import-bundle"
FEEDBACK_JS = ROOT / "working_ui" / "portal" / "session_feedback_portal_data.js"
FIRST_DATE = "2026-04-13"
THROUGH_DEFAULT = "2026-06-08"

STATUS_FIELDS = [
    "date",
    "weekday",
    "client",
    "service",
    "time_slot",
    "instructor",
    "venue",
    "notes",
    "session_key",
    "feedback_unit_key",
    "feedback_merge_group",
    "overview_status",
    "feedback_complete",
    "matched_feedback_client",
    "matched_feedback_by",
    "matched_portal_session_key",
]


def client_slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(name or "").strip().lower()).strip("_")


def norm_attendance(val: str) -> str:
    a = str(val or "").strip().lower()
    if not a:
        return ""
    if re.match(r"^(no|n|false|0)$", a):
        return "no"
    if re.search(r"\b(no[\s-]?show|noshow|did not attend|absent|absence|cancel)", a):
        return "no"
    return "yes"


def load_feedback_rows(feedback_csv: Path) -> list[dict]:
    rows: list[dict] = []
    if feedback_csv.is_file():
        text = feedback_csv.read_text(encoding="utf-8-sig")
        for raw in csv.DictReader(text.splitlines()):
            rows.append(raw)
    if FEEDBACK_JS.is_file() and JS_PREFIX in (text := FEEDBACK_JS.read_text(encoding="utf-8")):
        payload = json.loads(text.split(JS_PREFIX, 1)[1].strip().rstrip(";"))
        for r in payload.get("rows") or []:
            rows.append(
                {
                    "session_date": r.get("date"),
                    "client_name": r.get("clientName"),
                    "completed_by_name": r.get("instructor"),
                    "portal_session_key": "",
                    "attendance": r.get("attendance"),
                    "service": r.get("service"),
                    "session_time": r.get("sessionTimeSlot") or "",
                }
            )
    return rows


JS_PREFIX = "window.SESSION_FEEDBACK_PORTAL_SOURCE = "


def feedback_lookup(feedback_rows: list[dict]) -> tuple[set[str], set[str], dict[str, dict]]:
    """Keys for matching + map date||slug -> best attended feedback row."""
    keys: set[str] = set()
    absent_keys: set[str] = set()
    by_day_client: dict[str, dict] = {}

    for fb in feedback_rows:
        date_iso = str(fb.get("session_date") or fb.get("date") or "")[:10]
        if not date_iso or date_iso < FIRST_DATE:
            continue
        name = str(fb.get("client_name") or fb.get("clientName") or "").strip()
        if not name:
            continue
        slug = client_slug(name)
        psk = str(fb.get("portal_session_key") or "").strip()
        if psk:
            keys.add(psk)
            keys.add(psk.lower())
        keys.add(f"{date_iso}||{slug}")
        keys.add(f"{date_iso}|{slug}")
        att = norm_attendance(str(fb.get("attendance") or ""))
        if att == "no":
            if psk:
                absent_keys.add(psk)
                absent_keys.add(psk.lower())
            absent_keys.add(f"{date_iso}||{slug}")
            continue
        if att == "yes" or fb.get("engagement_rating") or fb.get("engagement") or fb.get("positive_feedback") or fb.get("positive"):
            dc = f"{date_iso}||{slug}"
            prev = by_day_client.get(dc)
            if not prev or str(fb.get("created_at") or "") > str(prev.get("created_at") or ""):
                by_day_client[dc] = fb

    return keys, absent_keys, by_day_client


def slot_keys(row: dict) -> set[str]:
    out: set[str] = set()
    date_iso = str(row.get("date") or "")[:10]
    slug = client_slug(row.get("client") or "")
    for field in ("session_key", "feedback_unit_key", "matched_portal_session_key"):
        v = str(row.get(field) or "").strip()
        if v:
            out.add(v)
            out.add(v.lower())
    if date_iso and slug:
        out.add(f"{date_iso}||{slug}")
        out.add(f"{date_iso}|{slug}")
    return out


def feedback_matches_slot(
    fb_keys: set[str],
    absent_keys: set[str],
    by_day_client: dict[str, dict],
    row: dict,
) -> dict | None:
    sk = slot_keys(row)
    if sk & absent_keys:
        return None
    if sk & fb_keys:
        date_iso = str(row.get("date") or "")[:10]
        slug = client_slug(row.get("client") or "")
        return by_day_client.get(f"{date_iso}||{slug}") or {}
    return None


def read_status_csv(path: Path) -> list[dict]:
    return list(csv.DictReader(path.read_text(encoding="utf-8-sig").splitlines()))


def write_status_csv(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=STATUS_FIELDS, lineterminator="\n")
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in STATUS_FIELDS})


def _is_test_client(name: str) -> bool:
    return bool(re.match(r"^test\s*client$", str(name or "").strip(), re.I))


def apply_cancellations_from_csv(bundle: Path, through_iso: str) -> int:
    """Mark overview slots cancelled when portal-import cancellations.csv has a row."""
    can_path = bundle / "cancellations.csv"
    if not can_path.is_file():
        return 0
    can_by_client_day: dict[tuple[str, str], dict] = {}
    for raw in csv.DictReader(can_path.read_text(encoding="utf-8-sig").splitlines()):
        date_iso = str(raw.get("session_date") or "")[:10]
        if not date_iso or date_iso < FIRST_DATE or date_iso > through_iso:
            continue
        name = str(raw.get("client_name") or "").strip()
        if not name or _is_test_client(name):
            continue
        can_by_client_day[(date_iso, client_slug(name))] = raw

    updated = 0
    for path in sorted(bundle.glob("sessions-with-feedback-status-*.csv")):
        rows = read_status_csv(path)
        changed_file = False
        for row in rows:
            date_iso = str(row.get("date") or "")[:10]
            if not date_iso or date_iso < FIRST_DATE or date_iso > through_iso:
                continue
            key = (date_iso, client_slug(row.get("client") or ""))
            can = can_by_client_day.get(key)
            if not can:
                continue
            if str(row.get("overview_status") or "").strip() == "cancelled":
                continue
            row["overview_status"] = "cancelled"
            row["feedback_complete"] = "yes"
            row["matched_feedback_client"] = str(can.get("client_name") or row.get("client") or "").strip()
            row["matched_feedback_by"] = str(can.get("submitted_by_name") or "").strip()
            row["matched_portal_session_key"] = str(
                can.get("portal_session_key") or row.get("session_key") or ""
            ).strip()
            updated += 1
            changed_file = True
        if changed_file:
            write_status_csv(path, rows)
            print(f"Cancellation status {path.relative_to(ROOT)}")
    return updated


def reconcile_bundle(
    bundle_dir: Path | None = None, through_iso: str = THROUGH_DEFAULT
) -> tuple[int, int]:
    bundle = Path(bundle_dir) if bundle_dir else BUNDLE_DEFAULT
    apply_cancellations_from_csv(bundle, through_iso)
    fb_rows = load_feedback_rows(bundle / "session-feedback.csv")
    fb_keys, absent_keys, by_day_client = feedback_lookup(fb_rows)
    updated = 0
    still_awaiting = 0

    # Merge groups: if any slot in group is already submitted, propagate to awaiting siblings.
    all_rows: list[tuple[Path, dict]] = []
    for path in sorted(bundle.glob("sessions-with-feedback-status-*.csv")):
        for row in read_status_csv(path):
            if str(row.get("date") or "")[:10] <= through_iso:
                all_rows.append((path, row))

    done_groups: set[str] = set()
    for _path, row in all_rows:
        g = str(row.get("feedback_merge_group") or "").strip()
        if not g:
            continue
        if str(row.get("overview_status") or "") in ("feedback_submitted", "absent", "cancelled"):
            done_groups.add(g)

    for path in sorted(bundle.glob("sessions-with-feedback-status-*.csv")):
        rows = read_status_csv(path)
        changed_file = False
        for row in rows:
            date_iso = str(row.get("date") or "")[:10]
            if not date_iso or date_iso < FIRST_DATE or date_iso > through_iso:
                continue
            status = str(row.get("overview_status") or "").strip()
            if status in ("absent", "cancelled"):
                continue
            if status == "feedback_submitted":
                g = str(row.get("feedback_merge_group") or "").strip()
                if g:
                    done_groups.add(g)
                continue

            g = str(row.get("feedback_merge_group") or "").strip()
            if g and g in done_groups:
                row["overview_status"] = "feedback_submitted"
                row["feedback_complete"] = "yes"
                updated += 1
                changed_file = True
                continue

            fb = feedback_matches_slot(fb_keys, absent_keys, by_day_client, row)
            if fb is not None:
                row["overview_status"] = "feedback_submitted"
                row["feedback_complete"] = "yes"
                row["matched_feedback_client"] = str(
                    fb.get("client_name") or row.get("client") or ""
                ).strip()
                row["matched_feedback_by"] = str(
                    fb.get("completed_by_name") or fb.get("instructor") or ""
                ).strip()
                psk = str(fb.get("portal_session_key") or row.get("session_key") or "").strip()
                row["matched_portal_session_key"] = psk
                updated += 1
                changed_file = True
                if g:
                    done_groups.add(g)
            elif status == "awaiting_feedback":
                still_awaiting += 1

        if changed_file:
            write_status_csv(path, rows)
            print(f"Updated {path.relative_to(ROOT)}")

    return updated, still_awaiting


def main() -> None:
    n, pending = reconcile_bundle()
    print(f"Reconciled {n} slot(s); still awaiting (through {THROUGH_DEFAULT}): {pending}")


if __name__ == "__main__":
    main()
