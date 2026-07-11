/** Staff / leader WhatsApp helpers (admin ↔ leaders). Separate from parent tables. */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeParentPhoneE164 } from "./portal_parent_messaging.ts";

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

export function isPortalStaffWhatsappLeaderKey(raw: string): boolean {
  const k = normalizeStaffUsernameKey(raw);
  if (PORTAL_STAFF_WHATSAPP_LEADER_KEYS.has(k)) return true;
  // Historical alias: some rows use "javier" for Palankas — keep out of instructor Javier.
  return false;
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
};

export async function fetchStaffWhatsappLeaders(
  admin: SupabaseClient,
): Promise<StaffWhatsappProfile[]> {
  const { data, error } = await admin
    .from("staff_profiles")
    .select("id, username, full_name, phone_e164, phone_lookup")
    .eq("is_active", true);
  if (error || !Array.isArray(data)) return [];
  return data
    .map((r) => ({
      id: String(r.id || ""),
      username: String(r.username || ""),
      full_name: r.full_name != null ? String(r.full_name) : null,
      phone_e164: r.phone_e164 != null ? String(r.phone_e164) : null,
      phone_lookup: r.phone_lookup != null ? String(r.phone_lookup) : null,
    }))
    .filter((r) => r.id && isPortalStaffWhatsappLeaderKey(r.username));
}

export async function findStaffLeaderByUsername(
  admin: SupabaseClient,
  username: string,
): Promise<StaffWhatsappProfile | null> {
  const want = normalizeStaffUsernameKey(username);
  if (!isPortalStaffWhatsappLeaderKey(want)) return null;
  const leaders = await fetchStaffWhatsappLeaders(admin);
  return leaders.find((l) => normalizeStaffUsernameKey(l.username) === want) || null;
}

export async function findStaffLeaderByPhone(
  admin: SupabaseClient,
  phoneRaw: string,
): Promise<StaffWhatsappProfile | null> {
  const e164 = normalizeParentPhoneE164(phoneRaw) || "";
  const last10 = phoneLast10(e164 || phoneRaw);
  if (!last10) return null;
  const leaders = await fetchStaffWhatsappLeaders(admin);
  for (const l of leaders) {
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
