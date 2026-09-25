/**
 * Slim hold-status helpers for public booking offer.
 * Keep this file free of SMTP / WhatsApp / Web Push so portal-booking-offer can boot.
 */

export const BOOKING_SLOT_HOLD_STATUSES = [
  "pending",
  "validated",
  "awaiting_payment",
] as const;

/** Timed pay holds stop occupying the seat when the clock ends (even before cron flips status). */
export function bookingHoldStillActive(
  holdExpiresAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (holdExpiresAt == null || String(holdExpiresAt).trim() === "") return true;
  const t = new Date(String(holdExpiresAt)).getTime();
  if (!Number.isFinite(t)) return true;
  return t > nowMs;
}

export function filterActiveBookingHolds<
  T extends { hold_expires_at?: unknown; status?: unknown; notes?: unknown },
>(holds: T[] | null | undefined, nowMs = Date.now()): T[] {
  return (holds || []).filter((h) => {
    const st = String(h.status || "").toLowerCase();
    const notes = String(h.notes || "").toLowerCase();
    /*
     * Trial / EOD clear tags mean the standing seat is open again (e.g. Zaid
     * SwimFarm Sun 9-9.30). Do not keep painting Fully booked from a leftover
     * validated row after office released the trial hold.
     */
    if (
      notes.includes("trial_hold_cleared") ||
      notes.includes("released_post_trial") ||
      notes.includes("eod_no_decision")
    ) {
      return false;
    }
    /*
     * A validated trial row whose clock has passed must not keep the public
     * seat. The post-trial soft hold is a different row and is released at
     * end of day; the original trial row used to stay validated and paint
     * Fully booked (Elias / Youssef Wed Acton 4.00-4.30).
     */
    if (
      st === "validated" &&
      /booking_kind\s*=\s*trial/i.test(notes) &&
      !bookingHoldStillActive(
        h.hold_expires_at == null ? null : String(h.hold_expires_at),
        nowMs,
      )
    ) {
      return false;
    }
    // Pay-window / validated rows keep the public seat until maintenance flips
    // status (expireUnpaidBookingPayHolds). Do not free the offer on clock alone
    // while status is still awaiting_payment — that double-sold Sunday Climbing.
    if (st === "awaiting_payment" || st === "validated") return true;
    return bookingHoldStillActive(
      h.hold_expires_at == null ? null : String(h.hold_expires_at),
      nowMs,
    );
  });
}

/** PostgREST filter: soft holds with no clock, or clock still open. */
export function bookingActiveHoldExpiresFilter(nowIso = new Date().toISOString()): string {
  return `hold_expires_at.is.null,hold_expires_at.gt.${nowIso}`;
}
