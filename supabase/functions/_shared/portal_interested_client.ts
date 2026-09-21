/**
 * Registration completers are kept as "Interested in our services"
 * (client_status = registered): portal participant + parent contact rows,
 * not yet in_class. Slot booking / waitlist join are separate overlays.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normalizeParticipantLookupName } from "./participant_avatar.ts";

export type InterestedClientInput = {
  participantName: string;
  participantDob?: string | null;
  parentName?: string | null;
  parentEmail?: string | null;
  parentPhone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  postcode?: string | null;
  registrationDate?: string | null; // YYYY-MM-DD
  generalInfoLines?: string[];
  /** Signed-in Family Portal hub — new sibling (twins/triplets) stays on this PIN. */
  attachParentPersonId?: string | null;
};

function clean(v: unknown, max = 200): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function splitName(full: string): { first: string; last: string } {
  const parts = clean(full, 200).split(" ").filter(Boolean);
  if (!parts.length) return { first: "Unknown", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function emailNorm(v: unknown): string {
  return clean(v, 200).toLowerCase();
}

function phoneLast10(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").slice(-10);
}

/**
 * Same child only when the full display name matches.
 * Date of birth is a tie-break, never an identity on its own (twins share a DOB).
 */
function isSameChild(
  row: { display_name?: unknown; dob_iso?: unknown },
  participantNorm: string,
  dob: string | null,
): boolean {
  if (normalizeParticipantLookupName(String(row.display_name || "")) !== participantNorm) {
    return false;
  }
  if (dob && row.dob_iso) {
    return String(row.dob_iso).slice(0, 10) === dob;
  }
  return true;
}

async function findExistingFamilyParentPersonId(
  admin: SupabaseClient,
  input: InterestedClientInput,
): Promise<string> {
  const forced = clean(input.attachParentPersonId, 80);
  if (forced) {
    const { data } = await admin
      .from("portal_parent_contacts")
      .select("parent_person_id")
      .eq("parent_person_id", forced)
      .limit(1)
      .maybeSingle();
    if (data?.parent_person_id) return String(data.parent_person_id);
  }

  const email = emailNorm(input.parentEmail);
  if (email) {
    const { data } = await admin
      .from("portal_parent_contacts")
      .select("parent_person_id")
      .eq("email_norm", email)
      .limit(1)
      .maybeSingle();
    if (data?.parent_person_id) return String(data.parent_person_id);
  }

  const phone = phoneLast10(input.parentPhone);
  if (phone.length >= 10) {
    const { data } = await admin
      .from("portal_parent_contacts")
      .select("parent_person_id")
      .eq("phone_lookup", phone)
      .limit(1)
      .maybeSingle();
    if (data?.parent_person_id) return String(data.parent_person_id);
  }

  return "";
}

async function nextNumericContactId(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.from("portal_participants").select("contact_id").limit(5000);
  let max = 400;
  for (const row of data || []) {
    const id = String(row.contact_id || "");
    if (!/^\d+$/.test(id)) continue;
    const n = Number(id);
    if (n > 0 && n < 100000 && n > max) max = n;
  }
  return String(max + 1);
}

/**
 * Ensure a portal participant + primary parent contact exist for a completed
 * Client Registration. Does not place them in class or office waitlist.
 */
export async function ensureInterestedClientFromRegistration(
  admin: SupabaseClient,
  input: InterestedClientInput,
): Promise<{ contactId: string; created: boolean }> {
  const participantName = clean(input.participantName, 200);
  if (!participantName) throw new Error("missing_participant_name");

  const norm = normalizeParticipantLookupName(participantName);
  const dob = input.participantDob ? String(input.participantDob).slice(0, 10) : null;
  const now = new Date().toISOString();
  const regDate = input.registrationDate || now.slice(0, 10);

  const { data: parts } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, dob_iso, parent_person_id, in_class, on_waiting_list");

  const familyParentId = await findExistingFamilyParentPersonId(admin, input);

  const matches = (parts || []).filter((p) => isSameChild(p, norm, dob));
  const familyMatches = familyParentId
    ? matches.filter((p) => String(p.parent_person_id || "") === familyParentId)
    : [];
  const chosen = familyMatches[0] || matches[0];

  let contactId = chosen?.contact_id ? String(chosen.contact_id) : "";
  let created = false;

  if (!contactId) {
    contactId = await nextNumericContactId(admin);
    created = true;
    const child = splitName(participantName);
    let parentPersonId = familyParentId || `portal-${contactId}-parent`;
    let parentName = clean(input.parentName, 200) || "Parent / carer";
    let parent = splitName(parentName);

    if (familyParentId) {
      const { data: hub } = await admin
        .from("portal_parent_contacts")
        .select("parent_display, parent_first_name, parent_last_name, address_line1, city, postcode")
        .eq("parent_person_id", familyParentId)
        .limit(1)
        .maybeSingle();
      if (hub?.parent_display) {
        parentName = clean(hub.parent_display, 200) || parentName;
        parent = {
          first: clean(hub.parent_first_name, 80) || parent.first,
          last: clean(hub.parent_last_name, 80) || parent.last,
        };
      }
    }

    const { error: pErr } = await admin.from("portal_participants").insert({
      contact_id: contactId,
      display_name: participantName,
      first_name: child.first,
      last_name: child.last || child.first,
      parent_person_id: parentPersonId,
      dob_iso: dob,
      in_class: false,
      on_waiting_list: false,
      created_at: now,
      updated_at: now,
    });
    if (pErr) throw pErr;

    const { error: cErr } = await admin.from("portal_parent_contacts").insert({
      contact_id: contactId,
      parent_person_id: parentPersonId,
      child_display: participantName,
      child_first_name: child.first,
      child_last_name: child.last || child.first,
      parent_display: parentName,
      parent_first_name: parent.first,
      parent_last_name: parent.last || parent.first,
      email: clean(input.parentEmail, 200) || null,
      mobile: clean(input.parentPhone, 80) || null,
      address_line1: clean(input.addressLine1, 200) || null,
      city: clean(input.city, 80) || null,
      postcode: clean(input.postcode, 20) || null,
      dob_iso: dob,
      in_class: false,
      on_waiting_list: false,
      registration_date: regDate,
      updated_at: now,
      created_at: now,
    });
    if (cErr) throw cErr;
  } else {
    // Existing client: refresh contact details only. Never clear waitlist /
    // in_class — booking or waitlist join are separate overlays.
    const partPatch: Record<string, unknown> = { updated_at: now };
    if (dob) partPatch.dob_iso = dob;
    await admin.from("portal_participants").update(partPatch).eq("contact_id", contactId);

    const contactPatch: Record<string, unknown> = {
      registration_date: regDate,
      updated_at: now,
    };
    const email = clean(input.parentEmail, 200);
    const mobile = clean(input.parentPhone, 80);
    if (email) contactPatch.email = email;
    if (mobile) contactPatch.mobile = mobile;
    await admin.from("portal_parent_contacts").update(contactPatch).eq("contact_id", contactId);
  }

  if (input.generalInfoLines && input.generalInfoLines.length) {
    const fresh = input.generalInfoLines.map((l) => clean(l, 500)).filter(Boolean).join("\n");
    if (fresh) {
      const { data: existing } = await admin
        .from("portal_participant_general_info")
        .select("general_info_sheet")
        .eq("contact_id", contactId)
        .maybeSingle();
      const prev = String(existing?.general_info_sheet || "").trim();
      // Do not wipe office-curated sheets on re-submit; only seed when empty.
      if (!prev) {
        await admin.from("portal_participant_general_info").upsert(
          {
            contact_id: contactId,
            general_info_sheet: fresh.slice(0, 12000),
            updated_at: now,
          },
          { onConflict: "contact_id" },
        );
      }
    }
  }

  return { contactId, created };
}
