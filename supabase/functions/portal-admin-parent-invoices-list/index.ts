// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-parent-invoices-list
// Admin list of shared / draft client invoices for families.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";

const BUCKET = "documents";

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

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let body: { share_status?: string; payment_status?: string; contact_id?: string; limit?: number } =
    {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const shareFilter = clean(body.share_status, 20).toLowerCase() || "all";
  const payFilter = clean(body.payment_status, 20).toLowerCase() || "all";
  const contactId = clean(body.contact_id, 120);
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 200);

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let q = admin
    .from("portal_parent_invoice_share")
    .select(
      "id, document_id, contact_id, invoice_number, amount_gbp, due_date, payment_status, share_status, ready_at, ready_by, notes, created_at, updated_at, payment_method_hint, gocardless_url, payment_link_url, payment_link_surcharge_note, parent_reported_paid_at, parent_reported_ref, parent_reported_method, parent_reported_notes, paid_at, paid_via",
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (shareFilter === "ready" || shareFilter === "hidden") q = q.eq("share_status", shareFilter);
  if (["unpaid", "paid", "partial", "void", "pending_confirmation"].includes(payFilter)) {
    q = q.eq("payment_status", payFilter);
  }
  if (contactId) q = q.eq("contact_id", contactId);

  const { data: shares, error } = await q;
  if (error) {
    console.error("[portal-admin-parent-invoices-list]", error.message);
    return portalAdminJson(500, { ok: false, error: "list_failed" });
  }

  const docIds = (shares || []).map((s) => String(s.document_id || "")).filter(Boolean);
  const docsById = new Map<string, Record<string, unknown>>();
  if (docIds.length) {
    const { data: docs } = await admin
      .from("documents")
      .select("id, title, related_date, file_url, created_at, related_client, document_type")
      .in("id", docIds);
    for (const d of docs || []) {
      if (d?.id) docsById.set(String(d.id), d);
    }
  }

  const contactIds = [...new Set((shares || []).map((s) => clean(s.contact_id, 120)).filter(Boolean))];
  const nameByContact = new Map<string, string>();
  if (contactIds.length) {
    const { data: pax } = await admin
      .from("portal_participants")
      .select("contact_id, display_name, first_name, last_name")
      .in("contact_id", contactIds);
    for (const p of pax || []) {
      const id = clean(p.contact_id, 120);
      const name =
        clean(p.display_name, 120) ||
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      if (id && name) nameByContact.set(id, name);
    }
  }

  const invoices = [];
  for (const share of shares || []) {
    const doc = docsById.get(String(share.document_id)) || {};
    let pdfUrl: string | null = null;
    if (doc.file_url) {
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(String(doc.file_url), 3600);
      pdfUrl = signed?.signedUrl || null;
    }
    const cid = clean(share.contact_id, 120);
    invoices.push({
      ...share,
      title: clean(doc.title, 200) || "Invoice",
      related_client: clean(doc.related_client, 120) || nameByContact.get(cid) || "",
      participant_display: nameByContact.get(cid) || clean(doc.related_client, 120) || cid,
      file_url: doc.file_url || null,
      pdf_url: pdfUrl,
      document_created_at: doc.created_at || null,
    });
  }

  const { count: readyUnpaid } = await admin
    .from("portal_parent_invoice_share")
    .select("id", { count: "exact", head: true })
    .eq("share_status", "ready")
    .eq("payment_status", "unpaid");

  const { count: pendingConfirm } = await admin
    .from("portal_parent_invoice_share")
    .select("id", { count: "exact", head: true })
    .eq("share_status", "ready")
    .eq("payment_status", "pending_confirmation");

  return portalAdminJson(200, {
    ok: true,
    invoices,
    meta: {
      ready_unpaid: readyUnpaid || 0,
      pending_confirmation: pendingConfirm || 0,
    },
  });
});
