// portal-staff-message-send
// -------------------------
// Leader replies from staff dashboard — stored in portal_staff_whatsapp_inbound
// (same thread admin sees in Leader WhatsApp). Does not require Meta outbound.
//
// Auth: Bearer staff JWT (leader allowlist).
// Body: { message: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
} from "../_shared/portal_admin_auth.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";
import {
  isPortalStaffWhatsappLeaderKey,
  normalizeStaffUsernameKey,
} from "../_shared/portal_staff_whatsapp.ts";
import { notifyAdminsStaffWhatsappReply } from "../_shared/portal_staff_whatsapp_admin_push.ts";

function str(v: unknown, max = 4000): string {
  return String(v ?? "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "")
    .trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  const authHeader = str(req.headers.get("Authorization"), 2000);
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return portalAdminJson(401, { ok: false, error: "missing_bearer" });
  }
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return portalAdminJson(401, { ok: false, error: "missing_bearer" });

  const userClient = createClient(baseUrl, anon || serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
  if (userErr || !userData?.user?.id) {
    return portalAdminJson(401, { ok: false, error: "invalid_session" });
  }
  const userId = String(userData.user.id);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "invalid_json" });
  }

  const message = str(payload.message || payload.body, 4000);
  if (!message) {
    return portalAdminJson(400, { ok: false, error: "empty_body" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: me } = await admin
    .from("staff_profiles")
    .select("id, username, full_name, phone_e164")
    .eq("id", userId)
    .maybeSingle();

  if (!me || !isPortalStaffWhatsappLeaderKey(String(me.username || ""))) {
    return portalAdminJson(403, { ok: false, error: "not_leader" });
  }

  const phone = normalizeParentPhoneE164(String(me.phone_e164 || "")) ||
    `staff:${normalizeStaffUsernameKey(String(me.username || ""))}`;
  const display = String(me.full_name || me.username || "Leader").trim();
  const waMessageId = `app:staff:${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const row = {
    wa_message_id: waMessageId,
    from_phone: phone,
    staff_profile_id: me.id,
    staff_username: normalizeStaffUsernameKey(String(me.username || "")),
    contact_name: display,
    message_type: "text",
    body_text: message,
    context_wa_id: null,
    created_at: now,
    meta: {
      source: "staff_portal",
      staff_profile_id: me.id,
    },
  };

  const { data: inserted, error } = await admin
    .from("portal_staff_whatsapp_inbound")
    .insert(row)
    .select("id, created_at, body_text")
    .maybeSingle();

  if (error) {
    console.error("[portal-staff-message-send] insert failed", error.message);
    return portalAdminJson(500, { ok: false, error: "insert_failed" });
  }

  if (inserted?.id) {
    await notifyAdminsStaffWhatsappReply({
      id: String(inserted.id),
      staff_profile_id: String(me.id),
      staff_username: normalizeStaffUsernameKey(String(me.username || "")),
      body_text: String(inserted.body_text || message),
      created_at: String(inserted.created_at || now),
    });
  }

  return portalAdminJson(200, {
    ok: true,
    message: {
      id: inserted?.id || null,
      direction: "inbound",
      created_at: inserted?.created_at || now,
      body_text: inserted?.body_text || message,
    },
  });
});
