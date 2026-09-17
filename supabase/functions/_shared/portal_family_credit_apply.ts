// @ts-nocheck — Edge Function shared helper.
//
// Apply open family credits to the next unpaid/partial INV-P (office auto-apply).
// Residual credit stays open when credit £ > invoice £.

import { xeroCreateInvoicePayment, xeroConfigured } from "./xero_payments.ts";
import {
  clearPaymentHoldForContact,
  refreshBufferHoldState,
} from "./portal_payment_holds.ts";
import { confirmCrashSummerBookingsForInvoice } from "./crash_summer_confirm.ts";
import {
  applyCreditToSchedule,
  hasPaymentSchedule,
} from "./portal_invoice_payment_schedule.ts";
import { regeneratePortalInvoiceSharePdf } from "./portal_create_family_invoice.ts";
import {
  compareInvoicesPaySequence,
  type PaySequenceShare,
} from "./portal_invoice_pay_sequence.ts";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

export type CreditApplyActor = "parent_portal" | "office_auto" | "admin";

export type ApplyCreditResult = {
  ok: boolean;
  error?: string;
  message?: string;
  invoice_id?: string;
  credit_id?: string;
  payment_status?: string;
  applied_gbp?: number;
  credit_residual_gbp?: number;
  credit_status?: string;
  invoice_remaining_gbp?: number;
  partial?: boolean;
  xero?: Record<string, unknown> | null;
  hold?: Record<string, unknown> | null;
};

function invoiceEligibleForCreditApply(
  share: PaySequenceShare & { amount_gbp?: unknown; payment_method_hint?: unknown },
  opts: { allowHidden: boolean; skipGocardless?: boolean },
): boolean {
  const st = clean(share.payment_status, 40).toLowerCase();
  if (st === "void" || st === "cancelled" || st === "paid" || st === "pending_confirmation") {
    return false;
  }
  if (st !== "unpaid" && st !== "partial") return false;
  const hint = clean(share.payment_method_hint, 40).toLowerCase();
  if (hint === "la_funded") return false;
  // Office auto-apply: GoCardless monthly instalments stay on mandate — credit waits for next term.
  if (opts.skipGocardless && hint === "gocardless") return false;
  const shareStatus = clean(share.share_status, 40).toLowerCase();
  if (!opts.allowHidden && shareStatus !== "ready") return false;
  if (opts.allowHidden && shareStatus && shareStatus !== "ready" && shareStatus !== "hidden") {
    return false;
  }
  const amt = money(Number(share.amount_gbp));
  return Number.isFinite(amt) && amt > 0;
}

/** True when family only has open GoCardless instalments (no bank/card/term invoice to apply to). */
export function invoiceIsGocardlessHint(share: { payment_method_hint?: unknown }): boolean {
  return clean(share.payment_method_hint, 40).toLowerCase() === "gocardless";
}

/**
 * Pick next INV-P for auto-apply: Autumn → Spring → Summer, then due date.
 * Includes hidden shares when allowHidden (office path).
 * When skipGocardless (office default), GC monthly instalments are skipped so credit
 * lands on the next term / bank-card invoice instead.
 */
export async function findNextInvoiceForCreditApply(
  admin: { from: (t: string) => any },
  contactId: string,
  opts?: { allowHidden?: boolean; preferInvoiceId?: string; skipGocardless?: boolean },
): Promise<(PaySequenceShare & { amount_gbp?: unknown; payment_schedule?: unknown; xero_invoice_id?: unknown; invoice_number?: unknown; payment_method_hint?: unknown }) | null> {
  const cid = clean(contactId, 120);
  if (!cid) return null;
  const allowHidden = opts?.allowHidden !== false;
  const skipGocardless = opts?.skipGocardless === true;
  const preferId = clean(opts?.preferInvoiceId, 80);

  const { data, error } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, contact_id, amount_gbp, payment_status, share_status, invoice_number, billing_term, due_date, next_instalment_due, payment_method_hint, payment_schedule, xero_invoice_id, created_at",
    )
    .eq("contact_id", cid);

  if (error) {
    console.error("[findNextInvoiceForCreditApply]", error.message);
    return null;
  }

  const eligible = (data || []).filter((s: PaySequenceShare) =>
    invoiceEligibleForCreditApply(s, { allowHidden, skipGocardless }),
  );
  if (!eligible.length) return null;

  eligible.sort(compareInvoicesPaySequence);
  if (preferId) {
    const preferred = eligible.find((s: { id?: unknown }) => clean(s.id, 80) === preferId);
    if (preferred) return preferred;
  }
  return eligible[0] || null;
}

/**
 * Apply one open credit to one invoice. Leaves residual credit open when credit > invoice.
 */
