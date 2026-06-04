#!/usr/bin/env python3
"""Validate all staff PIN + exempt logins."""
import json, ssl, urllib.request, urllib.error

BASE = "https://cklpnwhlqsulpmkipmqb.supabase.co"
ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrbHBud2hscXN1bHBta2lwbXFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMDg4NzIsImV4cCI6MjA5MTc4NDg3Mn0.-T7rVyDHQbzMqEKOVz6fi3OlZdB_gPH2i5p-ZPveopE"

STAFF = [
    ("Alex", "stf015@staff.import.pending", "4827"),
    ("Angel", "stf004@staff.import.pending", "7264"),
    ("Aurora", "stf011@staff.import.pending", "5183"),
    ("Dan", "stf003@staff.import.pending", "9027"),
    ("Bismark", "stf007@staff.import.pending", "6398"),
    ("Carlos", "stf014@staff.import.pending", "6815"),
    ("Javier M.", "stf010@staff.import.pending", "1750"),
    ("Roberto", "stf002@staff.import.pending", "4592"),
    ("Youssef", "stf005@staff.import.pending", "8163"),
    ("Giuseppe", "stf008@staff.import.pending", "3074"),
    ("Simon", "stf016@staff.import.pending", "7421"),
    ("Luliya", "stf021@staff.import.pending", "5836"),
    ("Godsway", "stf009@staff.import.pending", "9268"),
    ("Sandra", "stf001@staff.import.pending", "2497"),
]
EXEMPT = [
    ("Victor", "victor@clubsensational.org", "121212"),
    ("Raul", "raul@clubsensational.org", "121212"),
    ("Javi CEO", "javier@clubsensational.org", "121212"),
    ("Sevitha", "sevitha@clubsensational.org", "121212"),
    ("Michelle", "michelle@youtimecounselling.com", "555555"),
    ("Berta", "b.traperocasado@gmail.com", "121212"),
    ("John", "johnnyosti37@gmail.com", "121212"),
]

def sign_in(email, password):
    url = f"{BASE}/auth/v1/token?grant_type=password"
    body = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(url, data=body, headers={"apikey": ANON, "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=30) as r:
            return True, "OK"
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            msg = json.loads(raw).get("error_description") or json.loads(raw).get("msg") or raw
        except Exception:
            msg = raw
        return False, str(msg)

print("=== Staff (nombre + PIN) ===")
s_ok = 0
for label, email, pw in STAFF:
    ok, detail = sign_in(email, pw)
    print(f"{'PASS' if ok else 'FAIL'}\t{label}\t{detail}")
    s_ok += ok
print(f"\nStaff: {s_ok}/{len(STAFF)}")

print("\n=== Exentos (email + 6 dígitos) ===")
e_ok = 0
for label, email, pw in EXEMPT:
    ok, detail = sign_in(email, pw)
    print(f"{'PASS' if ok else 'FAIL'}\t{label}\t{detail}")
    e_ok += ok
print(f"\nExempt: {e_ok}/{len(EXEMPT)}")
