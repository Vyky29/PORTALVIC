#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Upload roster_term_master.json → portal_madre_document (live MADRE in Supabase).

Requires env:
  SUPABASE_URL=https://cklpnwhlqsulpmkipmqb.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=...

  python database/roster_review/seed_portal_madre_document.py
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
TERM_KEY = "summer-2026"


def main() -> None:
    url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

    if not MADRE.is_file():
        raise SystemExit(f"Missing {MADRE}")

    doc = json.loads(MADRE.read_text(encoding="utf-8"))
    doc.setdefault("meta", {})
    doc["meta"]["schemaVersion"] = 2
    doc["meta"]["seededAt"] = __import__("datetime").datetime.now(
        __import__("datetime").timezone.utc
    ).isoformat()

    payload = {
        "term_key": TERM_KEY,
        "schema_version": 2,
        "revision": 0,
        "document": doc,
        "updated_at": doc["meta"]["seededAt"],
    }

    req = urllib.request.Request(
        f"{url}/rest/v1/portal_madre_document?on_conflict=term_key",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            body = res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Supabase seed failed {e.code}: {e.read().decode()[:500]}") from e

    print(f"Seeded portal_madre_document term_key={TERM_KEY}")
    print(body[:200] if body else "ok")


if __name__ == "__main__":
    main()
