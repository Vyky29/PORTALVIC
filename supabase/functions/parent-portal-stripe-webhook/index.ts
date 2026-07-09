// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-stripe-webhook
// Marks portal_parent_invoice_share paid on checkout.session.completed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { stripeVerifyAndParseEvent } from "../_shared/stripe_checkout.ts";
import { xeroSyncPaidInvoiceShare } from "../_shared/xero_payments.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, stripe-signature",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const rawBody = await req.text();
  const event = await stripeVerifyAndParseEvent(rawBody, req.headers.get("stripe-signature"));
  if (!event) return json(400, { ok: false, error: "invalid_signature" });

  const type = String(event.type || "");
  if (type !== "checkout.session.completed" && type !== "checkout.session.async_payment_succeeded") {
    return json(200, { ok: true, ignored: type });
  }

  const obj = (event.data && (event.data as { object?: Record<string, unknown> }).object) || {};
  const paymentStatus = String(obj.payment_status || "");
  if (paymentStatus && paymentStatus !== "paid" && type === "checkout.session.completed") {
    // Unpaid / no_payment_required — ignore until paid.
    if (paymentStatus !== "no_payment_required") {
      return json(200, { ok: true, skipped: "not_paid", payment_status: paymentStatus });
    }
  }

  const sessionId = String(obj.id || "");
  const meta = (obj.metadata && typeof obj.metadata === "object" ? obj.metadata : {}) as Record<
    string,
    unknown
  >;
  const invoiceShareId =
    String(meta.invoice_share_id || obj.client_reference_id || "").trim();
  const paymentIntent =
    typeof obj.payment_intent === "string"
      ? obj.payment_intent
      : obj.payment_intent && typeof obj.payment_intent === "object"
        ? String((obj.payment_intent as { id?: string }).id || "")
        : "";

  if (!invoiceShareId && !sessionId) {
    return json(200, { ok: true, skipped: "no_invoice_ref" });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date().toISOString();
  const patch = {
    payment_status: "paid",
    paid_at: now,
    paid_via: "stripe",
    stripe_checkout_session_id: sessionId || null,
    stripe_payment_intent_id: paymentIntent || null,
    updated_at: now,
  };

  let q = supabase.from("portal_parent_invoice_share").update(patch);
  if (invoiceShareId) {
    q = q.eq("id", invoiceShareId);
  } else {
    q = q.eq("stripe_checkout_session_id", sessionId);
  }

  const { data, error } = await q
    .select(
      "id, payment_status, amount_gbp, invoice_number, paid_via, xero_invoice_id, xero_payment_id",
    )
    .maybeSingle();
  if (error) {
    console.error("[parent-portal-stripe-webhook]", error.message);
    return json(500, { ok: false, error: "update_failed" });
  }
  if (!data) {
    console.warn("[parent-portal-stripe-webhook] invoice not found", invoiceShareId, sessionId);
    return json(200, { ok: true, skipped: "invoice_not_found" });
  }

  const xero = await xeroSyncPaidInvoiceShare(supabase, data);
  return json(200, {
    ok: true,
    invoice_id: data.id,
    payment_status: data.payment_status,
    xero,
  });
});
