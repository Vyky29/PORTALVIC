// @ts-nocheck — Edge Function (Deno).
//
// portal-crash-summer-availability
// Public catalog + occupied slot map for Summer Jul 2026 crash courses.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders } from "../_shared/parent_portal_auth.ts";
import {
  CRASH_HOLD_MINUTES,
  crashCatalogPublic,
  crashSlotsFor,
  type CrashActivity,
  type CrashWeekId,
} from "../_shared/crash_summer_2026.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

async function expireStaleHolds(admin: ReturnType<typeof createClient>) {
  const now = new Date().toISOString();
  await admin
    .from("portal_crash_summer_booking_lines")
    .update({ status: "expired" })
    .eq("status", "awaiting_payment")
    .lt("hold_expires_at", now);

  await admin
    .from("portal_crash_summer_bookings")
    .update({ status: "expired", updated_at: now })
    .eq("status", "awaiting_payment")
    .lt("hold_expires_at", now);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: parentPortalCorsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await expireStaleHolds(supabase);

  let weekFilter: CrashWeekId | "" = "";
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const w = String(body?.week_id || "").trim();
      if (w === "w1" || w === "w2") weekFilter = w;
    } catch {
      /* ignore */
    }
  } else {
    const u = new URL(req.url);
    const w = String(u.searchParams.get("week_id") || "").trim();
    if (w === "w1" || w === "w2") weekFilter = w;
  }

  const catalog = crashCatalogPublic();
  const weeks = weekFilter
    ? catalog.weeks.filter((w) => w.id === weekFilter)
    : catalog.weeks;

  const dates = weeks.flatMap((w) => w.dates);
  const { data: lines, error } = await supabase
    .from("portal_crash_summer_booking_lines")
    .select("activity, session_date, slot_id, status")
    .in("session_date", dates.length ? dates : ["1970-01-01"])
    .in("status", ["awaiting_payment", "confirmed"]);

  if (error) {
    console.error("[portal-crash-summer-availability]", error.message);
    return json(500, { ok: false, error: "availability_failed" });
  }

  const taken = new Set(
    (lines || []).map(
      (r) => `${r.activity}|${r.session_date}|${r.slot_id}`,
    ),
  );

  const activities: CrashActivity[] = ["climbing", "swimming"];
  const availability: Record<string, Record<string, Record<string, boolean>>> = {};
  for (const activity of activities) {
    availability[activity] = {};
    for (const date of dates) {
      availability[activity][date] = {};
      for (const slot of crashSlotsFor(activity)) {
        availability[activity][date][slot.id] = !taken.has(
          `${activity}|${date}|${slot.id}`,
        );
      }
    }
  }

  const capacity = {
    climbing_slots_per_day: crashSlotsFor("climbing").length,
    swimming_slots_per_day: crashSlotsFor("swimming").length,
  };

  return json(200, {
    ok: true,
    catalog,
    capacity,
    hold_minutes: CRASH_HOLD_MINUTES,
    availability,
    pay_in_full_required: true,
  });
});
