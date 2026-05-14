#!/usr/bin/env python3
"""
Create (if missing) or update password for every portal staff Auth user
(emails stf001…stf020 @staff.import.pending, same list as auth-map.js / SQL seeds).

Run locally once — requires the Supabase SERVICE ROLE key (never ship this to the browser).

  set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=eyJ...
  python database/provision_staff_auth_users.py

Optional:
  set PORTAL_STAFF_BOOTSTRAP_PASSWORD=990099
  set PORTAL_STAFF_ONLY_EMAIL=stf010@staff.import.pending
    (comma-separated; only those placeholder emails are created/updated — rest unchanged)

If the API rejects the password, open Supabase → Authentication → Providers → Email
and lower "Minimum password length" so it allows your bootstrap password (default 990099 = 6 chars).
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any

# Same emails as database/supabase_update_test_passwords.sql (stf016 unused).
STAFF_PLACEHOLDER_EMAILS = [
    "stf001@staff.import.pending",
    "stf002@staff.import.pending",
    "stf003@staff.import.pending",
    "stf004@staff.import.pending",
    "stf005@staff.import.pending",
    "stf006@staff.import.pending",
    "stf007@staff.import.pending",
    "stf008@staff.import.pending",
    "stf009@staff.import.pending",
    "stf010@staff.import.pending",
    "stf011@staff.import.pending",
    "stf012@staff.import.pending",
    "stf013@staff.import.pending",
    "stf014@staff.import.pending",
    "stf015@staff.import.pending",
    "stf017@staff.import.pending",
    "stf018@staff.import.pending",
    "stf019@staff.import.pending",
    "stf020@staff.import.pending",
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


def list_all_auth_users(base: str, service_key: str) -> list[dict[str, Any]]:
    """Paginate GET /auth/v1/admin/users."""
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    out: list[dict[str, Any]] = []
    page = 1
    per_page = 200
    while True:
        url = f"{base.rstrip('/')}/auth/v1/admin/users?page={page}&per_page={per_page}"
        status, body = _req("GET", url, headers)
        if status != 200:
            raise RuntimeError(f"List users failed HTTP {status}: {body}")
        users = (body or {}).get("users") if isinstance(body, dict) else None
        if not users:
            break
        out.extend(users)
        if len(users) < per_page:
            break
        page += 1
    return out


def main() -> int:
    base = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    password = os.environ.get("PORTAL_STAFF_BOOTSTRAP_PASSWORD", "990099")
    only_raw = os.environ.get("PORTAL_STAFF_ONLY_EMAIL", "").strip()
    allowed = {e.lower() for e in STAFF_PLACEHOLDER_EMAILS}
    if only_raw:
        wanted = {
            p.strip().lower()
            for p in only_raw.replace(";", ",").split(",")
            if p.strip()
        }
        unknown = wanted - allowed
        if unknown:
            print(
                "PORTAL_STAFF_ONLY_EMAIL contains unknown address(es): "
                + ", ".join(sorted(unknown)),
                file=sys.stderr,
            )
            return 1
        emails_to_process = [e for e in STAFF_PLACEHOLDER_EMAILS if e.lower() in wanted]
        if not emails_to_process:
            print("PORTAL_STAFF_ONLY_EMAIL matched no staff placeholder emails.", file=sys.stderr)
            return 1
    else:
        emails_to_process = list(STAFF_PLACEHOLDER_EMAILS)

    if not base or not service_key:
        print(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n"
            "Dashboard → Project Settings → API → Project URL + service_role secret.\n"
            "Example (PowerShell):\n"
            '  $env:SUPABASE_URL="https://xxxxx.supabase.co"\n'
            '  $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."\n'
            "  python database/provision_staff_auth_users.py",
            file=sys.stderr,
        )
        return 1

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }

    print("Fetching existing Auth users…")
    existing = list_all_auth_users(base, service_key)
    by_email = {
        str(u.get("email") or "").strip().lower(): u
        for u in existing
        if u.get("email")
    }

    created = 0
    updated = 0
    failed = 0

    for email in emails_to_process:
        el = email.lower()
        u = by_email.get(el)
        if u:
            uid = u.get("id")
            if not uid:
                print(f"  SKIP {email}: user row has no id")
                failed += 1
                continue
            url = f"{base}/auth/v1/admin/users/{uid}"
            status, body = _req(
                "PATCH",
                url,
                headers,
                {"password": password, "email_confirm": True},
            )
            if status in (200, 204):
                print(f"  OK update password  →  {email}")
                updated += 1
            else:
                print(f"  FAIL update {email} HTTP {status}: {body}")
                failed += 1
            continue

        url = f"{base}/auth/v1/admin/users"
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
        if status in (200, 201):
            print(f"  OK create user       →  {email}")
            created += 1
            if isinstance(body, dict) and body.get("id"):
                by_email[el] = body
        else:
            print(f"  FAIL create {email} HTTP {status}: {body}")
            failed += 1

    print(f"\nDone. created={created} password_reset={updated} failed={failed}")
    if failed:
        print(
            "\nIf failures mention weak password, lower minimum password length in "
            "Authentication → Providers → Email, or set PORTAL_STAFF_BOOTSTRAP_PASSWORD "
            "to a longer value.",
            file=sys.stderr,
        )
        return 1
    print(
        "\nNext: ensure public.staff_profiles has a row per user "
        "(run database/staff_profiles_seed.sql in SQL Editor if you have not).",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
