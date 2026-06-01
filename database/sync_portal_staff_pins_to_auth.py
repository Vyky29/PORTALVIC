#!/usr/bin/env python3
"""
Sync Supabase Auth passwords from public.portal_login_pins (staff portal roster)
for every active staff_profiles row, except executives/leads who keep email + 6-digit passwords.

Requires service role (never in browser):
  set SUPABASE_URL=https://cklpnwhlqsulpmkipmqb.supabase.co
  set SUPABASE_SERVICE_ROLE_KEY=eyJ...
  python database/sync_portal_staff_pins_to_auth.py

Optional:
  set SUPABASE_ANON_KEY=eyJ...   (validate logins after sync)
  set PORTAL_PIN_SYNC_DRY_RUN=1  (print plan only)

Exempt (never change password):
  Victor, Raul, Javier Arranz (CEO), Sevitha, Michelle, Berta, John
"""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import unicodedata
import urllib.error
import urllib.request
from typing import Any

BASE_DEFAULT = "https://cklpnwhlqsulpmkipmqb.supabase.co"

# portal_login_pins.name (staff) → staff_profiles match key (username preferred).
PIN_NAME_TO_LOGIN_KEY: dict[str, str] = {
    "Alex Stone": "Alex",
    "Angel Falceto": "Angel",
    "Aurora Garcia": "Aurora",
    "Dan Clarke": "Dan",
    "Bismark Gyan": "Bismark",
    "Carlos Herrero": "Carlos",
    "Javier Marquez": "Javier",
    "Roberto Reali": "Roberto",
    "Youssef Moustafa": "Youssef",
    "Giuseppe Morelli": "Giuseppe",
    "Simon Griffiths": "Simon",
    "Luliya": "Luliya",
    "Godsway Yatofo": "Godsway",
    "Sandra Bartolome": "Sandra",
}

# Names in portal_login_pins that are NOT individual staff auth accounts.
PIN_SKIP_NAMES = {
    "Berta Trapero Casado",
    "John Kyei-Fram",
    "Michelle",
    "Raul",
    "Sevitha",
    "Javier Arranz Escorial",
    "Victor",
    "Admin",
}

# Auth emails that keep existing 6-digit / email login (case-insensitive).
EXEMPT_AUTH_EMAILS = {
    "victor@clubsensational.org",
    "raul@clubsensational.org",
    "javier@clubsensational.org",
    "javi@clubsensational.org",
    "sevitha@clubsensational.org",
    "sevitha802@gmail.com",
    "info@clubsensational.org",
    "michelle@youtimecounselling.com",
    "b.traperocasado@gmail.com",
    "johnnyosti37@gmail.com",
}

# Validate exempt accounts with these passwords (name → password for sign-in test).
EXEMPT_LOGIN_TESTS: list[tuple[str, str, str]] = [
    ("Victor", "victor@clubsensational.org", "121212"),
    ("Raul", "raul@clubsensational.org", "121212"),
    ("Javi", "javier@clubsensational.org", "121212"),
    ("Sevitha", "sevitha802@gmail.com", "121212"),
    ("Sevitha info@", "info@clubsensational.org", "121212"),
    ("Michelle", "michelle@youtimecounselling.com", "555555"),
    ("Berta", "b.traperocasado@gmail.com", "121212"),
    ("John", "johnnyosti37@gmail.com", "121212"),
]

# First-name login aliases (login.html / auth-map.js).
LOGIN_ALIASES: dict[str, str] = {
    "Simon": "simon",
    "Luliya": "luliya",
    "Andres": "andres",
}


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


def rest_get(base: str, service_key: str, path: str, query: str = "") -> list[dict[str, Any]]:
    url = f"{base.rstrip('/')}/rest/v1/{path}{query}"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    status, body = _req("GET", url, headers)
    if status != 200:
        raise RuntimeError(f"GET {path} failed HTTP {status}: {body}")
    return body if isinstance(body, list) else []


