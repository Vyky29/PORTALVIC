/**
 * Booking Portal slot context — URL payload, lead pending slot, reservations, invoices.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type PortalBookingRequest = {
  from: string;
  slot_id: string;
  service_id: string | null;
  service_name: string | null;
  venue: string | null;
  day: string | null;
  time: string | null;
  activity: string | null;
  booking_mode: string | null;
  week_id: string | null;
  block_id: string | null;
  date_iso: string | null;
  pack: string | null;
  booking_kind: "trial" | "term";
};

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function asTrimmed(value: unknown, max = 200): string | null {
  const s = clean(value, max);
  return s || null;
}

export function extractBookingRequest(
  payload: Record<string, unknown> | null | undefined,
): PortalBookingRequest | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload.booking_request;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const br = raw as Record<string, unknown>;
  const slotId = asTrimmed(br.slot_id, 160);
  if (!slotId) return null;
  const dateRaw = asTrimmed(br.date || br.date_iso, 32);
  const dateIso = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
  const kindRaw = String(br.booking_kind || "").trim().toLowerCase();
  const bookingKind =
    kindRaw === "trial" || kindRaw === "trial_session" || kindRaw === "taster"
      ? "trial"
      : "term";
  return {
    from: asTrimmed(br.from, 40) || "bookingportal",
    slot_id: slotId,
    service_id: asTrimmed(br.service || br.service_id, 80),
    service_name: asTrimmed(br.service_name, 120),
    venue: asTrimmed(br.venue, 80),
    day: asTrimmed(br.day || br.day_label, 40),
    time: asTrimmed(br.time || br.time_label, 80),
    activity: asTrimmed(br.activity || br.crash_activity, 120),
    booking_mode: asTrimmed(br.booking_mode, 40),
    week_id: asTrimmed(br.week_id, 40),
    block_id: asTrimmed(br.block_id, 40),
    date_iso: dateIso,
    pack: asTrimmed(br.pack || br.pack_label, 80),
    booking_kind: bookingKind,
  };
}

export function normalizePendingBookingRequest(
  raw: unknown,
): PortalBookingRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return extractBookingRequest({ booking_request: raw });
}

export function bookingRequestSummary(br: PortalBookingRequest | null): string | null {
  if (!br) return null;
  return [
    br.service_name,
    br.venue,
    br.day,
    br.time,
    br.booking_kind === "trial" ? "Trial" : null,
  ]
    .filter(Boolean)
    .join(" · ") || br.slot_id;
}

export function reservationFieldsFromBookingRequest(
  br: PortalBookingRequest,
): Record<string, unknown> {
  return {
    slot_id: br.slot_id,
    service_id: br.service_id,
    service_name: br.service_name,
    venue: br.venue,
    day_label: br.day,
    time_label: br.time,
    activity: br.activity,
    booking_mode: br.booking_mode,
    week_id: br.week_id,
    block_id: br.block_id,
    date_iso: br.date_iso,
    notes: br.booking_kind === "trial" ? "booking_kind=trial" : "booking_kind=term",
  };
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

/** Next calendar date for weekday name on or after asOfIso (UTC). */
export function nextWeekdayOnOrAfter(
  dayName: string | null | undefined,
  asOfIso: string,
): string | null {
  const target = WEEKDAYS.indexOf(String(dayName || "").trim().toLowerCase());
  const base = String(asOfIso || "").slice(0, 10);
  if (target < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 8; i++) {
    if (dt.getUTCDay() === target) return dt.toISOString().slice(0, 10);
    dt.setUTCDate(dt.getUTCDate() + 1);
  }
  return null;
}

/**
 * Booking lead rules (Europe/London):
 * - Weekday trial: same day OK if session starts ≥ 2 hours from now (staff notice).
 * - Sat/Sun (trial or term): must be booked by the Friday before 18:00.
 *   After that cutoff, next bookable Sat/Sun is the following weekend.
 */
export const TRIAL_WEEKDAY_MIN_LEAD_HOURS = 2;
export const WEEKEND_ADMIN_FRIDAY_CUTOFF_HOUR = 18;
/** @deprecated Use weekday 2h + Friday 18:00 weekend rules. */
export const TRIAL_MIN_LEAD_DAYS = 0;

