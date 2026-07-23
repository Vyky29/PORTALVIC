/**
 * Create one Portal family invoice (INV-P PDF + documents + share row).
 * Used by admin create_portal and re-enrolment auto-billing.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildPortalTaxInvoicePdf,
  type PortalInvoiceVatMode,
} from "./portal_tax_invoice_pdf.ts";
import {
  resolveLaFunderBillTo,
  resolveParticipantInvoiceFunding,
} from "./portal_invoice_funding.ts";
import {
  applyInstalmentPayment,
  type InvoicePaymentScheduleRow,
  nextInstalmentDueDate,
  normalizePaymentSchedule,
  paymentSchedulePlanShortLabel,
} from "./portal_invoice_payment_schedule.ts";
import {
  lineItemsToDescription,
  type PortalInvoiceLineItem,
} from "./portal_xero_product_catalog.ts";

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
  /** Planned instalments on this invoice (re-enrolment term invoices). */
  paymentSchedule?: InvoicePaymentScheduleRow[];
  billingTerm?: "autumn" | "spring" | "summer" | null;
  lineItems?: PortalInvoiceLineItem[];
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

type ParentContactBillRow = {
  parent_display?: string | null;
  parent_first_name?: string | null;
  parent_last_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  postcode?: string | null;
};

/** Parent/carer names + home address for private / Direct Payment invoices. */
async function resolveFamilyBillTo(
  admin: SupabaseClient,
  contactId: string,
): Promise<{ billToName: string; billToLines: string[] }> {
  const { data: rows } = await admin
    .from("portal_parent_contacts")
    .select(
      "parent_display, parent_first_name, parent_last_name, address_line1, address_line2, city, postcode",
    )
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true });

  const parents = (rows || []) as ParentContactBillRow[];
  const names: string[] = [];
  for (const row of parents) {
    const display =
      clean(row.parent_display, 120) ||
      [row.parent_first_name, row.parent_last_name].filter(Boolean).join(" ").trim();
    if (display && !names.some((n) => n.toLowerCase() === display.toLowerCase())) {
      names.push(display);
    }
  }
  const billToName =
    names.length === 0
      ? "Parent / carer"
      : names.length === 1
        ? names[0]
        : names.length === 2
          ? `${names[0]} & ${names[1]}`
          : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;

  const withAddress =
    parents.find((r) => clean(r.address_line1, 120) || clean(r.postcode, 20)) ||
    parents[0] ||
    null;
  const line1 = clean(withAddress?.address_line1, 120);
  const line2 = clean(withAddress?.address_line2, 120);
  const city = clean(withAddress?.city, 80);
  const postcode = clean(withAddress?.postcode, 20);
  const billToLines = [
    line1,
    line2 && line2.toLowerCase() !== city.toLowerCase() ? line2 : "",
    city,
    postcode,
    "UNITED KINGDOM",
  ].filter(Boolean);

  return { billToName, billToLines };
}

function invoicePaymentChannelLabel(paymentMethodHint: string): string {
  if (paymentMethodHint === "gocardless") return "Direct Payment (GoCardless)";
  if (paymentMethodHint === "la_funded") return "LA funded";
  if (paymentMethodHint === "payment_link") return "Card / Apple Pay";
  if (paymentMethodHint === "other") return "Other";
  return "Bank transfer";
}

/** Channel + schedule plan (flexi / one-off / per term / own). */
function invoiceModeLabel(
  paymentMethodHint: string,
  _vatMode: PortalInvoiceVatMode,
  schedule?: InvoicePaymentScheduleRow[],
  opts?: { notes?: string | null; dueDateIso?: string | null },
): string {
  const channel = invoicePaymentChannelLabel(paymentMethodHint);
  const plan = paymentSchedulePlanShortLabel(schedule || [], opts);
  return plan ? `${channel} · ${plan}` : channel;
}