def list_auth_users(base: str, service_key: str) -> dict[str, dict[str, Any]]:
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    out: dict[str, dict[str, Any]] = {}
    page = 1
    while True:
        url = f"{base.rstrip('/')}/auth/v1/admin/users?page={page}&per_page=200"
        status, body = _req("GET", url, headers)
        if status != 200:
            raise RuntimeError(f"List users failed HTTP {status}: {body}")
        users = (body or {}).get("users") if isinstance(body, dict) else None
        if not users:
            break
        for u in users:
            email = str(u.get("email") or "").strip().lower()
            if email:
                out[email] = u
        if len(users) < 200:
            break
        page += 1
    return out


def set_password(base: str, service_key: str, user_id: str, password: str) -> tuple[bool, str]:
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    url = f"{base.rstrip('/')}/auth/v1/admin/users/{user_id}"
    status, body = _req("PATCH", url, headers, {"password": password, "email_confirm": True})
    if status in (200, 204):
        return True, "OK"
    return False, str(body)


def sign_in(base: str, anon: str, email: str, password: str) -> tuple[bool, str]:
    url = f"{base.rstrip('/')}/auth/v1/token?grant_type=password"
    status, body = _req(
        "POST",
        url,
        {"apikey": anon, "Content-Type": "application/json"},
        {"email": email, "password": password},
    )
    if status == 200:
        return True, "OK"
    if isinstance(body, dict):
        return False, str(body.get("error_description") or body.get("msg") or body)
    return False, str(body)


def norm_key(s: str) -> str:
    t = unicodedata.normalize("NFD", str(s or "").strip())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return t.lower()


