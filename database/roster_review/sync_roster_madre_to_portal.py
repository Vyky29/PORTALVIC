# -*- coding: utf-8 -*-
"""
Single pipeline: roster_term_master.json (MADRE) → seed, dashboard rows, bundle rows, feedback merges.

  python database/roster_review/sync_roster_madre_to_portal.py

Keeps May dated rows (session_date < 2026-06-01) from the bundle; replaces summer term from MADRE only.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MADRE = ROOT / "working_ui" / "portal" / "roster_term_master.json"
SEED = ROOT / "working_ui" / "portal" / "roster_term_master_seed.json"
BOOT = ROOT / "database" / "roster_review" / "build_roster_term_master_seed_boot.py"
BUILD_JS = ROOT / "working_ui" / "portal" / "build_portal_summer2_roster_feedback.js"
MACHINE_FLOOR = "2026-06-01"

BUNDLE_PATHS = [
    ROOT / "database" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal" / "staff_dashboard_spreadsheet_bundle.js",
    ROOT / "working_ui" / "portal-shared-js" / "staff_dashboard_spreadsheet_bundle.js",
]


def slug(v: str) -> str:
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", (v or "").lower().strip()))


def parse_start_minutes(ts: str) -> int:
    m = re.match(r"(\d{1,2})(?:\.(\d{2}))?", ts or "")
    if not m:
        return 99999
    h = int(m.group(1))
    mn = int(m.group(2) or 0)
    if h <= 6 and "." not in (ts or ""):
        h += 12
    return h * 60 + mn


def service_key(s: str) -> str:
    return slug(s)


def is_aquatic(s: str) -> bool:
    return "aquatic" in (s or "").lower()


def is_multi(s: str) -> bool:
    k = (s or "").lower()
    return "multi" in k and "activity" in k


def is_bespoke(s: str) -> bool:
    k = (s or "").lower()
    return "bespoke" in k


MWF_STAFF_BAND_DAYS = frozenset({"Monday", "Wednesday", "Friday"})
# Participant session times are the source of truth in the bundle.
# These maps are empty — the old staff-band mapping has been removed.
MWF_STAFF_BAND_SLOT_MAP: dict[str, str] = {}
SUNDAY_MA_SLOT_MAP: dict[str, str] = {}

# Reverse-map to undo old staff-band times baked into the seed JSON.
_MWF_REVERSE: dict[str, str] = {
    "4.15 to 6.15": "4.30 to 6",
    "4.15 to 5.15": "4.30 to 5.15",
    "5.15 to 6.15": "5.15 to 6",
}
_SUNDAY_MA_REVERSE: dict[str, str] = {
    "9.15 to 10": "9.30 to 10.15",
    "10 to 10.45": "10.15 to 11",
    "10.45 to 11.30": "11 to 11.45",
    "11.30 to 12.15": "11.45 to 12.30",
    "12.15 to 1": "12.30 to 1.15",
    "1 to 2.15": "1.15 to 2",
}
# Roberto last aquatic block 2.30–3.30 (6.5h Sunday) from this date; before that 2.30–3 (6h).
ROBERTO_SUNDAY_EXTENDED_FROM = "2026-06-28"
ROBERTO_SUNDAY_AQUATIC_LAST_END = "3.30"


def dedupe_adapter_rows(rows: list[dict]) -> list[dict]:
    """MADRE has 7 week blocks — same dated slot must appear once in the bundle."""
    seen: set[tuple] = set()
    out: list[dict] = []
    for r in rows:
        key = (
            clean(r.get("session_date")),
            clean(r.get("day")),
            slug(r.get("client_name")),
            clean(r.get("instructors")).upper(),
            clean(r.get("time_slot")),
            slug(r.get("service")),
            clean(r.get("area")),
            clean(r.get("venue")),
        )
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def patch_term_session_time_slots(seed: dict) -> int:
    """MWF Bespoke/Multi 4.15–6.15; Sunday MA support blocks use participant-facing slots (last 1.15–2)."""
    n = 0
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            staff_key = slug(st.get("staffKey") or "")
            for d in st.get("days", []):
                wd = clean(d.get("weekday"))
                slots = d.get("slots") or []
                for s in slots:
                    svc = clean(s.get("service"))
                    ts = clean(s.get("time_slot"))
                    new_ts = None
                    if wd in MWF_STAFF_BAND_DAYS and (is_bespoke(svc) or is_multi(svc)):
                        new_ts = MWF_STAFF_BAND_SLOT_MAP.get(ts) or _MWF_REVERSE.get(ts)
                    elif wd == "Sunday" and is_multi(svc):
                        new_ts = SUNDAY_MA_SLOT_MAP.get(ts) or _SUNDAY_MA_REVERSE.get(ts)
                    if new_ts and new_ts != ts:
                        s["time_slot"] = new_ts
                        n += 1
                if wd != "Sunday":
                    continue
                if staff_key == "roberto":
                    for s in slots:
                        if clean(s.get("time_slot")) == "2.30 to 3":
                            s["time_slot"] = "2.30 to 3.30"
                            n += 1
    return n


def fix_long_aquatic_overlapping_multi(seed: dict) -> int:
    """9 to 10.15 Aquatic + 9.30 to 10.15 Multi (same client) → 9 to 9.30 Aquatic."""
    n = 0
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            for d in st.get("days", []):
                slots = d.get("slots") or []
                by_client: dict[str, list] = {}
                for s in slots:
                    cn = (s.get("client_name") or "").strip()
                    if not cn or cn.upper() in ("CASA", "MANAGER", "CLOSED", "NO CLIENT", "NO PARTICIPANT"):
                        continue
                    by_client.setdefault(cn, []).append(s)
                for cn, slist in by_client.items():
                    slist.sort(key=lambda x: parse_start_minutes(x.get("time_slot", "")))
                    for i, s in enumerate(slist):
                        ts = clean(s.get("time_slot"))
                        if ts != "9 to 10.15" or not is_aquatic(s.get("service")):
                            continue
                        has_multi = any(
                            clean(o.get("time_slot")) in ("9.30 to 10.15", "9.15 to 10")
                            and is_multi(o.get("service"))
                            for o in slist
                        )
                        if not has_multi:
                            continue
                        s["time_slot"] = "9 to 9.30"
                        if d.get("weekday") == "Sunday" and clean(s.get("venue")) == "SwimFarm":
                            s["area"] = "Small Pool"
                            s["pool_note"] = "Small Pool"
                        n += 1
    return n


def clean(v) -> str:
    return str(v or "").strip()


def normalize_madre_dashboard_client(cn: str, area: str) -> str:
    up = clean(cn).upper()
    area_up = clean(area).upper()
    if up in ("CASA", "HOME") or area_up == "HOME":
        return "HOME"
    if up == "MANAGER":
        return "MANAGER"
    return clean(cn)


def seed_to_adapter_rows(seed: dict) -> list[dict]:
    rows: list[dict] = []
    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            staff_name = clean(st.get("staffName") or st.get("staffKey")).upper()
            for d in st.get("days", []):
                for s in d.get("slots") or []:
                    area = clean(s.get("pool_note") or s.get("area"))
                    cn = normalize_madre_dashboard_client(s.get("client_name"), area)
                    if not cn or cn.upper() in ("CLOSED", "NO CLIENT", "NO PARTICIPANT", "NO_CLIENT"):
                        continue
                    rows.append(
                        {
                            "client_name": cn,
                            "day": d.get("weekday"),
                            "instructors": staff_name,
                            "service": clean(s.get("service")),
                            "area": "HOME" if cn == "HOME" else area,
                            "time_slot": clean(s.get("time_slot")),
                            "venue": clean(s.get("venue") or "SwimFarm"),
                            "session_date": d.get("sessionDate"),
                        }
                    )
    rows.sort(
        key=lambda r: (
            r.get("session_date") or "",
            r.get("time_slot") or "",
            r.get("instructors") or "",
        )
    )
    return rows


def derive_feedback_rules(seed: dict) -> tuple[list[dict], list[dict]]:
    merges: list[dict] = []
    omit: list[dict] = []
    seen: set[tuple] = set()

    for w in seed.get("weeks", []):
        for st in w.get("staff", []):
            staff_name = clean(st.get("staffName") or st.get("staffKey")).upper()
            for d in st.get("days", []):
                wd = clean(d.get("weekday"))
                slots = d.get("slots") or []
                by_client: dict[str, list] = {}
                for s in slots:
                    cn = clean(s.get("client_name"))
                    if not cn or cn.upper() in ("CASA", "MANAGER", "CLOSED", "NO CLIENT", "NO PARTICIPANT"):
                        continue
                    by_client.setdefault(cn, []).append(s)
                for cn, slist in by_client.items():
                    slist.sort(key=lambda x: parse_start_minutes(x.get("time_slot", "")))
                    for i in range(len(slist) - 1):
                        a, b = slist[i], slist[i + 1]
                        if not is_aquatic(a.get("service")) or not is_multi(b.get("service")):
                            continue
                        ia = clean(a.get("instructors") or staff_name).upper()
                        ib = clean(b.get("instructors") or staff_name).upper()
                        if ia != ib:
                            continue
                        key = (wd, slug(cn), ia)
                        if key in seen:
                            continue
                        seen.add(key)
                        merge_key = slug(cn) + "_" + slug(ia.split(",")[0]) + "_" + slug(wd)[:3] + "_swim"
                        merge_slots = [
                            {
                                "time_slot": clean(a.get("time_slot")),
                                "service": clean(a.get("service")),
                            },
                            {
                                "time_slot": clean(b.get("time_slot")),
                                "service": clean(b.get("service")),
                            },
                        ]
                        merges.append(
                            {
                                "day": wd,
                                "client_name": cn,
                                "instructors": ia,
                                "mergeKey": merge_key,
                                "slots": merge_slots,
                            }
                        )
                        omit.append(
                            {
                                "weekday": wd,
                                "client_slug": slug(cn),
                                "time_slot": clean(a.get("time_slot")),
                                "service": clean(a.get("service")),
                            }
                        )
    return merges, omit


def extract_bundle_object(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    m = re.search(r"window\.STAFF_DASHBOARD_SOURCE\s*=\s*(\{)", text)
    if not m:
        raise SystemExit(f"STAFF_DASHBOARD_SOURCE not found in {path}")
    start = m.start(1)
    depth = 0
    i = start
    while i < len(text):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
        i += 1
    raise SystemExit(f"Could not parse bundle JSON in {path}")


def write_bundle(path: Path, obj: dict) -> None:
    body = json.dumps(obj, ensure_ascii=True, indent=2)
    wrapped = (
        "(function () {\n"
        "  // Source consumed by staff_dashboard_spreadsheet_adapter.js\n"
        "  window.STAFF_DASHBOARD_SOURCE = "
        + body
        + ";\n})();\n"
    )
    path.write_text(wrapped, encoding="utf-8")


def patch_bundles(seed: dict, adapter_rows: list[dict], merges: list[dict], omit: list[dict]) -> None:
    for path in BUNDLE_PATHS:
        if not path.exists():
            print(f"Skip missing bundle {path}")
            continue
        obj = extract_bundle_object(path)
        old_rows = obj.get("rows") or []
        pre_may = [
            r
            for r in old_rows
            if clean(r.get("session_date")) and clean(r.get("session_date")) < MACHINE_FLOOR
        ]
        obj["rows"] = pre_may + adapter_rows
        obj["sundayFeedbackMerges"] = merges
        obj["overviewOmitRosterSlots"] = omit
        meta = obj.setdefault("meta", {})
        if isinstance(meta, dict):
            meta["rosterMadreSyncedAt"] = subprocess.check_output(
                ["date", "-u", "+%Y-%m-%dT%H:%M:%SZ"], text=True
            ).strip()
            meta["rosterMadreSource"] = "roster_term_master.json"
        write_bundle(path, obj)
        print(f"Patched bundle {path.relative_to(ROOT)} ({len(obj['rows'])} rows)")


def main() -> None:
    if not MADRE.exists():
        raise SystemExit(f"Missing MADRE file: {MADRE}")

    seed = json.loads(MADRE.read_text(encoding="utf-8"))
    patched = patch_term_session_time_slots(seed)
    fixed = fix_long_aquatic_overlapping_multi(seed)
    merges, omit = derive_feedback_rules(seed)
    adapter_rows = dedupe_adapter_rows(seed_to_adapter_rows(seed))

    SEED.write_text(json.dumps(seed, indent=2), encoding="utf-8")
    MADRE.write_text(json.dumps(seed, indent=2), encoding="utf-8")
    print(f"Patched {patched} term time slots; fixed {fixed} long aquatic slots; wrote MADRE + seed")
    print(f"Feedback merge groups: {len(merges)}; overview omit rules: {len(omit)}")
    print(f"MADRE adapter rows: {len(adapter_rows)}")

    patch_bundles(seed, adapter_rows, merges, omit)

    subprocess.run([sys.executable, str(BOOT)], cwd=str(ROOT), check=True)
    subprocess.run(["node", str(BUILD_JS)], cwd=str(ROOT), check=True)
    print("Done. Commit + push → Vercel redeploy.")


if __name__ == "__main__":
    main()
