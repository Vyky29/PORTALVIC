/**
 * Summer holiday crash courses — July 2026 (Tue–Fri weeks).
 * Climbing: 2 × 60′ slots/day · Swimming: 8 × 30′ slots/day.
 */

export type CrashActivity = "climbing" | "swimming";
export type CrashWeekId = "w1" | "w2";
export type CrashBookingMode = "weekly_pack" | "individual_days";

export type CrashSlotDef = {
  id: string;
  label: string;
  start: string;
  end: string;
};

export const CRASH_SUMMER_YEAR = 2026;

export const CRASH_SUMMER_WEEKS: Record<
  CrashWeekId,
  { id: CrashWeekId; label: string; dates: string[] }
> = {
  w1: {
    id: "w1",
    label: "Week 1 · Tue 21 – Fri 24 July 2026",
    dates: ["2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"],
  },
  w2: {
    id: "w2",
    label: "Week 2 · Tue 28 – Fri 31 July 2026",
    dates: ["2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"],
  },
};

export const CRASH_CLIMBING_SLOTS: CrashSlotDef[] = [
  { id: "c1", label: "11:00–12:00", start: "11:00", end: "12:00" },
  { id: "c2", label: "12:00–13:00", start: "12:00", end: "13:00" },
];

/** 8 × 30′ capacity units (2 instructors × 4 half-hours). */
export const CRASH_SWIMMING_SLOTS: CrashSlotDef[] = [
  { id: "s1", label: "16:30–17:00 · Instructor A", start: "16:30", end: "17:00" },
  { id: "s2", label: "16:30–17:00 · Instructor B", start: "16:30", end: "17:00" },
  { id: "s3", label: "17:00–17:30 · Instructor A", start: "17:00", end: "17:30" },
  { id: "s4", label: "17:00–17:30 · Instructor B", start: "17:00", end: "17:30" },
  { id: "s5", label: "17:30–18:00 · Instructor A", start: "17:30", end: "18:00" },
  { id: "s6", label: "17:30–18:00 · Instructor B", start: "17:30", end: "18:00" },
  { id: "s7", label: "18:00–18:30 · Instructor A", start: "18:00", end: "18:30" },
  { id: "s8", label: "18:00–18:30 · Instructor B", start: "18:00", end: "18:30" },
];

export const CRASH_PRICES = {
  climbing: { session: 75, weekly_pack: 300 },
  swimming: { session: 50, weekly_pack: 200 },
} as const;

export const CRASH_HOLD_MINUTES = 120;

export const CRASH_META = {
  climbing: {
    title: "Climbing",
    window: "11:00 am–1:00 pm",
    venue: "Westway Sports & Fitness Centre",
    address: "1 Crowthorne Road, London W10 6RP",
  },
  swimming: {
    title: "Swimming",
    window: "4:30 pm–6:30 pm",
    venue: "Everyone Active Acton Centre",
    address: "High Street, Acton, London W3 6NE",
    poolNote: "Tue & Thu: Big Pool · Wed & Fri: Teaching Pool",
  },
} as const;

export function crashSlotsFor(activity: CrashActivity): CrashSlotDef[] {
  return activity === "climbing" ? CRASH_CLIMBING_SLOTS : CRASH_SWIMMING_SLOTS;
}

export function crashSlotById(activity: CrashActivity, slotId: string): CrashSlotDef | null {
  return crashSlotsFor(activity).find((s) => s.id === slotId) || null;
}

export function crashWeekDates(weekId: CrashWeekId): string[] {
  return CRASH_SUMMER_WEEKS[weekId]?.dates?.slice() || [];
}

export function isCrashSummerDate(iso: string): boolean {
  return (
    CRASH_SUMMER_WEEKS.w1.dates.includes(iso) || CRASH_SUMMER_WEEKS.w2.dates.includes(iso)
  );
}

