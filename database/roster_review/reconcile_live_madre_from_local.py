#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reconcile the LIVE MADRE (portal_madre_document) with our local roster edits.

Problem this solves:
  The staff dashboard rehydrates from the live MADRE document in Supabase, which
  OVERRIDES the shipped bundle. Local roster edits (patched into
  working_ui/portal/roster_term_master.json + bundle) never reached that live
  document, so staff kept seeing stale rosters (e.g. Bismark in Hub Room instead
  of climbing).

Strategy (3-way merge, preserves admin edits):
  base  = local MADRE at BASE_COMMIT (before our recent roster work)
  cur   = current local MADRE (all our intended edits)
  live  = portal_madre_document.document fetched from Supabase (admin-folded)

  For every (staffKey, sessionDate) where cur differs from base (i.e. WE changed
  it), write cur's slots into live. Days we did NOT touch are left untouched, so
  admin fold-back edits elsewhere are preserved. Missing weeks (e.g. 20/27 Jul)
  are appended wholesale from cur.

  A backup of the live document is written before any change, and the row is
  updated with revision+1 (the fold Edge Function is incremental, so this
  survives future admin folds).

Requires local-secrets/secrets.env with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.

Usage (repo root):
  python database/roster_review/reconcile_live_madre_from_local.py          # dry-run report
  python database/roster_review/reconcile_live_madre_from_local.py --write   # apply
