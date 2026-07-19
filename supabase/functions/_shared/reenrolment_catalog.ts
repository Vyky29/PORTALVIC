/** Re-enrolment 2026/27 — service catalogue, session counts, parsing. */

import { canonicalParticipantClientId } from "./participant_identity.ts";

export const REENROL_ACADEMIC_YEAR = "2026-27";

export const SESSION_COUNTS = {
  weekday: { autumn: 14, spring: 11, summer: 13, annual: 38 },
  weekend: { autumn: 13, spring: 9, summer: 11, annual: 33 },
} as const;

/**
 * Day Centre 2026/27 — starts 1 Sept; no half-term weekday breaks.
 * Club closed only for Christmas (+ Easter from calendar). Weekends half-term
 * closures do not affect Mon–Fri Day Centre places.
 */
export const DAY_CENTRE_CALENDAR_2026_27 = {
  openFrom: "2026-09-01",
  openTo: "2027-07-30",
  terms: [
    { id: "autumn" as const, starts: "2026-09-01", ends: "2026-12-18" },
    { id: "spring" as const, starts: "2027-01-04", ends: "2027-03-25" },
    { id: "summer" as const, starts: "2027-04-12", ends: "2027-07-30" },
  ],
  closedRanges: [
    { from: "2026-12-19", to: "2027-01-03" },
    { from: "2027-03-26", to: "2027-04-11" },
  ],
};

export type ParsedSlot = {
  id: string;
  raw: string;
  serviceType: string;
  durationMin: number;
  day: string;
  isWeekend: boolean;
  isDayCentre: boolean;
  pricePerSession: number | null;
  sessions: { autumn: number; spring: number; summer: number; annual: number };
  termTotals: { autumn: number; spring: number; summer: number; annual: number };
  ratio?: string;
  hoursLabel?: string;
  venue?: string;
  timeSlot?: string;
  instructor?: string;
  displayLabel?: string;
};

const DAY_ALIASES: Record<string, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
  mondays: "Monday",
  tuesdays: "Tuesday",
  wednesdays: "Wednesday",
  thursdays: "Thursday",
  fridays: "Friday",
  saturdays: "Saturday",
  sundays: "Sunday",
};

const WEEKEND_DAYS = new Set(["Saturday", "Sunday"]);

