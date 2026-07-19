/**
 * Whether the parent should fill re-enrolment 2026/27 themselves,
 * or the office/funder path renews automatically.
 *
 * Office auto (no parent form) + hide My invoices when:
 *   - Day Centre place, OR
 *   - Club invoices the funder (Ealing / H&F / NHS), OR
 *   - LA sheet / LA Direct Payments / CWD remittance (parent-held LA money)
 *
 * NOT auto (parent must re-enrol + choose how to pay):
 *   - Private self-pay only
 */
export type ParentReenrolUiMode = "required" | "auto";

export type ParentReenrolUi = {
  mode: ParentReenrolUiMode;
  /** Why the parent form is not needed / what special path applies. */
  reasons: Array<"day_centre" | "la_funded" | "acat_brought">;
  note: string;
  /**
   * Extra notice for ACAT Monday members: ACAT must approve the place
   * because it is an ACAT-only service.
   */
  acat_confirm_notice: string;
  /** False for Tinashe / Ikram / Fadi / Timi — no crash or other extras. */
  can_book_extras: boolean;
};

/** Shown when Kate / Kamy / Jack W / Jack S touch Booking 2026/27. */
export const ACAT_REENROL_CONFIRM_NOTICE =
  "ACAT should approve this place — it is an ACAT-only service.";

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function servicesDetailHasDayCentre(
  detail: Array<{ label?: string; service?: string } | null | undefined> | null | undefined,
): boolean {
  if (!Array.isArray(detail)) return false;
  for (const row of detail) {
    const lab = clean(row?.label || row?.service, 120);
    if (/day\s*centre/i.test(lab)) return true;
  }
  return false;
}

/**
 * Parent pays the club using LA Direct Payments / personal budget.
 * Still needs re-enrolment and a pay method — not “office invoices the LA”.
 */
export function fundingLabelIsParentDirectPayments(raw: unknown): boolean {
  const fl = clean(raw, 160).toLowerCase();
  if (!fl) return false;
  if (/parent\s*[·•\-]\s*direct payment|direct payments?\s*\(la money\)/.test(fl)) return true;
  if (/using money from la|using funds from la/.test(fl)) return true;
  if (/la_direct_payments|parent_direct_payments/.test(fl)) return true;
  if (/\bdirect payments?\b/.test(fl) && /ehcp|care package|personal budget/.test(fl)) return true;
  // Bare Direct Payment / DP without named funder-invoice language → parent-held budget.
  if (/\bdirect payments?\b/.test(fl) || /(^|[^a-z])dp([^a-z]|$)/.test(fl)) {
    if (/\bealing\b|\bhammersmith\b|\bfulham\b|\bh\s*&\s*f\b|\blbhf\b|\bnhs\b/.test(fl)) {
      // e.g. "Ealing Direct Payments" still parent-held unless it says invoice/BACS to club
      if (!/invoice|bacs|care in finance|\bcwd\b|purchase order/.test(fl)) return true;
    } else {
      return true;
    }
  }
  return false;
}

/**
 * Club invoices Ealing, Hammersmith & Fulham, or NHS directly.
 * Only these (plus Day Centre) skip the parent re-enrol form.
 */
export function fundingLabelIsClubInvoicedFunder(raw: unknown): boolean {
  const fl = clean(raw, 160).toLowerCase();
  if (!fl) return false;
  if (fundingLabelIsParentDirectPayments(fl)) return false;

  // NHS pays the club
  if (/\bnhs\b/.test(fl)) return true;

  // Named LAs that invoice the club (not parent Direct Payments)
  if (/\bealing\b/.test(fl) && !/\bdirect payment/.test(fl)) return true;
  if (
    /\bhammersmith\b/.test(fl) ||
    /\bfulham\b/.test(fl) ||
    /\bh\s*&\s*f\b/.test(fl) ||
    /\blbhf\b/.test(fl)
  ) {
    if (/\bdirect payment/.test(fl)) return false;
    return true;
  }

  // Explicit care-in-finance / CWD / PO language tied to those funders
  if (/care in finance|\bcwd\b|purchase order|\bla invoice\b/.test(fl)) {
    return /\bealing\b|\bhammersmith\b|\bfulham\b|\bh\s*&\s*f\b|\blbhf\b|\bnhs\b/.test(fl);
  }

  return false;
}

/** @deprecated Use fundingLabelIsClubInvoicedFunder — kept for older imports. */
export function fundingLabelIsLaOrNhs(raw: unknown): boolean {
  return fundingLabelIsClubInvoicedFunder(raw);
}

export function buildParentReenrolUi(opts: {
  hasDayCentre: boolean;
  fundingLabel?: string | null;
  vatMode?: string | null;
  paymentSheet?: string | null;
  /** Kate / Kamy / Jack W / Jack S — Monday ACAT brought clients. */
  isAcatMember?: boolean;
  /** Tinashe / Ikram / Fadi / Timi — no crash or other extras. */
  blocksExtraBooking?: boolean;
}): ParentReenrolUi {
  const isAcat = !!opts.isAcatMember;
  const canBookExtras = !opts.blocksExtraBooking;
  const acatNotice = isAcat ? ACAT_REENROL_CONFIRM_NOTICE : "";
  const reasons: Array<"day_centre" | "la_funded" | "acat_brought"> = [];
  if (opts.hasDayCentre) reasons.push("day_centre");

  const sheet = clean(opts.paymentSheet, 40).toUpperCase();
  /** Club invoices the LA/NHS directly — not parent-held Direct Payments budgets. */
  const sheetLaManaged = sheet === "LA";
  const parentDp = fundingLabelIsParentDirectPayments(opts.fundingLabel);
  const funderPaysClub = fundingLabelIsClubInvoicedFunder(opts.fundingLabel);
  /*
   * Office auto (no parent form) only when the club invoices the funder, or Day Centre.
   * "Using Funds from LA" / Direct Payments = parents still pay → keep parent form.
   */
  if ((sheetLaManaged || funderPaysClub) && !parentDp) {
    reasons.push("la_funded");
  }
  if (isAcat) reasons.push("acat_brought");

  const officeAuto = reasons.includes("day_centre") || reasons.includes("la_funded");
  const crashHint = canBookExtras
    ? " You can still book summer crash courses if places are available."
    : " Extra holiday sessions (including crash courses) are not available for this place.";

  if (!officeAuto) {
    return {
      mode: "required",
      reasons: isAcat ? ["acat_brought"] : [],
      note: isAcat
        ? "Confirm your other places for next year. The Monday ACAT slot still needs ACAT approval."
        : "Confirm places for next year",
      acat_confirm_notice: acatNotice,
      can_book_extras: canBookExtras,
    };
  }

  const baseNote = reasons.includes("day_centre") && reasons.includes("la_funded")
    ? "Day Centre and LA / NHS places renew with the office — nothing for you to submit."
    : reasons.includes("day_centre")
    ? "Day Centre places renew with the office — nothing for you to submit."
    : "LA / NHS funded places renew with the office — nothing for you to submit.";

  const note = (isAcat
    ? "ACAT should approve this place — it is an ACAT-only service. " + baseNote
    : baseNote) + crashHint;

  return {
    mode: "auto",
    reasons,
    note,
    acat_confirm_notice: acatNotice,
    can_book_extras: canBookExtras,
  };
}
