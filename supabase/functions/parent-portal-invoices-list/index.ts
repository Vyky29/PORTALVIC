// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-invoices-list
// Parent-facing list of shared client invoice PDFs for one linked child.
// Bank-first: Tide details from env; optional GC / Payment Link from share row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { stripeConfigured } from "../_shared/stripe_checkout.ts";
import {
  suggestedTransferReference,
  tideBankDetailsFromEnv,
} from "../_shared/tide_bank_details.ts";

const BUCKET = "documents";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: { contact_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const contactId = clean(body.contact_id, 120);
  if (!contactId) return json(400, { ok: false, error: "contact_id_required" });

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name, first_name, last_name")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (!participant) {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select("contact_id")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
  }

  const displayName =
    clean(participant?.display_name, 80) ||
    [participant?.first_name, participant?.last_name].filter(Boolean).join(" ").trim() ||
    "participant";

  const { data: shares, error } = await supabase
    .from("portal_parent_invoice_share")
    .select(
      "id, document_id, contact_id, invoice_number, amount_gbp, due_date, payment_status, share_status, ready_at, notes, created_at, updated_at, payment_method_hint, gocardless_url, payment_link_url, payment_link_surcharge_note, parent_reported_paid_at, parent_reported_ref, parent_reported_method",
    )
    .eq("contact_id", contactId)
    .eq("share_status", "ready")
    .order("due_date", { ascending: false, nullsFirst: false })
    .order("ready_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    console.error("[parent-portal-invoices-list]", error.message);
    return parentPortalJsonInvalid(500);
  }

  const docIds = (shares || []).map((s) => String(s.document_id || "")).filter(Boolean);
  const docsById = new Map<string, Record<string, unknown>>();
  if (docIds.length) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, title, related_date, file_url, created_at, related_client, document_type")
      .in("id", docIds)
      .eq("document_type", "client_invoice");
    for (const d of docs || []) {
      if (d?.id) docsById.set(String(d.id), d);
    }
  }

  const tide = tideBankDetailsFromEnv();
  const cardCheckoutAvailable = stripeConfigured();
  const out = [];
  for (const share of shares || []) {
    const doc = docsById.get(String(share.document_id));
    if (!doc || !doc.file_url) continue;
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(String(doc.file_url), 3600);
    const amount = share.amount_gbp != null ? Number(share.amount_gbp) : null;
    const status = share.payment_status || "unpaid";
    const openForPay = status === "unpaid" || status === "partial";
    const suggestedRef = suggestedTransferReference(share.invoice_number, displayName);
    const canPayCard =
      cardCheckoutAvailable &&
      openForPay &&
      amount != null &&
      Number.isFinite(amount) &&
      amount > 0;
    out.push({
      id: share.id,
      document_id: share.document_id,
      title: clean(doc.title, 200) || "Invoice",
      invoice_number: share.invoice_number || null,
      amount_gbp: amount,
      due_date: share.due_date || null,
      payment_status: status,
      ready_at: share.ready_at || doc.created_at || null,
      related_date: doc.related_date || null,
      notes: share.notes || null,
      pdf_url: signed?.signedUrl || null,
      payment_method_hint: share.payment_method_hint || "bank_transfer",
      gocardless_url: clean(share.gocardless_url, 500) || null,
      payment_link_url: clean(share.payment_link_url, 500) || null,
      payment_link_surcharge_note: clean(share.payment_link_surcharge_note, 200) || null,
      parent_reported_paid_at: share.parent_reported_paid_at || null,
      parent_reported_ref: share.parent_reported_ref || null,
      suggested_reference: suggestedRef,
      bank_transfer: openForPay || status === "pending_confirmation"
        ? {
            available: tide.available,
            payee_name: tide.payee_name,
            sort_code: tide.sort_code,
            account_number: tide.account_number,
            reference_hint: tide.reference_hint || suggestedRef,
            message: tide.available
              ? null
              : "Contact the office for bank transfer details.",
          }
        : null,
      can_report_paid: openForPay,
      can_pay: canPayCard,
    });
  }

  return json(200, {
    ok: true,
    invoices: out,
    bank_transfer_available: tide.available,
    payments_enabled: cardCheckoutAvailable,
  });
});
