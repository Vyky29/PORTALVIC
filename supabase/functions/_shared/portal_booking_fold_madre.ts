/**
 * After a booking seat is validated (trial paid / office confirm), write the
 * participant onto a MADRE open seat so Services + Booking Portal capacity match.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  applyFoldToMadre,
  type MadreDoc,
} from "./portal_madre_fold_logic.ts";

export const MADRE_BOOKING_TERM_KEY = "summer-2026";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Prefer instructor= from notes; else Northolt Mon 4.30–5 → Dan. */
export function preferredInstructorForReservation(row: {
  notes?: unknown;
  venue?: unknown;
  day_label?: unknown;
  time_label?: unknown;
}): string {
  const notes = clean(row.notes, 400);
  const fromNotes = notes.match(/\binstructor\s*=\s*([A-Za-z][A-Za-z\s.'-]{0,40})/i);
  if (fromNotes && fromNotes[1]) return clean(fromNotes[1], 40);

  const venue = clean(row.venue, 80).toLowerCase();
  const day = clean(row.day_label, 20).toLowerCase();
  const time = clean(row.time_label, 40)
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ");
  if (
    /northolt/.test(venue) &&
    /^mon/.test(day) &&
    /4\.?30\s*[-–to]+\s*5(\.00)?/.test(time)
  ) {
    return "Dan";
  }
  return "";
}

function madreTimeSlotLabel(timeLabel: string): string {
  let t = clean(timeLabel, 40)
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, " to ")
    .replace(/\s+/g, " ")
    .trim();
  /* "4.30 to 5.00" → "4.30 to 5" to match sheet / open-seat bounds */
  t = t.replace(/(\d)\.00\b/g, "$1");
  t = t.replace(/\bto\s+(\d{1,2})\.00\b/i, "to $1");
  return t;
}

/**
 * Fold one validated reservation onto MADRE (consume NO PARTICIPANT on preferred instructor).
 * Returns whether MADRE was updated.
 */
export async function foldValidatedReservationOntoMadre(
  admin: SupabaseClient,
  reservationId: string,
): Promise<{ ok: boolean; note: string }> {
  const rid = clean(reservationId, 80);
  if (!rid) return { ok: false, note: "missing_reservation_id" };

  const { data: row, error } = await admin
    .from("portal_booking_slot_reservations")
    .select(
      "id, status, participant_name, date_iso, day_label, time_label, venue, service_name, notes",
    )
    .eq("id", rid)
    .maybeSingle();
  if (error || !row) return { ok: false, note: "reservation_not_found" };

  const status = clean(row.status, 40).toLowerCase();
  if (!["validated", "confirmed", "paid", "held"].includes(status)) {
    return { ok: false, note: "status_not_foldable:" + status };
  }

  const client = clean(row.participant_name, 80);
  const iso = clean(row.date_iso, 12).slice(0, 10);
  const timeSlot = madreTimeSlotLabel(String(row.time_label || ""));
  if (!client || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || !timeSlot) {
    return { ok: false, note: "incomplete_reservation" };
  }

  const instructors = preferredInstructorForReservation(row);
  const { data: madreRow, error: loadErr } = await admin
    .from("portal_madre_document")
    .select("document, revision")
    .eq("term_key", MADRE_BOOKING_TERM_KEY)
    .maybeSingle();
  if (loadErr || !madreRow?.document) {
    return { ok: false, note: "madre_load_failed" };
  }

  const madre = madreRow.document as MadreDoc;
  madre.meta = madre.meta ?? {};
  const result = applyFoldToMadre(madre, {
    fold_type: "participant_slot_upsert",
    session_date: iso,
    payload: {
      client_name: client,
      day: clean(row.day_label, 20),
      time_slot: timeSlot,
      instructors: instructors || undefined,
      service: clean(row.service_name, 80) || "Aquatic Activity",
      venue: clean(row.venue, 80),
      replace_open: true,
    },
  });

  let madreOk = result.ok;
  if (madreOk) {
    madre.meta.lastLiveFoldAt = new Date().toISOString();
    madre.meta.lastLiveFoldNote = "booking_validated:" + client + ":" + iso;
    const nextRevision = (Number(madreRow.revision) || 0) + 1;
    const { error: saveErr } = await admin
      .from("portal_madre_document")
      .update({
        document: madre,
        revision: nextRevision,
        updated_at: new Date().toISOString(),
      })
      .eq("term_key", MADRE_BOOKING_TERM_KEY);
    if (saveErr) madreOk = false;
  }

  /* Autumn dates often have no MADRE week yet — dated portal_roster_rows drives Services. */
  let rosterOk = false;
  try {
    const dayLabel = clean(row.day_label, 20) || "Monday";
    const venue = clean(row.venue, 80);
    const service = clean(row.service_name, 80) || "Aquatic Activity";
    let actorId: string | null = null;
    try {
      const { data: sample } = await admin
        .from("portal_roster_rows")
        .select("created_by")
        .not("created_by", "is", null)
        .limit(1);
      actorId = sample && sample[0] ? String(sample[0].created_by || "") : null;
    } catch (_a) {
      actorId = null;
    }
    const { data: existing } = await admin
      .from("portal_roster_rows")
      .select("id")
      .eq("session_date", iso)
      .ilike("client_name", client)
      .eq("status", "active")
      .limit(1);
    if (existing && existing.length) {
      const { error: upErr } = await admin
        .from("portal_roster_rows")
        .update({
          day: dayLabel,
          time_slot: timeSlot,
          instructors: instructors || null,
          service,
          venue,
          updated_by: actorId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing[0].id);
      rosterOk = !upErr;
    } else {
      const insertPayload: Record<string, unknown> = {
        client_name: client,
        day: dayLabel,
        time_slot: timeSlot,
        instructors: instructors || null,
        service,
        area: "Teaching Pool",
        venue,
        session_date: iso,
        status: "active",
        updated_at: new Date().toISOString(),
      };
      if (actorId) {
        insertPayload.created_by = actorId;
        insertPayload.updated_by = actorId;
      }
      const { error: insErr } = await admin.from("portal_roster_rows").insert(insertPayload);
      rosterOk = !insErr;
      if (insErr) console.warn("[foldValidatedReservationOntoMadre] roster", insErr.message);
    }
  } catch (_rosterErr) {
    rosterOk = false;
  }

  if (!madreOk && !rosterOk) {
    return { ok: false, note: (result.note || "fold_failed") + "+roster_failed" };
  }
  return {
    ok: true,
    note:
      (madreOk ? result.note : "madre_skip:" + (result.note || "no_week")) +
      (rosterOk ? "+roster" : "") +
      (instructors ? " · " + instructors : ""),
  };
}
