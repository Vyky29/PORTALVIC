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
  { id: "c1", label: "11:00–12:00 · 1 instructor", start: "11:00", end: "12:00" },
  { id: "c2", label: "12:00–13:00 · 1 instructor", start: "12:00", end: "13:00" },
];

/** 8 × 30′ capacity units (2 swimming instructors × 4 half-hours). */
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

/**
 * Time bands in order. Parents may book 1–4 consecutive bands and mix instructors
 * (one place per band). Example: 60′ with A then 30′ with B is fine.
 */
export const CRASH_SWIM_TIME_BANDS: string[][] = [
  ["s1", "s2"], // 16:30
  ["s3", "s4"], // 17:00
  ["s5", "s6"], // 17:30
  ["s7", "s8"], // 18:00
];

/** @deprecated kept for older clients; prefer CRASH_SWIM_TIME_BANDS */
export const CRASH_SWIM_CHAINS: Record<"A" | "B", string[]> = {
  A: ["s1", "s3", "s5", "s7"],
  B: ["s2", "s4", "s6", "s8"],
};

export const CRASH_SWIM_MAX_SLOTS = 4;

export const CRASH_PRICES = {
  climbing: { session: 75, weekly_pack: 300 },
  swimming: { session: 50, weekly_pack: 200 },
} as const;

export const CRASH_HOLD_MINUTES = 120;

/**
 * Week 2 stays closed until Week 1 reaches this fill ratio (taken ÷ capacity),
 * across climbing + swimming slot-units for Week 1 dates.
 * Ops can force-open with Edge env CRASH_WEEK2_FORCE_OPEN=1.
 */
export const CRASH_WEEK2_OPEN_AT_FILL = 0.8;

/**
 * Weekly packs (Tue–Fri × 4 days) are bookable when the week itself is open.
 * Loose / individual hours unlock only in a Fri–Sun window before each week:
 *   Week 1 (21–24 Jul): Fri 17 – Sun 19 July
 *   Week 2 (28–31 Jul): Fri 24 – Sun 26 July (packs only until Thu 23)
 * Week 2 booking is gated by Week 1 ≥ 80% fill (see CRASH_WEEK2_OPEN_AT_FILL).
 */
export const CRASH_INDIVIDUAL_WINDOWS: Record<
  CrashWeekId,
  { from: string; to: string; label: string }
> = {
  w1: {
    from: "2026-07-17",
    to: "2026-07-19",
    label: "Fri 17 – Sun 19 July",
  },
  w2: {
    from: "2026-07-24",
    to: "2026-07-26",
    label: "Fri 24 – Sun 26 July",
  },
};

/** @deprecated use CRASH_INDIVIDUAL_WINDOWS.w1.from */
export const CRASH_INDIVIDUAL_OPENS_ON = CRASH_INDIVIDUAL_WINDOWS.w1.from;
/** @deprecated use CRASH_INDIVIDUAL_WINDOWS.w1.to */
export const CRASH_INDIVIDUAL_PRE_WINDOW_TO = CRASH_INDIVIDUAL_WINDOWS.w1.to;

export function crashLondonDateIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function crashIndividualWindowFor(weekId: CrashWeekId) {
  return CRASH_INDIVIDUAL_WINDOWS[weekId];
}

/** True when individual hours are open for a specific crash week. */
export function crashIndividualDaysOpenForWeek(
  weekId: CrashWeekId,
  now = new Date(),
): boolean {
  const win = CRASH_INDIVIDUAL_WINDOWS[weekId];
  if (!win) return false;
  const iso = crashLondonDateIso(now);
  return iso >= win.from && iso <= win.to;
}

/** True if any week's individual window is open (for public offer messaging). */
export function crashIndividualDaysOpen(now = new Date()): boolean {
  return (
    crashIndividualDaysOpenForWeek("w1", now) ||
    crashIndividualDaysOpenForWeek("w2", now)
  );
}

export function crashIndividualRulesCopy(week2Open = true): string {
  if (!week2Open) {
    return (
      "Currently open: Week 1 only (Tue 21 – Fri 24 July). " +
      "Week 2 (Tue 28 – Fri 31 July) opens when Week 1 reaches 80% of places. " +
      "Individual leftover hours for Week 1: Fri 17 – Sun 19 July."
    );
  }
  return (
    "Crash courses are four-day week packs (Tue–Fri). " +
    "Individual leftover hours: Week 1 only Fri 17 – Sun 19 July; " +
    "Week 2 only Fri 24 – Sun 26 July (packs only until Thu 23)."
  );
}

