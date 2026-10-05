// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-note-message
// Parent writes on a session note. Stored for the admin bell only.
// Does not WhatsApp, push, or email the family.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parentPortalCorsHeaders, parentPortalJsonInvalid } from "../_shared/parent_portal_auth.ts";
import { resolveParentPortalSession, parentPortalGhostWriteResponse } from "../_shared/parent_portal_session.ts";

function clean(v: unknown, max = 2000): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
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
  if (session && session.ghost) return parentPortalGhostWriteResponse();
  if (!session) return parentPortalJsonInvalid();

  let body: {
    contact_id?: string;
    note_key?: string;
    session_date?: string;
    service_label?: string;
    message?: string;
  } = {};
  try {
    body = await req.json();
  } catch (_) {
    return parentPortalJsonInvalid(400);
  }

  const contactId = clean(body.contact_id, 120);
  const noteKey = clean(body.note_key, 160);
  const message = clean(body.message, 2000);
  const serviceLabel = clean(body.service_label, 180);
  const sessionDate = clean(body.session_date, 10);
  if (!contactId || !noteKey || message.length < 2) {
    return new Response(JSON.stringify({ ok: false, error: "empty" }), {
      status: 400,
      headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
    });
  }
  if (sessionDate && !/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return parentPortalJsonInvalid(400);
  }

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("contact_id, display_name, first_name")
    .eq("parent_person_id", session.parent_person_id)
    .eq("contact_id", contactId)
    .maybeSingle();

  let childName = "";
  if (!participant) {
    const fallback = await supabase
      .from("portal_parent_contacts")
      .select("contact_id, child_display, child_first_name")
      .eq("parent_person_id", session.parent_person_id)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!fallback.data) return parentPortalJsonInvalid(403);
    childName = clean(fallback.data.child_first_name || fallback.data.child_display, 80);
  } else {
    childName = clean(participant.first_name || participant.display_name, 80);
  }

  const { data: inserted, error } = await supabase
    .from("portal_parent_note_messages")
    .insert({
      contact_id: contactId,
      note_key: noteKey,
      session_date: sessionDate || null,
      service_label: serviceLabel,
      child_name: childName,
      parent_body: message,
    })
    .select("id, note_key, session_date, service_label, parent_body, admin_reply, created_at")
    .maybeSingle();

  if (error || !inserted) {
    console.error("[parent-portal-note-message] insert failed", error && error.code);
    return parentPortalJsonInvalid(500);
  }

  return new Response(JSON.stringify({ ok: true, message: inserted }), {
    status: 200,
    headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" },
  });
});
