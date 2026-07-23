/**
 * Term invoices with embedded instalment plans (re-enrolment).
 * One portal_parent_invoice_share row = one billing term total + payment_schedule JSON.
 */

export type InvoicePaymentScheduleRow = {
  seq: number;
  label: string;
  due_date: string | null;
  amount_gbp: number;
  status: "pending" | "paid";
  paid_at?: string | null;
  paid_via?: string | null;
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizePaymentSchedule(raw: unknown): InvoicePaymentScheduleRow[] {
  if (!Array.isArray(raw)) return [];
  const out: InvoicePaymentScheduleRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const amount = Number(o.amount_gbp);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const status = String(o.status || "pending").toLowerCase() === "paid" ? "paid" : "pending";
    out.push({
      seq: Number(o.seq) > 0 ? Math.floor(Number(o.seq)) : i + 1,
      label: String(o.label || `Payment ${i + 1}`).trim().slice(0, 120),
      due_date: o.due_date ? String(o.due_date).slice(0, 10) : null,
      amount_gbp: round2(amount),
      status,
      paid_at: o.paid_at ? String(o.paid_at) : null,
      paid_via: o.paid_via ? String(o.paid_via).slice(0, 40) : null,
    });
  }
  return out.sort((a, b) => a.seq - b.seq);
}

export function hasPaymentSchedule(raw: unknown): boolean {
  return normalizePaymentSchedule(raw).length > 0;
}

export function scheduleInstalmentCount(raw: unknown): number {
  return normalizePaymentSchedule(raw).length;
}

/**
 * Short plan phrase for admin Method chip + PDF "Payment Method" line.
 * Always keep the invoice total separate; this only describes how they pay it.
 */
export function paymentSchedulePlanShortLabel(
  schedule: InvoicePaymentScheduleRow[],
  opts?: {
    notes?: string | null;
    dueDateIso?: string | null;
    /** bank_transfer | gocardless | … — bank never uses monthly. */
    paymentMethodHint?: string | null;
  },
): string | null {
  const rows = (schedule || []).filter((r) => r && Number(r.amount_gbp) > 0);
  const blob = rows.map((r) => String(r.label || "")).join(" ").toLowerCase();
  const notes = String(opts?.notes || "").toLowerCase();
  const hay = `${blob} ${notes}`;
  const n = rows.length;
  if (!n) return null;
  const method = String(opts?.paymentMethodHint || "").toLowerCase();
  const isBank = !method || method === "bank_transfer" || method === "bank" || method === "tide";
  const isGc = method === "gocardless";

  if (
    /yearly_1off|one[\s-]?off.*(year|annual)|full academic year|whole year/.test(hay) ||
    (n === 1 && /\b(year|annual|full year)\b/.test(blob))
  ) {
    return "One-off (whole year)";
  }
  if (n === 1 && /one[\s-]?off|whole term|full term/.test(hay)) {
    return "One-off (whole term)";
  }
  // Bank transfer: only one-off or flexi (2 per term). Never "monthly".
  if (isBank && !isGc) {
    if (n === 1) return "One-off (whole term)";
    if (n === 2 || /\b(half|1st|2nd|flexi)\b/.test(hay)) return "Flexi (2 per term)";
    return "Flexi (2 per term)";
  }
  if (n >= 2 && /\b(half|1st|2nd|flexi)\b/.test(hay)) {
    return "Flexi (2 per term)";
  }
  if (
    isGc &&
    n >= 3 &&
    (/month/.test(hay) ||
      /payment\s*\d|january|february|march|april|may|june|july|august|september|october|november|december/
        .test(hay))
  ) {
    return `${n} monthly`;
  }
  if (
    /own way|own arrangement|own_term|admin fee|minimum prepaid|top-?ups? as you go/.test(
      hay,
    )
  ) {
    return "Own arrangement";
  }
  if (n === 1 && /full payment|one payment|pay in full/.test(hay)) {
    return "One per term";
  }
  if (n === 1) return "One per term";
  if (n === 2) return "Flexi (2 per term)";
  if (n > 2) return isGc ? `${n} monthly` : "Flexi (2 per term)";
  return null;
}

export function nextPendingInstalment(
  schedule: InvoicePaymentScheduleRow[],
): InvoicePaymentScheduleRow | null {
  return schedule.find((r) => r.status !== "paid") || null;
}

export function amountPaidFromSchedule(schedule: InvoicePaymentScheduleRow[]): number {
  return round2(
    schedule.filter((r) => r.status === "paid").reduce((s, r) => s + r.amount_gbp, 0),
  );
}