export function crashWeekCapacityUnits(weekId: CrashWeekId): number {
  const dates = crashWeekDates(weekId);
  return (
    dates.length * (CRASH_CLIMBING_SLOTS.length + CRASH_SWIMMING_SLOTS.length)
  );
}

/** Count occupied slot-units (one booking line = one unit) for a week. */
export function crashCountTakenUnits(
  lines: Array<{ session_date?: string | null }>,
  weekId: CrashWeekId,
): number {
  const dates = new Set(crashWeekDates(weekId));
  let n = 0;
  for (const line of lines || []) {
    if (dates.has(String(line?.session_date || ""))) n += 1;
  }
  return n;
}

export function crashWeekFillRatio(takenUnits: number, weekId: CrashWeekId): number {
  const cap = crashWeekCapacityUnits(weekId);
  if (cap <= 0) return 0;
  return Math.min(1, takenUnits / cap);
}

export function crashIsBookingWeekOpen(
  weekId: CrashWeekId,
  week1FillRatio: number,
  forceWeek2 = false,
): boolean {
  if (weekId === "w1") return true;
  if (weekId === "w2") {
    return forceWeek2 || week1FillRatio + 1e-12 >= CRASH_WEEK2_OPEN_AT_FILL;
  }
  return false;
}

export function crashOpenWeekIds(
  week1FillRatio: number,
  forceWeek2 = false,
): CrashWeekId[] {
  const ids: CrashWeekId[] = ["w1"];
  if (crashIsBookingWeekOpen("w2", week1FillRatio, forceWeek2)) ids.push("w2");
  return ids;
}

export function crashWeekFillSnapshot(
  lines: Array<{ session_date?: string | null }>,
  forceWeek2 = false,
) {
  const taken = crashCountTakenUnits(lines, "w1");
  const capacity = crashWeekCapacityUnits("w1");
  const fill = crashWeekFillRatio(taken, "w1");
  const openIds = crashOpenWeekIds(fill, forceWeek2);
  const week2Open = openIds.includes("w2");
  return {
    week1_taken: taken,
    week1_capacity: capacity,
    week1_fill: fill,
    week1_fill_pct: Math.round(fill * 1000) / 10,
    week2_open_at_fill: CRASH_WEEK2_OPEN_AT_FILL,
    week2_open: week2Open,
    weeks_open: openIds,
    force_week2: forceWeek2,
  };
}

export const CRASH_META = {
  climbing: {
    title: "Climbing",
    invoiceTitle: "Climbing Activity",
    window: "11:00 am–1:00 pm",
    venue: "Westway Sports & Fitness Centre",
    address: "1 Crowthorne Road, London W10 6RP",
  },
  swimming: {
    title: "Swimming",
    invoiceTitle: "Aquatic Activity",
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

export function swimBandIndexForSlot(slotId: string): number {
  for (let i = 0; i < CRASH_SWIM_TIME_BANDS.length; i++) {
    if (CRASH_SWIM_TIME_BANDS[i].includes(slotId)) return i;
  }
  return -1;
}

export function swimInstructorLabel(slotId: string): string {
  const slot = crashSlotById("swimming", slotId);
  if (!slot) return "";
  return slot.label.includes("Instructor B") ? "Instructor B" : "Instructor A";
}

/** 1–4 consecutive half-hour bands; one slot per band; instructors may be mixed. */
export function swimSlotsAreValidBlock(ids: string[]): boolean {
  const uniq = normalizeCrashSlotIds(ids);
  if (!uniq.length || uniq.length > CRASH_SWIM_MAX_SLOTS) return false;
  const bands = uniq.map((id) => swimBandIndexForSlot(id));
  if (bands.some((b) => b < 0)) return false;
  if (new Set(bands).size !== uniq.length) return false; // two slots in same band
  const sorted = bands.slice().sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

export function swimBlockLabel(ids: string[]): string {
  const ordered = orderSwimSlots(ids);
  if (!ordered.length) return "";
  const first = crashSlotById("swimming", ordered[0]);
  const last = crashSlotById("swimming", ordered[ordered.length - 1]);
  if (!first || !last) return ordered.join(", ");
  const mins = ordered.length * 30;
  const mix = ordered.map((id) => {
    const s = crashSlotById("swimming", id);
    const who = swimInstructorLabel(id) === "Instructor B" ? "B" : "A";
    return `${s?.start || id}(${who})`;
  });
  return `${first.start}–${last.end} · ${mins}′ · ${mix.join(" → ")}`;
}

export function orderSwimSlots(ids: string[]): string[] {
  const uniq = normalizeCrashSlotIds(ids);
  return uniq
    .slice()
    .sort((a, b) => swimBandIndexForSlot(a) - swimBandIndexForSlot(b));
}

/**
 * Toggle a swimming slot into a 1–4 consecutive time-band block (instructors mixable).
 * Clicking another instructor in the same band swaps that band's place.
 */
export function toggleSwimSlotSelection(current: string[], clickedId: string): string[] {
  const band = swimBandIndexForSlot(clickedId);
  if (band < 0) return [clickedId];
  const cur = orderSwimSlots(current);
  const sameBand = cur.find((id) => swimBandIndexForSlot(id) === band);
  if (sameBand === clickedId) {
    const next = cur.filter((id) => id !== clickedId);
    return swimSlotsAreValidBlock(next) || next.length === 0 ? next : [];
  }
  if (sameBand) {
    const swapped = orderSwimSlots(cur.filter((id) => id !== sameBand).concat([clickedId]));
    if (swimSlotsAreValidBlock(swapped)) return swapped;
    return [clickedId];
  }
  if (!cur.length) return [clickedId];
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
        `${meta.invoiceTitle} - Summer crash course Jul 2026 - ${week.label.split("·")[0].trim()} weekly pack (${label})`,
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
        `${meta.invoiceTitle} - Summer crash course Jul 2026 - ${dates.length} day${dates.length === 1 ? "" : "s"} (${dayUnits} session${dayUnits === 1 ? "" : "s"})`,
      );
    }
  }

  if (!lines.length || amount <= 0) return { ok: false, error: "empty_booking" };

  return {
    ok: true,
    amountGbp: round2(amount),
    lineDescription:
      descParts.join("\n") + "\nPay in full to confirm place.",
    lines,
  };
}

