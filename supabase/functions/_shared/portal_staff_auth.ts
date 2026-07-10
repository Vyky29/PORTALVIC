/** Verify any active portal staff session (staff, lead, admin, CEO). */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PortalStaffVerifyResult =
  | {
    ok: true;
    userId: string;
    profileId: string;
    email: string;
    fullName: string;
    appRole: string;
    username: string;
  }
  | { ok: false; error: string; status: number };

function bearerUserJwt(req: Request): string {
  const raw = String(req.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : "";
}

function cleanEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

/** Personal / alias emails → staff_profiles.username candidates (mirrors auth-map.js). */
const EMAIL_USERNAME_CANDIDATES: Record<string, string[]> = {
  "victor@clubsensational.org": ["victor"],
  "raul@clubsensational.org": ["raul"],
  "javier@clubsensational.org": ["javi", "javier"],
  "javi@clubsensational.org": ["javi", "javier"],
  "sevitha@clubsensational.org": ["sevitha"],
  "info@clubsensational.org": ["sevitha"],
  "johnnyosti37@gmail.com": ["john"],
  "b.traperocasado@gmail.com": ["berta"],
  "michelle@youtimecounselling.com": ["michelle"],
};

function parseRpcProfile(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return parseRpcProfile(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return parseRpcProfile(raw[0]);
  if (typeof raw === "object") return raw as Record<string, unknown>;
  return null;
}

async function findProfileByUsernames(
  admin: ReturnType<typeof createClient>,
  names: string[],
): Promise<Record<string, unknown> | null> {
  const cleaned = Array.from(
    new Set(
      names
        .map((n) => String(n || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  if (!cleaned.length) return null;
  const { data } = await admin
    .from("staff_profiles")
    .select("id, full_name, username, app_role, is_active")
    .or(cleaned.map((n) => `username.ilike.${n}`).join(","))
    .limit(8);
  const rows = Array.isArray(data) ? data : [];
  return rows.find((r) => r && r.is_active !== false) || null;
}

/**
 * Resolve staff_profiles for the JWT user.
 * Matches auth.uid(), portal_get_session_staff_profile RPC, auth templates, and email aliases.
 */
export async function verifyPortalStaff(
  req: Request,
): Promise<PortalStaffVerifyResult> {
  const jwt = bearerUserJwt(req);
  if (!jwt) return { ok: false, error: "missing_authorization", status: 401 };

  const url = (Deno.env.get("SUPABASE_URL") || "").trim().replace(/\/$/, "");
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  if (!url || !serviceKey) {
    return { ok: false, error: "server_misconfigured", status: 503 };
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return { ok: false, error: "invalid_or_expired_session", status: 401 };
  }

  const uid = String(userData.user.id);
  const email = cleanEmail(userData.user.email);

  let profile: Record<string, unknown> | null = null;

  const { data: byId } = await admin
    .from("staff_profiles")
    .select("id, full_name, username, app_role, is_active")
    .eq("id", uid)
    .maybeSingle();
  if (byId && byId.is_active !== false) profile = byId;

  // Same resolver the browser uses (may relink legacy username rows).
  if (!profile && anonKey) {
    try {
      const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: rpcRaw } = await userClient.rpc("portal_get_session_staff_profile");
      const rpcProfile = parseRpcProfile(rpcRaw);
      if (rpcProfile && rpcProfile.is_active !== false && rpcProfile.id) {
        profile = rpcProfile;
      }
    } catch {
      /* optional */
    }
  }

  if (!profile && email) {
    const { data: tpl } = await admin
      .from("portal_auth_profile_templates")
      .select("username, full_name, app_role")
      .eq("email_lower", email)
      .maybeSingle();
    const candidates = [
      ...(EMAIL_USERNAME_CANDIDATES[email] || []),
      tpl?.username ? String(tpl.username) : "",
      email.split("@")[0] || "",
    ];
    profile = await findProfileByUsernames(admin, candidates);
  }

  if (!profile || profile.is_active === false) {
    return { ok: false, error: "not_staff", status: 403 };
  }

  return {
    ok: true,
    userId: uid,
    profileId: String(profile.id || uid),
    email,
    fullName: String(profile.full_name || profile.username || "").trim(),
    appRole: String(profile.app_role || "").trim(),
    username: String(profile.username || "").trim(),
  };
}
