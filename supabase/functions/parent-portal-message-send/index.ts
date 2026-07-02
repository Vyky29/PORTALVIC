// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-message-send
// --------------------------
// Parent sends a message from the portal — stored for admin inbox (same table as WhatsApp inbound).
//
// Headers: x-parent-portal-session
// Body: { message: string, contact_id?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession } from "../_shared/parent_portal_session.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";

function clean(v: unknown, max = 2000): string {
  return String(v ?? "").trim().slice(0, max);
}

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

  let body: { message?: string; contact_id?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    return parentPortalJsonInvalid(400);
  }

  const message = clean(body.message, 2000);
  if (!message) {
    return new Response(JSON.stringify({ ok: false, error: "empty" }), {
      status: 400,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const contactId = clean(body.contact_id, 120);
  let participantDisplay: string | null = null;
  if (contactId) {
    const { data: participant } = await supabase
      .from("portal_participants")
      .select("contact_id, display_name")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!participant) {
      const fallback = await supabase
        .from("portal_parent_contacts")
        .select("contact_id, child_display")
        .eq("parent_person_id", session.parent_person_id)
        .eq("contact_id", contactId)
        .maybeSingle();
      if (!fallback.data) return parentPortalJsonInvalid(403);
      participantDisplay = String(fallback.data.child_display || "").trim() || null;
    } else {
      participantDisplay = String(participant.display_name || "").trim() || null;
    }
  }

  const { data: parentMeta } = await supabase
    .from("portal_parent_contacts")
    .select("parent_display, mobile")
    .eq("parent_person_id", session.parent_person_id)
    .limit(1)
    .maybeSingle();

  const phoneRaw = String(parentMeta?.mobile || "").trim();
  const phone = normalizeParentPhoneE164(phoneRaw);
  if (!phone) {
    return new Response(JSON.stringify({ ok: false, error: "no_phone_on_file" }), {
      status: 400,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }

  const parentName = String(parentMeta?.parent_display || "").trim() || "Parent";
  const waMessageId = `app:${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const row = {
    wa_message_id: waMessageId,
    from_phone: phone,
    contact_name: parentName,
    message_type: "text",
    body_text: message,
    context_wa_id: null,
    created_at: now,
    meta: {
      source: "parent_portal",
      parent_person_id: session.parent_person_id,
      contact_id: contactId || null,
      participant_display: participantDisplay,
    },
  };

  const { data: inserted, error } = await supabase
    .from("portal_parent_whatsapp_inbound")
    .insert(row)
    .select("id, created_at, body_text, meta")
    .maybeSingle();

  if (error) {
    console.error("[parent-portal-message-send] insert failed", error);
    return parentPortalJsonInvalid(500);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      message: {
        id: inserted?.id || waMessageId,
        direction: "in",
        created_at: inserted?.created_at || now,
        body_text: message,
        kind: "parent_app",
        channel: "parent_app",
        source: "parent_app",
        sender_name: parentName,
        client_display: participantDisplay,
      },
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
