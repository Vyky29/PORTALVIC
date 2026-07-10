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

export async function xeroAccessToken(): Promise<string | null> {
  const clientId = cleanXero(Deno.env.get("XERO_CLIENT_ID"), 120);
  const clientSecret = cleanXero(Deno.env.get("XERO_CLIENT_SECRET"), 200);
  const refreshToken = cleanXero(Deno.env.get("XERO_REFRESH_TOKEN"), 500);
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
    return null;
  }
  // Note: Xero rotates refresh tokens. Store the new refresh_token in secrets when you rotate.
  if (json.refresh_token && String(json.refresh_token) !== refreshToken) {
    console.warn(
      "[xeroAccessToken] Xero returned a new refresh_token — update XERO_REFRESH_TOKEN secret.",
    );
  }
  return String(json.access_token);
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
