// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-gocardless-webhook
// Handles GoCardless events: mandate fulfilment + payment confirmed/failed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  gocardlessGetBillingRequest,
  gocardlessVerifyAndParseWebhook,
} from "../_shared/gocardless.ts";
import {
  scheduleGocardlessPaymentsForContact,
  upsertMandateRow,
} from "../_shared/gocardless_portal.ts";
import { xeroSyncPaidInvoiceShare } from "../_shared/xero_payments.ts";
import { clearPaymentHoldForContact } from "../_shared/portal_payment_holds.ts";
import { confirmCrashSummerBookingsForInvoice } from "../_shared/crash_summer_confirm.ts";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function markInvoicePaid(
  supabase: ReturnType<typeof createClient>,
  opts: {
    paymentId?: string | null;
    invoiceShareId?: string | null;
  },
) {
  const now = new Date().toISOString();
  const patch = {
    payment_status: "paid",
    paid_at: now,
    paid_via: "gocardless",
    updated_at: now,
  };
  if (opts.paymentId) {
    (patch as Record<string, unknown>).gocardless_payment_id = opts.paymentId;
  }

  let q = supabase.from("portal_parent_invoice_share").update(patch);
  if (opts.invoiceShareId) {
    q = q.eq("id", opts.invoiceShareId);
  } else if (opts.paymentId) {
    q = q.eq("gocardless_payment_id", opts.paymentId);
  } else {
    return { ok: false as const, reason: "no_ref" };
  }

  const { data, error } = await q
    .select(
      "id, contact_id, payment_status, amount_gbp, invoice_number, paid_via, xero_invoice_id, xero_payment_id",
    )
    .maybeSingle();
  if (error) {
    console.error("[gc-webhook] mark paid", error.message);
    return { ok: false as const, reason: error.message };
  }
  if (!data) return { ok: false as const, reason: "invoice_not_found" };

  const xero = await xeroSyncPaidInvoiceShare(supabase, data);
  let hold = null;
  try {
    const cid = clean(data.contact_id, 120);
    if (cid) hold = await clearPaymentHoldForContact(supabase, cid, "gocardless");
  } catch (e) {
    console.error("[gc-webhook] hold", e instanceof Error ? e.message : String(e));
  }
  try {
    await confirmCrashSummerBookingsForInvoice(supabase, String(data.id));
  } catch (e) {
    console.error("[gc-webhook] crash confirm", e instanceof Error ? e.message : String(e));
  }
  return { ok: true as const, invoice_id: data.id, xero, hold };
}

async function handleBillingRequestFulfilled(
  supabase: ReturnType<typeof createClient>,
  event: Record<string, unknown>,
) {
  const links = (event.links || {}) as Record<string, string>;
  const brId = clean(links.billing_request, 80);
  if (!brId) return { ok: false, reason: "no_billing_request" };

  const br = await gocardlessGetBillingRequest(brId);
  if (!br.ok) return { ok: false, reason: br.error, detail: br.detail };

  const mandateId = clean(br.data.links?.mandate, 80);
  const customerId = clean(br.data.links?.customer, 80);
  const paymentId = clean(br.data.links?.payment, 80);

  const meta = (event.resource_metadata || {}) as Record<string, unknown>;
  let contactId = clean(meta.contact_id, 120);

  if (!contactId) {
    const { data: byBr } = await supabase
      .from("portal_parent_gocardless_mandates")
      .select("contact_id")
      .eq("billing_request_id", brId)
      .maybeSingle();
    contactId = clean(byBr?.contact_id, 120);
  }

  if (!contactId) {
    console.warn("[gc-webhook] fulfilled without contact", brId);
    return { ok: false, reason: "no_contact" };
  }

  if (mandateId) {
    await upsertMandateRow(supabase, {
      contact_id: contactId,
      gocardless_mandate_id: mandateId,
      gocardless_customer_id: customerId || null,
      billing_request_id: brId,
      mandate_status: "active",
      authorisation_url: null,
      last_error: null,
    });
  }

  // If first payment was part of the billing request, link it.
  const invoiceShareId = clean(meta.invoice_share_id, 60);
  if (paymentId && invoiceShareId) {
    await supabase
      .from("portal_parent_invoice_share")
      .update({
        gocardless_payment_id: paymentId,
        gocardless_mandate_id: mandateId || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceShareId);
  }

  let scheduled = { scheduled: 0, errors: [] as string[] };
  if (mandateId) {
    scheduled = await scheduleGocardlessPaymentsForContact(supabase, {
      contactId,
      mandateId,
      invoiceId: null,
    });
  }

  return {
    ok: true,
    contact_id: contactId,
    mandate_id: mandateId,
    payment_id: paymentId || null,
    scheduled: scheduled.scheduled,
  };
}

async function handlePaymentEvent(
  supabase: ReturnType<typeof createClient>,
  event: Record<string, unknown>,
  action: string,
) {
  const links = (event.links || {}) as Record<string, string>;
  const paymentId = clean(links.payment, 80);
  const meta = (event.resource_metadata || {}) as Record<string, unknown>;
  const invoiceShareId = clean(meta.invoice_share_id, 60);

  if (action === "confirmed" || action === "paid_out") {
    return await markInvoicePaid(supabase, { paymentId, invoiceShareId });
  }

  if (action === "failed" || action === "cancelled" || action === "charged_back") {
    const details = (event.details || {}) as Record<string, unknown>;
    const cause = clean(details.cause || details.description || action, 200);
    if (paymentId || invoiceShareId) {
      let q = supabase
        .from("portal_parent_invoice_share")
        .update({
          notes: `GoCardless ${action}: ${cause}`.slice(0, 500),
          updated_at: new Date().toISOString(),
        });
      if (invoiceShareId) q = q.eq("id", invoiceShareId);
      else q = q.eq("gocardless_payment_id", paymentId);
      await q;
    }
    return { ok: true, noted: action, payment_id: paymentId || null };
  }

  return { ok: true, ignored_action: action };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, content-type, webhook-signature",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const rawBody = await req.text();
  const payload = await gocardlessVerifyAndParseWebhook(
    rawBody,
    req.headers.get("Webhook-Signature") || req.headers.get("webhook-signature"),
  );
  if (!payload) return json(400, { ok: false, error: "invalid_signature" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json(500, { ok: false, error: "server_misconfigured" });

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const events = Array.isArray(payload.events) ? payload.events : [];
  const results: unknown[] = [];

  for (const ev of events) {
    const event = (ev && typeof ev === "object" ? ev : {}) as Record<string, unknown>;
    const resourceType = String(event.resource_type || "");
    const action = String(event.action || "");

    try {
      if (resourceType === "billing_requests" && action === "fulfilled") {
        results.push(await handleBillingRequestFulfilled(supabase, event));
      } else if (resourceType === "payments") {
        results.push(await handlePaymentEvent(supabase, event, action));
      } else if (resourceType === "mandates" && (action === "cancelled" || action === "failed")) {
        const links = (event.links || {}) as Record<string, string>;
        const mandateId = clean(links.mandate, 80);
        if (mandateId) {
          await supabase
            .from("portal_parent_gocardless_mandates")
            .update({
              mandate_status: action,
              updated_at: new Date().toISOString(),
              last_error: action,
            })
            .eq("gocardless_mandate_id", mandateId);
        }
        results.push({ ok: true, mandate: action, mandate_id: mandateId || null });
      } else {
        results.push({ ok: true, ignored: `${resourceType}.${action}` });
      }
    } catch (e) {
      console.error("[gc-webhook] event", resourceType, action, e);
      results.push({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json(200, { ok: true, handled: results.length, results });
});
