/**
 * After finish-booking creates an invoice (bank / card / GC setup),
 * the seat stays held only for this short pay window — then returns live.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const BOOKING_PAY_HOLD_MINUTES = 30;

export function bookingPayHoldExpiresAt(fromMs = Date.now()): string {
  return new Date(fromMs + BOOKING_PAY_HOLD_MINUTES * 60 * 1000).toISOString();
}

/** Active reservation statuses that occupy a Booking Portal seat. */
export const BOOKING_SLOT_HOLD_STATUSES = [
  "pending",
  "validated",
  "awaiting_payment",
] as const;

/**
 * Expire unpaid pay-window holds and free the seat on the live offer.
 * Also marks finish-booking tokens so the parent UI can show “place released”.
 */
export async function expireUnpaidBookingPayHolds(
  admin: SupabaseClient,
): Promise<{ expired: number }> {
  const now = new Date().toISOString();
  const { data: rows, error } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      status: "expired",
      released_at: now,
      updated_at: now,
      notes: "expired_unpaid_pay_hold_30m",
    })
    .eq("status", "awaiting_payment")
    .lt("hold_expires_at", now)
    .select("id, document_id");

  if (error) {
    console.warn("[expireUnpaidBookingPayHolds]", error.message);
    return { expired: 0 };
  }

  const expired = (rows || []).length;
  for (const row of rows || []) {
    const docId = String(row.document_id || "").trim();
    if (!docId) continue;
    await admin
      .from("portal_booking_completion_tokens")
      .update({
        status: "expired_unpaid",
        updated_at: now,
      })
      .eq("document_id", docId)
      .in("status", ["awaiting_payment", "awaiting_office_payment", "choices_saved"]);

    // Hide unpaid finish-booking invoices so the place is not “half booked”.
    const { data: toks } = await admin
      .from("portal_booking_completion_tokens")
      .select("invoice_share_id")
      .eq("document_id", docId)
      .not("invoice_share_id", "is", null);
    const invIds = [
      ...new Set(
        (toks || [])
          .map((t) => String(t.invoice_share_id || "").trim())
          .filter(Boolean),
      ),
    ];
    if (invIds.length) {
      await admin
        .from("portal_parent_invoice_share")
        .update({
          share_status: "hidden",
          notes: "Auto-hidden · unpaid 30-minute booking pay window expired",
          updated_at: now,
        })
        .in("id", invIds)
        .eq("payment_status", "unpaid");
    }
  }

  return { expired };
}
