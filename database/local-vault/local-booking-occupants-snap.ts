/**
 * LOCAL ONLY — seat lines instructor + client for bookingportal_preview.
 * Does not deploy. Does not change the public offer API.
 *
 *   npx -y deno run -A database/local-vault/local-booking-occupants-snap.ts
 *
 * Output (gitignored): working_ui/portal/_local_booking_occupants.json
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  aquaticOfferTimeSegments,
  applyBookingSlotHoldsToOffer,
  buildWeeklyOfferFromMadre,
  holdParticipantAlreadyOnOfferSlot,
  mapServiceId,
  normalizeVenue,
  normalizeWeekday,
  parseTimeSlot,
  seatsNeededFromHoldNotes,
} from "../../supabase/functions/_shared/portal_booking_seat_helper.ts";
import {
  BOOKING_SLOT_HOLD_STATUSES,
  filterActiveBookingHolds,
} from "../../supabase/functions/_shared/portal_booking_pay_hold.ts";
import {
  madreToAdapterRows,
  type MadreDoc,
} from "../../supabase/functions/_shared/portal_madre_fold_logic.ts";
import { CRASH_SUMMER_WEEKS } from "../../supabase/functions/_shared/crash_summer_2026.ts";

function loadEnv(p: string) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && !Deno.env.get(k)) Deno.env.set(k, v);
  }
}

const root = Deno.cwd();
loadEnv(join(root, "local-secrets/secrets.env"));
loadEnv(join(root, "local-secrets/edge-secrets.env"));

const URL = Deno.env.get("SUPABASE_URL") || "https://cklpnwhlqsulpmkipmqb.supabase.co";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!SERVICE) {
  console.error("missing SUPABASE_SERVICE_ROLE_KEY");
  Deno.exit(1);
}

const admin = createClient(URL, SERVICE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TERM_KEY = "summer-2026";

const CRASH_SKIP = new Set<string>([
  ...CRASH_SUMMER_WEEKS.w1.dates,
  ...CRASH_SUMMER_WEEKS.w2.dates,
]);
for (let d = 20; d <= 31; d++) {
  CRASH_SKIP.add(`2026-07-${String(d).padStart(2, "0")}`);
}

function norm(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function clientKind(name: string): "booked" | "open" | "skip" | "hold" | "trial" {
  const raw = norm(name);
  const up = raw.toUpperCase().replace(/[^A-Z0-9]+/g, "");
  if (!up) return "skip";
  if (
    up === "CLOSED" ||
    up === "CASA" ||
    up === "MANAGER" ||
    up === "COVERNEEDED" ||
    up === "COVER"
  ) {
    return "skip";
  }
  if (up === "HOLDWAITLIST") return "hold";
  if (/\(\s*trial\s*\)/i.test(raw) || /^hold\s*by\s*trial/i.test(raw)) {
    return "trial";
  }
  if (
    up === "NOPARTICIPANT" ||
    up === "OPEN" ||
    up === "AVAILABLE" ||
    up === "FREE"
  ) {
    return "open";
  }
  return "booked";
}

function stripTrialSuffix(name: string): string {
  return norm(name)
    .replace(/\(\s*trial\s*\)/gi, "")
    .replace(/^hold\s*by\s*trial\s*[-–:]?\s*/i, "")
    .trim();
}

function isTrialReservationNotes(notes: unknown): boolean {
  const n = String(notes || "").toLowerCase();
  if (!n) return false;
  if (/booking_kind\s*=\s*trial/.test(n)) return true;
  if (/booking_scope\s*=\s*trial/.test(n)) return true;
  if (/\btrial_paid\b/.test(n)) return true;
  if (/\btrial_session\b/.test(n)) return true;
  return false;
}

function isAutumnTemplateDate(iso: string): boolean {
  if (!iso) return false;
  if (iso >= "2026-07-20" && iso <= "2026-07-31") return false;
  if (iso >= "2026-07-11" && iso <= "2026-07-17") return true;
  if (iso >= "2026-09-01") return true;
  return false;
}

