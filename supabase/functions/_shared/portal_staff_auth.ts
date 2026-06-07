/** Verify any active portal staff session (staff, lead, admin, CEO). */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PortalStaffVerifyResult =
  | {
    ok: true;
    userId: string;
    email: string;
    fullName: string;
    appRole: string;
  }
  | { ok: false; error: string; status: number };

function bearerUserJwt(req: Request): string {
  const raw = String(req.headers.get("authorization") || "").trim();
  const m = /^Bearer\s+(.+)$/i.exec(raw);
  return m ? m[1].trim() : "";
}

export async function verifyPortalStaff(
  req: Request,
): Promise<PortalStaffVerifyResult> {
  const jwt = bearerUserJwt(req);
  if (!jwt) return { ok: false, error: "missing_authorization", status: 401 };

  const url = (Deno.env.get("SUPABASE_URL") || "").trim().replace(/\/$/, "");
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!url || !serviceKey) {
    return { ok: false, error: "server_misconfigured", status: 503 };
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return { ok: false, error: "invalid_or_expired_session", status: 401 };
  }

  const uid = String(userData.user.id);
  const email = String(userData.user.email || "").trim().toLowerCase();

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("id, full_name, username, app_role, is_active")
    .eq("id", uid)
    .maybeSingle();

  if (!profile || profile.is_active === false) {
    return { ok: false, error: "staff_profile_inactive", status: 403 };
  }

  return {
    ok: true,
    userId: uid,
    email,
    fullName: String(profile.full_name || profile.username || "").trim(),
    appRole: String(profile.app_role || "").trim(),
  };
}
