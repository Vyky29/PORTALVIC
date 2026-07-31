// portal-parent-form-submit — public parent forms (climbing + client registration).
// POST multipart/form-data: form_type, participant_name, pdf (required), photo (optional), payload (JSON string), parent_* fields.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncParentFormPhotoToParticipantAvatar } from "../_shared/participant_avatar.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  // Custom booking headers must be listed or browsers fail the preflight as "Failed to fetch"
  // (shown to parents as a generic network error).
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-booking-lead-session, x-booking-service-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "participant-documents";
const MAX_PDF_BYTES = 12 * 1024 * 1024;
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

/** Soft hold window while admin reviews the registration form. */
const SLOT_HOLD_DAYS = 21;

type BookingRequest = {
  from: string;
  slot_id: string;
  service_id: string | null;
  service_name: string | null;
  venue: string | null;
  day: string | null;
  time: string | null;
  activity: string | null;
  booking_mode: string | null;
  week_id: string | null;
  block_id: string | null;
  date_iso: string | null;
  pack: string | null;
};

function asTrimmed(value: unknown, max = 200): string | null {
  const s = sanitizePart(String(value ?? ""), max);
  return s || null;
}

function extractBookingRequest(payload: Record<string, unknown>): BookingRequest | null {
  const raw = payload.booking_request;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const br = raw as Record<string, unknown>;
  const slotId = asTrimmed(br.slot_id, 160);
  if (!slotId) return null;
  const dateRaw = asTrimmed(br.date || br.date_iso, 32);
  const dateIso = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
  return {
    from: asTrimmed(br.from, 40) || "bookingportal",
    slot_id: slotId,
    service_id: asTrimmed(br.service || br.service_id, 80),
    service_name: asTrimmed(br.service_name, 120),
    venue: asTrimmed(br.venue, 80),
    day: asTrimmed(br.day, 40),
    time: asTrimmed(br.time || br.time_label, 80),
    activity: asTrimmed(br.activity || br.crash_activity, 120),
    booking_mode: asTrimmed(br.booking_mode, 40),
    week_id: asTrimmed(br.week_id, 40),
    block_id: asTrimmed(br.block_id, 40),
    date_iso: dateIso,
    pack: asTrimmed(br.pack || br.pack_label, 80),
  };
}

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
): Promise<number> {
  const leadIds = new Set<string>();
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
      leadIds.add(String(sess.lead_id));
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

  if (!leadIds.size) return 0;

  const nowIso = new Date().toISOString();
  let updated = 0;
  for (const id of leadIds) {
    const { data: lead } = await admin
      .from("portal_booking_leads")
      .select("id, booking_status, registration_status")
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
    const { error } = await admin.from("portal_booking_leads").update(patch).eq("id", id);
    if (error) {
      console.warn("[portal-parent-form-submit] lead status", id, error.message);
    } else {
      updated += 1;
    }
  }
  return updated;
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

  const bookingRequest = extractBookingRequest(payload);
  if (bookingRequest) {
    payload = { ...payload, booking_request: bookingRequest };
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

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = sanitizeFilenamePart(participantName);
  const prefix = `${formType}/${stamp}_${safeName}`;

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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

  try {
    const n = await markBookingLeadsSubmitted(admin, {
      parentEmail,
      parentPhone,
      leadSessionToken: bookingLeadSessionToken,
    });
    if (n) console.log("[portal-parent-form-submit] marked leads submitted", n);
  } catch (leadErr) {
    console.warn("[portal-parent-form-submit] lead status update", leadErr);
  }

  let reservationId: string | null = null;
  if (bookingRequest && formType === "client_registration") {
    try {
      const holdExpires = new Date(Date.now() + SLOT_HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
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
        })
        .select("id")
        .single();

      if (holdErr) {
        console.warn("[portal-parent-form-submit] slot reservation", holdErr.message);
      } else {
        reservationId = holdRow?.id ?? null;
      }
    } catch (holdCatch) {
      console.warn("[portal-parent-form-submit] slot reservation", holdCatch);
    }
  }

  return json(200, {
    ok: true,
    id: row.id,
    submitted_at: row.submitted_at,
    reservation_id: reservationId,
    slot_held: !!reservationId,
  });
});
