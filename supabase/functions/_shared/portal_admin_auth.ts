/** Shared admin JWT + allowlist check for portal-admin-* Edge Functions. */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, prefer, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/** Ops admins who must reach admin document edge functions (CEO dashboard blocked in UI). */
const PORTAL_BUILTIN_ADMIN_EMAILS = new Set([
  "victor@clubsensational.org",
  "javier@clubsensational.org",
  "raul@clubsensational.org",
  "sevitha@clubsensational.org",
  "info@clubsensational.org",
]);

const PORTAL_ADMIN_EMAIL_ALIASES: Record<string, string> = {
  "info@clubsensational.org": "sevitha@clubsensational.org",
};

const PORTAL_ADMIN_USERNAME_OVERRIDES = new Set(["sevitha"]);

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

function normalizeStaffKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function resolvePortalAdminEmail(email: string): string {
  const e = String(email || "").trim().toLowerCase();
  return PORTAL_ADMIN_EMAIL_ALIASES[e] || e;
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

function isBuiltinPortalAdminEmail(email: string): boolean {
  const raw = String(email || "").trim().toLowerCase();
  const resolved = resolvePortalAdminEmail(raw);
  return PORTAL_BUILTIN_ADMIN_EMAILS.has(raw) || PORTAL_BUILTIN_ADMIN_EMAILS.has(resolved);
}

async function staffProfileGrantsPortalAdminAccess(
  userId: string,
): Promise<boolean> {
  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole || !userId) return false;

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin
    .from("staff_profiles")
    .select("app_role, staff_role, username, full_name, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return false;
  if (data.is_active === false) return false;

  const app = String(data.app_role || "").toLowerCase();
  const staff = String(data.staff_role || "").toLowerCase();
  if (app === "admin" || app === "ceo") return true;
  if (staff === "manager" || staff === "admin") return true;

  const usernameKey = normalizeStaffKey(String(data.username || ""));
  const firstNameKey = normalizeStaffKey(
    String(data.full_name || "").split(/\s+/)[0] || "",
  );
  if (PORTAL_ADMIN_USERNAME_OVERRIDES.has(usernameKey)) return true;
  if (PORTAL_ADMIN_USERNAME_OVERRIDES.has(firstNameKey)) return true;

  return false;
}

export type PortalAdminVerifyResult =
  | { ok: true; email: string; userId: string }
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

  let body: { email?: string; id?: string };
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: "bad_auth_response", status: 502 };
  }

  const email = String(body?.email ?? "").trim().toLowerCase();
  const userId = String(body?.id ?? "").trim();
  if (!email) {
    return { ok: false, error: "no_email_on_account", status: 403 };
  }
  if (!userId) {
    return { ok: false, error: "no_user_id_on_account", status: 403 };
  }

  const resolvedEmail = resolvePortalAdminEmail(email);
  const allow = (Deno.env.get("PORTAL_ADMIN_FORMS_EMAILS") ?? "").trim();

  let allowed = isBuiltinPortalAdminEmail(email);
  if (!allowed && allow) {
    allowed = isEmailInPortalAdminAllowlist(resolvedEmail, allow) ||
      isEmailInPortalAdminAllowlist(email, allow);
  }
  if (!allowed && allow) {
    allowed = await staffProfileGrantsPortalAdminAccess(userId);
  }
  if (!allowed && !allow) {
    allowed = await staffProfileGrantsPortalAdminAccess(userId);
  }

  if (!allowed) {
    return { ok: false, error: "email_not_in_allowlist", status: 403 };
  }

  return { ok: true, email: resolvedEmail || email, userId };
}