"""
from __future__ import annotations

import copy
import datetime
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SECRETS = ROOT / "local-secrets" / "secrets.env"
BACKUP_DIR = Path(__file__).resolve().parent
TERM_KEY = "summer-2026"
BASE_COMMIT = "48d823ae04f6b1b9c9d1f3be4dc8b142d7a5d651"  # 2026-06-23, before recent roster work


def env(key: str) -> str:
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"Missing {key} in {SECRETS}")


def slots_json(day: dict) -> str:
    return json.dumps(day.get("slots"), sort_keys=True, ensure_ascii=False)


def day_index(doc: dict) -> dict:
    out = {}
    for wk in doc.get("weeks", []):
        for st in wk.get("staff", []):
            for d in st.get("days", []):
                out[(st["staffKey"], d["sessionDate"])] = d
    return out


def find_week(doc: dict, iso: str):
    for wk in doc["weeks"]:
        if wk.get("start") and wk.get("end") and wk["start"] <= iso <= wk["end"]:
            return wk
    return None


def find_staff(wk: dict, staff_key: str):
    for st in wk.get("staff", []):
        if st["staffKey"] == staff_key:
            return st
    return None


def cur_staff_meta(cur: dict, staff_key: str, iso: str):
    for wk in cur["weeks"]:
        if wk.get("start") and wk.get("end") and wk["start"] <= iso <= wk["end"]:
            for st in wk.get("staff", []):
                if st["staffKey"] == staff_key:
                    return st
    for wk in cur["weeks"]:
        for st in wk.get("staff", []):
            if st["staffKey"] == staff_key:
                return st
    return None


def main() -> None:
    write = "--write" in sys.argv
    url = env("SUPABASE_URL").rstrip("/")
    key = env("SUPABASE_SERVICE_ROLE_KEY")

    base = json.loads(
        subprocess.check_output(
            ["git", "show", f"{BASE_COMMIT}:working_ui/portal/roster_term_master.json"],
            cwd=str(ROOT),
        )
    )
    cur = json.loads(MADRE.read_text(encoding="utf-8"))

    q = (
        f"{url}/rest/v1/portal_madre_document?term_key=eq.{TERM_KEY}"
        "&select=document,revision,updated_at"
    )
    req = urllib.request.Request(q, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    rows = json.loads(urllib.request.urlopen(req, timeout=90).read())
    if not rows:
        raise SystemExit("No live portal_madre_document row for summer-2026")
    live = rows[0]["document"]
    live_rev = rows[0]["revision"]
    print(f"Live revision {live_rev} updated_at {rows[0].get('updated_at')}")

    # Backup before touching anything
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = BACKUP_DIR / f"live_madre_backup_{ts}.json"
    backup.write_text(json.dumps(rows[0], ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Backup written: {backup.relative_to(ROOT)}")

    base_idx = day_index(base)
    cur_idx = day_index(cur)
    live_idx_before = day_index(live)

    changed = [
        k
        for k, day in cur_idx.items()
        if base_idx.get(k) is None or slots_json(base_idx[k]) != slots_json(day)
    ]

    # Append weeks present in cur but missing in live (e.g. 20/27 Jul)
    live_starts = {wk.get("start") for wk in live["weeks"]}
    max_wn = max([wk.get("weekNum") or 0 for wk in live["weeks"]] or [0])
    for wk in cur["weeks"]:
        if wk.get("start") and wk["start"] not in live_starts:
            nw = copy.deepcopy(wk)
            max_wn += 1
            nw["weekNum"] = max_wn
            live["weeks"].append(nw)
            print(f"  + added week {nw['start']}..{nw['end']} (weekNum {max_wn}, staff {len(nw.get('staff', []))})")

    applied = {"replaced": 0, "added_day": 0, "added_staff": 0, "no_week": 0}
    safe, conflict, already = [], [], []
    for k in changed:
        sk, ds = k
        b = base_idx.get(k)
        lb = live_idx_before.get(k)
        if lb is None:
            classification = safe  # live had nothing here
        elif b is not None and slots_json(lb) == slots_json(b):
            classification = safe  # live untouched since base
        elif slots_json(lb) == slots_json(cur_idx[k]):
            classification = already
        else:
            classification = conflict
        classification.append(k)

        wk = find_week(live, ds)
        if wk is None:
            applied["no_week"] += 1
            continue
        st = find_staff(wk, sk)
        if st is None:
            meta = cur_staff_meta(cur, sk, ds) or {}
            st = {
                "staffKey": sk,
                "staffName": meta.get("staffName", sk),
                "venues": copy.deepcopy(meta.get("venues", [])),
                "days": [],
            }
            wk["staff"].append(st)
            applied["added_staff"] += 1
        tgt = next((d for d in st["days"] if d["sessionDate"] == ds), None)
        src = cur_idx[k]
        if tgt is None:
            st["days"].append(copy.deepcopy(src))
            applied["added_day"] += 1
        else:
            tgt["slots"] = copy.deepcopy(src["slots"])
            tgt["weekday"] = src.get("weekday", tgt.get("weekday"))
            applied["replaced"] += 1

    print(
        f"\nChanged staff-days: {len(changed)} | safe(live==base/absent): {len(safe)} "
        f"| already-match: {len(already)} | CONFLICT(admin-differs): {len(conflict)}"
    )
    print(f"apply -> {applied}")
    if conflict:
        print("\nCONFLICT days (our version applied; verify no live admin cover was lost):")
        for k in sorted(conflict):
            print("   ", k[0], k[1])

    # verify Bismark today
    v = day_index(live).get(("bismark", "2026-07-05"))
    print(
        "\nBismark 2026-07-05 after merge:",
        [(s.get("area"), s.get("service")) for s in (v.get("slots") if v else [])] or "NONE",
    )

    if not write:
        print("\nDRY-RUN only. Re-run with --write to apply.")
        return

    live.setdefault("meta", {})
    live["meta"]["schemaVersion"] = 2
    live["meta"]["lastManualReconcileAt"] = datetime.datetime.now(
        datetime.timezone.utc
    ).isoformat()
    live["meta"]["lastManualReconcileNote"] = (
        "reconcile_live_madre_from_local.py: applied local roster edits (3-way vs "
        f"{BASE_COMMIT[:8]})"
    )

    payload = {
        "document": live,
        "revision": int(live_rev) + 1,
        "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    patch = urllib.request.Request(
        f"{url}/rest/v1/portal_madre_document?term_key=eq.{TERM_KEY}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="PATCH",
    )
    with urllib.request.urlopen(patch, timeout=120) as res:
        body = res.read().decode("utf-8")
    print(f"\nWROTE live MADRE. New revision {int(live_rev) + 1}.")
    print(body[:200])


if __name__ == "__main__":
    main()
