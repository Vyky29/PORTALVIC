import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const DOCUMENTS_BUCKET = "documents";

type TimesheetRow = {
  id: string;
  name: string;
  path: string;
  bucket: string;
  storage_bucket: string;
  created_at: string | null;
  uploaded_at: string | null;
  size: number | null;
  source: string;
};

function mapDocumentToTimesheet(row: Record<string, unknown>): TimesheetRow {
  const title = String(row.title || "Timesheet");
  const fileUrl = String(row.file_url || "");
  const path = fileUrl.includes("/")
    ? fileUrl.split(`${DOCUMENTS_BUCKET}/`).pop() || fileUrl
    : fileUrl;
  const created = row.created_at ? String(row.created_at) : null;
  return {
    id: String(row.id || ""),
    name: title,
    path,
    bucket: DOCUMENTS_BUCKET,
    storage_bucket: DOCUMENTS_BUCKET,
    created_at: created,
    uploaded_at: created,
    size: null,
    source: "portal",
  };
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

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("documents")
    .select("id, title, file_url, created_at, document_type, category, user_id")
    .eq("document_type", "timesheet")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[portal-admin-hr-files-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "documents_query_failed" });
  }

  const timesheets = (data || []).map((row) =>
    mapDocumentToTimesheet(row as Record<string, unknown>)
  );

  return portalAdminJson(200, {
    ok: true,
    timesheets,
    meta: { count: timesheets.length, source: "documents" },
  });
});
