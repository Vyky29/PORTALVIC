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