function ordinalDay(n: number): string {
  const v = Math.floor(n);
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  const mod10 = v % 10;
  if (mod10 === 1) return `${v}st`;
  if (mod10 === 2) return `${v}nd`;
  if (mod10 === 3) return `${v}rd`;
  return `${v}th`;
}

function formatUkTimeRange(start: string, end: string): string {
  const endH = Number(String(end || "").split(":")[0]);
  const ampm = Number.isFinite(endH) && endH >= 12 ? "pm" : "am";
  const a = String(start || "").slice(0, 5);
  const b = String(end || "").slice(0, 5);
  return `${a}-${b} ${ampm}`;
}

function crashSlotMinutes(activity: CrashActivity): number {
  return activity === "climbing" ? 60 : 30;
}

function crashVenueShort(activity: CrashActivity): string {
  return activity === "climbing" ? "Westway" : "Acton Centre";
}

function crashActivityBullet(activity: CrashActivity, durationMin: number): string {
  const title = CRASH_META[activity].invoiceTitle;
  return `- ${durationMin}' 1to1 ${title}`;
}

function crashDateRangePhrase(dates: string[]): string {
  if (!dates.length) return "";
  const sorted = [...dates].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return { y, m, d, dt: new Date(Date.UTC(y, m - 1, d)) };
  };
  const a = parse(first);
  const b = parse(last);
  const month = a.dt.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  if (a.m === b.m && a.y === b.y) {
    return `${ordinalDay(a.d)} to ${ordinalDay(b.d)} ${month}`;
  }
  const monthB = b.dt.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  return `${ordinalDay(a.d)} ${month} to ${ordinalDay(b.d)} ${monthB}`;
}

export function crashInvoiceIntro(opts: {
  vatMode: "exempt" | "vat_20";
  activities: CrashActivity[];
}): string {
  const acts = Array.from(new Set(opts.activities || []));
  const hasClimb = acts.includes("climbing");
  const hasSwim = acts.includes("swimming");
  if (opts.vatMode === "exempt") {
    if (hasClimb && hasSwim) {
      return "Structured activity support delivered across aquatic and climbing environments for a SEND participant as part of funded provision (EHCP or local authority care package).";
    }
    if (hasClimb) {
      return "Structured activity support delivered within a climbing environment for a SEND participant as part of funded provision (EHCP or local authority care package).";
    }
    return "Structured activity support delivered within an aquatic environment for a SEND participant as part of funded provision (EHCP or local authority care package).";
  }
  if (hasClimb && !hasSwim) {
    return "Structured activity support delivered across climbing and indoor environments for a SEND participant.";
  }
  if (hasSwim && !hasClimb) {
    return "Structured activity support delivered within an aquatic environment for a SEND participant.";
  }
  return "Structured activity support delivered across aquatic and climbing environments for a SEND participant.";
}

/**
 * Full crash-course invoice description (Exempt vs Private), matching office invoice wording.
 */