function invoiceDescriptionLines(input: {
  lineDescription: string;
  vatMode: PortalInvoiceVatMode;
  descriptionComplete?: boolean;
  displayName: string;
  clientIdLabel: string;
  poLabel: string;
  quantity: number;
  reference: string | null;
  modeLabel: string;
  isLaFunded: boolean;
  hasLineItems: boolean;
}): string[] {
  const descriptionFromInput = String(input.lineDescription)
    .split("\n")
    .map((s) => s.trimEnd())
    .filter((s, i, arr) => s || (i > 0 && i < arr.length - 1));
  if (input.descriptionComplete) {
    return descriptionFromInput.slice(0, 24);
  }
  const firstBlank = descriptionFromInput.indexOf("");
  const descriptionBody = input.hasLineItems
    ? descriptionFromInput.slice(0, firstBlank >= 0 ? firstBlank : 1)
    : descriptionFromInput.slice(0, 12);
  if (input.isLaFunded) {
    return [
      ...descriptionBody,
      "",
      `Participant's Name: ${input.displayName}`,
      `Client ID: ${input.clientIdLabel}`,
      `PO: ${input.poLabel || "—"}`,
      input.reference ? `- Reference: ${input.reference}` : null,
      `- Payment Method: ${input.modeLabel}`,
    ].filter((x): x is string => x !== null);
  }
  return [
    ...descriptionBody,
    "",
    `Participant's Name: ${input.displayName}`,
    input.reference ? `- Reference: ${input.reference}` : null,
    `- Payment Method: ${input.modeLabel}`,
  ].filter((x): x is string => x !== null);
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

  /* Direct Payments / LA sheet always win over parent form choices that picked 20%. */
  const fundingUpfront = await resolveParticipantInvoiceFunding(admin, {
    contactId,
    displayName,
  });
  const vatMode: PortalInvoiceVatMode =
    input.vatMode === "exempt" || fundingUpfront.vatMode === "exempt"
      ? "exempt"
      : "vat_20";
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
    (input.lineItems?.length
      ? lineItemsToDescription(input.lineItems, { fundedProvision: vatMode === "exempt" })
      : "") ||
    cleanMultiline(input.lineDescription, 2400) ||
    "Structured activity support delivered for a SEND participant.";
  let notes = clean(input.notes, 800) || null; // Admin-only — never sent to parent portal.
  const shareStatus = input.shareStatus === "hidden" ? "hidden" : "ready";
  const paymentMethodHint =
    input.paymentMethodHint ||
    (vatMode === "exempt" ? "la_funded" : "bank_transfer");
  let clientIdLabel = clean(input.clientIdLabel, 80) || contactId;
  let poLabel = clean(input.poLabel, 80);
  const now = new Date().toISOString();
  const readyBy = clean(input.readyBy, 120) || "portal";

  if (paymentMethodHint === "la_funded" && (!clean(input.clientIdLabel, 80) || !poLabel)) {
    if (!clean(input.clientIdLabel, 80) && fundingUpfront.clientId) {
      clientIdLabel = clean(fundingUpfront.clientId, 80) || contactId;
    }
    if (!poLabel && fundingUpfront.po) poLabel = clean(fundingUpfront.po, 80);
  }

  // LA-managed invoices are billed to the funding authority, never the parent.
  let billToName: string;
  let billToLines: string[];
  let laAdminNote: string | null = null;
  if (paymentMethodHint === "la_funded") {
    const laBillTo = await resolveLaFunderBillTo(admin, { contactId, displayName });
    billToName = laBillTo.name;
    billToLines = laBillTo.lines;
    laAdminNote = laBillTo.adminNote;
  } else {
    const familyBillTo = await resolveFamilyBillTo(admin, contactId);
    billToName = familyBillTo.billToName;
    billToLines = familyBillTo.billToLines;
  }
  if (laAdminNote) {
    notes = notes ? `${notes}\n\n${laAdminNote}` : laAdminNote;
    notes = notes.slice(0, 800);
  }

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
  const createSchedule = input.paymentSchedule || [];
  const modeLabel = invoiceModeLabel(paymentMethodHint, vatMode, createSchedule, {
    notes: input.notes || null,
    dueDateIso: dueDate,
  });
  const isLaFunded = paymentMethodHint === "la_funded";
  const descriptionLines = invoiceDescriptionLines({
    lineDescription,
    vatMode,
    descriptionComplete: !!input.descriptionComplete,
    displayName,
    clientIdLabel,
    poLabel,
    quantity,
    reference,
    modeLabel,
    isLaFunded,
    hasLineItems: !!input.lineItems?.length,
  });

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
      lineItems: input.lineItems || [],
      billToName,
      billToLines,
      participantName: displayName,
      paid: false,
      isDraft: !isLaFunded,
      showStamp: !isLaFunded,
      paymentSchedule: createSchedule,
      amountPaidGbp: 0,
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

  const titleRaw = clean(input.title, 200);
  const title =
    titleRaw &&
    (titleRaw === invoiceNumber ||
      titleRaw.startsWith(invoiceNumber + " ") ||
      titleRaw.startsWith(invoiceNumber + "—") ||
      titleRaw.startsWith(invoiceNumber + "–") ||
      titleRaw.startsWith(invoiceNumber + "-") ||
      /^INV[-_P]/i.test(titleRaw))
      ? titleRaw
      : titleRaw
        ? `${invoiceNumber} — ${titleRaw.replace(/^Invoice\s+/i, "").trim()}`
        : `${invoiceNumber} — ${displayName}`;

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
    amount_paid_gbp: 0,
    payment_schedule: (input.paymentSchedule || []).length ? input.paymentSchedule : [],
    next_instalment_due:
      nextInstalmentDueDate(input.paymentSchedule || []) || dueDate,
    billing_term: input.billingTerm || null,
    line_items: (input.lineItems || []).length ? input.lineItems : [],
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

export async function regeneratePortalInvoiceSharePdf(
  admin: SupabaseClient,
  invoiceShareId: string,
): Promise<{ ok: true; pdfStoragePath: string } | { ok: false; error: string }> {
  const shareId = clean(invoiceShareId, 80);
  if (!shareId) return { ok: false, error: "invoice_id_required" };

  const { data: share, error: shareErr } = await admin
    .from("portal_parent_invoice_share")
    .select("*")
    .eq("id", shareId)
    .maybeSingle();
  if (shareErr || !share) return { ok: false, error: "not_found" };

  const { data: doc } = await admin
    .from("documents")
    .select("id, user_id, file_url, related_date, created_at")
    .eq("id", share.document_id)
    .maybeSingle();
  if (!doc?.id) return { ok: false, error: "document_not_found" };

  const contactId = clean(share.contact_id, 120);
  const { data: participant } = await admin
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name")
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!participant) return { ok: false, error: "participant_not_found" };

  const displayName =
    clean(participant.display_name, 120) ||
    [participant.first_name, participant.last_name].filter(Boolean).join(" ").trim() ||
    contactId;

  const funding = await resolveParticipantInvoiceFunding(admin, {
    contactId,
    displayName,
  });
  const storedVat = clean(share.vat_mode, 20).toLowerCase();
  // Prefer live funding when DP/LA is exempt — corrects stale vat_20 on Direct Payment shares.
  let vatMode: PortalInvoiceVatMode =
    storedVat === "exempt" || storedVat === "vat_20"
      ? (storedVat as PortalInvoiceVatMode)
      : funding.vatMode;
  if (funding.vatMode === "exempt") {
    vatMode = "exempt";
  }

  const hintForBillTo = clean(share.payment_method_hint, 40);
  let billToName: string;
  let billToLines: string[];
  let laAdminNote: string | null = null;
  if (hintForBillTo === "la_funded") {
    const laBillTo = await resolveLaFunderBillTo(admin, { contactId, displayName });
    billToName = laBillTo.name;
    billToLines = laBillTo.lines;
    laAdminNote = laBillTo.adminNote;
  } else {
    const familyBillTo = await resolveFamilyBillTo(admin, contactId);
    billToName = familyBillTo.billToName;
    billToLines = familyBillTo.billToLines;
  }

  const amountGbp = round2(Number(share.amount_gbp));
  const qtyRaw = Number(share.quantity);
  const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.round(qtyRaw * 100) / 100 : 1;
  const dueDate = share.due_date ? String(share.due_date).slice(0, 10) : null;
  const invoiceDate =
    (doc.related_date ? String(doc.related_date).slice(0, 10) : null) ||
    (doc.created_at ? String(doc.created_at).slice(0, 10) : null) ||
    new Date().toISOString().slice(0, 10);
  const reference = clean(share.reference_text, 120) || null;
  const lineItems = Array.isArray(share.line_items)
    ? (share.line_items as PortalInvoiceLineItem[])
    : [];
  const lineDescription =
    (lineItems.length
      ? lineItemsToDescription(lineItems, { fundedProvision: vatMode === "exempt" })
      : "") ||
    cleanMultiline(share.line_description, 2400) ||
    "Structured activity support delivered for a SEND participant.";
  const paymentMethodHint = clean(share.payment_method_hint, 40) || "bank_transfer";
  const invoiceNumber = clean(share.invoice_number, 80) || shareId.slice(0, 8);
  const clientIdLabel = funding.clientId || contactId;
  const poLabel = funding.po || "";
  const paymentSchedule = normalizePaymentSchedule(share.payment_schedule);
  const modeLabel = invoiceModeLabel(paymentMethodHint, vatMode, paymentSchedule, {
    notes: clean(share.notes, 800) || null,
    dueDateIso: dueDate,
  });
  const amountPaidGbp = round2(Number(share.amount_paid_gbp) || 0);
  const isPaid = String(share.payment_status || "").toLowerCase() === "paid";
  // Stored descriptions that already carry Client Id / PO / client name blocks
  // must not get a second metadata block appended on regeneration.
  const storedDescriptionComplete =
    !lineItems.length && /\bclient'?s?\s+(id|name)\s*:/i.test(lineDescription);
  const descriptionLines = invoiceDescriptionLines({
    lineDescription,
    vatMode,
    descriptionComplete: storedDescriptionComplete,
    displayName,
    clientIdLabel,
    poLabel,
    quantity,
    reference,
    modeLabel,
    isLaFunded: paymentMethodHint === "la_funded",
    hasLineItems: lineItems.length > 0,
  });

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await buildPortalTaxInvoicePdf({
      invoiceNumber,
      invoiceDateIso: invoiceDate,
      dueDateIso: dueDate,
      reference,
      service: null,
      vatMode,
      totalGbp: amountGbp,
      quantity,
      descriptionLines,
      lineItems,
      billToName,
      billToLines,
      participantName: displayName,
      paid: isPaid,
      isDraft: !isPaid,
      showStamp: paymentMethodHint !== "la_funded",
      paymentSchedule,
      amountPaidGbp,
    });
  } catch (err) {
    console.error("[regeneratePortalInvoiceSharePdf] pdf", err);
    return { ok: false, error: "pdf_failed" };
  }

  const ownerId = clean(doc.user_id, 80) || (await resolvePortalInvoiceOwnerUserId(admin));
  if (!ownerId) return { ok: false, error: "owner_required" };

  const stamp = Date.now();
  const storagePath = `${ownerId}/billing/client_invoice_${contactId}_${stamp}.pdf`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, pdfBytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (upErr) {
    console.error("[regeneratePortalInvoiceSharePdf] upload", upErr.message);
    return { ok: false, error: "upload_failed" };
  }

  const oldPath = doc.file_url ? String(doc.file_url) : "";
  const now = new Date().toISOString();
  const { error: docErr } = await admin
    .from("documents")
    .update({ file_url: storagePath })
    .eq("id", doc.id);
  if (docErr) {
    console.error("[regeneratePortalInvoiceSharePdf] doc", docErr.message);
    await admin.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, error: "document_update_failed" };
  }

  const sharePatch: Record<string, unknown> = { updated_at: now };
  if (!clean(share.vat_mode, 20) || (funding.vatMode === "exempt" && storedVat !== "exempt")) {
    sharePatch.vat_mode = vatMode;
  }
  if (lineItems.length && cleanMultiline(share.line_description, 2400) !== lineDescription) {
    sharePatch.line_description = lineDescription;
  }
  if (laAdminNote) {
    const existingNotes = clean(share.notes, 800);
    // Replace a previous LA bill-to block, or append.
    const withoutOld = existingNotes
      .replace(/\n?LA bill-to:[\s\S]*?(?=\n\n|$)/g, "")
      .trim();
    const merged = withoutOld ? `${withoutOld}\n\n${laAdminNote}` : laAdminNote;
    sharePatch.notes = merged.slice(0, 800);
  }
  await admin.from("portal_parent_invoice_share").update(sharePatch).eq("id", shareId);

  if (oldPath && oldPath !== storagePath) {
    await admin.storage.from(BUCKET).remove([oldPath]).catch(() => {});
  }

  return { ok: true, pdfStoragePath: storagePath };
}