function titleStaff(raw: string): string {
  const s = norm(raw);
  if (!s) return "—";
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

type SeatLine = {
  seat: number;
  of: number;
  instructor: string;
  client: string | null;
  kind: "booked" | "open" | "hold" | "trial";
  label: string;
  /** Dated trial only — standing Places seat stays open on other weeks. */
  trialDate?: string;
  trialClient?: string;
};

function trialDateFromHoldNotes(notes: unknown): string {
  const n = String(notes || "");
  const m =
    n.match(/\bdate_iso\s*=\s*(\d{4}-\d{2}-\d{2})\b/i) ||
    n.match(/\bsession_date\s*=\s*(\d{4}-\d{2}-\d{2})\b/i) ||
    n.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const d = m && m[1] ? m[1] : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

/** Trials are one-off — do not leave HOLD BY TRIAL as standing Places occupancy. */
function demoteTrialHoldsToDatedOpen(lines: SeatLine[]): SeatLine[] {
  return lines.map((line) => {
    if (line.kind !== "trial") return line;
    const name = stripTrialSuffix(String(line.client || ""));
    const trialDate = String(line.trialDate || "").slice(0, 10);
    return {
      ...line,
      kind: "open",
      client: null,
      label: `${line.instructor} (seat ${line.seat}/${line.of}) - NO PARTICIPANT (seat ${line.seat})`,
      trialDate: /^\d{4}-\d{2}-\d{2}$/.test(trialDate) ? trialDate : undefined,
      trialClient: name || undefined,
    };
  });
}

type LineAcc = {
  iso: string;
  lines: {
    instructor: string;
    client: string | null;
    kind: "booked" | "open" | "hold" | "trial";
  }[];
};

const { data, error } = await admin
  .from("portal_madre_document")
  .select("document,revision,updated_at,term_key")
  .eq("term_key", TERM_KEY)
  .maybeSingle();

if (error || !data?.document) {
  console.error("madre load failed", error);
  Deno.exit(1);
}

const madre = data.document as MadreDoc;
const weekly = buildWeeklyOfferFromMadre(madre);

const { data: holdRows, error: holdErr } = await admin
  .from("portal_booking_slot_reservations")
  .select("slot_id, participant_name, notes, hold_expires_at, status")
  .in("status", [...BOOKING_SLOT_HOLD_STATUSES]);
if (holdErr) {
  console.warn("holds load", holdErr.message);
}
const activeHolds = filterActiveBookingHolds(holdRows || []);
const holdApply = applyBookingSlotHoldsToOffer(weekly.slots, [], activeHolds);
console.log(
  "active holds",
  activeHolds.length,
  "applied",
  holdApply.applied,
  "skipped_roster",
  holdApply.skipped_roster,
);

const rows = madreToAdapterRows(madre);

/** key → best iso → ordered seat fragments (MADRE staff column order). */
const byKey = new Map<string, Map<string, LineAcc["lines"]>>();
const latestBySvd = new Map<string, string>();

for (const row of rows) {
  const serviceId = mapServiceId(row.service);
  if (!serviceId) continue;
  if (serviceId === "day_centre" || serviceId === "bespoke") continue;
  const kind = clientKind(String(row.client_name || ""));
  if (kind === "skip") continue;
  const venue = normalizeVenue(row.venue);
  const day = normalizeWeekday(row.day);
  if (!day) continue;
  if (serviceId === "multi" && day === "Wednesday") continue;
  const iso = norm(row.session_date).slice(0, 10);
  if (!iso || CRASH_SKIP.has(iso) || !isAutumnTemplateDate(iso)) continue;

  const svd = `${serviceId}|${venue}|${day}`;
  const prevMax = latestBySvd.get(svd);
  if (!prevMax || iso > prevMax) latestBySvd.set(svd, iso);

  const segments =
    serviceId === "aquatic"
      ? aquaticOfferTimeSegments(row.time_slot)
      : [parseTimeSlot(row.time_slot)];

  const instructor = titleStaff(String(row.instructors || ""));
  const client =
    kind === "open"
      ? null
      : kind === "hold"
      ? "HOLD WAITLIST"
      : kind === "trial"
      ? stripTrialSuffix(String(row.client_name || "")) || null
      : norm(row.client_name) || null;

  for (const seg of segments) {
    const key = `${serviceId}|${venue}|${day}|${seg.sortTime}|${seg.timeLabel}`;
    let dateMap = byKey.get(key);
    if (!dateMap) {
      dateMap = new Map();
      byKey.set(key, dateMap);
    }
    let lines = dateMap.get(iso);
    if (!lines) {
      lines = [];
      dateMap.set(iso, lines);
    }
    lines.push({
      instructor,
      client,
      kind,
    });
  }
}

function sundaySwimfarmAquaticPair(seat: number): string | null {
  if (seat === 1) return "Aurora/Luliya";
  if (seat === 2) return "Javier/Dan";
  if (seat === 3) return "Roberto/Youssef";
  return null;
}

/** Multi SwimFarm Sunday cap-6: two seats per cover pair (look only). */
function sundaySwimfarmMultiPair(seat: number): string {
  if (seat <= 2) return "Aurora/Luliya";
  if (seat <= 4) return "Javier/Dan";
  return "Roberto/Youssef";
}

/**
 * Standing Sunday Multi Hub books (LOCAL / canonical) — support worker half.
 * Berta Lead = Directors book; Godsway; Emmanuel (ex-Godsway summer book).
 * Labels match office look: Berta/Directors · Godsway · Emmanuel.
 */
const SUNDAY_MULTI_HUB_SUPPORT: Record<string, string> = {
  /* Berta Lead / Directors */
  "jack w": "Berta/Directors",
  "adam ab": "Berta/Directors",
  cyrus: "Berta/Directors",
  "arthur ma": "Berta/Directors",
  erik: "Berta/Directors",
  "aydaan ah": "Berta/Directors",
  /* Godsway */
  samer: "Godsway",
  "yusuf ah": "Godsway",
  "arthur mo": "Godsway",
  gabriel: "Godsway",
  "adaam ah": "Godsway",
  "amaar ah": "Godsway",
  /* Emmanuel Hub book (Sunday Multi). Bismark is Bespoke/Tinashe only — never Sundays. */
  zaid: "Emmanuel",
  "jack s": "Emmanuel",
  eiji: "Emmanuel",
  hazem: "Emmanuel",
  haneef: "Emmanuel",
  "rayyan f": "Emmanuel",
  rayyan: "Emmanuel",
};

/**
 * Pool half cover pair from LOCAL Sunday SwimFarm Multi (Aurora / Javier / Roberto books).
 * Luliya covers Aurora when Aurora is off — still Aurora/Luliya.
 */
const SUNDAY_MULTI_POOL_COVER: Record<string, string> = {
  "adam ab": "Aurora/Luliya",
  "jack w": "Aurora/Luliya",
  "arthur ma": "Aurora/Luliya",
  cyrus: "Aurora/Luliya",
  "aydaan ah": "Aurora/Luliya",
  erik: "Aurora/Luliya",
  "jack s": "Javier/Dan",
  zaid: "Javier/Dan",
  hazem: "Javier/Dan",
  eiji: "Javier/Dan",
  "rayyan f": "Javier/Dan",
  rayyan: "Javier/Dan",
  haneef: "Javier/Dan",
  "yusuf ah": "Roberto/Youssef",
  samer: "Roberto/Youssef",
  gabriel: "Roberto/Youssef",
  "arthur mo": "Roberto/Youssef",
  "amaar ah": "Roberto/Youssef",
  "adaam ah": "Roberto/Youssef",
};

function normClientKey(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Match bookedNames variants (e.g. Rayyan Fi → rayyan f / rayyan). */
function lookupByClient(
  map: Record<string, string>,
  client: string,
): string | null {
  const key = normClientKey(client);
  if (map[key]) return map[key]!;
  const first = key.split(" ")[0] || "";
  if (first && map[first]) return map[first]!;
  for (const k of Object.keys(map)) {
    if (key.startsWith(k + " ") || k.startsWith(key + " ")) return map[k]!;
  }
  return null;
}

function sundayMultiStaffLabel(client: string, seatFallback: number): string {
  const pool =
    lookupByClient(SUNDAY_MULTI_POOL_COVER, client) ||
    sundaySwimfarmMultiPair(seatFallback);
  const hub = lookupByClient(SUNDAY_MULTI_HUB_SUPPORT, client);
  if (hub) return `${pool}/${hub}`;
  return pool;
}

function seatLinesForMultiSundayBand(s: {
  bookedNames?: string[];
  capacity?: number;
  taken?: number;
  openSeats?: number;
}): SeatLine[] {
  const cap = Math.max(1, Number(s.capacity) || 6);
  const names = Array.isArray(s.bookedNames) ? s.bookedNames.slice() : [];
  const open = Math.max(0, Number(s.openSeats) || Math.max(0, cap - names.length));
  const lines: SeatLine[] = [];
  for (let i = 0; i < names.length && lines.length < cap; i++) {
    const seat = lines.length + 1;
    const client = names[i]!;
    const staff = sundayMultiStaffLabel(client, seat);
    lines.push({
      seat,
      of: cap,
      instructor: staff,
      client,
      kind: "booked",
      label: `${staff} (seat ${seat}/${cap}) - ${client} (seat ${seat})`,
    });
  }
  while (lines.length < cap && lines.length < names.length + open) {
    const seat = lines.length + 1;
    const pair = sundaySwimfarmMultiPair(seat);
    lines.push({
      seat,
      of: cap,
      instructor: pair,
      client: null,
      kind: "open",
      label: `${pair} (seat ${seat}/${cap}) - NO PARTICIPANT (seat ${seat})`,
    });
  }
  while (lines.length < cap && lines.length < Math.max(names.length, Number(s.taken) || 0)) {
    const seat = lines.length + 1;
    const pair = sundaySwimfarmMultiPair(seat);
    lines.push({
      seat,
      of: cap,
      instructor: pair,
      client: "Taken",
      kind: "booked",
      label: `${pair} (seat ${seat}/${cap}) - Taken (seat ${seat})`,
    });
  }
  return lines;
}

function seatLinesForKey(key: string): SeatLine[] {
  const dateMap = byKey.get(key);
  if (!dateMap) return [];
  const [serviceId, venue, day] = key.split("|");
  const svdLatest = latestBySvd.get(`${serviceId}|${venue}|${day}`);
  const dates = [...dateMap.keys()].sort();
  const ref = dates[dates.length - 1]!;
  if (svdLatest && ref < svdLatest) return [];
  const raw = dateMap.get(ref) || [];
  const of = raw.length;
  const sundayPairs =
    serviceId === "aquatic" && venue === "SwimFarm" && day === "Sunday";
  return raw.map((line, idx) => {
    const seat = idx + 1;
    const clientLabel =
      line.kind === "open" || !line.client
        ? "NO PARTICIPANT"
        : line.kind === "hold"
        ? "HOLD WAITLIST"
        : line.kind === "trial"
        ? `HOLD BY TRIAL - ${line.client}`
        : line.client;
    const pair = sundayPairs ? sundaySwimfarmAquaticPair(seat) : null;
    const instructorLabel = pair || line.instructor;
    const label =
      `${instructorLabel} (seat ${seat}/${of}) - ${clientLabel} (seat ${seat})`;
    return {
      seat,
      of,
      instructor: instructorLabel,
      client: line.kind === "open" ? null : clientLabel,
      kind:
        line.kind === "hold"
          ? "hold"
          : line.kind === "trial"
          ? "trial"
          : line.kind,
      label,
    };
  });
}

function paintTrialHoldsOntoSeatLines(
  slotId: string,
  seatLines: SeatLine[],
  holds: Array<{
    slot_id?: unknown;
    participant_name?: unknown;
    notes?: unknown;
  }>,
  bookedKeys: string[],
): SeatLine[] {
  const lines = seatLines.map((l) => ({ ...l }));
  if (!lines.length) return lines;
  const of = lines[0]!.of || lines.length;
  const trialHolds = holds.filter((h) => {
    if (String(h.slot_id || "").trim() !== slotId) return false;
    return isTrialReservationNotes(h.notes);
  });
  for (const hold of trialHolds) {
    const name = stripTrialSuffix(String(hold.participant_name || ""));
    if (!name) continue;
    const trialDate = trialDateFromHoldNotes(hold.notes);
    if (holdParticipantAlreadyOnOfferSlot(name, bookedKeys)) {
      /* Already a standing line — relabel as trial if it was a plain booked name. */
      for (const line of lines) {
        const c = stripTrialSuffix(String(line.client || ""));
        if (
          line.kind === "booked" &&
          c &&
          holdParticipantAlreadyOnOfferSlot(name, [c])
        ) {
          line.kind = "trial";
          line.client = `HOLD BY TRIAL - ${c}`;
          line.label = `${line.instructor} (seat ${line.seat}/${of}) - ${line.client} (seat ${line.seat})`;
          if (trialDate) line.trialDate = trialDate;
          line.trialClient = c;
        }
      }
      continue;
    }
    const seats = seatsNeededFromHoldNotes(hold.notes);
    let left = seats;
    for (const line of lines) {
      if (left <= 0) break;
      if (line.kind !== "open") continue;
      line.kind = "trial";
      line.client = `HOLD BY TRIAL - ${name}`;
      line.label =
        `${line.instructor} (seat ${line.seat}/${of}) - ${line.client} (seat ${line.seat})`;
      if (trialDate) line.trialDate = trialDate;
      line.trialClient = name;
      left -= 1;
    }
  }
  return lines;
}

const bySlotId: Record<
  string,
  {
    bookedNames: string[];
    instructors: string[];
    openInstructors: string[];
    seatLines: SeatLine[];
    capacity: number;
    taken: number;
    openSeats: number;
    day: string;
    venue: string;
    timeLabel: string;
    serviceId: string;
    sortTime?: string;
  }
> = {};

for (const s of weekly.slots) {
  const key =
    `${s.serviceId}|${s.venue}|${s.day}|${s.sortTime}|${s.timeLabel}`;
  let seatLines = seatLinesForKey(key);
  if (
    !seatLines.length &&
    s.serviceId === "multi" &&
    s.venue === "SwimFarm" &&
    s.day === "Sunday"
  ) {
    seatLines = seatLinesForMultiSundayBand(s);
  }
  /* Ensure open lines exist when capacity > painted lines so trial holds can land. */
  const cap = Math.max(0, Number(s.capacity) || 0);
  while (seatLines.length < cap) {
    const seat = seatLines.length + 1;
    const instructor =
      s.openInstructors?.[seatLines.length] ||
      s.instructors?.[0] ||
      "—";
    seatLines.push({
      seat,
      of: cap,
      instructor: titleStaff(instructor),
      client: null,
      kind: "open",
      label: `${titleStaff(instructor)} (seat ${seat}/${cap}) - NO PARTICIPANT (seat ${seat})`,
    });
  }
  seatLines = paintTrialHoldsOntoSeatLines(
    s.id,
    seatLines,
    activeHolds,
    Array.isArray(s.bookedKeys) ? s.bookedKeys : [],
  );
  seatLines = demoteTrialHoldsToDatedOpen(seatLines);
  for (const line of seatLines) {
    line.of = cap || seatLines.length;
  }
  const standingBooked = seatLines
    .filter((l) => l.kind === "booked" && l.client)
    .map((l) => String(l.client));
  const standingHolds = seatLines.filter((l) => l.kind === "hold").length;
  bySlotId[s.id] = {
    bookedNames: standingBooked,
    instructors: Array.isArray(s.instructors) ? s.instructors.slice() : [],
    openInstructors: seatLines
      .filter((l) => l.kind === "open")
      .map((l) => String(l.instructor || "").toUpperCase()),
    seatLines,
    capacity: cap,
    taken: standingBooked.length + standingHolds,
    openSeats: Math.max(0, cap - standingBooked.length - standingHolds),
    day: String(s.day || ""),
    venue: String(s.venue || ""),
    timeLabel: String(s.timeLabel || ""),
    serviceId: String(s.serviceId || ""),
  };
}

/**
 * Services-only standing (not public Places): Day Centre + Bespoke clients.
 * Office list from Victor — clients only; staff lives on Timetable.
 */
function pushOfficeProgrammeSlot(opts: {
  serviceId: "day_centre" | "bespoke";
  day: string;
  sortTime: string;
  timeLabel: string;
  venue: string;
  clients: { name: string; window: string; staff?: string }[];
}) {
  const slug = opts.day.toLowerCase();
  const id =
    `live-${opts.serviceId}-${opts.venue.toLowerCase()}-${slug}-` +
    opts.sortTime.replace(":", "-") +
    "-" +
    opts.timeLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const of = opts.clients.length;
  const seatLines: SeatLine[] = opts.clients.map((c, idx) => {
    const seat = idx + 1;
    const staff = titleStaff(c.staff || "—");
    const client = `${c.name} · ${c.window}`;
    return {
      seat,
      of,
      instructor: staff,
      client,
      kind: "booked" as const,
      label: `${staff} (seat ${seat}/${of}) - ${client} (seat ${seat})`,
    };
  });
  bySlotId[id] = {
    bookedNames: opts.clients.map((c) => c.name),
    instructors: opts.clients.map((c) => titleStaff(c.staff || "")).filter(Boolean),
    openInstructors: [],
    seatLines,
    capacity: of,
    taken: of,
    openSeats: 0,
    day: opts.day,
    venue: opts.venue,
    timeLabel: opts.timeLabel,
    sortTime: opts.sortTime,
    serviceId: opts.serviceId,
  };
}

/* Bespoke Programme — SwimFarm Hub (3 staff seats Mon/Wed/Fri; Cyrus Tue = Victor) */
pushOfficeProgrammeSlot({
  serviceId: "bespoke",
  day: "Monday",
  sortTime: "16:30",
  timeLabel: "4.30 – 6.00",
  venue: "SwimFarm",
  clients: [
    { name: "Tinashe", window: "4.30 – 6", staff: "Godsway" },
    { name: "Tinashe", window: "4.30 – 6", staff: "John" },
    { name: "Tinashe", window: "4.30 – 6", staff: "Raul" },
  ],
});
pushOfficeProgrammeSlot({
  serviceId: "bespoke",
  day: "Tuesday",
  sortTime: "15:30",
  timeLabel: "3.30 – 5.00",
  venue: "SwimFarm",
  clients: [{ name: "Cyrus", window: "3.30 – 5", staff: "Victor" }],
});
pushOfficeProgrammeSlot({
  serviceId: "bespoke",
  day: "Wednesday",
  sortTime: "16:30",
  timeLabel: "4.30 – 6.00",
  venue: "SwimFarm",
  clients: [
    { name: "Tinashe", window: "4.30 – 6", staff: "Godsway" },
    { name: "Tinashe", window: "4.30 – 6", staff: "Bismark" },
    { name: "Tinashe", window: "4.30 – 6", staff: "Emmanuel" },
  ],
});
pushOfficeProgrammeSlot({
  serviceId: "bespoke",
  day: "Friday",
  sortTime: "16:30",
  timeLabel: "4.30 – 6.00",
  venue: "SwimFarm",
  clients: [
    { name: "Tinashe", window: "4.30 – 6", staff: "Bismark" },
    { name: "Tinashe", window: "4.30 – 6", staff: "Roberto" },
    { name: "Tinashe", window: "4.30 – 6", staff: "Emmanuel" },
  ],
});

/**
 * Day Centre Timetable standing (staff → client) from Autumn board.
 * Services preview still lists unique clients; Timetable shows who works whom.
 */
function pushDayCentreTimetableDay(
  day: string,
  sortTime: string,
  timeLabel: string,
  rows: { staff: string; name: string; window: string }[],
) {
  pushOfficeProgrammeSlot({
    serviceId: "day_centre",
    day,
    sortTime,
    timeLabel,
    venue: "SwimFarm",
    clients: rows.map((r) => ({
      name: r.name,
      window: r.window,
      staff: r.staff,
    })),
  });
}

pushDayCentreTimetableDay("Monday", "11:00", "11.00 – 4.00", [
  { staff: "Roberto", name: "Emanuel", window: "11 – 1" },
  { staff: "Roberto", name: "Fadi", window: "1 – 3" },
  { staff: "Michelle", name: "Ikram", window: "11 – 4" },
  { staff: "Luliya", name: "Ikram", window: "11 – 3" },
  { staff: "Raul", name: "Timi", window: "11 – 1" },
  { staff: "Raul", name: "Emanuel", window: "1 – 4" },
  { staff: "Youssef", name: "Fadi", window: "12.30 – 3" },
]);
pushDayCentreTimetableDay("Tuesday", "11:00", "11.00 – 4.00", [
  { staff: "Roberto", name: "ACAT", window: "11 – 12" },
  { staff: "Roberto", name: "Ikram", window: "12 – 3" },
  { staff: "Michelle", name: "Ikram", window: "11 – 12" },
  { staff: "Michelle", name: "Ikram", window: "3 – 4" },
  { staff: "Luliya", name: "Ikram", window: "11 – 3" },
]);
pushDayCentreTimetableDay("Wednesday", "11:00", "11.00 – 4.00", [
  { staff: "Roberto", name: "Emanuel", window: "11 – 12.30" },
  { staff: "Roberto", name: "Fadi", window: "12.30 – 3" },
  { staff: "Michelle", name: "Ikram", window: "11 – 4" },
  { staff: "Luliya", name: "Ikram", window: "11 – 3" },
  { staff: "Victor", name: "Emanuel", window: "12.30 – 3" },
  { staff: "Victor", name: "Ikram", window: "3 – 4" },
  { staff: "Raul", name: "Fadi", window: "12.30 – 3" },
  { staff: "Raul", name: "Emanuel", window: "3 – 4" },
]);
pushDayCentreTimetableDay("Thursday", "12:30", "12.30 – 3.00", [
  { staff: "Roberto", name: "Fadi", window: "12.30 – 3" },
  { staff: "Youssef", name: "Fadi", window: "12.30 – 3" },
]);
pushDayCentreTimetableDay("Friday", "11:00", "11.00 – 4.00", [
  { staff: "Roberto", name: "Emanuel", window: "11 – 1" },
  { staff: "Roberto", name: "Fadi", window: "1 – 3" },
  { staff: "Michelle", name: "Ikram", window: "11 – 4" },
  { staff: "Luliya", name: "Ikram", window: "11 – 4" },
  { staff: "Victor", name: "Timi", window: "11 – 1" },
  { staff: "Victor", name: "Emanuel", window: "1 – 4" },
  { staff: "Raul", name: "Timi", window: "11 – 1" },
  { staff: "Raul", name: "Emanuel", window: "1 – 4" },
  { staff: "Youssef", name: "Fadi", window: "12.30 – 3" },
]);

const outDir = join(root, "working_ui/portal");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "_local_booking_occupants.json");
writeFileSync(
  outPath,
  JSON.stringify(
    {
      localOnly: true,
      note: "LOCAL preview. AS/weekend from MADRE + trial holds. Day Centre + Bespoke = Timetable staff→client (Services dedupes DC clients). Not public Places.",
      term_key: TERM_KEY,
      madre_revision: data.revision ?? null,
      madre_updated_at: data.updated_at ?? null,
      generated_at: new Date().toISOString(),
      bySlotId,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

const sample =
  bySlotId["live-aquatic-acton-monday-16-30-4-30-5-00"] ||
  Object.values(bySlotId).find((x) => x.seatLines.length >= 2);
console.log(
  "wrote",
  outPath,
  "slots",
  Object.keys(bySlotId).length,
  "rev",
  data.revision,
);
console.log("sample", sample?.seatLines?.map((l) => l.label));