export async function applyOpenCreditToInvoice(
  admin: { from: (t: string) => any },
  args: {
    creditId: string;
    invoiceId: string;
    contactId: string;
    parentPersonId?: string | null;
    allowHidden?: boolean;
    actor?: CreditApplyActor;
    enforceParentOwnership?: boolean;
  },
): Promise<ApplyCreditResult> {
  const creditId = clean(args.creditId, 60);
  const invoiceId = clean(args.invoiceId, 60);
  const contactId = clean(args.contactId, 120);
  const allowHidden = !!args.allowHidden;
  const actor = args.actor || "office_auto";
  const now = new Date().toISOString();

  if (!creditId || !invoiceId || !contactId) {
    return { ok: false, error: "contact_invoice_credit_required" };
  }

  const { data: inv, error: invErr } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, contact_id, amount_gbp, payment_status, share_status, invoice_number, xero_invoice_id, payment_schedule, payment_method_hint, billing_term",
    )
    .eq("id", invoiceId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (invErr || !inv) return { ok: false, error: "invoice_not_found" };
  if (!invoiceEligibleForCreditApply(inv, { allowHidden })) {
    if (inv.share_status !== "ready" && !allowHidden) {
      return { ok: false, error: "invoice_not_shared" };
    }
    if (inv.payment_status === "paid") return { ok: false, error: "already_paid" };
    return { ok: false, error: "invoice_not_open" };
  }

  const invoiceAmount = money(Number(inv.amount_gbp));
  if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
    return {
      ok: false,
      error: "amount_required",
      message: "This invoice has no amount set.",
    };
  }

  let creditQ = admin
    .from("portal_parent_family_credits")
    .select("id, parent_person_id, contact_id, kind, status, amount_gbp, notes")
    .eq("id", creditId)
    .eq("contact_id", contactId);
  if (args.enforceParentOwnership && args.parentPersonId) {
    creditQ = creditQ.eq("parent_person_id", clean(args.parentPersonId, 120));
  }
  const { data: credit, error: cErr } = await creditQ.maybeSingle();

  if (cErr || !credit) return { ok: false, error: "credit_not_found" };
  if (credit.kind !== "credit") return { ok: false, error: "not_a_credit" };
  if (credit.status !== "open") return { ok: false, error: "credit_not_open" };

  const creditAmount = money(Number(credit.amount_gbp));
  if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
    return {
      ok: false,
      error: "credit_amount_required",
      message: "This credit has no £ amount yet.",
    };
  }

  const appliedGbp = money(Math.min(creditAmount, invoiceAmount));
  const invoiceRemaining = money(invoiceAmount - appliedGbp);
  const creditResidual = money(creditAmount - appliedGbp);
  const fullyPaid = invoiceRemaining <= 0;
  const creditFullyUsed = creditResidual <= 0;
  const invNo = clean(inv.invoice_number, 40);
  const actorLabel =
    actor === "parent_portal" ? "parent portal" : actor === "admin" ? "admin" : "office auto";

  const creditCloseNotes = creditFullyUsed
    ? "Applied to invoice" +
      (invNo ? " " + invNo : "") +
      " (£" +
      appliedGbp.toFixed(2) +
      ") — " +
      actorLabel
    : "Partial credit use on invoice" +
      (invNo ? " " + invNo : "") +
      " (£" +
      appliedGbp.toFixed(2) +
      "); £" +
      creditResidual.toFixed(2) +
      " credit still open — " +
      actorLabel;

  const creditPatch: Record<string, unknown> = {
    updated_at: now,
    notes: credit.notes
      ? String(credit.notes).slice(0, 700) + " | " + creditCloseNotes
      : creditCloseNotes,
  };
  if (creditFullyUsed) {
    creditPatch.status = "applied";
    creditPatch.applied_invoice_share_id = invoiceId;
    creditPatch.closed_at = now;
    creditPatch.close_notes = creditCloseNotes;
    creditPatch.amount_gbp = creditAmount;
  } else {
    // Keep open with residual £; do not set applied_invoice_share_id (still usable).
    creditPatch.status = "open";
    creditPatch.amount_gbp = creditResidual;
  }

  const { error: creditUpErr } = await admin
    .from("portal_parent_family_credits")
    .update(creditPatch)
    .eq("id", creditId)
    .eq("status", "open");

  if (creditUpErr) {
    console.error("[applyOpenCreditToInvoice] credit", creditUpErr.message);
    return { ok: false, error: "credit_update_failed" };
  }

  const invPatch: Record<string, unknown> = { updated_at: now };
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
    invPatch.amount_gbp = invoiceRemaining;
    invPatch.paid_at = null;
    invPatch.paid_via = null;
  }

  const { error: invUpErr } = await admin
    .from("portal_parent_invoice_share")
    .update(invPatch)
    .eq("id", invoiceId)
    .in("payment_status", ["unpaid", "partial"]);

  if (invUpErr) {
    console.error("[applyOpenCreditToInvoice] invoice", invUpErr.message);
    await admin
      .from("portal_parent_family_credits")
      .update({
        status: "open",
        amount_gbp: creditAmount,
        applied_invoice_share_id: null,
        closed_at: null,
        close_notes: null,
        updated_at: now,
      })
      .eq("id", creditId);
    return { ok: false, error: "invoice_update_failed" };
  }

  let xero: Record<string, unknown> | null = null;
  const xeroId = clean(inv.xero_invoice_id, 80);
  if (xeroId && xeroConfigured()) {
    const created = await xeroCreateInvoicePayment({
      xeroInvoiceId: xeroId,
      amountGbp: appliedGbp,
      reference: invNo ? `Portal credit · ${invNo}` : "Portal credit",
    });
    if (created.ok) {
      await admin
        .from("portal_parent_invoice_share")
        .update({
          xero_payment_id: created.payment_id,
          xero_synced_at: now,
          updated_at: now,
        })
        .eq("id", invoiceId);
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
    await regeneratePortalInvoiceSharePdf(admin, invoiceId);
  } catch (err) {
    console.error("[applyOpenCreditToInvoice] pdf", err);
  }

  let hold: Record<string, unknown> | null = null;
  if (fullyPaid) {
    try {
      hold = await clearPaymentHoldForContact(admin, contactId, "credit");
    } catch (err) {
      console.error("[applyOpenCreditToInvoice] clear hold", err);
    }
    try {
      await confirmCrashSummerBookingsForInvoice(admin, invoiceId);
    } catch (err) {
      console.error("[applyOpenCreditToInvoice] crash confirm", err);
    }
  }
  try {
    await refreshBufferHoldState(admin, contactId, null);
  } catch (err) {
    console.error("[applyOpenCreditToInvoice] buffer", err);
  }

  return {
    ok: true,
    invoice_id: invoiceId,
    credit_id: creditId,
    payment_status: fullyPaid ? "paid" : "partial",
    applied_gbp: appliedGbp,
    credit_residual_gbp: creditFullyUsed ? 0 : creditResidual,
    credit_status: creditFullyUsed ? "applied" : "open",
    invoice_remaining_gbp: fullyPaid ? 0 : invoiceRemaining,
    partial: !fullyPaid,
    xero,
    hold,
  };
}

