// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-absence-decide
// Admin validates proof: approve (excused + outcome) or reject.
// Also: grant_makeup on missed/expired (no proof) → creates makeup grant (venue required).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { autoApplyOpenCreditToNextInvoices } from "../_shared/portal_family_credit_apply.ts";
import { notifyParentAbsenceOutcome } from "../_shared/portal_absence_outcome_notify.ts";

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
    preferred_venue?: string;
    amount_gbp?: number | string | null;
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
  const preferredVenue = clean(body.preferred_venue, 80);
  let amountGbp: number | null = null;
  if (body.amount_gbp != null && body.amount_gbp !== "") {
    const n = Number(body.amount_gbp);
    if (!Number.isFinite(n) || n < 0) {
      return portalAdminJson(400, { ok: false, error: "amount_invalid" });
    }
    amountGbp = Math.round(n * 100) / 100;
  }

  if (!reportId) return portalAdminJson(400, { ok: false, error: "report_id_required" });
  if (!["approve", "reject", "grant_makeup"].includes(action)) {
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
    .select("*")
    .eq("id", reportId)
    .maybeSingle();

  if (loadErr || !report) {
    return portalAdminJson(404, { ok: false, error: "not_found" });
  }

  const now = new Date().toISOString();

  if (action === "grant_makeup") {
    if (!["missed", "expired", "rejected"].includes(String(report.status))) {
      return portalAdminJson(409, {
        ok: false,
        error: "not_eligible",
        message: "Makeup grants are for missed / expired / rejected (no valid proof) cases.",
      });
    }
    if (!preferredVenue) {
      return portalAdminJson(400, {
        ok: false,
        error: "preferred_venue_required",
        message: "Set the venue — offers are by centre so families are not asked to travel.",
      });
    }
    const source = report.status === "expired" ? "expired_window" : "no_proof";
    const { data: existing } = await admin
      .from("portal_parent_makeup_grants")
      .select("id, status")
      .eq("absence_report_id", reportId)
      .maybeSingle();
    if (existing) {
      return portalAdminJson(200, { ok: true, grant: existing, already: true });
    }
    const { data: grant, error: gErr } = await admin
      .from("portal_parent_makeup_grants")
      .insert({
        parent_person_id: report.parent_person_id,
        contact_id: report.contact_id,
        participant_display: report.participant_display || "",
        absence_report_id: reportId,
        preferred_venue: preferredVenue,
        service_label: report.service_label || "",
        status: "open",
        source,
        notes: notes || null,
        created_by: verified.userId || null,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();
    if (gErr) {
      console.error("[portal-admin-parent-absence-decide] grant", gErr.message);
      return portalAdminJson(500, { ok: false, error: "grant_failed" });
    }
    await admin
      .from("portal_parent_absence_reports")
      .update({
        outcome: "makeup",
        outcome_notes: notes || "Makeup grant issued (no valid proof path)",
        updated_at: now,
      })
      .eq("id", reportId);
    return portalAdminJson(200, { ok: true, grant, report_id: reportId });
  }

  if (report.status !== "pending_review" && report.status !== "missed") {
    return portalAdminJson(409, { ok: false, error: "not_reviewable", status: report.status });
  }

  const caseKind = clean(report.case_kind, 20).toLowerCase() || "absence";
  const isCancellationCase = caseKind === "cancellation";
  const fromSchedule = !!clean(report.schedule_override_id, 60);
  // Parent proof absences need a file. Schedule / office / cancellation rows
  // are already on the board — office may decide credit/refund/makeup/none without proof.
  const mayDecideWithoutProof = isCancellationCase || fromSchedule;
  if (action === "approve" && !report.proof_storage_path && !mayDecideWithoutProof) {
    return portalAdminJson(400, {
      ok: false,
      error: "proof_required",
      message:
        "Cannot excuse without uploaded proof. For no-proof makeups use Grant makeup instead.",
    });
  }

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
      "id, status, outcome, outcome_notes, review_notes, reviewed_at, participant_display, session_date, service_label, parent_person_id, contact_id",
    )
    .maybeSingle();

  if (updErr || !updated) {
    console.error("[portal-admin-parent-absence-decide]", updErr?.message);
    return portalAdminJson(500, { ok: false, error: "update_failed" });
  }

  // If excused with makeup outcome + venue, also open a grant so ops can offer a slot.
  let grant = null;
  if (action === "approve" && outcome === "makeup" && preferredVenue) {
    const { data: g } = await admin
      .from("portal_parent_makeup_grants")
      .insert({
        parent_person_id: updated.parent_person_id,
        contact_id: updated.contact_id,
        participant_display: updated.participant_display || "",
        absence_report_id: reportId,
        preferred_venue: preferredVenue,
        service_label: updated.service_label || "",
        status: "open",
        source: "excused_makeup",
        notes: notes || null,
        created_by: verified.userId || null,
        updated_at: now,
      })
      .select("*")
      .maybeSingle();
    grant = g;
  }

  // Credit / refund → family-visible ledger row (phase 1: internal, no Stripe).
  let credit = null;
  let credit_apply = null;
  let parent_notify = null;
  if (action === "approve" && (outcome === "credit" || outcome === "refund")) {
    const creditSource = isCancellationCase ? "club_cancellation" : "excused_absence";
    const { data: existingCredit } = await admin
      .from("portal_parent_family_credits")
      .select("id, kind, status, amount_gbp")
      .eq("absence_report_id", reportId)
      .eq("kind", outcome)
      .maybeSingle();
    if (existingCredit) {
      credit = existingCredit;
    } else {
      const { data: c, error: cErr } = await admin
        .from("portal_parent_family_credits")
        .insert({
          parent_person_id: updated.parent_person_id,
          contact_id: updated.contact_id,
          participant_display: updated.participant_display || "",
          absence_report_id: reportId,
          kind: outcome,
          status: "open",
          amount_gbp: amountGbp,
          service_label: updated.service_label || "",
          session_date: updated.session_date || null,
          notes: notes || null,
          source: creditSource,
          created_by: verified.userId || null,
          updated_at: now,
        })
        .select("*")
        .maybeSingle();
      if (cErr) {
        console.error("[portal-admin-parent-absence-decide] credit", cErr.message);
      } else {
        credit = c;
      }
    }
    // Office-issued credit: auto-apply to next INV-P (hidden OK; skip GoCardless monthly).
    if (outcome === "credit" && credit && credit.id) {
      try {
        credit_apply = await autoApplyOpenCreditToNextInvoices(admin, credit.id);
        if (credit_apply?.final_credit_status) {
          const { data: refreshed } = await admin
            .from("portal_parent_family_credits")
            .select("*")
            .eq("id", credit.id)
            .maybeSingle();
          if (refreshed) credit = refreshed;
        }
      } catch (err) {
        console.error("[portal-admin-parent-absence-decide] auto-apply", err);
        credit_apply = { ok: false, error: "auto_apply_failed" };
      }
    }

    // Proactive parent avisos for credit / refund only (not makeup).
    try {
      let invoiceNumber: string | null = null;
      const applied = (credit_apply?.applications || []).find((a: { ok?: boolean; invoice_id?: string }) => a && a.ok);
      if (applied?.invoice_id) {
        const { data: invRow } = await admin
          .from("portal_parent_invoice_share")
          .select("invoice_number")
          .eq("id", applied.invoice_id)
          .maybeSingle();
        invoiceNumber = invRow?.invoice_number ? String(invRow.invoice_number) : null;
      }
      const notifyAmount =
        amountGbp != null
          ? amountGbp
          : credit?.amount_gbp != null
            ? Number(credit.amount_gbp)
            : null;
      parent_notify = await notifyParentAbsenceOutcome(admin, {
        outcome: outcome === "refund" ? "refund" : "credit",
        report: {
          id: updated.id,
          parent_person_id: updated.parent_person_id,
          contact_id: updated.contact_id,
          participant_display: updated.participant_display,
          service_label: updated.service_label,
          session_date: updated.session_date,
          session_time: report.session_time,
        },
        amountGbp: notifyAmount,
        creditApply: credit_apply,
        invoiceNumber,
        actorEmail: verified.email || null,
      });
    } catch (err) {
      console.error("[portal-admin-parent-absence-decide] parent_notify", err);
      parent_notify = { ok: false, error: "notify_failed" };
    }
  }

  return portalAdminJson(200, {
    ok: true,
    report: updated,
    grant,
    credit,
    credit_apply,
    parent_notify,
  });
});
