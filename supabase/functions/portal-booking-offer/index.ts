// @ts-nocheck — Edge Function (Deno).
//
// portal-booking-offer
// Public weekly offer + capacity from live MADRE (no participant names).
// Intensive July crash seats come from portal_crash_summer_booking_lines.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders } from "../_shared/parent_portal_auth.ts";
import type { MadreDoc } from "../_shared/portal_madre_fold_logic.ts";
import { buildWeeklyOfferFromMadre } from "../_shared/portal_booking_seat_helper.ts";
import { ensureReenrolUnconfirmedReleasedOnMadre } from "../_shared/portal_reenrol_release_madre.ts";
import {
  CRASH_HOLD_MINUTES,
  CRASH_INDIVIDUAL_WINDOWS,
  CRASH_PRICES,
  CRASH_SUMMER_FULLY_BOOKED,
  CRASH_SUMMER_WEEKS,
  CRASH_SWIM_TIME_BANDS,
  crashIndividualDaysOpenForWeek,
  crashIndividualRulesCopy,
  crashSummerOfferRangeCopy,
  crashSlotById,
  crashSlotsFor,
  crashWeekFillSnapshot,
  crashWeekLabelForActivity,
  type CrashActivity,
  type CrashWeekId,
} from "../_shared/crash_summer_2026.ts";

const TERM_KEY = "summer-2026";

