/** Shared admin JWT + allowlist check for portal-admin-* Edge Functions. */

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function portalAdminCorsHeaders(): Record<string, string> {
  return { ...corsHeaders };
}

export function portalAdminJson(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmailInPortalAdminAllowlist(email: string, allowCsv: string): boolean {
  const e = String(email || "").trim().toLowerCase();
  const tokens = allowCsv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const t of tokens) {
    if (t === e) return true;
    if (t.startsWith("*@")) {
      const suffix = t.slice(1);
      if (suffix.length > 1 && e.endsWith(suffix)) return true;
    }
  }
  return false;
}

export type PortalAdminVerifyResult =
  | { ok: true; email: string }
  | { ok: false; error: string; status: number };

export async function verifyPortalAdminAccessToken(
  authHeader: string | null,
): Promise<PortalAdminVerifyResult> {
  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  if (!baseUrl || !anon) {
    return { ok: false, error: "supabase_url_or_anon_not_configured", status: 503 };
  }
  if (!authHeader || !/^Bearer\s+\S+/i.test(authHeader)) {
    return { ok: false, error: "missing_authorization", status: 401 };
  }

  const res = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anon },
  });

  if (!res.ok) {
    return { ok: false, error: "invalid_or_expired_session", status: 401 };
  }

  let body: { email?: string };
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "bad_auth_response", status: 502 };
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "no_email_on_account", status: 403 };
  }

  const allow = (Deno.env.get("PORTAL_ADMIN_FORMS_EMAILS") ?? "").trim();
  if (allow && !isEmailInPortalAdminAllowlist(email, allow)) {
    return { ok: false, error: "email_not_in_allowlist", status: 403 };
  }

  return { ok: true, email };
}
