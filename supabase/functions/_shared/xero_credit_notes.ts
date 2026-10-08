// @ts-nocheck — Xero ACCRECCREDIT create + allocate to ACCREC invoice.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  XERO_API,
  cleanXero,
  xeroAccessToken,
  xeroAuthHeaders,
  xeroConfigured,
} from "./xero_auth.ts";
import { resolveOrCreateXeroContact, type XeroInvoicePushInput } from "./xero_invoices.ts";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export type RefundCreditNoteInput = {
  contactId: string;
  parentName: string;
  parentEmail: string | null;
  existingXeroContactId?: string | null;
  amountGbp: number;
  vatMode: string | null;
  lineDescription: string;
  reference: string;
  invoiceXeroId: string;
  creditNoteNumberHint?: string | null;
  dateIso?: string | null;
};

export type RefundCreditNoteResult =
  | {
      ok: true;
      xero_credit_note_id: string;
      xero_credit_note_number: string;
      allocated: boolean;
    }
  | { ok: false; error: string; detail?: string };

function taxAndAccount(vatMode: string | null): {
  taxType: string;
  salesCode: string;
  lineAmountTypes: "Inclusive" | "Exclusive";
} {
  const vatModeNorm = clean(vatMode, 20).toLowerCase();
  const isExempt = vatModeNorm === "exempt";
  return {
    taxType: isExempt
      ? (cleanXero(Deno.env.get("XERO_TAX_TYPE_EXEMPT"), 40) || "EXEMPTOUTPUT")
      : (cleanXero(Deno.env.get("XERO_TAX_TYPE_VAT"), 40) || "OUTPUT2"),
    salesCode: isExempt
      ? (cleanXero(Deno.env.get("XERO_SALES_ACCOUNT_CODE_EXEMPT"), 40) || "202")
      : (cleanXero(Deno.env.get("XERO_SALES_ACCOUNT_CODE_VAT"), 40) ||
        cleanXero(Deno.env.get("XERO_SALES_ACCOUNT_CODE"), 40) ||
        "200"),
    lineAmountTypes: isExempt ? "Exclusive" : "Inclusive",
  };
}

