import { feedbackAttendanceIsAbsent } from "./portal_feedback_digest_match.ts";
import { rosterParticipantSlugAlias, slugifyParticipantKey } from "./participant_identity.ts";

export const PARENT_SESSION_TERM_START_ISO = "2026-04-13";

export type ParentAttendanceSummary = {
  attended: number;
  absent: number;
  total: number;
  makeup_absent: number;
};

export type ParentAttendanceFeedbackRow = {
  session_date?: unknown;
  session_time?: unknown;
  client_id?: unknown;
  attendance?: unknown;
  engagement_rating?: unknown;
  client_emotions?: unknown;
  engagement_patterns?: unknown;
};

export type ParentScheduleOverrideRow = {
  session_date?: unknown;
  anchor_start?: unknown;
  anchor_client_id?: unknown;
  override_type?: unknown;
  status?: unknown;
  payload?: unknown;
};

function cleanStr(v: unknown, max = 200): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

export function isoFromSessionDate(raw: unknown): string {
  const s = cleanStr(raw, 40);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

export function normSessionHm(raw: unknown): string {
  const t = cleanStr(raw, 40).replace(/\./g, ":");
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function sessionSlotKey(iso: string, clientSlug: string, hm: string): string {
  const slug = rosterParticipantSlugAlias(slugifyParticipantKey(clientSlug));
  return `${iso}|${slug}|${hm || "~"}`;
}

function payloadObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (_) {
      /* ignore */
    }
  }
  return {};
}

export function overrideReplacementClientId(payload: unknown): string {
  const p = payloadObject(payload);
  const toId = cleanStr(p.to_client_id, 80).toLowerCase();
  if (toId) return toId;
  return cleanStr(p.replacement_client_id, 80).toLowerCase();
}

export function overrideIsTrial(payload: unknown): boolean {
  const p = payloadObject(payload);
  if (p.is_trial === true) return true;
  if (cleanStr(p.booking_kind, 40).toLowerCase() === "trial") return true;
  return cleanStr(p.session_kind, 40).toLowerCase() === "trial";
}

export function isOpenSlotAnchor(raw: unknown): boolean {
  const a = cleanStr(raw, 80).toLowerCase();
  if (!a) return true;
  return /no_participant|open_slot|slot_open|hub_open|available_slot/.test(a);
}

/** Session feedback row counts as attended (parity with admin portal workbook). */
export function feedbackRowIsAttended(row: ParentAttendanceFeedbackRow): boolean {
  const a = cleanStr(row.attendance, 80).toLowerCase();
  if (a) {
    if (/^(no|n|false|0)$/.test(a)) return false;
    if (/\b(no[\s-]?show|noshow|did not attend|absent|absence|cancel(?:led|ed)?)\b/.test(a)) {
      return false;
    }
    if (/\b(make[\s-]?up|makeup|replaced|slot.?given)\b/.test(a)) return false;
    return true;
  }
  const eg = row.engagement_rating;
  if (eg != null && String(eg).trim() !== "" && !Number.isNaN(Number(eg))) {
    const n = Number(eg);
    if (n >= 1 && n <= 5) return true;
  }
  if (cleanStr(row.client_emotions, 200) || cleanStr(row.engagement_patterns, 200)) return true;
  return false;
}

export function feedbackRowIsAbsent(row: ParentAttendanceFeedbackRow): boolean {
  if (feedbackAttendanceIsAbsent(row.attendance)) return true;
  const a = cleanStr(row.attendance, 80).toLowerCase();
  if (/\b(make[\s-]?up|makeup|replaced|slot.?given)\b/.test(a)) return true;
  return false;
}

export function scheduleOverrideCountsAsMissedForClient(
  ov: ParentScheduleOverrideRow,
  clientSlugs: Set<string>,
  termStartIso = PARENT_SESSION_TERM_START_ISO,
): boolean {
  const status = cleanStr(ov.status, 20).toLowerCase();
  if (status && status !== "active") return false;
  const iso = isoFromSessionDate(ov.session_date);
  if (!iso || iso < termStartIso) return false;
  if (overrideIsTrial(ov.payload)) return false;

  const anchor = rosterParticipantSlugAlias(slugifyParticipantKey(cleanStr(ov.anchor_client_id, 80)));
  if (!anchor || !clientSlugs.has(anchor) || isOpenSlotAnchor(anchor)) return false;

  const type = cleanStr(ov.override_type, 80);
  if (type === "client_absence_announced") return true;

  if (type === "client_replace_in_slot") {
    const rep = rosterParticipantSlugAlias(slugifyParticipantKey(overrideReplacementClientId(ov.payload)));
    return !!(rep && rep !== anchor);
  }

  return false;
}

export function buildParentAttendanceSummary(
  feedbackRows: ParentAttendanceFeedbackRow[],
  overrideRows: ParentScheduleOverrideRow[],
  clientSlugs: string[],
  termStartIso = PARENT_SESSION_TERM_START_ISO,
): ParentAttendanceSummary {
  const slugSet = new Set(
    clientSlugs.map((s) => rosterParticipantSlugAlias(slugifyParticipantKey(s))).filter(Boolean),
  );
  const attendedSlots = new Set<string>();
  const absentSlots = new Set<string>();

  for (const row of feedbackRows || []) {
    const iso = isoFromSessionDate(row.session_date);
    if (!iso || iso < termStartIso) continue;
    const client = rosterParticipantSlugAlias(slugifyParticipantKey(cleanStr(row.client_id, 80)));
    if (!client || !slugSet.has(client)) continue;
    const key = sessionSlotKey(iso, client, normSessionHm(row.session_time));

    if (feedbackRowIsAbsent(row)) {
      absentSlots.add(key);
      attendedSlots.delete(key);
      continue;
    }
    if (feedbackRowIsAttended(row)) {
      if (!absentSlots.has(key)) attendedSlots.add(key);
    }
  }

  let makeupAbsent = 0;
  for (const ov of overrideRows || []) {
    if (!scheduleOverrideCountsAsMissedForClient(ov, slugSet, termStartIso)) continue;
    const iso = isoFromSessionDate(ov.session_date);
    const anchor = rosterParticipantSlugAlias(slugifyParticipantKey(cleanStr(ov.anchor_client_id, 80)));
    const key = sessionSlotKey(iso, anchor, normSessionHm(ov.anchor_start));
    if (attendedSlots.has(key) || absentSlots.has(key)) continue;
    absentSlots.add(key);
    makeupAbsent++;
  }

  const attended = attendedSlots.size;
  const absent = absentSlots.size;
  return {
    attended,
    absent,
    total: attended + absent,
    makeup_absent: makeupAbsent,
  };
}
