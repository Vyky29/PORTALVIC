// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-invoices-list
// Parent-facing list of shared client invoice PDFs for one linked child.
// Bank-first: Tide details from env; optional GC / Payment Link from share row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { stripeConfigured, stripeGrossUpFromGbp } from "../_shared/stripe_checkout.ts";
import { gocardlessConfigured } from "../_shared/gocardless.ts";
import { mandateIsActive } from "../_shared/gocardless_portal.ts";
import {
  suggestedTransferReference,
  tideBankDetailsFromEnv,
} from "../_shared/tide_bank_details.ts";

const BUCKET = "documents";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Parent hub currently hides Summer term 25/26 programme invoices.
 * Smoke / TEST invoice numbers are admin-only (never shown to families).
 */
function parentInvoiceAllowedForShare(
  share: { invoice_number?: unknown; payment_status?: unknown },
  docTitle: unknown,
): boolean {
  const status = clean(share.payment_status, 40).toLowerCase();
  if (status === "void") return false;

  const title = clean(docTitle, 240).toLowerCase();
  const num = clean(share.invoice_number, 80).toLowerCase();
  const blob = `${title} ${num}`;

  if (/^smoke[-_]/.test(num) || /^test[-_]/.test(num)) return false;
  if (/\bcrash\b/.test(blob)) return true;
  if (/26\/27|2026\/27|2026-27|autumn term 26|spring term 26|summer term 26/.test(blob)) {
    return true;
  }

  // Current programme year (Summer term 25/26) — not shown to parents yet.
  if (/summer term 25|25\/26|inv-2526|year programme/.test(blob)) return false;
  if (/summer term/.test(blob) && !/\bcrash\b/.test(blob)) return false;

  return true;
}

