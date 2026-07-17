/**
 * Push one portal_parent_invoice_share row to Xero ACCREC (best-effort).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { xeroConfigured } from "./xero_auth.ts";
import { xeroCreateAccrecInvoice } from "./xero_invoices.ts";
import { resolveLaFunderBillTo } from "./portal_invoice_funding.ts";

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
      "id, contact_id, document_id, invoice_number, amount_gbp, due_date, quantity, unit_price_gbp, line_description, line_items, reference_text, vat_mode, xero_invoice_id, created_at, payment_status, payment_method_hint",
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
  const { data: parentRows } = await admin
    .from("portal_parent_contacts")
    .select(
      "parent_display, parent_first_name, parent_last_name, email, address_line1, address_line2, city, postcode, xero_contact_id, created_at",
    )
    .eq("contact_id", cid)
    .order("created_at", { ascending: true });
  const parents = parentRows || [];
  const parentNames = parents
    .map((p) =>
      clean(p.parent_display, 120) ||
      [p.parent_first_name, p.parent_last_name].filter(Boolean).join(" ").trim(),
    )
    .filter(Boolean)
    .filter((n, i, arr) => arr.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i);
  const parent =
    parents.find((p) => clean(p.email, 200) || clean(p.xero_contact_id, 80)) ||
    parents[0] ||
    null;

  let parentName =
    parentNames.length === 0
      ? "Parent / carer"
      : parentNames.length === 1
        ? parentNames[0]
        : parentNames.length === 2
          ? `${parentNames[0]} & ${parentNames[1]}`
          : `${parentNames.slice(0, -1).join(", ")} & ${parentNames[parentNames.length - 1]}`;
  let parentEmail = clean(parent?.email, 200) || null;
  let addressLine1 = clean(parent?.address_line1, 120) || null;
  let addressLine2 = clean(parent?.address_line2, 120) || null;
  let city = clean(parent?.city, 80) || null;
  let postcode = clean(parent?.postcode, 20) || null;
  let existingXeroContactId = clean(parent?.xero_contact_id, 80) || null;

  // LA-managed invoices: the Xero customer is the funding authority, not the parent.
  if (clean(share.payment_method_hint, 40) === "la_funded") {
    const { data: pax } = await admin
      .from("portal_participants")
      .select("display_name, first_name, last_name, dob_iso")
      .eq("contact_id", cid)
      .maybeSingle();
    const paxName =
      clean(pax?.display_name, 120) ||
      [pax?.first_name, pax?.last_name].filter(Boolean).join(" ").trim() ||
      cid;
    const laBillTo = await resolveLaFunderBillTo(admin, {
      contactId: cid,
      displayName: paxName,
      dobIso: pax?.dob_iso ? String(pax.dob_iso) : null,
    });
    parentName = laBillTo.name;
    parentEmail = laBillTo.paymentEmail;
    // lines: org / street / city / postcode / UNITED KINGDOM (order varies by profile)
    const addr = laBillTo.lines.filter((l) => !/^UNITED KINGDOM$/i.test(l));
    const postcodeLine = addr.find((l) => /^[A-Z]{1,2}\d/i.test(l) && l.length <= 12) || null;
    const streetLine = addr.find((l) => /\d/.test(l) && l !== postcodeLine) || null;
    const cityLine =
      addr.find((l) => /london|hammersmith/i.test(l) && l !== streetLine) ||
      addr.find((l) => l !== streetLine && l !== postcodeLine && !/council|corporate|services/i.test(l)) ||
      null;
    const orgLine = addr.find((l) => /council|corporate|services/i.test(l) && l !== cityLine) || null;
    addressLine1 = streetLine;
    addressLine2 = orgLine;
    city = cityLine;
    postcode = postcodeLine;
    existingXeroContactId = null;
  }

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
      const unitAmount = Number.isFinite(unit) && unit !== 0
        ? unit
        : Number.isFinite(amt) && amt !== 0
          ? amt / qty
          : 0;
      const detail = clean(ln.detail, 200);
      const dates = clean(ln.dates, 500);
      const baseDesc = clean(ln.description, 800) || clean(share.line_description, 800);
      const description = [baseDesc, detail, dates].filter(Boolean).join("\n");
      return {
        description,
        quantity: qty,
        unitAmount,
        itemCode: clean(ln.xero_item_code, 80) || null,
      };
    })
    .filter((ln) => ln.unitAmount !== 0);

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
      parentEmail,
      addressLine1,
      addressLine2,
      city,
      postcode,
      existingXeroContactId,
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
