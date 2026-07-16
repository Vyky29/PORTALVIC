// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-credit-apply-invoice
// Apply an open family credit against an unpaid/partial shared invoice.
// Full cover → invoice paid. Partial → invoice amount reduced, status partial.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { xeroCreateInvoicePayment, xeroConfigured } from "../_shared/xero_payments.ts";
import {
  clearPaymentHoldForContact,
  refreshBufferHoldState,
} from "../_shared/portal_payment_holds.ts";
import { confirmCrashSummerBookingsForInvoice } from "../_shared/crash_summer_confirm.ts";
import {
  applyCreditToSchedule,
  hasPaymentSchedule,
} from "../_shared/portal_invoice_payment_schedule.ts";
import { regeneratePortalInvoiceSharePdf } from "../_shared/portal_create_family_invoice.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
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
    .select(
      "id, contact_id, amount_gbp, payment_status, share_status, invoice_number, xero_invoice_id, xero_payment_id, payment_schedule",
    )
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

  const invoiceAmount = money(Number(inv.amount_gbp));
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

  const creditAmount = money(Number(credit.amount_gbp));
  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    return json(400, {
      ok: false,
      error: "credit_amount_required",
      message: "This credit has no £ amount. Contact the office to apply it.",
    });
  }

  const appliedGbp = money(Math.min(creditAmount, invoiceAmount));
  const remainingGbp = money(invoiceAmount - appliedGbp);
  const fullyPaid = remainingGbp <= 0;
  const now = new Date().toISOString();
  const invNo = clean(inv.invoice_number, 40);

  const creditCloseNotes = fullyPaid
    ? "Applied to invoice" +
      (invNo ? " " + invNo : "") +
      " (£" +
      appliedGbp.toFixed(2) +
      ") by parent portal — paid in full"
    : "Partial apply to invoice" +
      (invNo ? " " + invNo : "") +
      " (£" +
      appliedGbp.toFixed(2) +
      " of £" +
      invoiceAmount.toFixed(2) +
      "); £" +
      remainingGbp.toFixed(2) +
      " still due";

  const { error: creditUpErr } = await supabase
    .from("portal_parent_family_credits")
    .update({
      status: "applied",
      applied_invoice_share_id: invoiceId,
      closed_at: now,
      close_notes: creditCloseNotes,
      updated_at: now,
    })
    .eq("id", creditId)
    .eq("status", "open");

  if (creditUpErr) {
    console.error("[parent-portal-credit-apply-invoice] credit", creditUpErr.message);
    return parentPortalJsonInvalid(500);
  }

  const invPatch: Record<string, unknown> = {
    updated_at: now,
  };
  if (hasPaymentSchedule(inv.payment_schedule)) {
    const scheduled = applyCreditToSchedule(inv.payment_schedule, appliedGbp);
    invPatch.payment_schedule = scheduled.schedule;
    invPatch.next_instalment_due = fullyPaid ? null : scheduled.next_instalment_due;
  }
  if (fullyPaid) {
    invPatch.payment_status = "paid";
    invPatch.paid_at = now;
    invPatch.paid_via = "credit";
    invPatch.amount_gbp = invoiceAmount;
    invPatch.next_instalment_due = null;
  } else {
    invPatch.payment_status = "partial";
    invPatch.amount_gbp = remainingGbp;
    invPatch.paid_at = null;
    invPatch.paid_via = null;
  }

  const { error: invUpErr } = await supabase
    .from("portal_parent_invoice_share")
    .update(invPatch)
    .eq("id", invoiceId)
    .in("payment_status", ["unpaid", "partial"]);

  if (invUpErr) {
    console.error("[parent-portal-credit-apply-invoice] invoice", invUpErr.message);
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

  // Xero: post payment for the credit amount applied (full or partial).
  let xero: Record<string, unknown> | null = null;
  const xeroId = clean(inv.xero_invoice_id, 80);
  if (xeroId && xeroConfigured()) {
    const created = await xeroCreateInvoicePayment({
      xeroInvoiceId: xeroId,
      amountGbp: appliedGbp,
      reference: invNo
        ? `Portal credit · ${invNo}`
        : "Portal credit",
    });
    if (created.ok) {
      const stamp: Record<string, unknown> = {
        xero_payment_id: created.payment_id,
        xero_synced_at: now,
        updated_at: now,
      };
      await supabase.from("portal_parent_invoice_share").update(stamp).eq("id", invoiceId);
      xero = { synced: true, payment_id: created.payment_id, amount_gbp: appliedGbp };
    } else {
      xero = { synced: false, error: created.error, detail: created.detail };
    }
  } else if (!xeroId) {
    xero = { synced: false, skipped: "no_xero_invoice_id" };
  } else {
    xero = { synced: false, skipped: "xero_not_configured" };
  }

  try {
    await regeneratePortalInvoiceSharePdf(supabase, invoiceId);
  } catch (err) {
    console.error("[parent-portal-credit-apply-invoice] pdf", err);
  }

  let hold: Record<string, unknown> | null = null;
  if (fullyPaid) {
    try {
      hold = await clearPaymentHoldForContact(supabase, contactId, "credit");
    } catch (err) {
      console.error("[parent-portal-credit-apply-invoice] clear hold", err);
    }
    try {
      await confirmCrashSummerBookingsForInvoice(supabase, invoiceId);
    } catch (err) {
      console.error("[parent-portal-credit-apply-invoice] crash confirm", err);
    }
  }
  try {
    await refreshBufferHoldState(supabase, contactId, null);
  } catch (err) {
    console.error("[parent-portal-credit-apply-invoice] buffer", err);
  }

  return json(200, {
    ok: true,
    invoice_id: invoiceId,
    credit_id: creditId,
    payment_status: fullyPaid ? "paid" : "partial",
    paid_via: fullyPaid ? "credit" : null,
    invoice_gbp_before: invoiceAmount,
    credit_gbp: creditAmount,
    applied_gbp: appliedGbp,
    remaining_gbp: fullyPaid ? 0 : remainingGbp,
    partial: !fullyPaid,
    hold,
    xero,
  });
});
