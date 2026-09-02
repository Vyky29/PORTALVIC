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
  /** How this instalment is collected (hybrid GC: first month bank, later months DD). */
  collect_via?: "bank_transfer" | "gocardless" | null;
  /** GoCardless payment id scheduled/collected for this instalment only. */
  gocardless_payment_id?: string | null;
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
    const viaRaw = String(o.collect_via || "").trim().toLowerCase();
    const collect_via =
      viaRaw === "bank_transfer" || viaRaw === "bank" || viaRaw === "tide"
        ? ("bank_transfer" as const)
        : viaRaw === "gocardless" || viaRaw === "gc"
          ? ("gocardless" as const)
          : null;
    out.push({
      seq: Number(o.seq) > 0 ? Math.floor(Number(o.seq)) : i + 1,
      label: String(o.label || `Payment ${i + 1}`).trim().slice(0, 120),
      due_date: o.due_date ? String(o.due_date).slice(0, 10) : null,
      amount_gbp: round2(amount),
      status,
      paid_at: o.paid_at ? String(o.paid_at) : null,
      paid_via: o.paid_via ? String(o.paid_via).slice(0, 40) : null,
      collect_via,
      gocardless_payment_id: o.gocardless_payment_id
        ? String(o.gocardless_payment_id).slice(0, 80)
        : null,
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

/** Mid-month join: bank remainder + later GC 1sts. */
export function hybridBankGcPlanLabel(
  rows: InvoicePaymentScheduleRow[],
): string | null {
  let bank = 0;
  let gc = 0;
  for (const r of rows || []) {
    const via = String(r.collect_via || "").toLowerCase();
    const lab = String(r.label || "").toLowerCase();
    if (via === "bank_transfer" || via === "bank" || /bank transfer/.test(lab)) {
      bank += 1;
    } else if (via === "gocardless" || via === "gc" || /gocardless/.test(lab)) {
      gc += 1;
    }
  }
  if (bank > 0 && gc > 0) {
    const bankBit = bank === 1 ? "1 bank transfer" : `${bank} bank transfers`;
    const gcBit = gc === 1 ? "1 GoCardless" : `${gc} GoCardless`;
    return `${bankBit} + ${gcBit} · £1.50 / GC instalment`;
  }
  return null;
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

  const hybrid = hybridBankGcPlanLabel(rows);
  if (hybrid) return hybrid;

  if (
    /own way|own arrangement|own_term|admin fee|minimum prepaid|top-?ups? as you go/.test(
      hay,
    )
  ) {
    return "Own way";
  }
  if (
    /yearly_1off|one[\s-]?off.*(year|annual)|full academic year|whole year/.test(hay) ||
    (n === 1 && /\b(year|annual|full year)\b/.test(blob))
  ) {
    return "One-off payment (year)";
  }
  if (n === 1 && /one[\s-]?off|whole term|full term/.test(hay)) {
    return "One-off payment (term)";
  }
  // Bank transfer: only one-off or flexi. Never "monthly".
  if (isBank && !isGc) {
    if (n === 1) return "One-off payment (term)";
    if (n >= 6 || /6 per year|six per year/.test(hay)) return "Flexi: 6 per year";
    if (n === 2 || /\b(half|1st|2nd|flexi)\b/.test(hay)) return "Flexi: 2 per term";
    return "Flexi: 2 per term";
  }
  if (n >= 2 && /\b(half|1st|2nd|flexi)\b/.test(hay)) {
    return "Flexi: 2 per term";
  }
  if (
    isGc &&
    n >= 3 &&
    (/month/.test(hay) ||
      /payment\s*\d|january|february|march|april|may|june|july|august|september|october|november|december/
        .test(hay))
  ) {
    return `GoCardless (monthly ×${n} · term) · £1.50 / instalment`;
  }
  if (n === 1 && /full payment|one payment|pay in full/.test(hay)) {
    return isGc
      ? "GoCardless (one per term) · £1.50 / instalment"
      : "One-off payment (term)";
  }
  if (n === 1) {
    return isGc
      ? "GoCardless (one per term) · £1.50 / instalment"
      : "One-off payment (term)";
  }
  if (n === 2) return "Flexi: 2 per term";
  if (n > 2) {
    return isGc
      ? `GoCardless (monthly ×${n} · term) · £1.50 / instalment`
      : "Flexi: 2 per term";
  }
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

/** YYYY-MM-DD in Europe/London (club office day). */
export function todayIsoLondon(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/** Whole days until due (negative = overdue). Null if no date. */
export function daysUntilDueIso(dueIso: string | null | undefined, todayIso?: string): number | null {
  const due = dueIso ? String(dueIso).slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const today = todayIso || todayIsoLondon();
  const a = Date.parse(today + "T12:00:00Z");
  const b = Date.parse(due + "T12:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Office/parent "collect now" window: overdue, due today, or within `withinDays`
 * (default 7 — same as admin Confirm paid / hub pulse). No due date → allow.
 */
export function instalmentDueIsCollectingNow(
  dueIso: string | null | undefined,
  withinDays = 7,
): boolean {
  const days = daysUntilDueIso(dueIso);
  if (days == null) return true;
  return days <= withinDays;
}

/** Next unpaid half is in the collect window (or invoice has no schedule). */
export function shareNextInstalmentIsCollectingNow(share: {
  payment_schedule?: unknown;
  next_instalment_due?: unknown;
  due_date?: unknown;
}): boolean {
  const schedule = normalizePaymentSchedule(share.payment_schedule);
  const nextDue =
    nextInstalmentDueDate(schedule) ||
    (share.next_instalment_due ? String(share.next_instalment_due).slice(0, 10) : null) ||
    (share.due_date ? String(share.due_date).slice(0, 10) : null);
  return instalmentDueIsCollectingNow(nextDue);
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

const FLEXI_DUES: Record<string, { label: string; halves: Array<{ half: string; due: string }> }> = {
  autumn: {
    label: "Autumn",
    halves: [
      { half: "1st half", due: "2026-08-15" },
      { half: "2nd half", due: "2026-10-26" },
    ],
  },
  spring: {
    label: "Spring",
    halves: [
      { half: "1st half", due: "2027-01-01" },
      { half: "2nd half", due: "2027-02-15" },
    ],
  },
  summer: {
    label: "Summer",
    halves: [
      { half: "1st half", due: "2027-04-01" },
      { half: "2nd half", due: "2027-05-31" },
    ],
  },
};

const TERM_ONE_OFF_DUE: Record<string, { label: string; due: string }> = {
  autumn: { label: "Autumn", due: "2026-08-15" },
  spring: { label: "Spring", due: "2027-01-01" },
  summer: { label: "Summer", due: "2027-04-01" },
};

function splitEqualAmounts(totalGbp: number, n: number): number[] {
  const total = round2(totalGbp);
  if (n <= 1) return [total];
  const base = round2(Math.floor((total * 100) / n) / 100);
  const out = Array.from({ length: n }, () => base);
  const head = round2(base * (n - 1));
  out[n - 1] = round2(total - head);
  return out;
}

/** Short labels for admin plan selector / reenrol payload. */
export function reenrolPaymentScheduleMeta(
  code: string,
): { code: string; label: string } | null {
  const c = String(code || "").toLowerCase().trim();
  if (c === "term_3") return { code: "term_3", label: "One-off payment (term)" };
  if (c === "term_flexi") {
    return { code: "term_flexi", label: "Per term — two instalments (flexi)" };
  }
  if (c === "yearly_1off") {
    return { code: "yearly_1off", label: "One-off payment (year)" };
  }
  if (c === "monthly_10" || c === "monthly_term") {
    return {
      code: c,
      label: "GoCardless monthly (term) · £1.50 / instalment",
    };
  }
  if (c === "own_term") {
    return { code: "own_term", label: "Own arrangement (prepaid buffer)" };
  }
  return null;
}

/**
 * Rebuild instalment rows for one billing-term INV-P when office changes plan.
 * Keeps the invoice total; only reshapes how it is collected.
 */
export function rebuildTermPaymentSchedule(opts: {
  scheduleCode: string;
  billingTerm: string | null | undefined;
  totalGbp: number;
}): InvoicePaymentScheduleRow[] {
  const code = String(opts.scheduleCode || "").toLowerCase().trim();
  const term = String(opts.billingTerm || "autumn").toLowerCase().trim();
  const total = round2(opts.totalGbp);
  if (!(total > 0)) return [];

  if (code === "term_3" || code === "yearly_1off") {
    const meta = TERM_ONE_OFF_DUE[term] || TERM_ONE_OFF_DUE.autumn;
    return [
      {
        seq: 1,
        label: `${meta.label} · full payment`,
        due_date: meta.due,
        amount_gbp: total,
        status: "pending",
        paid_at: null,
        paid_via: null,
      },
    ];
  }

  if (code === "term_flexi") {
    const meta = FLEXI_DUES[term] || FLEXI_DUES.autumn;
    const amounts = splitEqualAmounts(total, 2);
    return meta.halves.map((h, i) => ({
      seq: i + 1,
      label: `${meta.label} term · ${h.half}`,
      due_date: h.due,
      amount_gbp: amounts[i] || 0,
      status: "pending" as const,
      paid_at: null,
      paid_via: null,
    }));
  }

  // Monthly plans: keep equal slices using flexi half count as fallback (2),
  // or 4/3/4 for autumn/spring/summer when monthly.
  if (code === "monthly_10" || code === "monthly_term") {
    const n = term === "spring" ? 3 : 4;
    const amounts = splitEqualAmounts(total, n);
    const monthLabels =
      term === "autumn"
        ? ["September", "October", "November", "December"]
        : term === "spring"
          ? ["January", "February", "March"]
          : ["April", "May", "June", "July"];
    const year = term === "autumn" ? "2026" : "2027";
    const dues =
      term === "autumn"
        ? ["2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"]
        : term === "spring"
          ? ["2027-01-01", "2027-02-01", "2027-03-01"]
          : ["2027-04-01", "2027-05-01", "2027-06-01", "2027-07-01"];
    return amounts.map((amt, i) => ({
      seq: i + 1,
      label: `Payment · ${monthLabels[i]} ${year}`,
      due_date: dues[i] || null,
      amount_gbp: amt,
      status: "pending" as const,
      paid_at: null,
      paid_via: null,
    }));
  }

  return [
    {
      seq: 1,
      label: "Payment",
      due_date: null,
      amount_gbp: total,
      status: "pending",
      paid_at: null,
      paid_via: null,
    },
  ];
}

/**
 * Apply a bank total across a fresh schedule (full rows only).
 * Use when office changes plan after a Tide payment that may exceed one instalment.
 */
export function applyPaidAmountAcrossSchedule(
  rawSchedule: unknown,
  opts: { amountGbp: number; paidAt: string; paidVia: string },
): ApplyInstalmentPaymentResult {
  const schedule = normalizePaymentSchedule(rawSchedule).map((r) => ({
    ...r,
    status: "pending" as const,
    paid_at: null as string | null,
    paid_via: null as string | null,
  }));
  let remaining = round2(opts.amountGbp);
  let paidSeq: number | null = null;
  for (const row of schedule) {
    if (remaining + 0.01 < row.amount_gbp) break;
    row.status = "paid";
    row.paid_at = opts.paidAt;
    row.paid_via = opts.paidVia;
    remaining = round2(remaining - row.amount_gbp);
    paidSeq = row.seq;
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
