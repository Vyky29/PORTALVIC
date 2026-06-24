// portal-parent-form-submit — public parent forms (climbing + client registration).
// POST multipart/form-data: form_type, participant_name, pdf (required), photo (optional), payload (JSON string), parent_* fields.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { syncParentFormPhotoToParticipantAvatar } from "../_shared/participant_avatar.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  const parentName = sanitizePart(String(form.get("parent_name") || ""), 200) || null;
  const parentEmail = sanitizePart(String(form.get("parent_email") || ""), 200) || null;
  const parentPhone = sanitizePart(String(form.get("parent_phone") || ""), 80) || null;
  const participantDob = parseDob(String(form.get("participant_dob") || ""));

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

  return json(200, {
    ok: true,
    id: row.id,
    submitted_at: row.submitted_at,
  });
});
