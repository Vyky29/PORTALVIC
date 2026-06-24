import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { sha256Hex } from "./parent_portal_auth.ts";

export type ParentPortalSession = {
  id: string;
  parent_person_id: string;
  expires_at: string;
};

export async function resolveParentPortalSession(
  req: Request,
  supabase: SupabaseClient,
): Promise<ParentPortalSession | null> {
  const token = String(req.headers.get("x-parent-portal-session") || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return null;

  const tokenHash = await sha256Hex(token);
  const { data: sess, error } = await supabase
    .from("portal_parent_portal_sessions")
    .select("id, parent_person_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !sess || sess.revoked_at) return null;
  if (new Date(sess.expires_at).getTime() < Date.now()) return null;

  await supabase
    .from("portal_parent_portal_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", sess.id);

  return {
    id: String(sess.id),
    parent_person_id: String(sess.parent_person_id),
    expires_at: String(sess.expires_at),
  };
}

export function slugifyParticipantKey(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeParticipantName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
