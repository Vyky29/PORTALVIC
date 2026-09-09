/**
 * Ops-only booking seat identity: which instructor open was claimed.
 * Parents never see this until they are CLIENT (Participant's Team).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { madreToAdapterRows, type MadreDoc } from "./portal_madre_fold_logic.ts";
import { BOOKING_SLOT_HOLD_STATUSES } from "./portal_booking_pay_hold.ts";

export const MADRE_BOOKING_TERM_KEY = "summer-2026";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function normName(v: unknown): string {
  return clean(v, 80)
    .replace(/\s+/g, " ")
    .trim();
}

/** Title-case display name from MADRE / UPPER keys. */
export function displayInstructorName(raw: unknown): string {
  const s = normName(raw);
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

export function extractInstructorFromNotes(notes: unknown): string {
  const m = String(notes || "").match(/\binstructor\s*=\s*([A-Za-z][A-Za-z\s.'-]{0,40})/i);
  if (!m || !m[1]) return "";
  return displayInstructorName(m[1]);
}

const PRESERVE_NOTE_KEYS = [
  "instructor",
  "booking_kind",
  "seats_needed",
  "support_regulated",
] as const;

/** Keep ops tags when rewriting reservation notes. */
export function mergeReservationNotes(
  previous: unknown,
  nextParts: Array<string | null | undefined>,
): string {
  const prev = String(previous || "");
  const kept: string[] = [];
  for (const key of PRESERVE_NOTE_KEYS) {
    const re = new RegExp(`\\b${key}\\s*=\\s*([^|]+)`, "i");
    const m = prev.match(re);
    if (m && m[1]) kept.push(`${key}=${clean(m[1], 60)}`);
  }
  const next = nextParts.map((p) => clean(p, 80)).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of [...kept, ...next]) {
    const k = part.split("=")[0]?.toLowerCase() || part.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(part);
  }
  return out.join("|").slice(0, 500);
}

function timeBandKey(raw: unknown): string {
  return clean(raw, 40)
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/\.00\b/g, "")
    .replace(/to/g, "-")
    .replace(/[^0-9.-]/g, "");
}

function venueKey(raw: unknown): string {
  return clean(raw, 80).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function dayKey(raw: unknown): string {
  return clean(raw, 20).toLowerCase().slice(0, 3);
}

function isOpenClient(clientName: string): boolean {
  const up = clean(clientName, 80).toUpperCase();
  return (
    up === "NO PARTICIPANT" ||
    up === "NOPARTICIPANT" ||
    up === "OPEN" ||
    up === "AVAILABLE" ||
    up === "FREE"
  );
}

function isSkipClient(clientName: string): boolean {
  const up = clean(clientName, 80).toUpperCase();
  return (
    !up ||
    up === "CLOSED" ||
    up === "NO CLIENT" ||
    up === "CASA" ||
    up === "HOME" ||
    up === "MANAGER" ||
    up === "OFF"
  );
}

/**
 * Instructors with a standing open (NO PARTICIPANT) on this band from MADRE.
 * Stable A–Z order so twins / concurrent holds get different opens.
 */
export function openInstructorsOnBandFromMadre(
  madre: MadreDoc,
  opts: {
    venue?: string | null;
    day?: string | null;
    timeLabel?: string | null;
  },
): string[] {
  const wantVenue = venueKey(opts.venue);
  const wantDay = dayKey(opts.day);
  const wantTime = timeBandKey(opts.timeLabel);
  if (!wantVenue || !wantDay || !wantTime) return [];

  const opens = new Set<string>();
  for (const row of madreToAdapterRows(madre)) {
    const client = String(row.client_name || "");
    if (isSkipClient(client) || !isOpenClient(client)) continue;
    const inst = displayInstructorName(row.instructors);
    if (!inst) continue;
    if (venueKey(row.venue) !== wantVenue) continue;
    if (dayKey(row.day) !== wantDay) continue;
    const rowTime = timeBandKey(row.time_slot);
    if (!rowTime || (rowTime !== wantTime && !rowTime.startsWith(wantTime.slice(0, 4)))) {
      /* allow "4-4.30" vs "4.00-4.30" */
      const a = rowTime.replace(/\./g, "");
      const b = wantTime.replace(/\./g, "");
      if (a !== b && !a.startsWith(b) && !b.startsWith(a)) continue;
    }
    opens.add(inst);
  }
  return [...opens].sort((a, b) => a.localeCompare(b));
}

/** Instructors already stamped on active holds for this slot (exclude for twin). */
export async function instructorsHeldOnSlot(
  admin: SupabaseClient,
  slotId: string,
  excludeReservationId?: string | null,
): Promise<string[]> {
  const sid = clean(slotId, 160);
  if (!sid) return [];
  const { data } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, notes, status, hold_expires_at")
    .eq("slot_id", sid)
    .in("status", [...BOOKING_SLOT_HOLD_STATUSES, "validated", "awaiting_payment"]);
  const now = Date.now();
  const out: string[] = [];
  for (const row of data || []) {
    if (excludeReservationId && String(row.id) === excludeReservationId) continue;
    const exp = row.hold_expires_at ? Date.parse(String(row.hold_expires_at)) : NaN;
    if (Number.isFinite(exp) && exp < now && String(row.status) !== "validated") continue;
    const inst = extractInstructorFromNotes(row.notes);
    if (inst) out.push(inst);
  }
  return out;
}

/**
 * Pick the open instructor for this booking band.
 * Prefer unused opens when another hold already claimed one on the same slot.
 */
export async function pickOpenInstructorForBand(
  admin: SupabaseClient,
  opts: {
    slotId?: string | null;
    venue?: string | null;
    day?: string | null;
    timeLabel?: string | null;
    excludeReservationId?: string | null;
  },
): Promise<string | null> {
  const { data: madreRow } = await admin
    .from("portal_madre_document")
    .select("document")
    .eq("term_key", MADRE_BOOKING_TERM_KEY)
    .maybeSingle();
  if (!madreRow?.document) return null;

  const opens = openInstructorsOnBandFromMadre(madreRow.document as MadreDoc, opts);
  if (!opens.length) return null;

  const held = opts.slotId
    ? await instructorsHeldOnSlot(admin, opts.slotId, opts.excludeReservationId)
    : [];
  const heldSet = new Set(held.map((h) => h.toLowerCase()));
  const free = opens.filter((o) => !heldSet.has(o.toLowerCase()));
  const pick = (free.length ? free : opens)[0] || null;
  return pick;
}

export function notesWithInstructor(
  previousOrParts: unknown,
  instructor: string | null | undefined,
  extraParts: Array<string | null | undefined> = [],
): string {
  const inst = displayInstructorName(instructor);
  const parts = [
    ...(inst ? [`instructor=${inst}`] : []),
    ...extraParts,
  ];
  if (typeof previousOrParts === "string" || previousOrParts == null) {
    return mergeReservationNotes(previousOrParts, parts);
  }
  return mergeReservationNotes("", [
    ...((previousOrParts as string[]) || []),
    ...parts,
  ]);
}
