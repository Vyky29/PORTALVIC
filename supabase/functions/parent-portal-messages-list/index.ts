// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-messages-list
// ---------------------------
// Unified thread: club outbound + family inbound (WhatsApp + parent app).
//
// Headers: x-parent-portal-session
// Body: { contact_id?: string, mark_read?: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
  applyUnreadFlagsToMessages,
  countUnreadOutboundMessages,
  fetchParentOutboundNotifyRows,
  fetchParentWhatsappInboundRows,
  getParentMessageReadAt,
  markParentMessagesRead,
  mergeParentPortalMessages,
  parentPhoneLast10,
  whatsappBusinessLinkFromEnv,
} from "../_shared/parent_portal_messages.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const session = await resolveParentPortalSession(req, supabase);
  if (!session) return parentPortalJsonInvalid();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_e) {
    body = {};
  }
  const markRead = body.mark_read === true || body.mark_read === "true";

  const { data: parentMeta } = await supabase
    .from("portal_parent_contacts")
    .select("parent_display, email, mobile")
    .eq("parent_person_id", session.parent_person_id)
    .limit(1)
    .maybeSingle();

  const emailNorm = String(parentMeta?.email || "").trim().toLowerCase();
  const phone10 = parentPhoneLast10(String(parentMeta?.mobile || ""));

  const outbound = await fetchParentOutboundNotifyRows(supabase, emailNorm, phone10, 80);
  const inbound = await fetchParentWhatsappInboundRows(supabase, phone10, 80);

  let readAt = await getParentMessageReadAt(supabase, session.parent_person_id);
  if (markRead) {
    readAt = await markParentMessagesRead(supabase, session.parent_person_id);
  }

  const messages = applyUnreadFlagsToMessages(
    mergeParentPortalMessages(outbound, inbound),
    readAt,
  );
  const unread_messages_count = markRead
    ? 0
    : countUnreadOutboundMessages(outbound, readAt);
  const waBiz = whatsappBusinessLinkFromEnv();

  return new Response(
    JSON.stringify({
      ok: true,
      parent: {
        display_name: parentMeta?.parent_display ?? null,
        email: parentMeta?.email ?? null,
        mobile: parentMeta?.mobile ?? null,
      },
      messages,
      unread_messages_count,
      messages_read_at: readAt,
      whatsapp_business: waBiz,
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
