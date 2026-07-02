import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const DOCUMENTS_BUCKET = "documents";

type DeleteBody = {
  document_id?: string;
  path?: string;
  bucket?: string;
  source?: string;
};

/** Strip an optional leading bucket prefix / slashes from a stored file_url. */
function storagePathFromFileUrl(fileUrl: string, bucket: string): string {
  let p = String(fileUrl || "").trim();
  if (!p) return "";
  // Full public/signed URLs: take the part after "/object/.../<bucket>/"
  const marker = `/${bucket}/`;
  if (p.includes(marker)) {
    p = p.split(marker).pop() || p;
  } else if (p.includes(`${bucket}/`)) {
    p = p.split(`${bucket}/`).pop() || p;
  }
  return p.replace(/^\/+/, "");
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

  let body: DeleteBody = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const documentId = String(body.document_id || "").trim();
  const rawPath = String(body.path || "").trim();
  const source = String(body.source || "portal").trim().toLowerCase();
  const reqBucket = String(body.bucket || "").trim();

  if (!documentId && !rawPath) {
    return portalAdminJson(400, { ok: false, error: "document_id_or_path_required" });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- Path 1: documents-table row (expense / timesheet) by id ---------------
  if (documentId) {
    const { data: row, error: loadErr } = await admin
      .from("documents")
      .select("id, document_type, title, file_url")
      .eq("id", documentId)
      .maybeSingle();

    if (loadErr) {
      console.error("[portal-admin-document-delete] load", loadErr.message);
      return portalAdminJson(500, { ok: false, error: "document_load_failed" });
    }
    if (!row) {
      return portalAdminJson(404, { ok: false, error: "document_not_found" });
    }

    const storagePath = storagePathFromFileUrl(String(row.file_url || ""), DOCUMENTS_BUCKET);
    if (storagePath) {
      const { error: rmErr } = await admin.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
      if (rmErr) {
        // Storage object may already be gone — log and still remove the row.
        console.warn("[portal-admin-document-delete] storage remove", rmErr.message);
      }
    }

    const { error: delErr } = await admin.from("documents").delete().eq("id", documentId);
    if (delErr) {
      console.error("[portal-admin-document-delete] delete", delErr.message);
      return portalAdminJson(500, { ok: false, error: "document_delete_failed" });
    }

    return portalAdminJson(200, {
      ok: true,
      deleted: "document",
      document_id: documentId,
      document_type: row.document_type || null,
      title: row.title || null,
    });
  }

  // --- Path 2: storage-only file (onboarding) by path ------------------------
  const path = rawPath.replace(/^\/+/, "");
  const useOnboarding = source === "onboarding";

  if (useOnboarding) {
    const obUrl = (Deno.env.get("ONBOARDING_SUPABASE_URL") ?? "").trim();
    const obService = (Deno.env.get("ONBOARDING_SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    if (!obUrl || !obService) {
      return portalAdminJson(503, { ok: false, error: "onboarding_storage_not_configured" });
    }
    const bucket = reqBucket || "club-files";
    const obAdmin = createClient(obUrl, obService, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: rmErr } = await obAdmin.storage.from(bucket).remove([path]);
    if (rmErr) {
      console.error("[portal-admin-document-delete] onboarding remove", rmErr.message);
      return portalAdminJson(500, { ok: false, error: "storage_delete_failed" });
    }
    return portalAdminJson(200, { ok: true, deleted: "storage", bucket, path });
  }

  // Portal storage object without a documents row.
  const bucket = reqBucket || DOCUMENTS_BUCKET;
  const { error: rmErr } = await admin.storage.from(bucket).remove([path]);
  if (rmErr) {
    console.error("[portal-admin-document-delete] portal remove", rmErr.message);
    return portalAdminJson(500, { ok: false, error: "storage_delete_failed" });
  }
  return portalAdminJson(200, { ok: true, deleted: "storage", bucket, path });
});
