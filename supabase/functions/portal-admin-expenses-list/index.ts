import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

type ExpenseRow = {
  id: string;
  title: string;
  name: string;
  file_url: string;
  path: string;
  created_at: string | null;
  category: string | null;
  related_date: string | null;
  expense_admin_paid_at: string | null;
  is_paid: boolean;
};

function mapDocumentToExpense(row: Record<string, unknown>): ExpenseRow {
  const title = String(row.title || "Expense report");
  const fileUrl = String(row.file_url || "");
  const created = row.created_at ? String(row.created_at) : null;
  const paidAt = row.expense_admin_paid_at ? String(row.expense_admin_paid_at) : null;
  return {
    id: String(row.id || ""),
    title,
    name: title,
    file_url: fileUrl,
    path: fileUrl,
    created_at: created,
    category: row.category ? String(row.category) : null,
    related_date: row.related_date ? String(row.related_date) : null,
    expense_admin_paid_at: paidAt,
    is_paid: !!paidAt,
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

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }

  const unpaidSince = String(body.unpaid_since || "2026-04-01").trim();

  const { data, error } = await admin
    .from("documents")
    .select(
      "id, title, file_url, created_at, category, related_date, document_type, expense_admin_paid_at",
    )
    .eq("document_type", "expense")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[portal-admin-expenses-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "documents_query_failed" });
  }

  const expenses = (data || []).map((row) =>
    mapDocumentToExpense(row as Record<string, unknown>)
  );
  const unpaid = expenses.filter((row) => {
    if (row.is_paid) return false;
    const created = String(row.created_at || "").slice(0, 10);
    const related = String(row.related_date || "").slice(0, 10);
    const anchor = related || created;
    return !unpaidSince || !anchor || anchor >= unpaidSince;
  });

  return portalAdminJson(200, {
    ok: true,
    expenses,
    unpaid,
    meta: {
      count: expenses.length,
      unpaid_count: unpaid.length,
      unpaid_since: unpaidSince,
      source: "documents",
    },
  });
});
