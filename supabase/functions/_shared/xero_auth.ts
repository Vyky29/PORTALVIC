/** Xero OAuth token helpers (Deno). Shared by payments + invoice push. */

const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

export const XERO_API = "https://api.xero.com/api.xro/2.0";

export function cleanXero(v: unknown, max = 200): string {
  return String(v ?? "").trim().slice(0, max);
}

export function xeroConfigured(): boolean {
  return !!(
    cleanXero(Deno.env.get("XERO_CLIENT_ID"), 120) &&
    cleanXero(Deno.env.get("XERO_CLIENT_SECRET"), 200) &&
    cleanXero(Deno.env.get("XERO_REFRESH_TOKEN"), 500) &&
    cleanXero(Deno.env.get("XERO_TENANT_ID"), 80)
  );
}

/**
 * Xero rotates refresh tokens on every use. Cache the access token (and the
 * latest refresh) for this isolate so one Edge Function request does not burn
 * the secret mid-batch (e.g. GET invoice + POST payment × N).
 */
let cachedAccessToken: string | null = null;
let cachedAccessExpiresAt = 0;
let liveRefreshToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

function envRefreshToken(): string {
  return cleanXero(Deno.env.get("XERO_REFRESH_TOKEN"), 500);
}

/** Optional: hydrate from DB so cold starts keep the rotated token. */
export function xeroSeedRefreshToken(token: string | null | undefined): void {
  const t = cleanXero(token, 500);
  if (t) liveRefreshToken = t;
}

export function xeroCurrentRefreshToken(): string {
  return liveRefreshToken || envRefreshToken();
}

async function refreshAccessToken(): Promise<string | null> {
  const clientId = cleanXero(Deno.env.get("XERO_CLIENT_ID"), 120);
  const clientSecret = cleanXero(Deno.env.get("XERO_CLIENT_SECRET"), 200);
  const refreshToken = xeroCurrentRefreshToken();
  if (!clientId || !clientSecret || !refreshToken) return null;

  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(XERO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(refreshToken),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    console.error("[xeroAccessToken]", json?.error || res.status, json?.error_description || "");
    cachedAccessToken = null;
    cachedAccessExpiresAt = 0;
    return null;
  }

  const access = String(json.access_token);
  const expiresIn = Number(json.expires_in) || 1800;
  cachedAccessToken = access;
  cachedAccessExpiresAt = Date.now() + Math.max(60, expiresIn - 90) * 1000;

  if (json.refresh_token) {
    const next = cleanXero(json.refresh_token, 500);
    if (next && next !== refreshToken) {
      liveRefreshToken = next;
      console.warn(
        "[xeroAccessToken] Xero rotated refresh_token — persisted in-memory for this isolate; update secret / portal_xero_oauth when possible.",
      );
    } else if (next) {
      liveRefreshToken = next;
    }
  }

  return access;
}

export async function xeroAccessToken(): Promise<string | null> {
  if (cachedAccessToken && Date.now() < cachedAccessExpiresAt) {
    return cachedAccessToken;
  }
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export function xeroTenantId(): string {
  return cleanXero(Deno.env.get("XERO_TENANT_ID"), 80);
}

export function xeroAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Xero-tenant-id": xeroTenantId(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
