/**
 * Build 2026/27 re-enrolment instalment invoices from funding choices + term totals.
 * Mirrors parent UI schedule preview (portal_reenrolment_2026_27.js).
 */
import type { PortalInvoiceVatMode } from "./portal_tax_invoice_pdf.ts";

export type ReenrolInstalment = {
  label: string;
  dueDateIso: string | null;
  amountGbp: number;
  lineDescription: string;
  reference: string;
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
      { halfLabel: "1st half", dueIso: "2026-08-15" },
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

function pushInstalment(
  out: ReenrolInstalment[],
  opts: {
    label: string;
    dueDateIso: string | null;
    amountGbp: number;
    participantName: string;
    academicYear: string;
    payLabel: string;
  },
) {
  const amount = round2(opts.amountGbp);
  if (amount <= 0) return;
  out.push({
    label: opts.label,
    dueDateIso: opts.dueDateIso,
    amountGbp: amount,
    lineDescription:
      `Re-enrolment ${opts.academicYear} — ${opts.label}. ` +
      `Structured activity support for ${opts.participantName}. ` +
      `Payment plan: ${opts.payLabel}.`,
    reference: `REENROL-${opts.academicYear}-${opts.label}`.slice(0, 120),
  });
}

export type ReenrolTermKey = "autumn" | "spring" | "summer";

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
  instalments: ReenrolInstalment[];
  vatMode: PortalInvoiceVatMode;
  paymentMethodHint: "bank_transfer" | "gocardless" | "payment_link" | "other";
  scheduleCode: string | null;
  schedulePlanPhrase: string | null;
  skipReason: string | null;
} {
  const academicYear = args.academicYear || "2026-27";
  const empty = {
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
  const participantName = clean(args.participantName, 120) || "participant";
  const payLabel =
    clean(choices.payment_method_label, 80) ||
    (payCode === "gocardless"
      ? "Direct Payment"
      : payCode === "own_way_flexible"
        ? "Own arrangement"
        : "Bank transfer");

  const out: ReenrolInstalment[] = [];
  const bankFirstDue = payCode === "bank_transfer" ? "2026-08-15" : "2026-09-01";

  if (payCode === "own_way_flexible" || scheduleCode === "own_term") {
    const terms: Array<{ key: ReenrolTermKey; label: string; due: string }> = [
      { key: "autumn", label: "Autumn term", due: "2026-09-01" },
      { key: "spring", label: "Spring term", due: "2027-01-01" },
      { key: "summer", label: "Summer term", due: "2027-04-01" },
    ];
    for (const t of terms) {
      if (!includeTerm(t.key)) continue;
      pushInstalment(out, {
        label: `${t.label} · programme`,
        dueDateIso: t.due,
        amountGbp: totals[t.key],
        participantName,
        academicYear,
        payLabel,
      });
      pushInstalment(out, {
        label: `${t.label} · admin fee`,
        dueDateIso: t.due,
        amountGbp: OWN_FEE,
        participantName,
        academicYear,
        payLabel,
      });
    }
  } else if (scheduleCode === "yearly_1off") {
    /* Full-year one-off only applies to whole-year cadence. */
    pushInstalment(out, {
      label: "Full year (1 payment)",
      dueDateIso: bankFirstDue,
      amountGbp: withGcFee(totals.annual, payCode),
      participantName,
      academicYear,
      payLabel,
    });
  } else if (scheduleCode === "term_3") {
    const term3: Array<{ key: ReenrolTermKey; label: string; due: string }> = [
      { key: "autumn", label: "Autumn term", due: bankFirstDue },
      { key: "spring", label: "Spring term", due: "2026-12-01" },
      { key: "summer", label: "Summer term", due: "2027-03-01" },
    ];
    for (const t of term3) {
      if (!includeTerm(t.key)) continue;
      pushInstalment(out, {
        label: t.label,
        dueDateIso: t.due,
        amountGbp: withGcFee(totals[t.key], payCode),
        participantName,
        academicYear,
        payLabel,
      });
    }
  } else if (scheduleCode === "term_flexi") {
    for (const t of FLEXI_TERM) {
      if (!includeTerm(t.term)) continue;
      const termTotal = totals[t.term];
      const halfAmt = termTotal / 2;
      for (let hi = 0; hi < t.halves.length; hi++) {
        const h = t.halves[hi];
        let dueIso = h.dueIso;
        if (payCode === "gocardless" && t.term === "autumn" && hi === 0) {
          dueIso = "2026-09-01";
        }
        pushInstalment(out, {
          label: `${t.termLabel} · ${h.halfLabel}`,
          dueDateIso: dueIso,
          amountGbp: withGcFee(halfAmt, payCode),
          participantName,
          academicYear,
          payLabel,
        });
      }
    }
  } else if (scheduleCode === "monthly_term") {
    let payNo = 0;
    for (const t of MONTHLY_TERM_PLAN) {
      if (!includeTerm(t.term)) continue;
      const termTotal = totals[t.term];
      const perMonth = termTotal / t.months.length;
      for (const m of t.months) {
        payNo += 1;
        pushInstalment(out, {
          label: `Payment ${payNo} · ${m.label} (${t.label})`,
          dueDateIso: m.dueIso,
          amountGbp: withGcFee(perMonth, payCode),
          participantName,
          academicYear,
          payLabel,
        });
      }
    }
  } else if (scheduleCode === "monthly_10") {
    /* Autumn 4 / Spring 3 / Summer 3 — amounts split from each term total. */
    const plan10 = [
      {
        term: "autumn" as const,
        label: "Autumn",
        months: MONTHLY_10.slice(0, 4),
      },
      {
        term: "spring" as const,
        label: "Spring",
        months: MONTHLY_10.slice(4, 7),
      },
      {
        term: "summer" as const,
        label: "Summer",
        months: MONTHLY_10.slice(7, 10),
      },
    ];
    let payNo = 0;
    for (const t of plan10) {
      if (!includeTerm(t.term)) continue;
      const termTotal = totals[t.term];
      const perMonth = termTotal / t.months.length;
      for (const m of t.months) {
        payNo += 1;
        pushInstalment(out, {
          label: `Payment ${payNo} · ${m.label} (${t.label})`,
          dueDateIso: m.dueIso,
          amountGbp: withGcFee(perMonth, payCode),
          participantName,
          academicYear,
          payLabel,
        });
      }
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

  const schedulePlanPhrase = out.length
    ? reenrolmentSchedulePlanPhrase({
      scheduleCode,
      paymentMethodHint: hint,
      instalmentCount: out.length,
      enrolmentCadence,
      billingTerm,
    })
    : null;

  return {
    instalments: out,
    vatMode,
    paymentMethodHint: hint,
    scheduleCode,
    schedulePlanPhrase,
    skipReason: out.length ? null : "no_instalments",
  };
}
