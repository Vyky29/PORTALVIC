// portal-parent-form-submit — public parent forms (climbing + client registration).
// POST multipart/form-data: form_type, participant_name, pdf (required), photo (optional), payload (JSON string), parent_* fields.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncParentFormPhotoToParticipantAvatar } from "../_shared/participant_avatar.ts";
import { ensureInterestedClientFromRegistration } from "../_shared/portal_interested_client.ts";
import { notifyOfficeRegistrationSubmitted } from "../_shared/portal_booking_lead_office_notify.ts";
import { sendFinishBookingAfterRegistration } from "../_shared/portal_booking_finish.ts";
import {
  extractBookingRequest,
  loadPendingBookingFromLeadSession,
  loadPendingBookingForEmail,
  type PortalBookingRequest,
} from "../_shared/portal_booking_context.ts";
import { bookingPayHoldExpiresAt } from "../_shared/portal_booking_pay_hold.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  // Custom booking headers must be listed or browsers fail the preflight as "Failed to fetch"
  // (shown to parents as a generic network error).
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-booking-lead-session, x-booking-service-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "participant-documents";
const MAX_PDF_BYTES = 18 * 1024 * 1024;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORM_TYPES = new Set(["climbing_registration", "client_registration"]);

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizePart(value: string, max = 200): string {
  return String(value || "").trim().slice(0, max);
}

function sanitizeFilenamePart(value: string): string {
  return sanitizePart(value, 80)
    .replace(/[^\w\- ]+/g, "")
    .replace(/\s+/g, "_") || "participant";
}

function parseDob(raw: string): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

/** Booking Portal seat: 30' window to finish pay (same as finish-booking invoice hold). */


