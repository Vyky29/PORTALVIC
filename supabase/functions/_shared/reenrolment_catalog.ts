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

function parseOneSegment(segment: string, index: number): ParsedSlot | null {
  const raw = String(segment || "").trim();
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
    raw.match(
      /^(\d+)[''′]?\s*(.+?)\s*(?:\(([^)]+)\)|\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun))\s*$/i,
    ) ||
    raw.match(/^(\d+)[''′]?\s*(.+?)\s*\(([^)]+)\)/i) ||
    raw.match(/^(\d+)[''′]?\s*(SW|CL)\s*\(([^)]+)\)/i);

  if (!m) {
    if (/day centre/i.test(raw)) {
      return parseOneSegment("Day Centre " + raw, index);
    }
    return null;
  }

  const durationMin = Number(m[1]) || 30;
  let serviceType = normalizeServiceType(m[2]);
  if (serviceType === "SW") serviceType = "AQUATIC ACTIVITY";
  if (serviceType === "CL") serviceType = "CLIMBING ACTIVITY";

  const dayRaw = m[3] || "";
  const dayPart = dayRaw.split(/[/+&·]/)[0]?.trim() || dayRaw;
  const day = normalizeDay(dayPart.replace(/\s*1:1.*$/i, "").trim());
  const ratio = dayRaw.match(/(\d:\d)/)?.[1];
  const isWeekend = WEEKEND_DAYS.has(day);
  const counts = sessionCountsForDay(day);
  const price = unitPriceFor(serviceType, durationMin);

  return {
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

export function paymentRowToContext(row: Record<string, unknown>) {
  const data = (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>;
  const service = String(
    data.service ||
      data.Service ||
      data.Services ||
      data.services ||
      row.service ||
      "",
  ).trim();
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

  const vatRaw = String(data.vat || data.VAT || "");
  const vatLabel = vatRaw === "0.2" || vatRaw === "20" ? "PF / VAT 20%" : vatRaw;

  const slots = parseServiceString(service);
  const { weekly, dayCentre } = splitSlots(slots);

  return {
    clientKey: String(row.client_key || ""),
    clientName,
    parentName,
    sheet: String(row.sheet || ""),
    paymentStatus: String(row.payment_status || data.st || data.Status || ""),
    outstanding,
    funding: String(data.fund || data.payMethod || data["Payment Method"] || ""),
    vat: vatLabel,
    invoice: String(data.inv || data["INVOICES / SET UP"] || ""),
    serviceRaw: service,
    weeklySlots: weekly,
    dayCentreSlots: dayCentre,
    annualWeeklyTotal: annualTotalForWeekly(weekly),
  };
}
