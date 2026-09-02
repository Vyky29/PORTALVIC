// portal-admin-participant-document-review
// Admin marks registration reviewed (post-payment suitability) and can resend finish-booking link.
// New registrations auto-receive the finish link on submit — Accept is no longer a payment gate.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  sendFinishBookingAfterRegistration,
} from "../_shared/portal_booking_finish.ts";
import {
  extractBookingRequest,
  bookingRequestSummary,
  normalizePendingBookingRequest,
} from "../_shared/portal_booking_context.ts";

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
    payload_json?: unknown;
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
      .select("id, pending_booking_request")
      .eq("email_norm", email)
      .limit(5);
    for (const row of byEmail || []) {
      if (row?.id) leadIds.add(String(row.id));
    }
    if (!slotSummary) {
      const br = extractBookingRequest(
        doc.payload_json && typeof doc.payload_json === "object"
          ? doc.payload_json as Record<string, unknown>
          : null,
      ) || normalizePendingBookingFromRows(byEmail);
      slotSummary = bookingRequestSummary(br);
    }
  }
  const phone = phoneLast10(doc.parent_phone);
  if (phone.length >= 10) {
    const { data: byPhone } = await admin
      .from("portal_booking_leads")
      .select("id, pending_booking_request")
      .eq("phone_lookup", phone)
      .limit(5);
    for (const row of byPhone || []) {
      if (row?.id) leadIds.add(String(row.id));
    }
    if (!slotSummary) {
      const br = extractBookingRequest(
        doc.payload_json && typeof doc.payload_json === "object"
          ? doc.payload_json as Record<string, unknown>
          : null,
      ) || normalizePendingBookingFromRows(byPhone);
      slotSummary = bookingRequestSummary(br);
    }
  }
  const leadId = [...leadIds][0] || null;
  return { leadId, reservationId, slotSummary };
}

function normalizePendingBookingFromRows(
  rows: Array<{ pending_booking_request?: unknown }> | null | undefined,
) {
  for (const row of rows || []) {
    const br = normalizePendingBookingRequest(row?.pending_booking_request);
    if (br) return br;
  }
  return null;
}

async function mintAndNotify(
  admin: ReturnType<typeof createClient>,
  doc: {
    id: string;
    participant_name: string;
    parent_name: string | null;
    parent_email: string | null;
    parent_phone: string | null;
    payload_json?: unknown;
  },
  variant: "accepted" | "registration_submitted" | "resend_pay_hold" = "accepted",
): Promise<{
  finish_url_sent: boolean;
  email_ok: boolean;
  wa_ok: boolean;
  token_id: string | null;
  slot_held: boolean;
  hold_expires_at: string | null;
  rehold_error: string | null;
  reservations_prepared: number;
}> {
  const sent = await sendFinishBookingAfterRegistration(admin, doc, {
    variant,
    notify: true,
    reholdReleased: variant === "resend_pay_hold" || variant === "accepted",
  });
  return {
    finish_url_sent: sent.finish_url_sent,
    email_ok: sent.email_ok,
    wa_ok: sent.wa_ok,
    token_id: sent.token_id,
    slot_held: sent.slot_held,
    hold_expires_at: sent.hold_expires_at,
    rehold_error: sent.rehold_error,
    reservations_prepared: sent.reservations_prepared,
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

  const formType = String(doc.form_type || "").toLowerCase();
  if (formType !== "client_registration" && formType !== "climbing_registration") {
    return portalAdminJson(400, {
      ok: false,
      error: "not_a_new_client_registration",
      hint: "Accept / finish-booking is only for Client registration forms. Annual consents are under Documents → Parent consents.",
    });
  }

  if (action === "resend_finish_link") {
    try {
      const sent = await mintAndNotify(admin, doc, "resend_pay_hold");
      if (sent.rehold_error === "slot_unavailable") {
        return portalAdminJson(409, {
          ok: false,
          error: "slot_unavailable",
          message:
            "Could not re-hold the seat — the slot looks full. Finish link was not sent.",
          ...sent,
        });
      }
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
      if (keepTrial) {
        const { error: rErr } = await admin
          .from("portal_booking_slot_reservations")
          .update({
            status: "released",
            released_at: nowIso,
            updated_at: nowIso,
            notes: "accepted_by_admin|booking_kind=trial|awaiting_stripe_pay",
          })
          .eq("id", hold.id)
          .eq("status", "pending");
        if (!rErr) reservationsValidated += 0;
        else console.warn("[portal-admin-participant-document-review] trial release", rErr.message);
        continue;
      }
      const nextNotes = "accepted_by_admin";
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

  /* Also count holds already prepared by auto finish-link on submit. */
  const { count: validatedCount } = await admin
    .from("portal_booking_slot_reservations")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .in("status", ["validated", "awaiting_payment"]);
  if (validatedCount && validatedCount > reservationsValidated) {
    reservationsValidated = validatedCount;
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
      "Parent was sent a finish-booking link (or already received one on submit). Mark paid after bank/Stripe; review suitability post-payment.",
  });
});
