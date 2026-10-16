/** Apply accepted parent makeup offer onto schedule_overrides (open-slot MakeUp). */

import {
  canonicalParticipantClientId,
  rosterParticipantSlugAlias,
  slugifyParticipantKey,
} from "./participant_identity.ts";
import { notifyParentMakeupLost } from "./portal_makeup_offer_notify.ts";

export function cleanMakeup(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeStaffRosterKey(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Roster convention: Mon–Sat afternoon hours written 12h without am/pm. */
function hourTo24(hour: number, dayName: string): number {
  const isSunday = String(dayName || "").toLowerCase() === "sunday";
  if (!isSunday && hour < 8) return hour + 12;
  if (isSunday && hour >= 1 && hour <= 7) return hour + 12;
  return hour;
}

function weekdayNameFromIso(iso: string): string {
  const p = String(iso || "").split("-");
  if (p.length !== 3) return "";
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "long" });
}

function minutesToPgTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":00"
  );
}

/**
 * Parse "1 to 2", "5 to 5.30", "16:00-16:30" into PG times.
 * Returns null if unparseable (caller can still write override with null times).
 */
export function parseMakeupSessionTime(
  raw: string,
  sessionDateIso: string,
): { start: string; end: string; label: string } | null {
  const label = cleanMakeup(raw, 40);
  if (!label) return null;
  const day = weekdayNameFromIso(sessionDateIso);
  const parts = label.split(/\s*(?:to|-|—)\s*/i);
  if (parts.length !== 2) return null;
  const toMin = (t: string): number | null => {
    const m = t.trim().match(/^(\d{1,2})(?:[.:](\d{1,2}))?$/);
    if (!m) return null;
    return hourTo24(parseInt(m[1], 10), day) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
  };
  const start = toMin(parts[0]);
  const end = toMin(parts[1]);
  if (start == null || end == null || end <= start) return null;
  return { start: minutesToPgTime(start), end: minutesToPgTime(end), label };
}

export function resolveMakeupClientSlug(opts: {
  displayName?: string;
  contactId?: string;
}): { slug: string; display: string } {
  const display = cleanMakeup(opts.displayName, 120) || "Participant";
  const fromName = canonicalParticipantClientId(display);
  const fromContact = rosterParticipantSlugAlias(
    slugifyParticipantKey(String(opts.contactId || "")),
  );
  // Prefer display-name roster slug (matches staff MakeUp picker); fall back to contact id.
  const slug = fromName || fromContact || "participant";
  return { slug, display };
}

export type MakeupOfferRosterInput = {
  id: string;
  grant_id: string;
  contact_id: string;
  parent_person_id: string;
  venue: string;
  session_date: string;
  session_time?: string | null;
  service_label?: string | null;
  instructor_name?: string | null;
  area?: string | null;
  offer_notes?: string | null;
  anchor_staff_id?: string | null;
  anchor_start?: string | null;
  anchor_end?: string | null;
  roster_override_id?: string | null;
};

/**
 * Insert schedule_overrides row for an accepted makeup (open slot → replacement client).
 * Idempotent if offer already has roster_override_id.
 */
