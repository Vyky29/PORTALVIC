// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-credit-apply-invoice
// Parent applies an open family credit against a ready unpaid/partial invoice.
// Residual credit stays open when credit £ > invoice £.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { assertNoPriorUnconfirmedInvoice } from "../_shared/portal_invoice_pay_sequence.ts";
import { applyOpenCreditToInvoice } from "../_shared/portal_family_credit_apply.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
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

  let body: { contact_id?: string; invoice_id?: string; credit_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  const invoiceId = clean(body.invoice_id, 60);
  const creditId = clean(body.credit_id, 60);
  if (!contactId || !invoiceId || !creditId) {
    return json(400, { ok: false, error: "contact_invoice_credit_required" });
  }

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id")
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

  const priorBlock = await assertNoPriorUnconfirmedInvoice(supabase, contactId, invoiceId);
  if (priorBlock) {
    return json(409, {
      ok: false,
      error: priorBlock.error,
      message: priorBlock.message,
      prior_invoice: priorBlock.prior,
    });
  }

  const result = await applyOpenCreditToInvoice(supabase, {
    creditId,
    invoiceId,
    contactId,
    parentPersonId: session.parent_person_id,
    allowHidden: false,
    actor: "parent_portal",
    enforceParentOwnership: true,
  });

  if (!result.ok) {
    const status =
      result.error === "invoice_not_found" || result.error === "credit_not_found"
        ? 404
        : result.error === "already_paid" ||
            result.error === "invoice_not_shared" ||
            result.error === "invoice_not_open" ||
            result.error === "credit_not_open"
          ? 409
          : 400;
    if (
      result.error === "credit_update_failed" ||
      result.error === "invoice_update_failed"
    ) {
      return parentPortalJsonInvalid(500);
    }
    return json(status, {
      ok: false,
      error: result.error,
      message: result.message || undefined,
    });
  }

  return json(200, {
    ok: true,
    invoice_id: result.invoice_id,
    credit_id: result.credit_id,
    payment_status: result.payment_status,
    paid_via: result.payment_status === "paid" ? "credit" : null,
    applied_gbp: result.applied_gbp,
    remaining_gbp: result.invoice_remaining_gbp,
    credit_residual_gbp: result.credit_residual_gbp,
    credit_status: result.credit_status,
    partial: result.partial,
    hold: result.hold,
    xero: result.xero,
  });
});
