/**
 * Whether the parent should fill re-enrolment 2026/27 themselves,
 * or the office/funder path renews automatically (Day Centre + LA/NHS).
 */
export type ParentReenrolUiMode = "required" | "auto";

export type ParentReenrolUi = {
  mode: ParentReenrolUiMode;
  /** Why the parent form is not needed (empty when mode is required). */
  reasons: Array<"day_centre" | "la_funded">;
  note: string;
};

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

/** True when fees are LA / NHS / local-authority billed (not private parent pay). */
export function fundingLabelIsLaOrNhs(raw: unknown): boolean {
  const fl = clean(raw, 160).toLowerCase();
  if (!fl) return false;
  return (
    /\blocal authority\b/.test(fl) ||
    /\bnnhs\b/.test(fl) ||
    /\behcp\b/.test(fl) ||
    /\bdirect payment\b/.test(fl) ||
    /\bcare package\b/.test(fl) ||
    /\bealing\b/.test(fl) ||
    /\bhammersmith\b/.test(fl) ||
    /\bh\s*&\s*f\b/.test(fl) ||
    /(^|[^a-z])la([^a-z]|$)/.test(fl)
  );
}

export function buildParentReenrolUi(opts: {
  hasDayCentre: boolean;
  fundingLabel?: string | null;
  vatMode?: string | null;
  paymentSheet?: string | null;
}): ParentReenrolUi {
  const reasons: Array<"day_centre" | "la_funded"> = [];
  if (opts.hasDayCentre) reasons.push("day_centre");

  const sheetLa = clean(opts.paymentSheet, 20).toUpperCase() === "LA";
  const vatExempt = clean(opts.vatMode, 20).toLowerCase() === "exempt";
  const fundLa = fundingLabelIsLaOrNhs(opts.fundingLabel);
  if (sheetLa || vatExempt || fundLa) reasons.push("la_funded");

  if (!reasons.length) {
    return {
      mode: "required",
      reasons: [],
      note: "Confirm places for next year",
    };
  }

  const note = reasons.includes("day_centre") && reasons.includes("la_funded")
    ? "Day Centre and LA / NHS places renew with the office — nothing for you to submit."
    : reasons.includes("day_centre")
      ? "Day Centre places renew with the office — nothing for you to submit."
      : "LA / NHS funded places renew with the office — nothing for you to submit.";

  return { mode: "auto", reasons, note };
}
