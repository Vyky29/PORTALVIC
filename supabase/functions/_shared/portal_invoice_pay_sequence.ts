// @ts-nocheck — Edge Function shared helper.
//
// Parents must settle invoices in order (Autumn → Spring → Summer / earlier due).
// Admin must Confirm (payment_status = paid) before the next invoice can be
// card-paid or green-button reported. pending_confirmation / unpaid / partial
// on an earlier invoice blocks later ones.

export type PaySequenceShare = {
  id?: unknown;
  invoice_number?: unknown;
  billing_term?: unknown;
  due_date?: unknown;
  next_instalment_due?: unknown;
  payment_status?: unknown;
  share_status?: unknown;
  payment_method_hint?: unknown;
  created_at?: unknown;
};

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Autumn before Spring before Summer; unknown terms sort after known ones by due date. */
export function billingTermSortRank(term: unknown): number {
  const t = clean(term, 20).toLowerCase();
  if (t === "autumn") return 1;
  if (t === "spring") return 2;
  if (t === "summer") return 3;
  return 50;
}

function dueSortKey(share: PaySequenceShare): string {
  return clean(share.due_date || share.next_instalment_due || share.created_at, 40).slice(0, 10);
}

export function compareInvoicesPaySequence(a: PaySequenceShare, b: PaySequenceShare): number {
  const ta = billingTermSortRank(a.billing_term);
  const tb = billingTermSortRank(b.billing_term);
  if (ta !== tb) return ta - tb;
  const da = dueSortKey(a);
  const db = dueSortKey(b);
  if (da && db && da !== db) return da.localeCompare(db);
  return clean(a.invoice_number, 40).localeCompare(clean(b.invoice_number, 40));
}

/** Fully settled by office — only this unlocks the next invoice. */
export function invoiceAdminValidated(share: PaySequenceShare): boolean {
  const st = clean(share.payment_status, 40).toLowerCase();
  return st === "paid";
}

export function invoiceIncludedInPaySequence(share: PaySequenceShare): boolean {
  const st = clean(share.payment_status, 40).toLowerCase();
  if (st === "void" || st === "cancelled") return false;
  const shareStatus = clean(share.share_status, 40).toLowerCase();
  if (shareStatus && shareStatus !== "ready") return false;
  const hint = clean(share.payment_method_hint, 40).toLowerCase();
  // LA-funded / office-billed: parent does not pay these — skip sequence.
  if (hint === "la_funded") return false;
  return true;
}

export type PriorInvoiceBlock = {
  blocked: true;
  prior: {
    id: string;
    invoice_number: string | null;
    billing_term: string | null;
    payment_status: string;
    due_date: string | null;
  };
  error: "prior_invoice_unconfirmed";
  message: string;
};

/**
 * Among ready parent-pay shares for a contact, return the earliest prior invoice
 * that admin has not yet marked paid. Null = this invoice may be paid/reported.
 */
export function findPriorUnconfirmedInvoice(
  shares: PaySequenceShare[],
  targetInvoiceId: string,
): PriorInvoiceBlock | null {
  const targetId = clean(targetInvoiceId, 80);
  if (!targetId) return null;

  const ordered = (shares || [])
    .filter(invoiceIncludedInPaySequence)
    .slice()
    .sort(compareInvoicesPaySequence);

  const targetIdx = ordered.findIndex((s) => clean(s.id, 80) === targetId);
  if (targetIdx <= 0) return null;

  for (let i = 0; i < targetIdx; i++) {
    const prior = ordered[i];
    if (invoiceAdminValidated(prior)) continue;
    const st = clean(prior.payment_status, 40).toLowerCase() || "unpaid";
    const num = clean(prior.invoice_number, 40) || "the earlier invoice";
    const term = clean(prior.billing_term, 20);
    const termLabel = term
      ? term.charAt(0).toUpperCase() + term.slice(1)
      : null;
    const waiting =
      st === "pending_confirmation"
        ? "waiting for the office to confirm"
        : st === "partial"
          ? "still has a balance due"
          : "is still unpaid";
    const where = termLabel ? `${termLabel} (${num})` : num;
    return {
      blocked: true,
      prior: {
        id: clean(prior.id, 80),
        invoice_number: clean(prior.invoice_number, 40) || null,
        billing_term: term || null,
        payment_status: st,
        due_date: dueSortKey(prior) || null,
      },
      error: "prior_invoice_unconfirmed",
      message:
        `Please settle ${where} first — it ${waiting}. ` +
        `You can pay the next invoice after the office confirms that payment.`,
    };
  }
  return null;
}

/** Load sibling shares and return a block if paying `invoiceId` is too early. */
export async function assertNoPriorUnconfirmedInvoice(
  admin: { from: (t: string) => any },
  contactId: string,
  invoiceId: string,
): Promise<PriorInvoiceBlock | null> {
  const cid = clean(contactId, 120);
  const iid = clean(invoiceId, 80);
  if (!cid || !iid) return null;

  const { data, error } = await admin
    .from("portal_parent_invoice_share")
    .select(
      "id, invoice_number, billing_term, due_date, next_instalment_due, payment_status, share_status, payment_method_hint, created_at",
    )
    .eq("contact_id", cid);

  if (error) {
    console.error("[assertNoPriorUnconfirmedInvoice]", error.message);
    return null;
  }
  return findPriorUnconfirmedInvoice(data || [], iid);
}
