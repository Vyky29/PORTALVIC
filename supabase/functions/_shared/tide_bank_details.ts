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

/**
 * Bank reference for a term payment that has no invoice number yet.
 * The invoice is created when the office marks paid. Tide keeps 18 characters.
 * "Mohamed term" is distinct from the earlier trial payment under the same name.
 */
export function termPayReference(displayName: string): string {
  const name = String(displayName || "").replace(/\s+/g, " ").trim();
  const first = name.split(" ")[0] || "Term";
  const full = name ? `${name} term` : "term";
  if (full.length <= 18) return full;
  const short = `${first} term`;
  if (short.length <= 18) return short;
  return short.slice(0, 18).trim();
}
