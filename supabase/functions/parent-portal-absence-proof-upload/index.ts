// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-absence-proof-upload
// Multipart: report_id + file. Only within proof_deadline; always goes to pending_review (admin must validate).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

const BUCKET = "parent-absence-proofs";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

function todayIsoLondon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function extFor(mime: string, name: string): string {
  const m = mime.toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("png")) return "png";
  if (m.includes("webp")) return "webp";
  if (m.includes("heic") || m.includes("heif")) return "heic";
  const fromName = String(name || "").split(".").pop()?.toLowerCase() || "";
  if (["pdf", "png", "jpg", "jpeg", "webp", "heic"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  return "jpg";
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { ok: false, error: "bad_form" });
  }

  const reportId = clean(form.get("report_id"), 60);
  if (!reportId) return json(400, { ok: false, error: "report_id_required" });

  const file = form.get("file");
  if (!(file instanceof File) || !file.size) {
    return json(400, { ok: false, error: "missing_file" });
  }
  if (file.size > MAX_BYTES) return json(413, { ok: false, error: "file_too_large" });

  const mime = String(file.type || "application/octet-stream").toLowerCase();
  if (mime && !ALLOWED.has(mime) && !mime.startsWith("image/")) {
    return json(400, { ok: false, error: "invalid_file_type" });
  }

  const { data: report, error: loadErr } = await supabase
    .from("portal_parent_absence_reports")
    .select(
      "id, parent_person_id, contact_id, status, proof_deadline, proof_storage_path",
    )
    .eq("id", reportId)
    .eq("parent_person_id", session.parent_person_id)
    .maybeSingle();

  if (loadErr || !report) {
    return json(404, { ok: false, error: "not_found" });
  }

  const today = todayIsoLondon();
  const deadline = String(report.proof_deadline || "");
  if (!deadline || deadline < today) {
    if (report.status === "missed" || report.status === "pending_review") {
      await supabase
        .from("portal_parent_absence_reports")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", reportId);
    }
    return json(403, {
      ok: false,
      error: "proof_window_closed",
      message:
        "The 2-week window to upload proof has passed. Please contact the office/admin.",
    });
  }

  if (report.status === "excused" || report.status === "expired" || report.status === "noted") {
    return json(403, { ok: false, error: "upload_not_allowed" });
  }

  const ext = extFor(mime, file.name || "");
  const path = `${session.parent_person_id}/${report.contact_id}/${reportId}/${Date.now()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime || "application/octet-stream",
    upsert: false,
  });
  if (upErr) {
    console.error("[parent-portal-absence-proof-upload]", upErr.message);
    return json(500, { ok: false, error: "upload_failed" });
  }

  if (report.proof_storage_path) {
    try {
      await supabase.storage.from(BUCKET).remove([report.proof_storage_path]);
    } catch (_) {
      /* ignore */
    }
  }

  const now = new Date().toISOString();
  const { data: updated, error: updErr } = await supabase
    .from("portal_parent_absence_reports")
    .update({
      status: "pending_review",
      proof_storage_path: path,
      proof_file_name: clean(file.name || `proof.${ext}`, 180),
      proof_mime: mime || null,
      proof_uploaded_at: now,
      updated_at: now,
      reviewed_at: null,
      reviewed_by: null,
      review_notes: null,
      outcome: null,
      outcome_notes: null,
    })
    .eq("id", reportId)
    .select(
      "id, status, proof_file_name, proof_uploaded_at, proof_deadline, session_date, service_label",
    )
    .maybeSingle();

  if (updErr || !updated) {
    console.error("[parent-portal-absence-proof-upload] update", updErr?.message);
    await supabase.storage.from(BUCKET).remove([path]);
    return json(500, { ok: false, error: "save_failed" });
  }

  return json(200, {
    ok: true,
    report: {
      ...updated,
      can_upload_proof: true,
    },
    message: "Proof uploaded. The office will review it — validation is always required.",
  });
});
