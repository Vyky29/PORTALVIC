// @ts-nocheck — Edge Function (Deno).
//
// portal-crash-summer-availability
// Public catalog + occupied slot map for Summer Jul 2026 crash courses.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders } from "../_shared/parent_portal_auth.ts";
import {
  CRASH_HOLD_MINUTES,
  CRASH_SUMMER_WEEKS,
  crashCatalogPublic,
  crashIndividualDaysOpenForWeek,
  crashIndividualRulesCopy,
  crashIndividualWindowFor,
  crashIsBookingWeekOpen,
  crashSlotsFor,
  crashWeekFillSnapshot,
  type CrashActivity,
  type CrashWeekId,
} from "../_shared/crash_summer_2026.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function forceWeek2Open(): boolean {
  return String(Deno.env.get("CRASH_WEEK2_FORCE_OPEN") || "").trim() === "1";
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

  // Always load Week 1 (+ Week 2 if relevant) hold lines so fill % is accurate.
  const allDates = [
    ...CRASH_SUMMER_WEEKS.w1.dates,
    ...CRASH_SUMMER_WEEKS.w2.dates,
  ];
  const { data: allLines, error: fillError } = await supabase
    .from("portal_crash_summer_booking_lines")
    .select("activity, session_date, slot_id, status")
    .in("session_date", allDates)
    .in("status", ["awaiting_payment", "confirmed"]);

  if (fillError) {
    console.error("[portal-crash-summer-availability] fill", fillError.message);
    return json(500, { ok: false, error: "availability_failed" });
  }

  const fill = crashWeekFillSnapshot(allLines || [], forceWeek2Open());
  const week2Open = fill.week2_open;
  const catalog = crashCatalogPublic({ openWeekIds: fill.weeks_open });

  if (weekFilter && !crashIsBookingWeekOpen(weekFilter, fill.week1_fill, fill.force_week2)) {
    return json(403, {
      ok: false,
      error: "week_not_open",
      message:
        "Week 2 opens when Week 1 reaches 80% of places. Only Week 1 (Tue 21 – Fri 24 July) is open for booking right now.",
      catalog,
      ...fill,
      rules: crashIndividualRulesCopy(false),
    });
  }

  const weeks = weekFilter
    ? catalog.weeks.filter((w) => w.id === weekFilter)
    : catalog.weeks;

  const dates = weeks.flatMap((w) => w.dates);
  const taken = new Set(
    (allLines || [])
      .filter((r) => dates.includes(String(r.session_date || "")))
      .map((r) => `${r.activity}|${r.session_date}|${r.slot_id}`),
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

  const w1Open = crashIndividualDaysOpenForWeek("w1");
  const w2OpenIndiv = week2Open && crashIndividualDaysOpenForWeek("w2");
  const weekFilterOpen =
    weekFilter === "w1"
      ? w1Open
      : weekFilter === "w2"
        ? w2OpenIndiv
        : w1Open || w2OpenIndiv;

  return json(200, {
    ok: true,
    catalog,
    capacity,
    hold_minutes: CRASH_HOLD_MINUTES,
    availability,
    individual_days_open: weekFilterOpen,
    individual_days_open_by_week: { w1: w1Open, w2: w2OpenIndiv },
    individual_windows: {
      w1: crashIndividualWindowFor("w1"),
      w2: crashIndividualWindowFor("w2"),
    },
    rules: crashIndividualRulesCopy(week2Open),
    pay_in_full_required: true,
    week1_taken: fill.week1_taken,
    week1_capacity: fill.week1_capacity,
    week1_fill: fill.week1_fill,
    week1_fill_pct: fill.week1_fill_pct,
    week2_open_at_fill: fill.week2_open_at_fill,
    week2_open: week2Open,
    weeks_open: fill.weeks_open,
  });
});
