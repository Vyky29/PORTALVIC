/**
 * Build 2026/27 re-enrolment instalment invoices from funding choices + term totals.
 * Mirrors parent UI schedule preview (portal_reenrolment_2026_27.js).
 */
import type { PortalInvoiceVatMode } from "./portal_tax_invoice_pdf.ts";
import type { InvoicePaymentScheduleRow } from "./portal_invoice_payment_schedule.ts";

export type ReenrolTermKey = "autumn" | "spring" | "summer";

export type ReenrolInstalment = {
  label: string;
  dueDateIso: string | null;
  amountGbp: number;
  lineDescription: string;
  reference: string;
};

/** One billing-term invoice (full term total + instalment plan on the same share row). */
export type ReenrolTermInvoice = {
  term: ReenrolTermKey | null;
  label: string;
  amountGbp: number;
  dueDateIso: string | null;
  lineDescription: string;
  reference: string;
  paymentSchedule: InvoicePaymentScheduleRow[];
  isAdminFee?: boolean;
};

export type ReenrolTermTotals = {
  autumn: number;
  spring: number;
  summer: number;
  annual: number;
};

const GC_FEE = 1.5;
const OWN_FEE = 50;

const FLEXI_TERM: Array<{
  term: keyof Pick<ReenrolTermTotals, "autumn" | "spring" | "summer">;
  termLabel: string;
  halves: Array<{ halfLabel: string; dueIso: string }>;
}> = [
  {
    term: "autumn",
    termLabel: "Autumn term",
    halves: [
      { halfLabel: "1st half", dueIso: "2026-09-01" },
      { halfLabel: "2nd half", dueIso: "2026-10-26" },
    ],
  },
  {
    term: "spring",
    termLabel: "Spring term",
    halves: [
      { halfLabel: "1st half", dueIso: "2027-01-01" },
      { halfLabel: "2nd half", dueIso: "2027-02-15" },
    ],
  },
  {
    term: "summer",
    termLabel: "Summer term",
    halves: [
      { halfLabel: "1st half", dueIso: "2027-04-01" },
      { halfLabel: "2nd half", dueIso: "2027-05-31" },
    ],
  },
];

const MONTHLY_TERM_PLAN: Array<{
  term: keyof Pick<ReenrolTermTotals, "autumn" | "spring" | "summer">;
  label: string;
  months: Array<{ label: string; dueIso: string }>;
}> = [
  {
    term: "autumn",
    label: "Autumn",
    months: [
      { label: "September 2026", dueIso: "2026-09-01" },
      { label: "October 2026", dueIso: "2026-10-01" },
      { label: "November 2026", dueIso: "2026-11-01" },
      { label: "December 2026", dueIso: "2026-12-01" },
    ],
  },
  {
    term: "spring",
    label: "Spring",
    months: [
      { label: "January 2027", dueIso: "2027-01-01" },
      { label: "February 2027", dueIso: "2027-02-01" },
      { label: "March 2027", dueIso: "2027-03-01" },
    ],
  },
  {
    term: "summer",
    label: "Summer",
    months: [
      { label: "April 2027", dueIso: "2027-04-01" },
      { label: "May 2027", dueIso: "2027-05-01" },
      { label: "June 2027", dueIso: "2027-06-01" },
      { label: "July 2027", dueIso: "2027-07-01" },
    ],
  },
];

