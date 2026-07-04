/** Re-enrolment 2026/27 — service catalogue, session counts, parsing. */

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
  const key = String(raw || "").toLowerCase().replace(/[^a-z]/g, "");
  return DAY_ALIASES[key] || String(raw || "").trim();
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
    .replace(/^['''\s]+|['''\s]+$/g, "")
    .trim();
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
  let serviceType = normalizeServiceType(stripServiceToken(m[2]));
  if (serviceType === "SW") serviceType = "AQUATIC ACTIVITY";
  if (serviceType === "CL") serviceType = "CLIMBING ACTIVITY";

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
  if (t.includes("BESPOKE")) return "Bespoke Programme";
  if (t.includes("MULTI")) return "Multi-Activity";
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
  if (slot.day) label += ` - ${dayPluralLabel(slot.day)}`;
  if (slot.timeSlot) label += ` - ${formatTimeSlotLabel(slot.timeSlot)}`;
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
    for (const row of matches) {
      const ts = String(row.time_slot || "").trim();
      const venue = String(row.venue || "").trim();
      if (ts) timeCounts.set(ts, (timeCounts.get(ts) || 0) + 1);
      if (venue) venueCounts.set(venue, (venueCounts.get(venue) || 0) + 1);
    }
    const enriched: ParsedSlot = {
      ...slot,
      timeSlot: pickModeValue(timeCounts),
      venue: pickModeValue(venueCounts) || slot.venue,
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

function pickPaymentField(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = data[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== "—" && s !== "-") return s;
  }
  return "";
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
  const { weekly, dayCentre } = splitSlots(slots);

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