async function xeroGetCreditNote(
  token: string,
  creditNoteId: string,
): Promise<Record<string, unknown> | null> {
  const id = cleanXero(creditNoteId, 80);
  if (!id) return null;
  const res = await fetch(`${XERO_API}/CreditNotes/${id}`, { headers: xeroAuthHeaders(token) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  return json?.CreditNotes?.[0] || null;
}

function cnAlreadyAllocatedToInvoice(
  cn: Record<string, unknown> | null,
  invoiceXeroId: string,
  amount: number,
): boolean {
  const invId = cleanXero(invoiceXeroId, 80);
  const allocs = (cn?.Allocations as Record<string, unknown>[]) || [];
  return allocs.some((a) => {
    const inv = a?.Invoice as Record<string, unknown> | undefined;
    const aid = cleanXero(inv?.InvoiceID, 80);
    const amt = round2(Number(a?.Amount) || 0);
    return aid === invId && Math.abs(amt - amount) < 0.02;
  });
}

async function xeroGetInvoiceAmountDue(
  token: string,
  invoiceXeroId: string,
): Promise<{ amountDue: number; status: string } | null> {
  const id = cleanXero(invoiceXeroId, 80);
  if (!id) return null;
  const res = await fetch(`${XERO_API}/Invoices/${id}`, { headers: xeroAuthHeaders(token) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const inv = json?.Invoices?.[0];
  return {
    amountDue: round2(Number(inv?.AmountDue) || 0),
    status: clean(inv?.Status, 20),
  };
}

async function xeroFindCreditNoteByNumber(
  token: string,
  number: string,
): Promise<{ id: string; number: string } | null> {
  const num = cleanXero(number, 80);
  if (!num) return null;
  const url =
    `${XERO_API}/CreditNotes?where=` +
    encodeURIComponent(`CreditNoteNumber=="${num.replace(/"/g, "")}"`);
  const res = await fetch(url, { headers: xeroAuthHeaders(token) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return null;
  const cn = json?.CreditNotes?.[0];
  const id = String(cn?.CreditNoteID || "").trim();
  if (!id) return null;
  return { id, number: String(cn?.CreditNoteNumber || num) };
}

export async function xeroCreateRefundCreditNote(
  admin: SupabaseClient,
  input: RefundCreditNoteInput,
): Promise<RefundCreditNoteResult> {
  if (!xeroConfigured()) return { ok: false, error: "xero_not_configured" };

  const amount = round2(Number(input.amountGbp) || 0);
  if (amount <= 0) return { ok: false, error: "amount_required" };

  const invoiceXeroId = cleanXero(input.invoiceXeroId, 80);
  if (!invoiceXeroId) return { ok: false, error: "invoice_xero_id_required" };

  const token = await xeroAccessToken();
  if (!token) return { ok: false, error: "xero_auth_failed" };

  const hint = cleanXero(input.creditNoteNumberHint, 80);
  if (hint) {
    const existing = await xeroFindCreditNoteByNumber(token, hint);
    if (existing) {
      const cnRow = await xeroGetCreditNote(token, existing.id);
      if (cnAlreadyAllocatedToInvoice(cnRow, invoiceXeroId, amount)) {
        return {
          ok: true,
          xero_credit_note_id: existing.id,
          xero_credit_note_number: existing.number,
          allocated: true,
        };
      }
      const alloc = await xeroAllocateCreditNoteToInvoice(
        token,
        existing.id,
        invoiceXeroId,
        amount,
      );
      return {
        ok: true,
        xero_credit_note_id: existing.id,
        xero_credit_note_number: existing.number,
        allocated: alloc.ok,
        ...(alloc.skipReason ? { allocation_skip_reason: alloc.skipReason } : {}),
      };
    }
  }

  const pushInput: XeroInvoicePushInput = {
    contactId: input.contactId,
    invoiceNumber: hint || "CN-REFUND",
    invoiceDateIso: clean(input.dateIso, 12) || new Date().toISOString().slice(0, 10),
    dueDateIso: null,
    amountGbp: amount,
    quantity: 1,
    unitPriceGbp: amount,
    lineDescription: clean(input.lineDescription, 4000) || "Refund — structured activity support",
    reference: clean(input.reference, 120),
    vatMode: input.vatMode,
    parentName: input.parentName,
    parentEmail: input.parentEmail,
    existingXeroContactId: input.existingXeroContactId,
  };

  const contact = await resolveOrCreateXeroContact(token, admin, pushInput);
  if (!contact.ok) return contact;

  const { taxType, salesCode, lineAmountTypes } = taxAndAccount(input.vatMode);
  const dateIso = pushInput.invoiceDateIso;

  const body: Record<string, unknown> = {
    CreditNotes: [
      {
        Type: "ACCRECCREDIT",
        Contact: { ContactID: contact.contact_id },
        Date: dateIso,
        LineAmountTypes: lineAmountTypes,
        Status: "AUTHORISED",
        Reference: pushInput.reference,
        ...(hint ? { CreditNoteNumber: hint } : {}),
        LineItems: [
          {
            Description: pushInput.lineDescription,
            Quantity: 1,
            UnitAmount: amount,
            AccountCode: salesCode,
            TaxType: taxType,
          },
        ],
      },
    ],
  };

  const res = await fetch(`${XERO_API}/CreditNotes`, {
    method: "POST",
    headers: xeroAuthHeaders(token),
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
    return { ok: false, error: "xero_credit_note_create_failed", detail };
  }

  const cn = json?.CreditNotes?.[0];
  const cnId = String(cn?.CreditNoteID || "").trim();
  const cnNum = String(cn?.CreditNoteNumber || hint || cnId).trim();
  if (!cnId) return { ok: false, error: "xero_credit_note_missing_id" };

  const alloc = await xeroAllocateCreditNoteToInvoice(token, cnId, invoiceXeroId, amount);
  if (!alloc.ok) {
    return {
      ok: true,
      xero_credit_note_id: cnId,
      xero_credit_note_number: cnNum,
      allocated: false,
      ...(alloc.skipReason ? { allocation_skip_reason: alloc.skipReason } : {}),
    };
  }

  return {
    ok: true,
    xero_credit_note_id: cnId,
    xero_credit_note_number: cnNum,
    allocated: true,
  };
}

async function xeroAllocateCreditNoteToInvoice(
  token: string,
  creditNoteId: string,
  invoiceId: string,
  amount: number,
): Promise<{ ok: boolean; detail?: string; skipReason?: string }> {
  const cnRow = await xeroGetCreditNote(token, creditNoteId);
  if (cnAlreadyAllocatedToInvoice(cnRow, invoiceId, amount)) {
    return { ok: true };
  }

  const invMeta = await xeroGetInvoiceAmountDue(token, invoiceId);
  if (invMeta && invMeta.amountDue <= 0.01) {
    console.warn(
      "[xeroAllocateCreditNote] skip — invoice paid off",
      invoiceId,
      "CN",
      creditNoteId,
    );
    return { ok: false, skipReason: "invoice_fully_paid" };
  }

  const body = {
    Allocations: [
      {
        Invoice: { InvoiceID: invoiceId },
        AppliedAmount: round2(amount),
      },
    ],
  };
  const res = await fetch(`${XERO_API}/CreditNotes/${creditNoteId}/Allocations`, {
    method: "PUT",
    headers: xeroAuthHeaders(token),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const ve =
      json?.Elements?.[0]?.ValidationErrors?.map((e: { Message?: string }) => e?.Message)
        .filter(Boolean)
        .join("; ") || "";
    const detail = String(ve || json?.Message || json?.error || res.status);
    console.warn("[xeroAllocateCreditNote]", creditNoteId, invoiceId, detail);
    const paidOff = /already been paid off/i.test(detail);
    return {
      ok: false,
      detail,
      ...(paidOff ? { skipReason: "invoice_fully_paid" } : {}),
    };
  }
  return { ok: true };
}
