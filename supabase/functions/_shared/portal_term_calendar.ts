/**
 * Canonical term calendar 2026/27 — programme-aware closed days.
 * Keep in sync with working_ui/portal/portal_term_calendar.js
 */

export type ServiceKind = "day_centre" | "afterschool" | "weekend";

export type ClosedRange = { from: string; to: string; reason?: string };

export const AUTUMN_2026 = {
  id: "autumn_2026",
  name: "Autumn Term",
  start: "2026-09-01",
  afterSchoolStart: "2026-09-05",
  weekdayAfterSchoolStart: "2026-09-07",
  end: "2026-12-18",
  christmasClosed: { from: "2026-12-19", to: "2027-01-03" },
} as const;

const AFTER_SCHOOL_HALF_TERM_2026: ClosedRange = {
  from: "2026-10-24",
  to: "2026-11-01",
  reason: "half_term",
};

const WEEKEND_CLOSURES: ClosedRange[] = [
  { from: "2026-10-24", to: "2026-10-25", reason: "half_term_weekend" },
  { from: "2026-10-31", to: "2026-11-01", reason: "half_term_weekend" },
  { from: "2027-02-13", to: "2027-02-14", reason: "half_term_weekend" },
  { from: "2027-02-20", to: "2027-02-21", reason: "half_term_weekend" },
  { from: "2027-05-29", to: "2027-05-30", reason: "half_term_weekend" },
  { from: "2027-06-05", to: "2027-06-06", reason: "half_term_weekend" },
];

const CHRISTMAS = AUTUMN_2026.christmasClosed;
const EASTER = { from: "2027-03-26", to: "2027-04-11" };
const CLUB_CLOSED_SINGLES = ["2027-05-03"];

function cleanIso(iso: unknown): string {
  const s = String(iso ?? "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function inRange(iso: string, from: string, to: string): boolean {
  if (!iso || !from || !to) return false;
  return iso >= from && iso <= to;
}

export function inferServiceKind(labelOrService: unknown): ServiceKind {
  const s = String(labelOrService ?? "").toLowerCase();
  if (/day\s*centre|day\s*center|\bdc\b/.test(s)) return "day_centre";
  if (/weekend|\bsaturday\b|\bsunday\b/.test(s)) return "weekend";
  return "afterschool";
}

export function isFullyClosedIso(iso: unknown): boolean {
  const d = cleanIso(iso);
  if (!d) return false;
  if (inRange(d, CHRISTMAS.from, CHRISTMAS.to)) return true;
  if (inRange(d, EASTER.from, EASTER.to)) return true;
  return CLUB_CLOSED_SINGLES.includes(d);
}

export function closedRangesForKind(serviceKind: ServiceKind | string): ClosedRange[] {
  const kind = String(serviceKind || "afterschool").toLowerCase();
  const out: ClosedRange[] = [
    { ...CHRISTMAS, reason: "christmas" },
    { ...EASTER, reason: "easter" },
  ];
  if (kind === "day_centre") {
    out.push(...WEEKEND_CLOSURES);
  } else {
    out.push(AFTER_SCHOOL_HALF_TERM_2026);
    for (const r of WEEKEND_CLOSURES) {
      if (r.from.startsWith("2026-10")) continue;
      out.push(r);
    }
  }
  for (const iso of CLUB_CLOSED_SINGLES) {
    out.push({ from: iso, to: iso, reason: "bank_holiday" });
  }
  return out;
}

export function isClosedIso(
  iso: unknown,
  opts?: { serviceKind?: ServiceKind | string; label?: string } | ServiceKind | string,
): boolean {
  const d = cleanIso(iso);
  if (!d) return false;
  if (isFullyClosedIso(d)) return true;
  let kind: string = "afterschool";
  if (typeof opts === "string") kind = opts;
  else if (opts && typeof opts === "object") {
    kind = opts.serviceKind || (opts.label ? inferServiceKind(opts.label) : "afterschool");
  }
  for (const r of closedRangesForKind(kind)) {
    if (inRange(d, r.from, r.to)) return true;
  }
  return false;
}

/** Booking offer payload calendars. */
export function bookingCalendarAfterSchool() {
  return {
    start: AUTUMN_2026.afterSchoolStart,
    end: AUTUMN_2026.end,
    closedRanges: [{ start: AFTER_SCHOOL_HALF_TERM_2026.from, end: AFTER_SCHOOL_HALF_TERM_2026.to }],
  };
}

export function bookingCalendarDayCentre() {
  return {
    start: AUTUMN_2026.start,
    end: AUTUMN_2026.end,
    closedRanges: [] as { start: string; end: string }[],
  };
}

export const AUTUMN_TERM_BOOKING = {
  badge: "AUTUMN TERM 2026",
  label: "Autumn Term 2026",
  start: AUTUMN_2026.afterSchoolStart,
  end: AUTUMN_2026.end,
  dayCentreStart: AUTUMN_2026.start,
  closedRanges: [{ start: AFTER_SCHOOL_HALF_TERM_2026.from, end: AFTER_SCHOOL_HALF_TERM_2026.to }],
  dayCentreClosedRanges: [] as { start: string; end: string }[],
  range:
    "Sat 5 September 2026 – Fri 18 December 2026 · after-schools & weekends closed 24 Oct–1 Nov (half term) · Day Centre open weekdays through half term · Day Centre from Tue 1 September · Mon after-school from 7 September",
};