export function poolLabelForDate(iso: string): string {
  // Tue/Thu Big Pool; Wed/Fri Teaching Pool (ISO weekday: Mon=1 … Sun=7)
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 2 || dow === 4) return "Big Pool";
  if (dow === 3 || dow === 5) return "Teaching Pool";
  return "";
}

export type CrashLineInput = {
  activity: CrashActivity;
  session_date: string;
  slot_id: string;
};

export type CrashQuote =
  | {
      ok: true;
      amountGbp: number;
      lineDescription: string;
      lines: Array<CrashLineInput & { slot_label: string; unit_price_gbp: number }>;
    }
  | { ok: false; error: string };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Validate selection and price.
 * weekly_pack: one slot_id per activity covering all 4 week days.
 * individual_days: explicit date+slot lines (unique dates per activity).
 */
export function quoteCrashSummerBooking(input: {
  weekId: CrashWeekId;
  mode: CrashBookingMode;
  activities: CrashActivity[];
  /** Per activity: slot for weekly pack, or map date→slot for individual. */
  slotByActivity: Partial<
    Record<CrashActivity, string | Record<string, string>>
  >;
}): CrashQuote {
  const week = CRASH_SUMMER_WEEKS[input.weekId];
  if (!week) return { ok: false, error: "invalid_week" };
  const acts = Array.from(new Set(input.activities || [])).filter(
    (a): a is CrashActivity => a === "climbing" || a === "swimming",
  );
  if (!acts.length) return { ok: false, error: "activity_required" };

  const lines: Array<CrashLineInput & { slot_label: string; unit_price_gbp: number }> = [];
  let amount = 0;
  const descParts: string[] = [];

  for (const activity of acts) {
    const prices = CRASH_PRICES[activity];
    const meta = CRASH_META[activity];
    const slotSel = input.slotByActivity[activity];

    if (input.mode === "weekly_pack") {
      const slotId = typeof slotSel === "string" ? slotSel : "";
      const slot = crashSlotById(activity, slotId);
      if (!slot) return { ok: false, error: `slot_required_${activity}` };
      amount += prices.weekly_pack;
      descParts.push(
        `${meta.title} weekly pack (${week.label.split("·")[0].trim()}) · ${slot.label}`,
      );
      for (const date of week.dates) {
        lines.push({
          activity,
          session_date: date,
          slot_id: slot.id,
          slot_label: slot.label,
          unit_price_gbp: round2(prices.weekly_pack / week.dates.length),
        });
      }
    } else {
      const map =
        slotSel && typeof slotSel === "object" && !Array.isArray(slotSel)
          ? (slotSel as Record<string, string>)
          : {};
      const dates = Object.keys(map)
        .filter((d) => week.dates.includes(d))
        .sort();
      if (!dates.length) return { ok: false, error: `days_required_${activity}` };
      for (const date of dates) {
        const slot = crashSlotById(activity, String(map[date] || ""));
        if (!slot) return { ok: false, error: `slot_required_${activity}_${date}` };
        amount += prices.session;
        lines.push({
          activity,
          session_date: date,
          slot_id: slot.id,
          slot_label: slot.label,
          unit_price_gbp: prices.session,
        });
      }
      descParts.push(
        `${meta.title} · ${dates.length} day${dates.length === 1 ? "" : "s"} @ £${prices.session}`,
      );
    }
  }

  if (!lines.length || amount <= 0) return { ok: false, error: "empty_booking" };

  return {
    ok: true,
    amountGbp: round2(amount),
    lineDescription: `Summer crash course Jul 2026 — ${descParts.join("; ")}. Pay in full to confirm place.`,
    lines,
  };
}

export function crashCatalogPublic() {
  return {
    year: CRASH_SUMMER_YEAR,
    hold_minutes: CRASH_HOLD_MINUTES,
    weeks: Object.values(CRASH_SUMMER_WEEKS),
    prices: CRASH_PRICES,
    meta: CRASH_META,
    climbing_slots: CRASH_CLIMBING_SLOTS,
    swimming_slots: CRASH_SWIMMING_SLOTS,
    pay_in_full: true,
  };
}
