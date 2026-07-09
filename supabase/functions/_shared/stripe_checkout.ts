/** Stripe Checkout helpers for parent invoice payments (Deno, no SDK). */

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeSecretKey(): string {
  return String(Deno.env.get("STRIPE_SECRET_KEY") || "").trim();
}

export function stripeWebhookSecret(): string {
  return String(Deno.env.get("STRIPE_WEBHOOK_SECRET") || "").trim();
}

export function stripeConfigured(): boolean {
  return !!stripeSecretKey();
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
