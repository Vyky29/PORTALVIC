/** Load / save rotating Xero refresh token (service role only). */

import {
  cleanXero,
  xeroCurrentRefreshToken,
  xeroSeedRefreshToken,
} from "./xero_auth.ts";

// deno-lint-ignore no-explicit-any
export async function xeroHydrateRefreshFromDb(supabase: any): Promise<void> {
  try {
    const { data } = await supabase
      .from("portal_xero_oauth")
      .select("refresh_token")
      .eq("id", 1)
      .maybeSingle();
    xeroSeedRefreshToken(data?.refresh_token);
  } catch (e) {
    console.warn("[xeroHydrateRefreshFromDb]", (e as Error)?.message || e);
  }
}

/** Persist current live refresh if it differs from env / previous. */
// deno-lint-ignore no-explicit-any
export async function xeroPersistRefreshToDb(supabase: any): Promise<void> {
  const token = xeroCurrentRefreshToken();
  if (!token) return;
  const now = new Date().toISOString();
  try {
    const { error } = await supabase.from("portal_xero_oauth").upsert(
      { id: 1, refresh_token: cleanXero(token, 500), updated_at: now },
      { onConflict: "id" },
    );
    if (error) console.warn("[xeroPersistRefreshToDb]", error.message);
  } catch (e) {
    console.warn("[xeroPersistRefreshToDb]", (e as Error)?.message || e);
  }
}
