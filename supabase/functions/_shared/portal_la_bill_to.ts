/**
 * Local Authority bill-to profiles (who is invoiced when LA manages payment).
 * Never bill the parent for la_funded invoices.
 */

export type LaBillToProfile = {
  key: string;
  /** Primary Bill To name on the PDF / Xero contact. */
  name: string;
  lines: string[];
  /** Inbox that processes payment. */
  paymentEmail: string;
  /** CC for council records. */
  paymentCcEmail: string;
  /** Office instruction for emailing the PDF. */
  paymentInstruction: string;
};

/** H&F Children's Services — participants under 18. */
export const HF_CHILDREN_BILL_TO: LaBillToProfile = {
  key: "hf_children",
  name: "Hammersmith & Fulham Children's Services",
  lines: [
    "Hammersmith & Fulham Council",
    "145 King Street",
    "Hammersmith",
    "W6 9XY",
    "UNITED KINGDOM",
  ],
  paymentEmail: "VIMenquiries@hants.gov.uk",
  paymentCcEmail: "sendinvoices@lbhf.gov.uk",
  paymentInstruction:
    "Please email pdf copy of invoice/s to VIMenquiries@hants.gov.uk for payment to be processed and cc in sendinvoices@lbhf.gov.uk for our records.",
};

/** H&F Adult Social Care Payments — participants 18+. */
export const HF_ADULT_ASC_BILL_TO: LaBillToProfile = {
  key: "hf_adult_asc",
  name: "ASC Payments team",
  lines: [
    "Corporate services",
    "Hammersmith & Fulham Council",
    "145 King Street",
    "London",
    "W6 9XY",
    "UNITED KINGDOM",
  ],
  paymentEmail: "ASCPayments@lbhf.gov.uk",
  paymentCcEmail: "youngpeopleintransition@lbhf.gov.uk",
  paymentInstruction:
    "Please email pdf copy of invoice/s to ASCPayments@lbhf.gov.uk for payment to be processed and cc in youngpeopleintransition@lbhf.gov.uk for our records.",
};

function normalizeNameKey(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** True when funding text points at Hammersmith & Fulham. */
export function isHammersmithFulhamFunder(text: unknown): boolean {
  const s = String(text || "").toLowerCase();
  return /h\s*&\s*f|hammersmith|fulham|lbhf/.test(s);
}

/**
 * Known H&F LA band overrides when DOB is missing or disputed.
 * Keys are normalized client_key or display-name fragments.
 */
const HF_BAND_OVERRIDES: Array<{ match: RegExp; band: "child" | "adult" }> = [
  // Adults (18+)
  { match: /\badam\s*p(ilcher)?\b/, band: "adult" },
  { match: /^adam-p$/, band: "adult" },
  { match: /\byassir\b/, band: "adult" },
  // Children (<18)
  { match: /\belijah\b/, band: "child" },
  { match: /\bfaris\b/, band: "child" },
  { match: /\bstephanie\b/, band: "child" },
  { match: /\babodi\b/, band: "child" },
  { match: /\bsa+ib\b/, band: "child" },
  { match: /\bsimon\b/, band: "child" },
  { match: /\bmatthias\b/, band: "child" },
];

export function resolveHfBandOverride(
  displayName: string,
  clientKey?: string | null,
): "child" | "adult" | null {
  const blob = `${normalizeNameKey(displayName)} ${normalizeNameKey(clientKey)}`.trim();
  for (const row of HF_BAND_OVERRIDES) {
    if (row.match.test(blob)) return row.band;
  }
  return null;
}

export function ageYearsFromDobIso(dobIso: string | null | undefined): number | null {
  const raw = String(dobIso || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Pick H&F Children vs Adult ASC profile from age / known overrides. */
export function resolveHfBillToProfile(input: {
  displayName: string;
  clientKey?: string | null;
  dobIso?: string | null;
}): LaBillToProfile {
  const override = resolveHfBandOverride(input.displayName, input.clientKey);
  if (override === "adult") return HF_ADULT_ASC_BILL_TO;
  if (override === "child") return HF_CHILDREN_BILL_TO;

  const age = ageYearsFromDobIso(input.dobIso);
  if (age != null) {
    return age < 18 ? HF_CHILDREN_BILL_TO : HF_ADULT_ASC_BILL_TO;
  }
  // Default H&F unknown-age → Children's Services (majority of caseload).
  return HF_CHILDREN_BILL_TO;
}

export function laBillToAdminNote(profile: LaBillToProfile): string {
  return [
    `LA bill-to: ${profile.name} (${profile.key})`,
    `Pay to: ${profile.paymentEmail}`,
    `CC: ${profile.paymentCcEmail}`,
    profile.paymentInstruction,
  ].join("\n");
}
