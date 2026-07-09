// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-consents-save
// Upsert photo + medication-at-centre consents; append audit log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

const PHOTO_OK = new Set(["yes", "no"]);
const MED_OK = new Set(["yes", "no"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: {
    contact_id?: string;
    photo_consent?: string;
    photo_consent_signed_by_name?: string;
    medication_at_centre_needed?: string;
    medication_at_centre_details?: string;
    medication_at_centre_signed_by_name?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!participant) {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
  }

  const photoConsent = clean(body.photo_consent, 40).toLowerCase();
  const medNeeded = clean(body.medication_at_centre_needed, 40).toLowerCase();
  const photoSigner = clean(body.photo_consent_signed_by_name, 120);
  const medSigner = clean(body.medication_at_centre_signed_by_name, 120);
  let medDetails = clean(body.medication_at_centre_details, 2000);

  if (!PHOTO_OK.has(photoConsent)) {
    return json(400, { ok: false, error: "photo_consent_required" });
  }
  if (!photoSigner) {
    return json(400, { ok: false, error: "photo_signer_required" });
  }
  if (!MED_OK.has(medNeeded)) {
    return json(400, { ok: false, error: "medication_choice_required" });
  }
  if (!medSigner) {
    return json(400, { ok: false, error: "medication_signer_required" });
  }
  if (medNeeded === "yes" && !medDetails) {
    return json(400, { ok: false, error: "medication_details_required" });
  }
  if (medNeeded === "no") medDetails = "";

  const now = new Date().toISOString();
  const row = {
    contact_id: contactId,
    photo_consent: photoConsent,
    photo_consent_signed_at: now,
    photo_consent_signed_by_name: photoSigner,
    medication_at_centre_needed: medNeeded,
    medication_at_centre_details: medDetails,
    medication_at_centre_signed_at: now,
    medication_at_centre_signed_by_name: medSigner,
    updated_at: now,
    updated_by_parent_person_id: session.parent_person_id,
  };

  const { error: upsertErr } = await supabase
    .from("portal_participant_parent_consents")
    .upsert(row, { onConflict: "contact_id" });

  if (upsertErr) {
    console.error("[parent-portal-consents-save]", upsertErr.message);
    return parentPortalJsonInvalid(500);
  }

  await supabase.from("portal_participant_parent_consents_log").insert({
    contact_id: contactId,
    parent_person_id: session.parent_person_id,
    photo_consent: photoConsent,
    photo_consent_signed_at: now,
    photo_consent_signed_by_name: photoSigner,
    medication_at_centre_needed: medNeeded,
    medication_at_centre_details: medDetails,
    medication_at_centre_signed_at: now,
    medication_at_centre_signed_by_name: medSigner,
  });

  return json(200, {
    ok: true,
    consents: {
      photo_consent: photoConsent,
      photo_consent_signed_at: now,
      photo_consent_signed_by_name: photoSigner,
      medication_at_centre_needed: medNeeded,
      medication_at_centre_details: medDetails,
      medication_at_centre_signed_at: now,
      medication_at_centre_signed_by_name: medSigner,
      updated_at: now,
    },
    summary: {
      photo_done: true,
      medication_done: true,
      pending_count: 0,
    },
  });
});