/** Amount the parent should pay next (one instalment, or remainder for legacy invoices). */
export function amountDueNow(share: {
  amount_gbp?: unknown;
  amount_paid_gbp?: unknown;
  payment_schedule?: unknown;
  payment_status?: unknown;
}): number {
  const schedule = normalizePaymentSchedule(share.payment_schedule);
  if (schedule.length) {
    const next = nextPendingInstalment(schedule);
    if (!next) return 0;
    return next.amount_gbp;
  }
  const total = Number(share.amount_gbp);
  const paid = Number(share.amount_paid_gbp);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (String(share.payment_status || "").toLowerCase() === "paid") return 0;
  const p = Number.isFinite(paid) && paid > 0 ? paid : 0;
  return Math.max(0, round2(total - p));
}

export function nextInstalmentDueDate(schedule: InvoicePaymentScheduleRow[]): string | null {
  const next = nextPendingInstalment(schedule);
  return next?.due_date || null;
}

export type ApplyInstalmentPaymentResult = {
  schedule: InvoicePaymentScheduleRow[];
  amount_paid_gbp: number;
  payment_status: "unpaid" | "partial" | "paid";
  next_instalment_due: string | null;
  paid_instalment_seq: number | null;
};

/**
 * Mark the next pending instalment paid when amount matches (±1p).
 * Admin full-pay: pass markAll=true to clear the whole schedule.
 */
export function applyInstalmentPayment(
  rawSchedule: unknown,
  opts: {
    amountGbp: number;
    paidAt: string;
    paidVia: string;
    markAll?: boolean;
  },
): ApplyInstalmentPaymentResult {
  const schedule = normalizePaymentSchedule(rawSchedule).map((r) => ({ ...r }));
  const payAmt = round2(opts.amountGbp);
  let paidSeq: number | null = null;

  if (opts.markAll) {
    for (const row of schedule) {
      if (row.status !== "paid") {
        row.status = "paid";
        row.paid_at = opts.paidAt;
        row.paid_via = opts.paidVia;
        paidSeq = row.seq;
      }
    }
  } else {
    const next = schedule.find((r) => r.status !== "paid");
    if (next && payAmt > 0) {
      const diff = Math.abs(payAmt - next.amount_gbp);
      if (diff <= 0.02 || payAmt + 1e-9 >= next.amount_gbp) {
        next.status = "paid";
        next.paid_at = opts.paidAt;
        next.paid_via = opts.paidVia;
        paidSeq = next.seq;
      }
    }
  }

  const amount_paid_gbp = amountPaidFromSchedule(schedule);
  const total = round2(schedule.reduce((s, r) => s + r.amount_gbp, 0));
  const allPaid = schedule.length > 0 && schedule.every((r) => r.status === "paid");
  let payment_status: "unpaid" | "partial" | "paid" = "unpaid";
  if (allPaid || (total > 0 && amount_paid_gbp + 0.01 >= total)) {
    payment_status = "paid";
  } else if (amount_paid_gbp > 0) {
    payment_status = "partial";
  }

  return {
    schedule,
    amount_paid_gbp,
    payment_status,
    next_instalment_due: nextInstalmentDueDate(schedule),
    paid_instalment_seq: paidSeq,
  };
}

/**
 * Reduce pending instalments by a credit amount (first pending onwards).
 * The invoice total (amount_gbp) is reduced by the same credit elsewhere, so
 * the schedule keeps matching the total. Fully covered instalments drop out.
 */
export function applyCreditToSchedule(
  rawSchedule: unknown,
  creditGbp: number,
): { schedule: InvoicePaymentScheduleRow[]; next_instalment_due: string | null } {
  const schedule = normalizePaymentSchedule(rawSchedule).map((r) => ({ ...r }));
  let remaining = round2(creditGbp);
  const out: InvoicePaymentScheduleRow[] = [];
  for (const row of schedule) {
    if (remaining > 0 && row.status !== "paid") {
      const applied = Math.min(remaining, row.amount_gbp);
      row.amount_gbp = round2(row.amount_gbp - applied);
      remaining = round2(remaining - applied);
      if (row.amount_gbp <= 0) continue;
    }
    out.push(row);
  }
  return { schedule: out, next_instalment_due: nextInstalmentDueDate(out) };
}

export function parentFacingSchedule(
  schedule: InvoicePaymentScheduleRow[],
): Array<{
  seq: number;
  label: string;
  due_date: string | null;
  amount_gbp: number;
  status: string;
  paid_at: string | null;
}> {
  return schedule.map((r) => ({
    seq: r.seq,
    label: r.label,
    due_date: r.due_date,
    amount_gbp: r.amount_gbp,
    status: r.status,
    paid_at: r.paid_at || null,
  }));
}
