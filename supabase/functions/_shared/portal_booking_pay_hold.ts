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

async function shouldSkipTermPayHoldExpiry(
  admin: SupabaseClient,
  documentId: string,
): Promise<boolean> {
  const { data: toks } = await admin
    .from("portal_booking_completion_tokens")
    .select("invoice_share_id, choices_json")
    .eq("document_id", documentId)
    .not("invoice_share_id", "is", null);
  if (!toks?.length) return false;

  const isTrial = toks.some((t) => {
    const c =
      t.choices_json && typeof t.choices_json === "object"
        ? (t.choices_json as Record<string, unknown>)
        : {};
    return String(c.booking_scope || "") === "trial_session";
  });
  if (isTrial) return false;

  const invIds = [
    ...new Set(
      toks.map((t) => String(t.invoice_share_id || "").trim()).filter(Boolean),
    ),
  ];
  if (!invIds.length) return false;

  const { data: invRows } = await admin
    .from("portal_parent_invoice_share")
    .select("payment_status, parent_reported_paid_at")
    .in("id", invIds);
  return (invRows || []).some((inv) => {
    const pay = String(inv.payment_status || "").toLowerCase();
    return pay === "pending_confirmation" || !!inv.parent_reported_paid_at;
  });
}

/**
 * Expire unpaid pay-window holds and free the seat on the live offer.
 * Term bookings with parent-reported payment stay held until admin confirms.
 */
export async function expireUnpaidBookingPayHolds(
  admin: SupabaseClient,
): Promise<{ expired: number }> {
  const now = new Date().toISOString();

  const { data: awaitingCandidates, error: selAwaitingErr } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, document_id")
    .eq("status", "awaiting_payment")
    .lt("hold_expires_at", now);

  if (selAwaitingErr) {
    console.warn("[expireUnpaidBookingPayHolds] select awaiting", selAwaitingErr.message);
  }

  const { data: taggedCandidates, error: selTaggedErr } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, document_id")
    .eq("status", "validated")
    .ilike("notes", "%pay_hold_30m%")
    .lt("hold_expires_at", now);

  if (selTaggedErr) {
    console.warn("[expireUnpaidBookingPayHolds] select tagged", selTaggedErr.message);
  }

  const candidateIds: string[] = [];
  for (const row of [...(awaitingCandidates || []), ...(taggedCandidates || [])]) {
    const docId = String(row.document_id || "").trim();
    if (docId && (await shouldSkipTermPayHoldExpiry(admin, docId))) {
      continue;
    }
    candidateIds.push(String(row.id));
  }

  if (!candidateIds.length) return { expired: 0 };

  const { data: awaitingRows, error: awaitingErr } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      status: "expired",
      released_at: now,
      updated_at: now,
      notes: "expired_unpaid_pay_hold_30m",
    })
    .in("id", candidateIds)
    .select("id, document_id");

  if (awaitingErr) {
    console.warn("[expireUnpaidBookingPayHolds] awaiting", awaitingErr.message);
  }

  const rows = awaitingRows || [];
  let expired = 0;
  for (const row of rows) {
    const docId = String(row.document_id || "").trim();
    if (!docId) continue;
    expired += 1;

    await admin
      .from("portal_booking_completion_tokens")
      .update({
        status: "expired_unpaid",
        updated_at: now,
      })
      .eq("document_id", docId)
      .in("status", ["awaiting_payment", "awaiting_office_payment", "choices_saved"]);

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
