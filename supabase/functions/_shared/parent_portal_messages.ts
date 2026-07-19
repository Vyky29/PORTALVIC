/** Shared helpers for parent portal message threads (club outbound + family inbound). */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { slugifyParticipantKey } from "./parent_portal_session.ts";

export const PARENT_PORTAL_MESSAGE_READ_EPOCH = "1970-01-01T00:00:00.000Z";

export function parentPhoneLast10(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

export function phonesLikelyMatch(a: string, b: string): boolean {
  const da = parentPhoneLast10(a);
  const db = parentPhoneLast10(b);
  if (!da || !db) return false;
  return da === db;
}

export type ParentPortalMessageRow = {
  id: string;
  direction: "out" | "in";
  created_at: string;
  body_text: string | null;
  kind?: string | null;
  channel?: string | null;
  source?: "whatsapp" | "parent_app" | "email" | null;
  sender_name?: string | null;
  client_display?: string | null;
  venue?: string | null;
  is_unread?: boolean;
};

export function mergeParentPortalMessages(
  outbound: Record<string, unknown>[],
  inbound: Record<string, unknown>[],
): ParentPortalMessageRow[] {
  const items: ParentPortalMessageRow[] = [];

  for (const row of outbound || []) {
    const channel = String(row.channel || "").trim().toLowerCase();
    const wa = String(row.whatsapp_status || "").trim().toLowerCase();
    const em = String(row.email_status || "").trim().toLowerCase();
    let source: ParentPortalMessageRow["source"] = null;
    if (wa === "sent" || wa === "sent_sms") source = "whatsapp";
    else if (em === "sent") source = "email";
    else if (channel === "whatsapp") source = "whatsapp";
    else if (channel === "email") source = "email";

    items.push({
      id: String(row.id || ""),
      direction: "out",
      created_at: String(row.created_at || ""),
      body_text: row.body_text != null ? String(row.body_text) : (row.subject != null ? String(row.subject) : null),
      kind: row.kind != null ? String(row.kind) : null,
      channel: channel || null,
      source,
      sender_name: row.sent_by_email != null ? String(row.sent_by_email) : "Club",
      client_display: row.client_display != null ? String(row.client_display) : null,
      venue: row.venue != null ? String(row.venue) : null,
    });
  }

  for (const row of inbound || []) {
    const meta = (row.meta && typeof row.meta === "object") ? row.meta as Record<string, unknown> : {};
    const waId = String(row.wa_message_id || "");
    const fromApp = meta.source === "parent_portal" || waId.startsWith("app:");
    items.push({
      id: String(row.id || ""),
      direction: "in",
      created_at: String(row.created_at || ""),
      body_text: row.body_text != null ? String(row.body_text) : null,
      kind: fromApp ? "parent_app" : "whatsapp_reply",
      channel: fromApp ? "parent_app" : "whatsapp",
      source: fromApp ? "parent_app" : "whatsapp",
      sender_name: row.contact_name != null ? String(row.contact_name) : "You",
      client_display: meta.participant_display != null ? String(meta.participant_display) : null,
      venue: null,
    });
  }

  items.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  return items;
}

export function whatsappBusinessLinkFromEnv(): { display: string | null; wa_me_url: string | null } {
  const display = String(Deno.env.get("META_WHATSAPP_DISPLAY_PHONE_NUMBER") ?? "").trim();
  if (!display) return { display: null, wa_me_url: null };
  const digits = display.replace(/\D/g, "");
  if (!digits) return { display, wa_me_url: null };
  return { display, wa_me_url: `https://wa.me/${digits}` };
}

const OUTBOUND_MSG_SELECT =
  "id, created_at, kind, channel, client_display, subject, body_text, email_status, whatsapp_status, session_date, venue, sent_by_email";

export async function fetchParentOutboundNotifyRows(
  supabase: SupabaseClient,
  emailNorm: string,
  phone10: string,
  limit = 80,
): Promise<Record<string, unknown>[]> {
  let outbound: Record<string, unknown>[] = [];

  if (emailNorm) {
    const { data } = await supabase
      .from("portal_parent_notify_log")
      .select(OUTBOUND_MSG_SELECT)
      .ilike("parent_email", emailNorm)
      .order("created_at", { ascending: false })
      .limit(limit);
    outbound = data || [];
  }

  if (phone10) {
    const { data: byPhone } = await supabase
      .from("portal_parent_notify_log")
      .select(OUTBOUND_MSG_SELECT)
      .like("parent_phone", `%${phone10}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    const merged = [...outbound, ...(byPhone || [])];
    const seen = new Set<string>();
    outbound = merged.filter((row) => {
      const id = String(row.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  return outbound;
}

export async function fetchParentWhatsappInboundRows(
  supabase: SupabaseClient,
  phone10: string,
  limit = 80,
): Promise<Record<string, unknown>[]> {
  if (!phone10) return [];
  const { data, error } = await supabase
    .from("portal_parent_whatsapp_inbound")
    .select("id, created_at, wa_message_id, from_phone, contact_name, message_type, body_text, meta")
    .like("from_phone", `%${phone10}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

export async function getParentMessageReadAt(
  supabase: SupabaseClient,
  parentPersonId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("portal_parent_portal_message_read")
      .select("read_at")
      .eq("parent_person_id", parentPersonId)
      .maybeSingle();
    if (error) {
      console.warn("[parent-portal] read_at", error.message);
      return PARENT_PORTAL_MESSAGE_READ_EPOCH;
    }
    return data?.read_at ? String(data.read_at) : PARENT_PORTAL_MESSAGE_READ_EPOCH;
  } catch (e) {
    console.warn("[parent-portal] read_at exception", e);
    return PARENT_PORTAL_MESSAGE_READ_EPOCH;
  }
}

export async function markParentMessagesRead(
  supabase: SupabaseClient,
  parentPersonId: string,
  readAt?: string,
): Promise<string> {
  const at = readAt || new Date().toISOString();
  const { data, error } = await supabase.rpc("portal_parent_portal_mark_messages_read", {
    p_parent_person_id: parentPersonId,
    p_read_at: at,
  });
  if (error) {
    console.warn("[parent-portal] mark messages read", error);
    return at;
  }
  return data ? String(data) : at;
}

function clientSlugMatchesParticipant(clientDisplay: string, participantName: string): boolean {
  const cd = slugifyParticipantKey(clientDisplay);
  const slug = slugifyParticipantKey(participantName);
  if (!cd || !slug) return false;
  return cd === slug || cd.includes(slug) || slug.includes(cd);
}

export function countUnreadOutboundMessages(
  outbound: Record<string, unknown>[],
  readAtIso: string,
): number {
  const readMs = new Date(readAtIso).getTime();
  let n = 0;
  for (const row of outbound || []) {
    const createdMs = new Date(String(row.created_at || 0)).getTime();
    if (createdMs > readMs) n++;
  }
  return n;
}

export function unreadOutboundCountByContact(
  outbound: Record<string, unknown>[],
  readAtIso: string,
  children: { contact_id: string; display_name?: string | null }[],
): Record<string, number> {
  const readMs = new Date(readAtIso).getTime();
  const out: Record<string, number> = {};
  for (const c of children || []) {
    out[String(c.contact_id || "")] = 0;
  }
  for (const row of outbound || []) {
    const createdMs = new Date(String(row.created_at || 0)).getTime();
    if (createdMs <= readMs) continue;
    const clientDisplay = String(row.client_display || "").trim();
    if (!clientDisplay) continue;
    for (const c of children || []) {
      const cid = String(c.contact_id || "");
      if (!cid) continue;
      if (clientSlugMatchesParticipant(clientDisplay, String(c.display_name || ""))) {
        out[cid] = (out[cid] || 0) + 1;
      }
    }
  }
  return out;
}

export function applyUnreadFlagsToMessages(
  messages: ParentPortalMessageRow[],
  readAtIso: string,
): ParentPortalMessageRow[] {
  const readMs = new Date(readAtIso).getTime();
  return messages.map((m) => ({
    ...m,
    is_unread: m.direction === "out" && new Date(m.created_at).getTime() > readMs,
  }));
}
