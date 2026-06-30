/** Shared helpers for parent portal message threads (club outbound + family inbound). */

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