const CORS = {
  ...parentPortalCorsHeaders,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Public weekly offer is Autumn 2026/27 — MADRE summer doc only supplies the standing roster template. */
const AUTUMN_TERM = {
  badge: "AUTUMN TERM 2026",
  label: "Autumn Term 2026",
  /** After-school + weekend weekly sessions */
  start: "2026-09-05",
  end: "2026-12-18",
  /** Day Centre opens a few days earlier */
  dayCentreStart: "2026-09-01",
  closedRanges: [{ start: "2026-10-26", end: "2026-10-30" }],
  range:
    "Sat 5 September 2026 – Fri 18 December 2026 · Day Centre from Tue 1 September",
};

async function loadCrashIntensive(admin: ReturnType<typeof createClient>) {
  const forceWeek2 =
    String(Deno.env.get("CRASH_WEEK2_FORCE_OPEN") || "").trim() === "1";
  const allWeeks = [CRASH_SUMMER_WEEKS.w1, CRASH_SUMMER_WEEKS.w2];
  const dates = allWeeks.flatMap((w) => w.dates);

  await admin
    .from("portal_crash_summer_booking_lines")
    .update({ status: "expired" })
    .eq("status", "awaiting_payment")
    .lt("hold_expires_at", new Date().toISOString());

  const { data: lines, error } = await admin
    .from("portal_crash_summer_booking_lines")
    .select("activity, session_date, slot_id, status")
    .in("session_date", dates.length ? dates : ["1970-01-01"])
    .in("status", ["awaiting_payment", "confirmed"]);

  if (error) {
    console.error("[portal-booking-offer] crash lines", error.message);
  }

  const fill = crashWeekFillSnapshot(lines || [], forceWeek2);
  const weeks = CRASH_SUMMER_FULLY_BOOKED
    ? allWeeks
    : allWeeks.filter((w) => fill.weeks_open.includes(w.id));
  const week2Open = CRASH_SUMMER_FULLY_BOOKED || fill.week2_open;
  const w1Open = !CRASH_SUMMER_FULLY_BOOKED && crashIndividualDaysOpenForWeek("w1");
  const w2Open =
    !CRASH_SUMMER_FULLY_BOOKED && week2Open && crashIndividualDaysOpenForWeek("w2");
  const individualOpen = w1Open || w2Open;

  const taken = new Set(
    (lines || []).map((r) => `${r.activity}|${r.session_date}|${r.slot_id}`),
  );

  const activities: {
    id: CrashActivity;
    venue: string;
    activityName: string;
  }[] = [
    { id: "climbing", venue: "Westway", activityName: "Climbing Activity" },
    { id: "swimming", venue: "Acton", activityName: "Aquatic Activity" },
  ];

  function formatSessionClock(hhmm: string): string {
    const [h, m] = String(hhmm || "00:00").split(":");
    const hour = String(Number(h) || 0);
    const min = String(m || "00").padStart(2, "0");
    if (min === "00") return hour;
    return `${hour}:${min}`;
  }

  function bandTimeLabel(start: string, end: string): string {
    return `${formatSessionClock(start)} – ${formatSessionClock(end)}`;
  }

  /**
   * Public pack rows: one per bookable time.
   * Aquatic: each 30′ band has capacity 2 (Instructor A + B).
   * Climbing: each 60′ hour has capacity 1 (one instructor) — waiting-list hours excluded.
   */
  function packUnitsFor(activity: CrashActivity): {
    unitId: string;
    slotIds: string[];
    start: string;
    end: string;
  }[] {
    if (activity === "swimming") {
      return CRASH_SWIM_TIME_BANDS.map((band, i) => {
        const first = crashSlotById("swimming", band[0] || "") ||
          crashSlotsFor("swimming")[0]!;
        return {
          unitId: `band${i + 1}`,
          slotIds: band.slice(),
          start: first.start,
          end: first.end,
        };
      });
    }
    return crashSlotsFor("climbing", { bookableOnly: true }).map((slot) => ({
      unitId: slot.id,
      slotIds: [slot.id],
      start: slot.start,
      end: slot.end,
    }));
  }

  function activityDatesForWeek(
    week: (typeof CRASH_SUMMER_WEEKS)[CrashWeekId],
    activity: CrashActivity,
  ): string[] {
    if (activity === "climbing") return (week.climbing_dates || week.dates).slice();
    return (week.swimming_dates || week.dates).slice();
  }

  const intensiveSlots: Record<string, unknown>[] = [];

  // Weekly packs: one row per time unit (parents book another row to add more time).
  for (const week of weeks) {
    for (const act of activities) {
      const weekLabel =
        week.id === "w1" || week.id === "w2"
          ? crashWeekLabelForActivity(week.id, act.id).replace(/ 2026$/, "").replace(" July", " Jul")
          : week.label;
      const packPrice =
        act.id === "climbing"
          ? CRASH_PRICES.climbing.weekly_pack
          : CRASH_PRICES.swimming.weekly_pack;
      const actDates = activityDatesForWeek(week, act.id);
      for (const unit of packUnitsFor(act.id)) {
        let packFree = 0;
        for (const slotId of unit.slotIds) {
          const freeAllWeek =
            !CRASH_SUMMER_FULLY_BOOKED &&
            actDates.length > 0 &&
            actDates.every((date) => !taken.has(`${act.id}|${date}|${slotId}`));
          if (freeAllWeek) packFree += 1;
        }
        intensiveSlots.push({
          id: `crash-pack-${week.id}-${act.id}-${unit.unitId}`,
          serviceId: "intensive",
          blockId: "summer_july",
          weekId: week.id,
          bookingMode: "weekly_pack",
          crashActivity: act.id,
          activityName: act.activityName,
          venue: act.venue,
          day: weekLabel,
          timeLabel: bandTimeLabel(unit.start, unit.end),
          packLabel: "4-day week pack",
          sortTime: unit.start,
          capacity: unit.slotIds.length,
          taken: Math.max(0, unit.slotIds.length - packFree),
          packPrice,
          slotIds: unit.slotIds,
          dateIso: actDates[0] || week.dates[0],
        });
      }
    }
  }

  // Loose / individual hours only in each week's Fri–Sun unlock window.
  for (const week of weeks) {
    if (!crashIndividualDaysOpenForWeek(week.id)) continue;
    for (const act of activities) {
      for (const date of activityDatesForWeek(week, act.id)) {
        const d = new Date(`${date}T12:00:00Z`);
        const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
        const dayLabel = `${week.id === "w1" ? "Week 1" : "Week 2"} · ${dow} ${Number(date.slice(8, 10))} Jul · individual`;
        for (const unit of packUnitsFor(act.id)) {
          let booked = 0;
          for (const slotId of unit.slotIds) {
            if (taken.has(`${act.id}|${date}|${slotId}`)) booked += 1;
          }
          intensiveSlots.push({
            id: `crash-day-${act.id}-${date}-${unit.unitId}`,
            serviceId: "intensive",
            blockId: "summer_july",
            weekId: week.id as CrashWeekId,
            bookingMode: "individual_days",
            crashActivity: act.id,
            activityName: act.activityName,
            venue: act.venue,
            day: dayLabel,
            timeLabel: bandTimeLabel(unit.start, unit.end),
            packLabel: "individual hours",
            sortTime: `${unit.start}-d`,
            capacity: unit.slotIds.length,
            taken: booked,
            slotIds: unit.slotIds,
            dateIso: date,
          });
        }
      }
    }
  }

  const halfTermBlocks: {
    id: string;
    badge: string;
    title: string;
    range: string;
    badgeIcon: string;
    sort: number;
    dates: { iso: string; label: string }[];
    enquireOnly: boolean;
  }[] = [
    {
      id: "oct_ht",
      badge: "AUTUMN HALF TERM 2026",
      title: "Autumn half-term intensives",
      range: "Mon 26 – Thu 29 October 2026 · booking opens closer to the dates",
      badgeIcon: "leaf",
      sort: 2,
      dates: [
        { iso: "2026-10-26", label: "26 Oct" },
        { iso: "2026-10-27", label: "27 Oct" },
        { iso: "2026-10-28", label: "28 Oct" },
        { iso: "2026-10-29", label: "29 Oct" },
      ],
      enquireOnly: true,
    },
    {
      id: "feb_ht",
      badge: "SPRING HALF TERM 2027",
      title: "Spring half-term intensives",
      range: "Mon 15 – Thu 18 February 2027 · booking opens closer to the dates",
      badgeIcon: "leaf",
      sort: 3,
      dates: [
        { iso: "2027-02-15", label: "15 Feb" },
        { iso: "2027-02-16", label: "16 Feb" },
        { iso: "2027-02-17", label: "17 Feb" },
        { iso: "2027-02-18", label: "18 Feb" },
      ],
      enquireOnly: true,
    },
    {
      id: "may_ht",
      badge: "SUMMER HALF TERM 2027",
      title: "Summer half-term intensives",
      range: "Mon 31 May – Thu 3 June 2027 · booking opens closer to the dates",
      badgeIcon: "leaf",
      sort: 4,
      dates: [
        { iso: "2027-05-31", label: "31 May" },
        { iso: "2027-06-01", label: "1 Jun" },
        { iso: "2027-06-02", label: "2 Jun" },
        { iso: "2027-06-03", label: "3 Jun" },
      ],
      enquireOnly: true,
    },
  ];

  for (const block of halfTermBlocks) {
    for (const act of activities) {
      intensiveSlots.push({
        id: `ht-${block.id}-${act.id}`,
        serviceId: "intensive",
        blockId: block.id,
        crashActivity: act.id,
        activityName: act.activityName,
        venue: act.venue,
        day: "Half term block",
        timeLabel: "Times TBC",
        packLabel: "enquire",
        sortTime: "10:00",
        capacity: 1,
        taken: 0,
        enquireOnly: true,
      });
    }
  }

  const summerRange = CRASH_SUMMER_FULLY_BOOKED
    ? "FULLY BOOKED · Week 1 (20–24 July) and Week 2 (28–31 July)"
    : crashSummerOfferRangeCopy(week2Open);

  return {
    hold_minutes: CRASH_HOLD_MINUTES,
    individual_days_open: individualOpen,
    individual_days_open_by_week: { w1: w1Open, w2: w2Open },
    individual_windows: CRASH_INDIVIDUAL_WINDOWS,
    rules: crashIndividualRulesCopy(week2Open),
    week1_fill_pct: fill.week1_fill_pct,
    week2_open: week2Open,
    weeks_open: CRASH_SUMMER_FULLY_BOOKED ? ["w1", "w2"] : fill.weeks_open,
    fully_booked: CRASH_SUMMER_FULLY_BOOKED,
    slots: intensiveSlots,
    blocks: [
      {
        id: "summer_july",
        badge: "JULY 2026",
        title: "July Intensive Courses & Camps",
        range: summerRange,
        badgeIcon: "sun",
        sort: 1,
        bookAsWeekPack: true,
        individualDaysOpen: individualOpen,
        individualDaysOpenByWeek: { w1: w1Open, w2: w2Open },
        week2Open,
        week1FillPct: fill.week1_fill_pct,
        dates: weeks.flatMap((w) =>
          w.dates.map((iso) => ({
            iso,
            label: `${Number(iso.slice(8, 10))} Jul`,
          })),
        ),
      },
      ...halfTermBlocks,
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
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

  // Thu 23 Jul 2026+: auto-release unconfirmed / withdrawn standing seats on MADRE
  // so free spaces appear on the public offer without waiting for a manual patch.
  try {
    const release = await ensureReenrolUnconfirmedReleasedOnMadre(supabase);
    if (release.ok && release.changed > 0) {
      console.log(
        "[portal-booking-offer] reenrol MADRE release",
        release.changed,
        "rev",
        release.revision,
      );
    } else if (!release.ok) {
      console.error("[portal-booking-offer] reenrol MADRE release", release.error);
    }
  } catch (err) {
    console.error("[portal-booking-offer] reenrol MADRE release", err);
  }

  const { data: madreRow, error: madreErr } = await supabase
    .from("portal_madre_document")
    .select("document, revision, updated_at, term_key")
    .eq("term_key", TERM_KEY)
    .maybeSingle();

  if (madreErr) {
    console.error("[portal-booking-offer] madre", madreErr.message);
    return json(500, { ok: false, error: "madre_load_failed" });
  }
  if (!madreRow?.document) {
    return json(404, { ok: false, error: "madre_missing" });
  }

  const weekly = buildWeeklyOfferFromMadre(madreRow.document as MadreDoc);
  const intensive = await loadCrashIntensive(supabase);

  // Soft holds from new-client registration forms (Booking Portal → registration).
  await supabase
    .from("portal_booking_slot_reservations")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("status", "pending")
    .lt("hold_expires_at", new Date().toISOString());

  const { data: holds, error: holdsErr } = await supabase
    .from("portal_booking_slot_reservations")
    .select("slot_id")
    .eq("status", "pending");

  if (holdsErr) {
    console.warn("[portal-booking-offer] slot holds", holdsErr.message);
  }

  const holdCounts = new Map<string, number>();
  for (const h of holds || []) {
    const sid = String(h.slot_id || "").trim();
    if (!sid) continue;
    holdCounts.set(sid, (holdCounts.get(sid) || 0) + 1);
  }

  if (holdCounts.size) {
    for (const slot of weekly.slots) {
      const extra = holdCounts.get(slot.id) || 0;
      if (!extra) continue;
      slot.taken = Math.min(slot.capacity, (Number(slot.taken) || 0) + extra);
    }
    for (const slot of intensive.slots) {
      const extra = holdCounts.get(String(slot.id || "")) || 0;
      if (!extra) continue;
      slot.taken = Math.min(
        Number(slot.capacity) || 0,
        (Number(slot.taken) || 0) + extra,
      );
    }
  }

  const intensiveService = {
    id: "intensive",
    name: "Intensive Courses & Camps",
    tier: "more",
    ageHint: "From 3 years+",
    durationHint: "Summer crash + half-term blocks",
    priceHint: "Course packs — ask the office",
    pricePerSession: null,
    blurb:
      "Holiday intensives and camps: summer crash weeks in July (live seats), then October, February and May half terms. Limited daily places — weekly packs often have priority.",
    venues: ["Westway", "Acton"],
    intensiveBlocks: true,
  };

  return json(200, {
    ok: true,
    source: "live",
    /** MADRE standing roster still under summer-2026 key — weekly offer UI is Autumn. */
    madre_term_key: madreRow.term_key || TERM_KEY,
    offer_term: "autumn-2026",
    madre_revision: madreRow.revision ?? null,
    madre_updated_at: madreRow.updated_at ?? null,
    term: {
      badge: AUTUMN_TERM.badge,
      label: AUTUMN_TERM.label,
      range: AUTUMN_TERM.range,
    },
    TERM_BADGE: AUTUMN_TERM.badge,
    TERM_LABEL: AUTUMN_TERM.label,
    TERM_RANGE: AUTUMN_TERM.range,
    TERM_CALENDAR: {
      start: AUTUMN_TERM.start,
      end: AUTUMN_TERM.end,
      closedRanges: AUTUMN_TERM.closedRanges,
    },
    TERM_CALENDAR_DAY_CENTRE: {
      start: AUTUMN_TERM.dayCentreStart,
      end: AUTUMN_TERM.end,
      closedRanges: AUTUMN_TERM.closedRanges,
    },
    SERVICES: [...weekly.services, intensiveService],
    MOCK_SLOTS: [...weekly.slots, ...intensive.slots],
    INTENSIVE_BLOCKS: intensive.blocks,
    stats: {
      madre_rows: weekly.rowCount,
      weekly_slots: weekly.slots.length,
      intensive_slots: intensive.slots.length,
      madre_meta_from: weekly.termFrom,
      madre_meta_to: weekly.termTo,
      pending_slot_holds: holdCounts.size
        ? [...holdCounts.values()].reduce((a, b) => a + b, 0)
        : 0,
    },
  });
});
