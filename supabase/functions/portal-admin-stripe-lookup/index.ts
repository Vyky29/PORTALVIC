// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-stripe-lookup
// One-shot Stripe search for finance support (service-role bearer only).
// Body: { email?: string, name?: string, amount_gbp?: number, limit?: number }

import { stripeSecretKey } from "../_shared/stripe_checkout.ts";

const STRIPE_API = "https://api.stripe.com/v1";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max = 120): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function bearerOk(req: Request): boolean {
  const service = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const auth = String(req.headers.get("Authorization") || "");
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const token = m && m[1] ? m[1].trim() : "";
  if (!token) return false;
  if (service && token === service) return true;
  // Accept project service_role JWT even if local secrets are rotated vs Edge env.
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    const role = String(payload.role || payload.app_role || "");
    return role === "service_role";
  } catch {
    return false;
  }
}

async function stripeGet(path: string, params: Record<string, string> = {}) {
  const key = stripeSecretKey();
  if (!key) return { ok: false as const, error: "stripe_not_configured" };
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${STRIPE_API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.json();
  if (!res.ok) {
    return {
      ok: false as const,
      error: clean(body?.error?.message || `stripe_http_${res.status}`, 240),
      status: res.status,
    };
  }
  return { ok: true as const, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });
  if (!bearerOk(req)) return json(401, { ok: false, error: "unauthorized" });

  let body: {
    email?: string;
    name?: string;
    amount_gbp?: number;
    limit?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const limit = String(Math.min(20, Math.max(1, Number(body.limit) || 10)));
  const email = clean(body.email, 160);
  const name = clean(body.name, 120);
  const amountGbp = Number(body.amount_gbp);
  const amountPence = Number.isFinite(amountGbp) && amountGbp > 0
    ? String(Math.round(amountGbp * 100))
    : "";

  const key = stripeSecretKey();
  const out: Record<string, unknown> = {
    ok: true,
    stripe_configured: !!key,
    stripe_live: !!(key && key.startsWith("sk_live_")),
    stripe_test: !!(key && key.startsWith("sk_test_")),
    stripe_restricted: !!(key && key.startsWith("rk_live_")),
    customers: [],
    payment_intents: [],
    charges: [],
    checkout_sessions: [],
  };

  if (!key) return json(500, { ok: false, error: "stripe_not_configured" });

  const acct = await stripeGet("/account");
  if (acct.ok) {
    const a = acct.body as Record<string, unknown>;
    const biz = (a.business_profile && typeof a.business_profile === "object"
      ? a.business_profile
      : {}) as Record<string, unknown>;
    out.stripe_account = {
      id: a.id,
      email: a.email,
      business_name: biz.name || a.settings?.dashboard?.display_name || null,
      country: a.country,
      default_currency: a.default_currency,
    };
  } else {
    out.stripe_account_error = acct.error;
  }

  if (email) {
    const r = await stripeGet("/customers/search", {
      query: `email~"${email.replace(/"/g, "")}"`,
      limit,
    });
    if (r.ok) {
      out.customers = (r.body.data || []).map((c: Record<string, unknown>) => ({
        id: c.id,
        email: c.email,
        name: c.name,
      }));
    } else out.customers_error = r.error;
  }

  if (name) {
    const r = await stripeGet("/customers/search", {
      query: `name~"${name.replace(/"/g, "")}"`,
      limit,
    });
    if (r.ok) {
      const rows = (r.body.data || []).map((c: Record<string, unknown>) => ({
        id: c.id,
        email: c.email,
        name: c.name,
      }));
      const prev = Array.isArray(out.customers) ? out.customers : [];
      const seen = new Set(prev.map((x: { id?: string }) => x.id));
      for (const row of rows) {
        if (!seen.has(row.id)) prev.push(row);
      }
      out.customers = prev;
    } else if (!out.customers_error) out.customers_error = r.error;
  }

  if (amountPence) {
    const q = `amount:${amountPence} AND currency:"gbp"`;
    for (const resource of ["payment_intents", "charges"] as const) {
      const r = await stripeGet(`/${resource}/search`, { query: q, limit });
      const keyName = resource;
      if (r.ok) {
        out[keyName] = (r.body.data || []).map((x: Record<string, unknown>) => ({
          id: x.id,
          amount: x.amount,
          status: x.status,
          paid: x.paid,
          created: typeof x.created === "number"
            ? new Date(x.created * 1000).toISOString()
            : null,
          description: x.description || null,
          metadata: x.metadata || null,
          email: (x as { receipt_email?: string; billing_details?: { email?: string } })
            .receipt_email ||
            (x as { billing_details?: { email?: string } }).billing_details?.email ||
            null,
        }));
      } else {
        out[`${keyName}_error`] = r.error;
      }
    }
  }

  const cs = await stripeGet("/checkout/sessions", { limit, "expand[]": "data.payment_intent" });
  if (cs.ok) {
    out.checkout_sessions = (cs.body.data || []).map((x: Record<string, unknown>) => ({
      id: x.id,
      amount_total: x.amount_total,
      payment_status: x.payment_status,
      customer_email: x.customer_email,
      metadata: x.metadata || null,
      created: typeof x.created === "number"
        ? new Date(x.created * 1000).toISOString()
        : null,
    }));
  } else {
    out.checkout_error = cs.error;
  }

  const recentPi = await stripeGet("/payment_intents", { limit });
  if (recentPi.ok) {
    out.recent_payment_intents = (recentPi.body.data || []).map((x: Record<string, unknown>) => ({
      id: x.id,
      amount: x.amount,
      status: x.status,
      metadata: x.metadata || null,
      created: typeof x.created === "number"
        ? new Date(x.created * 1000).toISOString()
        : null,
    }));
  }

  return json(200, out);
});
