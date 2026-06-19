import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const BUCKET = "participant-documents";

type DocRow = {
  id: string;
  form_type: string;
  participant_name: string;
  participant_dob: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  pdf_storage_path: string;
  photo_storage_path: string | null;
  payload_json: Record<string, unknown>;
  status: string;
  submitted_at: string;
  pdf_signed_url: string | null;
  photo_signed_url: string | null;
};

function normalizeName(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: { participant_name?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const participantFilter = String(body.participant_name || "").trim();
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let query = admin
    .from("portal_participant_documents")
    .select(
      "id, form_type, participant_name, participant_dob, parent_name, parent_email, parent_phone, pdf_storage_path, photo_storage_path, payload_json, status, submitted_at",
    )
    .order("submitted_at", { ascending: false })
    .limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("[portal-admin-participant-documents-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  const rows = (data || []) as Omit<DocRow, "pdf_signed_url" | "photo_signed_url">[];
  const filterNorm = participantFilter ? normalizeName(participantFilter) : "";

  const filtered = filterNorm
    ? rows.filter((r) => {
        const pn = normalizeName(r.participant_name);
        if (pn === filterNorm) return true;
        if (pn.includes(filterNorm) || filterNorm.includes(pn)) return true;
        const pnParts = pn.split(" ");
        const fParts = filterNorm.split(" ");
        return pnParts[0] === fParts[0] && (pnParts[1] || "") === (fParts[1] || "");
      })
    : rows;

  const out: DocRow[] = [];
  for (const row of filtered) {
    let pdfSigned: string | null = null;
    let photoSigned: string | null = null;
    if (row.pdf_storage_path) {
      const { data: pdfUrl } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(row.pdf_storage_path, 3600);
      pdfSigned = pdfUrl?.signedUrl ?? null;
    }
    if (row.photo_storage_path) {
      const { data: photoUrl } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(row.photo_storage_path, 3600);
      photoSigned = photoUrl?.signedUrl ?? null;
    }
    out.push({
      ...row,
      pdf_signed_url: pdfSigned,
      photo_signed_url: photoSigned,
    });
  }

  return portalAdminJson(200, {
    ok: true,
    documents: out,
    meta: { count: out.length, filtered: Boolean(filterNorm) },
  });
});
