// portal-reenrolment-submit — save parent re-enrolment 2026/27 choices for admin review.
// Parent-pays plans: auto-create INV-P instalment invoices from the chosen schedule.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clientIp,
  parentPortalCorsHeaders,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";
import { REENROL_ACADEMIC_YEAR } from "../_shared/reenrolment_catalog.ts";
import {
  createPortalFamilyInvoice,
  resolvePortalInvoiceOwnerUserId,
} from "../_shared/portal_create_family_invoice.ts";
import {
  buildReenrolmentInstalments,
  parseReenrolTermTotals,
  termTotalsFromWeeklySlots,
} from "../_shared/reenrolment_auto_invoices.ts";
import {
  buildReenrolTermLineItems,
  lineItemsToDescription,
  loadProductMap,
} from "../_shared/portal_xero_product_catalog.ts";
import type { ParsedSlot } from "../_shared/reenrolment_catalog.ts";
import { gocardlessConfigured } from "../_shared/gocardless.ts";
import {
  mandateIsActive,
  scheduleGocardlessPaymentsForContact,
} from "../_shared/gocardless_portal.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function sanitize(raw: unknown, max = 200): string {
  return String(raw ?? "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "bad_json" });
  }

  const participantName = sanitize(body.participant_name, 200);
  if (!participantName) return json(400, { ok: false, error: "missing_participant" });

  const choices = body.choices;
  if (!choices || typeof choices !== "object") {
    return json(400, { ok: false, error: "missing_choices" });
  }

  const declarations = body.declarations;
  if (!declarations || typeof declarations !== "object") {
    return json(400, { ok: false, error: "missing_declarations" });
  }

  const confirmAccurate = !!(declarations as Record<string, unknown>).accurate;
  const confirmTerms = !!(declarations as Record<string, unknown>).terms;
  if (!confirmAccurate || !confirmTerms) {
    return json(400, { ok: false, error: "declarations_required" });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip = clientIp(req);
  const ua = req.headers.get("user-agent") || "";
  const ipHash = ip ? await sha256Hex(ip) : null;
  const uaHash = ua ? await sha256Hex(ua) : null;

  const source = sanitize(body.source, 40) === "parent_portal" ? "parent_portal" : "link";

  const participantContactId = sanitize(body.participant_contact_id, 80) || null;

  let priorSubmissionAt: string | null = null;
  if (participantContactId) {
    const { data: prior } = await supabase
      .from("portal_re_enrolment_submissions")
      .select("submitted_at")
      .eq("academic_year", REENROL_ACADEMIC_YEAR)
      .eq("participant_contact_id", participantContactId)
      .order("submitted_at", { ascending: false })
      .limit(1);
    if (prior && prior.length) priorSubmissionAt = String(prior[0].submitted_at || "") || null;
  }

  const payload = {
    choices,
    declarations,
    funding: body.funding ?? null,
    weekly_slots_snapshot: body.weekly_slots ?? null,
    day_centre_snapshot: body.day_centre ?? null,
    annual_weekly_total: body.annual_weekly_total ?? null,
    term_totals: body.term_totals ?? null,
    slot_change_notes: sanitize(body.slot_change_notes, 2000) || null,
    contact_email: sanitize(body.contact_email, 200) || null,
    contact_phone: sanitize(body.contact_phone, 40) || null,
    submitted_from: sanitize(body.submitted_from, 500) || null,
    resubmission: !!priorSubmissionAt,
    prior_submission_at: priorSubmissionAt,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("portal_re_enrolment_submissions")
    .insert({
      academic_year: REENROL_ACADEMIC_YEAR,
      source,
      parent_first_name: sanitize(body.parent_first_name, 120) || null,
      parent_last_name: sanitize(body.parent_last_name, 120) || null,
      participant_name: participantName,
      participant_contact_id: participantContactId,
      parent_person_id: sanitize(body.parent_person_id, 80) || null,
      client_payments_client_key: sanitize(body.client_key, 120) || null,
      payment_status_at_submit: sanitize(body.payment_status, 80) || null,
      outstanding_amount:
        body.outstanding_amount != null && body.outstanding_amount !== ""
          ? Number(body.outstanding_amount)
          : null,
      payload,
      ip_hash: ipHash,
      user_agent_hash: uaHash,
    })
    .select("id, submitted_at")
    .single();

  if (insErr || !inserted) {
    console.error("[portal-reenrolment-submit] insert", insErr?.message);
    return json(500, { ok: false, error: "save_failed" });
  }

  let invoicesCreated: Array<{ invoice_number: string; amount_gbp: number; due_date: string | null }> =
    [];
  let invoicesSkipped: string | null = null;
  let gocardlessScheduled = 0;
  let gocardlessScheduleErrors: string[] = [];
  let gocardlessNeedsSetup = false;
  let schedulePlanPhrase: string | null = null;

  // Auto-create INV-P schedule on first submit only (resubmits: office adjusts manually).
  if (participantContactId && !priorSubmissionAt) {
    const weeklyChoices =
      choices && typeof choices === "object"
        ? (choices as Record<string, unknown>).weekly
        : null;
    const termTotals =
      parseReenrolTermTotals(body.term_totals) ||
      termTotalsFromWeeklySlots(body.weekly_slots, weeklyChoices) ||
      null;

    const plan = buildReenrolmentInstalments({
      funding: body.funding,
      termTotals,
      participantName,
      academicYear: REENROL_ACADEMIC_YEAR,
    });
    schedulePlanPhrase = plan.schedulePlanPhrase;

    if (plan.skipReason) {
      invoicesSkipped = plan.skipReason;
    } else if (plan.termInvoices.length) {
      const ownerId = await resolvePortalInvoiceOwnerUserId(supabase);
      if (!ownerId) {
        console.error("[portal-reenrolment-submit] no invoice owner user");
        invoicesSkipped = "no_owner";
      } else {
        const productMap = await loadProductMap(supabase);
        const weeklySlots = Array.isArray(body.weekly_slots)
          ? (body.weekly_slots as ParsedSlot[])
          : [];
        const weeklyChoicesMap =
          weeklyChoices && typeof weeklyChoices === "object"
            ? (weeklyChoices as Record<string, { choice?: string }>)
            : null;

        for (const inv of plan.termInvoices) {
          let lineItems =
            inv.term && weeklySlots.length && !inv.isAdminFee
              ? buildReenrolTermLineItems({
                slots: weeklySlots,
                weeklyChoices: weeklyChoicesMap,
                term: inv.term,
                vatMode: plan.vatMode,
                productMap,
              })
              : [];
          const lineDescription =
            lineItems.length > 0
              ? lineItemsToDescription(lineItems)
              : inv.lineDescription;

          const created = await createPortalFamilyInvoice(supabase, {
            contactId: participantContactId,
            amountGbp: inv.amountGbp,
            dueDateIso: inv.dueDateIso,
            vatMode: plan.vatMode,
            lineDescription,
            reference: inv.reference,
            notes: null,
            title: `Invoice — ${participantName} · ${inv.label}`,
            shareStatus: "ready",
            paymentMethodHint: plan.paymentMethodHint,
            createdVia: "reenrolment",
            ownerUserId: ownerId,
            readyBy: "reenrolment_auto",
            paymentSchedule: inv.paymentSchedule,
            billingTerm: inv.term,
            lineItems,
          });
          if (!created.ok) {
            console.error(
              "[portal-reenrolment-submit] invoice",
              inv.label,
              created.error,
            );
            invoicesSkipped = invoicesSkipped || created.error;
            continue;
          }
          invoicesCreated.push({
            invoice_number: created.invoiceNumber,
            amount_gbp: inv.amountGbp,
            due_date: inv.dueDateIso,
            billing_term: inv.term,
            instalments: inv.paymentSchedule.length,
          });
        }

        // Existing July mandates: schedule GC collections (first often 1 Sep).
        if (
          invoicesCreated.length &&
          plan.paymentMethodHint === "gocardless" &&
          gocardlessConfigured()
        ) {
          const { data: mandateRow } = await supabase
            .from("portal_parent_gocardless_mandates")
            .select("gocardless_mandate_id, mandate_status")
            .eq("contact_id", participantContactId)
            .maybeSingle();
          const mandateId = String(mandateRow?.gocardless_mandate_id || "").trim();
          if (mandateId && mandateIsActive(mandateRow?.mandate_status)) {
            const sched = await scheduleGocardlessPaymentsForContact(supabase, {
              contactId: participantContactId,
              mandateId,
              invoiceId: null,
            });
            gocardlessScheduled = sched.scheduled;
            gocardlessScheduleErrors = (sched.errors || []).slice(0, 8);
            if (sched.errors?.length) {
              console.error(
                "[portal-reenrolment-submit] gocardless schedule",
                participantContactId,
                sched.errors,
              );
            }
          } else {
            gocardlessNeedsSetup = true;
          }
        }
      }
    }
  } else if (priorSubmissionAt) {
    invoicesSkipped = "resubmission";
  } else if (!participantContactId) {
    invoicesSkipped = "no_contact_id";
  }

  let message = "Thank you — your re-enrolment has been sent to the club office.";
  if (priorSubmissionAt) {
    message =
      "Thank you — your updated re-enrolment has been sent to the club office for review.";
  } else if (invoicesCreated.length) {
    const planBit = schedulePlanPhrase
      ? ` Your plan: ${schedulePlanPhrase}.`
      : "";
    const invBit =
      ` ${invoicesCreated.length} invoice${
        invoicesCreated.length === 1 ? "" : "s"
      } ${invoicesCreated.length === 1 ? "is" : "are"} ready in your parent portal.`;
    message =
      `Thank you — your re-enrolment has been sent to the club office.${planBit}${invBit}`;
    if (gocardlessScheduled > 0) {
      message +=
        ` GoCardless will collect ${gocardlessScheduled} Direct Payment${
          gocardlessScheduled === 1 ? "" : "s"
        } from the first due date.`;
    } else if (gocardlessNeedsSetup) {
      message +=
        " Open Invoices in the parent portal to set up Direct Payment before the first collection.";
    }
  }

  return json(200, {
    ok: true,
    submission_id: inserted.id,
    submitted_at: inserted.submitted_at,
    resubmission: !!priorSubmissionAt,
    invoices_created: invoicesCreated.length,
    invoices: invoicesCreated,
    invoices_skipped: invoicesSkipped,
    gocardless_scheduled: gocardlessScheduled,
    gocardless_schedule_errors: gocardlessScheduleErrors,
    gocardless_needs_setup: gocardlessNeedsSetup,
    schedule_plan: schedulePlanPhrase,
    message,
  });
});
