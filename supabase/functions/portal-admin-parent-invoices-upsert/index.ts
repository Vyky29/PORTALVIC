// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-invoices-upsert
// create (multipart PDF) | update metadata | set share/payment status.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { xeroEnsurePaidShareInBooks } from "../_shared/xero_payments.ts";
import { clearPaymentHoldForContact } from "../_shared/portal_payment_holds.ts";
import { type PortalInvoiceVatMode } from "../_shared/portal_tax_invoice_pdf.ts";
import { createPortalFamilyInvoice, regeneratePortalInvoiceSharePdf } from "../_shared/portal_create_family_invoice.ts";
import { confirmCrashSummerBookingsForInvoice } from "../_shared/crash_summer_confirm.ts";
import {
  applyInstalmentPayment,
  normalizePaymentSchedule,
} from "../_shared/portal_invoice_payment_schedule.ts";
import {
  parseBookingTermKey,
  parseNewClientPayPlan,
  quoteNewClientMidTermInvoice,
} from "../_shared/booking_portal_term_invoices.ts";
import { loadProductMap } from "../_shared/portal_xero_product_catalog.ts";

const BUCKET = "documents";
const MAX_BYTES = 12 * 1024 * 1024;

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function parseAmount(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseDate(v: unknown): string | null {
  const s = clean(v, 20);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function parsePaymentStatus(v: unknown): string | null {
  const s = clean(v, 20).toLowerCase();
  if (["unpaid", "paid", "partial", "void", "pending_confirmation"].includes(s)) return s;
  return null;
}

function parseShareStatus(v: unknown): string | null {
  const s = clean(v, 20).toLowerCase();
  if (s === "ready" || s === "hidden") return s;
  return null;
}

function parseMethodHint(v: unknown): string | null {
  const s = clean(v, 40).toLowerCase();
  if (["bank_transfer", "gocardless", "payment_link", "la_funded", "other"].includes(s)) return s;
  return null;
}

function parseHttpUrl(v: unknown, max = 500): string | null {
  const s = clean(v, max);
  if (!s) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString().slice(0, max);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  const userId = verified.userId || null;
  const readyBy = clean(verified.email || userId || "admin", 120);

  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  const isMultipart = contentType.includes("multipart/form-data");

  let action = "";
  let fields: Record<string, unknown> = {};
  let file: File | null = null;

  if (isMultipart) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return portalAdminJson(400, { ok: false, error: "bad_form" });
    }
    action = clean(form.get("action"), 30).toLowerCase() || "create";
    for (const key of [
      "invoice_id",
      "contact_id",
      "title",
      "invoice_number",
      "amount_gbp",
      "due_date",
      "payment_status",
      "share_status",
      "notes",
      "related_client",
      "payment_method_hint",
      "client_id_label",
      "po_label",
      "gocardless_url",
      "payment_link_url",
      "payment_link_surcharge_note",
      "xero_invoice_id",
      "paid_via",
    ]) {
      if (form.has(key)) fields[key] = form.get(key);
    }
    const f = form.get("file");
    if (f && typeof f === "object" && typeof (f as File).arrayBuffer === "function") {
      file = f as File;
    }
  } else {
    try {
      fields = await req.json();
    } catch {
      fields = {};
    }
    action = clean(fields.action, 30).toLowerCase();
  }

  if (action === "regenerate_pdf") {
    const invoiceId = clean(fields.invoice_id, 80);
    if (!invoiceId) return portalAdminJson(400, { ok: false, error: "invoice_id_required" });
    const regen = await regeneratePortalInvoiceSharePdf(admin, invoiceId);
    if (!regen.ok) {
      const status = regen.error === "not_found" ? 404 : 500;
      return portalAdminJson(status, { ok: false, error: regen.error });
    }
    const { data: invoice } = await admin
      .from("portal_parent_invoice_share")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();
    return portalAdminJson(200, {
      ok: true,
      invoice,
      pdf_storage_path: regen.pdfStoragePath,
    });
  }

  /**
   * Change re-enrolment funding route for a participant (Private ↔ Direct Payments ↔ LA managed).
   * Updates latest 2026/27 submission payload, contact labels, and unpaid INV-P VAT + PDF.
   */
  if (action === "set_reenrol_funding") {
    const contactId = clean(fields.contact_id, 120);
    const fundingRaw = clean(fields.funding, 40).toLowerCase();
    if (!contactId) return portalAdminJson(400, { ok: false, error: "contact_id_required" });

    type FundingKey = "direct_payments" | "private" | "la_managed";
    const fundingKey: FundingKey | null =
      fundingRaw === "direct_payments" || fundingRaw === "dp" || fundingRaw === "parent_direct_payment"
        ? "direct_payments"
        : fundingRaw === "private" || fundingRaw === "privately" || fundingRaw === "parent_private"
          ? "private"
          : fundingRaw === "la_managed" || fundingRaw === "la" || fundingRaw === "funder_invoice"
            ? "la_managed"
            : null;
    if (!fundingKey) {
      return portalAdminJson(400, {
        ok: false,
        error: "funding_invalid",
        message: "Use direct_payments, private, or la_managed",
      });
    }

    const presets: Record<
      FundingKey,
      {
        billing_mode: string;
        funding_code: string;
        funding_label: string;
        invoice_type_code: string;
        invoice_type_label: string;
        contact_funding_label: string;
        contact_payment_method_label: string;
        vat_mode: "exempt" | "vat_20";
        payment_method_hint: string | null;
        current_funding: string;
        current_invoice_type: string;
      }
    > = {
      direct_payments: {
        billing_mode: "direct_payments",
        funding_code: "la_direct_payments",
        funding_label: "Using funds from LA (Direct Payments from your EHCP care package)",
        invoice_type_code: "exempt",
        invoice_type_label: "EXEMPT VAT",
        contact_funding_label: "Direct Payments (LA)",
        contact_payment_method_label: "Parent invoice (EXEMPT)",
        vat_mode: "exempt",
        payment_method_hint: null,
        current_funding: "Funded · Direct Payments",
        current_invoice_type: "Parent (Exempt invoice)",
      },
      private: {
        billing_mode: "private",
        funding_code: "privately_funded",
        funding_label: "Privately",
        invoice_type_code: "vat_included",
        invoice_type_label: "Includes 20% VAT (in price)",
        contact_funding_label: "Private",
        contact_payment_method_label: "Parent invoice (20% VAT)",
        vat_mode: "vat_20",
        payment_method_hint: "bank_transfer",
        current_funding: "Private",
        current_invoice_type: "Parent (20% VAT)",
      },
      la_managed: {
        billing_mode: "funder_invoice",
        funding_code: "la_managed",
        funding_label: "LA managed (invoice to Local Authority)",
        invoice_type_code: "exempt",
        invoice_type_label: "EXEMPT VAT",
        contact_funding_label: "LA / NHS",
        contact_payment_method_label: "LA invoice (BACS)",
        vat_mode: "exempt",
        payment_method_hint: "la_funded",
        current_funding: "LA managed",
        current_invoice_type: "LA invoice (EXEMPT)",
      },
    };
    const preset = presets[fundingKey];

    const { data: sub, error: subErr } = await admin
      .from("portal_re_enrolment_submissions")
      .select("id, payload, participant_name")
      .eq("participant_contact_id", contactId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subErr) {
      console.error("[portal-admin-parent-invoices-upsert] set_reenrol_funding sub", subErr);
      return portalAdminJson(500, { ok: false, error: "submission_lookup_failed" });
    }
    if (!sub?.id) {
      return portalAdminJson(404, { ok: false, error: "reenrol_submission_not_found" });
    }

    const payload =
      sub.payload && typeof sub.payload === "object"
        ? structuredClone(sub.payload as Record<string, unknown>)
        : {};
    const fundingRoot =
      payload.funding && typeof payload.funding === "object"
        ? (payload.funding as Record<string, unknown>)
        : {};
    const choices =
      fundingRoot.choices_2627 && typeof fundingRoot.choices_2627 === "object"
        ? { ...(fundingRoot.choices_2627 as Record<string, unknown>) }
        : {};

    Object.assign(choices, {
      billing_mode: preset.billing_mode,
      funding_code: preset.funding_code,
      funding_label: preset.funding_label,
      invoice_type_code: preset.invoice_type_code,
      invoice_type_label: preset.invoice_type_label,
    });
    if (!choices.payment_method_code) choices.payment_method_code = "bank_transfer";
    if (!choices.payment_method_label) {
      choices.payment_method_label = "Bank Transfer / Card / Apple Pay (fixed due dates)";
    }

    fundingRoot.choices_2627 = choices;
    const current =
      fundingRoot.current_2526 && typeof fundingRoot.current_2526 === "object"
        ? { ...(fundingRoot.current_2526 as Record<string, unknown>) }
        : {};
    current.funding = preset.current_funding;
    current.invoice_type = preset.current_invoice_type;
    current.invoice_type_code = preset.invoice_type_code;
    fundingRoot.current_2526 = current;
    payload.funding = fundingRoot;
    payload.office_note = clean(
      `Office funding change → ${fundingKey} by ${readyBy} at ${now}`,
      400,
    );

    const { error: upSubErr } = await admin
      .from("portal_re_enrolment_submissions")
      .update({ payload })
      .eq("id", sub.id);
    if (upSubErr) {
      console.error("[portal-admin-parent-invoices-upsert] set_reenrol_funding update", upSubErr);
      return portalAdminJson(500, { ok: false, error: "submission_update_failed" });
    }

    await admin
      .from("portal_parent_contacts")
      .update({
        funding_label: preset.contact_funding_label,
        payment_method_label: preset.contact_payment_method_label,
      })
      .eq("contact_id", contactId);

    const { data: invRows } = await admin
      .from("portal_parent_invoice_share")
      .select("id, payment_status, vat_mode, payment_method_hint")
      .eq("contact_id", contactId)
      .neq("payment_status", "void");

    const pdfResults: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const inv of invRows || []) {
      if (String(inv.payment_status || "") === "paid") continue;
      const invPatch: Record<string, unknown> = {
        vat_mode: preset.vat_mode,
        updated_at: now,
      };
      if (preset.payment_method_hint) {
        invPatch.payment_method_hint = preset.payment_method_hint;
      } else if (fundingKey === "direct_payments") {
        // DP parents still pay by bank/card from their DP account — keep bank_transfer unless LA-funded.
        if (String(inv.payment_method_hint || "") === "la_funded") {
          invPatch.payment_method_hint = "bank_transfer";
        }
      }
      const { error: invErr } = await admin
        .from("portal_parent_invoice_share")
        .update(invPatch)
        .eq("id", inv.id);
      if (invErr) {
        pdfResults.push({ id: String(inv.id), ok: false, error: invErr.message });
        continue;
      }
      try {
        const regen = await regeneratePortalInvoiceSharePdf(admin, String(inv.id));
        pdfResults.push({
          id: String(inv.id),
          ok: regen.ok,
          error: regen.ok ? undefined : regen.error,
        });
      } catch (e) {
        pdfResults.push({
          id: String(inv.id),
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return portalAdminJson(200, {
      ok: true,
      funding: fundingKey,
      participant_name: sub.participant_name,
      submission_id: sub.id,
      invoices_updated: pdfResults,
    });
  }

  if (action === "preview_portal_midterm" || action === "create_portal_midterm") {
    if (!userId) {
      return portalAdminJson(401, { ok: false, error: "admin_user_required" });
    }
    const contactId = clean(fields.contact_id, 120);
    const term = parseBookingTermKey(fields.billing_term || fields.term);
    const plan = parseNewClientPayPlan(fields.pay_plan || fields.payment_schedule_code);
    const day = clean(fields.day || fields.weekday, 40);
    const unit = parseAmount(fields.unit_price_gbp ?? fields.price_per_session);
    const asOf = parseDate(fields.as_of || fields.start_date || fields.booking_date) ||
      new Date().toISOString().slice(0, 10);
    if (action === "create_portal_midterm" && !contactId) {
      return portalAdminJson(400, { ok: false, error: "contact_id_required" });
    }
    if (!term) return portalAdminJson(400, { ok: false, error: "billing_term_required" });
    if (!plan) return portalAdminJson(400, { ok: false, error: "pay_plan_required" });
    if (!day) return portalAdminJson(400, { ok: false, error: "day_required" });
    if (unit == null || unit <= 0) {
      return portalAdminJson(400, { ok: false, error: "unit_price_required" });
    }

    const vatRaw = clean(fields.vat_mode, 20).toLowerCase();
    const vatMode: PortalInvoiceVatMode = vatRaw === "exempt" ? "exempt" : "vat_20";
    let productMap = null;
    try {
      productMap = await loadProductMap(admin);
    } catch {
      productMap = null;
    }
    const quote = quoteNewClientMidTermInvoice({
      term,
      day,
      unitPriceGbp: unit,
      plan,
      asOfIso: asOf,
      serviceKey: clean(fields.service_key, 40) || null,
      serviceLabel: clean(fields.service_label || fields.service, 120) || null,
      detail: clean(fields.detail, 160) || null,
      vatMode,
      productMap,
    });
    if ("error" in quote) {
      return portalAdminJson(400, { ok: false, error: quote.error });
    }

    if (action === "preview_portal_midterm") {
      return portalAdminJson(200, { ok: true, quote });
    }

    const shareStatus =
      parseShareStatus(fields.share_status) ||
      (vatMode === "exempt" || quote.paymentMethodHint === "la_funded" ? "hidden" : "ready");
    const lineDescription =
      String(fields.line_description == null ? "" : fields.line_description).trim() ||
      quote.lineDescription;
    const created = await createPortalFamilyInvoice(admin, {
      contactId,
      amountGbp: quote.invoiceTotalGbp,
      dueDateIso: quote.paymentSchedule[0]?.due_date || asOf,
      invoiceDateIso: asOf,
      vatMode,
      lineDescription,
      reference: clean(fields.reference, 120) || quote.reference,
      service: clean(fields.service, 80) || clean(fields.service_label, 80) || null,
      notes:
        clean(fields.notes, 800) ||
        `New Booking Portal · mid-term pro-rata · ${plan} · ${quote.remainingSessions} session(s) from ${asOf}`,
      title: clean(fields.title, 200) || null,
      quantity: quote.remainingSessions,
      shareStatus,
      paymentMethodHint: quote.paymentMethodHint,
      createdVia: "portal",
      ownerUserId: userId,
      readyBy: readyBy || "office_new_client_midterm",
      invoiceNumber: clean(fields.invoice_number, 80) || null,
      clientIdLabel: clean(fields.client_id_label, 80) || contactId,
      poLabel: clean(fields.po_label, 80) || null,
      paymentSchedule: quote.paymentSchedule,
      billingTerm: quote.term,
      lineItems: quote.lineItems,
      descriptionComplete: false,
    });
    if (!created.ok) {
      const status =
        created.error === "participant_not_found"
          ? 404
          : created.error === "amount_required" || created.error === "contact_id_required"
            ? 400
            : 500;
      return portalAdminJson(status, { ok: false, error: created.error });
    }
    return portalAdminJson(200, {
      ok: true,
      invoice: created.invoice,
      quote,
      created_via: "portal_midterm",
    });
  }

  if (action === "create_portal") {
    // Create invoice in Portal (generate TAX INVOICE PDF) — no Xero upload.
    const contactId = clean(fields.contact_id, 120);
    if (!contactId) return portalAdminJson(400, { ok: false, error: "contact_id_required" });
    if (!userId) {
      return portalAdminJson(401, { ok: false, error: "admin_user_required" });
    }

    const vatRaw = clean(fields.vat_mode, 20).toLowerCase();
    const vatMode: PortalInvoiceVatMode = vatRaw === "exempt" ? "exempt" : "vat_20";
    const amount = parseAmount(fields.amount_gbp);
    if (amount == null || amount <= 0) {
      return portalAdminJson(400, { ok: false, error: "amount_required" });
    }
    const qtyRaw = Number(fields.quantity);
    const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.round(qtyRaw * 100) / 100 : 1;
    const dueDate = parseDate(fields.due_date);
    const invoiceDate =
      parseDate(fields.invoice_date) || new Date().toISOString().slice(0, 10);
    const reference = clean(fields.reference, 120) || null;
    const service = clean(fields.service, 80) || null;
    const lineDescription =
      String(fields.line_description == null ? "" : fields.line_description).trim() ||
      "Structured activity support delivered for a SEND participant.";
    const methodHint =
      parseMethodHint(fields.payment_method_hint) ||
      (vatMode === "exempt" ? "la_funded" : "bank_transfer");
    const clientIdLabel = clean(fields.client_id_label, 80) || contactId;
    const poLabel = clean(fields.po_label, 80);
    if (vatMode === "exempt" && !poLabel) {
      return portalAdminJson(400, { ok: false, error: "po_required_for_la" });
    }
    // LA funded: keep in Admin / Xero, hide from parent portal (LA pays, not the family).
    const shareStatus =
      parseShareStatus(fields.share_status) ||
      (vatMode === "exempt" || methodHint === "la_funded" ? "hidden" : "ready");

    const created = await createPortalFamilyInvoice(admin, {
      contactId,
      amountGbp: amount,
      dueDateIso: dueDate,
      invoiceDateIso: invoiceDate,
      vatMode,
      lineDescription,
      reference,
      service,
      notes,
      title: clean(fields.title, 200) || null,
      quantity,
      shareStatus,
      paymentMethodHint: methodHint,
      createdVia: "portal",
      ownerUserId: userId,
      readyBy,
      gocardlessUrl: parseHttpUrl(fields.gocardless_url),
      paymentLinkUrl: parseHttpUrl(fields.payment_link_url),
      paymentLinkSurchargeNote: clean(fields.payment_link_surcharge_note, 200) || null,
      invoiceNumber: clean(fields.invoice_number, 80) || null,
      clientIdLabel,
      poLabel,
    });
    if (!created.ok) {
      const status =
        created.error === "participant_not_found"
          ? 404
          : created.error === "amount_required" || created.error === "contact_id_required"
            ? 400
            : 500;
      return portalAdminJson(status, { ok: false, error: created.error });
    }

    return portalAdminJson(200, {
      ok: true,
      invoice: created.invoice,
      created_via: "portal",
    });
  }

  if (action === "create") {
    const contactId = clean(fields.contact_id, 120);
    if (!contactId) return portalAdminJson(400, { ok: false, error: "contact_id_required" });
    if (!file) return portalAdminJson(400, { ok: false, error: "file_required" });
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return portalAdminJson(400, { ok: false, error: "file_too_large" });
    }
    const mime = clean(file.type || "application/pdf", 80).toLowerCase();
    if (!mime.includes("pdf") && !String(file.name || "").toLowerCase().endsWith(".pdf")) {
      return portalAdminJson(400, { ok: false, error: "pdf_required" });
    }

    const { data: participant } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name")
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!participant) {
      return portalAdminJson(404, { ok: false, error: "participant_not_found" });
    }
    const displayName =
      clean(participant.display_name, 120) ||
      [participant.first_name, participant.last_name].filter(Boolean).join(" ").trim() ||
      contactId;

    const invoiceNumber = clean(fields.invoice_number, 80) || null;
    const amount = parseAmount(fields.amount_gbp);
    const dueDate = parseDate(fields.due_date);
    const paymentStatus = parsePaymentStatus(fields.payment_status) || "unpaid";
    const shareStatus = parseShareStatus(fields.share_status) || "ready";
    const notes = clean(fields.notes, 800) || null;
    const title =
      clean(fields.title, 200) ||
      (invoiceNumber ? `Invoice ${invoiceNumber}` : `Invoice — ${displayName}`);

    const ownerId = userId;
    if (!ownerId) {
      return portalAdminJson(401, { ok: false, error: "admin_user_required" });
    }
    const stamp = Date.now();
    const storagePath = `${ownerId}/billing/client_invoice_${contactId}_${stamp}.pdf`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) {
      console.error("[portal-admin-parent-invoices-upsert] upload", upErr.message);
      return portalAdminJson(500, { ok: false, error: "upload_failed" });
    }

    const { data: doc, error: docErr } = await admin
      .from("documents")
      .insert({
        user_id: ownerId,
        document_type: "client_invoice",
        category: "billing",
        title,
        related_date: dueDate,
        related_client: displayName,
        file_url: storagePath,
        source_page: "admin_parent_invoices",
      })
      .select("id, title, file_url, related_client, related_date, created_at")
      .maybeSingle();
    if (docErr || !doc) {
      console.error("[portal-admin-parent-invoices-upsert] doc", docErr?.message);
      await admin.storage.from(BUCKET).remove([storagePath]);
      return portalAdminJson(500, { ok: false, error: "document_insert_failed" });
    }

    const xeroInvoiceId = clean(fields.xero_invoice_id, 80) || null;
    const shareRow = {
      document_id: doc.id,
      contact_id: contactId,
      invoice_number: invoiceNumber,
      amount_gbp: amount,
      due_date: dueDate,
      payment_status: paymentStatus,
      share_status: shareStatus,
      ready_at: shareStatus === "ready" ? now : null,
      ready_by: shareStatus === "ready" ? readyBy : null,
      notes,
      payment_method_hint: parseMethodHint(fields.payment_method_hint) || "bank_transfer",
      gocardless_url: parseHttpUrl(fields.gocardless_url),
      payment_link_url: parseHttpUrl(fields.payment_link_url),
      payment_link_surcharge_note: clean(fields.payment_link_surcharge_note, 200) || null,
      xero_invoice_id: xeroInvoiceId,
      created_via: "upload",
      updated_at: now,
    };

    const { data: share, error: shareErr } = await admin
      .from("portal_parent_invoice_share")
      .insert(shareRow)
      .select("*")
      .maybeSingle();
    if (shareErr || !share) {
      console.error("[portal-admin-parent-invoices-upsert] share", shareErr?.message);
      await admin.from("documents").delete().eq("id", doc.id);
      await admin.storage.from(BUCKET).remove([storagePath]);
      return portalAdminJson(500, { ok: false, error: "share_insert_failed" });
    }

    return portalAdminJson(200, { ok: true, invoice: { ...share, title: doc.title } });
  }

  if (action === "update") {
    const invoiceId = clean(fields.invoice_id, 60);
    if (!invoiceId) return portalAdminJson(400, { ok: false, error: "invoice_id_required" });

    const { data: existing, error: loadErr } = await admin
      .from("portal_parent_invoice_share")
      .select("*")
      .eq("id", invoiceId)
      .maybeSingle();
    if (loadErr || !existing) {
      return portalAdminJson(404, { ok: false, error: "not_found" });
    }

    const patch: Record<string, unknown> = { updated_at: now };
    if (fields.invoice_number !== undefined) {
      patch.invoice_number = clean(fields.invoice_number, 80) || null;
    }
    if (fields.amount_gbp !== undefined) {
      patch.amount_gbp = parseAmount(fields.amount_gbp);
    }
    if (fields.due_date !== undefined) {
      patch.due_date = parseDate(fields.due_date);
    }
    if (fields.notes !== undefined) {
      patch.notes = clean(fields.notes, 800) || null;
    }
    if (fields.payment_method_hint !== undefined) {
      patch.payment_method_hint = parseMethodHint(fields.payment_method_hint);
    }
    if (fields.gocardless_url !== undefined) {
      patch.gocardless_url = parseHttpUrl(fields.gocardless_url);
    }
    if (fields.payment_link_url !== undefined) {
      patch.payment_link_url = parseHttpUrl(fields.payment_link_url);
    }
    if (fields.payment_link_surcharge_note !== undefined) {
      patch.payment_link_surcharge_note = clean(fields.payment_link_surcharge_note, 200) || null;
    }
    if (fields.vat_mode !== undefined) {
      const vatRaw = clean(fields.vat_mode, 20).toLowerCase();
      patch.vat_mode = vatRaw === "exempt" ? "exempt" : "vat_20";
    }
    if (fields.xero_invoice_id !== undefined) {
      patch.xero_invoice_id = clean(fields.xero_invoice_id, 80) || null;
    }
    const pay = parsePaymentStatus(fields.payment_status);
    if (pay) {
      patch.payment_status = pay;
      if (pay === "paid") {
        patch.paid_at = now;
        patch.paid_via = clean(fields.paid_via, 40) || "admin";
        const totalGbp = parseAmount(existing.amount_gbp) || 0;
        const schedule = normalizePaymentSchedule(existing.payment_schedule);
        if (schedule.length) {
          const applied = applyInstalmentPayment(schedule, {
            amountGbp: totalGbp,
            paidAt: now,
            paidVia: String(patch.paid_via),
            markAll: true,
          });
          patch.payment_schedule = applied.schedule;
          patch.amount_paid_gbp = applied.amount_paid_gbp;
          patch.next_instalment_due = null;
        } else {
          patch.amount_paid_gbp = totalGbp;
          patch.next_instalment_due = null;
        }
      }
      if (pay === "unpaid") {
        patch.paid_at = null;
        patch.paid_via = null;
        patch.parent_reported_paid_at = null;
        patch.parent_reported_ref = null;
        patch.parent_reported_method = null;
        patch.parent_reported_notes = null;
        patch.xero_payment_id = null;
        patch.xero_synced_at = null;
        patch.amount_paid_gbp = 0;
        const schedule = normalizePaymentSchedule(existing.payment_schedule);
        if (schedule.length) {
          patch.payment_schedule = schedule.map((row) => ({
            ...row,
            status: "pending",
            paid_at: null,
            paid_via: null,
          }));
          patch.next_instalment_due = schedule[0]?.due_date || existing.due_date || null;
        }
      }
    }
    const share = parseShareStatus(fields.share_status);
    if (share) {
      patch.share_status = share;
      if (share === "ready" && existing.share_status !== "ready") {
        patch.ready_at = now;
        patch.ready_by = readyBy;
      }
    }

    const { data: updated, error: updErr } = await admin
      .from("portal_parent_invoice_share")
      .update(patch)
      .eq("id", invoiceId)
      .select("*")
      .maybeSingle();
    if (updErr || !updated) {
      console.error("[portal-admin-parent-invoices-upsert] update", updErr?.message);
      return portalAdminJson(500, { ok: false, error: "update_failed" });
    }

    let xero = null;
    let hold = null;
    let pdf = null;
    if (updated.payment_status === "paid") {
      xero = await xeroEnsurePaidShareInBooks(admin, updated);
      try {
        const cid = clean(updated.contact_id, 120);
        if (cid) hold = await clearPaymentHoldForContact(admin, cid, "admin", verified.userId || null);
      } catch (e) {
        console.error(
          "[portal-admin-parent-invoices-upsert] hold clear",
          e instanceof Error ? e.message : String(e),
        );
      }
      try {
        await confirmCrashSummerBookingsForInvoice(admin, String(updated.id));
      } catch (e) {
        console.error(
          "[portal-admin-parent-invoices-upsert] crash confirm",
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    // Same PDF as parent hub: red Draft Invoice → green PAID when status flips.
    const payChanged = !!pay && pay !== String(existing.payment_status || "").toLowerCase();
    if (payChanged && (pay === "paid" || pay === "unpaid")) {
      try {
        const regen = await regeneratePortalInvoiceSharePdf(admin, invoiceId);
        pdf = regen.ok
          ? { regenerated: true, pdf_storage_path: regen.pdfStoragePath }
          : { regenerated: false, error: regen.error };
        if (!regen.ok) {
          console.error("[portal-admin-parent-invoices-upsert] pdf regen", regen.error);
        }
      } catch (e) {
        console.error(
          "[portal-admin-parent-invoices-upsert] pdf regen",
          e instanceof Error ? e.message : String(e),
        );
        pdf = { regenerated: false, error: "pdf_regen_failed" };
      }
    }

    const title = clean(fields.title, 200);
    if (title || fields.due_date !== undefined) {
      const docPatch: Record<string, unknown> = {};
      if (title) docPatch.title = title;
      if (fields.due_date !== undefined) docPatch.related_date = parseDate(fields.due_date);
      if (Object.keys(docPatch).length) {
        await admin.from("documents").update(docPatch).eq("id", existing.document_id);
      }
    }

    return portalAdminJson(200, { ok: true, invoice: updated, xero, hold, pdf });
  }

  return portalAdminJson(400, { ok: false, error: "action_required" });
});
