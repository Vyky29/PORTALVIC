/**
 * Booking Portal slot context — URL payload, lead pending slot, reservations, invoices.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { inferServiceKind, isClosedIso } from "./portal_term_calendar.ts";

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

const BOOKING_DATE_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** 19 Oct 2026. Empty when the booking has no calendar date. */
export function formatBookingDateLabel(iso: string | null | undefined): string | null {
  const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const month = BOOKING_DATE_MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

const VENUE_EMAIL_LABELS: Record<string, string> = {
  acton: "Acton Centre",
  northolt: "Northolt Centre",
  swimfarm: "SwimFarm Centre",
  westway: "Westway Centre",
  chiswick: "Chiswick / Zoom",
};

/** Acton → Acton Centre. A name that already says Centre stays as written. */
export function venueEmailLabel(raw: unknown): string {
  const text = clean(raw, 80);
  if (!text) return "";
  if (/centre/i.test(text)) return text;
  return VENUE_EMAIL_LABELS[text.toLowerCase()] || text;
}

function clockBit(raw: string): { hour24: number; label: string } | null {
  const bit = String(raw || "").trim();
  const m = bit.match(/^(\d{1,2})(?::|\.)(\d{2})$/) || bit.match(/^(\d{1,2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = m[2] != null ? Number(m[2]) : 0;
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return null;
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return {
    hour24: hour,
    label: `${h12}:${String(minute).padStart(2, "0")}`,
  };
}

/** 8-11 stay morning. 12 is noon. 1-7 are the afternoon sessions written without pm. */
function meridiemForHour(hour24: number): "am" | "pm" {
  if (hour24 >= 8 && hour24 <= 11) return "am";
  if (hour24 === 0) return "am";
  return "pm";
}

/** 5:00-5:30 → 5:00-5:30pm. Morning and afternoon in one range keep both. */
export function formatBookingClockRange(raw: unknown): string {
  const text = clean(raw, 80).replace(/[–—]/g, "-");
  if (!text) return "";
  if (/\b(am|pm)\b/i.test(text)) return text.replace(/\s+/g, "");
  const bits = text.split(/\s*(?:-|to)\s*/i).map((part) => part.trim()).filter(Boolean);
  const parsed = bits.map((bit) => clockBit(bit));
  if (!parsed.length || parsed.some((bit) => !bit)) return text;
  const start = parsed[0]!;
  const end = parsed[parsed.length - 1]!;
  const startMer = meridiemForHour(start.hour24);
  const endMer = meridiemForHour(end.hour24);
  if (parsed.length === 1) return `${start.label}${startMer}`;
  if (startMer === endMer) return `${start.label}-${end.label}${endMer}`;
  return `${start.label}${startMer}-${end.label}${endMer}`;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayFromIso(iso: string | null | undefined): string {
  const m = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return WEEKDAY_NAMES[dt.getUTCDay()] || "";
}

/** Last line of a session block when the parent may see the instructor. */
export const SESSION_BLOCK_PHOTO_MARK = "[[photo]]";

/**
 * Session block, one labelled line each.
 * Service, Date, Venue, then Instructor and the photo under that line.
 * Pass instructor only when the parent may see the worker (completed booking or existing client).
 */
export function sessionBlockEmailText(parts: {
  service?: unknown;
  venue?: unknown;
  day?: unknown;
  dateIso?: unknown;
  time?: unknown;
  instructor?: unknown;
  withPhoto?: boolean;
}): string | null {
  const service = clean(parts.service, 120);
  const time = formatBookingClockRange(parts.time);
  const dateIso = parts.dateIso == null ? "" : String(parts.dateIso);
  const day = clean(parts.day, 40) || weekdayFromIso(dateIso);
  const date = formatBookingDateLabel(dateIso);
  const when = [day, date].filter(Boolean).join(", ");
  const venue = venueEmailLabel(parts.venue);
  const instructor = clean(parts.instructor, 80);
  const lines: string[] = [];
  if (service && time) lines.push(`Service: ${service} (${time})`);
  else if (service) lines.push(`Service: ${service}`);
  else if (time) lines.push(`Service: ${time}`);
  if (when) lines.push(`Date: ${when}`);
  if (venue) lines.push(`Venue: ${venue}`);
  if (instructor) lines.push(`Instructor: ${instructor}`);
  if (instructor && parts.withPhoto) lines.push(SESSION_BLOCK_PHOTO_MARK);
  return lines.length ? lines.join("\n") : null;
}

/** Finish-booking place. Service, date and venue only. No instructor and no photo. */
export function requestedPlaceEmailText(parts: {
  service?: unknown;
  venue?: unknown;
  day?: unknown;
  dateIso?: unknown;
  time?: unknown;
  instructor?: unknown;
}): string | null {
  return sessionBlockEmailText({
    service: parts.service,
    venue: parts.venue,
    day: parts.day,
    dateIso: parts.dateIso,
    time: parts.time,
  });
}

export function bookingPlaceSummary(parts: {
  service?: unknown;
  venue?: unknown;
  day?: unknown;
  dateIso?: unknown;
  time?: unknown;
  trial?: boolean;
}): string | null {
  const bits = [
    clean(parts.service, 120),
    clean(parts.venue, 80),
    clean(parts.day, 40),
    formatBookingDateLabel(parts.dateIso == null ? null : String(parts.dateIso)),
    clean(parts.time, 80),
    parts.trial ? "Trial" : "",
  ].filter(Boolean);
  return bits.join(" · ") || null;
}

export function bookingRequestSummary(br: PortalBookingRequest | null): string | null {
  if (!br) return null;
  return bookingPlaceSummary({
    service: br.service_name,
    venue: br.venue,
    day: br.day,
    dateIso: br.date_iso,
    time: br.time,
    trial: br.booking_kind === "trial",
  }) || br.slot_id;
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

/**
 * Half term, Christmas, and Easter are not bookable for after-school or weekend.
 * Day Centre weekdays stay open through half term.
 */
export function advancePastClosedProgrammeDays(
  sessionIso: string,
  opts?: { day?: string | null; service?: string | null },
): string {
  let iso = String(sessionIso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const weekend =
    isWeekendDayName(opts?.day) ||
    weekdayIndexFromIso(iso) === 0 ||
    weekdayIndexFromIso(iso) === 6;
  const kind = weekend ? "weekend" : inferServiceKind(opts?.service || "");
  for (let i = 0; i < 16; i++) {
    if (!isClosedIso(iso, kind)) return iso;
    const next = bumpToNextWeekSameWeekday(iso);
    if (!next || next === iso) return iso;
    iso = next;
  }
  return iso;
}

export function resolveSessionDateIso(input: {
  dateIso?: string | null;
  day?: string | null;
  time?: string | null;
  asOfIso?: string | null;
  bookingKind?: string | null;
  service?: string | null;
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

  return advancePastClosedProgrammeDays(candidate, {
    day: input.day,
    service: input.service,
  });
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

/**
 * Overrides that consume a bookable open seat for that calendar day.
 * Staff covers / reassigns do not — parents can still start if another open
 * remains on the same venue + time band (e.g. Aurora Closed cover while
 * Luliya/Roberto stay No participant).
 */
const ADMIN_DAY_OVERRIDE_CONSUMES_OPEN = new Set([
  "client_replace_in_slot",
  "slot_close",
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

function normalizeClientToken(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Closed / non-bookable MADRE labels — never defer a new booking start. */
function isClosedOrOfficeHoldClient(raw: string | null | undefined): boolean {
  const cid = normalizeClientToken(raw);
  return (
    cid === "closed" ||
    cid === "no_client" ||
    cid === "casa" ||
    cid === "home" ||
    cid === "manager" ||
    cid === "off"
  );
}

function overrideMatchesVenueTimeBand(
  ov: AdminDayOverrideProbe,
  opts: { venue?: string | null; timeLabel?: string | null },
): { matched: boolean; hasBandHints: boolean } {
  const slotVenue = normalizeVenueToken(opts.venue);
  const ovVenue = normalizeVenueToken(ov.anchor_venue);
  const slotStart = hmTokenFromDbOrLabel(opts.timeLabel);
  const ovStart =
    hmTokenFromDbOrLabel(ov.anchor_start) ||
    hmTokenFromDbOrLabel(ov.anchor_time_slot_label);
  const hasBandHints = !!(slotVenue || slotStart);
  if (slotVenue && ovVenue && slotVenue !== ovVenue) {
    return { matched: false, hasBandHints };
  }
  if (slotStart && ovStart && slotStart !== ovStart) {
    return { matched: false, hasBandHints };
  }
  return { matched: true, hasBandHints };
}

/**
 * True when an active day override consumes a bookable open on this venue +
 * start band (not staff cover / Closed-only rows).
 */
export function adminDayOverrideConsumesBookableOpen(
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
  if (!ADMIN_DAY_OVERRIDE_CONSUMES_OPEN.has(t)) return false;
  if (isClosedOrOfficeHoldClient(ov.anchor_client_id)) return false;

  const { matched, hasBandHints } = overrideMatchesVenueTimeBand(ov, opts);
  if (!matched) return false;

  // Without time/venue we only count a clear day-fill of an open seat.
  if (!hasBandHints) {
    const cid = normalizeClientToken(ov.anchor_client_id);
    return (
      t === "client_replace_in_slot" &&
      (cid === "available" || cid === "open" || cid === "no_participant")
    );
  }
  return true;
}

/** @deprecated Prefer adminDayOverrideConsumesBookableOpen + standing open budget. */
export function adminDayOverrideBlocksNewBookingStart(
  ov: AdminDayOverrideProbe,
  opts: {
    sessionIso: string;
    venue?: string | null;
    timeLabel?: string | null;
  },
): boolean {
  return adminDayOverrideConsumesBookableOpen(ov, opts);
}

export function applyAdminDayOverrideStartBump(
  sessionIso: string,
  overrides: AdminDayOverrideProbe[],
  opts?: {
    venue?: string | null;
    timeLabel?: string | null;
    /** Standing open seats on this venue+time band (MADRE No participant). */
    standingOpenSeats?: number | null;
  },
): { iso: string; bumped: boolean; reason: string | null } {
  let iso = String(sessionIso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { iso, bumped: false, reason: null };
  }
  const list = Array.isArray(overrides) ? overrides : [];
  const openBudget = opts?.standingOpenSeats;
  const hasOpenBudget =
    typeof openBudget === "number" && Number.isFinite(openBudget);
  let bumped = false;
  for (let i = 0; i < 12; i++) {
    const fills = list.filter((ov) =>
      adminDayOverrideConsumesBookableOpen(ov, {
        sessionIso: iso,
        venue: opts?.venue,
        timeLabel: opts?.timeLabel,
      })
    );
    /* One closed instructor must not skip the day while another seat is free.
       Bump only when this band's open count is known and already used up. */
    const shouldBump = hasOpenBudget
      ? fills.length >= Math.max(0, openBudget as number)
      : false;
    if (!shouldBump) break;
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
 * resolveSessionDateIso + bump only when that day exhausts bookable opens
 * on the venue/time band (not staff covers / Closed rows).
 */
export function resolveSessionDateIsoWithAdminDayOverrides(
  input: Parameters<typeof resolveSessionDateIso>[0] & {
    venue?: string | null;
    standingOpenSeats?: number | null;
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
    standingOpenSeats: input.standingOpenSeats,
  });
  const iso = advancePastClosedProgrammeDays(bumped.iso, {
    day: input.day,
    service: input.service,
  });
  return {
    iso,
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
