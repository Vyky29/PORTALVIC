// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-xero-batch-push
// Push Portal-created family invoices (INV-P) into Xero as ACCREC invoices.
// Stamps xero_invoice_id on success. Idempotent: skips rows that already have one.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { xeroConfigured } from "../_shared/xero_auth.ts";
import { xeroCreateAccrecInvoice } from "../_shared/xero_invoices.ts";
import { xeroSyncPaidInvoiceShare } from "../_shared/xero_payments.ts";
import { resolveParticipantInvoiceFunding } from "../_shared/portal_invoice_funding.ts";

function clean(v: unknown, max = 200): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
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

  if (!xeroConfigured()) {
    return portalAdminJson(400, {
      ok: false,
      error: "xero_not_configured",
      message:
        "Xero secrets missing. Need XERO_CLIENT_ID/SECRET/REFRESH_TOKEN/TENANT_ID and scopes accounting.invoices + accounting.contacts.",
    });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: { invoice_ids?: unknown; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ids = Array.isArray(body.invoice_ids)
    ? body.invoice_ids.map((x) => clean(x, 80)).filter(Boolean).slice(0, 50)
    : [];
  const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 50);

  let q = admin
    .from("portal_parent_invoice_share")
    .select(
      "id, contact_id, invoice_number, amount_gbp, due_date, payment_status, paid_via, xero_invoice_id, xero_payment_id, created_via, vat_mode, line_description, line_items, quantity, unit_price_gbp, reference_text, created_at, document_id",
    )
    .is("xero_invoice_id", null)
    .in("created_via", ["portal", "reenrolment"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (ids.length) q = q.in("id", ids);

  const { data: shares, error } = await q;
  if (error) {
    console.error("[portal-admin-xero-batch-push] list", error.message);
    return portalAdminJson(500, { ok: false, error: "list_failed" });
  }

  if (!shares?.length) {
    return portalAdminJson(200, {
      ok: true,
      pushed: 0,
      failed: 0,
      skipped: 0,
      results: [],
      message: "No unsynced Portal invoices to push.",
    });
  }

  const contactIds = [...new Set(shares.map((s) => clean(s.contact_id, 120)).filter(Boolean))];
  const parentByContact = new Map<string, Record<string, unknown>>();
  const participantByContact = new Map<string, string>();
  if (contactIds.length) {
    const { data: parents } = await admin
      .from("portal_parent_contacts")
      .select(
        "contact_id, parent_display, parent_first_name, parent_last_name, email, address_line1, address_line2, city, postcode, xero_contact_id",
      )
      .in("contact_id", contactIds);
    for (const p of parents || []) {
      parentByContact.set(clean(p.contact_id, 120), p);
    }
    const { data: pax } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name")
      .in("contact_id", contactIds);
    for (const p of pax || []) {
      const id = clean(p.contact_id, 120);
      const name =
        clean(p.display_name, 120) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (id && name) participantByContact.set(id, name);
    }
  }

  const docIds = shares.map((s) => String(s.document_id || "")).filter(Boolean);
  const docDateById = new Map<string, string>();
  if (docIds.length) {
    const { data: docs } = await admin.from("documents").select("id, created_at").in("id", docIds);
    for (const d of docs || []) {
      if (d?.id && d.created_at) {
        docDateById.set(String(d.id), String(d.created_at).slice(0, 10));
      }
    }
  }

  const results: Array<Record<string, unknown>> = [];
  let pushed = 0;
  let failed = 0;
  let skipped = 0;

  for (const share of shares) {
    const shareId = String(share.id);
    if (clean(share.xero_invoice_id, 80)) {
      skipped += 1;
      results.push({ id: shareId, ok: true, skipped: "already_has_xero_id" });
      continue;
    }

    const cid = clean(share.contact_id, 120);
    const parent = parentByContact.get(cid) || {};
    const parentName =
      clean(parent.parent_display, 120) ||
      [parent.parent_first_name, parent.parent_last_name].filter(Boolean).join(" ").trim() ||
      "Parent / carer";

    const invoiceDate =
      docDateById.get(String(share.document_id || "")) ||
      String(share.created_at || "").slice(0, 10) ||
      new Date().toISOString().slice(0, 10);

    const storedVat = clean(share.vat_mode, 20).toLowerCase();
    let vatMode: "exempt" | "vat_20";
    if (storedVat === "exempt" || storedVat === "vat_20") {
      vatMode = storedVat;
    } else {
      const funding = await resolveParticipantInvoiceFunding(admin, {
        contactId: cid,
        displayName: participantByContact.get(cid) || cid,
      });
      vatMode = funding.vatMode;
    }

    const rawLineItems = Array.isArray(share.line_items) ? share.line_items : [];
    const xeroLines = rawLineItems
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
        const baseDesc = clean(ln.description, 800) || clean(share.line_description, 800);
        return {
          description: detail ? `${baseDesc} — ${detail}` : baseDesc,
          quantity: qty,
          unitAmount,
          itemCode: clean(ln.xero_item_code, 80) || null,
        };
      })
      .filter((ln) => ln.unitAmount !== 0);
    if (xeroLines.length) {
      const lineTotal = rawLineItems.reduce(
        (sum: number, ln: Record<string, unknown>) =>
          sum + (Number.isFinite(Number(ln.amount_gbp)) ? Number(ln.amount_gbp) : 0),
        0,
      );
      const adjustment = Math.round((Number(share.amount_gbp) - lineTotal) * 100) / 100;
      if (Math.abs(adjustment) >= 0.01) {
        xeroLines.push({
          description: adjustment < 0 ? "Family credit applied" : "Invoice adjustment",
          quantity: 1,
          unitAmount: adjustment,
          itemCode: null,
        });
      }
    }

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
        parentEmail: clean(parent.email, 200) || null,
        addressLine1: clean(parent.address_line1, 120) || null,
        addressLine2: clean(parent.address_line2, 120) || null,
        city: clean(parent.city, 80) || null,
        postcode: clean(parent.postcode, 20) || null,
        existingXeroContactId: clean(parent.xero_contact_id, 80) || null,
        lines: xeroLines,
      },
      admin,
    );

    if (!created.ok) {
      failed += 1;
      const now = new Date().toISOString();
      await admin
        .from("portal_parent_invoice_share")
        .update({
          xero_push_status: "failed",
          xero_push_error: clean(created.detail || created.error, 500),
          updated_at: now,
        })
        .eq("id", shareId);
      results.push({
        id: shareId,
        invoice_number: share.invoice_number,
        ok: false,
        error: created.error,
        detail: created.detail || null,
      });
      continue;
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
      failed += 1;
      results.push({
        id: shareId,
        ok: false,
        error: "stamp_failed",
        detail: stampErr.message,
        xero_invoice_id: created.xero_invoice_id,
      });
      continue;
    }

    let paymentSync: Record<string, unknown> | null = null;
    if (share.payment_status === "paid") {
      paymentSync = await xeroSyncPaidInvoiceShare(admin, {
        id: shareId,
        xero_invoice_id: created.xero_invoice_id,
        xero_payment_id: share.xero_payment_id,
        amount_gbp: share.amount_gbp,
        invoice_number: share.invoice_number,
        paid_via: share.paid_via || "portal",
      });
    }

    pushed += 1;
    results.push({
      id: shareId,
      invoice_number: share.invoice_number,
      ok: true,
      xero_invoice_id: created.xero_invoice_id,
      xero_contact_id: created.xero_contact_id,
      payment: paymentSync,
    });
  }

  return portalAdminJson(200, {
    ok: true,
    pushed,
    failed,
    skipped,
    results,
    message:
      pushed || failed
        ? `Pushed ${pushed} to Xero` + (failed ? `, ${failed} failed` : "")
        : "Nothing pushed",
  });
});
