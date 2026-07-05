// parent-portal-registration-load — prefill client registration form for a linked child.

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

  const { data: parentContact } = await supabase
    .from("portal_parent_contacts")
    .select(
      "parent_display, parent_first_name, parent_last_name, email, mobile, address_line1, address_line2, city, postcode",
    )
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  const { data: genRow } = await supabase
    .from("portal_participant_general_info")
    .select("general_info_sheet")
    .eq("contact_id", contactId)
    .maybeSingle();

  let answers: Record<string, string> = {};

  const { data: docRows } = await supabase
    .from("portal_participant_documents")
    .select("payload_json, participant_name, participant_dob, parent_name, parent_email, parent_phone")
    .eq("form_type", "client_registration")
    .order("submitted_at", { ascending: false })
    .limit(40);

  const docHit = (docRows || []).find((row) =>
    namesMatch(displayName, String(row.participant_name || ""))
  );
  if (docHit?.payload_json && typeof docHit.payload_json === "object") {
    const p = docHit.payload_json as Record<string, unknown>;
    for (const [k, v] of Object.entries(p)) {
      if (v == null) continue;
      answers[k] = clean(v, 4000);
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
    answers = { ...answersFromClientsInfoBlob(infoBlob), ...answers };
  } else if (genRow?.general_info_sheet) {
    const fields = parseGeneralInfoSheet(String(genRow.general_info_sheet));
    for (const f of fields) {
      const lab = clean(f.label, 200).toLowerCase();
      const val = clean(f.value, 4000);
      if (!val) continue;
      if (lab.includes("medical")) answers.medical_conditions = val;
      else if (lab.includes("communication")) answers.expressive_comm = val;
      else if (lab.includes("motivator") || lab.includes("likes")) answers.motivators = val;
      else if (lab.includes("trigger")) answers.triggers = val;
    }
  }

  const addressParts = [
    parentContact?.address_line1,
    parentContact?.address_line2,
    parentContact?.city,
  ].map((x) => clean(x, 120)).filter((x) => x && x !== "—");
  const postcode = clean(parentContact?.postcode, 20);
  const addressLine = addressParts.join(", ");

  if (!answers.parent_name) {
    answers.parent_name = clean(parentContact?.parent_display) ||
      [parentContact?.parent_first_name, parentContact?.parent_last_name].filter(Boolean).join(" ");
  }
  if (!answers.parent_email) answers.parent_email = clean(parentContact?.email);
  if (!answers.parent_phone) answers.parent_phone = clean(parentContact?.mobile);
  if (!answers.parent_address && addressLine) answers.parent_address = addressLine;
  if (!answers.parent_postcode && postcode && postcode !== "—") answers.parent_postcode = postcode;

  if (!answers.participant_name) answers.participant_name = displayName;
  if (!answers.participant_dob && participant.dob_iso) {
    answers.participant_dob = String(participant.dob_iso).slice(0, 10);
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
