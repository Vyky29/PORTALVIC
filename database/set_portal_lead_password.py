#!/usr/bin/env python3
"""
Set password for programme leads (or any email) via Supabase Admin API.

Uses GET /auth/v1/admin/users?filter=<email> — does NOT paginate the full user list
(works when list-all returns HTTP 500).

  $env:SUPABASE_URL="https://cklpnwhlqsulpmkipmqb.supabase.co"
  $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."   # Project Settings → API → service_role
  $env:PORTAL_LEAD_PASSWORD="121212"
  python database/set_portal_lead_password.py b.traperocasado@gmail.com johnnyosti37@gmail.com

Minimum password length: Authentication → Providers → Email (6 chars OK for 121212).
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_EMAILS = (
    "b.traperocasado@gmail.com",
    "johnnyosti37@gmail.com",
)


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


def find_user_by_email(base: str, service_key: str, email: str) -> dict[str, Any] | None:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    q = urllib.parse.urlencode({"filter": email})
    url = f"{base.rstrip('/')}/auth/v1/admin/users?{q}"
    status, body = _req("GET", url, headers)
    if status != 200:
        raise RuntimeError(f"Lookup {email} failed HTTP {status}: {body}")
    users = (body or {}).get("users") if isinstance(body, dict) else None
    if not users:
        return None
    el = email.strip().lower()
    for u in users:
        if str(u.get("email") or "").strip().lower() == el:
            return u
    return users[0] if len(users) == 1 else None


def set_password(base: str, service_key: str, uid: str, password: str) -> None:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    url = f"{base.rstrip('/')}/auth/v1/admin/users/{uid}"
    status, body = _req(
        "PUT",
        url,
        headers,
        {"password": password, "email_confirm": True},
    )
    if status not in (200, 204):
        status, body = _req(
            "PATCH",
            url,
            headers,
            {"password": password, "email_confirm": True},
        )
    if status not in (200, 204):
        raise RuntimeError(f"Password update failed HTTP {status}: {body}")


def main() -> int:
    base = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    password = os.environ.get("PORTAL_LEAD_PASSWORD", "121212")
    emails = [a.strip() for a in sys.argv[1:] if a.strip()] or list(DEFAULT_EMAILS)

    if not base or not service_key:
        print(
            "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service_role secret).\n"
            "Example:\n"
            '  $env:SUPABASE_URL="https://cklpnwhlqsulpmkipmqb.supabase.co"\n'
            '  $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."\n'
            "  python database/set_portal_lead_password.py",
            file=sys.stderr,
        )
        return 1

    failed = 0
    for email in emails:
        try:
            u = find_user_by_email(base, service_key, email)
        except RuntimeError as e:
            print(f"  FAIL lookup  →  {email}: {e}")
            failed += 1
            continue
        if not u:
            print(
                f"  FAIL missing →  {email} (not in Auth). "
                "Run database/migrations/20260527120000_portal_lead_berta_auth_repair.sql"
            )
            failed += 1
            continue
        uid = u.get("id")
        if not uid:
            print(f"  FAIL no id    →  {email}")
            failed += 1
            continue
        try:
            set_password(base, service_key, str(uid), password)
            print(f"  OK password   →  {email} (id {uid})")
        except RuntimeError as e:
            print(f"  FAIL password →  {email}: {e}")
            failed += 1

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