def profile_lookup(profiles: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_username: dict[str, dict[str, Any]] = {}
    by_full: dict[str, dict[str, Any]] = {}
    for p in profiles:
        un = str(p.get("username") or "").strip()
        fn = str(p.get("full_name") or "").strip()
        if un:
            by_username[norm_key(un)] = p
        if fn:
            by_full[norm_key(fn)] = p
    return {"username": by_username, "full_name": by_full}


def resolve_profile(
    pin_name: str,
    lookup: dict[str, dict[str, dict[str, Any]]],
) -> dict[str, Any] | None:
    if pin_name in PIN_NAME_TO_LOGIN_KEY:
        key = norm_key(PIN_NAME_TO_LOGIN_KEY[pin_name])
        return lookup["username"].get(key)
    key_full = norm_key(pin_name)
    if key_full in lookup["full_name"]:
        return lookup["full_name"][key_full]
    first = norm_key(pin_name.split()[0] if pin_name else "")
    return lookup["username"].get(first)


def main() -> int:
    base = os.environ.get("SUPABASE_URL", BASE_DEFAULT).strip().rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    anon = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    dry = os.environ.get("PORTAL_PIN_SYNC_DRY_RUN", "").strip() in ("1", "true", "yes")

    if not service_key:
        print(
            "Missing SUPABASE_SERVICE_ROLE_KEY.\n"
            "Dashboard → Project Settings → API → service_role (secret).\n"
            "PowerShell:\n"
            '  $env:SUPABASE_URL="https://cklpnwhlqsulpmkipmqb.supabase.co"\n'
            '  $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."\n'
            "  python database/sync_portal_staff_pins_to_auth.py",
            file=sys.stderr,
        )
        return 1

    print("Loading portal_login_pins (staff)…")
    pins = rest_get(
        base,
        service_key,
        "portal_login_pins",
        "?portal=eq.staff&select=name,pin,display_order&order=display_order",
    )
    print(f"Loading staff_profiles…")
    profiles = rest_get(
        base,
        service_key,
        "staff_profiles",
        "?select=id,username,full_name,app_role,is_active&is_active=eq.true",
    )
    lookup = profile_lookup(profiles)

    print("Resolving auth user ids from staff_profiles…")
    profile_ids = {str(p["id"]) for p in profiles if p.get("id")}

    planned: list[tuple[str, str, str, str, str]] = []
    skipped: list[str] = []
    missing: list[str] = []

    for row in pins:
        pin_name = str(row.get("name") or "").strip()
        pin = str(row.get("pin") or "").strip()
        if not pin_name or not pin:
            continue
        if pin_name in PIN_SKIP_NAMES:
            skipped.append(f"SKIP exempt/generic  {pin_name}")
            continue
        if not re.fullmatch(r"\d{4,6}", pin):
            skipped.append(f"SKIP bad pin format  {pin_name} ({pin!r})")
            continue

        prof = resolve_profile(pin_name, lookup)
        if not prof:
            missing.append(f"NO PROFILE  {pin_name}  pin={pin}")
            continue

        uid = str(prof.get("id") or "")
        if not uid:
            missing.append(f"NO AUTH USER  {pin_name}  profile={prof.get('username')}")
            continue

        # Resolve email via admin API (single user; avoids paginating all auth users).
        headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        status, user_body = _req("GET", f"{base}/auth/v1/admin/users/{uid}", headers)
        email = ""
        if status == 200 and isinstance(user_body, dict):
            email = str(user_body.get("email") or "").strip()
        if not email:
            missing.append(f"NO AUTH EMAIL  {pin_name}  id={uid}")
            continue
        if email.lower() in EXEMPT_AUTH_EMAILS:
            skipped.append(f"SKIP exempt email  {pin_name} → {email}")
            continue

        login_name = str(prof.get("username") or pin_name.split()[0]).strip()
        planned.append((login_name, email, pin, pin_name, uid))

    # Active staff with profile but no PIN row (informational).
    pinned_usernames = {norm_key(p[0]) for p in planned}
    for p in profiles:
        un = str(p.get("username") or "").strip()
        nk = norm_key(un)
        if nk in {norm_key(x) for x in PIN_SKIP_NAMES}:
            continue
        if nk in {"teflon", "arranz"}:
            continue
        if nk not in pinned_usernames and p.get("app_role") == "staff":
            uid = str(p.get("id") or "")
            missing.append(f"NO PIN ROW  {p.get('full_name')} ({un})  id={uid}")

    print("\n--- Plan ---")
    for login_name, email, pin, pin_name, uid in planned:
        print(f"  SET  {login_name:12}  {email:40}  pin={pin}  ({pin_name})")
    for line in skipped:
        print(f"  {line}")
    for line in missing:
        print(f"  WARN {line}")

    if dry:
        print("\nDRY RUN — no passwords changed.")
        return 0

    ok_n = 0
    fail_n = 0
    print("\n--- Applying ---")
    for login_name, email, pin, pin_name, uid in planned:
        ok, detail = set_password(base, service_key, uid, pin)
        if ok:
            print(f"  OK   {login_name} → pin {pin}")
            ok_n += 1
        else:
            print(f"  FAIL {login_name}: {detail}")
            fail_n += 1

    print(f"\nSync done. updated={ok_n} failed={fail_n}")

    if not anon:
        print("\nSet SUPABASE_ANON_KEY to run login validation.")
        return 0 if fail_n == 0 else 1

    print("\n--- Validate PIN logins (first name + pin) ---")
    pin_fails = 0
    for login_name, email, pin, _pin_name, _uid in planned:
        ok, detail = sign_in(base, anon, email, pin)
        status = "PASS" if ok else "FAIL"
        print(f"  {status}  {login_name:12}  {detail}")
        if not ok:
            pin_fails += 1

    print("\n--- Validate exempt email logins (unchanged) ---")
    exempt_fails = 0
    for label, email, password in EXEMPT_LOGIN_TESTS:
        ok, detail = sign_in(base, anon, email, password)
        status = "PASS" if ok else "FAIL"
        print(f"  {status}  {label:14}  {email}  {detail}")
        if not ok:
            exempt_fails += 1

    total_fails = fail_n + pin_fails + exempt_fails
    print(
        f"\nValidation: pin={len(planned) - pin_fails}/{len(planned)}  "
        f"exempt={len(EXEMPT_LOGIN_TESTS) - exempt_fails}/{len(EXEMPT_LOGIN_TESTS)}"
    )
    return 0 if total_fails == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
