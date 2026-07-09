// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-credit-apply-invoice
// Apply an open family credit (with £ amount) against an unpaid shared invoice.
// Full cover only: credit amount must be >= invoice amount.

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

  let body: { contact_id?: string; invoice_id?: string; credit_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  const invoiceId = clean(body.invoice_id, 60);
  const creditId = clean(body.credit_id, 60);
  if (!contactId || !invoiceId || !creditId) {
    return json(400, { ok: false, error: "contact_invoice_credit_required" });
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

  const { data: inv, error: invErr } = await supabase
    .from("portal_parent_invoice_share")
    .select("id, contact_id, amount_gbp, payment_status, share_status, invoice_number")
    .eq("id", invoiceId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (invErr || !inv) return json(404, { ok: false, error: "invoice_not_found" });
  if (inv.share_status !== "ready") {
    return json(409, { ok: false, error: "invoice_not_shared" });
  }
  if (inv.payment_status === "paid") {
    return json(409, { ok: false, error: "already_paid" });
  }
  if (inv.payment_status === "void" || inv.payment_status === "pending_confirmation") {
    return json(409, { ok: false, error: "invoice_not_open" });
  }

  const invoiceAmount = Number(inv.amount_gbp);
  if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
    return json(400, {
      ok: false,
      error: "amount_required",
      message: "This invoice has no amount set. Contact the office.",
    });
  }

  const { data: credit, error: cErr } = await supabase
    .from("portal_parent_family_credits")
    .select("id, parent_person_id, contact_id, kind, status, amount_gbp")
    .eq("id", creditId)
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (cErr || !credit) return json(404, { ok: false, error: "credit_not_found" });
  if (credit.kind !== "credit") {
    return json(400, { ok: false, error: "not_a_credit" });
  }
  if (credit.status !== "open") {
    return json(409, { ok: false, error: "credit_not_open" });
  }

  const creditAmount = Number(credit.amount_gbp);
  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    return json(400, {
      ok: false,
      error: "credit_amount_required",
      message: "This credit has no £ amount. Contact the office to apply it.",
    });
  }

  if (creditAmount + 1e-9 < invoiceAmount) {
    return json(409, {
      ok: false,
      error: "credit_insufficient",
      message:
        "This credit (£" +
        creditAmount.toFixed(2) +
        ") is less than the invoice (£" +
        invoiceAmount.toFixed(2) +
        "). Contact the office for a partial apply.",
      credit_gbp: creditAmount,
      invoice_gbp: invoiceAmount,
    });
  }

  const now = new Date().toISOString();
  const invNo = clean(inv.invoice_number, 40);

  const { error: creditUpErr } = await supabase
    .from("portal_parent_family_credits")
    .update({
      status: "applied",
      applied_invoice_share_id: invoiceId,
      closed_at: now,
      close_notes:
        "Applied to invoice" +
        (invNo ? " " + invNo : "") +
        " (£" +
        invoiceAmount.toFixed(2) +
        ") by parent portal",
      updated_at: now,
    })
    .eq("id", creditId)
    .eq("status", "open");

  if (creditUpErr) {
    console.error("[parent-portal-credit-apply-invoice] credit", creditUpErr.message);
    return parentPortalJsonInvalid(500);
  }

  const { error: invUpErr } = await supabase
    .from("portal_parent_invoice_share")
    .update({
      payment_status: "paid",
      paid_at: now,
      paid_via: "credit",
      updated_at: now,
    })
    .eq("id", invoiceId)
    .in("payment_status", ["unpaid", "partial"]);

  if (invUpErr) {
    console.error("[parent-portal-credit-apply-invoice] invoice", invUpErr.message);
    // Best-effort rollback credit
    await supabase
      .from("portal_parent_family_credits")
      .update({
        status: "open",
        applied_invoice_share_id: null,
        closed_at: null,
        close_notes: null,
        updated_at: now,
      })
      .eq("id", creditId);
    return parentPortalJsonInvalid(500);
  }

  return json(200, {
    ok: true,
    invoice_id: invoiceId,
    credit_id: creditId,
    payment_status: "paid",
    paid_via: "credit",
    invoice_gbp: invoiceAmount,
    credit_gbp: creditAmount,
  });
});
