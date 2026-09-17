// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-absence-list
// Admin queue: parent Absent reports + cancelled sessions + signed proof URLs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const BUCKET = "parent-absence-proofs";
const DEFAULT_SINCE = "2026-09-01";

function todayIsoLondon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
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

  let body: {
    status?: string;
    limit?: number;
    since?: string;
    case_kind?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const statusFilter = String(body.status || "").trim().toLowerCase();
  const caseKindFilter = String(body.case_kind || "").trim().toLowerCase();
  const sinceRaw = String(body.since || DEFAULT_SINCE).trim();
  const since = isIsoDate(sinceRaw) ? sinceRaw : DEFAULT_SINCE;
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 400);
  const today = todayIsoLondon();

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Expire only parent proof windows (absence + no schedule override link).
  // Office / Schedule decision rows must stay open until decided.
  await admin
    .from("portal_parent_absence_reports")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("case_kind", "absence")
    .in("status", ["missed", "pending_review"])
    .is("schedule_override_id", null)
    .lt("proof_deadline", today);

  let query = admin
    .from("portal_parent_absence_reports")
    .select(
      "id, parent_person_id, contact_id, participant_display, session_date, service_label, session_time, status, case_kind, reason_code, reason_text, proof_storage_path, proof_file_name, proof_mime, proof_uploaded_at, proof_deadline, reviewed_at, review_notes, outcome, outcome_notes, schedule_override_id, created_at, updated_at",
    )
    .gte("session_date", since)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (caseKindFilter === "absence" || caseKindFilter === "cancellation") {
    query = query.eq("case_kind", caseKindFilter);
  }

  if (statusFilter === "needs_decision" || statusFilter === "open" || !statusFilter) {
    query = query.in("status", ["pending_review", "missed"]);
  } else if (statusFilter && statusFilter !== "all") {
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
  const cancellations = reports.filter((r) => r.case_kind === "cancellation").length;
  const absences = reports.filter((r) => r.case_kind !== "cancellation").length;

  return portalAdminJson(200, {
    ok: true,
    reports,
    meta: {
      pending_review: pending,
      missed_open: missedOpen,
      cancellations,
      absences,
      since,
      today,
      total: reports.length,
    },
  });
});
