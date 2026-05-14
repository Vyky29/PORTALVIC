import csv
import json
import re
import unicodedata
from datetime import datetime, date
from pathlib import Path
import openpyxl

ROOT = Path(r"c:\Users\info\PORTAL")
SPREAD = ROOT / "SPREADSHEETS"
OUT = ROOT / "database"


def norm_text(v):
    if v is None:
        return ""
    s = str(v).replace("\t", " ").strip()
    s = re.sub(r"\s+", " ", s)
    return s


def to_iso_date(v):
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = norm_text(v)
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            d = datetime.strptime(s, fmt).date()
            if d.year < 2000:
                return None
            return d.isoformat()
        except ValueError:
            pass
    return None


def parse_staff_assignment(raw):
    t = norm_text(raw)
    if not t or t.lower() in {"-", "n/a", "na", "none"}:
        return None
    m = re.match(r"^(.*?)(\d[\d\.:]*\s*[-]\s*\d[\d\.:]*)$", t)
    if m:
        name = norm_text(m.group(1))
        timerange = norm_text(m.group(2)).replace(" ", "")
        return {"staff_name": name, "time_range": timerange, "raw": t}
    return {"staff_name": t, "time_range": "", "raw": t}


def export_json_csv(base_name, rows):
    json_path = OUT / f"{base_name}.json"
    csv_path = OUT / f"{base_name}.csv"
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=True, indent=2)

    fieldnames = sorted({k for row in rows for k in row.keys()}) if rows else []
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        if fieldnames:
            w.writeheader()
            for r in rows:
                w.writerow(r)


def patch_staff_timetable_swimfarm():
    path = SPREAD / "Staff Timetable (PORTAL).xlsx"
    wb = openpyxl.load_workbook(path, data_only=False)
    ws = wb["Timetable"]
    sample = " ".join(
        str(ws.cell(row=r, column=c).value or "")
        for r in range(6, 12)
        for c in range(8, 11)
    )
    if "John 4.15-6.15" not in sample and "Bismark 4.15-6.15" not in sample:
        wb.close()
        return
    max_r = ws.max_row or 500
    for r in range(1, max_r + 1):
        date_iso = to_iso_date(ws.cell(row=r, column=2).value)
        for c in range(1, 18):
            cell = ws.cell(row=r, column=c)
            v = cell.value
            if not isinstance(v, str):
                continue
            if date_iso == "2026-05-04" and c in (8, 9, 10):
                cell.value = "n/a"
                continue
            new_v = (
                v.replace("John 4.15-6.15", "Victor 4.15-6.15")
                .replace("Bismark 4.15-6.15", "Javi 4.15-6.15")
                .replace("Giuseppe 4.15-6.15", "Raul 4.15-6.15")
            )
            if new_v != v:
                cell.value = new_v
    wb.save(path)


def portal_staff_profile_key(staff_name: str) -> str:
    """First token, lower, strip accents; align keys with staff_profiles / spreadsheet bundle."""
    t = norm_text(staff_name)
    if not t:
        return ""
    first = (t.split()[0] if t.split() else t).strip()
    nf = unicodedata.normalize("NFD", first)
    ascii_first = "".join(c for c in nf if unicodedata.category(c) != "Mn")
    v = re.sub(r"[^a-z0-9]+", "", ascii_first.lower())
    if v in ("yousef", "youssef", "yusef"):
        return "youssef"
    return v


def term_staff_weekday_indices_from_timetable_records(records: list) -> dict:
    """
    Weekday indices for TERM grid (same numbering as portalWorkedWeekdaysFromSessions):
    Sunday=0 .. Saturday=6. Built from Staff Timetable (PORTAL).xlsx Timetable sheet rows.
    """
    day_to_grid = {
        "monday": 1,
        "tuesday": 2,
        "wednesday": 3,
        "thursday": 4,
        "friday": 5,
        "saturday": 6,
        "sunday": 0,
    }
    by_key: dict[str, set[int]] = {}
    for r in records or []:
        pk = portal_staff_profile_key(str(r.get("staff_name") or ""))
        if not pk:
            continue
        dkey = norm_text(r.get("day") or "").lower()
        if dkey not in day_to_grid:
            continue
        by_key.setdefault(pk, set()).add(day_to_grid[dkey])
    return {k: sorted(v) for k, v in sorted(by_key.items()) if v}


def term_staff_weekday_indices_from_roster_machine_rows(rows: list) -> dict:
    """
    Same Sun=0..Sat=6 indices from flat roster rows (staff_clients_machine.json / xlsx).
    Merges with timetable-derived weekdays so staff who work Sundays on the roster
    still get TERM blues when the pool timetable grid omits that day.
    """
    day_to_grid = {
        "monday": 1,
        "tuesday": 2,
        "wednesday": 3,
        "thursday": 4,
        "friday": 5,
        "saturday": 6,
        "sunday": 0,
    }
    by_key: dict[str, set[int]] = {}
    for r in rows or []:
        day_raw = norm_text(r.get("day") or "").lower()
        if day_raw not in day_to_grid:
            continue
        wi = day_to_grid[day_raw]
        inst_blob = norm_text(r.get("instructors") or "")
        if not inst_blob:
            continue
        for piece in re.split(r"[,/&]+|\s+and\s+", inst_blob, flags=re.IGNORECASE):
            pk = portal_staff_profile_key(piece.strip())
            if not pk:
                continue
            by_key.setdefault(pk, set()).add(wi)
    return {k: sorted(v) for k, v in sorted(by_key.items()) if v}


