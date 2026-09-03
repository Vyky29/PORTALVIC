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

/** Parse sheet-style "4.30 to 5" / "16.30 to 17.00" / "12.00 – 1.00" into start/end minutes (0–24h). */
function parseTimeSlotMinutes(raw: string): { start: number; end: number } | null {
  const normalized = norm(raw)
    .replace(/[–—−]/g, "-")
    .replace(/\s*-\s*/g, " to ")
    .toLowerCase();
  const parts = normalized.split(/\s+to\s+/i);
  if (parts.length < 2) return null;
  function tok(p: string): number | null {
    const m = String(p || "").trim().match(/^(\d{1,2})(?:[.:](\d{2}))?$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const min = m[2] != null ? parseInt(m[2], 10) : 0;
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    // Sheet afternoon hours are often 1–9 meaning 13–21.
    if (h >= 1 && h <= 9) h += 12;
    return h * 60 + min;
  }
  const a = tok(parts[0]);
  const b = tok(parts[1]);
  if (a == null || b == null) return null;
  return { start: a, end: b };
}

function timeSlotsEquivalent(a: string, b: string): boolean {
  const na = norm(a).toLowerCase();
  const nb = norm(b).toLowerCase();
  if (!na || !nb) return !na && !nb;
  if (na === nb) return true;
  const ma = parseTimeSlotMinutes(na);
  const mb = parseTimeSlotMinutes(nb);
  if (!ma || !mb) return false;
  return ma.start === mb.start && ma.end === mb.end;
}

function staffSlug(name: string): string {
  return norm(name).toLowerCase().replace(/\s+/g, "_");
}

function clientMatchKey(name: string): string {
  return norm(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function clientsMatch(a: string, b: string): boolean {
  const ka = clientMatchKey(a);
  const kb = clientMatchKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // slug_style vs display: jack_w vs Jack W
  const sa = staffSlug(a).replace(/_/g, "");
  const sb = staffSlug(b).replace(/_/g, "");
  return !!(sa && sb && sa === sb);
}

function findStaffColumn(week: MadreWeek, instructors: string): MadreStaffCol | null {
  const key = clientMatchKey(norm(instructors).split(",")[0] ?? "");
  if (!key) return null;
  for (const st of week.staff ?? []) {
    if (!st) continue;
    const sk = clientMatchKey(String(st.staffKey ?? ""));
    const sn = clientMatchKey(String(st.staffName ?? ""));
    if (key === sk || key === sn) return st;
    if (sk.includes(key) || sn.includes(key) || key.includes(sk) || key.includes(sn)) return st;
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
  const t = norm(timeSlot);
  for (const s of slots) {
    if (norm(s.client_name).toLowerCase() === c && timeSlotsEquivalent(String(s.time_slot ?? ""), t)) {
      return s;
    }
  }
  return null;
}

/** Open / bookable placeholders — Assign must rename these, not stack a named client beside them. */
export function isOpenMadreClientName(name: unknown): boolean {
  const up = norm(name)
    .toUpperCase()
    .replace(/[_\s-]+/g, " ")
    .trim();
  return (
    !up ||
    up === "NO PARTICIPANT" ||
    up === "NO CLIENT" ||
    up === "NOPARTICIPANT" ||
    up === "OPEN" ||
    up === "AVAILABLE" ||
    up === "FREE"
  );
}

function venuesCompatible(a: unknown, b: unknown): boolean {
  const va = norm(a).toLowerCase();
  const vb = norm(b).toLowerCase();
  if (!va || !vb) return true;
  return va === vb || va.includes(vb) || vb.includes(va);
}

function findOpenSeatOnBand(
  slots: MadreSlot[],
  timeSlot: string,
  venue: string,
): MadreSlot | null {
  for (const s of slots) {
    if (!isOpenMadreClientName(s.client_name)) continue;
    if (!timeSlotsEquivalent(String(s.time_slot ?? ""), timeSlot)) continue;
    if (!venuesCompatible(s.venue, venue)) continue;
    return s;
  }
  return null;
}

/** Prefer named instructor; else staff column that already has this open/named band. */
function resolveStaffForUpsert(
  week: MadreWeek,
  iso: string,
  payload: Record<string, unknown>,
  replaceOpen: boolean,
): MadreStaffCol | null {
  const named = findStaffColumn(week, String(payload.instructors ?? ""));
  if (named) return named;
  const timeSlot = norm(payload.time_slot);
  const venue = String(payload.venue ?? "");
  const client = norm(payload.client_name).toLowerCase();
  for (const st of week.staff ?? []) {
    if (!st) continue;
    const day = findDay(st, iso);
    if (!day?.slots?.length) continue;
    if (slotMatch(day.slots, String(payload.client_name ?? ""), timeSlot)) return st;
    if (replaceOpen && findOpenSeatOnBand(day.slots, timeSlot, venue)) return st;
    // Same client any time on that day (normalize label later).
    if (client && day.slots.some((s) => norm(s.client_name).toLowerCase() === client)) return st;
  }
  return null;
}

function foldParticipantUpsert(madre: MadreDoc, iso: string, payload: Record<string, unknown>): boolean {
  const client = norm(payload.client_name);
  const timeSlot = norm(payload.time_slot);
  if (!client || !timeSlot || !iso) return false;

  // Named Assign: consume an open seat on this band (do not leave NO PARTICIPANT + named).
  const replaceOpen =
    payload.replace_open !== false &&
    !isOpenMadreClientName(client);

  for (const week of madre.weeks ?? []) {
    const start = String(week.start ?? "").slice(0, 10);
    const end = String(week.end ?? "").slice(0, 10);
    if (iso < start || iso > end) continue;

    const st = resolveStaffForUpsert(week, iso, payload, replaceOpen);
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
    if (!slot && replaceOpen) {
      slot = findOpenSeatOnBand(slots, timeSlot, String(payload.venue ?? ""));
      if (slot) {
        slot.client_name = client;
        // Prefer the open seat's existing sheet time label so Services capacity matches.
        if (slot.time_slot) {
          /* keep open band label */
        } else {
          slot.time_slot = timeSlot;
        }
      }
    }
    if (!slot) {
      slot = { client_name: client, time_slot: timeSlot };
      slots.push(slot);
    } else if (timeSlotsEquivalent(String(slot.time_slot ?? ""), timeSlot)) {
      // Keep sheet-style label when already equivalent (e.g. "12 to 1" vs "12.00 – 1.00").
      if (!slot.time_slot) slot.time_slot = timeSlot;
    } else {
      slot.time_slot = timeSlot;
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
  const timeSlot = norm(payload.time_slot);
  if (!client || !iso) return false;

  const instrRaw = norm(payload.instructors);

  for (const week of madre.weeks ?? []) {
    const start = String(week.start ?? "").slice(0, 10);
    const end = String(week.end ?? "").slice(0, 10);
    if (iso < start || iso > end) continue;

    const scoped = instrRaw ? findStaffColumn(week, instrRaw) : null;
    const staffList = scoped ? [scoped] : (week.staff ?? []);

    for (const st of staffList) {
      const day = findDay(st, iso);
      if (!day?.slots) continue;
      const before = day.slots.length;
      day.slots = day.slots.filter(
        (s) =>
          !(
            norm(s.client_name).toLowerCase() === client &&
            (!timeSlot || timeSlotsEquivalent(String(s.time_slot ?? ""), timeSlot))
          ),
      );
      if (day.slots.length < before) return true;
    }
  }
  return false;
}

function foldStaffUpsert(madre: MadreDoc, iso: string, payload: Record<string, unknown>): boolean {
  if (!madre.staffShifts) {
    madre.staffShifts = { termFrom: "2026-06-01", termTo: "2026-07-31", rows: [] };
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

function ensureStaffColumn(week: MadreWeek, instructors: string): MadreStaffCol {
  const existing = findStaffColumn(week, instructors);
  if (existing) return existing;
  const name = norm(instructors) || "COVER NEEDED";
  const col: MadreStaffCol = {
    staffKey: staffSlug(name),
    staffName: name.toUpperCase() === "COVER NEEDED" || staffSlug(name) === "cover_needed"
      ? "COVER NEEDED"
      : name.toUpperCase(),
    days: [],
  };
  week.staff = week.staff ?? [];
  week.staff.push(col);
  return col;
}

/**
 * Move a booked participant from one instructor column to another for a calendar day
 * (e.g. Aurora → COVER NEEDED, or COVER NEEDED → real cover). Slot stays booked.
 */
function foldInstructorColumnMove(
  madre: MadreDoc,
  iso: string,
  payload: Record<string, unknown>,
): boolean {
  const client = norm(payload.client_name);
  const timeSlot = norm(payload.time_slot);
  const fromRaw = norm(payload.from_instructors ?? payload.absent_staff_id);
  const toRaw = norm(payload.to_instructors ?? payload.covering_staff_name ?? payload.covering_staff_id);
  if (!client || !iso || !toRaw) return false;

  for (const week of madre.weeks ?? []) {
    const start = String(week.start ?? "").slice(0, 10);
    const end = String(week.end ?? "").slice(0, 10);
    if (iso < start || iso > end) continue;

    let moved: MadreSlot | null = null;
    const fromCol = fromRaw ? findStaffColumn(week, fromRaw) : null;
    const searchList = fromCol ? [fromCol] : (week.staff ?? []);
    for (const st of searchList) {
      if (!st) continue;
      const day = findDay(st, iso);
      if (!day?.slots?.length) continue;
      const idx = day.slots.findIndex(
        (s) =>
          clientsMatch(String(s.client_name ?? ""), client) &&
          (!timeSlot || timeSlotsEquivalent(String(s.time_slot ?? ""), timeSlot)),
      );
      if (idx < 0) continue;
      moved = { ...day.slots[idx] };
      day.slots.splice(idx, 1);
      break;
    }
    if (!moved && fromCol) {
      // Fallback: search any column for this client/time on the day.
      for (const st of week.staff ?? []) {
        if (!st) continue;
        const day = findDay(st, iso);
        if (!day?.slots?.length) continue;
        const idx = day.slots.findIndex(
          (s) =>
            clientsMatch(String(s.client_name ?? ""), client) &&
            (!timeSlot || timeSlotsEquivalent(String(s.time_slot ?? ""), timeSlot)),
        );
        if (idx < 0) continue;
        moved = { ...day.slots[idx] };
        day.slots.splice(idx, 1);
        break;
      }
    }
    if (!moved) continue;

    const toCol = ensureStaffColumn(week, toRaw);
    let toDay = findDay(toCol, iso);
    if (!toDay) {
      toDay = {
        weekday: String(payload.day ?? ""),
        sessionDate: iso,
        slots: [],
      };
      toCol.days = toCol.days ?? [];
      toCol.days.push(toDay);
    }
    toDay.slots = toDay.slots ?? [];
    if (payload.service) moved.service = norm(payload.service);
    if (payload.venue) moved.venue = norm(payload.venue);
    const area = norm(payload.area ?? payload.pool_note);
    if (area) {
      moved.area = area;
      moved.pool_note = area;
    }
    if (timeSlot && !moved.time_slot) moved.time_slot = timeSlot;
    // Replace any duplicate on destination.
    toDay.slots = toDay.slots.filter(
      (s) =>
        !(
          clientsMatch(String(s.client_name ?? ""), client) &&
          (!timeSlot || timeSlotsEquivalent(String(s.time_slot ?? ""), timeSlot))
        ),
    );
    toDay.slots.push(moved);
    toDay.slots.sort((a, b) => norm(a.time_slot).localeCompare(norm(b.time_slot)));
    return true;
  }
  return false;
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
  if (ft === "instructor_column_move" || ft === "instructor_cover_needed") {
    const ok = foldInstructorColumnMove(madre, iso, payload);
    return { ok, note: ok ? "instructor column move" : "slot not found for move" };
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

  if (ovType === "instructor_cover_needed") {
    return {
      fold_type: "instructor_cover_needed",
      session_date: iso,
      payload: {
        client_name: record.anchor_client_id,
        time_slot: record.anchor_time_slot_label,
        venue: record.anchor_venue ?? pl.venue,
        service: pl.service,
        area: pl.area,
        from_instructors: pl.absent_staff_id ?? record.anchor_staff_id,
        to_instructors: "COVER NEEDED",
        covering_staff_name: "COVER NEEDED",
        covering_staff_id: "cover_needed",
      },
    };
  }

  if (ovType === "instructor_reassign" && (pl.covering_staff_id || pl.covering_staff_name)) {
    return {
      fold_type: "instructor_column_move",
      session_date: iso,
      payload: {
        client_name: record.anchor_client_id,
        time_slot: record.anchor_time_slot_label,
        venue: record.anchor_venue ?? pl.venue,
        service: pl.service,
        area: pl.area,
        from_instructors: pl.absent_staff_id ?? record.anchor_staff_id,
        to_instructors: pl.covering_staff_name ?? pl.covering_staff_id,
      },
    };
  }

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
    const weekStart = norm(w.start).slice(0, 10);
    const weekEnd = norm(w.end).slice(0, 10);
    for (const st of w.staff ?? []) {
      if (!st) continue;
      const staffName = norm(st.staffName ?? st.staffKey).toUpperCase();
      for (const d of st.days ?? []) {
        const iso = norm(d.sessionDate).slice(0, 10);
        // Authoritative week only — skip stale copies parked in other week blocks.
        if (
          iso &&
          weekStart &&
          weekEnd &&
          !(weekStart <= iso && iso <= weekEnd)
        ) {
          continue;
        }
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
