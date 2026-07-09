// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-invoice-report-paid
// Parent reports bank transfer (or other) payment; office must confirm.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
}

function parseMethod(v: unknown): string {
  const s = clean(v, 40).toLowerCase();
  if (["bank_transfer", "gocardless", "payment_link", "other"].includes(s)) return s;
  return "bank_transfer";
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

  let body: {
    invoice_id?: string;
    contact_id?: string;
    payment_ref?: string;
    method?: string;
    notes?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const invoiceId = clean(body.invoice_id, 60);
  const contactId = clean(body.contact_id, 120);
  if (!invoiceId || !contactId) {
    return json(400, { ok: false, error: "invoice_and_contact_required" });
  }

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id")
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

  const { data: inv, error } = await supabase
    .from("portal_parent_invoice_share")
    .select("id, contact_id, payment_status, share_status")
    .eq("id", invoiceId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (error || !inv) return json(404, { ok: false, error: "invoice_not_found" });
  if (inv.share_status !== "ready") {
    return json(409, { ok: false, error: "invoice_not_shared" });
  }
  if (inv.payment_status === "paid") {
    return json(409, { ok: false, error: "already_paid" });
  }
  if (inv.payment_status === "void") {
    return json(409, { ok: false, error: "invoice_void" });
  }
  if (inv.payment_status === "pending_confirmation") {
    return json(200, {
      ok: true,
      already_pending: true,
      invoice: inv,
      message: "We already have your payment report — the office will confirm shortly.",
    });
  }
  if (inv.payment_status !== "unpaid" && inv.payment_status !== "partial") {
    return json(409, { ok: false, error: "not_open_for_report" });
  }

  const now = new Date().toISOString();
  const patch = {
    payment_status: "pending_confirmation",
    parent_reported_paid_at: now,
    parent_reported_ref: clean(body.payment_ref, 120) || null,
    parent_reported_method: parseMethod(body.method),
    parent_reported_notes: clean(body.notes, 500) || null,
    updated_at: now,
  };

  const { data: updated, error: updErr } = await supabase
    .from("portal_parent_invoice_share")
    .update(patch)
    .eq("id", invoiceId)
    .eq("contact_id", contactId)
    .select(
      "id, payment_status, parent_reported_paid_at, parent_reported_ref, parent_reported_method",
    )
    .maybeSingle();

  if (updErr || !updated) {
    console.error("[parent-portal-invoice-report-paid]", updErr?.message);
    return parentPortalJsonInvalid(500);
  }

  return json(200, {
    ok: true,
    invoice: updated,
    message: "Thanks — the office will confirm when the payment appears.",
  });
});
