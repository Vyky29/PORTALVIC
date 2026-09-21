/**
 * B3: parent hub standing sessions from capacity-chain occupants (same board as
 * Overview / Booking Places), not portal_participant_service_lines invent.
 */
import { participantIdentityMatches } from "./participant_identity.ts";

export type ParentStandingIdentity = {
  contactId?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
};

export type CapacityChainStandingSeatLine = {
  kind?: string | null;
  client?: string | null;
  instructor?: string | null;
  bookedFrom?: string | null;
  trialDate?: string | null;
  trialClient?: string | null;
};

export type CapacityChainStandingSlot = {
  serviceId?: string | null;
  day?: string | null;
  venue?: string | null;
  timeLabel?: string | null;
  seatLines?: CapacityChainStandingSeatLine[] | null;
};

export type ParentStandingSession = {
  day: string;
  service: string;
  timeSlot: string;
  venue: string;
  area: string;
  instructor: string;
};

function clean(v: unknown, max = 120): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function serviceIdToProgramme(raw: unknown): string {
  const id = clean(raw, 40).toLowerCase().replace(/[\s-]+/g, "_");
  if (id === "aquatic") return "Aquatic Activity";
  if (id === "climbing") return "Climbing Activity";
  if (id === "physical") return "Physical Activity";
  if (id === "multi") return "Multi-Activity";
  if (id === "day_centre" || id === "daycentre") return "Day Centre";
  if (id === "bespoke") return "Bespoke";
  return clean(raw, 80) || "Service";
}

function normalizeTimeSlot(raw: unknown): string {
  return clean(raw, 40)
    .replace(/\s*[–—−]\s*/g, " to ")
    .replace(/\s*-\s*/g, " to ");
}

function areaForVenue(venue: string): string {
  const v = venue.toLowerCase();
  if (/acton|northolt|westway|swimfarm|hub/.test(v)) return "West London";
  return "";
}

function clientNameForLine(line: CapacityChainStandingSeatLine): string {
  const kind = clean(line.kind, 20).toLowerCase();
  if (kind === "trial") {
    return clean(line.trialClient || line.client, 80);
  }
  if (kind === "booked" || kind === "hold") {
    return clean(line.client, 80);
  }
  return "";
}

/**
 * Sessions for one child from the capacity-chain standing board.
 * Skips open/closed; trials still listed (buildServicesDetail filters term chips).
 */
export function standingSessionsForParticipantFromOccupants(
  bySlotId: Record<string, CapacityChainStandingSlot> | null | undefined,
  identity: ParentStandingIdentity,
): ParentStandingSession[] {
  const root = bySlotId || {};
  const out: ParentStandingSession[] = [];
  const seen = new Set<string>();

  for (const slot of Object.values(root)) {
    if (!slot) continue;
    const day = clean(slot.day, 20);
    const venue = clean(slot.venue, 80);
    const timeSlot = normalizeTimeSlot(slot.timeLabel);
    const service = serviceIdToProgramme(slot.serviceId);
    if (!day || !timeSlot) continue;
    if (/crash|intensiv/i.test(service)) continue;

    for (const line of slot.seatLines || []) {
      if (!line) continue;
      const kind = clean(line.kind, 20).toLowerCase();
      if (kind === "open" || kind === "closed" || !kind) continue;
      const clientName = clientNameForLine(line);
      if (!clientName || /no\s*participant|^closed$|^open$/i.test(clientName)) continue;
      if (!participantIdentityMatches(identity, clientName, clientName)) continue;

      const instructor = clean(line.instructor, 80);
      const key = [day, service, timeSlot, venue, instructor, clientName].join("|").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        day,
        service,
        timeSlot,
        venue,
        area: areaForVenue(venue),
        instructor,
      });
    }
  }

  return out;
}

/** Unique standing instructor names for Team (capacity-chain first). */
export function standingInstructorNamesFromOccupants(
  bySlotId: Record<string, CapacityChainStandingSlot> | null | undefined,
  identity: ParentStandingIdentity,
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const session of standingSessionsForParticipantFromOccupants(bySlotId, identity)) {
    const raw = clean(session.instructor, 120);
    if (!raw) continue;
    for (const tok of raw.split(/\s*[,/&+]+\s*|\s+\band\b\s+/i)) {
      const n = clean(tok, 40);
      const k = n.toLowerCase();
      if (!n || seen.has(k)) continue;
      seen.add(k);
      names.push(n);
    }
  }
  return names;
}