def merge_term_staff_weekday_maps(tt: dict, roster: dict) -> dict:
    keys = set(tt) | set(roster)
    out = {}
    for k in sorted(keys):
        s = set(tt.get(k) or []) | set(roster.get(k) or [])
        if s:
            out[k] = sorted(s)
    return out


def write_term_from_timetable_js(records, roster_rows=None):
    """JS snippet for dashboards: term grid date range + per-staff weekdays from Staff Timetable (PORTAL).xlsx."""
    path = OUT / "term_from_timetable.js"

    def _valid_term_date(s):
        if not s or len(s) < 10:
            return False
        try:
            return int(s[:4]) >= 2020
        except ValueError:
            return False

    dates = sorted({r["date"] for r in records if r.get("date") and _valid_term_date(r["date"])})
    if not dates:
        return
    first_s, last_s = dates[0], dates[-1]
    fy, fm, _ = [int(x) for x in first_s.split("-")]
    ly, lm, _ = [int(x) for x in last_s.split("-")]
    month_keys = []
    y, m = fy, fm
    while (y, m) <= (ly, lm):
        month_keys.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    term_calendar_months = [mm - 1 for _, mm in month_keys]
    term_calendar_year = fy
    first_dom_map = {}
    for mi in term_calendar_months:
        prefix = f"{term_calendar_year:04d}-{mi + 1:02d}-"
        in_month = [d for d in dates if d.startswith(prefix)]
        if not in_month:
            continue
        first_day = min(int(d.split("-")[2]) for d in in_month)
        if first_day > 1:
            first_dom_map[str(mi)] = first_day
    # Monday ISO dates starting a half-term week (timetable may omit; adjust when sourced from sheet).
    half_term_week_starts = ["2026-05-25"]
    wd_tt = term_staff_weekday_indices_from_timetable_records(records)
    wd_roster = term_staff_weekday_indices_from_roster_machine_rows(roster_rows or [])
    staff_wd = merge_term_staff_weekday_maps(wd_tt, wd_roster)
    payload = {
        "termName": "Summer Term 2026",
        "termCalendarYear": term_calendar_year,
        "termCalendarMonths": term_calendar_months,
        "termCalendarFirstDom": first_dom_map,
        "firstDate": first_s,
        "lastDate": last_s,
        "termHalfTermWeekStarts": half_term_week_starts,
        "termStaffWeekdayIndicesByProfileKey": staff_wd,
    }
    body = (
        "// Auto-generated by database/build_machine_exports.py from Staff Timetable (PORTAL).xlsx\n"
        "// Re-run: python database/build_machine_exports.py\n"
        "// termStaffWeekdayIndicesByProfileKey = weekdays (Sun=0..Sat=6) from timetable + staff_clients_machine roster.\n"
        "window.PORTAL_TERM_FROM_TIMETABLE = "
        + json.dumps(payload, indent=2)
        + ";\n"
    )
    path.write_text(body, encoding="utf-8")


def build_staff_timetable():
    wb = openpyxl.load_workbook(SPREAD / "Staff Timetable (PORTAL).xlsx", data_only=True)
    ws = wb["Timetable"]
    rows = list(ws.iter_rows(values_only=True))

    records = []
    current_day = None
    i = 0
    while i < len(rows):
        r = rows[i]
        c2 = norm_text(r[1] if len(r) > 1 else None)
        if c2.lower() in {
            "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays", "sundays"
        }:
            current_day = c2.rstrip("s")
            if i + 1 < len(rows):
                headers = rows[i + 1]
                if norm_text(headers[1] if len(headers) > 1 else None).lower() == "dates":
                    venues = {}
                    for col in range(2, len(headers)):
                        h = norm_text(headers[col])
                        if h:
                            venues[col] = h
                    j = i + 2
                    while j < len(rows):
                        rr = rows[j]
                        first = norm_text(rr[1] if len(rr) > 1 else None)
                        if not first:
                            j += 1
                            continue
                        if first.lower() in {
                            "mondays", "tuesdays", "wednesdays", "thursdays", "fridays", "saturdays", "sundays"
                        }:
                            break
                        d = to_iso_date(rr[1] if len(rr) > 1 else None)
                        if not d:
                            j += 1
                            continue
                        for col, venue in venues.items():
                            raw = rr[col] if col < len(rr) else None
                            parsed = parse_staff_assignment(raw)
                            if not parsed:
                                continue
                            records.append({
                                "day": current_day,
                                "date": d,
                                "venue": venue,
                                "staff_name": parsed["staff_name"],
                                "time_range": parsed["time_range"],
                                "raw_assignment": parsed["raw"],
                            })
                        j += 1
                    i = j
                    continue
        i += 1

    export_json_csv("staff_timetable_machine", records)
    return records