export async function applyAcceptedMakeupToRoster(
  // deno-lint-ignore no-explicit-any
  admin: any,
  offer: MakeupOfferRosterInput,
  grant: {
    participant_display?: string | null;
    contact_id?: string | null;
    preferred_venue?: string | null;
    service_label?: string | null;
  },
  actorUserId?: string | null,
): Promise<{ override_id: string | null; already?: boolean; error?: string }> {
  if (offer.roster_override_id) {
    return { override_id: String(offer.roster_override_id), already: true };
  }

  const sessionDate = cleanMakeup(offer.session_date, 12);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return { override_id: null, error: "bad_session_date" };
  }

  const venue = cleanMakeup(offer.venue || grant.preferred_venue, 80);
  const instructor = cleanMakeup(offer.instructor_name, 120);
  const staffKey =
    normalizeStaffRosterKey(String(offer.anchor_staff_id || "")) ||
    normalizeStaffRosterKey(instructor);
  if (!staffKey) {
    return { override_id: null, error: "staff_required" };
  }

  const parsed = parseMakeupSessionTime(String(offer.session_time || ""), sessionDate);
  const anchorStart =
    cleanMakeup(offer.anchor_start, 12) || (parsed ? parsed.start : "");
  const anchorEnd =
    cleanMakeup(offer.anchor_end, 12) || (parsed ? parsed.end : "");
  const timeLabel =
    cleanMakeup(offer.session_time, 40) || (parsed ? parsed.label : "");
  if (!anchorStart || !anchorEnd) {
    return { override_id: null, error: "time_required" };
  }

  if (await openSeatHasBooking(admin, sessionDate, staffKey, anchorStart)) {
    return {
      override_id: null,
      error: "That seat is already booked. Pick another makeup.",
    };
  }

  const client = resolveMakeupClientSlug({
    displayName: String(grant.participant_display || ""),
    contactId: String(grant.contact_id || offer.contact_id || ""),
  });

  // schedule_overrides.created_by is NOT NULL — prefer offerer, then actor, then any admin/ceo.
  let createdBy = cleanMakeup(actorUserId, 60) || "";
  if (!createdBy) {
    const { data: offeredByRow } = await admin
      .from("portal_parent_makeup_offers")
      .select("offered_by")
      .eq("id", offer.id)
      .maybeSingle();
    createdBy = cleanMakeup(offeredByRow?.offered_by, 60);
  }
  if (!createdBy) {
    const { data: actor } = await admin
      .from("staff_profiles")
      .select("id")
      .in("app_role", ["ceo", "admin"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    createdBy = cleanMakeup(actor?.id, 60);
  }
  if (!createdBy) {
    return { override_id: null, error: "created_by_required" };
  }

  const now = new Date().toISOString();
  const reason =
    cleanMakeup(offer.offer_notes, 400) ||
    `Parent portal makeup accepted (${client.display})`;

  const row = {
    session_date: sessionDate,
    anchor_staff_id: staffKey,
    anchor_start: anchorStart,
    anchor_end: anchorEnd,
    anchor_venue: venue || "Unknown",
    anchor_client_id: "available",
    anchor_time_slot_label: timeLabel,
    override_type: "client_replace_in_slot",
    payload: {
      replacement_client_id: client.slug,
      replacement_client_name: client.display,
      to_client_id: client.slug,
      to_client_name: client.display,
      makeup_window: timeLabel,
      open_slot_makeup: true,
      parent_portal_makeup: true,
      makeup_offer_id: offer.id,
      makeup_grant_id: offer.grant_id,
      service_label: cleanMakeup(offer.service_label || grant.service_label, 160),
      area: cleanMakeup(offer.area, 80),
    },
    reason,
    status: "active",
    superseded_by: null,
    spreadsheet_revision: "parent-portal:makeup-accept",
    created_by: createdBy,
    updated_by: createdBy,
  };

  const { data: inserted, error } = await admin
    .from("schedule_overrides")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error || !inserted?.id) {
    console.error("[applyAcceptedMakeupToRoster]", error?.message || "insert_failed");
    return { override_id: null, error: error?.message || "insert_failed" };
  }

  await admin
    .from("portal_parent_makeup_offers")
    .update({
      roster_override_id: inserted.id,
      roster_applied_at: now,
      updated_at: now,
      anchor_staff_id: staffKey,
      anchor_start: anchorStart,
      anchor_end: anchorEnd,
    })
    .eq("id", offer.id);

  return { override_id: String(inserted.id) };
}

function payloadRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Trial or term book on an open seat. A makeup does not count. */
export function overridePayloadIsBookingSeat(payload: unknown): boolean {
  const p = payloadRecord(payload);
  if (p.is_trial === true || p.finish_booking === true || p.finish_booking === "true") return true;
  if (p.new_client === true || p.new_client === "true") return true;
  if (p.term_new_participant === true || p.term_new_participant === "true") return true;
  const kind = String(p.booking_kind || p.session_kind || "").trim().toLowerCase();
  return kind === "trial" || kind === "term";
}

export function overridePayloadIsOpenMakeup(payload: unknown): boolean {
  const p = payloadRecord(payload);
  return p.open_slot_makeup === true ||
    p.parent_portal_makeup === true ||
    !!cleanMakeup(p.makeup_offer_id, 80);
}

