#!/usr/bin/env python3
"""Merge new sevitha@ Auth user into existing Sevitha profile (keeps DM/history FKs)."""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any

OLD_ID = "d365ab5c-e190-461a-a390-31e54b0b066f"
NEW_ID = "15ee7f52-5a5f-478b-914b-eab3e559c346"
TARGET_EMAIL = "sevitha@clubsensational.org"


def _req(method: str, url: str, headers: dict[str, str], body: dict[str, Any] | None = None) -> tuple[int, Any]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    if body is not None:
        headers = {**headers, "Content-Type": "application/json"}
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, context=ssl.create_default_context(), timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return e.code, raw


def main() -> int:
    base = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    password = os.environ.get("PORTAL_EXECUTIVE_PASSWORD", "121212").strip()
    if not base or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        return 1

    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    # Remove duplicate Auth user created today (no staff_profiles / DMs yet).
    url_del = f"{base}/auth/v1/admin/users/{NEW_ID}"
    st, body = _req("DELETE", url_del, headers)
    print(f"delete orphan {NEW_ID}: HTTP {st} {body if st not in (200, 204) else 'OK'}")

    # Canonical Sevitha login email on the profile that already owns chat rows.
    url_put = f"{base}/auth/v1/admin/users/{OLD_ID}"
    st, body = _req(
        "PUT",
        url_put,
        headers,
        {
            "email": TARGET_EMAIL,
            "password": password,
            "email_confirm": True,
        },
    )
    print(f"rename {OLD_ID} -> {TARGET_EMAIL}: HTTP {st}")
    if st not in (200, 201):
        print(body)
        return 1

    print("Done. Run SQL profile upsert block for sevitha@ if needed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
