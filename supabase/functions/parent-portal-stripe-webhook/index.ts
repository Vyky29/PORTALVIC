// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-stripe-webhook
// Marks portal_parent_invoice_share paid on checkout.session.completed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { stripeVerifyAndParseEvent } from "../_shared/stripe_checkout.ts";
import { xeroEnsurePaidShareInBooks } from "../_shared/xero_payments.ts";
import { clearPaymentHoldForContact } from "../_shared/portal_payment_holds.ts";
import { confirmCrashSummerBookingsForInvoice } from "../_shared/crash_summer_confirm.ts";
import { recordInvoiceInstalmentPayment } from "../_shared/portal_create_family_invoice.ts";

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

  let shareId = invoiceShareId;
  if (!shareId && sessionId) {
    const { data: bySession } = await supabase
      .from("portal_parent_invoice_share")
      .select("id")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    shareId = String(bySession?.id || "").trim();
  }
  if (!shareId) {
    return json(200, { ok: true, skipped: "invoice_not_found" });
  }

  const { data: before } = await supabase
    .from("portal_parent_invoice_share")
    .select("id, amount_gbp, payment_schedule")
    .eq("id", shareId)
    .maybeSingle();
  if (!before) {
    return json(200, { ok: true, skipped: "invoice_not_found" });
  }

  const netPence = Number(meta.invoice_net_pence);
  const payGbp =
    Number.isFinite(netPence) && netPence > 0 ? Math.round(netPence) / 100 : null;

  const schedAmt = Number(
    (Array.isArray(before.payment_schedule) ? before.payment_schedule : []).find(
      (r: { status?: string; amount_gbp?: number }) =>
        String(r?.status || "").toLowerCase() !== "paid",
    )?.amount_gbp,
  );
  const payAmount =
    payGbp ?? (Number.isFinite(schedAmt) && schedAmt > 0 ? schedAmt : Number(before.amount_gbp));

  const recorded = await recordInvoiceInstalmentPayment(supabase, shareId, {
    amountGbp: payAmount,
    paidVia: "stripe",
    stripeCheckoutSessionId: sessionId || null,
    stripePaymentIntentId: paymentIntent || null,
  });

  if (!recorded.ok) {
    console.error("[parent-portal-stripe-webhook] instalment", recorded.error);
    return json(500, { ok: false, error: recorded.error });
  }

  const { data, error } = await supabase
    .from("portal_parent_invoice_share")
    .select(
      "id, payment_status, amount_gbp, amount_paid_gbp, invoice_number, paid_via, xero_invoice_id, xero_payment_id",
    )
    .eq("id", shareId)
    .maybeSingle();
  if (error) {
    console.error("[parent-portal-stripe-webhook]", error.message);
    return json(500, { ok: false, error: "update_failed" });
  }
  if (!data) {
    console.warn("[parent-portal-stripe-webhook] invoice not found", shareId, sessionId);
    return json(200, { ok: true, skipped: "invoice_not_found" });
  }

  const xero =
    data.payment_status === "paid"
      ? await xeroEnsurePaidShareInBooks(supabase, data)
      : { skipped: "partial_instalment" };
  let hold = null;
  try {
    const { data: shareRow } = await supabase
      .from("portal_parent_invoice_share")
      .select("contact_id")
      .eq("id", data.id)
      .maybeSingle();
    const cid = String(shareRow?.contact_id || "").trim();
    if (cid && data.payment_status === "paid") {
      hold = await clearPaymentHoldForContact(supabase, cid, "stripe");
    }
  } catch (e) {
    console.error(
      "[parent-portal-stripe-webhook] hold clear",
      e instanceof Error ? e.message : String(e),
    );
  }

  // Summer crash courses: confirm slot holds only after pay-in-full.
  let crashConfirmed = 0;
  if (data.payment_status === "paid") {
    try {
      crashConfirmed = await confirmCrashSummerBookingsForInvoice(supabase, String(data.id));
    } catch (e) {
    console.error(
      "[parent-portal-stripe-webhook] crash confirm",
      e instanceof Error ? e.message : String(e),
    );
    }
  }

  return json(200, {
    ok: true,
    invoice_id: data.id,
    payment_status: data.payment_status,
    xero,
    hold,
    crash_confirmed: crashConfirmed,
  });
});