const MONTHLY_10 = [
  { label: "September 2026", dueIso: "2026-09-01" },
  { label: "October 2026", dueIso: "2026-10-01" },
  { label: "November 2026", dueIso: "2026-11-01" },
  { label: "December 2026", dueIso: "2026-12-01" },
  { label: "January 2027", dueIso: "2027-01-01" },
  { label: "February 2027", dueIso: "2027-02-01" },
  { label: "March 2027", dueIso: "2027-03-01" },
  { label: "April 2027", dueIso: "2027-04-01" },
  { label: "May 2027", dueIso: "2027-05-01" },
  { label: "June 2027", dueIso: "2027-06-01" },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clean(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

export function parseReenrolTermTotals(raw: unknown): ReenrolTermTotals | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const autumn = num(o.autumn);
  const spring = num(o.spring);
  const summer = num(o.summer);
  let annual = num(o.annual);
  if (!annual) annual = round2(autumn + spring + summer);
  if (annual <= 0 && autumn <= 0 && spring <= 0 && summer <= 0) return null;
  return { autumn, spring, summer, annual };
}

export function termTotalsFromWeeklySlots(
  weeklySlots: unknown,
  weeklyChoices?: unknown,
): ReenrolTermTotals | null {
  if (!Array.isArray(weeklySlots) || !weeklySlots.length) return null;
  const choices =
    weeklyChoices && typeof weeklyChoices === "object"
      ? (weeklyChoices as Record<string, { choice?: string }>)
      : null;
  let autumn = 0;
  let spring = 0;
  let summer = 0;
  let annual = 0;
  weeklySlots.forEach((slot, idx) => {
    if (!slot || typeof slot !== "object") return;
    const s = slot as Record<string, unknown>;
    const id = clean(s.id, 80) || `slot-${idx}`;
    const choice = choices && choices[id] ? clean(choices[id].choice, 40).toLowerCase() : "keep";
    if (choice === "withdraw") return;
    const t = s.termTotals;
    if (!t || typeof t !== "object") return;
    const tt = t as Record<string, unknown>;
    autumn += num(tt.autumn);
    spring += num(tt.spring);
    summer += num(tt.summer);
    annual += num(tt.annual);
  });
  autumn = round2(autumn);
  spring = round2(spring);
  summer = round2(summer);
  annual = round2(annual || autumn + spring + summer);
  if (annual <= 0) return null;
  return { autumn, spring, summer, annual };
}

function withGcFee(base: number, payCode: string): number {
  const n = round2(base);
  if (n <= 0) return 0;
  if (payCode === "gocardless") return round2(n + GC_FEE);
  return n;
}

function paymentMethodHint(
  payCode: string,
): "bank_transfer" | "gocardless" | "payment_link" | "other" {
  if (payCode === "gocardless") return "gocardless";
  if (payCode === "card" || payCode === "apple_pay" || payCode === "payment_link") {
    return "payment_link";
  }
  return "bank_transfer";
}

function vatModeFromChoices(choices: Record<string, unknown>): PortalInvoiceVatMode {
  const code = clean(choices.invoice_type_code, 40).toLowerCase();
  const fund = clean(choices.funding_code, 40).toLowerCase();
  if (code === "exempt" || fund === "la_direct_payments") return "exempt";
  return "vat_20";
}

function shortAcademicYear(academicYear: string): string {
  const raw = clean(academicYear, 20);
  const m = raw.match(/(\d{2})\D+(\d{2})/);
  if (m) return `${m[1]}/${m[2]}`;
  return raw;
}

/** Invoice / Xero Reference from instalment label + academic year (e.g. "Summer term 26/27"). */
function instalmentInvoiceReference(label: string, academicYear: string): string {
  const base = clean(label, 90);
  const year = shortAcademicYear(academicYear);
  if (!base) return year || "Re-enrolment";
  if (!year) return base;
  if (base.toLowerCase().includes(year.toLowerCase())) return base.slice(0, 120);
  return `${base} ${year}`.slice(0, 120);
}

function pushInstalment(
  out: ReenrolInstalment[],
  opts: {
    label: string;
    dueDateIso: string | null;
    amountGbp: number;
    academicYear: string;
  },
) {
  const amount = round2(opts.amountGbp);
  if (amount <= 0) return;
  out.push({
    label: opts.label,
    dueDateIso: opts.dueDateIso,
    amountGbp: amount,
    lineDescription: buildReenrolmentInvoiceLeadDescription(
      opts.academicYear,
      opts.label,
    ),
    reference: instalmentInvoiceReference(opts.label, opts.academicYear),
  });
}

function pushTermInvoice(
  out: ReenrolTermInvoice[],
  opts: {
    term: ReenrolTermKey | null;
    label: string;
    academicYear: string;
    dueDateIso: string | null;
    instalmentRows: Array<{ label: string; dueIso: string; amountGbp: number }>;
    isAdminFee?: boolean;
  },
) {
  const schedule: InvoicePaymentScheduleRow[] = opts.instalmentRows
    .map((r, i) => ({
      seq: i + 1,
      label: clean(r.label, 120) || `Payment ${i + 1}`,
      due_date: r.dueIso ? String(r.dueIso).slice(0, 10) : null,
      amount_gbp: round2(r.amountGbp),
      status: "pending" as const,
    }))
    .filter((r) => r.amount_gbp > 0);
  if (!schedule.length) return;
  const amountGbp = round2(schedule.reduce((s, r) => s + r.amount_gbp, 0));
  out.push({
    term: opts.term,
    label: opts.label,
    amountGbp,
    dueDateIso: opts.dueDateIso || schedule[0]?.due_date || null,
    lineDescription: buildReenrolmentInvoiceLeadDescription(opts.academicYear, opts.label),
    reference: instalmentInvoiceReference(opts.label, opts.academicYear),
    paymentSchedule: schedule,
    isAdminFee: opts.isAdminFee,
  });
}

/** Split a term programme total into equal instalments (GC fee per slice when applicable). */
function splitTermInstalmentAmounts(
  termTotal: number,
  slots: Array<{ label: string; dueIso: string }>,
  payCode: string,
): Array<{ label: string; dueIso: string; amountGbp: number }> {
  const n = slots.length;
  if (n <= 0 || termTotal <= 0) return [];
  const per = termTotal / n;
  return slots.map((s) => ({
    label: s.label,
    dueIso: s.dueIso,
    amountGbp: withGcFee(per, payCode),
  }));
}

/**
 * Office / Xero description body (before Client's Name / Mode / VAT meta lines).
 * Keep activity wording generic — never embed the participant name here.
 */
export function buildReenrolmentInvoiceLeadDescription(
  academicYear: string,
  instalmentLabel: string,
): string {
  const year = clean(academicYear, 20) || "2026-27";
  const label = clean(instalmentLabel, 120) || "Payment";
  return (
    `Re-enrolment ${year} - ${label}.\n\n` +
    "Structured activity support delivered across aquatic environments for a SEND participant."
  );
}

/** Billing term for 2026/27: Jul–Aug (re-enrol window) and Sep–Dec → Autumn. */
export function currentReenrolBillingTerm(asOf: Date = new Date()): ReenrolTermKey {
  const m = asOf.getMonth() + 1;
  if (m >= 9 && m <= 12) return "autumn";
  if (m >= 1 && m <= 3) return "spring";
  if (m >= 4 && m <= 6) return "summer";
  return "autumn";
}

export function reenrolTermDisplayLabel(term: ReenrolTermKey): string {
  if (term === "spring") return "Spring";
  if (term === "summer") return "Summer";
  return "Autumn";
}

function monthlyCountForTerm(term: ReenrolTermKey, scheduleCode: string): number {
  if (scheduleCode === "monthly_term") {
    return term === "autumn" ? 4 : term === "spring" ? 3 : 4;
  }
  /* monthly_10: 4 / 3 / 3 */
  return term === "autumn" ? 4 : 3;
}

/** Short plan line for parent-facing thank-you / confirmation copy. */
export function reenrolmentSchedulePlanPhrase(args: {
  scheduleCode: string;
  paymentMethodHint: "bank_transfer" | "gocardless" | "payment_link" | "other";
  instalmentCount: number;
  enrolmentCadence?: string | null;
  billingTerm?: ReenrolTermKey | null;
}): string {
  const n = Math.max(0, Math.floor(args.instalmentCount));
  const isGc = args.paymentMethodHint === "gocardless";
  const unit = isGc ? "Direct Payment" : "invoice";
  const units = isGc ? "Direct Payments" : "invoices";
  const code = String(args.scheduleCode || "").toLowerCase();
  const termOnly =
    String(args.enrolmentCadence || "").toLowerCase() === "term_by_term" &&
    !!args.billingTerm;
  const termLabel = termOnly && args.billingTerm
    ? reenrolTermDisplayLabel(args.billingTerm)
    : "";

  if (termOnly) {
    if (code === "term_3") {
      return `1 ${unit} scheduled for ${termLabel} term (term-by-term — later terms when you reconfirm)`;
    }
    if (code === "term_flexi") {
      return `2 ${units} scheduled for ${termLabel} term (term-by-term)`;
    }
    if (code === "monthly_10" || code === "monthly_term") {
      const months = monthlyCountForTerm(args.billingTerm!, code);
      return `${n || months} ${units} scheduled for ${termLabel} term (monthly · term-by-term)`;
    }
    if (code === "own_term") {
      return `${n || 2} ${units} scheduled for ${termLabel} term (own timing · term-by-term, including admin fee)`;
    }
    if (n === 1) return `1 ${unit} scheduled for ${termLabel} term (term-by-term)`;
    if (n > 1) return `${n} ${units} scheduled for ${termLabel} term (term-by-term)`;
  }

  if (code === "yearly_1off") {
    return `1 ${unit} scheduled for the full academic year`;
  }
  if (code === "term_3") {
    return `3 ${units} scheduled (one per term — Autumn, Spring, Summer)`;
  }
  if (code === "term_flexi") {
    return `6 ${units} scheduled (two per term)`;
  }
  if (code === "monthly_10") {
    return `10 ${units} scheduled (monthly Sep–Jun: Autumn 4 · Spring 3 · Summer 3)`;
  }
  if (code === "monthly_term") {
    return `${n || 11} ${units} scheduled (monthly by term)`;
  }
  if (code === "own_term") {
    return `${n || 6} ${units} scheduled (term by term · own timing, including admin fees)`;
  }
  if (n === 1) return `1 ${unit} scheduled`;
  if (n > 1) return `${n} ${units} scheduled`;
  return "";
}

export function buildReenrolmentInstalments(args: {
  funding: unknown;
  termTotals: ReenrolTermTotals | null;
  participantName: string;
  academicYear?: string;
}): {
  termInvoices: ReenrolTermInvoice[];
  /** @deprecated Flat list — use termInvoices. Kept for counts in parent copy. */
  instalments: ReenrolInstalment[];
  vatMode: PortalInvoiceVatMode;
  paymentMethodHint: "bank_transfer" | "gocardless" | "payment_link" | "other";
  scheduleCode: string | null;
  schedulePlanPhrase: string | null;
  skipReason: string | null;
} {
  const academicYear = args.academicYear || "2026-27";
  const empty = {
    termInvoices: [] as ReenrolTermInvoice[],
    instalments: [] as ReenrolInstalment[],
    vatMode: "vat_20" as PortalInvoiceVatMode,
    paymentMethodHint: "bank_transfer" as const,
    scheduleCode: null as string | null,
    schedulePlanPhrase: null as string | null,
    skipReason: null as string | null,
  };

  const funding = args.funding;
  if (!funding || typeof funding !== "object") {
    return { ...empty, skipReason: "no_funding" };
  }
  const choicesRaw = (funding as Record<string, unknown>).choices_2627;
  if (!choicesRaw || typeof choicesRaw !== "object") {
    return { ...empty, skipReason: "no_choices" };
  }
  const choices = choicesRaw as Record<string, unknown>;
  const billingMode = clean(choices.billing_mode, 40).toLowerCase();
  if (billingMode === "funder_invoice") {
    return { ...empty, skipReason: "funder_invoice" };
  }

  const payCode = clean(choices.payment_method_code, 40).toLowerCase();
  const scheduleCode = clean(choices.payment_schedule_code, 40).toLowerCase();
  if (!scheduleCode) {
    return { ...empty, skipReason: "no_schedule" };
  }

  const enrolmentCadence = clean(choices.enrolment_cadence, 40).toLowerCase();
  const billingTerm =
    enrolmentCadence === "term_by_term" ? currentReenrolBillingTerm() : null;
  const includeTerm = (term: ReenrolTermKey) =>
    !billingTerm || billingTerm === term;

  const totals = args.termTotals;
  if (!totals || totals.annual <= 0) {
    return { ...empty, skipReason: "zero_total" };
  }

  const vatMode = vatModeFromChoices(choices);
  const hint = paymentMethodHint(payCode);

  const termOut: ReenrolTermInvoice[] = [];
  const bankAutumnFirstDue = "2026-08-15";
  const gcAutumnFirstDue = "2026-09-01";
  const autumnFirstDue =
    payCode === "gocardless" ? gcAutumnFirstDue : bankAutumnFirstDue;

  const term3Meta: Array<{ key: ReenrolTermKey; label: string; due: string }> = [
    { key: "autumn", label: "Autumn term", due: autumnFirstDue },
    { key: "spring", label: "Spring term", due: "2026-12-01" },
    { key: "summer", label: "Summer term", due: "2027-03-01" },
  ];

  if (payCode === "own_way_flexible" || scheduleCode === "own_term") {
    for (const t of term3Meta) {
      if (!includeTerm(t.key)) continue;
      pushTermInvoice(termOut, {
        term: t.key,
        label: `${t.label} · programme`,
        academicYear,
        dueDateIso: t.due,
        instalmentRows: [
          {
            label: `${t.label} · full programme`,
            dueIso: t.due,
            amountGbp: totals[t.key],
          },
        ],
      });
      pushTermInvoice(termOut, {
        term: null,
        label: `${t.label} · admin fee`,
        academicYear,
        dueDateIso: t.due,
        instalmentRows: [{ label: "Admin fee", dueIso: t.due, amountGbp: OWN_FEE }],
        isAdminFee: true,
      });
    }
  } else if (scheduleCode === "yearly_1off") {
    if (payCode === "gocardless") {
      return {
        ...empty,
        vatMode,
        paymentMethodHint: hint,
        scheduleCode,
        skipReason: "yearly_1off_bank_only",
      };
    }
    /* One invoice per term; each term paid in full on first due date. */
    for (const t of term3Meta) {
      if (!includeTerm(t.key)) continue;
      const due = t.key === "autumn" ? bankAutumnFirstDue : t.due;
      pushTermInvoice(termOut, {
        term: t.key,
        label: t.label,
        academicYear,
        dueDateIso: due,
        instalmentRows: [
          {
            label: `${t.label} · full payment`,
            dueIso: due,
            amountGbp: withGcFee(totals[t.key], payCode),
          },
        ],
      });
    }
  } else if (scheduleCode === "term_3") {
    for (const t of term3Meta) {
      if (!includeTerm(t.key)) continue;
      pushTermInvoice(termOut, {
        term: t.key,
        label: t.label,
        academicYear,
        dueDateIso: t.due,
        instalmentRows: [
          {
            label: `${t.label} · full payment`,
            dueIso: t.due,
            amountGbp: withGcFee(totals[t.key], payCode),
          },
        ],
      });
    }
  } else if (scheduleCode === "term_flexi") {
    for (const t of FLEXI_TERM) {
      if (!includeTerm(t.term)) continue;
      const rows = t.halves.map((h, hi) => {
        let dueIso = h.dueIso;
        if (t.term === "autumn" && hi === 0) {
          dueIso = payCode === "gocardless" ? gcAutumnFirstDue : bankAutumnFirstDue;
        }
        return {
          label: `${t.termLabel} · ${h.halfLabel}`,
          dueIso,
          amountGbp: 0,
        };
      });
      const withAmounts = splitTermInstalmentAmounts(totals[t.term], rows, payCode);
      pushTermInvoice(termOut, {
        term: t.term,
        label: t.termLabel,
        academicYear,
        dueDateIso: withAmounts[0]?.dueIso || null,
        instalmentRows: withAmounts,
      });
    }
  } else if (scheduleCode === "monthly_term") {
    for (const t of MONTHLY_TERM_PLAN) {
      if (!includeTerm(t.term)) continue;
      const slots = t.months.map((m, mi) => {
        let dueIso = m.dueIso;
        if (payCode !== "gocardless" && t.term === "autumn" && mi === 0) {
          dueIso = bankAutumnFirstDue;
        }
        return {
          label: `Payment · ${m.label}`,
          dueIso,
          amountGbp: 0,
        };
      });
      const withAmounts = splitTermInstalmentAmounts(totals[t.term], slots, payCode);
      pushTermInvoice(termOut, {
        term: t.term,
        label: `${t.label} term`,
        academicYear,
        dueDateIso: withAmounts[0]?.dueIso || null,
        instalmentRows: withAmounts,
      });
    }
  } else if (scheduleCode === "monthly_10") {
    const plan10 = [
      { term: "autumn" as const, label: "Autumn", months: MONTHLY_10.slice(0, 4) },
      { term: "spring" as const, label: "Spring", months: MONTHLY_10.slice(4, 7) },
      { term: "summer" as const, label: "Summer", months: MONTHLY_10.slice(7, 10) },
    ];
    for (const t of plan10) {
      if (!includeTerm(t.term)) continue;
      const slots = t.months.map((m, mi) => {
        let dueIso = m.dueIso;
        if (payCode !== "gocardless" && t.term === "autumn" && mi === 0) {
          dueIso = bankAutumnFirstDue;
        }
        return { label: `Payment · ${m.label}`, dueIso, amountGbp: 0 };
      });
      const withAmounts = splitTermInstalmentAmounts(totals[t.term], slots, payCode);
      pushTermInvoice(termOut, {
        term: t.term,
        label: `${t.label} term`,
        academicYear,
        dueDateIso: withAmounts[0]?.dueIso || null,
        instalmentRows: withAmounts,
      });
    }
  } else {
    return {
      ...empty,
      vatMode,
      paymentMethodHint: hint,
      scheduleCode,
      skipReason: "unknown_schedule",
    };
  }

  const instalmentCount = termOut.reduce((s, inv) => s + inv.paymentSchedule.length, 0);
  const schedulePlanPhrase = termOut.length
    ? reenrolmentSchedulePlanPhrase({
      scheduleCode,
      paymentMethodHint: hint,
      instalmentCount,
      enrolmentCadence,
      billingTerm,
    })
    : null;

  const flatInstalments: ReenrolInstalment[] = termOut.flatMap((inv) =>
    inv.paymentSchedule.map((row) => ({
      label: `${inv.label} · ${row.label}`,
      dueDateIso: row.due_date,
      amountGbp: row.amount_gbp,
      lineDescription: inv.lineDescription,
      reference: inv.reference,
    })),
  );

  return {
    termInvoices: termOut,
    instalments: flatInstalments,
    vatMode,
    paymentMethodHint: hint,
    scheduleCode,
    schedulePlanPhrase,
    skipReason: termOut.length ? null : "no_instalments",
  };
}
