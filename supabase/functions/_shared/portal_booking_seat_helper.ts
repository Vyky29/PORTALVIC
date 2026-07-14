/**
 * Aggregate MADRE adapter rows into a public weekly booking offer
 * (no participant names). Capacity rules aligned with admin Services register.
 */
import {
  canonicalizeServiceTypeToken,
} from "./reenrolment_catalog.ts";
import { madreToAdapterRows, type MadreDoc } from "./portal_madre_fold_logic.ts";

export type PublicServiceId =
  | "aquatic"
  | "climbing"
  | "physical"
  | "multi"
  | "bespoke"
  | "day_centre";

export type OfferSlot = {
  id: string;
  serviceId: PublicServiceId;
  venue: string;
  day: string;
  timeLabel: string;
  sortTime: string;
  capacity: number;
  taken: number;
  referenceDate: string | null;
};

export type OfferService = {
  id: PublicServiceId;
  name: string;
  tier: "core" | "more";
  ageHint: string;
  durationHint: string;
  priceHint: string;
  pricePerSession: number | null;
  blurb: string;
  venues: string[];
  intensiveBlocks?: boolean;
};

const DAY_ALIASES: Record<string, string> = {
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tues: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  weds: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thur: "Thursday",
  thurs: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
  sun: "Sunday",
  sunday: "Sunday",
};

const SERVICE_META: Record<PublicServiceId, Omit<OfferService, "venues">> = {
  aquatic: {
    id: "aquatic",
    name: "Aquatic Activity",
    tier: "core",
    ageHint: "From 3 years+",
    durationHint: "Usually 30 minutes",
    priceHint: "From £50 / 30 min session",
    pricePerSession: 50,
    blurb:
      "1:1 or small-group swimming sessions with sensory-aware instructors. We work at the child’s pace — water confidence, regulation, and independence.",
  },
  climbing: {
    id: "climbing",
    name: "Climbing Activity",
    tier: "core",
    ageHint: "From 3 years+",
    durationHint: "Usually 60 minutes",
    priceHint: "From £75 / 60 min session",
    pricePerSession: 75,
    blurb:
      "Supported climbing sessions that build strength, focus, and confidence. Routes and support levels are matched to each child.",
  },
  physical: {
    id: "physical",
    name: "Physical Activity",
    tier: "core",
    ageHint: "From 12 years+",
    durationHint: "Usually 60 minutes",
    priceHint: "From £75 / 60 min session",
    pricePerSession: 75,
    blurb:
      "Active sessions focused on movement, coordination, and stamina — adapted so every child can take part safely and with clear structure.",
  },
  multi: {
    id: "multi",
    name: "Multi-Activity",
    tier: "more",
    ageHint: "From 3 years+",
    durationHint: "Usually 90 minutes",
    priceHint: "From £120 / 90 min session",
    pricePerSession: 120,
    blurb:
      "Longer blocks that combine activities in one visit (for example pool plus land-based work). Ideal when families want variety in a single session.",
  },
  bespoke: {
    id: "bespoke",
    name: "Bespoke Programme",
    tier: "more",
    ageHint: "From 3 years+",
    durationHint: "Agreed with the office",
    priceHint: "From £125 / 60 min session",
    pricePerSession: 125,
    blurb:
      "A tailored programme built around your child’s goals, support needs, and schedule. Planned with the family and delivery team — enquire to start.",
  },
  day_centre: {
    id: "day_centre",
    name: "Day Centre",
    tier: "more",
    ageHint: "From 3 years+",
    durationHint: "Multi-hour weekday blocks",
    priceHint: "Funding / bespoke quote",
    pricePerSession: null,
    blurb:
      "Longer daytime blocks at SwimFarm with pool segments on some days. Places are planned with families and the office — enquire rather than instant-book.",
  },
};

