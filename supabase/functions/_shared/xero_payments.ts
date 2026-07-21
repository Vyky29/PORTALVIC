/** Xero Accounting API helpers — payment write-back for parent invoices (Deno). */

import {
  XERO_API,
  cleanXero as clean,
  xeroAccessToken,
  xeroAuthHeaders,
  xeroConfigured,
} from "./xero_auth.ts";
import {
  xeroHydrateRefreshFromDb,
  xeroPersistRefreshToDb,
} from "./xero_oauth_store.ts";
import { pushPortalInvoiceShareToXero } from "./portal_xero_invoice_push.ts";

export { xeroConfigured };

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function xeroGetInvoice(
  token: string,
  invoiceId: string,
): Promise<{
  ok: true;
  amount_due: number;
  amount_paid: number;
  total: number;
  status: string;
} | { ok: false; error: string; detail?: string }> {
  const res = await fetch(`${XERO_API}/Invoices/${encodeURIComponent(invoiceId)}`, {
    headers: xeroAuthHeaders(token),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = String(
      json?.Message ||
        json?.Elements?.[0]?.ValidationErrors?.[0]?.Message ||
        json?.error ||
        res.status,
    );
    return { ok: false, error: "xero_invoice_fetch_failed", detail };
  }
  const inv = json?.Invoices?.[0] || {};
  return {
    ok: true,
    amount_due: Number(inv.AmountDue) || 0,
    amount_paid: Number(inv.AmountPaid) || 0,
    total: Number(inv.Total) || 0,
    status: String(inv.Status || ""),
  };
}

async function xeroResolveBankAccount(
  token: string,
): Promise<{ ok: true; account: { Code?: string; AccountID?: string } } | { ok: false; error: string; detail?: string }> {
  const configuredCode = clean(Deno.env.get("XERO_BANK_ACCOUNT_CODE"), 40);
  const configuredId = clean(Deno.env.get("XERO_BANK_ACCOUNT_ID"), 80);
  if (configuredId) return { ok: true, account: { AccountID: configuredId } };
  if (configuredCode) return { ok: true, account: { Code: configuredCode } };

  const res = await fetch(`${XERO_API}/Accounts?where=${encodeURIComponent('Type=="BANK"')}`, {
    headers: xeroAuthHeaders(token),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: "xero_bank_lookup_failed",
      detail: String(json?.Message || res.status),
    };
  }
  const accounts = Array.isArray(json?.Accounts) ? json.Accounts : [];
  const active = accounts.filter((a: { Status?: string }) => String(a.Status || "") === "ACTIVE");
  const gbp = active.filter((a: { CurrencyCode?: string }) => String(a.CurrencyCode || "GBP") === "GBP");
  const pool = gbp.length ? gbp : active.length ? active : accounts;
  const preferName = /tide|clubsensational|main/i;
  const pick =
    pool.find((a: { Name?: string }) => preferName.test(String(a.Name || ""))) ||
    pool[0];
  const accountId = clean(pick?.AccountID, 80);
  const code = clean(pick?.Code, 40);
  if (accountId) return { ok: true, account: { AccountID: accountId } };
  if (code) return { ok: true, account: { Code: code } };
  return {
    ok: false,
    error: "xero_bank_account_missing",
    detail: "Set XERO_BANK_ACCOUNT_ID (preferred) or XERO_BANK_ACCOUNT_CODE",
  };
}

/**
 * Post a payment against a Xero invoice (by InvoiceID GUID).
 * Uses XERO_BANK_ACCOUNT_ID / XERO_BANK_ACCOUNT_CODE when set; otherwise first GBP BANK account.
 */
export async function xeroCreateInvoicePayment(input: {
  xeroInvoiceId: string;
  amountGbp: number;
  reference?: string;
  dateIso?: string;
  accountCode?: string;
  accountId?: string;
  /** Reuse access token from a prior Xero call in the same request. */
  accessToken?: string;
}): Promise<{ ok: true; payment_id: string } | { ok: false; error: string; detail?: string }> {
  if (!xeroConfigured()) return { ok: false, error: "xero_not_configured" };

  const invoiceId = clean(input.xeroInvoiceId, 80);
  const amount = Number(input.amountGbp);
  if (!invoiceId) return { ok: false, error: "xero_invoice_id_required" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "amount_required" };

  const token = clean(input.accessToken, 4000) || (await xeroAccessToken());
  if (!token) return { ok: false, error: "xero_auth_failed" };

  let account: { Code?: string; AccountID?: string };
  const overrideId = clean(input.accountId, 80);
  const overrideCode = clean(input.accountCode, 40);
  if (overrideId) account = { AccountID: overrideId };
  else if (overrideCode) account = { Code: overrideCode };
  else {
    const resolved = await xeroResolveBankAccount(token);
    if (!resolved.ok) return { ok: false, error: resolved.error, detail: resolved.detail };
    account = resolved.account;
  }

  const reference = clean(input.reference, 200) || "Portal payment";
  const date = clean(input.dateIso, 20) || todayIsoDate();

  const body = {
    Payments: [
      {
        Invoice: { InvoiceID: invoiceId },
        Account: account,
        Date: date,
        Amount: Math.round(amount * 100) / 100,
        Reference: reference,
      },
    ],
  };

  const res = await fetch(`${XERO_API}/Payments`, {
    method: "POST",
    headers: xeroAuthHeaders(token),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = String(
      json?.Message ||
        json?.Elements?.[0]?.ValidationErrors?.[0]?.Message ||
        json?.Elements?.[0]?.ValidationErrors?.[0]?.Description ||
        json?.error ||
        res.status,
    );
    const acctLabel = account.AccountID || account.Code || "?";
    console.error("[xeroCreateInvoicePayment]", acctLabel, detail);
    return { ok: false, error: "xero_payment_failed", detail: `${detail} (account ${acctLabel})` };
  }

  const paymentId = String(json?.Payments?.[0]?.PaymentID || json?.PaymentID || "").trim();
  if (!paymentId) {
    return { ok: false, error: "xero_payment_missing_id", detail: JSON.stringify(json).slice(0, 300) };
  }
  return { ok: true, payment_id: paymentId };
}

export type XeroPaidShareSyncResult = {
  synced: boolean;
  payment_id?: string;
  skipped?: string;
  error?: string;
  detail?: string;
  /** Set when Ensure path created the ACCREC first. */
  pushed_invoice_id?: string;
};

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
  opts?: {
    /** Prefer bank/Tide booking date so Xero Find & Match / JAX can suggest OK. */
    paymentDateIso?: string | null;
  },
): Promise<XeroPaidShareSyncResult> {
  const xeroId = clean(share.xero_invoice_id, 80);
  if (!xeroId) return { synced: false, skipped: "no_xero_invoice_id" };
  if (clean(share.xero_payment_id, 80)) return { synced: false, skipped: "already_synced" };
  if (!xeroConfigured()) return { synced: false, skipped: "xero_not_configured" };

  await xeroHydrateRefreshFromDb(supabase);

  const portalAmount = Number(share.amount_gbp);
  if (!Number.isFinite(portalAmount) || portalAmount <= 0) {
    return { synced: false, skipped: "no_amount" };
  }

  const token = await xeroAccessToken();
  if (!token) {
    await xeroPersistRefreshToDb(supabase);
    return { synced: false, error: "xero_auth_failed", detail: "refresh_token_invalid — re-consent Xero" };
  }

  const inv = await xeroGetInvoice(token, xeroId);
  if (!inv.ok) {
    await xeroPersistRefreshToDb(supabase);
    return { synced: false, error: inv.error, detail: inv.detail };
  }

  const status = String(inv.status || "").toUpperCase();
  if (status === "VOIDED" || status === "DELETED") {
    const now = new Date().toISOString();
    await supabase
      .from("portal_parent_invoice_share")
      .update({
        xero_invoice_id: null,
        xero_payment_id: null,
        xero_push_status: null,
        xero_push_error: `cleared_${status.toLowerCase()}_xero_invoice`,
        updated_at: now,
      })
      .eq("id", share.id);
    await xeroPersistRefreshToDb(supabase);
    return {
      synced: false,
      error: "xero_invoice_voided",
      detail: `Xero invoice was ${status}; cleared link so Push can recreate`,
    };
  }

  /* Already fully paid in Xero — stamp a marker so we stop retrying. */
  if (inv.amount_due <= 0.009 && inv.amount_paid > 0) {
    const now = new Date().toISOString();
    const marker = `xero-already-paid:${xeroId.slice(0, 8)}`;
    await supabase
      .from("portal_parent_invoice_share")
      .update({
        xero_payment_id: marker,
        xero_synced_at: now,
        xero_push_error: null,
        updated_at: now,
      })
      .eq("id", share.id);
    await xeroPersistRefreshToDb(supabase);
    return { synced: true, payment_id: marker, skipped: "already_paid_in_xero" };
  }

  /*
   * Pay what Xero still owes when the ACCREC total differs from Portal
   * (e.g. credit applied in Portal after push). Prefer AmountDue so the
   * invoice flips to Paid; never overpay.
   */
  let payAmount = portalAmount;
  if (inv.amount_due > 0) {
    payAmount = Math.min(portalAmount, inv.amount_due);
    /* If Xero is higher (pre-credit push), pay the due balance so it clears. */
    if (inv.amount_due > portalAmount + 0.05) {
      payAmount = inv.amount_due;
    }
  }

  const via = clean(share.paid_via, 40) || "portal";
  const invNo = clean(share.invoice_number, 80);
  const payDate = clean(opts?.paymentDateIso, 20);
  const created = await xeroCreateInvoicePayment({
    xeroInvoiceId: xeroId,
    amountGbp: payAmount,
    reference: invNo ? `Portal ${via} · ${invNo}` : `Portal ${via}`,
    dateIso: /^\d{4}-\d{2}-\d{2}$/.test(payDate) ? payDate : undefined,
    accessToken: token,
  });

  if (!created.ok) {
    const detail = created.detail || created.error;
    const now = new Date().toISOString();
    await supabase
      .from("portal_parent_invoice_share")
      .update({
        xero_push_error: clean(detail, 500),
        updated_at: now,
      })
      .eq("id", share.id);
    await xeroPersistRefreshToDb(supabase);
    return { synced: false, error: created.error, detail };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("portal_parent_invoice_share")
    .update({
      xero_payment_id: created.payment_id,
      xero_synced_at: now,
      xero_push_error: null,
      updated_at: now,
    })
    .eq("id", share.id);

  await xeroPersistRefreshToDb(supabase);

  if (error) {
    console.error("[xeroSyncPaidInvoiceShare] stamp", error.message);
    return { synced: true, payment_id: created.payment_id, error: "stamp_failed", detail: error.message };
  }

  return { synced: true, payment_id: created.payment_id };
}

/**
 * Close Portal → Xero books for a paid INV-P:
 * 1) create ACCREC if missing
 * 2) post Payment (optional bank date for better match suggestions)
 *
 * Does **not** tick Xero bank-feed Reconcile — Xero blocks that via public API.
 */
export async function xeroEnsurePaidShareInBooks(
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
  opts?: {
    paymentDateIso?: string | null;
  },
): Promise<XeroPaidShareSyncResult> {
  if (!xeroConfigured()) return { synced: false, skipped: "xero_not_configured" };

  let xeroId = clean(share.xero_invoice_id, 80);
  let pushedInvoiceId: string | undefined;

  if (!xeroId) {
    const pushed = await pushPortalInvoiceShareToXero(supabase, String(share.id));
    if (!pushed.ok) {
      return {
        synced: false,
        error: pushed.error,
        detail: pushed.detail,
      };
    }
    xeroId = clean(pushed.xero_invoice_id, 80);
    pushedInvoiceId = xeroId || undefined;
    if (!xeroId) {
      return { synced: false, error: "xero_push_missing_id" };
    }
  }

  const sync = await xeroSyncPaidInvoiceShare(
    supabase,
    { ...share, xero_invoice_id: xeroId },
    opts,
  );
  return pushedInvoiceId ? { ...sync, pushed_invoice_id: pushedInvoiceId } : sync;
}
