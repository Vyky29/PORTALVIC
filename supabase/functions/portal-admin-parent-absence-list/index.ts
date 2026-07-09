// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-absence-list
// Admin queue: parent Absent reports + signed proof URLs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const BUCKET = "parent-absence-proofs";

function todayIsoLondon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
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

  let body: { status?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const statusFilter = String(body.status || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 300);
  const today = todayIsoLondon();

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Expire open windows past deadline.
  await admin
    .from("portal_parent_absence_reports")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .in("status", ["missed", "pending_review"])
    .lt("proof_deadline", today);

  let query = admin
    .from("portal_parent_absence_reports")
    .select(
      "id, parent_person_id, contact_id, participant_display, session_date, service_label, session_time, status, reason_code, reason_text, proof_storage_path, proof_file_name, proof_mime, proof_uploaded_at, proof_deadline, reviewed_at, review_notes, outcome, outcome_notes, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[portal-admin-parent-absence-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "query_failed" });
  }

  const reports = [];
  for (const r of data || []) {
    let proof_signed_url: string | null = null;
    if (r.proof_storage_path) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(r.proof_storage_path, 60 * 30);
      proof_signed_url = signed?.signedUrl || null;
    }
    reports.push({ ...r, proof_signed_url });
  }

  const pending = reports.filter((r) => r.status === "pending_review").length;
  const missedOpen = reports.filter((r) => r.status === "missed").length;

  return portalAdminJson(200, {
    ok: true,
    reports,
    meta: { pending_review: pending, missed_open: missedOpen, today },
  });
});
