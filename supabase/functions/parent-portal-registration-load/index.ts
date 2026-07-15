// parent-portal-registration-load — prefill client registration form for a linked child.
// Prefers: prior registration document → Clients Info / general sheet → portal_parent_contacts.
// Empty strings never wipe a filled value.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
  answersFromClientsInfoBlob,
  ageLabelFromDobIso,
} from "../_shared/parent_registration_answers.ts";
import {
  lookupClientsInfoSheetForParticipant,
  parseGeneralInfoSheet,
} from "../_shared/participant_general_info.ts";

function clean(v: unknown, max = 500): string {
  return String(v ?? "").trim().slice(0, max);
}

function hasText(v: unknown): boolean {
  const t = clean(v, 4000);
  return !!(t && t !== "—" && t.toLowerCase() !== "null" && t.toLowerCase() !== "undefined");
}

function normName(v: string): string {
  return v.toLowerCase().replace(/\s+/g, " ").trim();
}

function namesMatch(a: string, b: string): boolean {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xf = x.split(" ")[0];
  const yf = y.split(" ")[0];
  return xf === yf && (x.includes(y) || y.includes(x));
}

function emailsMatch(a: string, b: string): boolean {
  const x = clean(a, 200).toLowerCase();
  const y = clean(b, 200).toLowerCase();
  return !!(x && y && x === y);
}

function phonesMatch(a: string, b: string): boolean {
  const da = clean(a, 40).replace(/\D/g, "");
  const db = clean(b, 40).replace(/\D/g, "");
  if (!da || !db) return false;
  const a10 = da.length >= 10 ? da.slice(-10) : da;
  const b10 = db.length >= 10 ? db.slice(-10) : db;
  return a10 === b10;
}

/** Merge `extra` into `base` without overwriting non-empty base values. */
function mergeAnswers(
  base: Record<string, string>,
  extra: Record<string, string>,
): Record<string, string> {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (!hasText(v)) continue;
    if (hasText(out[k])) continue;
    out[k] = clean(v, 4000);
  }
  return out;
}

function payloadToAnswers(payload: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (v == null) continue;
    if (typeof v === "boolean") {
      out[k] = v ? "Yes" : "No";
      continue;
    }
    if (Array.isArray(v)) {
      const joined = v.map((x) => clean(x, 400)).filter(Boolean).join("; ");
      if (joined) out[k] = joined;
      continue;
    }
    const c = clean(v, 4000);
    if (c) out[k] = c;
  }
  return out;
}

function normalizeRelationship(raw: string): string {
  const t = clean(raw, 80).toLowerCase();
  if (!t) return "";
  if (/\bmother\b|\bmum\b|\bmom\b/.test(t)) return "Mother";
  if (/\bfather\b|\bdad\b/.test(t)) return "Father";
  if (/guardian|carer|caregiver|foster|step-?parent|parent/.test(t)) {
    if (/\bmother\b|\bmum\b|\bmom\b/.test(t)) return "Mother";
    if (/\bfather\b|\bdad\b/.test(t)) return "Father";
    return "Legal guardian";
  }
  return clean(raw, 80);
}