def read_staff_clients_flat_workbook(path: Path) -> list:
    """Machine-export sheet: client_name, day, instructors, service, area, time_slot, venue (header row)."""
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [norm_text(c).lower().replace(" ", "_") for c in rows[0]]
    idx = {h: i for i, h in enumerate(headers)}

    def col(*names):
        for n in names:
            if n in idx:
                return idx[n]
        return None

    ci = col("client_name", "client")
    di = col("day")
    ii = col("instructors", "instructor", "staff")
    si = col("service", "programme", "program")
    ai = col("area", "pool", "zone")
    ti = col("time_slot", "time", "slot")
    vi = col("venue", "location")
    out = []
    for r in rows[1:]:
        def get(i):
            if i is None or i >= len(r):
                return ""
            return norm_text(r[i])

        rec = {
            "client_name": get(ci),
            "day": get(di),
            "instructors": get(ii),
            "service": get(si),
            "area": get(ai),
            "time_slot": get(ti),
            "venue": get(vi),
        }
        if not any(rec.values()):
            continue
        out.append(rec)
    return out


def build_staff_clients():
    """Roster rows: only `database/staff_clients_machine.xlsx` (flat machine export)."""
    flat_path = OUT / "staff_clients_machine.xlsx"
    if not flat_path.exists():
        raise FileNotFoundError(
            "Missing "
            + str(flat_path)
            + " - add the flat workbook (columns: client_name, day, instructors, service, area, time_slot, venue)."
        )
    records = read_staff_clients_flat_workbook(flat_path)
    export_json_csv("staff_clients_machine", records)


def build_clients_info():
    wb = openpyxl.load_workbook(SPREAD / "Clients Info (PORTAL).xlsx", data_only=True)
    ws = wb["Clients info"]
    rows = []
    for r in ws.iter_rows(min_row=2, values_only=True):
        name = norm_text(r[0] if len(r) > 0 else None)
        info = norm_text(r[1] if len(r) > 1 else None)
        if not name:
            continue
        rows.append({"client_name": name, "client_info": info})
    export_json_csv("clients_info_machine", rows)


def write_clients_info_embed_js():
    path_json = OUT / "clients_info_machine.json"
    if not path_json.exists():
        return
    rows = json.loads(path_json.read_text(encoding="utf-8"))
    body = (
        "// Auto-generated by database/build_machine_exports.py\n"
        "window.PORTAL_CLIENTS_INFO_ROWS = "
        + json.dumps(rows, ensure_ascii=True)
        + ";\n"
    )
    (OUT / "clients_info_embed.js").write_text(body, encoding="utf-8")
    (ROOT / "working_ui" / "clients_info_embed.js").write_text(body, encoding="utf-8")


def copy_term_to_working_ui():
    src = OUT / "term_from_timetable.js"
    dst = ROOT / "working_ui" / "term_from_timetable.js"
    if src.exists():
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")


def copy_spreadsheet_js_to_working_ui():
    for name in ("staff_dashboard_spreadsheet_adapter.js", "staff_dashboard_spreadsheet_bundle.js"):
        src = OUT / name
        dst = ROOT / "working_ui" / name
        if src.exists():
            dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")


def patch_bundle_rows_from_json():
    """Keep embedded bundle rows in sync with staff_clients_machine.json."""
    bundle_path = OUT / "staff_dashboard_spreadsheet_bundle.js"
    json_path = OUT / "staff_clients_machine.json"
    if not bundle_path.exists() or not json_path.exists():
        return
    rows = json.loads(json_path.read_text(encoding="utf-8"))
    src = bundle_path.read_text(encoding="utf-8")
    needle = '"rows":'
    i = src.find(needle)
    if i < 0:
        return
    j = src.find("[", i)
    if j < 0:
        return
    depth = 0
    k = j
    end = -1
    while k < len(src):
        c = src[k]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                end = k + 1
                break
        k += 1
    if end < 0:
        return
    new_rows = json.dumps(rows, ensure_ascii=True, indent=2)
    new_src = src[:j] + new_rows + src[end:]
    bundle_path.write_text(new_src, encoding="utf-8")


if __name__ == "__main__":
    patch_staff_timetable_swimfarm()
    timetable_records = build_staff_timetable()
    build_staff_clients()
    roster_path = OUT / "staff_clients_machine.json"
    roster_rows = (
        json.loads(roster_path.read_text(encoding="utf-8"))
        if roster_path.exists()
        else []
    )
    write_term_from_timetable_js(timetable_records, roster_rows)
    build_clients_info()
    write_clients_info_embed_js()
    patch_bundle_rows_from_json()
    copy_term_to_working_ui()
    copy_spreadsheet_js_to_working_ui()
    print("Generated machine files in database/ and term_from_timetable.js")

