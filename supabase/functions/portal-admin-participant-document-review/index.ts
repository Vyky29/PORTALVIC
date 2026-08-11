// portal-admin-participant-document-review
// Admin accepts a parent registration PDF: mark reviewed + validate slot hold,
// then mint finish-booking link and notify the parent (email + WhatsApp).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  mintFinishBookingToken,
  notifyParentFinishBooking,
} from "../_shared/portal_booking_finish.ts";

function clean(v: unknown, max = 80): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function emailNorm(v: string | null | undefined): string {
  return String(v || "").trim().toLowerCase();
}

function phoneLast10(v: string | null | undefined): string {
  return String(v || "").replace(/\D/g, "").slice(-10);
}

async function resolveLeadAndReservation(
  admin: ReturnType<typeof createClient>,
  doc: {
    id: string;
    parent_email: string | null;
    parent_phone: string | null;
  },
): Promise<{ leadId: string | null; reservationId: string | null; slotSummary: string | null }> {
  let reservationId: string | null = null;
  let slotSummary: string | null = null;
  const { data: holds } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, status, service_name, venue, day_label, time_label")
    .eq("document_id", doc.id)
    .in("status", ["validated", "pending"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (holds?.[0]) {
    reservationId = String(holds[0].id);
    slotSummary = [
      holds[0].service_name,
      holds[0].venue,
      holds[0].day_label,
      holds[0].time_label,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  const leadIds = new Set<string>();
  const email = emailNorm(doc.parent_email);
  if (email) {
    const { data: byEmail } = await admin
      .from("portal_booking_leads")
      .select("id")
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
      .select("id")
      .eq("phone_lookup", phone)
      .limit(5);
    for (const row of byPhone || []) {
      if (row?.id) leadIds.add(String(row.id));
    }
  }
  const leadId = [...leadIds][0] || null;
  return { leadId, reservationId, slotSummary };
}

async function mintAndNotify(
  admin: ReturnType<typeof createClient>,
  doc: {
    id: string;
    participant_name: string;
    parent_name: string | null;
    parent_email: string | null;
    parent_phone: string | null;
  },
): Promise<{
  finish_url_sent: boolean;
  email_ok: boolean;
  wa_ok: boolean;
  token_id: string | null;
}> {
  const { leadId, reservationId, slotSummary } = await resolveLeadAndReservation(admin, doc);
  const minted = await mintFinishBookingToken(admin, {
    leadId,
    documentId: doc.id,
    reservationId,
  });
  const notify = await notifyParentFinishBooking({
    parentName: doc.parent_name,
    parentEmail: doc.parent_email,
    parentPhone: doc.parent_phone,
    participantName: doc.participant_name,
    slotSummary,
    rawToken: minted.rawToken,
    admin,
  });
  const nowIso = new Date().toISOString();
  await admin
    .from("portal_booking_completion_tokens")
    .update({
      finish_link_sent_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", minted.tokenId);
  return {
    finish_url_sent: notify.emailOk || notify.waOk,
    email_ok: notify.emailOk,
    wa_ok: notify.waOk,
    token_id: minted.tokenId,
  };
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
  const action = clean(body.action, 40).toLowerCase() || "accept";
  if (!documentId) {
    return portalAdminJson(400, { ok: false, error: "document_id_required" });
  }
  if (action !== "accept" && action !== "resend_finish_link") {
    return portalAdminJson(400, { ok: false, error: "action_unsupported" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: doc, error: loadErr } = await admin
    .from("portal_participant_documents")
    .select(
      "id, form_type, participant_name, parent_name, parent_email, parent_phone, status, reviewed_at, payload_json",
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

  if (action === "resend_finish_link") {
    if (String(doc.status || "").toLowerCase() !== "reviewed") {
      return portalAdminJson(400, { ok: false, error: "not_accepted_yet" });
    }
    try {
      const sent = await mintAndNotify(admin, doc);
      return portalAdminJson(200, {
        ok: true,
        action: "resend_finish_link",
        document_id: documentId,
        ...sent,
      });
    } catch (e) {
      console.error("[portal-admin-participant-document-review] resend", e);
      return portalAdminJson(500, { ok: false, error: "resend_failed" });
    }
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
    .select("id, status, notes")
    .eq("document_id", documentId)
    .eq("status", "pending");

  if (holdErr) {
    console.warn("[portal-admin-participant-document-review] holds", holdErr.message);
  } else {
    for (const hold of holds || []) {
      const prevNotes = String(hold.notes || "").trim();
      const keepTrial = /booking_kind\s*=\s*trial/i.test(prevNotes);
      const nextNotes = keepTrial
        ? "accepted_by_admin|booking_kind=trial"
        : "accepted_by_admin";
      const { error: vErr } = await admin
        .from("portal_booking_slot_reservations")
        .update({
          status: "validated",
          validated_at: nowIso,
          updated_at: nowIso,
          notes: nextNotes,
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
      book === "registration_submitted" ||
      book === "booking_started"
    ) {
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

  let finishNotify: {
    finish_url_sent: boolean;
    email_ok: boolean;
    wa_ok: boolean;
    token_id: string | null;
  } = {
    finish_url_sent: false,
    email_ok: false,
    wa_ok: false,
    token_id: null,
  };
  try {
    finishNotify = await mintAndNotify(admin, doc);
  } catch (e) {
    console.error("[portal-admin-participant-document-review] finish notify", e);
  }

  return portalAdminJson(200, {
    ok: true,
    document_id: documentId,
    already_reviewed: alreadyReviewed,
    reservations_validated: reservationsValidated,
    leads_updated: leadsUpdated,
    ...finishNotify,
    next_step:
      "Parent was sent a finish-booking link to choose funding, payment, and pay the first instalment.",
  });
});
