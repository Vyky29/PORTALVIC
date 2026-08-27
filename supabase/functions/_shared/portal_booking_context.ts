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
  asOfIso?: string | null;
}): string | null {
  const floor = firstBookableSessionFloorIso(input.day);
  const direct = clean(input.dateIso, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) {
    if (floor && direct < floor) return nextWeekdayOnOrAfter(input.day, floor);
    return direct;
  }
  const asOf = clean(input.asOfIso, 10) || new Date().toISOString().slice(0, 10);
  const base = floor && asOf < floor ? floor : asOf;
  return nextWeekdayOnOrAfter(input.day, base);
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
