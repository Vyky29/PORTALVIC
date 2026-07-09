// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-absence-decide
// Admin validates proof: approve (excused + outcome) or reject.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

const OUTCOMES = new Set(["credit", "refund", "makeup", "none"]);

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
    report_id?: string;
    action?: string;
    outcome?: string;
    notes?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const reportId = clean(body.report_id, 60);
  const action = clean(body.action, 20).toLowerCase();
  const outcome = clean(body.outcome, 20).toLowerCase() || "none";
  const notes = clean(body.notes, 800);

  if (!reportId) return portalAdminJson(400, { ok: false, error: "report_id_required" });
  if (action !== "approve" && action !== "reject") {
    return portalAdminJson(400, { ok: false, error: "action_required" });
  }
  if (action === "approve" && !OUTCOMES.has(outcome)) {
    return portalAdminJson(400, { ok: false, error: "outcome_required" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: report, error: loadErr } = await admin
    .from("portal_parent_absence_reports")
    .select("id, status, proof_storage_path")
    .eq("id", reportId)
    .maybeSingle();

  if (loadErr || !report) {
    return portalAdminJson(404, { ok: false, error: "not_found" });
  }

  if (report.status !== "pending_review" && report.status !== "missed") {
    return portalAdminJson(409, { ok: false, error: "not_reviewable", status: report.status });
  }

  if (action === "approve" && !report.proof_storage_path) {
    return portalAdminJson(400, {
      ok: false,
      error: "proof_required",
      message: "Cannot excuse without uploaded proof. Ask the family to upload within the 2-week window.",
    });
  }

  const now = new Date().toISOString();
  const patch =
    action === "approve"
      ? {
          status: "excused",
          outcome,
          outcome_notes: notes || null,
          review_notes: notes || null,
          reviewed_at: now,
          reviewed_by: verified.userId || null,
          updated_at: now,
        }
      : {
          status: "rejected",
          outcome: null,
          outcome_notes: null,
          review_notes: notes || "Proof not accepted",
          reviewed_at: now,
          reviewed_by: verified.userId || null,
          updated_at: now,
        };

  const { data: updated, error: updErr } = await admin
    .from("portal_parent_absence_reports")
    .update(patch)
    .eq("id", reportId)
    .select(
      "id, status, outcome, outcome_notes, review_notes, reviewed_at, participant_display, session_date, service_label",
    )
    .maybeSingle();

  if (updErr || !updated) {
    console.error("[portal-admin-parent-absence-decide]", updErr?.message);
    return portalAdminJson(500, { ok: false, error: "update_failed" });
  }

  return portalAdminJson(200, { ok: true, report: updated });
});