export function calendarDateIsoInLondon(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDaysIso(iso: string, days: number): string | null {
  const base = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function weekdayIndexFromIso(iso: string): number {
  const base = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return -1;
  const [y, m, d] = base.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function londonClockParts(now: Date = new Date()): {
  iso: string;
  hour: number;
  minute: number;
} {
  const iso = calendarDateIsoInLondon(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "hour") hour = Number(p.value) || 0;
    if (p.type === "minute") minute = Number(p.value) || 0;
  }
  return { iso, hour, minute };
}

/** Start minutes from labels like "9:00–9:30", "2 to 3", "14:00". */
export function parseSessionStartMinutes(
  timeLabel: string | null | undefined,
): number | null {
  const s = clean(timeLabel, 80).toLowerCase();
  if (!s) return null;
  const range = s.match(
    /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i,
  );
  const one = range ? null : s.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
  const hRaw = range ? Number(range[1]) : one ? Number(one[1]) : NaN;
  const mRaw = range ? Number(range[2] || 0) : one ? Number(one[2] || 0) : 0;
  const ap = String((range ? range[3] : one ? one[3] : "") || "").toLowerCase();
  if (!Number.isFinite(hRaw)) return null;
  let hh = hRaw;
  if (ap === "pm" && hh < 12) hh += 12;
  if (ap === "am" && hh === 12) hh = 0;
  if (!ap && hh >= 1 && hh <= 8) hh += 12;
  if (hh < 0 || hh > 23 || mRaw < 0 || mRaw > 59) return null;
  return hh * 60 + mRaw;
}

export function isWeekendDayName(dayName: string | null | undefined): boolean {
  const d = String(dayName || "").trim().toLowerCase();
  return d === "saturday" || d === "sunday";
}

/** Friday before a Sat/Sun session (admin last working day for that weekend). */
export function fridayBeforeWeekendSessionIso(sessionIso: string): string | null {
  const wd = weekdayIndexFromIso(sessionIso);
  if (wd === 6) return addDaysIso(sessionIso, -1);
  if (wd === 0) return addDaysIso(sessionIso, -2);
  return null;
}

/** True once Friday 18:00 London has passed for that weekend session. */
export function weekendSessionPastAdminCutoff(
  sessionIso: string,
  now: Date = new Date(),
): boolean {
  const friday = fridayBeforeWeekendSessionIso(sessionIso);
  if (!friday) return false;
  const clock = londonClockParts(now);
  if (clock.iso > friday) return true;
  if (clock.iso < friday) return false;
  return clock.hour >= WEEKEND_ADMIN_FRIDAY_CUTOFF_HOUR;
}

export function bumpToNextWeekSameWeekday(iso: string): string | null {
  return addDaysIso(iso, 7);
}

/**
 * After Friday 18:00, this weekend's Sat/Sun are closed for new bookings;
 * advance week by week until the Friday cutoff is still ahead.
 */
export function applyWeekendAdminCutoff(
  sessionIso: string,
  now: Date = new Date(),
): string {
  let iso = String(sessionIso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  for (let i = 0; i < 12; i++) {
    if (!weekendSessionPastAdminCutoff(iso, now)) return iso;
    const next = bumpToNextWeekSameWeekday(iso);
    if (!next) return iso;
    iso = next;
  }
  return iso;
}

/** Same-day weekday trial needs ≥ 2 hours before session start. */
export function trialSameDayNeedsLeadBump(
  sessionIso: string,
  timeLabel: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const clock = londonClockParts(now);
  if (String(sessionIso || "").slice(0, 10) !== clock.iso) return false;
  const start = parseSessionStartMinutes(timeLabel);
  if (start == null) return true;
  const nowMins = clock.hour * 60 + clock.minute;
  return start < nowMins + TRIAL_WEEKDAY_MIN_LEAD_HOURS * 60;
}

export function isTrialBookingKind(kind: string | null | undefined): boolean {
  const k = String(kind || "").trim().toLowerCase();
  return k === "trial" || k === "trial_session" || k === "taster";
}

/** @deprecated Prefer resolveSessionDateIso with bookingKind + time. */
export function earliestTrialSessionFloorIso(asOfIso?: string | null): string {
  return clean(asOfIso, 10) && /^\d{4}-\d{2}-\d{2}$/.test(clean(asOfIso, 10))
    ? clean(asOfIso, 10)
    : calendarDateIsoInLondon();
}

/** Autumn 26/27 first bookable session by weekday (matches term_from_timetable + roster). */
export function firstBookableSessionFloorIso(
  dayName: string | null | undefined,
): string | null {
  const day = String(dayName || "").trim().toLowerCase();
  if (!day) return null;
  if (day === "saturday" || day === "sunday") return "2026-09-05";
  if (day === "monday") return "2026-09-07";
  if (WEEKDAYS.includes(day)) return "2026-09-08";
  return null;
}

export function resolveSessionDateIso(input: {
  dateIso?: string | null;
  day?: string | null;
  time?: string | null;
  asOfIso?: string | null;
  bookingKind?: string | null;
  now?: Date;
}): string | null {
  const now = input.now instanceof Date && !Number.isNaN(input.now.getTime())
    ? input.now
    : new Date();
  const termFloor = firstBookableSessionFloorIso(input.day);
  const asOf = clean(input.asOfIso, 10) || calendarDateIsoInLondon(now);
  const trial = isTrialBookingKind(input.bookingKind);

  let candidate: string | null = null;
  const direct = clean(input.dateIso, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    candidate = direct;
    if (termFloor && candidate < termFloor) {
      candidate = nextWeekdayOnOrAfter(input.day, termFloor);
    }
  } else {
    const base = termFloor && asOf < termFloor ? termFloor : asOf;
    candidate = nextWeekdayOnOrAfter(input.day, base);
  }
  if (!candidate) return null;

  const weekend =
    isWeekendDayName(input.day) ||
    weekdayIndexFromIso(candidate) === 0 ||
    weekdayIndexFromIso(candidate) === 6;

  if (weekend) {
    candidate = applyWeekendAdminCutoff(candidate, now);
  } else if (trial && trialSameDayNeedsLeadBump(candidate, input.time, now)) {
    candidate = bumpToNextWeekSameWeekday(candidate) || candidate;
  }

  if (termFloor && candidate < termFloor) {
    candidate = nextWeekdayOnOrAfter(input.day, termFloor) || candidate;
    if (
      isWeekendDayName(input.day) ||
      weekdayIndexFromIso(candidate) === 0 ||
      weekdayIndexFromIso(candidate) === 6
    ) {
      candidate = applyWeekendAdminCutoff(candidate, now);
    }
  }

  return candidate;
}

/** Minimal override shape for same-day admin bump checks. */
export type AdminDayOverrideProbe = {
  session_date?: string | null;
  override_type?: string | null;
  status?: string | null;
  anchor_venue?: string | null;
  anchor_start?: string | null;
  anchor_end?: string | null;
  anchor_time_slot_label?: string | null;
  anchor_client_id?: string | null;
};

const ADMIN_DAY_OVERRIDE_BLOCKS_NEW_START = new Set([
  "client_replace_in_slot",
  "instructor_reassign",
  "instructor_cover_needed",
  "slot_clear_client",
  "slot_close",
  "slot_update",
  "slot_open",
]);

function normalizeVenueToken(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function hmTokenFromDbOrLabel(raw: string | null | undefined): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  const db = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (db) {
    return `${String(Number(db[1])).padStart(2, "0")}:${db[2]}`;
  }
  const mins = parseSessionStartMinutes(s);
  if (mins == null) return "";
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** True when an active day override sits on the same venue + start band as the bookable slot. */
export function adminDayOverrideBlocksNewBookingStart(
  ov: AdminDayOverrideProbe,
  opts: {
    sessionIso: string;
    venue?: string | null;
    timeLabel?: string | null;
  },
): boolean {
  if (String(ov.status || "active") !== "active") return false;
  const ovIso = String(ov.session_date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ovIso) || ovIso !== opts.sessionIso) {
    return false;
  }
  const t = String(ov.override_type || "").trim();
  if (!ADMIN_DAY_OVERRIDE_BLOCKS_NEW_START.has(t)) return false;

  const slotVenue = normalizeVenueToken(opts.venue);
  const ovVenue = normalizeVenueToken(ov.anchor_venue);
  if (slotVenue && ovVenue && slotVenue !== ovVenue) return false;

  const slotStart = hmTokenFromDbOrLabel(opts.timeLabel);
  const ovStart =
    hmTokenFromDbOrLabel(ov.anchor_start) ||
    hmTokenFromDbOrLabel(ov.anchor_time_slot_label);
  if (slotStart && ovStart && slotStart !== ovStart) return false;

  // Without time/venue we only block when the override is clearly a day fill of an open seat.
  if (!slotStart && !slotVenue) {
    const cid = String(ov.anchor_client_id || "").trim().toLowerCase();
    return (
      t === "client_replace_in_slot" &&
      (!cid || cid === "available" || cid === "open" || cid === "no_participant")
    );
  }
  return true;
}

export function applyAdminDayOverrideStartBump(
  sessionIso: string,
  overrides: AdminDayOverrideProbe[],
  opts?: { venue?: string | null; timeLabel?: string | null },
): { iso: string; bumped: boolean; reason: string | null } {
  let iso = String(sessionIso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { iso, bumped: false, reason: null };
  }
  const list = Array.isArray(overrides) ? overrides : [];
  let bumped = false;
  for (let i = 0; i < 12; i++) {
    const hit = list.some((ov) =>
      adminDayOverrideBlocksNewBookingStart(ov, {
        sessionIso: iso,
        venue: opts?.venue,
        timeLabel: opts?.timeLabel,
      })
    );
    if (!hit) break;
    const next = bumpToNextWeekSameWeekday(iso);
    if (!next || next === iso) break;
    iso = next;
    bumped = true;
  }
  return {
    iso,
    bumped,
    reason: bumped ? "admin_day_override" : null,
  };
}

export function adminDayOverrideStartParentMessage(bumpedIso: string): string {
  const when = String(bumpedIso || "").slice(0, 10);
  const whenBit = /^\d{4}-\d{2}-\d{2}$/.test(when)
    ? ` Your first session will be from ${when} (next week for that weekday).`
    : " Your first session will be the following week for that weekday.";
  return (
    "This place is still available for the term." +
    " Because of a schedule change on that day, you cannot start on the overridden day." +
    whenBit
  );
}

/**
 * resolveSessionDateIso + bump when the candidate day already has an admin
 * Schedule & Covers override on that venue/time band.
 */
export function resolveSessionDateIsoWithAdminDayOverrides(
  input: Parameters<typeof resolveSessionDateIso>[0] & {
    venue?: string | null;
  },
  overrides: AdminDayOverrideProbe[],
): {
  iso: string | null;
  bumpedForAdminDayOverride: boolean;
  parentMessage: string | null;
} {
  const base = resolveSessionDateIso(input);
  if (!base) {
    return { iso: null, bumpedForAdminDayOverride: false, parentMessage: null };
  }
  const bumped = applyAdminDayOverrideStartBump(base, overrides, {
    venue: input.venue,
    timeLabel: input.time,
  });
  return {
    iso: bumped.iso,
    bumpedForAdminDayOverride: bumped.bumped,
    parentMessage: bumped.bumped
      ? adminDayOverrideStartParentMessage(bumped.iso)
      : null,
  };
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function loadPendingBookingFromLeadSession(
  admin: SupabaseClient,
  rawToken: string,
): Promise<PortalBookingRequest | null> {
  const token = clean(rawToken, 200);
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const { data: sess } = await admin
    .from("portal_booking_lead_sessions")
    .select("lead_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!sess || sess.revoked_at) return null;
  if (new Date(String(sess.expires_at)).getTime() < Date.now()) return null;
  const { data: lead } = await admin
    .from("portal_booking_leads")
    .select("pending_booking_request")
    .eq("id", sess.lead_id)
    .maybeSingle();
  return normalizePendingBookingRequest(lead?.pending_booking_request);
}

export async function loadPendingBookingForEmail(
  admin: SupabaseClient,
  email: string | null | undefined,
): Promise<PortalBookingRequest | null> {
  const emailNorm = clean(email, 200).toLowerCase();
  if (!emailNorm) return null;
  const { data: lead } = await admin
    .from("portal_booking_leads")
    .select("pending_booking_request")
    .eq("email_norm", emailNorm)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return normalizePendingBookingRequest(lead?.pending_booking_request);
}
