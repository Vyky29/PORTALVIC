// parent-portal-registration-save — sync full registration answers → general info blob.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
  ageLabelFromDobIso,
  buildClientsInfoFromAnswers,
  type RegistrationAnswers,
} from "../_shared/parent_registration_answers.ts";
import { parseGeneralInfoSheet } from "../_shared/participant_general_info.ts";

function clean(v: unknown, max = 4000): string {
  return String(v ?? "").trim().slice(0, max);
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

  let body: { contact_id?: string; answers?: RegistrationAnswers; participant_dob?: string } = {};
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return parentPortalJsonInvalid(400);

  const rawAnswers = body.answers;
  if (!rawAnswers || typeof rawAnswers !== "object") {
    return new Response(JSON.stringify({ ok: false, error: "missing_answers" }), {
      status: 400,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const answers: RegistrationAnswers = {};
  for (const [k, v] of Object.entries(rawAnswers)) {
    answers[clean(k, 80)] = clean(v, 4000);
  }

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id, dob_iso")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (!participant) return parentPortalJsonInvalid(403);

  const dobIso = clean(body.participant_dob, 20) ||
    (participant.dob_iso ? String(participant.dob_iso).slice(0, 10) : "");
  const ageLabel = ageLabelFromDobIso(dobIso || null);
  const sheet = buildClientsInfoFromAnswers(answers, ageLabel);
  if (!sheet) {
    return new Response(JSON.stringify({ ok: false, error: "empty" }), {
      status: 400,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const fields = parseGeneralInfoSheet(sheet);
  const now = new Date().toISOString();

  const { error: upsertErr } = await supabase.from("portal_participant_general_info").upsert(
    {
      contact_id: contactId,
      general_info_sheet: sheet,
      updated_at: now,
      updated_by_parent_person_id: session.parent_person_id,
    },
    { onConflict: "contact_id" },
  );

  if (upsertErr) {
    console.error("[parent-portal-registration-save]", upsertErr.message);
    return parentPortalJsonInvalid(500);
  }

  await supabase.from("portal_participant_general_info_log").insert({
    contact_id: contactId,
    parent_person_id: session.parent_person_id,
    general_info_sheet: sheet,
  });

  // Keep portal_parent_contacts in sync so the next "Update registration" opens prefilled.
  const addressRaw = clean(answers.parent_address, 240);
  const postcode = clean(answers.parent_postcode, 20);
  const contactPatch: Record<string, unknown> = { updated_at: now };
  if (clean(answers.parent_name, 120)) {
    contactPatch.parent_display = clean(answers.parent_name, 120);
  }
  if (clean(answers.parent_email, 200)) {
    contactPatch.email = clean(answers.parent_email, 200).toLowerCase();
  }
  if (clean(answers.parent_phone, 40)) {
    contactPatch.mobile = clean(answers.parent_phone, 40);
  }
  if (addressRaw) {
    const parts = addressRaw.split(",").map((s) => s.trim()).filter(Boolean);
    contactPatch.address_line1 = parts[0] || addressRaw;
    if (parts.length >= 2) contactPatch.city = parts[parts.length - 1];
    if (parts.length >= 3) {
      contactPatch.address_line2 = parts.slice(1, -1).join(", ");
    }
  }
  if (postcode) contactPatch.postcode = postcode;

  await supabase
    .from("portal_parent_contacts")
    .update(contactPatch)
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId);

  // Store a registration payload snapshot for robust future prefills (relationship, school, etc.).
  await supabase.from("portal_participant_documents").insert({
    form_type: "client_registration",
    participant_name: clean(answers.participant_name, 120) || contactId,
    participant_dob: dobIso || null,
    parent_name: clean(answers.parent_name, 120) || null,
    parent_email: clean(answers.parent_email, 200) || null,
    parent_phone: clean(answers.parent_phone, 40) || null,
    pdf_storage_path: `parent-portal-updates/${contactId}/${Date.now()}.json`,
    payload_json: answers,
    status: "parent_portal_update",
    submitted_at: now,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      general_info: {
        general_info_sheet: sheet,
        fields,
        updated_at: now,
      },
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
