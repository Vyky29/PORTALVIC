/**
 * New Booking Portal clients (mid-term / term already started):
 * one INV-P per term, amount = remaining sessions.
 *
 * GoCardless: first due on booking day, then 1st of each remaining month in the term.
 * Flexi (bank): two halves — first on the fixed term due (e.g. Autumn 15 Aug), or booking
 * day if that date has already passed; second on the fixed mid-term date if still future.
 * One-off (bank): single instalment due today.
 */
import type { InvoicePaymentScheduleRow } from "./portal_invoice_payment_schedule.ts";
import type { PortalInvoiceVatMode } from "./portal_tax_invoice_pdf.ts";
import {
  formatGroupedSessionDates,
  remainingTermSessionDates,
  type PortalInvoiceLineItem,
  xeroItemCodeForService,
  type ProductMapRow,
} from "./portal_xero_product_catalog.ts";
import { resolveSessionDateIso } from "./portal_booking_context.ts";

export type BookingTermKey = "autumn" | "spring" | "summer";
export type NewClientPayPlan =
  | "gocardless_monthly"
  | "flexi_bank"
  | "one_off_bank"
  | "own_way"
  | "stripe_instant";

const GC_FEE = 1.5;
/** Own way: always keep 2 sessions prepaid + £50 admin / term. */
const OWN_WAY_ADMIN_FEE = 50;
const OWN_WAY_PREPAID_SESSIONS = 2;

/** Same fixed first-half dues as re-enrolment bank flexi (not booking day). */
const FLEXI_FIRST_DUE: Record<BookingTermKey, string> = {
  autumn: "2026-08-15",
  spring: "2027-01-01",
  summer: "2027-04-01",
};

const FLEXI_SECOND_DUE: Record<BookingTermKey, string> = {
  autumn: "2026-10-26",
  spring: "2027-02-15",
  summer: "2027-05-31",
};

