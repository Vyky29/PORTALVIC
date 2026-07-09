// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-consents-load
// Load photo + medication + emergency consents for a linked participant.

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

const EMPTY = {
  photo_consent: "unknown",
  photo_consent_signed_at: null as string | null,
  photo_consent_signed_by_name: "",
  medication_at_centre_needed: "unknown",
  medication_at_centre_details: "",
  medication_at_centre_signed_at: null as string | null,
  medication_at_centre_signed_by_name: "",
  emergency_treatment_consent: "unknown",
  emergency_treatment_signed_at: null as string | null,
  emergency_treatment_signed_by_name: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  updated_at: null as string | null,
};

function summarize(c: typeof EMPTY) {
  const photoDone = c.photo_consent !== "unknown" && !!c.photo_consent_signed_at;
  const medDone =
    c.medication_at_centre_needed !== "unknown" && !!c.medication_at_centre_signed_at;
  const emergencyDone =
    c.emergency_treatment_consent !== "unknown" &&
    !!c.emergency_treatment_signed_at &&
    !!clean(c.emergency_contact_name, 120) &&
    !!clean(c.emergency_contact_phone, 40);
  return {
    photo_done: photoDone,
    medication_done: medDone,
    emergency_done: emergencyDone,
    pending_count: (photoDone ? 0 : 1) + (medDone ? 0 : 1) + (emergencyDone ? 0 : 1),
  };
}

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

  let body: { contact_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
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

  const { data: row, error } = await supabase
    .from("portal_participant_parent_consents")
    .select(
      "photo_consent, photo_consent_signed_at, photo_consent_signed_by_name, medication_at_centre_needed, medication_at_centre_details, medication_at_centre_signed_at, medication_at_centre_signed_by_name, emergency_treatment_consent, emergency_treatment_signed_at, emergency_treatment_signed_by_name, emergency_contact_name, emergency_contact_phone, updated_at",
    )
    .eq("contact_id", contactId)
    .maybeSingle();

  if (error) {
    console.error("[parent-portal-consents-load]", error.message);
    return parentPortalJsonInvalid(500);
  }

  const consents = row
    ? {
        photo_consent: clean(row.photo_consent, 40) || "unknown",
        photo_consent_signed_at: row.photo_consent_signed_at
          ? String(row.photo_consent_signed_at)
          : null,
        photo_consent_signed_by_name: clean(row.photo_consent_signed_by_name, 120),
        medication_at_centre_needed: clean(row.medication_at_centre_needed, 40) || "unknown",
        medication_at_centre_details: clean(row.medication_at_centre_details, 2000),
        medication_at_centre_signed_at: row.medication_at_centre_signed_at
          ? String(row.medication_at_centre_signed_at)
          : null,
        medication_at_centre_signed_by_name: clean(row.medication_at_centre_signed_by_name, 120),
        emergency_treatment_consent: clean(row.emergency_treatment_consent, 40) || "unknown",
        emergency_treatment_signed_at: row.emergency_treatment_signed_at
          ? String(row.emergency_treatment_signed_at)
          : null,
        emergency_treatment_signed_by_name: clean(row.emergency_treatment_signed_by_name, 120),
        emergency_contact_name: clean(row.emergency_contact_name, 120),
        emergency_contact_phone: clean(row.emergency_contact_phone, 40),
        updated_at: row.updated_at ? String(row.updated_at) : null,
      }
    : { ...EMPTY };

  return json(200, {
    ok: true,
    consents,
    summary: summarize(consents),
  });
});