type BookingRequest = PortalBookingRequest;

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function phoneLast10(raw: string | null): string {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function emailNorm(raw: string | null): string {
  return String(raw || "").trim().toLowerCase();
}

const BOOKING_STATUS_RANK: Record<string, number> = {
  new_lead: 0,
  exploring_services: 1,
  waiting_list: 2,
  no_booking: 1,
  registration_started: 3,
  booking_started: 3,
  registration_submitted: 4,
  booking_completed: 5,
};

const REG_STATUS_RANK: Record<string, number> = {
  not_started: 0,
  started: 1,
  submitted: 2,
};

/** Mark matching booking-portal leads as registration submitted (email, phone, or lead session). */
async function markBookingLeadsSubmitted(
  admin: ReturnType<typeof createClient>,
  opts: {
    parentEmail: string | null;
    parentPhone: string | null;
    leadSessionToken: string | null;
  },
): Promise<{ updated: number; primaryLeadId: string | null }> {
  const leadIds = new Set<string>();
  let sessionLeadId: string | null = null;
  const token = String(opts.leadSessionToken || "").trim();
  if (/^[a-f0-9]{32,128}$/i.test(token)) {
    const tokenHash = await sha256Hex(token);
    const { data: sess } = await admin
      .from("portal_booking_lead_sessions")
      .select("lead_id, expires_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (
      sess?.lead_id &&
      !sess.revoked_at &&
      new Date(String(sess.expires_at)).getTime() >= Date.now()
    ) {
      sessionLeadId = String(sess.lead_id);
      leadIds.add(sessionLeadId);
    }
  }

  const email = emailNorm(opts.parentEmail);
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

  const phone = phoneLast10(opts.parentPhone);
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

  if (!leadIds.size) return { updated: 0, primaryLeadId: null };

  const nowIso = new Date().toISOString();
  let updated = 0;
  for (const id of leadIds) {
    const { data: lead } = await admin
      .from("portal_booking_leads")
      .select("id, booking_status, registration_status, client_status")
      .eq("id", id)
      .maybeSingle();
    if (!lead) continue;

    const patch: Record<string, unknown> = {
      last_activity_at: nowIso,
      updated_at: nowIso,
    };
    const curBook = BOOKING_STATUS_RANK[String(lead.booking_status)] ?? 0;
    if (curBook < BOOKING_STATUS_RANK.registration_submitted) {
      patch.booking_status = "registration_submitted";
    }
    const curReg = REG_STATUS_RANK[String(lead.registration_status)] ?? 0;
    if (curReg < REG_STATUS_RANK.submitted) {
      patch.registration_status = "submitted";
    }
    /* Interested in our services — do not overwrite active clients. */
    const curClient = String(lead.client_status || "");
    if (curClient !== "active_client" && curClient !== "closed") {
      patch.client_status = "registered";
    }
    const { error } = await admin.from("portal_booking_leads").update(patch).eq("id", id);
    if (error) {
      console.warn("[portal-parent-form-submit] lead status", id, error.message);
    } else {
      updated += 1;
    }
  }
  const primaryLeadId = sessionLeadId || [...leadIds][0] || null;
  return { updated, primaryLeadId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return json(500, { ok: false, error: "server_misconfigured" });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, error: "bad_form" });
  }

  const formType = sanitizePart(String(form.get("form_type") || ""), 40).toLowerCase();
  const participantName = sanitizePart(String(form.get("participant_name") || ""), 200);
  if (!ALLOWED_FORM_TYPES.has(formType)) {
    return json(400, { ok: false, error: "invalid_form_type" });
  }
  if (!participantName) {
    return json(400, { ok: false, error: "missing_participant_name" });
  }

  const pdfFile = form.get("pdf");
  if (!(pdfFile instanceof File) || !pdfFile.size) {
    return json(400, { ok: false, error: "missing_pdf" });
  }
  if (pdfFile.size > MAX_PDF_BYTES) {
    return json(413, { ok: false, error: "pdf_too_large" });
  }
  const pdfType = String(pdfFile.type || "application/pdf").toLowerCase();
  if (pdfType && !pdfType.includes("pdf")) {
    return json(400, { ok: false, error: "invalid_pdf_type" });
  }

  const photoFile = form.get("photo");
  let photoBlob: File | null = null;
  if (photoFile instanceof File && photoFile.size) {
    if (photoFile.size > MAX_PHOTO_BYTES) {
      return json(413, { ok: false, error: "photo_too_large" });
    }
    const photoType = String(photoFile.type || "").toLowerCase();
    if (photoType && !photoType.startsWith("image/")) {
      return json(400, { ok: false, error: "invalid_photo_type" });
    }
    photoBlob = photoFile;
  }
  /* Client registration must always land in Documents with a participant photo. */
  if (formType === "client_registration" && !photoBlob) {
    return json(400, { ok: false, error: "missing_photo" });
  }

  let payload: Record<string, unknown> = {};
  const payloadRaw = String(form.get("payload") || "").trim();
  if (payloadRaw) {
    try {
      const parsed = JSON.parse(payloadRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      return json(400, { ok: false, error: "invalid_payload" });
    }
  }

  const parentName = sanitizePart(String(form.get("parent_name") || ""), 200) || null;
  const parentEmail = sanitizePart(String(form.get("parent_email") || ""), 200) || null;
  const parentPhone = sanitizePart(String(form.get("parent_phone") || ""), 80) || null;
  const participantDob = parseDob(String(form.get("participant_dob") || ""));
  const bookingSessionToken = sanitizePart(
    String(form.get("booking_service_session") || req.headers.get("x-booking-service-session") || ""),
    200,
  );
  const bookingLeadSessionToken = sanitizePart(
    String(form.get("booking_lead_session") || req.headers.get("x-booking-lead-session") || ""),
    200,
  );

  const adminEarly = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let bookingRequest = extractBookingRequest(payload);
  if (!bookingRequest && bookingLeadSessionToken) {
    bookingRequest = await loadPendingBookingFromLeadSession(adminEarly, bookingLeadSessionToken);
  }
  if (!bookingRequest && parentEmail) {
    bookingRequest = await loadPendingBookingForEmail(adminEarly, parentEmail);
  }
  if (bookingRequest) {
    payload = { ...payload, booking_request: bookingRequest };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = sanitizeFilenamePart(participantName);
  const prefix = `${formType}/${stamp}_${safeName}`;

  const admin = adminEarly;

  const pdfPath = `${prefix}/form.pdf`;
  const pdfBytes = new Uint8Array(await pdfFile.arrayBuffer());
  const { error: pdfUpErr } = await admin.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (pdfUpErr) {
    console.error("[portal-parent-form-submit] pdf upload", pdfUpErr.message);
    return json(500, { ok: false, error: "pdf_upload_failed" });
  }

  let photoPath: string | null = null;
  let photoBytes: Uint8Array | null = null;
  if (photoBlob) {
    const ext = String(photoBlob.type || "").includes("png") ? "png" : "jpg";
    photoPath = `${prefix}/photo.${ext}`;
    photoBytes = new Uint8Array(await photoBlob.arrayBuffer());
    const { error: photoUpErr } = await admin.storage.from(BUCKET).upload(photoPath, photoBytes, {
      contentType: photoBlob.type || (ext === "png" ? "image/png" : "image/jpeg"),
      upsert: false,
    });
    if (photoUpErr) {
      console.error("[portal-parent-form-submit] photo upload", photoUpErr.message);
      await admin.storage.from(BUCKET).remove([pdfPath]);
      return json(500, { ok: false, error: "photo_upload_failed" });
    }
  }

  const { data: row, error: insErr } = await admin
    .from("portal_participant_documents")
    .insert({
      form_type: formType,
      participant_name: participantName,
      participant_dob: participantDob,
      parent_name: parentName,
      parent_email: parentEmail,
      parent_phone: parentPhone,
      pdf_storage_path: pdfPath,
      photo_storage_path: photoPath,
      payload_json: payload,
      status: "new",
    })
    .select("id, submitted_at")
    .single();

  if (insErr || !row) {
    console.error("[portal-parent-form-submit] insert", insErr?.message);
    const removePaths = [pdfPath];
    if (photoPath) removePaths.push(photoPath);
    await admin.storage.from(BUCKET).remove(removePaths);
    return json(500, { ok: false, error: "save_failed" });
  }

  /* Every completed Client Registration → Interested client record (not waitlist-only). */
  if (formType === "client_registration") {
    try {
      const parentBits = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
      await ensureInterestedClientFromRegistration(admin, {
        participantName,
        participantDob,
        parentName,
        parentEmail,
        parentPhone,
        addressLine1: sanitizePart(String(parentBits.parent_address || parentBits.address || ""), 200) || null,
        postcode: sanitizePart(String(parentBits.parent_postcode || parentBits.postcode || ""), 20) || null,
        registrationDate: String(row.submitted_at || "").slice(0, 10) || null,
        generalInfoLines: [
          bookingRequest
            ? `Requested booking\t${bookingRequest.service_name} · ${bookingRequest.venue} · ${bookingRequest.day} · ${bookingRequest.time}`
            : "Requested booking\tNone (registration only — Interested in our services)",
          parentBits.ehcp ? `EHCP\t${sanitizePart(String(parentBits.ehcp), 40)}` : "",
          parentBits.ehcp_details ? `EHCP details\t${sanitizePart(String(parentBits.ehcp_details), 400)}` : "",
          parentBits.motivators ? `Motivators\t${sanitizePart(String(parentBits.motivators), 400)}` : "",
          parentBits.dislikes ? `Dislikes\t${sanitizePart(String(parentBits.dislikes), 400)}` : "",
          `Registration document\t${row.id}`,
        ].filter(Boolean),
      });
    } catch (ensureErr) {
      console.warn("[portal-parent-form-submit] ensure interested client", ensureErr);
    }
  }

  if (photoBytes && photoBytes.length) {
    try {
      await syncParentFormPhotoToParticipantAvatar(
        admin,
        participantName,
        participantDob,
        photoBytes,
        photoBlob?.type || "image/jpeg",
      );
    } catch (syncErr) {
      console.warn("[portal-parent-form-submit] avatar sync", syncErr);
    }
  }

  let primaryLeadId: string | null = null;
  try {
    const leadMark = await markBookingLeadsSubmitted(admin, {
      parentEmail,
      parentPhone,
      leadSessionToken: bookingLeadSessionToken,
    });
    primaryLeadId = leadMark.primaryLeadId;
    if (leadMark.updated) {
      console.log(
        "[portal-parent-form-submit] marked leads submitted",
        leadMark.updated,
      );
    }
  } catch (leadErr) {
    console.warn("[portal-parent-form-submit] lead status update", leadErr);
  }

  let reservationId: string | null = null;
  if (bookingRequest && formType === "client_registration") {
    try {
      const holdExpires = bookingPayHoldExpiresAt();
      const tokenHash = bookingSessionToken ? await sha256Hex(bookingSessionToken) : null;

      // One pending hold per email+slot — refresh if they re-submit.
      if (parentEmail) {
        await admin
          .from("portal_booking_slot_reservations")
          .update({
            status: "released",
            released_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            notes: "superseded_by_resubmit",
          })
          .eq("slot_id", bookingRequest.slot_id)
          .eq("status", "pending")
          .ilike("parent_email", parentEmail);
      }

      const { data: holdRow, error: holdErr } = await admin
        .from("portal_booking_slot_reservations")
        .insert({
          slot_id: bookingRequest.slot_id,
          service_id: bookingRequest.service_id,
          service_name: bookingRequest.service_name,
          venue: bookingRequest.venue,
          day_label: bookingRequest.day,
          time_label: bookingRequest.time,
          activity: bookingRequest.activity,
          booking_mode: bookingRequest.booking_mode,
          week_id: bookingRequest.week_id,
          block_id: bookingRequest.block_id,
          date_iso: bookingRequest.date_iso,
          document_id: row.id,
          participant_name: participantName,
          parent_name: parentName,
          parent_email: parentEmail,
          parent_phone: parentPhone,
          booking_session_token_hash: tokenHash,
          status: "pending",
          hold_expires_at: holdExpires,
          notes:
            (bookingRequest.booking_kind === "trial"
              ? "booking_kind=trial|"
              : "booking_kind=term|") + "pay_hold_30m",
        })
        .select("id")
        .single();

      if (holdErr) {
        console.warn("[portal-parent-form-submit] slot reservation", holdErr.message);
      } else {
        reservationId = holdRow?.id ?? null;
        if (parentEmail) {
          await admin
            .from("portal_booking_leads")
            .update({
              pending_booking_request: null,
              updated_at: new Date().toISOString(),
            })
            .eq("email_norm", parentEmail.toLowerCase());
        }
      }
    } catch (holdCatch) {
      console.warn("[portal-parent-form-submit] slot reservation", holdCatch);
    }
  }

  const bookingSummary = bookingRequest
    ? [
        bookingRequest.service_name,
        bookingRequest.venue,
        bookingRequest.day,
        bookingRequest.time,
        bookingRequest.activity,
        bookingRequest.booking_kind === "trial" ? "TRIAL" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  try {
    await notifyOfficeRegistrationSubmitted({
      documentId: String(row.id),
      formType,
      participantName,
      parentName,
      parentEmail,
      parentPhone,
      leadId: primaryLeadId,
      slotHeld: !!reservationId,
      bookingSummary,
      pdfBytes,
      pdfFilename: `${safeName}_${formType}.pdf`,
    });
  } catch (notifyErr) {
    console.warn("[portal-parent-form-submit] office notify", notifyErr);
  }

  let finishBooking: {
    finish_url: string;
    finish_url_sent: boolean;
  } | null = null;
  /* Client + climbing: parent pays via finish-booking without waiting for office Accept.
   * Office is notified above; suitability / form review is post-payment. */
  if (
    bookingRequest &&
    (formType === "client_registration" || formType === "climbing_registration")
  ) {
    try {
      const sent = await sendFinishBookingAfterRegistration(admin, {
        id: String(row.id),
        participant_name: participantName,
        parent_name: parentName,
        parent_email: parentEmail,
        parent_phone: parentPhone,
        payload_json: payload,
      }, {
        reservationId,
        leadId: primaryLeadId,
        variant: "registration_submitted",
      });
      finishBooking = {
        finish_url: sent.finish_url,
        finish_url_sent: sent.finish_url_sent,
      };
    } catch (finishErr) {
      console.warn("[portal-parent-form-submit] finish link", finishErr);
    }
  }

  return json(200, {
    ok: true,
    id: row.id,
    submitted_at: row.submitted_at,
    reservation_id: reservationId,
    slot_held: !!reservationId,
    finish_url: finishBooking?.finish_url || null,
    finish_url_sent: finishBooking?.finish_url_sent || false,
  });
});