export function buildCrashSummerInvoiceDescription(opts: {
  vatMode: "exempt" | "vat_20";
  weekId: CrashWeekId;
  mode: CrashBookingMode;
  activities: CrashActivity[];
  lines: Array<{
    activity: CrashActivity;
    session_date: string;
    slot_id: string;
    slot_label: string;
  }>;
  participantName: string;
  clientId?: string | null;
  po?: string | null;
}): string {
  const week = CRASH_SUMMER_WEEKS[opts.weekId];
  const weekLabel = opts.weekId === "w1" ? "Week 1" : "Week 2";
  const intro = crashInvoiceIntro({
    vatMode: opts.vatMode,
    activities: opts.activities,
  });
  const out: string[] = [intro, ""];

  if (opts.vatMode === "exempt") {
    out.push(`Client's Id: ${String(opts.clientId || "").trim()}`);
    out.push(`PO: ${String(opts.po || "").trim()}`);
  } else {
    out.push(`Client's name: ${String(opts.participantName || "").trim()}`);
  }

  const acts = Array.from(new Set(opts.activities || [])).filter(
    (a): a is CrashActivity => a === "climbing" || a === "swimming",
  );

  for (const activity of acts) {
    const actLines = opts.lines.filter((l) => l.activity === activity);
    if (!actLines.length) continue;
    const dates = Array.from(new Set(actLines.map((l) => l.session_date))).sort();
    const slotIds = Array.from(new Set(actLines.map((l) => l.slot_id)));
    let durationMin = crashSlotMinutes(activity);
    let timePhrase = "";
    if (activity === "swimming") {
      const starts = slotIds
        .map((id) => crashSlotById("swimming", id))
        .filter(Boolean) as CrashSlotDef[];
      if (starts.length) {
        const ordered = [...starts].sort((a, b) => a.start.localeCompare(b.start));
        durationMin = ordered.length * 30;
        timePhrase = formatUkTimeRange(ordered[0].start, ordered[ordered.length - 1].end);
      }
    } else {
      const slot = crashSlotById("climbing", slotIds[0]);
      if (slot) timePhrase = formatUkTimeRange(slot.start, slot.end);
    }

    const sessionCount = actLines.length;
    const packBit =
      opts.mode === "weekly_pack"
        ? `Weekly pack (${crashDateRangePhrase(dates)} from ${timePhrase})`
        : `Individual days (${crashDateRangePhrase(dates)} from ${timePhrase})`;

    out.push(crashActivityBullet(activity, durationMin));
    out.push("- Summer crash course Jul 2026");
    out.push(`- ${crashVenueShort(activity)}`);
    out.push("- Summer Term 2026");
    out.push("- Dates:");
    out.push(`${weekLabel}. ${packBit}`);
    out.push(`${sessionCount} session${sessionCount === 1 ? "" : "s"}`);
  }

  return out.join("\n");
}

export function crashCatalogPublic(opts?: { openWeekIds?: CrashWeekId[] }) {
  const openIds = opts?.openWeekIds?.length
    ? opts.openWeekIds
    : (Object.keys(CRASH_SUMMER_WEEKS) as CrashWeekId[]);
  return {
    year: CRASH_SUMMER_YEAR,
    hold_minutes: CRASH_HOLD_MINUTES,
    weeks: openIds
      .map((id) => CRASH_SUMMER_WEEKS[id])
      .filter(Boolean),
    weeks_all: Object.values(CRASH_SUMMER_WEEKS),
    week2_open_at_fill: CRASH_WEEK2_OPEN_AT_FILL,
    prices: CRASH_PRICES,
    meta: CRASH_META,
    climbing_slots: CRASH_CLIMBING_SLOTS,
    swimming_slots: CRASH_SWIMMING_SLOTS,
    swim_max_slots: CRASH_SWIM_MAX_SLOTS,
    swim_time_bands: CRASH_SWIM_TIME_BANDS,
    swim_chains: CRASH_SWIM_CHAINS,
    pay_in_full: true,
  };
}

/**
 * Bank transfer reference for crash bookings: participant + activity
 * (e.g. "Elia Climbing", "Sam Climbing+Swimming"). Prefer this over a
 * static Tide hint like "Invoice Number".
 */
export function crashBankTransferReference(
  displayName: string,
  activities: CrashActivity[],
): string {
  const name = String(displayName || "")
    .replace(/[^a-zA-Z0-9 '&+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28) || "Participant";
  const acts = Array.from(
    new Set(
      (activities || []).filter((a): a is CrashActivity =>
        a === "climbing" || a === "swimming"
      ),
    ),
  );
  const service =
    acts.length === 2
      ? "Climbing+Swimming"
      : acts[0] === "swimming"
        ? "Aquatic Activity"
        : acts[0] === "climbing"
          ? "Climbing Activity"
          : "Crash";
  return `${name} ${service}`.trim().slice(0, 40);
}
