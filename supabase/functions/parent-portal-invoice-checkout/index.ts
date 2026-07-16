// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-invoice-checkout
// Creates a Stripe Checkout Session for one unpaid shared invoice.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { stripeConfigured, stripeCreateCheckoutSession, stripeGrossUpFromGbp } from "../_shared/stripe_checkout.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function defaultPortalOrigin(): string {
  return (
    clean(Deno.env.get("PARENT_PORTAL_PUBLIC_ORIGIN"), 200) ||
    "https://www.clubsensational.org"
  ).replace(/\/$/, "");
}

function safeReturnOrigin(raw: unknown): string {
  const o = clean(raw, 200).replace(/\/$/, "");
  if (!o) return defaultPortalOrigin();
  try {
    const u = new URL(o);
    if (u.protocol !== "https:" && u.protocol !== "http:") return defaultPortalOrigin();
    // Allow local dev + production Vercel / club hosts.
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app") ||
      host.endsWith("clubsensational.org") ||
      host === "portalvic.vercel.app"
    ) {
      return u.origin;
    }
  } catch {
    /* fall through */
  }
  return defaultPortalOrigin();
}

/** Path parents land on after Stripe (WordPress proxy uses /parent, not .html). */
function parentPortalReturnPath(origin: string): string {
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === "www.clubsensational.org" || host === "clubsensational.org") {
      return "/parent";
    }
    if (host === "family.clubsensational.org") {
      return "/parent";
    }
  } catch {
    /* fall through */
  }
  return "/parent_portal.html";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  if (!stripeConfigured()) {
    const raw = String(Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
    const isTest = raw.startsWith("sk_test_");
    return json(503, {
      ok: false,
      error: isTest ? "stripe_test_mode" : "stripe_not_configured",
      message: isTest
        ? "Card / Apple Pay is not collecting real funds yet (Stripe test mode). Please pay by bank transfer, or ask the office to enable live Stripe."
        : "Card payment is not available yet. Please pay by bank transfer or contact the office.",
    });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: { invoice_id?: string; contact_id?: string; return_origin?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const invoiceId = clean(body.invoice_id, 60);
  const contactId = clean(body.contact_id, 120);
  if (!invoiceId || !contactId) {
    return json(400, { ok: false, error: "invoice_and_contact_required" });
  }

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

  const { data: inv, error } = await supabase
    .from("portal_parent_invoice_share")
    .select(
      "id, document_id, contact_id, invoice_number, amount_gbp, payment_status, share_status",
    )
    .eq("id", invoiceId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (error || !inv) return json(404, { ok: false, error: "invoice_not_found" });
  if (inv.share_status !== "ready") {
    return json(409, { ok: false, error: "invoice_not_shared" });
  }
  if (inv.payment_status === "paid") {
    return json(409, { ok: false, error: "already_paid" });
  }
  if (inv.payment_status === "void") {
    return json(409, { ok: false, error: "invoice_void" });
  }
  if (inv.payment_status === "pending_confirmation") {
    return json(409, {
      ok: false,
      error: "pending_confirmation",
      message: "You already reported this payment. Please wait for the office to confirm.",
    });
  }

  const amount = Number(inv.amount_gbp);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json(400, {
      ok: false,
      error: "amount_required",
      message: "This invoice has no amount set for card payment. Contact the office.",
    });
  }

  const amountPence = Math.round(amount * 100);
  if (amountPence < 30) {
    return json(400, { ok: false, error: "amount_too_small" });
  }

  // Parent pays invoice + Stripe fee so the club nets the exact service amount.
  const gross = stripeGrossUpFromGbp(amount);
  const chargePence = gross.charge_pence;
  if (chargePence < 30) {
    return json(400, { ok: false, error: "amount_too_small" });
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("title")
    .eq("id", inv.document_id)
    .maybeSingle();

  const displayName =
    clean(participant?.display_name, 80) ||
    [participant?.first_name, participant?.last_name].filter(Boolean).join(" ").trim() ||
    "participant";
  const invNo = clean(inv.invoice_number, 40);
  const docTitle = clean(doc?.title, 120);
  const productName = invNo
    ? docTitle && !docTitle.toLowerCase().includes(invNo.toLowerCase())
      ? `Invoice ${invNo} — ${docTitle}`
      : `Invoice ${invNo}`
    : docTitle || `Invoice — ${displayName}`;
  const productNameWithFee =
    gross.fee_pence > 0
      ? `${productName} (incl. £${gross.fee_gbp.toFixed(2)} card fee)`
      : productName;

  const origin = safeReturnOrigin(body.return_origin);
  const returnPath = parentPortalReturnPath(origin);
  const successUrl =
    `${origin}${returnPath}?invoice_paid=1&view=invoices` +
    `&contact=${encodeURIComponent(contactId)}` +
    `&invoice=${encodeURIComponent(invoiceId)}`;
  const cancelUrl =
    `${origin}${returnPath}?invoice_cancel=1&view=invoices` +
    `&contact=${encodeURIComponent(contactId)}` +
    `&invoice=${encodeURIComponent(invoiceId)}`;

  const created = await stripeCreateCheckoutSession({
    amountPence: chargePence,
    currency: "gbp",
    productName: productNameWithFee,
    successUrl,
    cancelUrl,
    clientReferenceId: invoiceId,
    metadata: {
      invoice_share_id: invoiceId,
      contact_id: contactId,
      parent_person_id: String(session.parent_person_id || ""),
      invoice_number: invNo || "",
      invoice_net_pence: String(gross.net_pence),
      stripe_fee_pence: String(gross.fee_pence),
      charge_pence: String(gross.charge_pence),
    },
  });

  if (!created.ok) {
    return json(502, {
      ok: false,
      error: created.error,
      message: created.detail || "Could not start card payment.",
    });
  }

  await supabase
    .from("portal_parent_invoice_share")
    .update({
      stripe_checkout_session_id: created.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  return json(200, {
    ok: true,
    checkout_url: created.url,
    session_id: created.id,
    amount_gbp: gross.net_gbp,
    charge_gbp: gross.charge_gbp,
    fee_gbp: gross.fee_gbp,
  });
});
