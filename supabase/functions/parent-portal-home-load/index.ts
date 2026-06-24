// @ts-nocheck — Edge Function (Deno).
//
// parent-portal-home-load
// -----------------------
// Returns linked children + recent club messages for the authenticated parent session.
//
// Headers: x-parent-portal-session

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  parentPortalCorsHeaders,
  parentPortalJsonInvalid,
  sha256Hex,
} from "../_shared/parent_portal_auth.ts";

function normalizePhoneDigits(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: parentPortalCorsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: parentPortalCorsHeaders });
  }

  const token = String(req.headers.get("x-parent-portal-session") || "").trim();
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return parentPortalJsonInvalid();

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return parentPortalJsonInvalid(500);

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tokenHash = await sha256Hex(token);
  const { data: sess, error: sessErr } = await supabase
    .from("portal_parent_portal_sessions")
    .select("id, parent_person_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (sessErr || !sess || sess.revoked_at) return parentPortalJsonInvalid();
  if (new Date(sess.expires_at).getTime() < Date.now()) return parentPortalJsonInvalid();

  await supabase
    .from("portal_parent_portal_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", sess.id);

  const parentPersonId = String(sess.parent_person_id || "");

  const { data: contacts, error: contactsErr } = await supabase
    .from("portal_parent_contacts")
    .select(
      "contact_id, child_display, child_first_name, child_last_name, dob_iso, in_class, on_waiting_list, city, postcode",
    )
    .eq("parent_person_id", parentPersonId)
    .order("child_display", { ascending: true });

  if (contactsErr) {
    console.error("[parent-portal-home-load] contacts error", contactsErr);
    return parentPortalJsonInvalid(500);
  }

  const { data: parentMeta } = await supabase
    .from("portal_parent_contacts")
    .select("parent_display, email, mobile, address_line1, address_line2, city, postcode")
    .eq("parent_person_id", parentPersonId)
    .limit(1)
    .maybeSingle();

  const emailNorm = String(parentMeta?.email || "").trim().toLowerCase();
  const phone10 = normalizePhoneDigits(String(parentMeta?.mobile || ""));

  let messages: Record<string, unknown>[] = [];
  const msgSelect =
    "id, created_at, kind, channel, client_display, subject, body_text, email_status, whatsapp_status, session_date, venue";

  if (emailNorm) {
    const { data: byEmail } = await supabase
      .from("portal_parent_notify_log")
      .select(msgSelect)
      .ilike("parent_email", emailNorm)
      .order("created_at", { ascending: false })
      .limit(20);
    messages = byEmail || [];
  }

  if (phone10) {
    const { data: byPhone } = await supabase
      .from("portal_parent_notify_log")
      .select(msgSelect)
      .like("parent_phone", `%${phone10}`)
      .order("created_at", { ascending: false })
      .limit(20);
    const merged = [...messages, ...(byPhone || [])];
    const seen = new Set<string>();
    messages = merged.filter((row) => {
      const id = String(row.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    messages.sort(
      (a, b) =>
        new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime(),
    );
    messages = messages.slice(0, 20);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      session: { expires_at: sess.expires_at },
      parent: {
        parent_person_id: parentPersonId,
        display_name: parentMeta?.parent_display ?? null,
        email: parentMeta?.email ?? null,
        mobile: parentMeta?.mobile ?? null,
        address: {
          line1: parentMeta?.address_line1 ?? null,
          line2: parentMeta?.address_line2 ?? null,
          city: parentMeta?.city ?? null,
          postcode: parentMeta?.postcode ?? null,
        },
      },
      children: (contacts || []).map((c) => ({
        contact_id: c.contact_id,
        display_name: c.child_display,
        first_name: c.child_first_name,
        last_name: c.child_last_name,
        dob_iso: c.dob_iso,
        in_class: c.in_class,
        on_waiting_list: c.on_waiting_list,
        city: c.city,
        postcode: c.postcode,
      })),
      messages,
    }),
    { status: 200, headers: { ...parentPortalCorsHeaders, "Content-Type": "application/json" } },
  );
});
