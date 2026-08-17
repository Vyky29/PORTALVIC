// @ts-nocheck — Edge Function (Deno).
//
// portal-booking-existing-confirm
// --------------------------------
// Existing / returning clients: confirm a Booking Portal place without the
// full registration questionnaire. Optional photo when none is on file.
//
// POST JSON { action: "load" } + header x-booking-lead-session
 // POST multipart action=submit (+ photo optional) + x-booking-lead-session
//
// Deploy:
//   npx supabase functions deploy portal-booking-existing-confirm --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  bookingLeadCorsHeaders,
  bookingLeadJson,
  sha256Hex,
} from "../_shared/booking_lead_auth.ts";
import { notifyOfficeRegistrationSubmitted } from "../_shared/portal_booking_lead_office_notify.ts";
import { saveParticipantAvatarWithArchive } from "../_shared/participant_avatar.ts";

const SLOT_HOLD_DAYS = 21;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const BUCKET = "participant-documents";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function emailNorm(v: unknown): string {
  return clean(v, 200).toLowerCase();
}

function phoneLast10(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "").slice(-10);
}

function escapePdfText(s: string): string {
  return String(s || "").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Minimal single-page PDF so Documents still has an Open PDF target. */
function buildStubPdf(lines: string[]): Uint8Array {
  const contentLines = lines.slice(0, 28).map((line, i) => {
    const y = 780 - i * 16;
    return `BT /F1 11 Tf 48 ${y} Td (${escapePdfText(line)}) Tj ET`;
  });
  const stream = contentLines.join("\n");
  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
  );
  objects.push(
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`,
  );
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(body.length);
    body += obj;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

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
  booking_kind: "trial" | "term";
};

function parseBookingRequest(raw: Record<string, unknown> | null): BookingRequest | null {
  if (!raw) return null;
  const slotId = clean(raw.slot_id, 160);
  if (!slotId) return null;
  const dateRaw = clean(raw.date || raw.date_iso, 32);
  const dateIso = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null;
  const kindRaw = clean(raw.booking_kind, 40).toLowerCase();
  const bookingKind =
    kindRaw === "trial" || kindRaw === "trial_session" || kindRaw === "taster"
      ? "trial"
      : "term";
  return {
    from: clean(raw.from, 40) || "bookingportal",
    slot_id: slotId,
    service_id: clean(raw.service || raw.service_id, 80) || null,
    service_name: clean(raw.service_name, 120) || null,
    venue: clean(raw.venue, 80) || null,
    day: clean(raw.day, 40) || null,
    time: clean(raw.time || raw.time_label, 80) || null,
    activity: clean(raw.activity || raw.crash_activity, 120) || null,
    booking_mode: clean(raw.booking_mode, 40) || null,
    week_id: clean(raw.week_id, 40) || null,
    block_id: clean(raw.block_id, 40) || null,
    date_iso: dateIso,
    pack: clean(raw.pack, 80) || null,
    booking_kind: bookingKind,
  };
}

async function loadLeadSession(
  admin: ReturnType<typeof createClient>,
  token: string,
) {
  const tokenHash = await sha256Hex(token);
  const { data: sess } = await admin
    .from("portal_booking_lead_sessions")
    .select("id, lead_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!sess || sess.revoked_at || new Date(String(sess.expires_at)).getTime() < Date.now()) {
    return null;
  }
  const { data: lead } = await admin
    .from("portal_booking_leads")
    .select(
      "id, parent_name, email, mobile, client_status, booking_status, registration_status, email_norm",
    )
    .eq("id", sess.lead_id)
    .maybeSingle();
  if (!lead) return null;
  return { sess, lead };
}

async function childrenForLeadEmail(
  admin: ReturnType<typeof createClient>,
  email: string,
  mobile: string,
) {
  const en = emailNorm(email);
  const phone = phoneLast10(mobile);
  let rows: Array<Record<string, unknown>> = [];
  if (en) {
    const { data } = await admin
      .from("portal_parent_contacts")
      .select(
        "contact_id, child_display, child_first_name, child_last_name, parent_display, email, mobile, dob_iso, in_class",
      )
      .eq("email_norm", en)
      .limit(20);
    rows = data || [];
  }
  if (!rows.length && phone.length >= 10) {
    const { data } = await admin
      .from("portal_parent_contacts")
      .select(
        "contact_id, child_display, child_first_name, child_last_name, parent_display, email, mobile, dob_iso, in_class",
      )
      .eq("phone_lookup", phone)
      .limit(20);
    rows = data || [];
  }
  const ids = rows.map((r) => String(r.contact_id || "")).filter(Boolean);
  const { data: parts } = ids.length
    ? await admin
      .from("portal_participants")
      .select("contact_id, display_name, avatar_storage_path, in_class")
      .in("contact_id", ids)
    : { data: [] as Array<Record<string, unknown>> };
  const byId = new Map(
    (parts || []).map((p) => [String(p.contact_id || ""), p]),
  );
  return rows.map((r) => {
    const cid = String(r.contact_id || "");
    const p = byId.get(cid);
    const name =
      clean(p?.display_name, 120) ||
      clean(r.child_display, 120) ||
      [r.child_first_name, r.child_last_name].filter(Boolean).join(" ") ||
      "Participant";
    const hasPhoto = !!clean(p?.avatar_storage_path, 200);
    return {
      contact_id: cid,
      display_name: name,
      dob_iso: r.dob_iso ? String(r.dob_iso).slice(0, 10) : null,
      in_class: p?.in_class !== false && r.in_class !== false,
      has_photo: hasPhoto,
      parent_display: clean(r.parent_display, 120) || null,
    };
  }).filter((c) => c.contact_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: bookingLeadCorsHeaders });
  }
  if (req.method !== "POST") {
    return bookingLeadJson({ ok: false, error: "method_not_allowed" }, 405);
  }

  const token = String(req.headers.get("x-booking-lead-session") || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    return bookingLeadJson({ ok: false, error: "unauthorized" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) {
    return bookingLeadJson({ ok: false, error: "server_misconfigured" }, 503);
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await loadLeadSession(admin, token);
  if (!session) return bookingLeadJson({ ok: false, error: "unauthorized" }, 401);
  const { lead } = session;

  const clientStatus = String(lead.client_status || "").toLowerCase();
  const isExisting =
    clientStatus === "active_client" || clientStatus === "registered";

  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  let action = "load";
  let form: FormData | null = null;
  let jsonBody: Record<string, unknown> = {};

  if (contentType.includes("multipart/form-data")) {
    try {
      form = await req.formData();
      action = clean(form.get("action"), 40).toLowerCase() || "submit";
    } catch {
      return bookingLeadJson({ ok: false, error: "bad_form" }, 400);
    }
  } else {
    try {
      jsonBody = await req.json();
    } catch {
      jsonBody = {};
    }
    action = clean(jsonBody.action, 40).toLowerCase() || "load";
  }

  if (action === "load") {
    if (!isExisting) {
      return bookingLeadJson({
        ok: false,
        error: "not_existing_client",
        hint: "Use the full registration form for new families.",
      }, 403);
    }
    const children = await childrenForLeadEmail(
      admin,
      String(lead.email || ""),
      String(lead.mobile || ""),
    );
    if (!children.length) {
      return bookingLeadJson({
        ok: false,
        error: "no_children_on_file",
        hint: "We could not match your family record. Please use the full registration form or contact the office.",
      }, 404);
    }
    return bookingLeadJson({
      ok: true,
      existing_client: true,
      parent_name: lead.parent_name,
      email: lead.email,
      mobile: lead.mobile,
      children,
    });
  }

  if (action !== "submit") {
    return bookingLeadJson({ ok: false, error: "action_unsupported" }, 400);
  }
  if (!isExisting) {
    return bookingLeadJson({ ok: false, error: "not_existing_client" }, 403);
  }
  if (!form) {
    return bookingLeadJson({ ok: false, error: "multipart_required" }, 400);
  }

  const children = await childrenForLeadEmail(
    admin,
    String(lead.email || ""),
    String(lead.mobile || ""),
  );
  const contactId = clean(form.get("contact_id"), 40);
  const child = children.find((c) => c.contact_id === contactId);
  if (!child) {
    return bookingLeadJson({ ok: false, error: "contact_not_found" }, 404);
  }

  let bookingRaw: Record<string, unknown> = {};
  try {
    bookingRaw = JSON.parse(String(form.get("booking_request") || "{}"));
  } catch {
    bookingRaw = {};
  }
  const bookingRequest = parseBookingRequest(bookingRaw);
  if (!bookingRequest) {
    return bookingLeadJson({ ok: false, error: "slot_required" }, 400);
  }

  const photoFile = form.get("photo");
  const hasPhotoFile =
    photoFile && typeof photoFile === "object" && typeof (photoFile as File).arrayBuffer === "function";
  if (!child.has_photo && !hasPhotoFile) {
    return bookingLeadJson({ ok: false, error: "photo_required" }, 400);
  }

  let photoBytes: Uint8Array | null = null;
  let photoContentType = "image/jpeg";
  if (hasPhotoFile) {
    const file = photoFile as File;
    photoContentType = String(file.type || "image/jpeg").toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(photoContentType)) {
      return bookingLeadJson({ ok: false, error: "invalid_photo_type" }, 400);
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf.byteLength < 32) {
      return bookingLeadJson({ ok: false, error: "photo_empty" }, 400);
    }
    if (buf.byteLength > MAX_PHOTO_BYTES) {
      return bookingLeadJson({ ok: false, error: "photo_too_large" }, 400);
    }
    photoBytes = buf;
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const safeName = child.display_name.replace(/[^\w\- ]+/g, "").replace(/\s+/g, "_") || "Participant";
  const folder = `client_registration/${stamp}_${safeName}`;

  if (photoBytes) {
    try {
      await saveParticipantAvatarWithArchive(
        admin,
        child.contact_id,
        photoBytes,
        photoContentType,
        "booking_existing_confirm",
      );
    } catch (avatarErr) {
      console.warn("[portal-booking-existing-confirm] avatar", avatarErr);
    }
  }

  const pdfBytes = buildStubPdf([
    "clubSENsational — Existing client place request",
    `Submitted: ${now.toLocaleString("en-GB")}`,
    "",
    "Full registration questionnaire skipped — details already on file.",
    "",
    `Participant: ${child.display_name}`,
    `Contact id: ${child.contact_id}`,
    `Parent: ${lead.parent_name || "—"}`,
    `Email: ${lead.email || "—"}`,
    `Phone: ${lead.mobile || "—"}`,
    "",
    `Requested: ${[
      bookingRequest.service_name,
      bookingRequest.venue,
      bookingRequest.day,
      bookingRequest.time,
      bookingRequest.booking_kind === "trial" ? "TRIAL" : "TERM",
    ]
      .filter(Boolean)
      .join(" · ")}`,
    `Slot id: ${bookingRequest.slot_id}`,
    "",
    photoBytes ? "Photo: updated with this request." : "Photo: already on file.",
    "",
    "Next: Admin → Documents → Registration forms → Accept.",
  ]);

  const pdfPath = `${folder}/form.pdf`;
  const { error: pdfUpErr } = await admin.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (pdfUpErr) {
    console.error("[portal-booking-existing-confirm] pdf upload", pdfUpErr.message);
    return bookingLeadJson({ ok: false, error: "pdf_upload_failed" }, 500);
  }

  let photoPath: string | null = null;
  if (photoBytes) {
    photoPath = `${folder}/photo.jpg`;
    const { error: photoUpErr } = await admin.storage.from(BUCKET).upload(photoPath, photoBytes, {
      contentType: photoContentType.startsWith("image/") ? photoContentType : "image/jpeg",
      upsert: false,
    });
    if (photoUpErr) {
      console.warn("[portal-booking-existing-confirm] photo upload", photoUpErr.message);
      photoPath = null;
    }
  }

  const payload = {
    existing_client_confirm: true,
    contact_id: child.contact_id,
    booking_request: bookingRequest,
    note: "Existing client confirmed a place via Booking Portal (no full questionnaire).",
  };

  const { data: docRow, error: docErr } = await admin
    .from("portal_participant_documents")
    .insert({
      form_type: "client_registration",
      participant_name: child.display_name,
      participant_dob: child.dob_iso,
      parent_name: clean(lead.parent_name, 120) || null,
      parent_email: clean(lead.email, 200) || null,
      parent_phone: clean(lead.mobile, 40) || null,
      pdf_storage_path: pdfPath,
      photo_storage_path: photoPath,
      payload_json: payload,
      status: "new",
    })
    .select("id")
    .single();
  if (docErr || !docRow?.id) {
    console.error("[portal-booking-existing-confirm] doc", docErr?.message);
    return bookingLeadJson({ ok: false, error: "save_failed" }, 500);
  }

  const holdExpires = new Date(Date.now() + SLOT_HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const tokenHash = await sha256Hex(token);
  const parentEmail = clean(lead.email, 200);
  if (parentEmail) {
    await admin
      .from("portal_booking_slot_reservations")
      .update({
        status: "released",
        released_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        notes: "superseded_by_existing_client_confirm",
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
      document_id: docRow.id,
      participant_name: child.display_name,
      parent_name: clean(lead.parent_name, 120) || null,
      parent_email: parentEmail || null,
      parent_phone: clean(lead.mobile, 40) || null,
      booking_session_token_hash: tokenHash,
      status: "pending",
      hold_expires_at: holdExpires,
      notes:
        (bookingRequest.booking_kind === "trial"
          ? "booking_kind=trial|"
          : "booking_kind=term|") + "existing_client_confirm",
    })
    .select("id")
    .single();
  if (holdErr) {
    console.warn("[portal-booking-existing-confirm] hold", holdErr.message);
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("portal_booking_leads")
    .update({
      booking_status: "registration_submitted",
      registration_status: "submitted",
      client_status: "active_client",
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", lead.id);

  const bookingSummary = [
    bookingRequest.service_name,
    bookingRequest.venue,
    bookingRequest.day,
    bookingRequest.time,
    bookingRequest.booking_kind === "trial" ? "TRIAL" : null,
    "EXISTING CLIENT",
  ]
    .filter(Boolean)
    .join(" · ");

  try {
    await notifyOfficeRegistrationSubmitted({
      documentId: String(docRow.id),
      formType: "client_registration",
      participantName: child.display_name,
      parentName: clean(lead.parent_name, 120) || null,
      parentEmail: parentEmail || null,
      parentPhone: clean(lead.mobile, 40) || null,
      leadId: String(lead.id),
      slotHeld: !!holdRow?.id,
      bookingSummary,
      pdfBytes,
      pdfFilename: `ExistingClient_${safeName}.pdf`,
    });
  } catch (notifyErr) {
    console.warn("[portal-booking-existing-confirm] notify", notifyErr);
  }

  return bookingLeadJson({
    ok: true,
    document_id: docRow.id,
    reservation_id: holdRow?.id || null,
    slot_held: !!holdRow?.id,
    contact_id: child.contact_id,
    participant_name: child.display_name,
    photo_updated: !!photoBytes,
  });
});
