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

/** Same instructor consecutive half-hours (parents may book up to 90′ = 3). */
export const CRASH_SWIM_CHAINS: Record<"A" | "B", string[]> = {
  A: ["s1", "s3", "s5", "s7"],
  B: ["s2", "s4", "s6", "s8"],
};

export const CRASH_SWIM_MAX_SLOTS = 3;

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

/** Accept a single slot id or an array (swimming multi-slot). */
export function normalizeCrashSlotIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(raw.map((x) => String(x || "").trim()).filter(Boolean)),
    );
  }
  const one = String(raw == null ? "" : raw).trim();
  return one ? [one] : [];
}

export function swimChainForSlot(slotId: string): string[] | null {
  for (const chain of Object.values(CRASH_SWIM_CHAINS)) {
    if (chain.includes(slotId)) return chain.slice();
  }
  return null;
}

/** 1–3 consecutive half-hours with the same instructor. */
export function swimSlotsAreValidBlock(ids: string[]): boolean {
  const uniq = normalizeCrashSlotIds(ids);
  if (!uniq.length || uniq.length > CRASH_SWIM_MAX_SLOTS) return false;
  const chain = swimChainForSlot(uniq[0]);
  if (!chain) return false;
  if (!uniq.every((id) => chain.includes(id))) return false;
  const idxs = uniq.map((id) => chain.indexOf(id)).sort((a, b) => a - b);
  for (let i = 1; i < idxs.length; i++) {
    if (idxs[i] !== idxs[i - 1] + 1) return false;
  }
  return true;
}

export function swimBlockLabel(ids: string[]): string {
  const uniq = normalizeCrashSlotIds(ids);
  if (!uniq.length) return "";
  const ordered = orderSwimSlots(uniq);
  const first = crashSlotById("swimming", ordered[0]);
  const last = crashSlotById("swimming", ordered[ordered.length - 1]);
  if (!first || !last) return ordered.join(", ");
  const mins = ordered.length * 30;
  const who = first.label.includes("Instructor B") ? "Instructor B" : "Instructor A";
  return `${first.start}–${last.end} · ${who} (${mins}′)`;
}

export function orderSwimSlots(ids: string[]): string[] {
  const uniq = normalizeCrashSlotIds(ids);
  const chain = swimChainForSlot(uniq[0] || "");
  if (!chain) return uniq;
  return chain.filter((id) => uniq.includes(id));
}

/**
 * Toggle a swimming slot into a 1–3 consecutive same-instructor block.
 * Returns null if the click cannot form a valid block (caller may replace).
 */
export function toggleSwimSlotSelection(current: string[], clickedId: string): string[] {
  const chain = swimChainForSlot(clickedId);
  if (!chain) return [clickedId];
  const cur = orderSwimSlots(current.filter((id) => chain.includes(id)));
  if (!cur.length) return [clickedId];
  if (cur.includes(clickedId)) {
    const next = cur.filter((id) => id !== clickedId);
    return swimSlotsAreValidBlock(next) || next.length === 0 ? next : [clickedId];
  }
  const trial = orderSwimSlots(cur.concat([clickedId]));
  if (swimSlotsAreValidBlock(trial)) return trial;
  return [clickedId];
}

export function resolveActivitySlotIds(
  activity: CrashActivity,
  raw: unknown,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids = normalizeCrashSlotIds(raw);
  if (!ids.length) return { ok: false, error: `slot_required_${activity}` };
  if (activity === "climbing") {
    if (ids.length !== 1 || !crashSlotById("climbing", ids[0])) {
      return { ok: false, error: "slot_required_climbing" };
    }
    return { ok: true, ids };
  }
  if (!swimSlotsAreValidBlock(ids)) {
    return { ok: false, error: "swim_slots_invalid" };
  }
  return { ok: true, ids: orderSwimSlots(ids) };
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
 * weekly_pack: slot id(s) per activity covering all 4 week days
 *   (swimming may be 1–3 consecutive 30′ slots = up to 90′).
 * individual_days: map date → slot id or slot id[].
 */
export function quoteCrashSummerBooking(input: {
  weekId: CrashWeekId;
  mode: CrashBookingMode;
  activities: CrashActivity[];
  slotByActivity: Partial<
    Record<
      CrashActivity,
      string | string[] | Record<string, string | string[]>
    >
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
      const resolved = resolveActivitySlotIds(activity, slotSel);
      if (!resolved.ok) return { ok: false, error: resolved.error };
      const ids = resolved.ids;
      const units = ids.length;
      const packTotal = prices.weekly_pack * units;
      amount += packTotal;
      const label =
        activity === "swimming" ? swimBlockLabel(ids) : crashSlotById(activity, ids[0])!.label;
      descParts.push(
        `${meta.title} weekly pack (${week.label.split("·")[0].trim()}) · ${label}`,
      );
      for (const date of week.dates) {
        for (const slotId of ids) {
          const slot = crashSlotById(activity, slotId)!;
          lines.push({
            activity,
            session_date: date,
            slot_id: slot.id,
            slot_label: slot.label,
            unit_price_gbp: round2(packTotal / (week.dates.length * units)),
          });
        }
      }
    } else {
      const map =
        slotSel && typeof slotSel === "object" && !Array.isArray(slotSel)
          ? (slotSel as Record<string, string | string[]>)
          : {};
      const dates = Object.keys(map)
        .filter((d) => week.dates.includes(d))
        .sort();
      if (!dates.length) return { ok: false, error: `days_required_${activity}` };
      let dayUnits = 0;
      for (const date of dates) {
        const resolved = resolveActivitySlotIds(activity, map[date]);
        if (!resolved.ok) return { ok: false, error: `${resolved.error}_${date}` };
        const ids = resolved.ids;
        dayUnits += ids.length;
        amount += prices.session * ids.length;
        for (const slotId of ids) {
          const slot = crashSlotById(activity, slotId)!;
          lines.push({
            activity,
            session_date: date,
            slot_id: slot.id,
            slot_label: slot.label,
            unit_price_gbp: prices.session,
          });
        }
      }
      descParts.push(
        `${meta.title} · ${dates.length} day${dates.length === 1 ? "" : "s"} · ${dayUnits} × £${prices.session}`,
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
    swim_max_slots: CRASH_SWIM_MAX_SLOTS,
    swim_chains: CRASH_SWIM_CHAINS,
    pay_in_full: true,
  };
}
