#!/usr/bin/env python3
"""
Create or update password for Portal executive Auth users (@clubsensational.org only).

  set SUPABASE_URL=https://cklpnwhlqsulpmkipmqb.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=eyJ...
  set PORTAL_EXECUTIVE_PASSWORD=YourSecurePassword
  python database/provision_corporate_auth_users.py

Does NOT create info@ (alias in browser) or admin@ (mail From only).
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any

EXECUTIVE_EMAILS = [
    "victor@clubsensational.org",
    "javier@clubsensational.org",
    "raul@clubsensational.org",
    "sevitha@clubsensational.org",
]


def _req(
    method: str,
    url: str,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers = {**headers, "Content-Type": "application/json"}
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(r, context=ctx, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw
        return e.code, parsed


def list_users(base: str, key: str) -> list[dict[str, Any]]:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    out: list[dict[str, Any]] = []
    page = 1
    while True:
        url = f"{base.rstrip('/')}/auth/v1/admin/users?page={page}&per_page=200"
        status, body = _req("GET", url, headers)
        if status != 200:
            raise RuntimeError(f"List users HTTP {status}: {body}")
        users = (body or {}).get("users") if isinstance(body, dict) else None
        if not users:
            break
        out.extend(users)
        if len(users) < 200:
            break
        page += 1
    return out


def upsert_user(base: str, key: str, email: str, password: str) -> str:
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    by_email = {str(u.get("email", "")).lower(): u for u in list_users(base, key)}
    low = email.lower()
    if low in by_email:
        uid = by_email[low]["id"]
        url = f"{base.rstrip('/')}/auth/v1/admin/users/{uid}"
        status, body = _req(
            "PUT",
            url,
            headers,
            {"password": password, "email_confirm": True},
        )
        if status not in (200, 201):
            return f"UPDATE FAIL {status}: {body}"
        return "updated"
    url = f"{base.rstrip('/')}/auth/v1/admin/users"
    status, body = _req(
        "POST",
        url,
        headers,
        {
            "email": email,
            "password": password,
            "email_confirm": True,
        },
    )
    if status not in (200, 201):
        return f"CREATE FAIL {status}: {body}"
    return "created"


def main() -> int:
    base = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    password = os.environ.get("PORTAL_EXECUTIVE_PASSWORD", "").strip()
    if not base or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        return 1
    if not password or len(password) < 6:
        print("Set PORTAL_EXECUTIVE_PASSWORD (min 6 chars, match Auth provider rules).")
        return 1

    failed = 0
    for email in EXECUTIVE_EMAILS:
        result = upsert_user(base, key, email, password)
        print(f"{email}\t{result}")
        if "FAIL" in result:
            failed += 1

    print("\nThen run SQL: supabase/migrations/20260618120000_portal_five_corporate_emails.sql")
    print("Login alias: info@clubsensational.org uses same password as sevitha@")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
