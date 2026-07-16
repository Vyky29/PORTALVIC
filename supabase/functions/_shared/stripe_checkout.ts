/** Stripe Checkout helpers for parent invoice payments (Deno, no SDK). */

const STRIPE_API = "https://api.stripe.com/v1";

/** Default UK card gross-up rate (conservative; covers EEA/international). Override via env if needed. */
const DEFAULT_FEE_PERCENT = 3.5;
const DEFAULT_FEE_FIXED_PENCE = 20;

export function stripeSecretKey(): string {
  return String(Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
}

export function stripeWebhookSecret(): string {
  return String(Deno.env.get("STRIPE_WEBHOOK_SECRET") || "").trim();
}

/** True when STRIPE_SECRET_KEY is a live key (sk_live_…). */
export function stripeIsLiveMode(): boolean {
  return stripeSecretKey().startsWith("sk_live_");
}

/** True when a usable secret is set. Test keys are treated as not configured for parent Checkout. */
export function stripeConfigured(): boolean {
  const key = stripeSecretKey();
  if (!key) return false;
  // Parent portal must collect real funds — reject Stripe test mode.
  if (key.startsWith("sk_test_")) return false;
  return key.startsWith("sk_live_") || key.startsWith("rk_live_");
}

/** Percent fee used for gross-up (e.g. 3.5). Env: STRIPE_FEE_PERCENT */
export function stripeFeePercent(): number {
  const raw = Number(Deno.env.get("STRIPE_FEE_PERCENT"));
  if (Number.isFinite(raw) && raw >= 0 && raw < 50) return raw;
  return DEFAULT_FEE_PERCENT;
}

/** Fixed fee in pence (e.g. 20 = £0.20). Env: STRIPE_FEE_FIXED_PENCE */
export function stripeFeeFixedPence(): number {
  const raw = Number(Deno.env.get("STRIPE_FEE_FIXED_PENCE"));
  if (Number.isFinite(raw) && raw >= 0 && raw < 10000) return Math.round(raw);
  return DEFAULT_FEE_FIXED_PENCE;
}

/**
 * Gross-up so after Stripe's % + fixed fee, the club nets `netPence`.
 * charge ≈ ceil((net + fixed) / (1 - rate))
 */
export function stripeGrossUpPence(netPence: number): {
  net_pence: number;
  charge_pence: number;
  fee_pence: number;
  fee_percent: number;
  fee_fixed_pence: number;
} {
  const net = Math.max(0, Math.round(Number(netPence) || 0));
  const feePercent = stripeFeePercent();
  const feeFixed = stripeFeeFixedPence();
  const rate = feePercent / 100;
  if (rate <= 0) {
    const charge = net + feeFixed;
    return {
      net_pence: net,
      charge_pence: charge,
      fee_pence: charge - net,
      fee_percent: feePercent,
      fee_fixed_pence: feeFixed,
    };
  }
  const charge = Math.ceil((net + feeFixed) / (1 - rate));
  return {
    net_pence: net,
    charge_pence: charge,
    fee_pence: Math.max(0, charge - net),
    fee_percent: feePercent,
    fee_fixed_pence: feeFixed,
  };
}

export function stripeGrossUpFromGbp(amountGbp: number) {
  const netPence = Math.round(Number(amountGbp) * 100);
  const g = stripeGrossUpPence(netPence);
  return {
    ...g,
    net_gbp: g.net_pence / 100,
    charge_gbp: g.charge_pence / 100,
    fee_gbp: g.fee_pence / 100,
  };
}

function toFormBody(params: Record<string, string | number | undefined | null>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.join("&");
}

export async function stripeCreateCheckoutSession(input: {
  amountPence: number;
  currency?: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  clientReferenceId: string;
  metadata: Record<string, string>;
}): Promise<{ ok: true; id: string; url: string } | { ok: false; error: string; detail?: string }> {
  const key = stripeSecretKey();
  if (!key) return { ok: false, error: "stripe_not_configured" };

  const meta = input.metadata || {};
  const body: Record<string, string | number> = {
    mode: "payment",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId,
    "line_items[0][price_data][currency]": (input.currency || "gbp").toLowerCase(),
    "line_items[0][price_data][product_data][name]": input.productName,
    "line_items[0][price_data][unit_amount]": Math.round(input.amountPence),
    "line_items[0][quantity]": 1,
    "payment_intent_data[metadata][invoice_share_id]": meta.invoice_share_id || "",
    "payment_intent_data[metadata][contact_id]": meta.contact_id || "",
  };
  for (const [k, v] of Object.entries(meta)) {
    if (!v) continue;
    body[`metadata[${k}]`] = v;
  }

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: toFormBody(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id || !json?.url) {
    const detail = String(json?.error?.message || json?.error || res.status);
    console.error("[stripeCreateCheckoutSession]", detail);
    return { ok: false, error: "stripe_session_failed", detail };
  }
  return { ok: true, id: String(json.id), url: String(json.url) };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verify Stripe-Signature header; returns parsed event JSON or null. */
export async function stripeVerifyAndParseEvent(
  rawBody: string,
  signatureHeader: string | null,
): Promise<Record<string, unknown> | null> {
  const secret = stripeWebhookSecret();
  if (!secret || !signatureHeader) return null;

  const parts = String(signatureHeader).split(",").map((p) => p.trim());
  let timestamp = "";
  const v1: string[] = [];
  for (const p of parts) {
    const [k, ...rest] = p.split("=");
    const val = rest.join("=");
    if (k === "t") timestamp = val;
    if (k === "v1") v1.push(val);
  }
  if (!timestamp || !v1.length) return null;

  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(ageSec) || ageSec > 300) return null;

  const expected = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  if (!v1.some((sig) => timingSafeEqual(sig, expected))) return null;

  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
}
