/**
 * Aggregate MADRE adapter rows into a public weekly booking offer
 * (no participant names). Capacity rules aligned with admin Services register.
 */
import {
  canonicalizeServiceTypeToken,
} from "./reenrolment_catalog.ts";
import { madreToAdapterRows, type MadreDoc } from "./portal_madre_fold_logic.ts";
import { CRASH_SUMMER_WEEKS } from "./crash_summer_2026.ts";

export type PublicServiceId =
  | "aquatic"
  | "climbing"
  | "physical"
  | "multi"
  | "bespoke"
  | "day_centre"
  | "counselling";

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
  /** Instructor keys on the reference open/booked band (office Assign prefill). */
  instructors?: string[];
  /** Internal: booked client keys for band merge (stripped before public JSON). */
  bookedKeys?: string[];
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
  /** No public bookable slots — office/admin arranges places. */
  enquireOnly?: boolean;
  /** Day Centre (and similar) info panel hours line. */
  infoHours?: string;
  /** Day Centre activity examples shown instead of a slot grid. */
  infoActivities?: string[];
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
      "Swimming and hydrotherapy with autism specialists — more than a standard pool lesson. Person-centred sessions with visual supports, focused on water confidence, communication, emotional regulation, and independence at the participant’s pace.",
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
      "Structured climbing led by autism specialists. Builds agility, balance, coordination, and confidence, with 1:1 support, clear routines, and visual aids so each participant can progress safely.",
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
      "Fitness with personal trainers from our autism specialists team — strength, cardio, and movement circuits. Improves motor skills, energy regulation, and confidence in a structured session every participant can succeed in.",
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
      "Splash & Connect: a 90-minute multidisciplinary block at SwimFarm on Sundays — land-based learning (communication, social skills, independence) plus swimming. One visit that supports mind and body for the participant.",
  },
  bespoke: {
    id: "bespoke",
    name: "Bespoke Programme",
    tier: "more",
    ageHint: "From 3 years+",
    durationHint: "Agreed with the office",
    priceHint: "From £125 / 60 min session",
    pricePerSession: 125,
    enquireOnly: true,
    blurb:
      "An individualised 1:1 programme around the participant’s goals — social communication, independence, and emotional and physical well-being. Arranged with the office after enquiry; we do not publish bookable Bespoke slots online.",
  },
  day_centre: {
    id: "day_centre",
    name: "Day Centre",
    tier: "more",
    ageHint: "From 3 years+",
    durationHint: "Mon–Fri · 11am – 4pm",
    priceHint: "Funding / bespoke quote",
    pricePerSession: null,
    enquireOnly: true,
    infoHours: "Open Monday to Friday, 11am – 4pm at SwimFarm.",
    infoActivities: [
      "Circle time and shared Hub activities with peers",
      "Vocational tasks (packing, matching, envelopes) plus maths and handwriting",
      "Gym circuits, basketball, and structured physical activity",
      "Swimming / aquatic within the day",
      "Lunch, life skills, and group snack",
      "Sensory room and regulation time",
      "Karaoke, film, and photos shared with families at the end of the day",
      "Community trips (shops, local outings) with 2:1 when planned",
    ],
    blurb:
      "A structured weekday at SwimFarm (Mon–Fri, 11am–4pm): circle time, vocational and classroom work, gym, swimming, life skills, and peer activities — with 1:1 on site (2:1 when transitions, personal care, or community trips need it). Places are agreed with the office first.",
  },
  counselling: {
    id: "counselling",
    name: "Counselling",
    tier: "more",
    ageHint: "Young people & adults",
    durationHint: "Face to face or Zoom",
    priceHint: "Enquire with the office",
    pricePerSession: null,
    enquireOnly: true,
    blurb:
      "Counselling for young people and adults with autism and their families. Person-centred sessions to explore what concerns you — face to face in Chiswick or online via Zoom. Short-term (4–6 weeks) or longer; starts with a short assessment call.",
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
  if (canon.includes("COUNSEL")) return "counselling";
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

function clientKey(clientName: string): string {
  return norm(clientName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
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

function slotId(
  serviceId: PublicServiceId,
  venue: string,
  day: string,
  sortTime: string,
  timeLabel: string,
): string {
  return `live-${serviceId}-${venue}-${day}-${sortTime}-${timeLabel}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Midpoint minutes from OfferSlot sortTime + trailing end in timeLabel ("9.30 – 11.00"). */
function slotMidMinutes(slot: OfferSlot): number {
  const startParts = String(slot.sortTime || "").split(":");
  const startH = Number(startParts[0]);
  const startM = Number(startParts[1] || 0);
  if (!Number.isFinite(startH)) return 12 * 60;
  const start = startH * 60 + (Number.isFinite(startM) ? startM : 0);
  const m = String(slot.timeLabel || "").match(
    /(\d{1,2})\.(\d{2})\s*[–—\-]\s*(\d{1,2})\.(\d{2})/,
  );
  if (!m) return start + 30;
  let eh = Number(m[3]);
  const em = Number(m[4]);
  // 12h labels without am/pm: 1.xx after noon bands → treat as PM when start ≥ 12
  if (start >= 12 * 60 && eh < 12) eh += 12;
  if (start < 12 * 60 && eh < startH && eh <= 11) {
    /* keep as morning */
  }
  const end = eh * 60 + em;
  if (!Number.isFinite(end) || end <= start) return start + 30;
  return (start + end) / 2;
}

/**
 * Collapse Multi raw MADRE fragments into operator timetable rows
 * (same rules as admin Services register):
 * - Wed Multi (all venues) → not offered publicly (Aug 2026)
 * - Sun SwimFarm → three 90′ bands 9.30–11 / 11–12.30 / 12.30–2, cap 6
 */
function foldMultiActivityOfferSlots(slots: OfferSlot[]): OfferSlot[] {
  const rest: OfferSlot[] = [];
  const sunSwim: OfferSlot[] = [];
  for (const s of slots) {
    if (s.serviceId === "multi" && s.day === "Wednesday") {
      continue;
    } else if (
      s.serviceId === "multi" &&
      s.venue === "SwimFarm" &&
      s.day === "Sunday"
    ) {
      sunSwim.push(s);
    } else {
      rest.push(s);
    }
  }

  if (sunSwim.length) {
    const bands: { key: string; start: string; label: string; parts: OfferSlot[] }[] =
      [
        { key: "b1", start: "09:30", label: "9.30 – 11.00", parts: [] },
        { key: "b2", start: "11:00", label: "11.00 – 12.30", parts: [] },
        { key: "b3", start: "12:30", label: "12.30 – 2.00", parts: [] },
      ];
    for (const s of sunSwim) {
      const mid = slotMidMinutes(s);
      const idx = mid < 660 ? 0 : mid < 750 ? 1 : 2;
      bands[idx]!.parts.push(s);
    }
    const ref =
      sunSwim.map((s) => s.referenceDate || "").filter(Boolean).sort().pop() ||
      null;
    for (const band of bands) {
      if (!band.parts.length) continue;
      const cap = 6;
      // Unique named clients across MADRE half-slot fragments (not max fragment taken).
      // Irregular times (e.g. 9–10.15) otherwise leave a phantom "1 left".
      const partsForRef = band.parts.filter(
        (p) => !ref || !p.referenceDate || p.referenceDate === ref,
      );
      const useParts = partsForRef.length ? partsForRef : band.parts;
      const keys = new Set<string>();
      for (const part of useParts) {
        for (const k of part.bookedKeys || []) {
          if (k) keys.add(k);
        }
      }
      const uniqueTaken = keys.size;
      const fragMax = Math.max(0, ...useParts.map((s) => Number(s.taken) || 0));
      const fragSum = useParts.reduce((n, s) => n + (Number(s.taken) || 0), 0);
      const taken = Math.min(
        cap,
        uniqueTaken > 0 ? uniqueTaken : Math.max(fragMax, Math.min(cap, fragSum)),
      );
      rest.push({
        id: slotId("multi", "SwimFarm", "Sunday", band.start, band.label),
        serviceId: "multi",
        venue: "SwimFarm",
        day: "Sunday",
        timeLabel: band.label,
        sortTime: band.start,
        capacity: cap,
        taken,
        referenceDate: ref,
        bookedKeys: [...keys],
        instructors: [
          ...new Set(
            useParts.flatMap((p) =>
              Array.isArray(p.instructors) ? p.instructors : [],
            ),
          ),
        ].sort(),
      });
    }
  }

  return rest;
}

/** Ensure Sunday Westway climbing publishes the open 3–4pm band (2 places). */
function ensureClimbingSundayOpenBand(slots: OfferSlot[]): OfferSlot[] {
  const sunClimb = slots.filter(
    (s) =>
      s.serviceId === "climbing" &&
      s.day === "Sunday" &&
      /westway/i.test(s.venue),
  );
  if (!sunClimb.length) return slots;
  const hasThreeFour = sunClimb.some((s) => {
    const mid = slotMidMinutes(s);
    return mid >= 15 * 60 && mid < 16 * 60;
  });
  if (hasThreeFour) return slots;
  const venue = sunClimb[0]!.venue;
  const ref =
    sunClimb.map((s) => s.referenceDate || "").filter(Boolean).sort().pop() ||
    null;
  return [
    ...slots,
    {
      id: slotId("climbing", venue, "Sunday", "15:00", "3.00 – 4.00"),
      serviceId: "climbing",
      venue,
      day: "Sunday",
      timeLabel: "3.00 – 4.00",
      sortTime: "15:00",
      capacity: 2,
      taken: 0,
      referenceDate: ref,
    },
  ];
}

type DayBucket = {
  booked: number;
  open: number;
  instructors: Set<string>;
  bookedKeys: Set<string>;
};

/**
 * Full July crash window (W1 Mon 20 → W2 Fri 31), including Mon 27 between
 * weeks — never use as Autumn standing weekly template.
 */
const CRASH_TEMPLATE_SKIP_DATES: Set<string> = (() => {
  const out = new Set<string>([
    ...CRASH_SUMMER_WEEKS.w1.dates,
    ...CRASH_SUMMER_WEEKS.w2.dates,
  ]);
  for (let d = 20; d <= 31; d++) {
    out.add(`2026-07-${String(d).padStart(2, "0")}`);
  }
  return out;
})();

/**
 * Build weekly template slots from MADRE document.
 * Occupancy uses the latest non-crash date for each standing time template.
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
  /** Latest non-crash session date seen for service|venue|weekday (any time). */
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
    // Crash-week lines are intensive-only; keep them out of Autumn weekly template.
    if (CRASH_TEMPLATE_SKIP_DATES.has(iso)) continue;

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
      bucket = {
        booked: 0,
        open: 0,
        instructors: new Set(),
        bookedKeys: new Set(),
      };
      dateMap.set(iso, bucket);
    }
    const inst = norm(row.instructors);
    if (inst) bucket.instructors.add(inst.toUpperCase());
    if (kind === "booked") {
      bucket.booked += 1;
      const key = clientKey(String(row.client_name || ""));
      if (key) bucket.bookedKeys.add(key);
    } else {
      bucket.open += 1;
    }

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
    /*
     * Aquatic is 1:1 per instructor line. Prefer booked line count over unique
     * client keys so a 2:1 client (same name on two staff) does not leave a
     * phantom "places left" on the public offer.
     */
    const takenRaw =
      serviceId === "aquatic"
        ? bucket.booked
        : bucket.bookedKeys.size || bucket.booked;
    const taken = Math.min(takenRaw, cap);
    slots.push({
      id: slotId(serviceId, venue, day, sortTime, timeLabel),
      serviceId,
      venue,
      day,
      timeLabel,
      sortTime,
      capacity: cap,
      taken,
      referenceDate: ref,
      instructors: [...bucket.instructors].sort(),
      bookedKeys: [...bucket.bookedKeys],
    });
  }

  let folded = foldMultiActivityOfferSlots(slots);
  folded = ensureClimbingSundayOpenBand(folded);
  /* Day Centre + Bespoke are office-arranged only — never expose MADRE capacity as bookable slots. */
  folded = folded.filter((s) => s.serviceId !== "day_centre" && s.serviceId !== "bespoke");
  /* Defence in depth: Wed Multi stays off the public offer. */
  folded = folded.filter(
    (s) => !(s.serviceId === "multi" && s.day === "Wednesday"),
  );

  folded.sort((a, b) => {
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
    counselling: ["Chiswick"],
  };
  const always: PublicServiceId[] = [
    "aquatic",
    "climbing",
    "physical",
    "multi",
    "bespoke",
    "day_centre",
    "counselling",
  ];
  const fullServices: OfferService[] = always.map((id) => {
    let fromMadre = [...(venueSets.get(id) || [])].sort();
    if (id === "multi") {
      fromMadre = fromMadre.filter((v) => v !== "Acton");
    }
    // Counselling is office-arranged (Chiswick / Zoom) — never MADRE venues.
    if (id === "counselling") {
      return {
        ...SERVICE_META[id],
        venues: defaults.counselling,
      };
    }
    return {
      ...SERVICE_META[id],
      venues: fromMadre.length ? fromMadre : defaults[id],
    };
  });

  return {
    services: fullServices,
    slots: folded,
    termFrom,
    termTo,
    rowCount: rows.length,
  };
}

function bookingClientKey(name: unknown): string {
  return norm(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** True when a portal hold name is already counted on the MADRE band (e.g. Rayyan Fida vs Rayyan Fi). */
export function holdParticipantAlreadyOnOfferSlot(
  participantName: unknown,
  bookedKeys: string[] | undefined,
): boolean {
  const keys = bookedKeys || [];
  if (!keys.length) return false;
  const holdKey = bookingClientKey(participantName);
  if (!holdKey) return false;
  const roster = new Set(keys.map((k) => bookingClientKey(k)));
  if (roster.has(holdKey)) return true;
  const first = holdKey.split(" ")[0] || "";
  if (first.length < 3) return false;
  for (const rk of roster) {
    if (rk.startsWith(first + " ")) return true;
  }
  return false;
}

/** Apply active booking holds without double-counting roster names already on the band. */
export function seatsNeededFromHoldNotes(notes: unknown): number {
  const raw = String(notes || "");
  const m = raw.match(/seats_needed\s*=\s*(\d+)/i);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n >= 1) return Math.min(4, Math.floor(n));
  }
  if (/support_regulated\s*=\s*2to1|ratio\s*=\s*2to1/i.test(raw)) return 2;
  return 1;
}

export function applyBookingSlotHoldsToOffer(
  weeklySlots: OfferSlot[],
  intensiveSlots: OfferSlot[],
  holds: Array<{ slot_id?: unknown; participant_name?: unknown; notes?: unknown }> | null | undefined,
): { applied: number; skipped_roster: number } {
  let applied = 0;
  let skippedRoster = 0;
  for (const hold of holds || []) {
    const sid = String(hold.slot_id || "").trim();
    if (!sid) continue;
    const weekly = weeklySlots.find((s) => s.id === sid);
    const intensive = weekly
      ? null
      : intensiveSlots.find((s) => String(s.id || "") === sid);
    const slot = weekly || intensive;
    if (!slot) continue;
    if (
      holdParticipantAlreadyOnOfferSlot(
        hold.participant_name,
        slot.bookedKeys,
      )
    ) {
      skippedRoster += 1;
      continue;
    }
    const seats = seatsNeededFromHoldNotes(hold.notes);
    const cap = Number(slot.capacity) || 0;
    slot.taken = Math.min(cap, (Number(slot.taken) || 0) + seats);
    applied += 1;
  }
  return { applied, skipped_roster: skippedRoster };
}
