// Verify parent/carer may edit a participant (re-enrolment link or family portal session).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  ageMatchesInput,
  namesMatch,
  normalizePersonName,
  parentNamesMatch,
} from "./reenrolment_catalog.ts";
import { participantIdentityMatches } from "./participant_identity.ts";
import { resolveParentPortalSession } from "./parent_portal_session.ts";

export type ParticipantAccessInput = {
  contact_id: string;
  parent_first_name?: string;
  parent_last_name?: string;
  participant_name?: string;
  participant_age?: number | null;
  participant_dob?: string | null;
  parent_portal_session?: string;
};

function participantRecordMatches(
  participantName: string,
  p: { display_name?: string; first_name?: string; last_name?: string; contact_id?: string },
): boolean {
  const display = String(p.display_name || "");
  const first = String(p.first_name || "");
  const last = String(p.last_name || "");
  if (participantIdentityMatches(
    { displayName: participantName, firstName: participantName.split(/\s+/)[0] },
    display,
    String(p.contact_id || ""),
  )) {
    return true;
  }
  if (namesMatch(participantName, display)) return true;
  if (namesMatch(participantName, `${first} ${last}`.trim())) return true;
  const want = normalizePersonName(participantName);
  const gotFirst = normalizePersonName(first);
  if (want && gotFirst && (want === gotFirst || gotFirst.startsWith(want) || want.startsWith(gotFirst))) {
    return true;
  }
  return false;
}

function parseAge(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 120 ? Math.round(n) : null;
}

function parseDobInput(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
  }
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export async function verifyParticipantParentAccess(
  admin: SupabaseClient,
  req: Request,
  input: ParticipantAccessInput,
): Promise<{ contact_id: string; display_name: string } | null> {
  const contactId = String(input.contact_id || "").trim();
  if (!contactId) return null;

  const sessionToken = String(input.parent_portal_session || req.headers.get("x-parent-portal-session") || "").trim();
  if (sessionToken) {
    const session = await resolveParentPortalSession(req, admin);
    if (!session) return null;
    const { data: row } = await admin
      .from("portal_participants")
      .select("contact_id, display_name")
      .eq("contact_id", contactId)
      .eq("parent_person_id", session.parent_person_id)
      .maybeSingle();
    if (!row) return null;
    return { contact_id: String(row.contact_id), display_name: String(row.display_name || "") };
  }

  const parentFirst = String(input.parent_first_name || "").trim();
  const parentLast = String(input.parent_last_name || "").trim();
  const participantName = String(input.participant_name || "").trim();
  const inputAge = input.participant_age != null ? input.participant_age : parseAge(input.participant_age);
  const dobIso = parseDobInput(String(input.participant_dob || ""));

  if (!parentFirst || !parentLast || !participantName) return null;
  if (inputAge == null && !dobIso) return null;

  const { data: parents } = await admin
    .from("portal_parent_contacts")
    .select("parent_person_id, parent_first_name, parent_last_name, parent_display")
    .limit(500);

  const matchedParents = (parents || []).filter((p) => {
    const pf = String(p.parent_first_name || "").trim();
    const pl = String(p.parent_last_name || "").trim();
    if (pf && pl && namesMatch(parentFirst, pf) && namesMatch(parentLast, pl)) return true;
    return parentNamesMatch(parentFirst, parentLast, String(p.parent_display || ""));
  });

  if (!matchedParents.length) return null;
  const parentIds = matchedParents.map((p) => String(p.parent_person_id));

  const { data: participants } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name, dob_iso, parent_person_id")
    .in("parent_person_id", parentIds)
    .eq("contact_id", contactId);

  const row = (participants || []).find((p) => {
    if (!participantRecordMatches(participantName, p)) return false;
    if (dobIso && String(p.dob_iso || "") !== dobIso) return false;
    if (inputAge != null && !ageMatchesInput(String(p.dob_iso || ""), inputAge)) return false;
    return true;
  });

  if (!row) return null;
  return { contact_id: String(row.contact_id), display_name: String(row.display_name || "") };
}