function childNamesCollide(bookedName: string, makeupName: string): boolean {
  const norm = (v: string) =>
    v.toLowerCase().replace(/\(trial\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const a = norm(bookedName);
  const b = norm(makeupName);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export async function openSeatHasBooking(
  // deno-lint-ignore no-explicit-any
  admin: any,
  sessionDate: string,
  staffKey: string,
  anchorStart: string,
): Promise<boolean> {
  const { data } = await admin
    .from("schedule_overrides")
    .select("id, payload")
    .eq("session_date", sessionDate)
    .eq("status", "active")
    .ilike("anchor_staff_id", staffKey)
    .eq("anchor_start", anchorStart)
    .eq("override_type", "client_replace_in_slot")
    .limit(8);
  return (data || []).some((row: { payload?: unknown }) =>
    overridePayloadIsBookingSeat(row.payload)
  );
}

/**
 * A trial, booking, or term book takes the seat.
 * The makeup comes off, the grant goes back to open, and the parent is told
 * the office will offer another day.
 */
export async function displaceOpenMakeupOnSeat(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: {
    sessionDate: string;
    staffKey: string;
    anchorStart: string;
    bookedClientName: string;
    actorId?: string | null;
  },
): Promise<{ displaced: number }> {
  const sessionDate = cleanMakeup(opts.sessionDate, 12);
  const staffKey = normalizeStaffRosterKey(opts.staffKey);
  const anchorStart = cleanMakeup(opts.anchorStart, 12);
  if (!sessionDate || !staffKey || !anchorStart) return { displaced: 0 };

  const { data: rows } = await admin
    .from("schedule_overrides")
    .select("id, payload, reason")
    .eq("session_date", sessionDate)
    .eq("status", "active")
    .ilike("anchor_staff_id", staffKey)
    .eq("anchor_start", anchorStart)
    .eq("override_type", "client_replace_in_slot")
    .limit(8);

  let displaced = 0;
  const now = new Date().toISOString();
  for (const row of rows || []) {
    const payload = payloadRecord(row.payload);
    if (!overridePayloadIsOpenMakeup(payload)) continue;
    if (overridePayloadIsBookingSeat(payload)) continue;
    const makeupName = String(
      payload.replacement_client_name || payload.to_client_name || "",
    );
    if (childNamesCollide(opts.bookedClientName, makeupName)) continue;

    const actorId = cleanMakeup(opts.actorId, 60);
    const patch: Record<string, unknown> = {
      status: "cancelled",
      reason: "Seat booked - makeup removed. Office will offer another day.",
      updated_at: now,
    };
    if (actorId) patch.updated_by = actorId;
    const { error } = await admin
      .from("schedule_overrides")
      .update(patch)
      .eq("id", row.id)
      .eq("status", "active");
    if (error) {
      console.warn("[displaceOpenMakeupOnSeat]", error.message);
      continue;
    }
    displaced++;

    const offerId = cleanMakeup(payload.makeup_offer_id, 80);
    if (!offerId) continue;
    const { data: offer } = await admin
      .from("portal_parent_makeup_offers")
      .select("*")
      .eq("id", offerId)
      .maybeSingle();
    if (!offer) continue;
    await admin
      .from("portal_parent_makeup_offers")
      .update({ status: "withdrawn", updated_at: now, responded_at: now })
      .eq("id", offerId);
    const grantId = cleanMakeup(offer.grant_id, 80);
    let grant: Record<string, unknown> | null = null;
    if (grantId) {
      const { data: grantRow } = await admin
        .from("portal_parent_makeup_grants")
        .select("*")
        .eq("id", grantId)
        .maybeSingle();
      grant = grantRow || null;
      await admin
        .from("portal_parent_makeup_grants")
        .update({ status: "open", closed_at: null, updated_at: now })
        .eq("id", grantId);
    }
    try {
      await notifyParentMakeupLost(admin, grant || {}, offer);
    } catch (e) {
      console.warn("[displaceOpenMakeupOnSeat] notify", e);
    }
  }
  return { displaced };
}
