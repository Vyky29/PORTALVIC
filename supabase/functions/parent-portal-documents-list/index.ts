// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-documents-list
// Parent-facing list of submitted registration PDFs for one linked child.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
  participantIdentityMatches,
  resolveParticipantLookupNames,
} from "../_shared/participant_identity.ts";

const BUCKET = "participant-documents";

const FORM_LABELS: Record<string, string> = {
  climbing_registration: "Climbing registration",
  client_registration: "Client registration",
};

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
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
    .select("contact_id, display_name, first_name, last_name, dob_iso")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!participant) return parentPortalJsonInvalid(403);

  const displayName =
    clean(participant.display_name, 120) ||
    [participant.first_name, participant.last_name].filter(Boolean).join(" ");
  const identityInput = {
    contactId,
    displayName,
    firstName: clean(participant.first_name, 80),
    lastName: clean(participant.last_name, 80),
  };
  const lookupNames = resolveParticipantLookupNames(identityInput);

  const { data: rows, error } = await supabase
    .from("portal_participant_documents")
    .select(
      "id, form_type, participant_name, participant_dob, pdf_storage_path, photo_storage_path, status, submitted_at",
    )
    .order("submitted_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("[parent-portal-documents-list]", error.message);
    return parentPortalJsonInvalid(500);
  }

  const matched = (rows || []).filter((r) =>
    participantIdentityMatches(identityInput, String(r.participant_name || ""), ""),
  );

  // Fallback: name ilike if identity helper is strict
  let list = matched;
  if (!list.length && lookupNames.length) {
    list = (rows || []).filter((r) => {
      const pn = clean(r.participant_name, 120).toLowerCase();
      return lookupNames.some((n) => {
        const nn = clean(n, 120).toLowerCase();
        return pn === nn || pn.includes(nn) || nn.includes(pn);
      });
    });
  }

  const out = [];
  for (const row of list.slice(0, 30)) {
    let pdfUrl: string | null = null;
    let photoUrl: string | null = null;
    if (row.pdf_storage_path) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(String(row.pdf_storage_path), 3600);
      pdfUrl = signed?.signedUrl || null;
    }
    if (row.photo_storage_path) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(String(row.photo_storage_path), 3600);
      photoUrl = signed?.signedUrl || null;
    }
    const ft = clean(row.form_type, 60);
    out.push({
      id: row.id,
      form_type: ft,
      title: FORM_LABELS[ft] || ft.replace(/_/g, " "),
      participant_name: row.participant_name,
      submitted_at: row.submitted_at,
      status: row.status,
      pdf_url: pdfUrl,
      photo_url: photoUrl,
    });
  }

  return json(200, { ok: true, documents: out });
});
