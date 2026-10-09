/** Tide bank details for parent invoice pay instructions (Edge Function secrets). */

export type TideBankDetails = {
  available: boolean;
  payee_name: string | null;
  sort_code: string | null;
  account_number: string | null;
  reference_hint: string | null;
};

function cleanEnv(key: string, max = 120): string {
  return String(Deno.env.get(key) ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function tideBankDetailsFromEnv(): TideBankDetails {
  const payee = cleanEnv("PORTAL_TIDE_PAYEE_NAME", 120);
  const sort = cleanEnv("PORTAL_TIDE_SORT_CODE", 20);
  const account = cleanEnv("PORTAL_TIDE_ACCOUNT_NUMBER", 20);
  const hint = cleanEnv("PORTAL_TIDE_REFERENCE_HINT", 200) || null;
  const available = !!(payee && sort && account);
  return {
    available,
    payee_name: payee || null,
    sort_code: sort || null,
    account_number: account || null,
    reference_hint: hint,
  };
}

/**
 * Suggested bank / Tide payment reference for family invoices.
 * Prefer participant display name so transfers are easy to find in Tide.
 * Invoice number belongs on the PDF; term label belongs in invoice/Xero Reference.
 */
export function suggestedTransferReference(
  _invoiceNumber: unknown,
  displayName: string,
): string {
  return String(displayName || "ClubSENsational")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

/** Tide Faster Payments keeps 18 characters. "18 Oct 26" is 9. */
function tideReferenceDate(dateIso: string | null | undefined): string {
  const iso = String(dateIso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const d = new Date(`${iso}T12:00:00.000Z`);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
  }).format(d);
  const mon = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "short",
  }).format(d);
  return `${day} ${mon} ${iso.slice(2, 4)}`;
}

/**
 * Bank reference for a term or flexi payment that has no invoice number yet.
 * The invoice is created when the office marks paid. Tide keeps 18 characters.
 * The date is the first session of that payment, so autumn, spring, and
 * flexi 1 / flexi 2 do not share one reference. The trial payment stays the name only.
 */
export function termPayReference(displayName: string, dateIso?: string | null): string {
  const name = String(displayName || "").replace(/\s+/g, " ").trim();
  const first = name.split(" ")[0] || "Club";
  const stamp = tideReferenceDate(dateIso);
  if (!stamp) return (name || first).slice(0, 18).trim();
  const full = `${name} ${stamp}`.trim();
  if (name && full.length <= 18) return full;
  const short = `${first} ${stamp}`.trim();
  if (short.length <= 18) return short;
  return short.slice(0, 18).trim();
}
