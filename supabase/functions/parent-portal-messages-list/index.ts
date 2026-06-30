// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-messages-list
// ---------------------------
// Unified thread: club outbound + family inbound (WhatsApp + parent app).
//
// Headers: x-parent-portal-session
// Body: { contact_id?: string } — optional participant context (not filtered)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import {
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

  const { data: parentMeta } = await supabase
    .from("portal_parent_contacts")
    .select("parent_display, email, mobile")
    .eq("parent_person_id", session.parent_person_id)
    .limit(1)
    .maybeSingle();

  const emailNorm = String(parentMeta?.email || "").trim().toLowerCase();
  const phone10 = parentPhoneLast10(String(parentMeta?.mobile || ""));

  const msgSelect =
    "id, created_at, kind, channel, client_display, subject, body_text, email_status, whatsapp_status, session_date, venue, sent_by_email";

  let outbound: Record<string, unknown>[] = [];
  if (emailNorm) {
    const { data } = await supabase
      .from("portal_parent_notify_log")
      .select(msgSelect)
      .ilike("parent_email", emailNorm)
      .order("created_at", { ascending: false })
      .limit(80);
    outbound = data || [];
  }

  if (phone10) {
    const { data: byPhone } = await supabase
      .from("portal_parent_notify_log")
      .select(msgSelect)
      .like("parent_phone", `%${phone10}`)
      .order("created_at", { ascending: false })
      .limit(80);
    const merged = [...outbound, ...(byPhone || [])];
    const seen = new Set<string>();
    outbound = merged.filter((row) => {
      const id = String(row.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  let inbound: Record<string, unknown>[] = [];
  if (phone10) {
    const { data, error } = await supabase
      .from("portal_parent_whatsapp_inbound")
      .select("id, created_at, wa_message_id, from_phone, contact_name, message_type, body_text, meta")
      .like("from_phone", `%${phone10}`)
      .order("created_at", { ascending: false })
      .limit(80);
    if (!error) inbound = data || [];
  }

  const messages = mergeParentPortalMessages(outbound, inbound);
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
      whatsapp_business: waBiz,
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
