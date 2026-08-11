// portal-admin-participant-document-review
// Admin accepts a parent registration PDF: mark reviewed + validate slot hold.
// After accept, office completes funding / payment / roster booking separately.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

function clean(v: unknown, max = 80): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function emailNorm(v: string | null | undefined): string {
  return String(v || "").trim().toLowerCase();
}

function phoneLast10(v: string | null | undefined): string {
  return String(v || "").replace(/\D/g, "").slice(-10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(
    req.headers.get("Authorization"),
  );
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: { document_id?: string; action?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const documentId = clean(body.document_id, 60);
  const action = clean(body.action, 20).toLowerCase() || "accept";
  if (!documentId) {
    return portalAdminJson(400, { ok: false, error: "document_id_required" });
  }
  if (action !== "accept") {
    return portalAdminJson(400, { ok: false, error: "action_unsupported" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: doc, error: loadErr } = await admin
    .from("portal_participant_documents")
    .select(
      "id, form_type, participant_name, parent_name, parent_email, parent_phone, status, reviewed_at",
    )
    .eq("id", documentId)
    .maybeSingle();

  if (loadErr) {
    console.error("[portal-admin-participant-document-review] load", loadErr.message);
    return portalAdminJson(500, { ok: false, error: "load_failed" });
  }
  if (!doc) {
    return portalAdminJson(404, { ok: false, error: "not_found" });
  }

  const nowIso = new Date().toISOString();
  const alreadyReviewed = String(doc.status || "").toLowerCase() === "reviewed";

  if (!alreadyReviewed) {
    const { error: updErr } = await admin
      .from("portal_participant_documents")
      .update({
        status: "reviewed",
        reviewed_at: nowIso,
        reviewed_by: verified.userId || null,
      })
      .eq("id", documentId);
    if (updErr) {
      console.error("[portal-admin-participant-document-review] doc", updErr.message);
      return portalAdminJson(500, { ok: false, error: "update_failed" });
    }
  }

  let reservationsValidated = 0;
  const { data: holds, error: holdErr } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, status")
    .eq("document_id", documentId)
    .eq("status", "pending");

  if (holdErr) {
    console.warn("[portal-admin-participant-document-review] holds", holdErr.message);
  } else {
    for (const hold of holds || []) {
      const { error: vErr } = await admin
        .from("portal_booking_slot_reservations")
        .update({
          status: "validated",
          validated_at: nowIso,
          updated_at: nowIso,
          notes: "accepted_by_admin",
        })
        .eq("id", hold.id)
        .eq("status", "pending");
      if (!vErr) reservationsValidated += 1;
      else console.warn("[portal-admin-participant-document-review] validate", vErr.message);
    }
  }

  let leadsUpdated = 0;
  const leadIds = new Set<string>();
  const email = emailNorm(doc.parent_email);
  if (email) {
    const { data: byEmail } = await admin
      .from("portal_booking_leads")
      .select("id, booking_status, client_status")
      .eq("email_norm", email)
      .limit(5);
    for (const row of byEmail || []) {
      if (row?.id) leadIds.add(String(row.id));
    }
  }
  const phone = phoneLast10(doc.parent_phone);
  if (phone.length >= 10) {
    const { data: byPhone } = await admin
      .from("portal_booking_leads")
      .select("id, booking_status, client_status")
      .eq("phone_lookup", phone)
      .limit(5);
    for (const row of byPhone || []) {
      if (row?.id) leadIds.add(String(row.id));
    }
  }

  for (const id of leadIds) {
    const { data: lead } = await admin
      .from("portal_booking_leads")
      .select("id, booking_status, client_status, registration_status")
      .eq("id", id)
      .maybeSingle();
    if (!lead) continue;
    const patch: Record<string, unknown> = {
      last_activity_at: nowIso,
      updated_at: nowIso,
      registration_status: "submitted",
    };
    const book = String(lead.booking_status || "");
    if (
      book === "new_lead" ||
      book === "exploring_services" ||
      book === "registration_started" ||
      book === "registration_submitted"
    ) {
      // Accepted form → office can complete booking (funding / payment / roster).
      patch.booking_status = "booking_started";
    }
    const client = String(lead.client_status || "");
    if (client === "prospective") {
      patch.client_status = "registered";
    }
    const { error: leadErr } = await admin
      .from("portal_booking_leads")
      .update(patch)
      .eq("id", id);
    if (!leadErr) leadsUpdated += 1;
    else console.warn("[portal-admin-participant-document-review] lead", leadErr.message);
  }

  return portalAdminJson(200, {
    ok: true,
    document_id: documentId,
    already_reviewed: alreadyReviewed,
    reservations_validated: reservationsValidated,
    leads_updated: leadsUpdated,
    next_step:
      "Set funding and payment method, then confirm the place on the roster / Parent Portal.",
  });
});
