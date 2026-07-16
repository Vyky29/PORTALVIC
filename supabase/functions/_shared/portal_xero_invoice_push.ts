/**
 * Push one portal_parent_invoice_share row to Xero ACCREC (best-effort).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { xeroConfigured } from "./xero_auth.ts";
import { xeroCreateAccrecInvoice } from "./xero_invoices.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export type PortalXeroPushResult =
  | { ok: true; xero_invoice_id: string; skipped?: boolean }
  | { ok: false; error: string; detail?: string };

export async function pushPortalInvoiceShareToXero(
  admin: SupabaseClient,
  shareId: string,
): Promise<PortalXeroPushResult> {
  if (!xeroConfigured()) return { ok: false, error: "xero_not_configured" };

  const { data: share, error } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, contact_id, document_id, invoice_number, amount_gbp, due_date, quantity, unit_price_gbp, line_description, line_items, reference_text, vat_mode, xero_invoice_id, created_at, payment_status",
    )
    .eq("id", shareId)
    .maybeSingle();

  if (error || !share) {
    return { ok: false, error: "share_not_found", detail: error?.message };
  }
  if (clean(share.xero_invoice_id, 80)) {
    return { ok: true, xero_invoice_id: String(share.xero_invoice_id), skipped: true };
  }

  const cid = clean(share.contact_id, 120);
  const { data: parent } = await admin
    .from("portal_parent_contacts")
    .select(
      "parent_display, parent_first_name, parent_last_name, email, address_line1, address_line2, city, postcode, xero_contact_id",
    )
    .eq("contact_id", cid)
    .maybeSingle();

  const parentName =
    clean(parent?.parent_display, 120) ||
    [parent?.parent_first_name, parent?.parent_last_name].filter(Boolean).join(" ").trim() ||
    "Parent / carer";

  let invoiceDate = String(share.created_at || "").slice(0, 10);
  if (share.document_id) {
    const { data: doc } = await admin
      .from("documents")
      .select("created_at")
      .eq("id", share.document_id)
      .maybeSingle();
    if (doc?.created_at) invoiceDate = String(doc.created_at).slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
    invoiceDate = new Date().toISOString().slice(0, 10);
  }

  const vatMode = clean(share.vat_mode, 20) || "vat_20";
  const rawLines = Array.isArray(share.line_items) ? share.line_items : [];
  const xeroLines = rawLines
    .map((ln: Record<string, unknown>) => {
      const qty = Number(ln.quantity) > 0 ? Number(ln.quantity) : 1;
      const amt = Number(ln.amount_gbp);
      const unit = Number(ln.unit_price_gbp);
      const unitAmount = Number.isFinite(unit) && unit > 0
        ? unit
        : Number.isFinite(amt) && amt > 0
          ? amt / qty
          : 0;
      return {
        description: clean(ln.description, 800) || clean(share.line_description, 800),
        quantity: qty,
        unitAmount,
        itemCode: clean(ln.xero_item_code, 80) || null,
      };
    })
    .filter((ln) => ln.unitAmount > 0);

  const created = await xeroCreateAccrecInvoice(
    {
      contactId: cid,
      invoiceNumber: clean(share.invoice_number, 80),
      invoiceDateIso: invoiceDate,
      dueDateIso: share.due_date ? String(share.due_date).slice(0, 10) : null,
      amountGbp: Number(share.amount_gbp),
      quantity: Number(share.quantity) || 1,
      unitPriceGbp: share.unit_price_gbp != null ? Number(share.unit_price_gbp) : null,
      lineDescription: clean(share.line_description, 800) || clean(share.invoice_number, 80),
      reference: clean(share.reference_text, 120) || clean(share.invoice_number, 80),
      vatMode,
      parentName,
      parentEmail: clean(parent?.email, 200) || null,
      addressLine1: clean(parent?.address_line1, 120) || null,
      addressLine2: clean(parent?.address_line2, 120) || null,
      city: clean(parent?.city, 80) || null,
      postcode: clean(parent?.postcode, 20) || null,
      existingXeroContactId: clean(parent?.xero_contact_id, 80) || null,
      lines: xeroLines.length ? xeroLines : undefined,
    },
    admin,
  );

  if (!created.ok) {
    const now = new Date().toISOString();
    await admin
      .from("portal_parent_invoice_share")
      .update({
        xero_push_status: "failed",
        xero_push_error: clean(created.detail || created.error, 500),
        updated_at: now,
      })
      .eq("id", shareId);
    return { ok: false, error: created.error, detail: created.detail };
  }

  const now = new Date().toISOString();
  const { error: stampErr } = await admin
    .from("portal_parent_invoice_share")
    .update({
      xero_invoice_id: created.xero_invoice_id,
      xero_synced_at: now,
      xero_push_status: "pushed",
      xero_push_error: null,
      updated_at: now,
    })
    .eq("id", shareId)
    .is("xero_invoice_id", null);

  if (stampErr) {
    return {
      ok: false,
      error: "stamp_failed",
      detail: stampErr.message,
    };
  }

  return { ok: true, xero_invoice_id: created.xero_invoice_id };
}
