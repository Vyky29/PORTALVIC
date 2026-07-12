/** Staff WhatsApp helpers (admin ↔ any active staff). Separate from parent tables. */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeParentPhoneE164 } from "./portal_parent_messaging.ts";

/** @deprecated Kept for rollback; WhatsApp is open to all active staff. */
export const PORTAL_STAFF_WHATSAPP_LEADER_KEYS = new Set([
  "berta",
  "john",
  "michelle",
  "raul",
  "victor",
  "javi",
]);

export function normalizeStaffUsernameKey(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Any non-empty staff username may use CS WhatsApp (was leader-only). */
export function isPortalStaffWhatsappLeaderKey(raw: string): boolean {
  return !!normalizeStaffUsernameKey(raw);
}

export function phoneLast10(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length < 8) return "";
  return d.slice(-10);
}

export type StaffWhatsappProfile = {
  id: string;
  username: string;
  full_name: string | null;
  phone_e164: string | null;
  phone_lookup: string | null;
  staff_role: string | null;
  app_role: string | null;
};

function mapStaffRow(r: Record<string, unknown>): StaffWhatsappProfile | null {
  const id = String(r.id || "");
  const username = String(r.username || "");
  if (!id || !username) return null;
  return {
    id,
    username,
    full_name: r.full_name != null ? String(r.full_name) : null,
    phone_e164: r.phone_e164 != null ? String(r.phone_e164) : null,
    phone_lookup: r.phone_lookup != null ? String(r.phone_lookup) : null,
    staff_role: r.staff_role != null ? String(r.staff_role) : null,
    app_role: r.app_role != null ? String(r.app_role) : null,
  };
}

/** Active staff directory for CS WhatsApp (name kept for call-site compatibility). */
export async function fetchStaffWhatsappLeaders(
  admin: SupabaseClient,
): Promise<StaffWhatsappProfile[]> {
  const { data, error } = await admin
    .from("staff_profiles")
    .select("id, username, full_name, phone_e164, phone_lookup, staff_role, app_role")
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error || !Array.isArray(data)) return [];
  return data
    .map((r) => mapStaffRow(r as Record<string, unknown>))
    .filter((r): r is StaffWhatsappProfile => !!r);
}

export async function findStaffLeaderByUsername(
  admin: SupabaseClient,
  username: string,
): Promise<StaffWhatsappProfile | null> {
  const want = normalizeStaffUsernameKey(username);
  if (!want) return null;
  const { data, error } = await admin
    .from("staff_profiles")
    .select("id, username, full_name, phone_e164, phone_lookup, staff_role, app_role")
    .eq("is_active", true)
    .ilike("username", want)
    .limit(8);
  if (error || !Array.isArray(data) || !data.length) {
    // Fallback: case/format variants via full directory scan
    const all = await fetchStaffWhatsappLeaders(admin);
    return all.find((l) => normalizeStaffUsernameKey(l.username) === want) || null;
  }
  const exact =
    data.find((r) => normalizeStaffUsernameKey(String(r.username || "")) === want) || data[0];
  return mapStaffRow(exact as Record<string, unknown>);
}

export async function findStaffLeaderByPhone(
  admin: SupabaseClient,
  phoneRaw: string,
): Promise<StaffWhatsappProfile | null> {
  const e164 = normalizeParentPhoneE164(phoneRaw) || "";
  const last10 = phoneLast10(e164 || phoneRaw);
  if (!last10) return null;
  const staff = await fetchStaffWhatsappLeaders(admin);
  for (const l of staff) {
    const lookup = String(l.phone_lookup || phoneLast10(l.phone_e164 || "")).replace(/\D/g, "");
    if (lookup && (lookup === last10 || lookup.endsWith(last10) || last10.endsWith(lookup))) {
      return l;
    }
    const pe = phoneLast10(l.phone_e164 || "");
    if (pe && pe === last10) return l;
  }
  return null;
}

export function serviceRoleClient(): SupabaseClient | null {
  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return null;
  return createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
