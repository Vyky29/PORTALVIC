/** GoCardless API helpers for parent Direct Payment (Deno, no SDK). */

const GC_VERSION = "2015-07-06";

export function gocardlessAccessToken(): string {
  return String(Deno.env.get("GOCARDLESS_ACCESS_TOKEN") || "").trim();
}

export function gocardlessWebhookSecret(): string {
  return String(Deno.env.get("GOCARDLESS_WEBHOOK_SECRET") || "").trim();
}

export function gocardlessEnvironment(): "live" | "sandbox" {
  const raw = String(Deno.env.get("GOCARDLESS_ENVIRONMENT") || "").trim().toLowerCase();
  if (raw === "live" || raw === "production") return "live";
  const token = gocardlessAccessToken();
  if (token.startsWith("live_")) return "live";
  return "sandbox";
}

export function gocardlessApiBase(): string {
  return gocardlessEnvironment() === "live"
    ? "https://api.gocardless.com"
    : "https://api-sandbox.gocardless.com";
}

export function gocardlessConfigured(): boolean {
  return !!gocardlessAccessToken();
}

function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type GcApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; detail?: string; status?: number };

export async function gocardlessRequest<T = Record<string, unknown>>(
  method: string,
  path: string,
  body?: Record<string, unknown> | null,
  idempotencyKey?: string,
): Promise<GcApiResult<T>> {
  const token = gocardlessAccessToken();
  if (!token) return { ok: false, error: "gocardless_not_configured" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "GoCardless-Version": GC_VERSION,
    Accept: "application/json",
  };
  if (body) {
    headers["Content-Type"] = "application/json";
    headers["Idempotency-Key"] = idempotencyKey || newIdempotencyKey();
  }

  const res = await fetch(`${gocardlessApiBase()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = json?.error as Record<string, unknown> | undefined;
    const detail = String(
      errObj?.message || errObj?.error || json?.message || res.status,
    );
    console.error("[gocardlessRequest]", method, path, res.status, detail);
    return { ok: false, error: "gocardless_api_error", detail, status: res.status };
  }
  return { ok: true, data: json as T };
}

export async function gocardlessCreateBillingRequest(input: {
  contactId: string;
  parentPersonId?: string | null;
  description?: string;
  /** Optional first collection (pence). */
  paymentAmountPence?: number | null;
  paymentCurrency?: string;
  paymentDescription?: string;
  invoiceShareId?: string | null;
  invoiceNumber?: string | null;
}): Promise<
  GcApiResult<{
    id: string;
    status?: string;
    links?: Record<string, string>;
  }>
> {
  const metadata: Record<string, string> = {
    contact_id: input.contactId,
  };
  if (input.parentPersonId) metadata.parent_person_id = String(input.parentPersonId);
  if (input.invoiceShareId) metadata.invoice_share_id = String(input.invoiceShareId);
  if (input.invoiceNumber) metadata.invoice_number = String(input.invoiceNumber);

  const billing_requests: Record<string, unknown> = {
    mandate_request: {
      scheme: "bacs",
      metadata,
    },
    metadata,
  };
  if (input.description) {
    (billing_requests.mandate_request as Record<string, unknown>).description =
      input.description;
  }

  const amount = Math.round(Number(input.paymentAmountPence) || 0);
  if (amount > 0) {
    billing_requests.payment_request = {
      description:
        input.paymentDescription ||
        input.description ||
        "clubSENsational Direct Payment",
      amount,
      currency: (input.paymentCurrency || "GBP").toUpperCase(),
      metadata,
    };
  }

  const res = await gocardlessRequest<{
    billing_requests?: { id?: string; status?: string; links?: Record<string, string> };
  }>("POST", "/billing_requests", { billing_requests: billing_requests });
  if (!res.ok) return res;
  const br = res.data.billing_requests;
  if (!br?.id) return { ok: false, error: "gocardless_billing_request_missing" };
  return { ok: true, data: { id: String(br.id), status: br.status, links: br.links } };
}

export async function gocardlessCreateBillingRequestFlow(input: {
  billingRequestId: string;
  redirectUri: string;
  exitUri?: string;
}): Promise<GcApiResult<{ id: string; authorisation_url: string }>> {
  const billing_request_flows: Record<string, unknown> = {
    redirect_uri: input.redirectUri,
    links: { billing_request: input.billingRequestId },
  };
  if (input.exitUri) billing_request_flows.exit_uri = input.exitUri;

  const res = await gocardlessRequest<{
    billing_request_flows?: { id?: string; authorisation_url?: string };
  }>("POST", "/billing_request_flows", { billing_request_flows });
  if (!res.ok) return res;
  const flow = res.data.billing_request_flows;
  if (!flow?.id || !flow?.authorisation_url) {
    return { ok: false, error: "gocardless_flow_missing" };
  }
  return {
    ok: true,
    data: { id: String(flow.id), authorisation_url: String(flow.authorisation_url) },
  };
}

export async function gocardlessGetBillingRequest(id: string): Promise<
  GcApiResult<{
    id: string;
    status?: string;
    links?: Record<string, string>;
  }>
> {
  const res = await gocardlessRequest<{
    billing_requests?: { id?: string; status?: string; links?: Record<string, string> };
  }>("GET", `/billing_requests/${encodeURIComponent(id)}`);
  if (!res.ok) return res;
  const br = res.data.billing_requests;
  if (!br?.id) return { ok: false, error: "gocardless_billing_request_missing" };
  return { ok: true, data: { id: String(br.id), status: br.status, links: br.links || {} } };
}

/** Earliest valid charge date (YYYY-MM-DD) — today or later. */
export function gocardlessChargeDate(preferredIsoDate?: string | null): string {
  const today = new Date();
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, "0");
  const d = String(today.getUTCDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;
  const pref = String(preferredIsoDate || "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(pref) && pref >= todayStr) return pref;
  return todayStr;
}

export async function gocardlessCreatePayment(input: {
  mandateId: string;
  amountPence: number;
  currency?: string;
  description: string;
  chargeDate?: string | null;
  invoiceShareId?: string | null;
  contactId?: string | null;
  invoiceNumber?: string | null;
  idempotencyKey?: string;
}): Promise<GcApiResult<{ id: string; status?: string; charge_date?: string }>> {
  const amount = Math.round(Number(input.amountPence) || 0);
  if (amount <= 0) return { ok: false, error: "invalid_amount" };
  if (!input.mandateId) return { ok: false, error: "mandate_required" };

  const metadata: Record<string, string> = {};
  if (input.invoiceShareId) metadata.invoice_share_id = String(input.invoiceShareId);
  if (input.contactId) metadata.contact_id = String(input.contactId);
  if (input.invoiceNumber) metadata.invoice_number = String(input.invoiceNumber);

  const payments: Record<string, unknown> = {
    amount,
    currency: (input.currency || "GBP").toUpperCase(),
    description: String(input.description || "clubSENsational").slice(0, 100),
    charge_date: gocardlessChargeDate(input.chargeDate),
    links: { mandate: input.mandateId },
  };
  if (Object.keys(metadata).length) payments.metadata = metadata;

  const res = await gocardlessRequest<{
    payments?: { id?: string; status?: string; charge_date?: string };
  }>("POST", "/payments", { payments }, input.idempotencyKey);
  if (!res.ok) return res;
  const pay = res.data.payments;
  if (!pay?.id) return { ok: false, error: "gocardless_payment_missing" };
  return {
    ok: true,
    data: {
      id: String(pay.id),
      status: pay.status,
      charge_date: pay.charge_date,
    },
  };
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

/** Verify Webhook-Signature; returns parsed JSON or null. */
export async function gocardlessVerifyAndParseWebhook(
  rawBody: string,
  signatureHeader: string | null,
): Promise<Record<string, unknown> | null> {
  const secret = gocardlessWebhookSecret();
  if (!secret || !signatureHeader) return null;
  const expected = await hmacSha256Hex(secret, rawBody);
  const provided = String(signatureHeader).trim().toLowerCase();
  if (!timingSafeEqual(expected.toLowerCase(), provided)) return null;
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return null;
  }
}
