// @ts-nocheck — Edge Function (Deno).
//
// portal-booking-offer
// Public weekly offer + capacity from live MADRE (no participant names).
// Intensive July crash seats come from portal_crash_summer_booking_lines.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders } from "../_shared/parent_portal_auth.ts";
import type { MadreDoc } from "../_shared/portal_madre_fold_logic.ts";
import { buildWeeklyOfferFromMadre } from "../_shared/portal_booking_seat_helper.ts";
import {
  CRASH_HOLD_MINUTES,
  CRASH_SUMMER_WEEKS,
  crashSlotsFor,
  type CrashActivity,
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

function prettyIso(iso: string): string {
  const p = String(iso || "").slice(0, 10).split("-");
  if (p.length !== 3) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const m = months[Number(p[1]) - 1] || p[1];
  return `${Number(p[2])} ${m} ${p[0]}`;
}

function formatTermBadge(from: string | null, to: string | null): {
  badge: string;
  label: string;
  range: string;
} {
  // MADRE live document is currently term_key summer-2026; badge follows meta dates.
  if (from && to) {
    const y = from.slice(0, 4);
    const month = Number(from.slice(5, 7) || 0);
    let season = "TERM";
    if (month >= 9) season = "AUTUMN TERM";
    else if (month >= 1 && month <= 3) season = "SPRING TERM";
    else if (month >= 4 && month <= 8) season = "SUMMER TERM";
    return {
      badge: `${season} ${y}`.trim(),
      label: `${season} ${y}`.replace("TERM", "Term"),
      range: `${prettyIso(from)} – ${prettyIso(to)}`,
    };
  }
  return {
    badge: "SUMMER TERM 2026",
    label: "Summer Term 2026",
    range: "Live roster from MADRE",
  };
}

async function loadCrashIntensive(admin: ReturnType<typeof createClient>) {
  const weeks = [CRASH_SUMMER_WEEKS.w1, CRASH_SUMMER_WEEKS.w2];
  const dates = weeks.flatMap((w) => w.dates);

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

  const taken = new Set(
    (lines || []).map((r) => `${r.activity}|${r.session_date}|${r.slot_id}`),
  );

  const activities: { id: CrashActivity; venue: string; label: string }[] = [
    { id: "climbing", venue: "Westway", label: "Climbing" },
    { id: "swimming", venue: "Acton", label: "Swimming" },
  ];

  const intensiveSlots: Record<string, unknown>[] = [];
  for (const week of weeks) {
    for (const date of week.dates) {
      const d = new Date(`${date}T12:00:00Z`);
      const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
      const dayLabel = `${week.id === "w1" ? "Week 1" : "Week 2"} · ${dow} ${Number(date.slice(8, 10))} Jul`;
      for (const act of activities) {
        const defs = crashSlotsFor(act.id);
        let booked = 0;
        for (const slot of defs) {
          if (taken.has(`${act.id}|${date}|${slot.id}`)) booked += 1;
        }
        const start = defs[0]?.start || "10:00";
        const end = defs[defs.length - 1]?.end || "12:00";
        intensiveSlots.push({
          id: `crash-${act.id}-${date}`,
          serviceId: "intensive",
          blockId: "summer_july",
          venue: act.venue,
          day: dayLabel,
          timeLabel: `${start} – ${end} · ${act.label}`,
          sortTime: start,
          capacity: defs.length,
          taken: booked,
          dateIso: date,
        });
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
      badge: "OCTOBER HALF TERM 2026",
      title: "October half-term intensives",
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
      badge: "FEBRUARY HALF TERM 2027",
      title: "February half-term intensives",
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
      badge: "MAY HALF TERM 2027",
      title: "May half-term intensives",
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
    for (const venue of ["Westway", "Acton"] as const) {
      intensiveSlots.push({
        id: `ht-${block.id}-${venue.toLowerCase()}`,
        serviceId: "intensive",
        blockId: block.id,
        venue,
        day: "Half term block",
        timeLabel:
          venue === "Westway"
            ? "Climbing — course times TBC · enquire"
            : "Swimming — course times TBC · enquire",
        sortTime: "10:00",
        capacity: 1,
        taken: 0,
        enquireOnly: true,
      });
    }
  }

  return {
    hold_minutes: CRASH_HOLD_MINUTES,
    slots: intensiveSlots,
    blocks: [
      {
        id: "summer_july",
        badge: "SUMMER TERM 2026",
        title: "Summer holiday crash courses",
        range: "Week 1: Tue 21 – Fri 24 July · Week 2: Tue 28 – Fri 31 July 2026",
        badgeIcon: "sun",
        sort: 1,
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
  const term = formatTermBadge(weekly.termFrom, weekly.termTo);

  const intensiveService = {
    id: "intensive",
    name: "Intensive Courses & Camps",
    tier: "more",
    ageHint: "From 3 years+",
    durationHint: "Summer + half-term blocks",
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
    term_key: madreRow.term_key || TERM_KEY,
    madre_revision: madreRow.revision ?? null,
    madre_updated_at: madreRow.updated_at ?? null,
    term,
    TERM_BADGE: term.badge,
    TERM_LABEL: term.label,
    TERM_RANGE: term.range,
    TERM_CALENDAR: {
      start: weekly.termFrom || "2026-04-13",
      end: weekly.termTo || "2026-07-18",
      closedRanges: [],
    },
    SERVICES: [...weekly.services, intensiveService],
    MOCK_SLOTS: [...weekly.slots, ...intensive.slots],
    INTENSIVE_BLOCKS: intensive.blocks,
    stats: {
      madre_rows: weekly.rowCount,
      weekly_slots: weekly.slots.length,
      intensive_slots: intensive.slots.length,
    },
  });
});
