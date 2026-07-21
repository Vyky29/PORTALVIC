/** Xero ACCREC invoice create + contact resolve (Deno). */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  XERO_API,
  cleanXero,
  xeroAccessToken,
  xeroAuthHeaders,
  xeroConfigured,
} from "./xero_auth.ts";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export type XeroInvoicePushInput = {
  contactId: string;
  invoiceNumber: string;
  invoiceDateIso: string;
  dueDateIso: string | null;
  amountGbp: number;
  quantity: number;
  unitPriceGbp: number | null;
  lineDescription: string;
  reference: string | null;
  vatMode: "exempt" | "vat_20" | string | null;
  parentName: string;
  parentEmail: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  existingXeroContactId?: string | null;
  /** Multi-line invoice (re-enrolment products). When set, overrides single line fields. */
  lines?: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    itemCode?: string | null;
  }>;
};

export type XeroInvoicePushResult =
  | {
      ok: true;
      xero_invoice_id: string;
      xero_contact_id: string | null;
      invoice_number: string;
      reused?: boolean;
    }
  | { ok: false; error: string; detail?: string };

function xeroValidationDetail(json: Record<string, unknown>, fallback: string): string {
  const el = (json?.Elements as Array<Record<string, unknown>> | undefined)?.[0];
  const errs = (el?.ValidationErrors as Array<{ Message?: string }> | undefined) || [];
  const msgs = errs.map((e) => String(e?.Message || "").trim()).filter(Boolean);
  if (msgs.length) return msgs.join("; ");
  return String(json?.Message || json?.error || fallback);
}

