import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/** Confirm summer crash holds once the linked invoice is paid in full. */
export async function confirmCrashSummerBookingsForInvoice(
  admin: SupabaseClient,
  invoiceShareId: string,
): Promise<number> {
  const id = String(invoiceShareId || "").trim();
  if (!id) return 0;
  const confirmedAt = new Date().toISOString();
  const { data: crashRows, error } = await admin
    .from("portal_crash_summer_bookings")
    .update({ status: "confirmed", updated_at: confirmedAt, hold_expires_at: null })
    .eq("invoice_share_id", id)
    .in("status", ["awaiting_payment", "confirmed"])
    .select("id");
  if (error) {
    console.error("[confirmCrashSummerBookingsForInvoice]", error.message);
    return 0;
  }
  const ids = (crashRows || []).map((r) => String(r.id)).filter(Boolean);
  if (!ids.length) return 0;
  await admin
    .from("portal_crash_summer_booking_lines")
    .update({ status: "confirmed", hold_expires_at: null })
    .in("booking_id", ids)
    .in("status", ["awaiting_payment", "confirmed"]);
  return ids.length;
}
