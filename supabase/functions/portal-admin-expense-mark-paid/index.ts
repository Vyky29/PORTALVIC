import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const documentId = String(body.document_id || "").trim();
  const paid = body.paid !== false;
  if (!documentId) {
    return portalAdminJson(400, { ok: false, error: "document_id_required" });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error: loadErr } = await admin
    .from("documents")
    .select("id, document_type, title, expense_admin_paid_at")
    .eq("id", documentId)
    .maybeSingle();

  if (loadErr) {
    console.error("[portal-admin-expense-mark-paid] load", loadErr.message);
    return portalAdminJson(500, { ok: false, error: "document_load_failed" });
  }
  if (!row || String(row.document_type || "") !== "expense") {
    return portalAdminJson(404, { ok: false, error: "expense_not_found" });
  }

  const patch = paid
    ? {
        expense_admin_paid_at: new Date().toISOString(),
        expense_admin_paid_by: verified.userId || null,
      }
    : {
        expense_admin_paid_at: null,
        expense_admin_paid_by: null,
      };

  const { error: updErr } = await admin.from("documents").update(patch).eq("id", documentId);
  if (updErr) {
    console.error("[portal-admin-expense-mark-paid] update", updErr.message);
    return portalAdminJson(500, { ok: false, error: "document_update_failed" });
  }

  return portalAdminJson(200, {
    ok: true,
    document_id: documentId,
    paid,
    expense_admin_paid_at: paid ? patch.expense_admin_paid_at : null,
    title: row.title,
  });
});
