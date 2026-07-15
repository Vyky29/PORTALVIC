/**
 * Create one Portal family invoice (INV-P PDF + documents + share row).
 * Used by admin create_portal and re-enrolment auto-billing.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildPortalTaxInvoicePdf,
  type PortalInvoiceVatMode,
} from "./portal_tax_invoice_pdf.ts";

const BUCKET = "documents";

export type PortalFamilyInvoiceCreateInput = {
  contactId: string;
  amountGbp: number;
  dueDateIso: string | null;
  invoiceDateIso?: string | null;
  vatMode: PortalInvoiceVatMode;
  lineDescription: string;
  /**
   * Invoice / Xero Reference — prefer a term label (e.g. "Summer term 25/26").
   * Do not put Tide bank pay text here; parents should use the participant name.
   */
  reference?: string | null;
  /** Programme / activity for PDF Service meta (not invoice Reference). */
  service?: string | null;
  notes?: string | null;
  title?: string | null;
  quantity?: number;
  shareStatus?: "ready" | "hidden";
  paymentMethodHint?:
    | "bank_transfer"
    | "gocardless"
    | "payment_link"
    | "la_funded"
    | "other";
  createdVia: "portal" | "reenrolment";
  /** documents.user_id + storage folder owner (auth user). */
  ownerUserId: string;
  readyBy?: string | null;
  gocardlessUrl?: string | null;
  paymentLinkUrl?: string | null;
  paymentLinkSurchargeNote?: string | null;
  invoiceNumber?: string | null;
  /** When true, use lineDescription as the full PDF body (no Client's Name / Mode / VAT footer). */
  descriptionComplete?: boolean;
  clientIdLabel?: string | null;
  poLabel?: string | null;
};

export type PortalFamilyInvoiceCreateResult =
  | {
      ok: true;
      invoice: Record<string, unknown>;
      documentId: string;
      invoiceNumber: string;
      pdfStoragePath: string;
    }
  | { ok: false; error: string };

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