const DAY_RANGE_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function isoFromParts(y: number, m0: number, d: number): string {
  const mm = String(m0 + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function addDaysIso(iso: string, days: number): string {
  const p = String(iso || "").split("-").map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return iso;
  const dt = new Date(p[0], p[1] - 1, p[2] + days);
  return isoFromParts(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function jsDowFromIso(iso: string): number {
  const p = String(iso || "").split("-").map(Number);
  if (p.length !== 3) return -1;
  return new Date(p[0], p[1] - 1, p[2]).getDay(); // Sun=0 … Sat=6
}

function dayNameFromJsDow(jsDow: number): string {
  // JS Sun=0 → calendar Mon-first names
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][jsDow] || "";
}

function isoInClosedRange(iso: string, from: string, to: string): boolean {
  return !!iso && !!from && !!to && iso >= from && iso <= to;
}

function isDayCentreClosedIso(iso: string): boolean {
  const cal = DAY_CENTRE_CALENDAR_2026_27;
  if (iso < cal.openFrom || iso > cal.openTo) return true;
  for (const r of cal.closedRanges) {
    if (isoInClosedRange(iso, r.from, r.to)) return true;
  }
  return false;
}

/** Count Day Centre sessions for one weekday across 2026/27 terms (no half-term). */
const _dcSessionCountCache = new Map<
  string,
  { autumn: number; spring: number; summer: number; annual: number }
>();

export function countDayCentreSessionsForDay(day: string): {
  autumn: number;
  spring: number;
  summer: number;
  annual: number;
} {
  const want = normalizeDay(day);
  const cached = _dcSessionCountCache.get(want);
  if (cached) return { ...cached };
  const counts = { autumn: 0, spring: 0, summer: 0, annual: 0 };
  if (!want || WEEKEND_DAYS.has(want)) {
    _dcSessionCountCache.set(want, counts);
    return { ...counts };
  }
  const cal = DAY_CENTRE_CALENDAR_2026_27;
  let cursor = cal.openFrom;
  let guard = 0;
  while (cursor <= cal.openTo && guard < 450) {
    guard += 1;
    if (!isDayCentreClosedIso(cursor) && dayNameFromJsDow(jsDowFromIso(cursor)) === want) {
      counts.annual += 1;
      for (const t of cal.terms) {
        if (cursor >= t.starts && cursor <= t.ends) {
          counts[t.id] += 1;
          break;
        }
      }
    }
    cursor = addDaysIso(cursor, 1);
  }
  _dcSessionCountCache.set(want, counts);
  return { ...counts };
}

/** Expand "(Mon & Wed)", "(Mon–Wed & Fri)", "(Mon, Wed & Fri)", "(Mon–Fri)". */
export function expandDaysFromParen(dayRaw: string): string[] {
  const raw = String(dayRaw || "")
    .replace(/\s*1:1.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return [];
  if (/^mon\s*[–-]\s*fri$/i.test(raw) || /^monday\s*[–-]\s*friday$/i.test(raw)) {
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  }
  const tokens = raw
    .split(/\s*(?:&|,|\+|\/|·| and )\s*/i)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    const range = tok.match(
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*[–-]\s*(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/i,
    );
    if (range) {
      const a = normalizeDay(range[1]);
      const b = normalizeDay(range[2]);
      const ai = DAY_RANGE_ORDER.indexOf(a);
      const bi = DAY_RANGE_ORDER.indexOf(b);
      if (ai >= 0 && bi >= ai) {
        for (let i = ai; i <= bi; i++) {
          const d = DAY_RANGE_ORDER[i];
          if (!seen.has(d)) {
            seen.add(d);
            out.push(d);
          }
        }
        continue;
      }
    }
    const d = normalizeDay(tok);
    if (d && !seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

function buildWeeklySlot(opts: {
  id: string;
  raw: string;
  serviceType: string;
  durationMin: number;
  day: string;
  ratio?: string;
}): ParsedSlot {
  const day = normalizeDay(opts.day);
  const isWeekend = WEEKEND_DAYS.has(day);
  const counts = sessionCountsForDay(day);
  const serviceType = canonicalizeServiceTypeToken(opts.serviceType);
  const durationMin =
    serviceType.includes("MULTI") && (!opts.durationMin || opts.durationMin < 60)
      ? 90
      : opts.durationMin || 30;
  const price = unitPriceFor(serviceType, durationMin);
  const slot: ParsedSlot = {
    id: opts.id,
    raw: opts.raw,
    serviceType,
    durationMin,
    day,
    isWeekend,
    isDayCentre: false,
    pricePerSession: price,
    sessions: { ...counts },
    termTotals: termTotals(price, counts),
    ratio: opts.ratio,
  };
  slot.displayLabel = buildSlotDisplayLabel(slot);
  return slot;
}

function buildDayCentreSlots(opts: {
  index: number;
  raw: string;
  serviceType: string;
  days: string[];
  ratio?: string;
  hoursLabel?: string;
}): ParsedSlot[] {
  const days = (opts.days.length ? opts.days : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
    .map(normalizeDay)
    .filter((d) => d && !WEEKEND_DAYS.has(d));
  const unique = [...new Set(days)];
  return unique.map((day, i) => {
    const counts = countDayCentreSessionsForDay(day);
    return {
      id: `dc-${opts.index}-${i}`,
      raw: opts.raw,
      serviceType: opts.serviceType,
      durationMin: 0,
      day,
      isWeekend: false,
      isDayCentre: true,
      pricePerSession: null,
      sessions: { ...counts },
      termTotals: termTotals(null, counts),
      ratio: opts.ratio,
      hoursLabel: opts.hoursLabel,
      venue: "SwimFarm",
    } as ParsedSlot;
  });
}
export function unitPriceFor(serviceType: string, durationMin: number): number | null {
  const t = normalizeServiceType(serviceType);
  if (t.includes("DAY CENTRE")) return null;
  if (t.includes("INTENSIVE") || t.includes("CAMP")) return null;

  if (t.includes("AQUATIC") || t.includes("SWIM") || t === "SW") {
    return 50 * (durationMin / 30);
  }
  if (t.includes("CLIMB") || t === "CL") {
    return 75 * (durationMin / 60);
  }
  if (t.includes("PHYSICAL")) {
    return 75 * (durationMin / 60);
  }
  if (t.includes("BESPOKE")) {
    return 125 * (durationMin / 60);
  }
  if (t.includes("COUNSEL")) {
    return 45 * (durationMin / 45);
  }
  if (t.includes("MULTI")) {
    // 90' MA — LA cohort £120/session; confirm individually if different.
    return 120 * (durationMin / 90);
  }
  return null;
}

export function normalizeServiceType(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/ACTIVIY/g, "ACTIVITY")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDay(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const fullKey = trimmed.toLowerCase().replace(/[^a-z]/g, "");
  if (DAY_ALIASES[fullKey]) return DAY_ALIASES[fullKey];
  const first = (trimmed.split(/\s+|[·/]/)[0] || "").trim();
  const firstKey = first.toLowerCase().replace(/[^a-z]/g, "");
  if (DAY_ALIASES[firstKey]) return DAY_ALIASES[firstKey];
  return first || trimmed;
}

function sessionCountsForDay(day: string) {
  return WEEKEND_DAYS.has(day) ? SESSION_COUNTS.weekend : SESSION_COUNTS.weekday;
}

function termTotals(price: number | null, counts: { autumn: number; spring: number; summer: number; annual: number }) {
  if (price == null) {
    return { autumn: 0, spring: 0, summer: 0, annual: 0 };
  }
  return {
    autumn: Math.round(price * counts.autumn * 100) / 100,
    spring: Math.round(price * counts.spring * 100) / 100,
    summer: Math.round(price * counts.summer * 100) / 100,
    annual: Math.round(price * counts.annual * 100) / 100,
  };
}

/**
 * LA / Summer workbook lines often look like:
 *   `30' Aquatic Activity, Monday - 6 to 6.30`
 * Catalogue parse expects a paren day: `30' Aquatic Activity (Monday)`.
 */
function normalizeServiceSegment(raw: string): string {
  let s = String(raw || "")
    .replace(/[''′](?:\s*[''′])+/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  const day =
    "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun";
  const clock =
    "\\d{1,2}(?:[.:]\\d{1,2})?(?:\\s*(?:am|pm))?";
  /* ", Monday - 6 to 6.30" / ", Monday" → " (Monday)" */
  s = s.replace(
    new RegExp(
      `,\\s*(${day})\\s*(?:[-–—]\\s*${clock}\\s*(?:(?:to|-)\\s*${clock})?)?\\s*$`,
      "i",
    ),
    " ($1)",
  );
  /* "… Aquatic Monday - 6 to 6.30" (no comma) when not already parenthesised */
  if (!/\([^)]*\)\s*$/.test(s)) {
    s = s.replace(
      new RegExp(
        `\\s+(${day})\\s*(?:[-–—]\\s*${clock}\\s*(?:(?:to|-)\\s*${clock})?)?\\s*$`,
        "i",
      ),
      " ($1)",
    );
  }
  return s;
}

function stripServiceToken(raw: string): string {
  return String(raw || "")
    .replace(/^[_\s'']+|[_\s'']+$/g, "")
    .replace(/^['''\s]+|['''\s]+$/g, "")
    .trim();
}

/** Spreadsheet / LA codes → canonical service type for labels and pricing. */
export function canonicalizeServiceTypeToken(raw: string): string {
  const t = normalizeServiceType(raw);
  if (!t) return t;
  if (t === "SW" || t.includes("AQUATIC") || t.includes("SWIM")) return "AQUATIC ACTIVITY";
  if (t === "CL" || t.includes("CLIMB")) return "CLIMBING ACTIVITY";
  if (
    t === "S&C" ||
    t === "S & C" ||
    t.includes("S&C") ||
    (t.includes("SPLASH") && t.includes("CONNECT")) ||
    t.includes("MULTI") ||
    t === "MA"
  ) {
    return "MULTI-ACTIVITY";
  }
  if (t === "BS" || t.includes("BESPOKE") || t.includes("FITFUN")) return "BESPOKE PROGRAMME";
  if (t.includes("PHYSICAL") || t.includes("FITNESS") || t === "FIT") return "PHYSICAL ACTIVITY";
  if (t.includes("COUNSEL")) return "COUNSELLING";
  return t;
}

function slotDedupeKey(slot: ParsedSlot): string {
  return `${slot.day}|${normalizeServiceType(slot.serviceType)}`;
}

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function sortWeeklySlotsByDay(slots: ParsedSlot[]): ParsedSlot[] {
  return [...slots].sort((a, b) => {
    const ai = DAY_ORDER.indexOf(a.day);
    const bi = DAY_ORDER.indexOf(b.day);
    const aOrd = ai < 0 ? 99 : ai;
    const bOrd = bi < 0 ? 99 : bi;
    if (aOrd !== bOrd) return aOrd - bOrd;
    return String(a.serviceType || "").localeCompare(String(b.serviceType || ""));
  });
}

function normalizeParsedSlotService(slot: ParsedSlot): ParsedSlot {
  const serviceType = canonicalizeServiceTypeToken(slot.serviceType);
  // Multi-Activity is always a 90' day service when roster/payment under-reports duration.
  // Do NOT clamp Aquatic 60' (e.g. ACAT Mon 11–12) down to 30' — that kept a £100
  // catalogue price while showing a 30' label.
  const durationMin =
    serviceType.includes("MULTI") && (!slot.durationMin || slot.durationMin < 60)
      ? 90
      : slot.durationMin;
  const price = slot.pricePerSession ?? unitPriceFor(serviceType, durationMin);
  const out: ParsedSlot = {
    ...slot,
    serviceType,
    durationMin,
    pricePerSession: price,
    termTotals: termTotals(price, slot.sessions),
    displayLabel: undefined,
  };
  out.displayLabel = buildSlotDisplayLabel(out);
  return out;
}

/** Roster defines days/services; payment rows supply pricing when they match. */
export function mergeWeeklySlotsFromRosterAndPayment(
  participantName: string,
  rosterSlots: ParsedSlot[],
  paymentSlots: ParsedSlot[],
  rosterRows: Array<{
    client_name?: string;
    day?: string;
    time_slot?: string;
    service?: string;
    venue?: string;
    instructors?: string;
  }>,
): ParsedSlot[] {
  const normalizedPayment = (paymentSlots || []).map(normalizeParsedSlotService);
  let merged = (rosterSlots || []).map(normalizeParsedSlotService);

  if (!merged.length && normalizedPayment.length) {
    merged = normalizedPayment;
  } else if (merged.length && normalizedPayment.length) {
    merged = merged.map((slot) => {
      const payMatch = normalizedPayment.find((p) =>
        serviceTypesMatch(slot.serviceType, p.serviceType) &&
        (!p.day || !slot.day || normalizeDay(p.day) === slot.day)
      );
      if (!payMatch || payMatch.pricePerSession == null) return slot;
      // Keep explicit published fee (e.g. ACAT £50) when payment sheet priced a 60' Aquatic at £100.
      if (
        slot.pricePerSession != null &&
        payMatch.pricePerSession != null &&
        slot.pricePerSession < payMatch.pricePerSession &&
        /aquatic/i.test(slot.serviceType)
      ) {
        return slot;
      }
      return normalizeParsedSlotService({
        ...slot,
        pricePerSession: payMatch.pricePerSession,
        termTotals: payMatch.termTotals,
      });
    });
  }

  if (merged.length && rosterRows.length) {
    merged = enrichWeeklySlotsFromRoster(participantName, merged, rosterRows);
  }
  return sortWeeklySlotsByDay(merged);
}

function parseOneSegment(segment: string, index: number): ParsedSlot[] {
  let raw = normalizeServiceSegment(segment);
  if (!raw || raw === "—" || raw === "-") return [];

  // "2× 60'' Aquatic (Mon & Wed)" — strip multiplier; days expand below.
  const multMatch = raw.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  let multiplier = 1;
  if (multMatch) {
    multiplier = Math.max(1, Number(multMatch[1]) || 1);
    raw = normalizeServiceSegment(multMatch[2]);
  }

  const dcMatch = raw.match(/day\s*centre/i);
  if (dcMatch) {
    const ratio = raw.match(/(\d:\d)/)?.[1] || undefined;
    const hours = raw.match(/(\d+h(?:\d+)?|\d+\s*h(?:\s*\d+)?)/i)?.[0] || undefined;
    const paren = raw.match(/\(([^)]+)\)/)?.[1] || "";
    let days = expandDaysFromParen(paren);
    /*
     * Payment rows often say "150' Day Centre, Monday - 12.30 to 3" (no parens).
     * Without a day we used to default Mon–Fri per segment → ×5 over-count (year totals).
     */
    if (!days.length) {
      const dayHit = raw.match(
        /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Mon|Tue|Wed|Thu|Fri)\b/i,
      );
      if (dayHit) days = [normalizeDay(dayHit[1])];
    }
    if (!days.length) {
      const loose = raw
        .replace(/day\s*centre/i, " ")
        .replace(/\d+[''′]?\s*/g, " ")
        .replace(/\d{1,2}[.:]\d{2}\s*(?:to|-)\s*\d{1,2}[.:]?\d{0,2}/gi, " ");
      days = expandDaysFromParen(loose);
    }
    return buildDayCentreSlots({
      index,
      raw: segment,
      serviceType: "DAY CENTRE",
      days,
      ratio,
      hoursLabel: hours,
    });
  }

  const bespokeDc = raw.match(/(\d:\d)\s*bespoke\s*([\d.h\s]+)/i);
  if (bespokeDc && raw.match(/mon\s*[–-]\s*fri|mon–fri|mon-fri/i)) {
    return buildDayCentreSlots({
      index,
      raw: segment,
      serviceType: "DAY CENTRE (BESPOKE BLOCK)",
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      ratio: bespokeDc[1],
      hoursLabel: bespokeDc[2]?.trim(),
    });
  }

  const shortSw = raw.match(/^(SW|CL)\s*\(([^)]+)\)/i);
  if (shortSw) {
    const durationMin = shortSw[1].toUpperCase() === "CL" ? 60 : 30;
    const serviceType = shortSw[1].toUpperCase() === "CL" ? "CLIMBING ACTIVITY" : "AQUATIC ACTIVITY";
    const dayRaw = shortSw[2] || "";
    const days = expandDaysFromParen(dayRaw);
    const ratio = dayRaw.match(/(\d:\d)/)?.[1];
    const dayList = days.length ? days : [normalizeDay(dayRaw.split(/[/+&·]/)[0] || "")];
    const slots = dayList.map((day, i) =>
      buildWeeklySlot({
        id: `slot-${index}-${i}`,
        raw: segment,
        serviceType,
        durationMin,
        day,
        ratio: ratio || undefined,
      }),
    );
    return expandByMultiplier(slots, multiplier, index);
  }

  const m =
    raw.match(/^(\d+)[''′]?\s*'?\s*(SW|CL)\s*\(([^)]+)\)/i) ||
    raw.match(
      /^(\d+)[''′]?\s*(.+?)\s*(?:\(([^)]+)\)|\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun))\s*$/i,
    ) ||
    raw.match(/^(\d+)[''′]?\s*(.+?)\s*\(([^)]+)\)/i);

  if (!m) {
    if (/day centre/i.test(raw)) {
      return parseOneSegment("Day Centre " + raw, index);
    }
    return [];
  }

  const durationMin = Number(m[1]) || 30;
  let serviceType = canonicalizeServiceTypeToken(stripServiceToken(m[2]));
  const dayRaw = m[3] || "";
  const days = expandDaysFromParen(dayRaw);
  const ratio = dayRaw.match(/(\d:\d)/)?.[1];
  const dayList = days.length
    ? days
    : [normalizeDay(dayRaw.split(/[/+&·]/)[0]?.trim() || dayRaw)];
  const slots = dayList
    .filter(Boolean)
    .map((day, i) =>
      buildWeeklySlot({
        id: `slot-${index}-${i}`,
        raw: segment,
        serviceType,
        durationMin,
        day,
        ratio: ratio || undefined,
      }),
    );
  return expandByMultiplier(slots, multiplier, index);
}

/** If "2× … (Mon)" with one day, duplicate; if days already match multiplier, keep as-is. */
function expandByMultiplier(slots: ParsedSlot[], multiplier: number, index: number): ParsedSlot[] {
  if (!slots.length || multiplier <= 1) return slots;
  if (slots.length >= multiplier) return slots;
  if (slots.length === 1) {
    const base = slots[0];
    const out: ParsedSlot[] = [];
    for (let i = 0; i < multiplier; i++) {
      out.push({
        ...base,
        id: `slot-${index}-m${i}`,
      });
    }
    return out;
  }
  return slots;
}

export function formatServiceTypeLabel(serviceType: string): string {
  const t = normalizeServiceType(serviceType);
  if (t.includes("AQUATIC") || t === "SW") return "Aquatic Activity";
  if (t.includes("CLIMB") || t === "CL") return "Climbing Activity";
  if (t.includes("PHYSICAL") || t.includes("FITNESS")) return "Physical Activity";
  if (t.includes("BESPOKE") || t === "BS") return "Bespoke Programme";
  if (t.includes("MULTI") || t === "MA") return "Multi-Activity";
  if (
    t === "S&C" ||
    t === "S & C" ||
    t.includes("S&C") ||
    (t.includes("SPLASH") && t.includes("CONNECT"))
  ) {
    return "Multi-Activity";
  }
  if (t.includes("COUNSEL")) return "Counselling";
  return t
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export function dayPluralLabel(day: string): string {
  const d = String(day || "").trim();
  if (!d) return "";
  if (/s$/i.test(d)) return d;
  return `${d}s`;
}

/** am/pm for a single clock token (club hours: 9–11 = am, 12 & 1–8 = pm). */
function clockMeridiem(tok: string): "am" | "pm" | "" {
  const h = parseInt(String(tok || "").trim(), 10);
  if (!Number.isFinite(h)) return "";
  if (h === 12) return "pm";
  if (h >= 1 && h <= 8) return "pm";
  if (h >= 9 && h <= 11) return "am";
  return "";
}

export function formatTimeSlotLabel(timeSlot: string): string {
  const s = String(timeSlot || "").trim();
  if (!s) return "";
  if (/\b(am|pm)\b/i.test(s)) return s;
  const parts = s.split(/\s+to\s+/i);
  const startTok = (parts[0] || "").trim();
  const endTok = parts.length > 1 ? (parts[1] || "").trim() : "";
  const startMer = clockMeridiem(startTok);
  if (!endTok) return startMer ? `${s} ${startMer}` : s;
  const endMer = clockMeridiem(endTok);
  if (startMer && endMer && startMer !== endMer) {
    // range crosses midday, label each side (e.g. "11 am to 12.30 pm")
    return `${startTok} ${startMer} to ${endTok} ${endMer}`;
  }
  const mer = endMer || startMer;
  return mer ? `${s} ${mer}` : s;
}

export function buildSlotDisplayLabel(slot: ParsedSlot): string {
  const parts: string[] = [];
  if (slot.durationMin) parts.push(`${slot.durationMin}'`);
  parts.push(formatServiceTypeLabel(slot.serviceType));
  let label = parts.join(" ");
  if (slot.timeSlot) label += ` - ${formatTimeSlotLabel(slot.timeSlot)}`;
  if (slot.day) label += `, ${dayPluralLabel(slot.day)}`;
  if (slot.venue) label += ` (${slot.venue})`;
  return label.trim();
}

function serviceTypesMatch(parsedType: string, rosterService: string): boolean {
  const p = normalizeServiceType(parsedType);
  const r = normalizeServiceType(rosterService);
  if (p.includes("AQUATIC") || p === "SW") {
    return r.includes("AQUATIC") || r.includes("SWIM");
  }
  if (p.includes("CLIMB") || p === "CL") return r.includes("CLIMB");
  if (p.includes("MULTI")) return r.includes("MULTI");
  if (p.includes("BESPOKE")) return r.includes("BESPOKE");
  if (p.includes("PHYSICAL")) return r.includes("PHYSICAL") || r.includes("FITNESS");
  return p === r || r.includes(p) || p.includes(r);
}

function pickModeValue(counts: Map<string, number>): string | undefined {
  let best = "";
  let bestN = 0;
  for (const [value, n] of counts.entries()) {
    if (n > bestN) {
      best = value;
      bestN = n;
    }
  }
  return best || undefined;
}

export function enrichWeeklySlotsFromRoster(
  participantName: string,
  slots: ParsedSlot[],
  rosterRows: Array<{
    client_name?: string;
    day?: string;
    time_slot?: string;
    service?: string;
    venue?: string;
    instructors?: string;
  }>,
): ParsedSlot[] {
  return slots.map((slot) => {
    const matches = rosterRows.filter((row) => {
      if (!namesMatch(participantName, String(row.client_name || ""))) return false;
      if (normalizeDay(String(row.day || "")) !== slot.day) return false;
      return serviceTypesMatch(slot.serviceType, String(row.service || ""));
    });
    if (!matches.length) {
      return { ...slot, displayLabel: buildSlotDisplayLabel(slot) };
    }
    const timeCounts = new Map<string, number>();
    const venueCounts = new Map<string, number>();
    const instructorCounts = new Map<string, number>();
    for (const row of matches) {
      const ts = String(row.time_slot || "").trim();
      const venue = String(row.venue || "").trim();
      const instructor = String(row.instructors || "").trim();
      if (ts) timeCounts.set(ts, (timeCounts.get(ts) || 0) + 1);
      if (venue) venueCounts.set(venue, (venueCounts.get(venue) || 0) + 1);
      if (instructor) instructorCounts.set(instructor, (instructorCounts.get(instructor) || 0) + 1);
    }
    const enriched: ParsedSlot = {
      ...slot,
      timeSlot: pickModeValue(timeCounts),
      venue: pickModeValue(venueCounts) || slot.venue,
      instructor: pickModeValue(instructorCounts) || slot.instructor,
      displayLabel: undefined,
    };
    enriched.displayLabel = buildSlotDisplayLabel(enriched);
    return enriched;
  });
}

/**
 * Payment sheets sometimes list several services in one cell without ·/+
 * separators (e.g. "60' SW (Tu&Th) 60' C (Sun) & 90' S&C (Sun)"). Split before
 * each duration token (NN') so every service parses on its own — otherwise the
 * whole string collapses into one slot with the wrong duration and price.
 */
function splitCombinedDurationSegments(part: string): string[] {
  const pieces = String(part || "")
    .split(/\s+(?=\d{2,3}\s*['’′])/)
    .map((p) => p.replace(/[&,/]+\s*$/, "").trim())
    .filter(Boolean);
  // Only split when each service keeps its own "(day)" — combos like
  // "90' S&C & 60' CL (Su)" share one day and must stay a single segment.
  if (pieces.length > 1 && pieces.every((p) => p.includes("("))) return pieces;
  return [part];
}

/** Split payment-sheet list cells (`A; B` or `A · B`). */
export function splitPaymentListCell(raw: string): string[] {
  return String(raw || "")
    .split(/\s*;\s*|\s*[·•]\s*|\s+\+\s+/)
    .map((p) => p.trim().replace(/^[;,\s]+|[;,\s]+$/g, ""))
    .filter(Boolean);
}

function durationMinutesFromSessionFragment(session: string): number | null {
  const m = String(session || "").match(
    /(\d{1,2}(?:[.:]\d{1,2})?)\s*to\s*(\d{1,2}(?:[.:]\d{1,2})?)/i,
  );
  if (!m) return null;
  const se = publishedSlotStartEndMinutes(`${m[1]} to ${m[2]}`);
  if (!se || !(se.end > se.start)) return null;
  return se.end - se.start;
}

function dayFromSessionFragment(session: string): string {
  const m = String(session || "").match(
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i,
  );
  return m ? normalizeDay(m[1]) : "";
}

function defaultDurationForServiceLabel(svc: string): number {
  const st = normalizeServiceType(svc);
  if (st.includes("MULTI") || st.includes("S&C")) return 90;
  if (st.includes("CLIMB")) return 60;
  if (st.includes("PHYSICAL") || st.includes("BESPOKE")) return 60;
  if (st.includes("COUNSEL")) return 45;
  return 30;
}

/**
 * LA/payment sheets often store parallel cells, e.g.
 *   Services: "Aquatic Activity; Multi-Activity"
 *   Sessions: "Monday 6 to 6.30; Sunday 12.30 to 2"
 * Pair them into catalogue-shaped segments (`30' Aquatic Activity (Monday) · …`)
 * so parseServiceString keeps every service (not just Multi).
 */
export function coalescePaymentServiceAndSessions(
  serviceRaw: string,
  sessionsRaw: string,
): string {
  const services = splitPaymentListCell(serviceRaw);
  const sessions = splitPaymentListCell(sessionsRaw);
  if (!services.length) return String(serviceRaw || "").trim();

  const alreadyCatalogue =
    services.length === 1 &&
    !/;/.test(String(serviceRaw || "")) &&
    /^\d+\s*[''′]/.test(String(serviceRaw || "").trim());
  if (alreadyCatalogue) return String(serviceRaw || "").trim();

  const paired = services.map((svc, i) => {
    const already = String(svc).trim();
    if (/^\d+\s*[''′]/.test(already) && /\(/.test(already)) return already;

    /* Keep multi-day Day Centre labels intact — never collapse
     * "(Mon, Wed & Fri)" / "(Mon & Fri)" down to the first weekday. */
    const existingParen = already.match(/\(([^)]+)\)/);
    if (existingParen) {
      const daysInParen = expandDaysFromParen(existingParen[1]);
      if (daysInParen.length > 1) return already;
    }

    const sess =
      sessions[i] ||
      (services.length === 1 && sessions.length ? sessions.join("; ") : "");
    const day =
      dayFromSessionFragment(sess) ||
      (() => {
        const paren = already.match(/\(([^)]+)\)/);
        if (!paren) return "";
        const days = expandDaysFromParen(paren[1]);
        if (days.length > 1) return "";
        return days[0] || normalizeDay(paren[1].split(/[/+&·,]/)[0] || "");
      })();
    const fromTime = durationMinutesFromSessionFragment(sess);
    let durationMin = fromTime != null && fromTime > 0
      ? fromTime
      : defaultDurationForServiceLabel(already);
    const name = already.replace(/\s*\([^)]*\)\s*$/, "").trim() || already;
    if (day) return `${durationMin}' ${name} (${day})`;
    if (/^\d+\s*[''′]/.test(already)) return already;
    return `${durationMin}' ${name}`;
  });

  return paired.join(" · ");
}

export function parseServiceString(service: string): ParsedSlot[] {
  const parts = String(service || "")
    .split(/\s*[·•]\s*|\s+\+\s+|\s*;\s*/)
    .flatMap(splitCombinedDurationSegments)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: ParsedSlot[] = [];
  parts.forEach((part, i) => {
    const slots = parseOneSegment(part, i);
    for (const slot of slots) out.push(slot);
  });

  if (!out.length && /day centre/i.test(service)) {
    const slots = parseOneSegment(service, 0);
    for (const slot of slots) out.push(slot);
  }
  return out;
}

export function splitSlots(slots: ParsedSlot[]) {
  const weekly = slots.filter((s) => !s.isDayCentre);
  const dayCentre = slots.filter((s) => s.isDayCentre);
  return { weekly, dayCentre };
}

export function annualTotalForWeekly(slots: ParsedSlot[]): number {
  return slots.reduce((sum, s) => sum + (s.termTotals.annual || 0), 0);
}

export function normalizePersonName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameTokens(raw: string): string[] {
  return normalizePersonName(raw).split(" ").filter(Boolean);
}

export function namesMatch(want: string, got: string): boolean {
  const w = normalizePersonName(want);
  const g = normalizePersonName(got);
  if (!w || !g) return false;
  if (w === g) return true;
  if (g.includes(w) || w.includes(g)) return true;
  const wt = nameTokens(want);
  const gt = nameTokens(got);
  if (wt.length && gt.length && wt[0] === gt[0]) {
    if (wt.length === 1 || gt.length === 1) return true;
    if (wt[wt.length - 1] === gt[gt.length - 1]) return true;
  }
  const wSlug = canonicalParticipantClientId(want);
  const gSlug = canonicalParticipantClientId(got);
  if (wSlug && gSlug && wSlug === gSlug) return true;
  return false;
}

export function parentNamesMatch(
  parentFirst: string,
  parentLast: string,
  recordParent: string,
): boolean {
  const pf = normalizePersonName(parentFirst);
  const pl = normalizePersonName(parentLast);
  const rp = normalizePersonName(recordParent);
  if (!pf || !pl) return false;
  if (rp.includes(pf) && rp.includes(pl)) return true;
  if (rp === pf) return true;
  if (rp.startsWith(pf + " ")) return true;
  if (nameTokens(recordParent)[0] === pf) return true;
  return false;
}

export function ageOnDate(dobIso: string | null, onDate: Date): number | null {
  if (!dobIso) return null;
  const d = new Date(dobIso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  let age = onDate.getFullYear() - d.getFullYear();
  const m = onDate.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && onDate.getDate() < d.getDate())) age -= 1;
  return age;
}

export function ageMatchesInput(dobIso: string | null, inputAge: number | null): boolean {
  if (inputAge == null || !dobIso) return !inputAge;
  const now = new Date();
  const ageNow = ageOnDate(dobIso, now);
  if (ageNow == null) return false;
  return Math.abs(ageNow - inputAge) <= 1;
}

export type InvoiceTypeCode = "vat_included" | "exempt";

export function normalizeInvoiceType(vatRaw: string): { code: InvoiceTypeCode; label: string } {
  const s = String(vatRaw || "").trim().toLowerCase();
  if (!s || s === "—" || s === "-") {
    return { code: "vat_included", label: "Includes 20% VAT (in price)" };
  }
  if (s.includes("exempt") || s === "0") {
    return { code: "exempt", label: "EXEMPT VAT" };
  }
  if (s.includes("20") || s.includes("vat") || s === "0.2") {
    return { code: "vat_included", label: "Includes 20% VAT (in price)" };
  }
  return { code: "vat_included", label: "Includes 20% VAT (in price)" };
}

export function normalizeFundingSource(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower === "parent" || lower.includes("privately") || lower === "private") {
    return "Privately Funded";
  }
  if (lower.includes("direct payment") || (lower.includes("local authority") && lower.includes("dp"))) {
    return "Local authority (Direct Payments)";
  }
  if (lower.includes("la-funded") || lower.includes("local authority") || lower.includes("nhs")) {
    return "Local authority / NHS funded";
  }
  return s;
}

export function normalizePayMethod(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.replace(/\bbank transfer\b/i, "Bank Transfer");
}

function retargetSlotDay(slot: ParsedSlot, day: string): ParsedSlot {
  const isWeekend = WEEKEND_DAYS.has(day);
  const counts = sessionCountsForDay(day);
  const price = slot.pricePerSession ?? unitPriceFor(slot.serviceType, slot.durationMin);
  return {
    ...slot,
    day,
    isWeekend,
    sessions: { ...counts },
    pricePerSession: price,
    termTotals: termTotals(price, counts),
    displayLabel: undefined,
  };
}

/** Read explicit day hints from payment Services / Sessions columns. */
function extractDayHintFromPayment(serviceRaw: string, data: Record<string, unknown>): string {
  const sessions = pickPaymentField(data, ["Sessions", "sessions", "Session", "Term"]);
  const blob = `${serviceRaw} ${sessions}`.toLowerCase();
  const paren = String(serviceRaw || "").match(/\(([^)]+)\)/);
  if (paren) {
    const days = expandDaysFromParen(paren[1]);
    /* Only a single weekday is a usable global hint; multi-day labels
     * (Mon, Wed & Fri) must not collapse onto Monday. */
    if (days.length === 1 && DAY_ORDER.includes(days[0])) return days[0];
  }
  if (/\bsun(day|s)?\b/.test(blob)) return "Sunday";
  if (/\bsat(urday|s)?\b/.test(blob)) return "Saturday";
  return "";
}

function applyPaymentDayHints(
  weekly: ParsedSlot[],
  serviceRaw: string,
  data: Record<string, unknown>,
): ParsedSlot[] {
  const hint = extractDayHintFromPayment(serviceRaw, data);
  return weekly.map((slot) => {
    let out = slot;
    const st = normalizeServiceType(slot.serviceType);
    const isMulti = st.includes("MULTI");
    const hasDay = !!(slot.day && DAY_ORDER.includes(slot.day));
    // Never overwrite an explicit per-slot day (multi-service sheets pair
    // "Aquatic … (Monday) · Multi … (Sunday)" — first paren must not win).
    if (!hasDay && hint && DAY_ORDER.includes(hint)) {
      out = retargetSlotDay(slot, hint);
    }
    if (
      isMulti &&
      out.durationMin >= 60 &&
      !hasDay &&
      /\(\s*sun\b/i.test(String(serviceRaw || ""))
    ) {
      out = retargetSlotDay(out, "Sunday");
    }
    out.displayLabel = buildSlotDisplayLabel(out);
    return out;
  });
}

export function paymentClientKeyForParticipant(displayName: string): string {
  return canonicalParticipantClientId(displayName).replace(/_/g, "-");
}

function pickPaymentField(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = data[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== "—" && s !== "-") return s;
  }
  return "";
}

export function weeklySlotsFromRosterRows(
  participantName: string,
  rosterRows: Array<{
    client_name?: string;
    day?: string;
    time_slot?: string;
    service?: string;
    venue?: string;
    instructors?: string;
  }>,
): ParsedSlot[] {
  const seen = new Set<string>();
  const out: ParsedSlot[] = [];
  let idx = 0;
  for (const row of rosterRows) {
    if (!namesMatch(participantName, String(row.client_name || ""))) continue;
    const day = normalizeDay(String(row.day || ""));
    const svc = String(row.service || "").trim();
    if (!day || !svc || /day centre/i.test(svc)) continue;
    const st = normalizeServiceType(svc);
    let durationMin = 30;
    let serviceType = "AQUATIC ACTIVITY";
    if (st.includes("CLIMB") || st === "CL") {
      durationMin = 60;
      serviceType = "CLIMBING ACTIVITY";
    } else if (st.includes("MULTI") || st.includes("S&C") || st === "S & C") {
      durationMin = 90;
      serviceType = "MULTI-ACTIVITY";
    } else if (st.includes("BESPOKE")) {
      durationMin = 60;
      serviceType = "BESPOKE PROGRAMME";
    } else if (st.includes("PHYSICAL") || st.includes("FITNESS")) {
      durationMin = 60;
      serviceType = "PHYSICAL ACTIVITY";
    } else if (st.includes("COUNSEL")) {
      durationMin = 45;
      serviceType = "COUNSELLING";
    } else if (st.includes("AQUATIC") || st.includes("SWIM") || st === "SW") {
      durationMin = 30;
      serviceType = "AQUATIC ACTIVITY";
    } else {
      serviceType = canonicalizeServiceTypeToken(st);
    }
    serviceType = canonicalizeServiceTypeToken(serviceType);
    const key = slotDedupeKey({ day, serviceType } as ParsedSlot);
    if (seen.has(key)) continue;
    seen.add(key);
    const isWeekend = WEEKEND_DAYS.has(day);
    const counts = sessionCountsForDay(day);
    const price = unitPriceFor(serviceType, durationMin);
    const slot: ParsedSlot = {
      id: `roster-${idx++}`,
      raw: `${durationMin}' ${serviceType} (${day})`,
      serviceType,
      durationMin,
      day,
      isWeekend,
      isDayCentre: false,
      pricePerSession: price,
      sessions: { ...counts },
      termTotals: termTotals(price, counts),
      timeSlot: String(row.time_slot || "").trim() || undefined,
      venue: String(row.venue || "").trim() || undefined,
      instructor: String(row.instructors || "").trim() || undefined,
    };
    slot.displayLabel = buildSlotDisplayLabel(slot);
    out.push(slot);
  }
  return out;
}

/** Parse a "9.30 to 11" style slot into start/end minutes (afternoon 1–8 → pm). */
function publishedSlotStartEndMinutes(ts: string): { start: number; end: number } | null {
  const parts = String(ts || "").trim().split(/\s+to\s+/i);
  const parseTok = (tok: string): number | null => {
    const t = String(tok || "").trim().replace(",", ".");
    const m = t.match(/^(\d{1,2})(?:[.:](\d{1,2}))?/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mi = m[2] ? parseInt(m[2].padEnd(2, "0").slice(0, 2), 10) : 0;
    if (h >= 1 && h <= 8) h += 12; // after-school / weekend afternoon slots
    return h * 60 + (Number.isFinite(mi) ? mi : 0);
  };
  const start = parseTok(parts[0] || "");
  if (start == null) return null;
  const end = parts[1] != null ? parseTok(parts[1]) : null;
  return { start, end: end == null ? start : end };
}

/**
 * Collapse the roster's per-teacher split rows into ONE service per
 * (weekday + programme) — mirroring the parent portal's buildServicesDetail.
 * A 90' Multi-Activity stored as two 45' teaching halves (different
 * instructor/pool) becomes a single 90' Multi-Activity spanning the outer
 * time bounds; two consecutive 30' aquatic slots become one 60' block, etc.
 * Pricing is preserved (per-minute unit price × summed minutes = same total),
 * so parents/admin/re-enrolment see one line while staff cards keep the halves.
 */
function collapsePublishedWeekly(weekly: ParsedSlot[]): ParsedSlot[] {
  const groups = new Map<string, ParsedSlot[]>();
  const order: string[] = [];
  for (const s of weekly) {
    const key = `${s.day}|${normalizeServiceType(s.serviceType)}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(s);
  }
  const uniq = (a: string[]) => [...new Set(a.filter(Boolean))];
  const out: ParsedSlot[] = [];
  for (const key of order) {
    const parts = groups.get(key)!;
    if (parts.length === 1) {
      out.push(parts[0]);
      continue;
    }
    const base = parts[0];
    const day = base.day;
    const isMulti = normalizeServiceType(base.serviceType).includes("MULTI");
    let minStart = Infinity;
    let maxEnd = -Infinity;
    let startTok = "";
    let endTok = "";
    let sumDur = 0;
    const venues: string[] = [];
    const instructors: string[] = [];
    for (const p of parts) {
      sumDur += Number(p.durationMin) || 0;
      if (p.venue) venues.push(p.venue);
      if (p.instructor) instructors.push(p.instructor);
      const raw = String(p.timeSlot || "").split(/\s+to\s+/i);
      const se = publishedSlotStartEndMinutes(String(p.timeSlot || ""));
      if (se) {
        if (se.start < minStart) {
          minStart = se.start;
          startTok = (raw[0] || "").trim();
        }
        if (se.end > maxEnd) {
          maxEnd = se.end;
          endTok = (raw[1] || raw[0] || "").trim();
        }
      }
    }
    const spanDur = minStart !== Infinity && maxEnd > minStart ? maxEnd - minStart : 0;
    const durationMin = isMulti ? 90 : (sumDur || spanDur || base.durationMin);
    const counts = sessionCountsForDay(day);
    const explicitPrice = parts
      .map((p) => (p.pricePerSession != null && Number(p.pricePerSession) > 0 ? Number(p.pricePerSession) : null))
      .find((n) => n != null);
    const price = explicitPrice ?? unitPriceFor(base.serviceType, durationMin);
    const timeSlot = startTok && endTok ? `${startTok} to ${endTok}` : base.timeSlot;
    const merged: ParsedSlot = {
      ...base,
      durationMin,
      pricePerSession: price,
      sessions: { ...counts },
      termTotals: termTotals(price, counts),
      timeSlot,
      venue: uniq(venues)[0] || base.venue,
      instructor: uniq(instructors).join(" · ") || base.instructor,
      displayLabel: undefined,
    };
    merged.displayLabel = buildSlotDisplayLabel(merged);
    out.push(merged);
  }
  return out;
}

/**
 * Admin-published services (client_services_review.html →
 * portal_participant_service_lines.sessions) → ParsedSlot[]. Weekly slots are
 * collapsed to one per weekday+programme (see collapsePublishedWeekly), sorted
 * by day; Day Centre entries are appended. Pricing is derived from the
 * service type; callers may enrich with payment prices via
 * mergeWeeklySlotsFromRosterAndPayment.
 */
export function slotsFromPublishedSessions(
  sessions: Array<{
    service?: string;
    day?: string;
    timeSlot?: string;
    durationMin?: number;
    instructor?: string;
    venue?: string;
    area?: string;
    feeGbp?: number;
  }>,
): ParsedSlot[] {
  const weekly: ParsedSlot[] = [];
  const dayCentre: ParsedSlot[] = [];
  let idx = 0;
  for (const s of sessions || []) {
    const svcRaw = String(s.service || "").trim();
    if (!svcRaw) continue;
    if (/day\s*centre/i.test(svcRaw)) {
      dayCentre.push({
        id: `pub-dc-${idx++}`,
        raw: svcRaw,
        serviceType: "DAY CENTRE",
        durationMin: 0,
        day: "",
        isWeekend: false,
        isDayCentre: true,
        pricePerSession: null,
        sessions: { autumn: 0, spring: 0, summer: 0, annual: 0 },
        termTotals: { autumn: 0, spring: 0, summer: 0, annual: 0 },
        venue: String(s.venue || "").trim() || "SwimFarm",
      });
      continue;
    }
    const serviceType = canonicalizeServiceTypeToken(svcRaw);
    let durationMin = Number(s.durationMin) || 0;
    if (!durationMin) {
      durationMin = serviceType.includes("MULTI")
        ? 90
        : serviceType.includes("CLIMB") ||
            serviceType.includes("PHYSICAL") ||
            serviceType.includes("BESPOKE")
        ? 60
        : serviceType.includes("COUNSEL")
        ? 45
        : 30;
    }
    const day = normalizeDay(String(s.day || ""));
    const isWeekend = WEEKEND_DAYS.has(day);
    const counts = sessionCountsForDay(day);
    const area = String(s.area || "").trim();
    const timeSlot = String(s.timeSlot || "").trim();
    const venue = String(s.venue || "").trim();
    const feeRaw = Number(s.feeGbp);
    const isAcatAquatic =
      serviceType.includes("AQUATIC") &&
      (/acat/i.test(area) ||
        (/monday/i.test(day) && /11\s*to\s*12/i.test(timeSlot) && /swimfarm/i.test(venue)));
    const price =
      Number.isFinite(feeRaw) && feeRaw > 0
        ? feeRaw
        : isAcatAquatic
        ? 50
        : unitPriceFor(serviceType, durationMin);
    const slot: ParsedSlot = {
      id: `pub-${idx++}`,
      raw: `${durationMin}' ${serviceType}${day ? ` (${day})` : ""}`,
      serviceType,
      durationMin,
      day,
      isWeekend,
      isDayCentre: false,
      pricePerSession: price,
      sessions: { ...counts },
      termTotals: termTotals(price, counts),
      timeSlot: timeSlot || undefined,
      venue: venue || undefined,
      instructor: String(s.instructor || "").trim() || undefined,
    };
    slot.displayLabel = buildSlotDisplayLabel(slot);
    weekly.push(slot);
  }
  return sortWeeklySlotsByDay(collapsePublishedWeekly(weekly)).concat(dayCentre);
}

export function ageFromDobIso(dobIso: string | null | undefined): string | null {
  const raw = String(dobIso || "").trim();
  if (!raw) return null;
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 ? String(age) : null;
}

export function buildCurrentArrangements2526(opts: {
  participantName: string;
  dobIso?: string | null;
  serviceRaw?: string | null;
  weeklySlots: ParsedSlot[];
  dayCentreSlots: ParsedSlot[];
  rosterRows: Array<{ instructors?: string; venue?: string }>;
  paymentMethod?: string | null;
  funding?: string | null;
  invoiceType?: string | null;
}) {
  const weekly = opts.weeklySlots || [];
  const dc = opts.dayCentreSlots || [];
  const slotLabels = weekly
    .map((s) => s.displayLabel || buildSlotDisplayLabel(s))
    .filter(Boolean);
  const venues = weekly.map((s) => s.venue).filter(Boolean) as string[];
  const instructors = weekly.map((s) => s.instructor).filter(Boolean) as string[];
  if (!instructors.length && opts.rosterRows.length) {
    const counts = new Map<string, number>();
    for (const row of opts.rosterRows) {
      const name = String(row.instructors || "").trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
    const picked = pickModeValue(counts);
    if (picked) instructors.push(picked);
  }
  let service = String(opts.serviceRaw || "").trim() || null;
  if (!service) {
    if (weekly.length && dc.length) service = "After-School & Weekends + Day Centre";
    else if (weekly.length) service = "After-School & Weekends";
    else if (dc.length) service = "Day Centre";
  }
  return {
    participant_name: opts.participantName,
    age: ageFromDobIso(opts.dobIso),
    service,
    slot: slotLabels.length ? slotLabels.join(" · ") : dc.length ? "Day Centre (weekdays)" : null,
    venue: venues.length ? [...new Set(venues)].join(" · ") : dc.length ? "SwimFarm" : null,
    instructor: instructors.length ? [...new Set(instructors)].join(" · ") : null,
    payment_method: opts.paymentMethod || null,
    funding: opts.funding || null,
    invoice_type: opts.invoiceType || null,
  };
}

function parseCostInfo(data: Record<string, unknown>): {
  perSession: number | null;
  perWeek: number | null;
} {
  const raw = pickPaymentField(data, [
    "Cost",
    "cost",
    "Price",
    "price",
    "Rate",
    "Session cost",
    "Session price",
  ]);
  if (!raw) return { perSession: null, perWeek: null };
  const m = String(raw).match(/£?\s*([\d]+(?:\.\d+)?)/);
  if (!m) return { perSession: null, perWeek: null };
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return { perSession: null, perWeek: null };
  if (/\/\s*week/i.test(String(raw))) return { perSession: null, perWeek: n };
  /* Require explicit session unit — bare "£3,700" / "1,850.00" are year packages. */
  if (/\/\s*session/i.test(String(raw)) || /\bper\s+session\b/i.test(String(raw))) {
    return { perSession: n, perWeek: null };
  }
  return { perSession: null, perWeek: null };
}

function parseCostPerSession(data: Record<string, unknown>): number | null {
  return parseCostInfo(data).perSession;
}

function applyCostFallbackToWeekly(
  weekly: ParsedSlot[],
  costPerSession: number | null,
  costPerWeek: number | null = null,
): ParsedSlot[] {
  if (!weekly.length) return weekly;
  let sessionPrice = costPerSession;
  if (sessionPrice == null && costPerWeek != null && costPerWeek > 0) {
    const unpriced = weekly.filter((s) => s.pricePerSession == null).length;
    const n = unpriced || weekly.length;
    if (n > 0) sessionPrice = Math.round((costPerWeek / n) * 100) / 100;
  }
  if (sessionPrice == null) return weekly;
  return weekly.map((s) => {
    if (s.pricePerSession != null) return s;
    return {
      ...s,
      pricePerSession: sessionPrice,
      termTotals: termTotals(sessionPrice, s.sessions),
    };
  });
}

function applyCostToDayCentre(
  dayCentre: ParsedSlot[],
  costPerSession: number | null,
): ParsedSlot[] {
  if (costPerSession == null || !dayCentre.length) return dayCentre;
  return dayCentre.map((s) => {
    const price = s.pricePerSession != null ? s.pricePerSession : costPerSession;
    return {
      ...s,
      pricePerSession: price,
      termTotals: termTotals(price, s.sessions),
    };
  });
}

export function paymentRowToContext(row: Record<string, unknown>) {
  const data = (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>;
  const sheet = String(row.sheet || "");
  const serviceRaw = pickPaymentField(data, [
    "service",
    "Service",
    "Services",
    "services",
    "Programme",
    "Programmes",
    "Activity",
  ]) || String(row.service || "").trim();
  const sessionsRaw = pickPaymentField(data, [
    "Sessions",
    "sessions",
    "Session",
    "Schedule",
    "schedule",
    "Times",
    "Time",
    "Time slot",
    "Time Slot",
  ]);
  const service = coalescePaymentServiceAndSessions(serviceRaw, sessionsRaw);
  const clientName = String(
    row.client_name || data.pax || data["Client Name"] || data.clientName || "",
  );
  const parentName = String(
    row.parent_name || data.parent || data.Parent || "",
  );
  const outstanding =
    data.out != null && data.out !== ""
      ? Number(data.out)
      : row.outstanding_amount != null
      ? Number(row.outstanding_amount)
      : null;

  const payMethod = normalizePayMethod(
    pickPaymentField(data, [
      "payMethod",
      "Pay method",
      "Payment method",
      "Payment Method",
      "Method",
    ]),
  );

  let fundRaw = pickPaymentField(data, [
    "fund",
    "Fund",
    "Funding",
    "Funder",
    "Funding origin",
  ]);
  let fundingSource = normalizeFundingSource(fundRaw);
  if (!fundingSource) {
    fundingSource = sheet === "LA"
      ? "Local authority / NHS funded"
      : "Privately Funded";
  }

  const vatInfo = normalizeInvoiceType(
    pickPaymentField(data, ["vat", "VAT", "Vat"]),
  );

  const slots = parseServiceString(service);
  const { weekly: weeklyRaw, dayCentre } = splitSlots(slots);
  const costInfo = parseCostInfo(data);
  const weeklyRawWithHints = applyPaymentDayHints(weeklyRaw, service, data);
  const weekly = applyCostFallbackToWeekly(
    weeklyRawWithHints,
    costInfo.perSession,
    costInfo.perWeek,
  );
  const dayCentrePriced = applyCostToDayCentre(dayCentre, costInfo.perSession);

  return {
    clientKey: String(row.client_key || ""),
    clientName,
    parentName,
    sheet,
    paymentStatus: String(row.payment_status || data.st || data.Status || ""),
    outstanding,
    payMethod,
    fundingSource,
    vat: vatInfo.label,
    vatCode: vatInfo.code,
    serviceRaw: service,
    weeklySlots: weekly,
    dayCentreSlots: dayCentrePriced,
    annualWeeklyTotal: annualTotalForWeekly(weekly),
  };
}
