#!/usr/bin/env python3
"""
Test Portal admin/CEO corporate logins against Supabase Auth (anon API).

  set SUPABASE_URL=https://cklpnwhlqsulpmkipmqb.supabase.co
  set SUPABASE_ANON_KEY=eyJ...anon...
  set PORTAL_TEST_PASSWORD=your-password-here
  python database/validate_portal_admin_logins.py

Optional: PORTAL_TEST_EMAILS=victor@clubsensational.org,raul@clubsensational.org
"""

from __future__ import annotations

import json
import os
import ssl
import urllib.error
import urllib.request

DEFAULT_EMAILS = [
    "victor@clubsensational.org",
    "raul@clubsensational.org",
    "javier@clubsensational.org",
    "javier@clbusensational.org",
    "sevitha@clubsensational.org",
    "info@clubsensational.org",
]


def sign_in(base: str, anon: str, email: str, password: str) -> tuple[bool, str]:
    url = f"{base.rstrip('/')}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": email, "password": password}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"apikey": anon, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as resp:
            if resp.status == 200:
                return True, "OK"
            return False, f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            msg = json.loads(raw).get("error_description") or json.loads(raw).get("msg") or raw
        except json.JSONDecodeError:
            msg = raw or str(e)
        return False, str(msg)
    except Exception as e:
        return False, str(e)


def main() -> int:
    base = os.environ.get("SUPABASE_URL", "https://cklpnwhlqsulpmkipmqb.supabase.co").strip()
    anon = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    password = os.environ.get("PORTAL_TEST_PASSWORD", "").strip()
    emails_raw = os.environ.get("PORTAL_TEST_EMAILS", "").strip()
    emails = (
        [e.strip() for e in emails_raw.replace(";", ",").split(",") if e.strip()]
        if emails_raw
        else DEFAULT_EMAILS
    )

    if not anon:
        print("Set SUPABASE_ANON_KEY (Dashboard → Settings → API → anon public).")
        return 1
    if not password:
        print("Set PORTAL_TEST_PASSWORD to the Supabase Auth password to test.")
        return 1

    ok_n = 0
    for email in emails:
        ok, detail = sign_in(base, anon, email, password)
        status = "PASS" if ok else "FAIL"
        print(f"{status}\t{email}\t{detail}")
        if ok:
            ok_n += 1

    print(f"\n{ok_n}/{len(emails)} passed.")
    return 0 if ok_n else 2


if __name__ == "__main__":
    raise SystemExit(main())
