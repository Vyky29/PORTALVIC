/** Re-enrolment 2026/27 — service catalogue, session counts, parsing. */

import { canonicalParticipantClientId } from "./participant_identity.ts";

export const REENROL_ACADEMIC_YEAR = "2026-27";

export const SESSION_COUNTS = {
  weekday: { autumn: 14, spring: 11, summer: 13, annual: 38 },
  weekend: { autumn: 13, spring: 9, summer: 11, annual: 33 },
} as const;

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

/** Base unit prices (per session at standard duration). */
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

function normalizeServiceSegment(raw: string): string {
  return String(raw || "")
    .replace(/[''′](?:\s*[''′])+/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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
  const durationMin =
    serviceType.includes("MULTI") && (!slot.durationMin || slot.durationMin < 60)
      ? 90
      : serviceType.includes("AQUATIC") && (!slot.durationMin || slot.durationMin > 45)
      ? 30
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

function parseOneSegment(segment: string, index: number): ParsedSlot | null {
  const raw = normalizeServiceSegment(segment);
  if (!raw || raw === "—" || raw === "-") return null;

  const dcMatch = raw.match(/day\s*centre/i);
  if (dcMatch) {
    const ratio = raw.match(/(\d:\d)/)?.[1] || undefined;
    const hours = raw.match(/(\d+h(?:\d+)?|\d+\s*h(?:\s*\d+)?)/i)?.[0] || undefined;
    return {
      id: `dc-${index}`,
      raw,
      serviceType: "DAY CENTRE",
      durationMin: 0,
      day: "",
      isWeekend: false,
      isDayCentre: true,
      pricePerSession: null,
      sessions: { autumn: 0, spring: 0, summer: 0, annual: 0 },
      termTotals: { autumn: 0, spring: 0, summer: 0, annual: 0 },
      ratio,
      hoursLabel: hours,
      venue: "SwimFarm",
    };
  }

  const bespokeDc = raw.match(/(\d:\d)\s*bespoke\s*([\d.h\s]+)/i);
  if (bespokeDc && raw.match(/mon\s*[–-]\s*fri|mon–fri|mon-fri/i)) {
    return {
      id: `dc-${index}`,
      raw,
      serviceType: "DAY CENTRE (BESPOKE BLOCK)",
      durationMin: 0,
      day: "Mon–Fri",
      isWeekend: false,
      isDayCentre: true,
      pricePerSession: null,
      sessions: { autumn: 0, spring: 0, summer: 0, annual: 0 },
      termTotals: { autumn: 0, spring: 0, summer: 0, annual: 0 },
      ratio: bespokeDc[1],
      hoursLabel: bespokeDc[2]?.trim(),
      venue: "SwimFarm",
    };
  }

  const shortSw = raw.match(/^(SW|CL)\s*\(([^)]+)\)/i);
  if (shortSw) {
    const durationMin = shortSw[1].toUpperCase() === "CL" ? 60 : 30;
    const serviceType = shortSw[1].toUpperCase() === "CL" ? "CLIMBING ACTIVITY" : "AQUATIC ACTIVITY";
    const dayRaw = shortSw[2] || "";
    const dayPart = dayRaw.split(/[/+&·]/)[0]?.trim() || dayRaw;
    const day = normalizeDay(dayPart.replace(/\s*1:1.*$/i, "").trim());
    const ratio = dayRaw.match(/(\d:\d)/)?.[1];
    const isWeekend = WEEKEND_DAYS.has(day);
    const counts = sessionCountsForDay(day);
    const price = unitPriceFor(serviceType, durationMin);
    const slot: ParsedSlot = {
      id: `slot-${index}`,
      raw,
      serviceType,
      durationMin,
      day,
      isWeekend,
      isDayCentre: false,
      pricePerSession: price,
      sessions: { ...counts },
      termTotals: termTotals(price, counts),
      ratio: ratio || undefined,
    };
    slot.displayLabel = buildSlotDisplayLabel(slot);
    return slot;
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
    return null;
  }

  const durationMin = Number(m[1]) || 30;
  let serviceType = canonicalizeServiceTypeToken(stripServiceToken(m[2]));

  const dayRaw = m[3] || "";
  const dayPart = dayRaw.split(/[/+&·]/)[0]?.trim() || dayRaw;
  const day = normalizeDay(dayPart.replace(/\s*1:1.*$/i, "").trim());
  const ratio = dayRaw.match(/(\d:\d)/)?.[1];
  const isWeekend = WEEKEND_DAYS.has(day);
  const counts = sessionCountsForDay(day);
  const price = unitPriceFor(serviceType, durationMin);

  const slot: ParsedSlot = {
    id: `slot-${index}`,
    raw,
    serviceType,
    durationMin,
    day,
    isWeekend,
    isDayCentre: false,
    pricePerSession: price,
    sessions: { ...counts },
    termTotals: termTotals(price, counts),
    ratio: ratio || undefined,
  };
  slot.displayLabel = buildSlotDisplayLabel(slot);
  return slot;
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

export function formatTimeSlotLabel(timeSlot: string): string {
  const s = String(timeSlot || "").trim();
  if (!s) return "";
  if (/\b(am|pm)\b/i.test(s)) return s;
  const startRaw = s.split(/\s+to\s+/i)[0]?.trim() || "";
  const start = Number.parseFloat(startRaw);
  if (Number.isFinite(start) && start >= 1 && start <= 8) return `${s} pm`;
  return s;
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

export function parseServiceString(service: string): ParsedSlot[] {
  const parts = String(service || "")
    .split(/\s*[·•]\s*|\s+\+\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: ParsedSlot[] = [];
  parts.forEach((part, i) => {
    const slot = parseOneSegment(part, i);
    if (slot) out.push(slot);
  });

  if (!out.length && /day centre/i.test(service)) {
    const slot = parseOneSegment(service, 0);
    if (slot) out.push(slot);
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
    return { code: "vat_included", label: "20% VAT included" };
  }
  if (s.includes("exempt") || s === "0") {
    return { code: "exempt", label: "EXEMPT VAT" };
  }
  if (s.includes("20") || s.includes("vat") || s === "0.2") {
    return { code: "vat_included", label: "20% VAT included" };
  }
  return { code: "vat_included", label: "20% VAT included" };
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
    const dayPart = paren[1].split(/[/+&·,]/)[0]?.trim() || "";
    const fromParen = normalizeDay(dayPart.replace(/\s*1:1.*$/i, "").trim());
    if (fromParen && DAY_ORDER.includes(fromParen)) return fromParen;
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
    if (hint && DAY_ORDER.includes(hint) && hint !== slot.day) {
      if (isMulti && slot.durationMin >= 60) {
        out = retargetSlotDay(slot, hint);
      } else if (!slot.day || !DAY_ORDER.includes(slot.day)) {
        out = retargetSlotDay(slot, hint);
      }
    }
    if (isMulti && slot.durationMin >= 60 && /\(\s*sun\b/i.test(String(serviceRaw || ""))) {
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
    const price = unitPriceFor(base.serviceType, durationMin);
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
    const price = unitPriceFor(serviceType, durationMin);
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
      timeSlot: String(s.timeSlot || "").trim() || undefined,
      venue: String(s.venue || "").trim() || undefined,
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

function parseCostPerSession(data: Record<string, unknown>): number | null {
  const raw = pickPaymentField(data, [
    "Cost",
    "cost",
    "Price",
    "price",
    "Rate",
    "Session cost",
    "Session price",
  ]);
  if (!raw) return null;
  const m = String(raw).match(/£?\s*([\d]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function applyCostFallbackToWeekly(
  weekly: ParsedSlot[],
  costPerSession: number | null,
): ParsedSlot[] {
  if (costPerSession == null || !weekly.length) return weekly;
  return weekly.map((s) => {
    if (s.pricePerSession != null) return s;
    return {
      ...s,
      pricePerSession: costPerSession,
      termTotals: termTotals(costPerSession, s.sessions),
    };
  });
}

export function paymentRowToContext(row: Record<string, unknown>) {
  const data = (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>;
  const sheet = String(row.sheet || "");
  const service = pickPaymentField(data, [
    "service",
    "Service",
    "Services",
    "services",
    "Programme",
    "Programmes",
    "Activity",
  ]) || String(row.service || "").trim();
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
  const costPerSession = parseCostPerSession(data);
  const weeklyRawWithHints = applyPaymentDayHints(weeklyRaw, service, data);
  const weekly = applyCostFallbackToWeekly(weeklyRawWithHints, costPerSession);

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
    dayCentreSlots: dayCentre,
    annualWeeklyTotal: annualTotalForWeekly(weekly),
  };
}
