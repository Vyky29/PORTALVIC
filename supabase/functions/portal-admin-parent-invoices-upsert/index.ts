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
import { xeroSyncPaidInvoiceShare } from "../_shared/xero_payments.ts";
import { clearPaymentHoldForContact } from "../_shared/portal_payment_holds.ts";
import {
  buildPortalTaxInvoicePdf,
  type PortalInvoiceVatMode,
} from "../_shared/portal_tax_invoice_pdf.ts";

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
  if (["bank_transfer", "gocardless", "payment_link", "other"].includes(s)) return s;
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

  if (action === "create_portal") {
    // Create invoice in Portal (generate TAX INVOICE PDF) — no Xero upload.
    const contactId = clean(fields.contact_id, 120);
    if (!contactId) return portalAdminJson(400, { ok: false, error: "contact_id_required" });

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
    const lineDescription =
      clean(fields.line_description, 800) ||
      "Structured activity support delivered for a SEND participant.";
    const notes = clean(fields.notes, 800) || null;
    const shareStatus = parseShareStatus(fields.share_status) || "ready";

    const { data: participant } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name, parent_person_id")
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!participant) {
      return portalAdminJson(404, { ok: false, error: "participant_not_found" });
    }
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

    let invoiceNumber = clean(fields.invoice_number, 80);
    if (!invoiceNumber) {
      const { data: allocated, error: allocErr } = await admin.rpc(
        "portal_allocate_invoice_number",
        { p_series: "INV-P" },
      );
      if (allocErr || !allocated) {
        console.error("[create_portal] allocate", allocErr?.message);
        return portalAdminJson(500, { ok: false, error: "invoice_number_failed" });
      }
      invoiceNumber = String(allocated);
    }

    const unitPrice = Math.round((amount / quantity) * 10000) / 10000;
    const descriptionLines = [
      ...String(lineDescription)
        .split(/\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8),
      "",
      `Client's Name: ${displayName}`,
      quantity !== 1 ? `- Quantity: ${quantity}` : null,
      reference ? `- Reference: ${reference}` : null,
      `- Mode: Bank transfer / Card (parent portal)`,
      vatMode === "exempt" ? "- VAT: Exempt" : "- VAT: 20% (private funding)",
    ].filter((x): x is string => !!x);

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildPortalTaxInvoicePdf({
        invoiceNumber,
        invoiceDateIso: invoiceDate,
        dueDateIso: dueDate,
        reference,
        vatMode,
        totalGbp: amount,
        quantity,
        descriptionLines,
        billToName,
        billToLines,
        participantName: displayName,
        paid: false,
      });
    } catch (err) {
      console.error("[create_portal] pdf", err);
      return portalAdminJson(500, { ok: false, error: "pdf_failed" });
    }

    const ownerId = userId;
    if (!ownerId) {
      return portalAdminJson(401, { ok: false, error: "admin_user_required" });
    }
    const stamp = Date.now();
    const storagePath = `${ownerId}/billing/client_invoice_${contactId}_${stamp}.pdf`;
    const { error: upErr } = await admin.storage.from(BUCKET).upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (upErr) {
      console.error("[create_portal] upload", upErr.message);
      return portalAdminJson(500, { ok: false, error: "upload_failed" });
    }

    const title =
      clean(fields.title, 200) || `Invoice ${invoiceNumber} — ${displayName}`;

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
        source_page: "admin_parent_invoices",
      })
      .select("id, title, file_url, related_client, related_date, created_at")
      .maybeSingle();
    if (docErr || !doc) {
      console.error("[create_portal] doc", docErr?.message);
      await admin.storage.from(BUCKET).remove([storagePath]);
      return portalAdminJson(500, { ok: false, error: "document_insert_failed" });
    }

    const shareRow = {
      document_id: doc.id,
      contact_id: contactId,
      invoice_number: invoiceNumber,
      amount_gbp: amount,
      due_date: dueDate,
      payment_status: "unpaid",
      share_status: shareStatus,
      ready_at: shareStatus === "ready" ? now : null,
      ready_by: shareStatus === "ready" ? readyBy : null,
      notes,
      payment_method_hint: parseMethodHint(fields.payment_method_hint) || "bank_transfer",
      gocardless_url: parseHttpUrl(fields.gocardless_url),
      payment_link_url: parseHttpUrl(fields.payment_link_url),
      payment_link_surcharge_note: clean(fields.payment_link_surcharge_note, 200) || null,
      created_via: "portal",
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
      console.error("[create_portal] share", shareErr?.message);
      await admin.from("documents").delete().eq("id", doc.id);
      await admin.storage.from(BUCKET).remove([storagePath]);
      return portalAdminJson(500, { ok: false, error: "share_insert_failed" });
    }

    return portalAdminJson(200, {
      ok: true,
      invoice: { ...share, title: doc.title },
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
    if (fields.xero_invoice_id !== undefined) {
      patch.xero_invoice_id = clean(fields.xero_invoice_id, 80) || null;
    }
    const pay = parsePaymentStatus(fields.payment_status);
    if (pay) {
      patch.payment_status = pay;
      if (pay === "paid") {
        patch.paid_at = now;
        patch.paid_via = clean(fields.paid_via, 40) || "admin";
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
    if (updated.payment_status === "paid") {
      xero = await xeroSyncPaidInvoiceShare(admin, updated);
      try {
        const cid = clean(updated.contact_id, 120);
        if (cid) hold = await clearPaymentHoldForContact(admin, cid, "admin", verified.userId || null);
      } catch (e) {
        console.error(
          "[portal-admin-parent-invoices-upsert] hold clear",
          e instanceof Error ? e.message : String(e),
        );
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

    return portalAdminJson(200, { ok: true, invoice: updated, xero, hold });
  }

  return portalAdminJson(400, { ok: false, error: "action_required" });
});