function formatAddress(row: {
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
} | null | undefined): string {
  if (!row) return "";
  return [row.address_line1, row.address_line2, row.city]
    .map((x) => clean(x, 120))
    .filter((x) => x && x !== "—")
    .join(", ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: { contact_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return parentPortalJsonInvalid(400);

  const { data: participant } = await supabase
    .from("portal_participants")
    .select(
      "contact_id, display_name, first_name, last_name, dob_iso, avatar_storage_path, parent_person_id",
    )
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (!participant) return parentPortalJsonInvalid(403);

  const displayName = clean(participant.display_name) ||
    [participant.first_name, participant.last_name].filter(Boolean).join(" ");

  const contactSelect =
    "parent_display, parent_first_name, parent_last_name, email, mobile, address_line1, address_line2, city, postcode, child_display";

  const { data: parentContactExact } = await supabase
    .from("portal_parent_contacts")
    .select(contactSelect)
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  // Sibling / family fallback — same parent may have address only on another child row.
  const { data: familyContacts } = await supabase
    .from("portal_parent_contacts")
    .select(contactSelect)
    .eq("parent_person_id", session.parent_person_id)
    .order("updated_at", { ascending: false })
    .limit(20);

  const familyRows = familyContacts || [];
  const parentContact =
    parentContactExact ||
    familyRows.find((r) => hasText(r.address_line1) || hasText(r.postcode)) ||
    familyRows[0] ||
    null;

  const addressDonor =
    (hasText(parentContactExact?.address_line1) || hasText(parentContactExact?.postcode)
      ? parentContactExact
      : null) ||
    familyRows.find((r) => hasText(r.address_line1) || hasText(r.postcode)) ||
    parentContact;

  const { data: genRow } = await supabase
    .from("portal_participant_general_info")
    .select("general_info_sheet")
    .eq("contact_id", contactId)
    .maybeSingle();

  let answers: Record<string, string> = {};

  const parentEmail = clean(parentContact?.email, 200);
  const parentPhone = clean(parentContact?.mobile, 40);

  const { data: docRows } = await supabase
    .from("portal_participant_documents")
    .select(
      "payload_json, participant_name, participant_dob, parent_name, parent_email, parent_phone, submitted_at",
    )
    .eq("form_type", "client_registration")
    .order("submitted_at", { ascending: false })
    .limit(80);

  const rankedDocs = (docRows || [])
    .map((row) => {
      let score = 0;
      if (namesMatch(displayName, String(row.participant_name || ""))) score += 5;
      if (emailsMatch(parentEmail, String(row.parent_email || ""))) score += 3;
      if (phonesMatch(parentPhone, String(row.parent_phone || ""))) score += 2;
      const dobDoc = clean(row.participant_dob, 20).slice(0, 10);
      const dobPax = participant.dob_iso ? String(participant.dob_iso).slice(0, 10) : "";
      if (dobDoc && dobPax && dobDoc === dobPax) score += 4;
      return { row, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score);

  for (const hit of rankedDocs) {
    if (hit.row?.payload_json && typeof hit.row.payload_json === "object") {
      answers = mergeAnswers(
        answers,
        payloadToAnswers(hit.row.payload_json as Record<string, unknown>),
      );
    }
  }

  const infoBlob = clean(genRow?.general_info_sheet, 12000) ||
    lookupClientsInfoSheetForParticipant({
      contactId,
      displayName,
      firstName: clean(participant.first_name, 80),
      lastName: clean(participant.last_name, 80),
    });

  if (infoBlob) {
    // Prefer prior form answers; fill gaps from Clients Info sheet.
    answers = mergeAnswers(answers, answersFromClientsInfoBlob(infoBlob));
  } else if (genRow?.general_info_sheet) {
    const fields = parseGeneralInfoSheet(String(genRow.general_info_sheet));
    const fromSheet: Record<string, string> = {};
    for (const f of fields) {
      const lab = clean(f.label, 200).toLowerCase();
      const val = clean(f.value, 4000);
      if (!val) continue;
      if (lab.includes("medical")) fromSheet.medical_conditions = val;
      else if (lab.includes("communication")) fromSheet.expressive_comm = val;
      else if (lab.includes("motivator") || lab.includes("likes")) fromSheet.motivators = val;
      else if (lab.includes("trigger")) fromSheet.triggers = val;
      else if (lab.includes("dislike")) fromSheet.dislikes = val;
    }
    answers = mergeAnswers(answers, fromSheet);
  }

  const addressLine = formatAddress(addressDonor);
  const postcode = clean(addressDonor?.postcode, 20);

  const contactAnswers: Record<string, string> = {
    parent_name: clean(parentContact?.parent_display) ||
      [parentContact?.parent_first_name, parentContact?.parent_last_name].filter(Boolean).join(" "),
    parent_email: parentEmail,
    parent_phone: parentPhone,
    parent_address: addressLine,
    parent_postcode: postcode && postcode !== "—" ? postcode : "",
    participant_name: displayName,
    participant_dob: participant.dob_iso ? String(participant.dob_iso).slice(0, 10) : "",
  };
  answers = mergeAnswers(answers, contactAnswers);

  if (hasText(answers.relationship)) {
    answers.relationship = normalizeRelationship(answers.relationship) || answers.relationship;
  }

  const hasPhoto = !!clean(participant.avatar_storage_path, 200);

  return new Response(
    JSON.stringify({
      ok: true,
      contact_id: contactId,
      participant: {
        contact_id: contactId,
        display_name: displayName,
        dob_iso: participant.dob_iso,
        has_photo: hasPhoto,
      },
      age_label: ageLabelFromDobIso(participant.dob_iso ? String(participant.dob_iso) : null),
      answers,
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