async function xeroFindInvoicesByNumber(
  token: string,
  invoiceNumber: string,
): Promise<Array<{ id: string; status: string; number: string }>> {
  const num = cleanXero(invoiceNumber, 80);
  if (!num) return [];
  const url =
    `${XERO_API}/Invoices?where=` +
    encodeURIComponent(`InvoiceNumber=="${num.replace(/"/g, "")}"`);
  const res = await fetch(url, { headers: xeroAuthHeaders(token) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return [];
  const list = Array.isArray(json?.Invoices) ? json.Invoices : [];
  return list
    .map((inv: { InvoiceID?: string; Status?: string; InvoiceNumber?: string }) => ({
      id: String(inv.InvoiceID || "").trim(),
      status: String(inv.Status || "").toUpperCase(),
      number: String(inv.InvoiceNumber || num).trim(),
    }))
    .filter((inv: { id: string }) => !!inv.id);
}

/** Pick a free InvoiceNumber when the Portal number is locked by a VOIDED ACCREC. */
async function xeroAllocateInvoiceNumber(
  token: string,
  preferred: string,
): Promise<string> {
  const base = cleanXero(preferred, 70);
  const existing = await xeroFindInvoicesByNumber(token, base);
  const live = existing.find((inv) =>
    ["DRAFT", "SUBMITTED", "AUTHORISED", "PAID"].includes(inv.status)
  );
  if (live) return base;
  const voided = existing.some((inv) => inv.status === "VOIDED" || inv.status === "DELETED");
  if (!voided && !existing.length) return base;

  for (let i = 1; i <= 9; i++) {
    const candidate = `${base}-R${i}`;
    const hit = await xeroFindInvoicesByNumber(token, candidate);
    const blocking = hit.find((inv) =>
      ["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED", "DELETED"].includes(inv.status)
    );
    if (!blocking) return candidate;
  }
  return `${base}-R${Date.now().toString().slice(-4)}`;
}

async function xeroFindContactId(
  token: string,
  opts: { email: string | null; name: string },
): Promise<string | null> {
  const email = cleanXero(opts.email, 200).toLowerCase();
  if (email) {
    const url =
      `${XERO_API}/Contacts?where=` +
      encodeURIComponent(`EmailAddress=="${email.replace(/"/g, "")}"`);
    const res = await fetch(url, { headers: xeroAuthHeaders(token) });
    const json = await res.json().catch(() => ({}));
    const id = String(json?.Contacts?.[0]?.ContactID || "").trim();
    if (id) return id;
  }

  const name = cleanXero(opts.name, 120);
  if (name) {
    const url =
      `${XERO_API}/Contacts?where=` +
      encodeURIComponent(`Name=="${name.replace(/"/g, "")}"`);
    const res = await fetch(url, { headers: xeroAuthHeaders(token) });
    const json = await res.json().catch(() => ({}));
    const id = String(json?.Contacts?.[0]?.ContactID || "").trim();
    if (id) return id;
  }
  return null;
}

async function xeroCreateContact(
  token: string,
  input: XeroInvoicePushInput,
): Promise<{ ok: true; contact_id: string } | { ok: false; error: string; detail?: string }> {
  const name = cleanXero(input.parentName, 120) || "Parent / carer";
  const email = cleanXero(input.parentEmail, 200) || null;
  const addresses = [];
  const line1 = cleanXero(input.addressLine1, 120);
  if (line1) {
    addresses.push({
      AddressType: "STREET",
      AddressLine1: line1,
      AddressLine2: cleanXero(input.addressLine2, 120) || undefined,
      City: cleanXero(input.city, 80) || undefined,
      PostalCode: cleanXero(input.postcode, 20) || undefined,
      Country: "United Kingdom",
    });
  }

  const body = {
    Contacts: [
      {
        Name: name,
        EmailAddress: email || undefined,
        IsCustomer: true,
        Addresses: addresses.length ? addresses : undefined,
      },
    ],
  };

  const res = await fetch(`${XERO_API}/Contacts`, {
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
    return { ok: false, error: "xero_contact_create_failed", detail };
  }
  const id = String(json?.Contacts?.[0]?.ContactID || "").trim();
  if (!id) return { ok: false, error: "xero_contact_missing_id" };
  return { ok: true, contact_id: id };
}

export async function resolveOrCreateXeroContact(
  token: string,
  supabase: SupabaseClient,
  input: XeroInvoicePushInput,
): Promise<{ ok: true; contact_id: string } | { ok: false; error: string; detail?: string }> {
  let contactId = cleanXero(input.existingXeroContactId, 80);
  if (!contactId) {
    contactId = (await xeroFindContactId(token, {
      email: input.parentEmail,
      name: input.parentName,
    })) || "";
  }
  if (!contactId) {
    const created = await xeroCreateContact(token, input);
    if (!created.ok) return created;
    contactId = created.contact_id;
  }

  if (contactId && input.contactId) {
    await supabase
      .from("portal_parent_contacts")
      .update({ xero_contact_id: contactId, updated_at: new Date().toISOString() })
      .eq("contact_id", input.contactId)
      .is("xero_contact_id", null);
  }

  return { ok: true, contact_id: contactId };
}

/**
 * Create an AUTHORISED ACCREC invoice in Xero and return InvoiceID.
 * Line amounts are gross (VAT inclusive) when vat_mode is vat_20.
 */
export async function xeroCreateAccrecInvoice(
  input: XeroInvoicePushInput,
  supabase: SupabaseClient,
): Promise<XeroInvoicePushResult> {
  if (!xeroConfigured()) return { ok: false, error: "xero_not_configured" };

  const invoiceNumber = cleanXero(input.invoiceNumber, 80);
  const amount = Number(input.amountGbp);
  if (!invoiceNumber) return { ok: false, error: "invoice_number_required" };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "amount_required" };

  const token = await xeroAccessToken();
  if (!token) return { ok: false, error: "xero_auth_failed" };

  /* Reuse live Xero ACCREC with the same number; VOIDED numbers cannot be reused. */
  const existing = await xeroFindInvoicesByNumber(token, invoiceNumber);
  const reusable = existing.find((inv) =>
    ["DRAFT", "SUBMITTED", "AUTHORISED", "PAID"].includes(inv.status)
  );
  if (reusable) {
    return {
      ok: true,
      xero_invoice_id: reusable.id,
      xero_contact_id: cleanXero(input.existingXeroContactId, 80) || null,
      invoice_number: reusable.number || invoiceNumber,
      reused: true,
    };
  }

  const contact = await resolveOrCreateXeroContact(token, supabase, input);
  if (!contact.ok) return contact;

  const xeroInvoiceNumber = await xeroAllocateInvoiceNumber(token, invoiceNumber);

  const qtyRaw = Number(input.quantity);
  const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? round2(qtyRaw) : 1;
  let unit = Number(input.unitPriceGbp);
  if (!Number.isFinite(unit) || unit <= 0) unit = amount / quantity;
  unit = round4(unit);

  const vatMode = cleanXero(input.vatMode, 20).toLowerCase();
  const isExempt = vatMode === "exempt";
  /* UK Xero tax types: Exempt Income = EXEMPTOUTPUT; 20% (VAT on Income) = OUTPUT2 */
  const taxType = isExempt
    ? (cleanXero(Deno.env.get("XERO_TAX_TYPE_EXEMPT"), 40) || "EXEMPTOUTPUT")
    : (cleanXero(Deno.env.get("XERO_TAX_TYPE_VAT"), 40) || "OUTPUT2");
  /* 202 = Sales Structured Support Activity (VAT Exempt); 200 = Sales Structured Support (Taxable 20%) */
  const salesCode = isExempt
    ? (cleanXero(Deno.env.get("XERO_SALES_ACCOUNT_CODE_EXEMPT"), 40) || "202")
    : (cleanXero(Deno.env.get("XERO_SALES_ACCOUNT_CODE_VAT"), 40) ||
      cleanXero(Deno.env.get("XERO_SALES_ACCOUNT_CODE"), 40) ||
      "200");
  const description =
    cleanXero(input.lineDescription, 4000) ||
    "Structured activity support delivered for a SEND participant.";
  const invoiceDate = cleanXero(input.invoiceDateIso, 20) || new Date().toISOString().slice(0, 10);
  const dueDate = cleanXero(input.dueDateIso, 20) || invoiceDate;
  const reference =
    cleanXero(input.reference, 120) ||
    (xeroInvoiceNumber !== invoiceNumber ? invoiceNumber : invoiceNumber);

  /* Allow negative UnitAmount (Portal credits / vouchers). Qty stays > 0. */
  const inputLines = Array.isArray(input.lines)
    ? input.lines
        .map((ln) => ({
          description: cleanXero(ln.description, 4000) || description,
          quantity: Number(ln.quantity) > 0 ? round2(Number(ln.quantity)) : 1,
          unitAmount: round4(Number(ln.unitAmount)),
          itemCode: cleanXero(ln.itemCode, 80) || null,
        }))
        .filter((ln) => Number.isFinite(ln.unitAmount) && ln.unitAmount !== 0)
    : [];

  const lineItems =
    inputLines.length > 0
      ? inputLines.map((ln) => ({
          Description: ln.description,
          Quantity: ln.quantity,
          UnitAmount: ln.unitAmount,
          AccountCode: salesCode,
          TaxType: taxType,
          ...(ln.itemCode ? { ItemCode: ln.itemCode } : {}),
        }))
      : [
          {
            Description: description,
            Quantity: quantity,
            UnitAmount: unit,
            AccountCode: salesCode,
            TaxType: taxType,
          },
        ];

  const body = {
    Invoices: [
      {
        Type: "ACCREC",
        Contact: { ContactID: contact.contact_id },
        Date: invoiceDate,
        DueDate: dueDate,
        InvoiceNumber: xeroInvoiceNumber,
        Reference: reference,
        /* Inclusive for VAT-on-income gross amounts; Exclusive for exempt (0% EXEMPTOUTPUT). */
        LineAmountTypes: isExempt ? "Exclusive" : "Inclusive",
        Status: "AUTHORISED",
        LineItems: lineItems,
      },
    ],
  };

  const res = await fetch(`${XERO_API}/Invoices`, {
    method: "POST",
    headers: xeroAuthHeaders(token),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = xeroValidationDetail(json, String(res.status));
    console.error("[xeroCreateAccrecInvoice]", invoiceNumber, xeroInvoiceNumber, detail);
    return { ok: false, error: "xero_invoice_create_failed", detail };
  }

  const inv = json?.Invoices?.[0];
  const xeroInvoiceId = String(inv?.InvoiceID || "").trim();
  if (!xeroInvoiceId) {
    return {
      ok: false,
      error: "xero_invoice_missing_id",
      detail: JSON.stringify(json).slice(0, 400),
    };
  }

  return {
    ok: true,
    xero_invoice_id: xeroInvoiceId,
    xero_contact_id: contact.contact_id,
    invoice_number: String(inv?.InvoiceNumber || xeroInvoiceNumber),
  };
}
