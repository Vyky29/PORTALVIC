/**
 * Load active schedule_overrides for booking first-session bump checks.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  addDaysIso,
  calendarDateIsoInLondon,
  resolveSessionDateIsoWithAdminDayOverrides,
  type AdminDayOverrideProbe,
} from "./portal_booking_context.ts";

export async function loadAdminDayOverridesForBookingWindow(
  admin: SupabaseClient,
  opts?: { fromIso?: string | null; daysAhead?: number },
): Promise<AdminDayOverrideProbe[]> {
  const from = String(opts?.fromIso || calendarDateIsoInLondon()).slice(0, 10);
  const ahead = Math.max(7, Math.min(Number(opts?.daysAhead) || 21, 60));
  const to = addDaysIso(from, ahead) || from;
  const { data, error } = await admin
    .from("schedule_overrides")
    .select(
      "session_date, override_type, status, anchor_venue, anchor_start, anchor_end, anchor_time_slot_label, anchor_client_id",
    )
    .eq("status", "active")
    .gte("session_date", from)
    .lte("session_date", to)
    .limit(800);
  if (error) {
    console.warn("[loadAdminDayOverridesForBookingWindow]", error.message);
    return [];
  }
  return (data || []) as AdminDayOverrideProbe[];
}

export function resolveBookableSessionWithAdminOverrides(
  input: {
    dateIso?: string | null;
    day?: string | null;
    time?: string | null;
    venue?: string | null;
    asOfIso?: string | null;
    bookingKind?: string | null;
    now?: Date;
  },
  overrides: AdminDayOverrideProbe[],
) {
  return resolveSessionDateIsoWithAdminDayOverrides(input, overrides);
}
