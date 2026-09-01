/** Shared helpers for uniform-* Edge Functions. */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyPortalStaff } from "./portal_staff_auth.ts";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "./portal_admin_auth.ts";

export const UNIFORM_SIZES = new Set(["S", "M", "L", "XL", "XXL"]);
export const ISSUE_TYPES = new Set([
  "initial",
  "replacement",
  "size_change",
  "correction",
]);

export function uniformCorsHeaders(): Record<string, string> {
  return portalAdminCorsHeaders();
}

export function uniformJson(
  status: number,
  body: Record<string, unknown>,
): Response {
  return portalAdminJson(status, body);
}

export function cleanText(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function serviceClient() {
  const url = (Deno.env.get("SUPABASE_URL") || "").trim().replace(/\/$/, "");
  const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function roleAllowsIssue(appRole: string, staffRole: string): boolean {
  const app = String(appRole || "").toLowerCase().trim();
  const staff = String(staffRole || "").toLowerCase().trim().replace(/[_-]+/g, " ");
  if (app === "admin" || app === "ceo") return true;
  if (staff === "manager" || staff === "admin") return true;
  if (staff === "team leader" || staff === "teamleader" || staff === "tl") {
    return true;
  }
  return false;
}

export type UniformActor =
  | {
    ok: true;
    userId: string;
    profileId: string;
    fullName: string;
    username: string;
    appRole: string;
    staffRole: string;
    canIssue: boolean;
    isAdminView: boolean;
  }
  | { ok: false; error: string; status: number };

/** Any signed-in staff; flags canIssue / isAdminView for RBAC inside handlers. */
export async function verifyUniformActor(req: Request): Promise<UniformActor> {
  const staff = await verifyPortalStaff(req);
  if (!staff.ok) {
    // Admin allowlist path (builtin emails) even if staff_profiles link is odd
    const admin = await verifyPortalAdminAccessToken(
      req.headers.get("Authorization"),
    );
    if (!admin.ok) {
      return { ok: false, error: staff.error, status: staff.status };
    }
    const sb = serviceClient();
    let profileId = admin.userId;
    let fullName = admin.email;
    let username = "";
    let appRole = "admin";
    let staffRole = "admin";
    if (sb) {
      const { data } = await sb
        .from("staff_profiles")
        .select("id, full_name, username, app_role, staff_role")
        .eq("id", admin.userId)
        .maybeSingle();
      if (data) {
        profileId = String(data.id);
        fullName = String(data.full_name || data.username || admin.email);
        username = String(data.username || "");
        appRole = String(data.app_role || "admin");
        staffRole = String(data.staff_role || "admin");
      }
    }
    return {
      ok: true,
      userId: admin.userId,
      profileId,
      fullName,
      username,
      appRole,
      staffRole,
      canIssue: true,
      isAdminView: true,
    };
  }

  const sb = serviceClient();
  let staffRole = "";
  if (sb) {
    const { data } = await sb
      .from("staff_profiles")
      .select("staff_role, app_role, full_name")
      .eq("id", staff.profileId)
      .maybeSingle();
    if (data) {
      staffRole = String(data.staff_role || "");
      if (data.app_role) staff.appRole = String(data.app_role);
      if (data.full_name) staff.fullName = String(data.full_name);
    }
  }

  const canIssue = roleAllowsIssue(staff.appRole, staffRole);
  const isAdminView =
    canIssue ||
    ["admin", "ceo"].includes(String(staff.appRole || "").toLowerCase());

  return {
    ok: true,
    userId: staff.userId,
    profileId: staff.profileId,
    fullName: staff.fullName,
    username: staff.username,
    appRole: staff.appRole,
    staffRole,
    canIssue,
    isAdminView,
  };
}

export async function adjustStockLevel(
  sb: ReturnType<typeof createClient>,
  itemId: string,
  size: string,
  delta: number,
): Promise<{ ok: true; current: number } | { ok: false; error: string }> {
  const { data: level, error } = await sb
    .from("uniform_stock_levels")
    .select("id, current_qty")
    .eq("item_id", itemId)
    .eq("size", size)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!level) return { ok: false, error: "stock_level_not_found" };

  const next = Number(level.current_qty || 0) + delta;
  if (next < 0) return { ok: false, error: "insufficient_stock" };

  const { error: upErr } = await sb
    .from("uniform_stock_levels")
    .update({ current_qty: next, updated_at: new Date().toISOString() })
    .eq("id", level.id);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, current: next };
}