function norm(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeWeekday(raw: unknown): string {
  const t = norm(raw).toLowerCase().replace(/[^a-z]/g, "");
  return DAY_ALIASES[t] || norm(raw);
}

export function mapServiceId(raw: unknown): PublicServiceId | null {
  const canon = canonicalizeServiceTypeToken(String(raw || ""));
  if (!canon) return null;
  if (canon.includes("DAY CENTRE") || canon.includes("DAYCENTRE")) return "day_centre";
  if (canon.includes("AQUATIC") || canon.includes("SWIM") || canon === "SW") return "aquatic";
  if (canon.includes("CLIMB") || canon === "CL") return "climbing";
  if (canon.includes("PHYSICAL") || canon.includes("FITNESS")) return "physical";
  if (canon.includes("MULTI") || canon.includes("S&C")) return "multi";
  if (canon.includes("BESPOKE")) return "bespoke";
  return null;
}

export function normalizeVenue(raw: unknown): string {
  const t = norm(raw).toLowerCase();
  if (t.includes("acton")) return "Acton";
  if (t.includes("northolt")) return "Northolt";
  if (t.includes("swimfarm") || t.includes("swim farm")) return "SwimFarm";
  if (t.includes("westway")) return "Westway";
  return norm(raw) || "Venue";
}

function clientKind(clientName: string): "open" | "booked" | "skip" {
  const up = norm(clientName).toUpperCase();
  if (!up) return "skip";
  if (
    up === "CLOSED" ||
    up === "NO CLIENT" ||
    up === "CASA" ||
    up === "HOME" ||
    up === "MANAGER" ||
    up === "OFF"
  ) {
    return "skip";
  }
  if (
    up === "NO PARTICIPANT" ||
    up === "NOPARTICIPANT" ||
    up === "OPEN" ||
    up === "AVAILABLE" ||
    up === "FREE"
  ) {
    return "open";
  }
  return "booked";
}

/** Parse MADRE time_slot into 24h start + display label. */
export function parseTimeSlot(raw: unknown): { sortTime: string; timeLabel: string } {
  const s = norm(raw);
  if (!s) return { sortTime: "00:00", timeLabel: "—" };

  const range = s.match(
    /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:[-–—]|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i,
  );
  if (range) {
    const a = toMinutes(Number(range[1]), Number(range[2] || 0), range[3]);
    const b = toMinutes(
      Number(range[4]),
      Number(range[5] || 0),
      range[6] || range[3],
    );
    return {
      sortTime: minutesToSort(a),
      timeLabel: `${format12(a)} – ${format12(b)}`,
    };
  }
  const one = s.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
  if (one) {
    const a = toMinutes(Number(one[1]), Number(one[2] || 0), one[3]);
    return { sortTime: minutesToSort(a), timeLabel: format12(a) };
  }
  return { sortTime: "00:00", timeLabel: s };
}

function toMinutes(h: number, m: number, ampm?: string): number {
  let hh = h;
  const ap = String(ampm || "").toLowerCase();
  if (ap === "pm" && hh < 12) hh += 12;
  if (ap === "am" && hh === 12) hh = 0;
  // After-school bare hours: 1–8 → PM (same heuristic as admin)
  if (!ap && hh >= 1 && hh <= 8) hh += 12;
  return hh * 60 + m;
}

function minutesToSort(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function format12(mins: number): string {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}.${String(m).padStart(2, "0")}`;
}

function displayCapacity(
  serviceId: PublicServiceId,
  venue: string,
  day: string,
  lineCount: number,
  instructorCount: number,
): number {
  if (serviceId === "multi" && venue === "Acton" && day === "Wednesday") return 4;
  if (serviceId === "multi" && venue === "SwimFarm" && day === "Sunday") return 6;
  return Math.max(1, instructorCount || lineCount || 1);
}

type DayBucket = {
  booked: number;
  open: number;
  instructors: Set<string>;
};

/**
 * Build weekly template slots from MADRE document.
 * Occupancy uses the latest date for each standing time template.
 * Times that only exist as historic one-offs (older weeks) are omitted.
 */
export function buildWeeklyOfferFromMadre(madre: MadreDoc): {
  services: OfferService[];
  slots: OfferSlot[];
  termFrom: string | null;
  termTo: string | null;
  rowCount: number;
} {
  const rows = madreToAdapterRows(madre);
  const meta = madre.meta || {};
  const termFrom = norm(meta.termFrom).slice(0, 10) || null;
  const termTo = norm(meta.termTo).slice(0, 10) || null;

  // key = service|venue|day|sortTime|timeLabel → date → bucket
  const byKey = new Map<string, Map<string, DayBucket>>();
  const venueSets = new Map<PublicServiceId, Set<string>>();
  /** Latest session date seen for service|venue|weekday (any time). */
  const latestBySvd = new Map<string, string>();

  for (const row of rows) {
    const serviceId = mapServiceId(row.service);
    if (!serviceId) continue;
    const kind = clientKind(String(row.client_name || ""));
    if (kind === "skip") continue;

    const venue = normalizeVenue(row.venue);
    const day = normalizeWeekday(row.day);
    if (!day) continue;
    const { sortTime, timeLabel } = parseTimeSlot(row.time_slot);
    const iso = norm(row.session_date).slice(0, 10);
    if (!iso) continue;

    const svd = `${serviceId}|${venue}|${day}`;
    const prevMax = latestBySvd.get(svd);
    if (!prevMax || iso > prevMax) latestBySvd.set(svd, iso);

    const key = `${serviceId}|${venue}|${day}|${sortTime}|${timeLabel}`;
    let dateMap = byKey.get(key);
    if (!dateMap) {
      dateMap = new Map();
      byKey.set(key, dateMap);
    }
    let bucket = dateMap.get(iso);
    if (!bucket) {
      bucket = { booked: 0, open: 0, instructors: new Set() };
      dateMap.set(iso, bucket);
    }
    const inst = norm(row.instructors);
    if (inst) bucket.instructors.add(inst.toUpperCase());
    if (kind === "booked") bucket.booked += 1;
    else bucket.open += 1;

    let vs = venueSets.get(serviceId);
    if (!vs) {
      vs = new Set();
      venueSets.set(serviceId, vs);
    }
    vs.add(venue);
  }

  const slots: OfferSlot[] = [];
  for (const [key, dateMap] of byKey.entries()) {
    const [serviceId, venue, day, sortTime, timeLabel] = key.split("|") as [
      PublicServiceId,
      string,
      string,
      string,
      string,
    ];
    const dates = [...dateMap.keys()].sort();
    if (!dates.length) continue;
    const ref = dates[dates.length - 1]!;
    const svdLatest = latestBySvd.get(`${serviceId}|${venue}|${day}`) || ref;
    // Drop one-off times that no longer appear on the latest roster day for this weekday.
    if (ref < svdLatest) continue;
    const bucket = dateMap.get(ref)!;
    const lineCount = bucket.booked + bucket.open;
    const cap = displayCapacity(
      serviceId,
      venue,
      day,
      lineCount,
      bucket.instructors.size,
    );
    const taken = Math.min(bucket.booked, cap);
    const id = `live-${serviceId}-${venue}-${day}-${sortTime}-${timeLabel}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    slots.push({
      id,
      serviceId,
      venue,
      day,
      timeLabel,
      sortTime,
      capacity: cap,
      taken,
      referenceDate: ref,
    });
  }

  slots.sort((a, b) => {
    const dayOrder: Record<string, number> = {
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
      Sunday: 7,
    };
    const d = (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99);
    if (d) return d;
    const t = a.sortTime.localeCompare(b.sortTime);
    if (t) return t;
    return a.venue.localeCompare(b.venue);
  });

  const defaults: Record<PublicServiceId, string[]> = {
    aquatic: ["Acton", "Northolt", "SwimFarm"],
    climbing: ["Westway"],
    physical: ["SwimFarm", "Acton"],
    multi: ["SwimFarm", "Northolt"],
    bespoke: ["SwimFarm", "Acton", "Westway"],
    day_centre: ["SwimFarm"],
  };
  const always: PublicServiceId[] = [
    "aquatic",
    "climbing",
    "physical",
    "multi",
    "bespoke",
    "day_centre",
  ];
  const fullServices: OfferService[] = always.map((id) => {
    const fromMadre = [...(venueSets.get(id) || [])].sort();
    return {
      ...SERVICE_META[id],
      venues: fromMadre.length ? fromMadre : defaults[id],
    };
  });

  return {
    services: fullServices,
    slots,
    termFrom,
    termTo,
    rowCount: rows.length,
  };
}
