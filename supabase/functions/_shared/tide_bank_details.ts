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

export function suggestedTransferReference(invoiceNumber: unknown, fallback: string): string {
  const inv = String(invoiceNumber ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  if (inv) return inv;
  return String(fallback || "ClubSENsational")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}