function parentFacingSubtitle(
  share: { invoice_number?: unknown; reference_text?: unknown; line_description?: unknown },
  docTitle: unknown,
): string | null {
  const num = clean(share.invoice_number, 80);
  const ref = clean(share.reference_text, 120);
  const lineFirst = clean(String(share.line_description || "").split("\n")[0], 120);
  const title = clean(docTitle, 200).toLowerCase();
  const blob = `${ref} ${lineFirst} ${title}`.toLowerCase();

  if (/\bcrash\b/.test(blob) || /summer term 25\/26/.test(ref.toLowerCase())) {
    return "Summer crash course Jul 2026";
  }
  if (/26\/27|2026-27|2026\/27|autumn|re-enrol|spring term|summer term/.test(blob)) {
    return ref || lineFirst || "Autumn term 26/27";
  }
  if (ref && ref !== num) return ref;
  if (lineFirst && !/^structured activity support/i.test(lineFirst)) return lineFirst;
  return null;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: { contact_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!participant) {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
  }

  const displayName =
    clean(participant?.display_name, 80) ||
    [participant?.first_name, participant?.last_name].filter(Boolean).join(" ").trim() ||
    "participant";

  const { data: shares, error } = await supabase
    .from("portal_parent_invoice_share")
    .select(
      "id, document_id, contact_id, invoice_number, amount_gbp, due_date, payment_status, share_status, ready_at, created_at, updated_at, payment_method_hint, gocardless_url, gocardless_payment_id, gocardless_mandate_id, payment_link_url, payment_link_surcharge_note, parent_reported_paid_at, parent_reported_ref, parent_reported_method, paid_at, paid_via, vat_mode, reference_text, line_description",
    )
    .eq("contact_id", contactId)
    .eq("share_status", "ready")
    .neq("payment_method_hint", "la_funded")
    .order("due_date", { ascending: false, nullsFirst: false })
    .order("ready_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    console.error("[parent-portal-invoices-list]", error.message);
    return parentPortalJsonInvalid(500);
  }

  const docIds = (shares || []).map((s) => String(s.document_id || "")).filter(Boolean);
  const docsById = new Map<string, Record<string, unknown>>();
  if (docIds.length) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, title, related_date, file_url, created_at, related_client, document_type")
      .in("id", docIds)
      .eq("document_type", "client_invoice");
    for (const d of docs || []) {
      if (d?.id) docsById.set(String(d.id), d);
    }
  }

  const tide = tideBankDetailsFromEnv();
  const cardCheckoutAvailable = stripeConfigured();
  const gcApiAvailable = gocardlessConfigured();

  const { data: mandateRow } = await supabase
    .from("portal_parent_gocardless_mandates")
    .select("mandate_status, gocardless_mandate_id, authorisation_url")
    .eq("contact_id", contactId)
    .maybeSingle();
  const gcMandateActive =
    !!mandateRow &&
    mandateIsActive(mandateRow.mandate_status) &&
    !!clean(mandateRow.gocardless_mandate_id, 80);
  const gcMandateStatus = clean(mandateRow?.mandate_status, 40) || null;

  const { data: openCredits } = await supabase
    .from("portal_parent_family_credits")
    .select("id, amount_gbp, service_label, session_date, kind, status")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .eq("kind", "credit")
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(20);

  const usableCredits = (openCredits || [])
    .map((c) => {
      const amt = c.amount_gbp != null ? Number(c.amount_gbp) : null;
      if (amt == null || !Number.isFinite(amt) || amt <= 0) return null;
      return {
        id: c.id,
        amount_gbp: Math.round(amt * 100) / 100,
        service_label: clean(c.service_label, 120) || null,
        session_date: c.session_date || null,
      };
    })
    .filter(Boolean);

  const out = [];
  for (const share of shares || []) {
    const doc = docsById.get(String(share.document_id));
    if (!doc || !doc.file_url) continue;
    if (!parentInvoiceAllowedForShare(share, doc.title)) continue;
    const hintEarly = clean(share.payment_method_hint, 40) || "bank_transfer";
    // LA-funded only: office invoices the funder — parents do not pay in the portal.
    if (hintEarly === "la_funded") continue;
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(String(doc.file_url), 3600);
    const amount = share.amount_gbp != null ? Number(share.amount_gbp) : null;
    const status = share.payment_status || "unpaid";
    const openForPay = status === "unpaid" || status === "partial";
    const suggestedRef = suggestedTransferReference(share.invoice_number, displayName);
    const canPayCard =
      cardCheckoutAvailable &&
      openForPay &&
      amount != null &&
      Number.isFinite(amount) &&
      amount > 0;
    const cardPricing =
      canPayCard && amount != null ? stripeGrossUpFromGbp(amount) : null;
    const hint = hintEarly;
    const isGcHint = hint === "gocardless";
    const isLaFunded = false;
    const hasGcPayment = !!clean(share.gocardless_payment_id, 80);
    const canSetupGc =
      gcApiAvailable &&
      isGcHint &&
      openForPay &&
      !gcMandateActive;
    const gcPendingCollection =
      isGcHint && openForPay && (gcMandateActive || hasGcPayment);
    // Mandated Direct Payment + LA funded invoices are not paid by parent card/bank UI.
    const hideManualPay = isGcHint || isLaFunded;
    const applicableCredits =
      openForPay && amount != null && Number.isFinite(amount) && amount > 0
        ? usableCredits
        : [];
    out.push({
      id: share.id,
      document_id: share.document_id,
      title: clean(doc.title, 200) || "Invoice",
      invoice_number: share.invoice_number || null,
      amount_gbp: amount,
      due_date: share.due_date || null,
      payment_status: status,
      ready_at: share.ready_at || doc.created_at || null,
      related_date: doc.related_date || null,
      subtitle: parentFacingSubtitle(share, doc.title),
      pdf_url: signed?.signedUrl || null,
      payment_method_hint: hint,
      gocardless_url: clean(share.gocardless_url, 500) || null,
      gocardless_payment_id: clean(share.gocardless_payment_id, 80) || null,
      can_setup_gocardless: canSetupGc,
      gocardless_pending_collection: gcPendingCollection && !canSetupGc,
      payment_link_url: hideManualPay
        ? null
        : clean(share.payment_link_url, 500) || null,
      payment_link_surcharge_note: hideManualPay
        ? null
        : clean(share.payment_link_surcharge_note, 200) || null,
      parent_reported_paid_at: share.parent_reported_paid_at || null,
      parent_reported_ref: share.parent_reported_ref || null,
      paid_at: share.paid_at || null,
      paid_via: share.paid_via || null,
      suggested_reference: suggestedRef,
      bank_transfer:
        hideManualPay || !(openForPay || status === "pending_confirmation")
          ? null
          : {
              available: tide.available,
              payee_name: tide.payee_name,
              sort_code: tide.sort_code,
              account_number: tide.account_number,
              // Prefer participant name over static env hint (term label stays on invoice Reference).
              reference_hint: suggestedRef || tide.reference_hint,
              message: tide.available
                ? null
                : "Contact the office for bank transfer details.",
            },
      can_report_paid: hideManualPay ? false : openForPay,
      can_pay: hideManualPay ? false : canPayCard,
      card_checkout:
        hideManualPay || !cardPricing
          ? null
          : {
              available: true,
              invoice_gbp: cardPricing.net_gbp,
              charge_gbp: cardPricing.charge_gbp,
              fee_gbp: cardPricing.fee_gbp,
              fee_percent: cardPricing.fee_percent,
              fee_fixed_gbp: cardPricing.fee_fixed_pence / 100,
              note:
                "Card / Apple Pay includes a processing fee so we receive the invoice amount in full. Bank transfer has no fee.",
            },
      applicable_credits: applicableCredits,
    });
  }

  const anyGcSetup = out.some((inv) => inv.can_setup_gocardless);
  const anyGcHintOpen = out.some(
    (inv) =>
      inv.payment_method_hint === "gocardless" &&
      (inv.payment_status === "unpaid" || inv.payment_status === "partial"),
  );

  return json(200, {
    ok: true,
    invoices: out,
    bank_transfer_available: tide.available,
    payments_enabled: cardCheckoutAvailable,
    gocardless: {
      api_available: gcApiAvailable,
      mandate_active: gcMandateActive,
      mandate_status: gcMandateStatus,
      // Setup lives on the GC invoice card when can_setup_gocardless — avoid duplicate banner.
      setup_available:
        !anyGcSetup && gcApiAvailable && anyGcHintOpen && !gcMandateActive,
      can_schedule: gcApiAvailable && gcMandateActive && anyGcHintOpen,
    },
  });
});