/**
 * After office issues a credit: apply to next INV-P(s) until credit exhausted or no invoice.
 * Does not require parent action. Works on hidden unpaid shares.
 */
export async function autoApplyOpenCreditToNextInvoices(
  admin: { from: (t: string) => any },
  creditId: string,
  opts?: { maxInvoices?: number },
): Promise<{
  ok: boolean;
  skipped?: string;
  applications: ApplyCreditResult[];
  credit_id: string;
  final_credit_status?: string;
  final_credit_gbp?: number | null;
  gocardless_held?: boolean;
}> {
  const id = clean(creditId, 60);
  const maxInvoices = Math.min(Math.max(Number(opts?.maxInvoices) || 6, 1), 12);
  const applications: ApplyCreditResult[] = [];

  const { data: credit, error } = await admin
    .from("portal_parent_family_credits")
    .select("id, contact_id, kind, status, amount_gbp")
    .eq("id", id)
    .maybeSingle();

  if (error || !credit) {
    return { ok: false, skipped: "credit_not_found", applications, credit_id: id };
  }
  if (credit.kind !== "credit") {
    return { ok: true, skipped: "not_a_credit", applications, credit_id: id };
  }
  if (credit.status !== "open") {
    return { ok: true, skipped: "credit_not_open", applications, credit_id: id };
  }
  const amt = money(Number(credit.amount_gbp));
  if (!Number.isFinite(amt) || amt <= 0) {
    return { ok: true, skipped: "no_amount", applications, credit_id: id };
  }

  const contactId = clean(credit.contact_id, 120);
  for (let i = 0; i < maxInvoices; i++) {
    const { data: live } = await admin
      .from("portal_parent_family_credits")
      .select("id, status, amount_gbp")
      .eq("id", id)
      .maybeSingle();
    if (!live || live.status !== "open") break;
    const left = money(Number(live.amount_gbp));
    if (!Number.isFinite(left) || left <= 0) break;

    const nextInv = await findNextInvoiceForCreditApply(admin, contactId, {
      allowHidden: true,
      skipGocardless: true,
    });
    if (!nextInv) {
      // Distinguish: no invoice at all vs only GC instalments left.
      const anyOpen = await findNextInvoiceForCreditApply(admin, contactId, {
        allowHidden: true,
        skipGocardless: false,
      });
      const gcHeld = !!anyOpen && invoiceIsGocardlessHint(anyOpen);
      return {
        ok: true,
        skipped: applications.length
          ? undefined
          : gcHeld
            ? "gocardless_held_for_next_term"
            : "no_open_invoice",
        applications,
        credit_id: id,
        final_credit_status: "open",
        final_credit_gbp: left,
        gocardless_held: gcHeld,
      };
    }

    const result = await applyOpenCreditToInvoice(admin, {
      creditId: id,
      invoiceId: clean(nextInv.id, 80),
      contactId,
      allowHidden: true,
      actor: "office_auto",
    });
    applications.push(result);
    if (!result.ok) break;
    if ((result.credit_residual_gbp || 0) <= 0) break;
  }

  const { data: finalCredit } = await admin
    .from("portal_parent_family_credits")
    .select("status, amount_gbp")
    .eq("id", id)
    .maybeSingle();

  return {
    ok: true,
    applications,
    credit_id: id,
    final_credit_status: finalCredit?.status,
    final_credit_gbp:
      finalCredit?.amount_gbp != null ? money(Number(finalCredit.amount_gbp)) : null,
  };
}