/** Keep line breaks for invoice description bodies (clean() would collapse them). */
function cleanMultiline(v: unknown, max = 2400): string {
  return String(v == null ? "" : v)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function createPortalFamilyInvoice(
  admin: SupabaseClient,
  input: PortalFamilyInvoiceCreateInput,
): Promise<PortalFamilyInvoiceCreateResult> {
  const contactId = clean(input.contactId, 120);
  if (!contactId) return { ok: false, error: "contact_id_required" };

  const amount = Number(input.amountGbp);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "amount_required" };
  }
  const amountGbp = round2(amount);

  const ownerId = clean(input.ownerUserId, 80);
  if (!ownerId) return { ok: false, error: "owner_required" };

  const vatMode: PortalInvoiceVatMode = input.vatMode === "exempt" ? "exempt" : "vat_20";
  const qtyRaw = Number(input.quantity);
  const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.round(qtyRaw * 100) / 100 : 1;
  const dueDate = input.dueDateIso && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDateIso)
    ? input.dueDateIso
    : null;
  const invoiceDate =
    (input.invoiceDateIso && /^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDateIso)
      ? input.invoiceDateIso
      : null) || new Date().toISOString().slice(0, 10);
  const reference = clean(input.reference, 120) || null;
  const service = clean(input.service, 80) || null;
  const lineDescription =
    cleanMultiline(input.lineDescription, 2400) ||
    "Structured activity support delivered for a SEND participant.";
  const notes = clean(input.notes, 800) || null;
  const shareStatus = input.shareStatus === "hidden" ? "hidden" : "ready";
  const paymentMethodHint =
    input.paymentMethodHint ||
    (vatMode === "exempt" ? "la_funded" : "bank_transfer");
  const clientIdLabel = clean(input.clientIdLabel, 80) || contactId;
  const poLabel = clean(input.poLabel, 80);
  const now = new Date().toISOString();
  const readyBy = clean(input.readyBy, 120) || "portal";

  const { data: participant } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name, parent_person_id")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!participant) return { ok: false, error: "participant_not_found" };

  const displayName =
    clean(participant.display_name, 120) ||
    [participant.first_name, participant.last_name].filter(Boolean).join(" ").trim() ||
    contactId;

  const { data: parentContact } = await admin
    .from("portal_parent_contacts")
    .select(
      "parent_display, parent_first_name, parent_last_name, address_line1, address_line2, city, postcode",
    )
    .eq("contact_id", contactId)
    .maybeSingle();

  const billToName =
    clean(parentContact?.parent_display, 120) ||
    [parentContact?.parent_first_name, parentContact?.parent_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Parent / carer";
  const billToLines = [
    clean(parentContact?.address_line1, 120),
    clean(parentContact?.address_line2, 120),
    clean(parentContact?.city, 80),
    clean(parentContact?.postcode, 20),
    "UNITED KINGDOM",
  ].filter(Boolean);

  let invoiceNumber = clean(input.invoiceNumber, 80);
  if (!invoiceNumber) {
    const { data: allocated, error: allocErr } = await admin.rpc(
      "portal_allocate_invoice_number",
      { p_series: "INV-P" },
    );
    if (allocErr || !allocated) {
      console.error("[createPortalFamilyInvoice] allocate", allocErr?.message);
      return { ok: false, error: "invoice_number_failed" };
    }
    invoiceNumber = String(allocated);
  }

  const unitPrice = Math.round((amountGbp / quantity) * 10000) / 10000;
  const modeLabel =
    paymentMethodHint === "gocardless"
      ? "Direct Payment (GoCardless)"
      : paymentMethodHint === "la_funded" || vatMode === "exempt"
        ? "LA funded (VAT exempt)"
        : paymentMethodHint === "payment_link"
          ? "Card / Apple Pay"
          : "Bank transfer / Card (parent portal)";
  const descriptionFromInput = String(lineDescription)
    .split("\n")
    .map((s) => s.trimEnd())
    .filter((s, i, arr) => s || (i > 0 && i < arr.length - 1));
  const descriptionLines = input.descriptionComplete
    ? descriptionFromInput.slice(0, 24)
    : vatMode === "exempt"
      ? [
          ...descriptionFromInput.slice(0, 12),
          "",
          `Client's Id: ${clientIdLabel}`,
          `PO: ${poLabel}`,
          quantity !== 1 ? `- Quantity: ${quantity}` : null,
          reference ? `- Reference: ${reference}` : null,
          `- Mode: ${modeLabel}`,
          "- VAT: Exempt",
        ].filter((x): x is string => !!x)
      : [
          // Keep blank lines from the lead (title / body spacing).
          ...descriptionFromInput.slice(0, 12),
          "",
          `Client's Name: ${displayName}`,
          quantity !== 1 ? `- Quantity: ${quantity}` : null,
          reference ? `- Reference: ${reference}` : null,
          `- Mode: ${modeLabel}`,
          "- VAT: 20% (private funding)",
        ].filter((x): x is string => !!x);


  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildPortalTaxInvoicePdf({
      invoiceNumber,
      invoiceDateIso: invoiceDate,
      dueDateIso: dueDate,
      reference,
      service,
      vatMode,
      totalGbp: amountGbp,
      quantity,
      descriptionLines,
      billToName,
      billToLines,
      participantName: displayName,
      paid: false,
    });
  } catch (err) {
    console.error("[createPortalFamilyInvoice] pdf", err);
    return { ok: false, error: "pdf_failed" };
  }

  const stamp = Date.now();
  const storagePath = `${ownerId}/billing/client_invoice_${contactId}_${stamp}.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) {
    console.error("[createPortalFamilyInvoice] upload", upErr.message);
    return { ok: false, error: "upload_failed" };
  }

  const title =
    clean(input.title, 200) || `Invoice ${invoiceNumber} — ${displayName}`;

  const { data: doc, error: docErr } = await admin
    .from("documents")
    .insert({
      user_id: ownerId,
      document_type: "client_invoice",
      category: "billing",
      title,
      related_date: dueDate || invoiceDate,
      related_client: displayName,
      file_url: storagePath,
      source_page:
        input.createdVia === "reenrolment"
          ? "reenrolment_auto"
          : "admin_parent_invoices",
    })
    .select("id, title, file_url, related_client, related_date, created_at")
    .maybeSingle();
  if (docErr || !doc) {
    console.error("[createPortalFamilyInvoice] doc", docErr?.message);
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: "document_insert_failed" };
  }

  const shareRow = {
    document_id: doc.id,
    contact_id: contactId,
    invoice_number: invoiceNumber,
    amount_gbp: amountGbp,
    due_date: dueDate,
    payment_status: "unpaid",
    share_status: shareStatus,
    ready_at: shareStatus === "ready" ? now : null,
    ready_by: shareStatus === "ready" ? readyBy : null,
    notes,
    payment_method_hint: paymentMethodHint,
    gocardless_url: clean(input.gocardlessUrl, 500) || null,
    payment_link_url: clean(input.paymentLinkUrl, 500) || null,
    payment_link_surcharge_note: clean(input.paymentLinkSurchargeNote, 200) || null,
    created_via: input.createdVia,
    vat_mode: vatMode,
    line_description: lineDescription,
    quantity,
    unit_price_gbp: unitPrice,
    reference_text: reference,
    updated_at: now,
  };

  const { data: share, error: shareErr } = await admin
    .from("portal_parent_invoice_share")
    .insert(shareRow)
    .select("*")
    .maybeSingle();
  if (shareErr || !share) {
    console.error("[createPortalFamilyInvoice] share", shareErr?.message);
    await admin.from("documents").delete().eq("id", doc.id);
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: "share_insert_failed" };
  }

  return {
    ok: true,
    invoice: { ...share, title: doc.title },
    documentId: String(doc.id),
    invoiceNumber,
    pdfStoragePath: storagePath,
  };
}

/** Prefer env, else first admin staff profile id. */
export async function resolvePortalInvoiceOwnerUserId(
  admin: SupabaseClient,
): Promise<string | null> {
  const fromEnv = clean(Deno.env.get("PORTAL_INVOICE_OWNER_USER_ID"), 80);
  if (fromEnv) return fromEnv;

  const { data: adminStaff } = await admin
    .from("staff_profiles")
    .select("id")
    .eq("app_role", "admin")
    .order("full_name", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (adminStaff?.id) return String(adminStaff.id);

  const { data: anyStaff } = await admin
    .from("staff_profiles")
    .select("id")
    .not("id", "is", null)
    .limit(1)
    .maybeSingle();
  return anyStaff?.id ? String(anyStaff.id) : null;
}
