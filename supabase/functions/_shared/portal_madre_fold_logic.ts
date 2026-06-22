/** Patch portal_madre_document JSON (MADRE v2) from admin roster changes. */

export type MadreDoc = {
  meta?: Record<string, unknown>;
  weeks?: MadreWeek[];
  staffShifts?: { termFrom?: string; termTo?: string; rows?: StaffShiftRow[] };
};

type MadreWeek = {
  start?: string;
  end?: string;
  staff?: MadreStaffCol[];
};

type MadreStaffCol = {
  staffKey?: string;
  staffName?: string;
  days?: MadreDay[];
};

type MadreDay = {
  weekday?: string;
  sessionDate?: string;
  slots?: MadreSlot[];
};

type MadreSlot = {
  client_name?: string;
  time_slot?: string;
  service?: string;
  area?: string;
  pool_note?: string;
  venue?: string;
};

type StaffShiftRow = {
  session_date?: string;
  day?: string;
  staff_key?: string;
  staff_name?: string;
  venue?: string;
  time_range?: string;
  raw_assignment?: string;
};

export type FoldInput = {
  fold_type: string;
  session_date?: string | null;
  payload?: Record<string, unknown>;
};

function norm(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function staffSlug(name: string): string {
  return norm(name).toLowerCase().replace(/\s+/g, "_");
}

function findStaffColumn(week: MadreWeek, instructors: string): MadreStaffCol | null {
  const key = norm(instructors).split(",")[0]?.toLowerCase() ?? "";
  if (!key) return null;
  for (const st of week.staff ?? []) {
    const sk = String(st.staffKey ?? "").toLowerCase();
    const sn = String(st.staffName ?? "").toLowerCase();
    if (key === sk || key === sn || sk.includes(key) || sn.includes(key)) return st;
  }
  return null;
}

function findDay(st: MadreStaffCol, iso: string): MadreDay | null {
  for (const d of st.days ?? []) {
    if (String(d.sessionDate ?? "").slice(0, 10) === iso) return d;
  }
  return null;
}

function slotMatch(slots: MadreSlot[], client: string, timeSlot: string): MadreSlot | null {
  const c = norm(client).toLowerCase();
  const t = norm(timeSlot).toLowerCase();
  for (const s of slots) {
    if (norm(s.client_name).toLowerCase() === c && norm(s.time_slot).toLowerCase() === t) {
      return s;
    }
  }
  return null;
}

function foldParticipantUpsert(madre: MadreDoc, iso: string, payload: Record<string, unknown>): boolean {
  const client = norm(payload.client_name);
  const timeSlot = norm(payload.time_slot);
  if (!client || !timeSlot || !iso) return false;

  for (const week of madre.weeks ?? []) {
    const start = String(week.start ?? "").slice(0, 10);
    const end = String(week.end ?? "").slice(0, 10);
    if (iso < start || iso > end) continue;

    const st = findStaffColumn(week, String(payload.instructors ?? ""));
    if (!st) continue;

    let day = findDay(st, iso);
    if (!day) {
      day = { weekday: String(payload.day ?? ""), sessionDate: iso, slots: [] };
      st.days = st.days ?? [];
      st.days.push(day);
    }
    const slots = day.slots ?? [];
    day.slots = slots;

    let slot = slotMatch(slots, client, timeSlot);
    if (!slot) {
      slot = { client_name: client, time_slot: timeSlot };
      slots.push(slot);
    }
    if (payload.service) slot.service = norm(payload.service);
    if (payload.venue) slot.venue = norm(payload.venue);
    const area = norm(payload.area ?? payload.pool_note);
    if (area) {
      slot.area = area;
      slot.pool_note = area;
    }
    slots.sort((a, b) => norm(a.time_slot).localeCompare(norm(b.time_slot)));
    return true;
  }
  return false;
}

function foldParticipantCancel(madre: MadreDoc, iso: string, payload: Record<string, unknown>): boolean {
  const client = norm(payload.client_name).toLowerCase();
  const timeSlot = norm(payload.time_slot).toLowerCase();
  if (!client || !iso) return false;

  for (const week of madre.weeks ?? []) {
    const start = String(week.start ?? "").slice(0, 10);
    const end = String(week.end ?? "").slice(0, 10);
    if (iso < start || iso > end) continue;

    for (const st of week.staff ?? []) {
      const day = findDay(st, iso);
      if (!day?.slots) continue;
      const before = day.slots.length;
      day.slots = day.slots.filter(
        (s) =>
          !(
            norm(s.client_name).toLowerCase() === client &&
            (!timeSlot || norm(s.time_slot).toLowerCase() === timeSlot)
          ),
      );
      if (day.slots.length < before) return true;
    }
  }
  return false;
}

function foldStaffUpsert(madre: MadreDoc, iso: string, payload: Record<string, unknown>): boolean {
  if (!madre.staffShifts) {
    madre.staffShifts = { termFrom: "2026-06-01", termTo: "2026-07-17", rows: [] };
  }
  const rows = madre.staffShifts.rows ?? [];
  madre.staffShifts.rows = rows;

  const row: StaffShiftRow = {
    session_date: iso,
    day: norm(payload.day),
    staff_key: staffSlug(String(payload.staff_name ?? payload.staff_key ?? "")),
    staff_name: norm(payload.staff_name),
    venue: norm(payload.venue),
    time_range: norm(payload.time_range),
    raw_assignment: norm(payload.raw_assignment),
  };

  const key = `${iso}|${row.staff_key}|${norm(row.venue).toLowerCase()}|${norm(row.time_range).toLowerCase()}`;
  let replaced = false;
  for (let i = 0; i < rows.length; i++) {
    const e = rows[i];
    const ek = `${String(e.session_date ?? "").slice(0, 10)}|${String(e.staff_key ?? "").toLowerCase()}|${norm(e.venue).toLowerCase()}|${norm(e.time_range).toLowerCase()}`;
    if (ek === key) {
      rows[i] = row;
      replaced = true;
      break;
    }
  }
  if (!replaced) rows.push(row);
  rows.sort(
    (a, b) =>
      String(a.session_date).localeCompare(String(b.session_date)) ||
      String(a.staff_key).localeCompare(String(b.staff_key)),
  );
  return true;
}

export function applyFoldToMadre(madre: MadreDoc, input: FoldInput): { ok: boolean; note: string } {
  const iso = String(input.session_date ?? "").slice(0, 10);
  const payload = input.payload ?? {};
  const ft = String(input.fold_type ?? "");

  if (ft === "participant_slot_upsert") {
    const ok = foldParticipantUpsert(madre, iso, payload);
    return { ok, note: ok ? "participant upsert" : "no week/staff match" };
  }
  if (ft === "participant_slot_cancel") {
    const ok = foldParticipantCancel(madre, iso, payload);
    return { ok, note: ok ? "participant cancel" : "slot not found" };
  }
  if (ft === "staff_shift_upsert") {
    return { ok: foldStaffUpsert(madre, iso, payload), note: "staff shift upsert" };
  }
  if (ft === "staff_shift_cancel") {
    if (!madre.staffShifts?.rows) return { ok: false, note: "no staff shifts" };
    const sk = staffSlug(String(payload.staff_name ?? ""));
    const ven = norm(payload.venue).toLowerCase();
    const tr = norm(payload.time_range).toLowerCase();
    const before = madre.staffShifts.rows.length;
    madre.staffShifts.rows = madre.staffShifts.rows.filter(
      (r) =>
        !(
          String(r.session_date ?? "").slice(0, 10) === iso &&
          String(r.staff_key ?? "").toLowerCase() === sk &&
          norm(r.venue).toLowerCase() === ven &&
          (!tr || norm(r.time_range).toLowerCase() === tr)
        ),
    );
    return { ok: madre.staffShifts.rows.length < before, note: "staff shift cancel" };
  }
  return { ok: false, note: "unknown fold_type" };
}

/** portal_roster_rows DB row → fold input */
export function foldFromPortalRosterRow(record: Record<string, unknown>): FoldInput {
  const status = String(record.status ?? "active").toLowerCase();
  const iso = String(record.session_date ?? "").slice(0, 10) || null;
  return {
    fold_type: status === "cancelled" ? "participant_slot_cancel" : "participant_slot_upsert",
    session_date: iso,
    payload: {
      client_name: record.client_name,
      day: record.day,
      time_slot: record.time_slot,
      instructors: record.instructors,
      service: record.service,
      area: record.area,
      venue: record.venue,
    },
  };
}

/** schedule_overrides DB row → fold input */
export function foldFromScheduleOverride(record: Record<string, unknown>): FoldInput {
  const pl = (record.payload && typeof record.payload === "object"
    ? record.payload
    : {}) as Record<string, unknown>;
  const ovType = String(record.override_type ?? "").toLowerCase();
  const iso = String(record.session_date ?? "").slice(0, 10) || null;
  const isStaff =
    ovType.includes("staff") || ovType === "instructor_cover" || !!pl.covering_staff_id;

  if (isStaff) {
    return {
      fold_type: "staff_shift_upsert",
      session_date: iso,
      payload: {
        staff_name: pl.covering_staff_name ?? pl.covering_staff_id ?? record.anchor_staff_id,
        venue: record.anchor_venue ?? pl.venue,
        time_range: record.anchor_time_slot_label,
        day: pl.day,
        raw_assignment: pl.raw_assignment,
      },
    };
  }
  return {
    fold_type:
      ovType === "slot_clear_client" || ovType === "client_cancelled"
        ? "participant_slot_cancel"
        : "participant_slot_upsert",
    session_date: iso,
    payload: {
      client_name: pl.replacement_client_name ?? pl.to_client_name ?? record.anchor_client_id,
      instructors: pl.covering_staff_id ?? record.anchor_staff_id,
      time_slot: record.anchor_time_slot_label,
      venue: record.anchor_venue,
      service: pl.service,
      area: pl.area,
    },
  };
}

export function madreToAdapterRows(madre: MadreDoc): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const w of madre.weeks ?? []) {
    for (const st of w.staff ?? []) {
      const staffName = norm(st.staffName ?? st.staffKey).toUpperCase();
      for (const d of st.days ?? []) {
        for (const s of d.slots ?? []) {
          const cn = norm(s.client_name);
          const up = cn.toUpperCase();
          if (!cn || up === "CASA" || up === "MANAGER") continue;
          rows.push({
            client_name: cn,
            day: d.weekday,
            instructors: staffName,
            service: norm(s.service),
            area: norm(s.pool_note ?? s.area),
            time_slot: norm(s.time_slot),
            venue: norm(s.venue || "SwimFarm"),
            session_date: d.sessionDate,
          });
        }
      }
    }
  }
  return rows;
}
