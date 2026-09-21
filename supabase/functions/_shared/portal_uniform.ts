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

/** Day Centre + Bespoke Programme → 2 T-shirts + 2 sweatshirts. */
const KIT_2X2_USERNAMES = new Set([
  "john",
  "godsway",
  "emanuel",
  "emmanuel",
  "michelle",
]);

/** Zero-hours support examples → 1 T-shirt + 1 sweatshirt. */
const KIT_1X1_USERNAMES = new Set([
  "carlos",
  "alex",
  "berta",
  "bismark",
  "giuseppe",
]);

export type UniformKitLine = {
  sku_code: string;
  qty: number;
  label: string;
};

export type UniformKitOffer = {
  tier: "kit_2x2" | "kit_1x1" | "kit_none" | "kit_manager";
  label: string;
  summary: string;
  lines: UniformKitLine[];
  swimming_note?: string;
};

export function resolveUniformKitTier(
  username: string,
  staffRole: string,
  appRole: string,
  storedTier: string | null | undefined,
): UniformKitOffer["tier"] {
  const stored = String(storedTier || "").trim().toLowerCase();
  if (
    stored === "kit_2x2" ||
    stored === "kit_1x1" ||
    stored === "kit_none" ||
    stored === "kit_manager"
  ) {
    return stored;
  }

  const u = String(username || "").trim().toLowerCase();
  const staff = String(staffRole || "").trim().toLowerCase();
  const app = String(appRole || "").trim().toLowerCase();

  if (staff === "swimming") return "kit_none";
  if (KIT_2X2_USERNAMES.has(u)) return "kit_2x2";
  if (KIT_1X1_USERNAMES.has(u)) return "kit_1x1";
  if (app === "admin" || app === "ceo" || staff === "manager" || staff === "admin") {
    return "kit_manager";
  }
  if (staff === "support") return "kit_1x1";
  return "kit_none";
}

export function uniformKitOfferForTier(
  tier: UniformKitOffer["tier"],
): UniformKitOffer {
  if (tier === "kit_2x2") {
    return {
      tier,
      label: "Day Centre / Bespoke (2 + 2)",
      summary: "2 x Grey Mixed Cotton T-Shirts + 2 x Grey Knitted Sweatshirts",
      lines: [
        {
          sku_code: "STAFF_GREY_TSHIRT",
          qty: 2,
          label: "Grey Mixed Cotton T-Shirts",
        },
        {
          sku_code: "STAFF_GREY_SWEAT",
          qty: 2,
          label: "Grey Knitted Sweatshirts",
        },
      ],
    };
  }
  if (tier === "kit_1x1") {
    return {
      tier,
      label: "Support (zero hours) (1 + 1)",
      summary: "1 x Grey Mixed Cotton T-Shirt + 1 x Grey Knitted Sweatshirt",
      lines: [
        {
          sku_code: "STAFF_GREY_TSHIRT",
          qty: 1,
          label: "Grey Mixed Cotton T-Shirts",
        },
        {
          sku_code: "STAFF_GREY_SWEAT",
          qty: 1,
          label: "Grey Knitted Sweatshirts",
        },
      ],
    };
  }
  if (tier === "kit_manager") {
    return {
      tier,
      label: "Manager / admin",
      summary:
        "No auto grey kit. Issue manager polos from stock when needed.",
      lines: [],
    };
  }
  return {
    tier: "kit_none",
    label: "Swimming / no grey kit",
    summary: "No grey T-shirt or sweatshirt allocation.",
    lines: [],
    swimming_note:
      "If swimming staff receive kit later, add swimming-specific items to uniform stock first.",
  };
}

export function resolveUniformKitOffer(profile: {
  username?: string | null;
  staff_role?: string | null;
  app_role?: string | null;
  uniform_kit_tier?: string | null;
}): UniformKitOffer {
  const tier = resolveUniformKitTier(
    String(profile.username || ""),
    String(profile.staff_role || ""),
    String(profile.app_role || ""),
    profile.uniform_kit_tier,
  );
  return uniformKitOfferForTier(tier);
}

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

/** Only these staff may issue / return / stock-in uniform. */
export const UNIFORM_ISSUER_USERNAMES = new Set([
  "berta",
  "roberto",
  "michelle",
  "john",
]);

export function usernameAllowsUniformIssue(username: string): boolean {
  return UNIFORM_ISSUER_USERNAMES.has(
    String(username || "").trim().toLowerCase(),
  );
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
      canIssue: usernameAllowsUniformIssue(username),
      isAdminView: true,
    };
  }

  const sb = serviceClient();
  let staffRole = "";
  let username = staff.username;
  if (sb) {
    const { data } = await sb
      .from("staff_profiles")
      .select("staff_role, app_role, full_name, username")
      .eq("id", staff.profileId)
      .maybeSingle();
    if (data) {
      staffRole = String(data.staff_role || "");
      if (data.app_role) staff.appRole = String(data.app_role);
      if (data.full_name) staff.fullName = String(data.full_name);
      if (data.username) username = String(data.username);
    }
  }

  const canIssue = usernameAllowsUniformIssue(username);
  const isAdminView =
    canIssue ||
    ["admin", "ceo"].includes(String(staff.appRole || "").toLowerCase());

  return {
    ok: true,
    userId: staff.userId,
    profileId: staff.profileId,
    fullName: staff.fullName,
    username,
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
