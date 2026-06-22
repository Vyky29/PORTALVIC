# -*- coding: utf-8 -*-
"""
Apply pending portal_madre_fold_queue rows into roster_term_master.json (MADRE).

Export pending rows from Supabase (SQL editor):

  copy (
    select jsonb_agg(to_jsonb(t))
    from portal_madre_fold_queue t
    where status = 'pending'
    order by created_at
  ) to stdout;

Save as database/local-vault/madre_fold_queue_pending.json (JSON array), then:

  python database/roster_review/fold_overrides_into_madre.py
  python database/roster_review/sync_roster_madre_to_portal.py

Or pass a custom queue file:

  python database/roster_review/fold_overrides_into_madre.py --queue path/to/pending.json
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
DEFAULT_QUEUE = ROOT / "database" / "local-vault" / "madre_fold_queue_pending.json"


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "").strip())


def staff_slug(name: str) -> str:
    return norm(name).lower().replace(" ", "_")


def find_staff_column(week: dict, instructors: str) -> dict | None:
    key = norm(instructors).split(",")[0].strip().lower()
    if not key:
        return None
    for st in week.get("staff") or []:
        sk = str(st.get("staffKey") or "").lower()
        sn = str(st.get("staffName") or "").lower()
        if key == sk or key == sn or key in sk or key in sn:
            return st
    return None


def find_day(staff_col: dict, iso: str) -> dict | None:
    for d in staff_col.get("days") or []:
        if str(d.get("sessionDate") or "")[:10] == iso:
            return d
    return None


def slot_match(slots: list, client: str, time_slot: str) -> dict | None:
    c = norm(client).lower()
    t = norm(time_slot).lower()
    for s in slots:
        if norm(s.get("client_name")).lower() == c and norm(s.get("time_slot")).lower() == t:
            return s
    return None


def fold_participant_upsert(madre: dict, iso: str, payload: dict) -> bool:
    client = norm(payload.get("client_name"))
    time_slot = norm(payload.get("time_slot"))
    if not client or not time_slot or not iso:
        return False
    weeks = madre.get("weeks") or []
    for week in weeks:
        start = str(week.get("start") or "")[:10]
        end = str(week.get("end") or "")[:10]
        if iso < start or iso > end:
            continue
        st = find_staff_column(week, payload.get("instructors") or "")
        if not st:
            return False
        day = find_day(st, iso)
        if not day:
            day = {
                "weekday": payload.get("day") or "",
                "sessionDate": iso,
                "slots": [],
            }
            st.setdefault("days", []).append(day)
        slots = day.setdefault("slots", [])
        slot = slot_match(slots, client, time_slot)
        if not slot:
            slot = {"client_name": client, "time_slot": time_slot}
            slots.append(slot)
        for k in ("instructors", "service", "area", "venue", "pool_note"):
            if k == "instructors":
                continue
            v = payload.get(k if k != "pool_note" else "area")
            if v:
                slot[k if k != "pool_note" else "pool_note"] = norm(v)
                if k == "area" or k == "pool_note":
                    slot["area"] = norm(v)
                    slot["pool_note"] = norm(v)
        if payload.get("service"):
            slot["service"] = norm(payload["service"])
        if payload.get("venue"):
            slot["venue"] = norm(payload["venue"])
        slots.sort(key=lambda s: norm(s.get("time_slot")))
        return True
    return False


def fold_participant_cancel(madre: dict, iso: str, payload: dict) -> bool:
    client = norm(payload.get("client_name")).lower()
    time_slot = norm(payload.get("time_slot")).lower()
    if not client or not iso:
        return False
    for week in madre.get("weeks") or []:
        start = str(week.get("start") or "")[:10]
        end = str(week.get("end") or "")[:10]
        if iso < start or iso > end:
            continue
        for st in week.get("staff") or []:
            day = find_day(st, iso)
            if not day:
                continue
            before = len(day.get("slots") or [])
            day["slots"] = [
                s
                for s in day.get("slots") or []
                if not (
                    norm(s.get("client_name")).lower() == client
                    and (not time_slot or norm(s.get("time_slot")).lower() == time_slot)
                )
            ]
            if len(day["slots"]) < before:
                return True
    return False


def fold_staff_upsert(madre: dict, iso: str, payload: dict) -> bool:
    ss = madre.setdefault(
        "staffShifts",
        {"termFrom": "2026-06-01", "termTo": "2026-07-17", "rows": []},
    )
    rows = ss.setdefault("rows", [])
    key = (
        iso,
        staff_slug(payload.get("staff_name") or payload.get("staff_key") or ""),
        norm(payload.get("venue")).lower(),
        norm(payload.get("time_range")).lower(),
    )
    row = {
        "session_date": iso,
        "day": norm(payload.get("day")),
        "staff_key": staff_slug(payload.get("staff_name") or payload.get("staff_key") or ""),
        "staff_name": norm(payload.get("staff_name")),
        "venue": norm(payload.get("venue")),
        "time_range": norm(payload.get("time_range")),
        "raw_assignment": norm(payload.get("raw_assignment")),
    }
    replaced = False
    for i, existing in enumerate(rows):
        ek = (
            str(existing.get("session_date") or "")[:10],
            str(existing.get("staff_key") or "").lower(),
            norm(existing.get("venue")).lower(),
            norm(existing.get("time_range")).lower(),
        )
        if ek == key:
            rows[i] = row
            replaced = True
            break
    if not replaced:
        rows.append(row)
    rows.sort(key=lambda r: (r.get("session_date"), r.get("staff_key"), r.get("venue")))
    return True


def apply_fold(madre: dict, item: dict) -> tuple[bool, str]:
    fold_type = str(item.get("fold_type") or "")
    iso = str(item.get("session_date") or "")[:10]
    payload = item.get("payload") or {}
    if fold_type == "participant_slot_upsert":
        ok = fold_participant_upsert(madre, iso, payload)
        return ok, "participant upsert" if ok else "no matching week/staff column"
    if fold_type == "participant_slot_cancel":
        ok = fold_participant_cancel(madre, iso, payload)
        return ok, "participant cancel" if ok else "slot not found"
    if fold_type == "staff_shift_upsert":
        ok = fold_staff_upsert(madre, iso, payload)
        return ok, "staff shift upsert"
    if fold_type == "staff_shift_cancel":
        payload = dict(payload)
        payload.setdefault("_cancel", True)
        ss = madre.get("staffShifts") or {}
        rows = ss.get("rows") or []
        sk = staff_slug(payload.get("staff_name") or "")
        ven = norm(payload.get("venue")).lower()
        tr = norm(payload.get("time_range")).lower()
        before = len(rows)
        ss["rows"] = [
            r
            for r in rows
            if not (
                str(r.get("session_date") or "")[:10] == iso
                and str(r.get("staff_key") or "").lower() == sk
                and norm(r.get("venue")).lower() == ven
                and (not tr or norm(r.get("time_range")).lower() == tr)
            )
        ]
        madre["staffShifts"] = ss
        return len(ss["rows"]) < before, "staff shift cancel"
    return False, "unknown fold_type"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    ap.add_argument("--madre", type=Path, default=MADRE)
    args = ap.parse_args()
    if not args.queue.is_file():
        raise SystemExit(f"Queue file missing: {args.queue}\nExport pending rows from Supabase first.")
    if not args.madre.is_file():
        raise SystemExit(f"MADRE missing: {args.madre}")
    queue = json.loads(args.queue.read_text(encoding="utf-8"))
    if not isinstance(queue, list):
        raise SystemExit("Queue JSON must be an array of fold rows")
    madre = json.loads(args.madre.read_text(encoding="utf-8"))
    applied = skipped = 0
    log: list[dict] = []
    for item in queue:
        ok, note = apply_fold(madre, item)
        log.append({"id": item.get("id"), "ok": ok, "note": note, "fold_type": item.get("fold_type")})
        if ok:
            applied += 1
        else:
            skipped += 1
    meta = madre.setdefault("meta", {})
    meta["schemaVersion"] = 2
    meta["lastFoldAt"] = datetime.now(timezone.utc).isoformat()
    meta["lastFoldApplied"] = applied
    meta["lastFoldSkipped"] = skipped
    args.madre.write_text(json.dumps(madre, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    out_log = args.queue.with_suffix(".fold_result.json")
    out_log.write_text(json.dumps(log, indent=2) + "\n", encoding="utf-8")
    print(f"Applied {applied}, skipped {skipped} → {args.madre}")
    print(f"Log: {out_log}")
    if applied:
        print("Next: python database/roster_review/sync_roster_madre_to_portal.py")


if __name__ == "__main__":
    main()
