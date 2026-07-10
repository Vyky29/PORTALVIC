// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-consents-save
// Upsert photo + medication + emergency + off-site/transport; append audit log;
// generate signed consents PDF (logo + answers) into participant-documents.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { buildPortalConsentsPdf } from "../_shared/portal_consents_pdf.ts";

const BUCKET = "participant-documents";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeFilenamePart(value: string): string {
  return clean(value, 80)
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_") || "participant";
}

const YES_NO = new Set(["yes", "no"]);

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
    emergency_treatment_consent?: string;
    emergency_treatment_signed_by_name?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    community_walk_consent?: string;
    public_transport_consent?: string;
    taxi_home_transport_consent?: string;
    offsite_transport_signed_by_name?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });

  const { data: linkedParticipant } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name, dob_iso")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();
  let participant = linkedParticipant;
  if (!participant) {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
    participant = {
      contact_id: contactId,
      display_name: null,
      first_name: null,
      last_name: null,
      dob_iso: null,
    };
  }

  const photoConsent = clean(body.photo_consent, 40).toLowerCase();
  const medNeeded = clean(body.medication_at_centre_needed, 40).toLowerCase();
  const emergencyConsent = clean(body.emergency_treatment_consent, 40).toLowerCase();
  const walkConsent = clean(body.community_walk_consent, 40).toLowerCase();
  const publicTransportConsent = clean(body.public_transport_consent, 40).toLowerCase();
  const taxiConsent = clean(body.taxi_home_transport_consent, 40).toLowerCase();
  const photoSigner = clean(body.photo_consent_signed_by_name, 120);
  const medSigner = clean(body.medication_at_centre_signed_by_name, 120);
  const emergencySigner = clean(body.emergency_treatment_signed_by_name, 120);
  const offsiteSigner = clean(body.offsite_transport_signed_by_name, 120);
  let medDetails = clean(body.medication_at_centre_details, 2000);
  const emergencyContactName = clean(body.emergency_contact_name, 120);
  const emergencyContactPhone = clean(body.emergency_contact_phone, 40);

  if (!YES_NO.has(photoConsent)) {
    return json(400, { ok: false, error: "photo_consent_required" });
  }
  if (!photoSigner) {
    return json(400, { ok: false, error: "photo_signer_required" });
  }
  if (!YES_NO.has(medNeeded)) {
    return json(400, { ok: false, error: "medication_choice_required" });
  }
  if (!medSigner) {
    return json(400, { ok: false, error: "medication_signer_required" });
  }
  if (medNeeded === "yes" && !medDetails) {
    return json(400, { ok: false, error: "medication_details_required" });
  }
  if (medNeeded === "no") medDetails = "";

  if (!YES_NO.has(emergencyConsent)) {
    return json(400, { ok: false, error: "emergency_consent_required" });
  }
  if (!emergencySigner) {
    return json(400, { ok: false, error: "emergency_signer_required" });
  }
  if (!emergencyContactName) {
    return json(400, { ok: false, error: "emergency_contact_name_required" });
  }
  if (!emergencyContactPhone) {
    return json(400, { ok: false, error: "emergency_contact_phone_required" });
  }

  if (!YES_NO.has(walkConsent)) {
    return json(400, { ok: false, error: "community_walk_consent_required" });
  }
  if (!YES_NO.has(publicTransportConsent)) {
    return json(400, { ok: false, error: "public_transport_consent_required" });
  }
  if (!YES_NO.has(taxiConsent)) {
    return json(400, { ok: false, error: "taxi_home_transport_consent_required" });
  }
  if (!offsiteSigner) {
    return json(400, { ok: false, error: "offsite_signer_required" });
  }

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
    emergency_treatment_consent: emergencyConsent,
    emergency_treatment_signed_at: now,
    emergency_treatment_signed_by_name: emergencySigner,
    emergency_contact_name: emergencyContactName,
    emergency_contact_phone: emergencyContactPhone,
    community_walk_consent: walkConsent,
    public_transport_consent: publicTransportConsent,
    taxi_home_transport_consent: taxiConsent,
    offsite_transport_signed_at: now,
    offsite_transport_signed_by_name: offsiteSigner,
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
    emergency_treatment_consent: emergencyConsent,
    emergency_treatment_signed_at: now,
    emergency_treatment_signed_by_name: emergencySigner,
    emergency_contact_name: emergencyContactName,
    emergency_contact_phone: emergencyContactPhone,
    community_walk_consent: walkConsent,
    public_transport_consent: publicTransportConsent,
    taxi_home_transport_consent: taxiConsent,
    offsite_transport_signed_at: now,
    offsite_transport_signed_by_name: offsiteSigner,
  });

  const validUntil = new Date(Date.parse(now) + 365 * 24 * 60 * 60 * 1000).toISOString();

  const participantName =
    clean(participant?.display_name, 120) ||
    [participant?.first_name, participant?.last_name].filter(Boolean).join(" ") ||
    contactId;
  const participantDob = clean(participant?.dob_iso, 20) || null;

  let parentName: string | null = null;
  try {
    const { data: parentRow } = await supabase
      .from("portal_parent_contacts")
      .select("parent_display, parent_first_name, parent_last_name")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    parentName =
      clean(parentRow?.parent_display, 120) ||
      [parentRow?.parent_first_name, parentRow?.parent_last_name].filter(Boolean).join(" ") ||
      photoSigner ||
      null;
  } catch {
    parentName = photoSigner || null;
  }

  let documentId: string | null = null;
  let pdfUrl: string | null = null;
  try {
    const pdfBytes = await buildPortalConsentsPdf({
      participantName,
      participantDob,
      parentName,
      signedAtIso: now,
      validUntilIso: validUntil,
      photoConsent: photoConsent as "yes" | "no",
      photoSigner,
      medicationNeeded: medNeeded as "yes" | "no",
      medicationDetails: medDetails,
      medicationSigner: medSigner,
      emergencyConsent: emergencyConsent as "yes" | "no",
      emergencyContactName,
      emergencyContactPhone,
      emergencySigner,
      communityWalk: walkConsent as "yes" | "no",
      publicTransport: publicTransportConsent as "yes" | "no",
      taxiHome: taxiConsent as "yes" | "no",
      offsiteSigner,
    });

    const stamp = now.replace(/[:.]/g, "-");
    const safeName = sanitizeFilenamePart(participantName);
    const pdfPath = `annual_consents/${stamp}_${safeName}/consents.pdf`;
    const { error: pdfUpErr } = await supabase.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (pdfUpErr) {
      console.error("[parent-portal-consents-save] pdf upload", pdfUpErr.message);
    } else {
      const payload = {
        contact_id: contactId,
        photo_consent: photoConsent,
        medication_at_centre_needed: medNeeded,
        medication_at_centre_details: medDetails,
        emergency_treatment_consent: emergencyConsent,
        emergency_contact_name: emergencyContactName,
        emergency_contact_phone: emergencyContactPhone,
        community_walk_consent: walkConsent,
        public_transport_consent: publicTransportConsent,
        taxi_home_transport_consent: taxiConsent,
        signed_at: now,
        valid_until: validUntil,
      };
      const { data: docRow, error: docErr } = await supabase
        .from("portal_participant_documents")
        .insert({
          form_type: "annual_consents",
          participant_name: participantName,
          participant_dob: participantDob && /^\d{4}-\d{2}-\d{2}/.test(participantDob)
            ? participantDob.slice(0, 10)
            : null,
          parent_name: parentName,
          pdf_storage_path: pdfPath,
          payload_json: payload,
          status: "new",
          submitted_at: now,
        })
        .select("id")
        .maybeSingle();
      if (docErr) {
        console.error("[parent-portal-consents-save] doc insert", docErr.message);
        await supabase.storage.from(BUCKET).remove([pdfPath]);
      } else {
        documentId = docRow?.id ? String(docRow.id) : null;
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(pdfPath, 3600);
        pdfUrl = signed?.signedUrl || null;
      }
    }
  } catch (pdfErr) {
    console.error(
      "[parent-portal-consents-save] pdf",
      pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
    );
  }

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
      emergency_treatment_consent: emergencyConsent,
      emergency_treatment_signed_at: now,
      emergency_treatment_signed_by_name: emergencySigner,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
      community_walk_consent: walkConsent,
      public_transport_consent: publicTransportConsent,
      taxi_home_transport_consent: taxiConsent,
      offsite_transport_signed_at: now,
      offsite_transport_signed_by_name: offsiteSigner,
      updated_at: now,
    },
    summary: {
      photo_done: true,
      medication_done: true,
      emergency_done: true,
      offsite_done: true,
      pending_count: 0,
      renewal_needed: false,
      valid_until: validUntil,
      validity_days: 365,
    },
    document: documentId
      ? {
          id: documentId,
          form_type: "annual_consents",
          title: "Annual consents",
          pdf_url: pdfUrl,
          submitted_at: now,
        }
      : null,
  });
});