/** Apply one instalment payment (or mark all paid) and regenerate the PDF. */
export async function recordInvoiceInstalmentPayment(
  admin: SupabaseClient,
  invoiceShareId: string,
  opts: {
    amountGbp: number;
    paidVia: string;
    markAll?: boolean;
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
  },
): Promise<
  | { ok: true; payment_status: string; amount_paid_gbp: number }
  | { ok: false; error: string }
> {
  const shareId = clean(invoiceShareId, 80);
  if (!shareId) return { ok: false, error: "invoice_id_required" };

  const { data: share, error: shareErr } = await admin
    .from("portal_parent_invoice_share")
    .select("*")
    .eq("id", shareId)
    .maybeSingle();
  if (shareErr || !share) return { ok: false, error: "not_found" };

  const now = new Date().toISOString();
  const schedule = normalizePaymentSchedule(share.payment_schedule);
  let payment_status = String(share.payment_status || "unpaid");
  let amount_paid_gbp = round2(Number(share.amount_paid_gbp) || 0);
  let next_instalment_due: string | null = share.next_instalment_due
    ? String(share.next_instalment_due).slice(0, 10)
    : null;
  let payment_schedule = schedule;

  if (schedule.length) {
    const applied = applyInstalmentPayment(schedule, {
      amountGbp: opts.amountGbp,
      paidAt: now,
      paidVia: opts.paidVia,
      markAll: !!opts.markAll,
    });
    payment_schedule = applied.schedule;
    amount_paid_gbp = applied.amount_paid_gbp;
    payment_status = applied.payment_status;
    next_instalment_due = applied.next_instalment_due;
  } else {
    const total = round2(Number(share.amount_gbp) || 0);
    amount_paid_gbp = opts.markAll
      ? total
      : round2(amount_paid_gbp + opts.amountGbp);
    if (total > 0 && amount_paid_gbp + 0.01 >= total) payment_status = "paid";
    else if (amount_paid_gbp > 0) payment_status = "partial";
    else payment_status = "unpaid";
  }

  const patch: Record<string, unknown> = {
    payment_status,
    amount_paid_gbp,
    payment_schedule,
    next_instalment_due,
    updated_at: now,
  };
  if (payment_status === "paid") {
    patch.paid_at = now;
    patch.paid_via = clean(opts.paidVia, 40) || "admin";
    patch.next_instalment_due = null;
  } else if (amount_paid_gbp > 0) {
    patch.paid_at = null;
    patch.paid_via = null;
  }
  if (opts.stripeCheckoutSessionId !== undefined) {
    patch.stripe_checkout_session_id = opts.stripeCheckoutSessionId || null;
  }
  if (opts.stripePaymentIntentId !== undefined) {
    patch.stripe_payment_intent_id = opts.stripePaymentIntentId || null;
  }

  const { error: updErr } = await admin
    .from("portal_parent_invoice_share")
    .update(patch)
    .eq("id", shareId);
  if (updErr) {
    console.error("[recordInvoiceInstalmentPayment]", updErr.message);
    return { ok: false, error: "update_failed" };
  }

  await regeneratePortalInvoiceSharePdf(admin, shareId).catch((e) => {
    console.error("[recordInvoiceInstalmentPayment] pdf", e);
  });

  return { ok: true, payment_status, amount_paid_gbp };
}