const MONTHLY_TERM_1STS: Record<BookingTermKey, Array<{ label: string; dueIso: string }>> = {
  autumn: [
    { label: "September 2026", dueIso: "2026-09-01" },
    { label: "October 2026", dueIso: "2026-10-01" },
    { label: "November 2026", dueIso: "2026-11-01" },
    { label: "December 2026", dueIso: "2026-12-01" },
  ],
  spring: [
    { label: "January 2027", dueIso: "2027-01-01" },
    { label: "February 2027", dueIso: "2027-02-01" },
    { label: "March 2027", dueIso: "2027-03-01" },
  ],
  summer: [
    { label: "April 2027", dueIso: "2027-04-01" },
    { label: "May 2027", dueIso: "2027-05-01" },
    { label: "June 2027", dueIso: "2027-06-01" },
    { label: "July 2027", dueIso: "2027-07-01" },
  ],
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function formatUkDateWithWeekday(iso: string | null | undefined): string {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** e.g. 30' Aquatic Activity (Trial session) */
export function bookingPortalServiceLabel(
  serviceKey: string,
  serviceLabel: string,
  opts?: { isTrial?: boolean },
): string {
  const key = clean(serviceKey, 40).toUpperCase();
  let duration = "30'";
  if (key.includes("60")) duration = "60'";
  else if (key.includes("45")) duration = "45'";
  const base = clean(serviceLabel, 120) || "Activity";
  const trial = opts?.isTrial ? " (Trial session)" : "";
  if (/^\d+'/.test(base)) return `${base}${trial}`;
  return `${duration} ${base}${trial}`;
}

export function formatTrialSessionReference(input: {
  sessionDateIso?: string | null;
  day?: string | null;
  timeLabel?: string | null;
  asOfIso?: string | null;
}): string {
  const day = clean(input.day, 40);
  const time = clean(input.timeLabel, 80);
  const sessionDate = resolveSessionDateIso({
    dateIso: input.sessionDateIso,
    day,
    asOfIso: input.asOfIso,
  });
  const datePart = sessionDate
    ? formatUkDateWithWeekday(sessionDate)
    : day || "TBC";
  const timePart = time ? `, ${time}` : "";
  return clean(`Trial session (${datePart}${timePart})`, 120);
}

function isoToday(asOf?: string | Date | null): string {
  if (typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOf.slice(0, 10))) {
    return asOf.slice(0, 10);
  }
  if (asOf instanceof Date && !Number.isNaN(asOf.getTime())) {
    return asOf.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export function bookingTermDisplayLabel(term: BookingTermKey): string {
  if (term === "spring") return "Spring";
  if (term === "summer") return "Summer";
  return "Autumn";
}

export function parseBookingTermKey(raw: unknown): BookingTermKey | null {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "autumn" || s === "spring" || s === "summer") return s;
  return null;
}

export function parseNewClientPayPlan(raw: unknown): NewClientPayPlan | null {
  const s = String(raw || "").trim().toLowerCase();
  if (
    s === "gocardless_monthly" ||
    s === "gocardless" ||
    s === "monthly_term"
  ) {
    return "gocardless_monthly";
  }
  if (s === "flexi_bank" || s === "term_flexi" || s === "flexi") {
    return "flexi_bank";
  }
  if (
    s === "one_off_bank" ||
    s === "term_3" ||
    s === "one_off" ||
    s === "bank_transfer_one_off"
  ) {
    return "one_off_bank";
  }
  if (
    s === "own_way" ||
    s === "own_way_flexible" ||
    s === "own_term" ||
    s === "own_arrangement"
  ) {
    return "own_way";
  }
  if (
    s === "stripe_instant" ||
    s === "stripe" ||
    s === "card" ||
    s === "apple_pay"
  ) {
    return "stripe_instant";
  }
  return null;
}

export type BookingScope =
  | "auto_reenroll_year"
  | "this_term_only"
  | "trial_session";

export function parseBookingScope(raw: unknown): BookingScope | null {
  const s = String(raw || "").trim().toLowerCase();
  if (
    s === "auto_reenroll_year" ||
    s === "auto_reenrol_year" ||
    s === "year" ||
    s === "all_year" ||
    s === "annual"
  ) {
    return "auto_reenroll_year";
  }
  if (
    s === "this_term_only" ||
    s === "one_term" ||
    s === "term_only" ||
    s === "single_term"
  ) {
    return "this_term_only";
  }
  if (
    s === "trial_session" ||
    s === "trial" ||
    s === "taster" ||
    s === "trial_pay_now"
  ) {
    return "trial_session";
  }
  return null;
}

function withGcFee(amount: number, plan: NewClientPayPlan): number {
  const base = round2(amount);
  if (plan !== "gocardless_monthly" || base <= 0) return base;
  return round2(base + GC_FEE);
}

function splitEqual(
  total: number,
  slots: Array<{ label: string; dueIso: string }>,
  plan: NewClientPayPlan,
): Array<{ label: string; dueIso: string; amountGbp: number }> {
  const n = slots.length;
  if (n <= 0 || total <= 0) return [];
  const programme = round2(total);
  const raw = programme / n;
  const out: Array<{ label: string; dueIso: string; amountGbp: number }> = [];
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    const slice = i === n - 1 ? round2(programme - allocated) : round2(raw);
    allocated = round2(allocated + slice);
    out.push({
      label: slots[i]!.label,
      dueIso: slots[i]!.dueIso,
      amountGbp: withGcFee(slice, plan),
    });
  }
  return out;
}

/** GoCardless: first due = booking day; then each month 1st still ahead in the term. */
export function buildNewClientGcMonthDueSlots(
  term: BookingTermKey,
  asOfIso: string,
): Array<{ label: string; dueIso: string }> {
  const asOf = isoToday(asOfIso);
  const rest = (MONTHLY_TERM_1STS[term] || []).filter((m) => m.dueIso > asOf);
  return [
    { label: "First payment · due on booking day", dueIso: asOf },
    ...rest.map((m) => ({ label: `Payment · ${m.label}`, dueIso: m.dueIso })),
  ];
}

/**
 * Flexi bank: first on fixed term due (Autumn = 15 Aug); if booking after that date,
 * first falls due on booking day. Second stays on the fixed mid-term date when future.
 */
export function buildNewClientFlexiDueSlots(
  term: BookingTermKey,
  asOfIso: string,
): Array<{ label: string; dueIso: string }> {
  const asOf = isoToday(asOfIso);
  const fixedFirst = FLEXI_FIRST_DUE[term];
  const second = FLEXI_SECOND_DUE[term];
  const termLabel = bookingTermDisplayLabel(term);
  const firstDue = fixedFirst && fixedFirst >= asOf ? fixedFirst : asOf;
  if (second && second > firstDue) {
    return [
      { label: `${termLabel} term · 1st half`, dueIso: firstDue },
      { label: `${termLabel} term · 2nd half`, dueIso: second },
    ];
  }
  return [{ label: `${termLabel} term · balance`, dueIso: firstDue }];
}

export function buildNewClientPaymentSchedule(args: {
  plan: NewClientPayPlan;
  term: BookingTermKey;
  programmeTotalGbp: number;
  asOfIso?: string | null;
}): InvoicePaymentScheduleRow[] {
  const asOf = isoToday(args.asOfIso);
  const total = round2(args.programmeTotalGbp);
  if (total <= 0) return [];

  let slots: Array<{ label: string; dueIso: string }> = [];
  if (args.plan === "gocardless_monthly") {
    slots = buildNewClientGcMonthDueSlots(args.term, asOf);
  } else if (args.plan === "flexi_bank") {
    slots = buildNewClientFlexiDueSlots(args.term, asOf);
  } else if (args.plan === "own_way") {
    slots = [
      {
        label: `${bookingTermDisplayLabel(args.term)} term · Own way minimum (due on booking)`,
        dueIso: asOf,
      },
    ];
  } else {
    slots = [
      {
        label: `${bookingTermDisplayLabel(args.term)} term · full payment (due on booking)`,
        dueIso: asOf,
      },
    ];
  }

  return splitEqual(total, slots, args.plan).map((r, i) => ({
    seq: i + 1,
    label: r.label,
    due_date: r.dueIso,
    amount_gbp: r.amountGbp,
    status: "pending" as const,
  }));
}

export type NewClientProRataQuote = {
  term: BookingTermKey;
  day: string;
  asOfIso: string;
  remainingSessions: number;
  unitPriceGbp: number;
  programmeTotalGbp: number;
  invoiceTotalGbp: number;
  sessionDatesLabel: string | null;
  remainingDateIsos: string[];
  plan: NewClientPayPlan;
  paymentSchedule: InvoicePaymentScheduleRow[];
  paymentMethodHint: "bank_transfer" | "gocardless";
  reference: string;
  lineDescription: string;
  lineItems: PortalInvoiceLineItem[];
};

export function quoteNewClientMidTermInvoice(args: {
  term: BookingTermKey;
  day: string;
  unitPriceGbp: number;
  plan: NewClientPayPlan;
  asOfIso?: string | null;
  serviceKey?: string | null;
  serviceLabel?: string | null;
  detail?: string | null;
  vatMode?: PortalInvoiceVatMode;
  productMap?: Map<string, ProductMapRow> | null;
}): NewClientProRataQuote | { error: string } {
  const term = args.term;
  const day = clean(args.day, 40);
  const asOf = isoToday(args.asOfIso);
  const unit = round2(Number(args.unitPriceGbp) || 0);
  if (!day) return { error: "day_required" };
  if (!(unit > 0)) return { error: "unit_price_required" };

  const remaining = remainingTermSessionDates(term, day, asOf);
  if (!remaining.length) return { error: "no_remaining_sessions" };

  const fullProgramme = round2(unit * remaining.length);
  const ownWaySessions = Math.min(OWN_WAY_PREPAID_SESSIONS, remaining.length);
  const ownWayProgramme = round2(unit * ownWaySessions);
  const ownWayAdmin = OWN_WAY_ADMIN_FEE;
  const programmeTotal =
    args.plan === "own_way" ? round2(ownWayProgramme + ownWayAdmin) : fullProgramme;
  const schedule = buildNewClientPaymentSchedule({
    plan: args.plan,
    term,
    programmeTotalGbp: programmeTotal,
    asOfIso: asOf,
  });
  if (!schedule.length) return { error: "schedule_empty" };

  const invoiceTotal = round2(schedule.reduce((s, r) => s + r.amount_gbp, 0));
  const termLabel = bookingTermDisplayLabel(term);
  const serviceKey = clean(args.serviceKey, 40) || "AQUATIC_30";
  const serviceLabel = clean(args.serviceLabel, 120) || "Aquatic Activity";
  const detail = clean(args.detail, 160) || `${day}`;
  const vatMode = args.vatMode === "exempt" ? "exempt" : "vat_20";
  const mapRow = args.productMap?.get(serviceKey) || null;
  const datesLabel = formatGroupedSessionDates(remaining);

  const lineItems: PortalInvoiceLineItem[] = [];
  if (args.plan === "own_way") {
    lineItems.push({
      service_key: serviceKey,
      description: serviceLabel,
      detail: `${detail} · Own way prepaid (${ownWaySessions} sessions)`,
      dates: datesLabel,
      quantity: ownWaySessions,
      unit_price_gbp: unit,
      amount_gbp: ownWayProgramme,
      xero_item_code: xeroItemCodeForService(mapRow || undefined, vatMode),
    });
    lineItems.push({
      service_key: "OWN_WAY_ADMIN",
      description: "Own way admin fee",
      detail: "£50 / term · keep 2 sessions prepaid",
      dates: null,
      quantity: 1,
      unit_price_gbp: ownWayAdmin,
      amount_gbp: ownWayAdmin,
      xero_item_code: null,
    });
  } else {
    lineItems.push({
      service_key: serviceKey,
      description: serviceLabel,
      detail,
      dates: datesLabel,
      quantity: remaining.length,
      unit_price_gbp: unit,
      amount_gbp: fullProgramme,
      xero_item_code: xeroItemCodeForService(mapRow || undefined, vatMode),
    });
  }
  if (args.plan === "gocardless_monthly") {
    const feeTotal = round2(invoiceTotal - programmeTotal);
    if (feeTotal > 0) {
      lineItems.push({
        service_key: "GC_FEE",
        description: "GoCardless fee",
        detail: `£${GC_FEE.toFixed(2)} × ${schedule.length} instalment(s)`,
        dates: null,
        quantity: schedule.length,
        unit_price_gbp: GC_FEE,
        amount_gbp: feeTotal,
        xero_item_code: null,
      });
    }
  }

  const planPhrase =
    args.plan === "gocardless_monthly"
      ? `GoCardless monthly · first instalment due on booking day, then 1st of each remaining month`
      : args.plan === "flexi_bank"
        ? `Bank transfer · Flexi (2 instalments this term; first on fixed due date e.g. Autumn 15 Aug)`
        : args.plan === "own_way"
          ? `Own way · pay ${ownWaySessions} sessions prepaid + £${OWN_WAY_ADMIN_FEE} admin now; top up as you go to keep 2 sessions prepaid`
          : `Bank transfer · one-off full term (due on booking day)`;

  return {
    term,
    day,
    asOfIso: asOf,
    remainingSessions: remaining.length,
    unitPriceGbp: unit,
    programmeTotalGbp: programmeTotal,
    invoiceTotalGbp: invoiceTotal,
    sessionDatesLabel: datesLabel,
    remainingDateIsos: remaining.map((d) => d.toISOString().slice(0, 10)),
    plan: args.plan,
    paymentSchedule: schedule,
    paymentMethodHint: args.plan === "gocardless_monthly" ? "gocardless" : "bank_transfer",
    reference: `${termLabel} term 26/27`,
    lineDescription:
      `New Booking Portal place · ${termLabel} term 2026-27 (pro-rata from ${asOf}).\n\n` +
      `${planPhrase}.\n\n` +
      "Structured activity support delivered for a SEND participant.",
    lineItems,
  };
}

/** Single trial session — pay in full now (Booking Portal trial option). */
export function quoteNewClientTrialInvoice(args: {
  unitPriceGbp: number;
  asOfIso?: string | null;
  serviceKey?: string | null;
  serviceLabel?: string | null;
  detail?: string | null;
  day?: string | null;
  timeLabel?: string | null;
  sessionDateIso?: string | null;
  vatMode?: PortalInvoiceVatMode;
  productMap?: Map<string, ProductMapRow> | null;
}): NewClientProRataQuote | { error: string } {
  const asOf = isoToday(args.asOfIso);
  const unit = round2(Number(args.unitPriceGbp) || 0);
  if (!(unit > 0)) return { error: "unit_price_required" };

  const day = clean(args.day, 40) || "Trial";
  const serviceKey = clean(args.serviceKey, 40) || "AQUATIC_30";
  const serviceLabel = clean(args.serviceLabel, 120) || "Aquatic Activity";
  const detail = clean(args.detail, 160) || day;
  const vatMode = args.vatMode === "exempt" ? "exempt" : "vat_20";
  const mapRow = args.productMap?.get(serviceKey) || null;

  const schedule: InvoicePaymentScheduleRow[] = [
    {
      seq: 1,
      label: "Trial session · pay now",
      due_date: asOf,
      amount_gbp: unit,
      status: "pending",
    },
  ];

  return {
    term: "autumn",
    day,
    asOfIso: asOf,
    remainingSessions: 1,
    unitPriceGbp: unit,
    programmeTotalGbp: unit,
    invoiceTotalGbp: unit,
    sessionDatesLabel: "1 trial session",
    remainingDateIsos: [asOf],
    plan: "stripe_instant",
    paymentSchedule: schedule,
    paymentMethodHint: "stripe",
    reference: formatTrialSessionReference({
      sessionDateIso: args.sessionDateIso,
      day,
      timeLabel: args.timeLabel,
    }),
    lineDescription:
      "Structured activity support delivered for a SEND participant.",
    lineItems: [
      {
        service_key: serviceKey,
        description: serviceLabel,
        detail: `${detail} · Trial (1 session)`,
        dates: "1 trial session",
        quantity: 1,
        unit_price_gbp: unit,
        amount_gbp: unit,
        xero_item_code: xeroItemCodeForService(mapRow || undefined, vatMode),
      },
    ],
  };
}
