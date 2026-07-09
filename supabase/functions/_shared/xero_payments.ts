/** Xero Accounting API helpers — payment write-back for parent invoices (Deno). */

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";
const XERO_API = "https://api.xero.com/api.xro/2.0";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

export function xeroConfigured(): boolean {
  return !!(
    clean(Deno.env.get("XERO_CLIENT_ID"), 120) &&
    clean(Deno.env.get("XERO_CLIENT_SECRET"), 200) &&
    clean(Deno.env.get("XERO_REFRESH_TOKEN"), 500) &&
    clean(Deno.env.get("XERO_TENANT_ID"), 80)
  );
}

async function xeroAccessToken(): Promise<string | null> {
  const clientId = clean(Deno.env.get("XERO_CLIENT_ID"), 120);
  const clientSecret = clean(Deno.env.get("XERO_CLIENT_SECRET"), 200);
  const refreshToken = clean(Deno.env.get("XERO_REFRESH_TOKEN"), 500);
  if (!clientId || !clientSecret || !refreshToken) return null;

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refreshToken),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    console.error("[xeroAccessToken]", json?.error || res.status, json?.error_description || "");
    return null;
  }
  // Note: Xero rotates refresh tokens. Store the new refresh_token in secrets when you rotate.
  if (json.refresh_token && String(json.refresh_token) !== refreshToken) {
    console.warn(
      "[xeroAccessToken] Xero returned a new refresh_token — update XERO_REFRESH_TOKEN secret.",
    );
  }
  return String(json.access_token);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Post a payment against a Xero invoice (by InvoiceID GUID).
 * Uses XERO_BANK_ACCOUNT_CODE (default 090) as the bank/clearing account code in Xero.
 */
export async function xeroCreateInvoicePayment(input: {
  xeroInvoiceId: string;
  amountGbp: number;
  reference?: string;
  dateIso?: string;
}): Promise<{ ok: true; payment_id: string } | { ok: false; error: string; detail?: string }> {
  if (!xeroConfigured()) return { ok: false, error: "xero_not_configured" };

  const invoiceId = clean(input.xeroInvoiceId, 80);
  const amount = Number(input.amountGbp);
  if (!invoiceId) return { ok: false, error: "xero_invoice_id_required" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "amount_required" };

  const token = await xeroAccessToken();
  if (!token) return { ok: false, error: "xero_auth_failed" };

  const tenantId = clean(Deno.env.get("XERO_TENANT_ID"), 80);
  const accountCode = clean(Deno.env.get("XERO_BANK_ACCOUNT_CODE"), 40) || "090";
  const reference = clean(input.reference, 200) || "Portal payment";
  const date = clean(input.dateIso, 20) || todayIsoDate();

  const body = {
    Invoice: { InvoiceID: invoiceId },
    Account: { Code: accountCode },
    Date: date,
    Amount: Math.round(amount * 100) / 100,
    Reference: reference,
  };

  const res = await fetch(`${XERO_API}/Payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Xero-tenant-id": tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = String(
      json?.Message ||
        json?.Elements?.[0]?.ValidationErrors?.[0]?.Message ||
        json?.error ||
        res.status,
    );
    console.error("[xeroCreateInvoicePayment]", detail);
    return { ok: false, error: "xero_payment_failed", detail };
  }

  const paymentId = String(json?.Payments?.[0]?.PaymentID || json?.PaymentID || "").trim();
  if (!paymentId) {
    return { ok: false, error: "xero_payment_missing_id", detail: JSON.stringify(json).slice(0, 300) };
  }
  return { ok: true, payment_id: paymentId };
}

/**
 * Best-effort: if share has xero_invoice_id and Xero is configured, post payment and stamp row.
 * Never throws — callers should not fail parent payment on Xero errors.
 */
export async function xeroSyncPaidInvoiceShare(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  share: {
    id: string;
    xero_invoice_id?: string | null;
    xero_payment_id?: string | null;
    amount_gbp?: number | string | null;
    invoice_number?: string | null;
    paid_via?: string | null;
  },
): Promise<{ synced: boolean; payment_id?: string; skipped?: string; error?: string }> {
  const xeroId = clean(share.xero_invoice_id, 80);
  if (!xeroId) return { synced: false, skipped: "no_xero_invoice_id" };
  if (clean(share.xero_payment_id, 80)) return { synced: false, skipped: "already_synced" };
  if (!xeroConfigured()) return { synced: false, skipped: "xero_not_configured" };

  const amount = Number(share.amount_gbp);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { synced: false, skipped: "no_amount" };
  }

  const via = clean(share.paid_via, 40) || "portal";
  const invNo = clean(share.invoice_number, 80);
  const created = await xeroCreateInvoicePayment({
    xeroInvoiceId: xeroId,
    amountGbp: amount,
    reference: invNo ? `Portal ${via} · ${invNo}` : `Portal ${via}`,
  });

  if (!created.ok) {
    return { synced: false, error: created.error, skipped: created.detail };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("portal_parent_invoice_share")
    .update({
      xero_payment_id: created.payment_id,
      xero_synced_at: now,
      updated_at: now,
    })
    .eq("id", share.id);

  if (error) {
    console.error("[xeroSyncPaidInvoiceShare] stamp", error.message);
    return { synced: true, payment_id: created.payment_id, error: "stamp_failed" };
  }

  return { synced: true, payment_id: created.payment_id };
}
