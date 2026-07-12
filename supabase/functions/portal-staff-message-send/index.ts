// portal-staff-message-send
// -------------------------
// Leader replies from staff dashboard — stored in portal_staff_whatsapp_inbound
// (same thread admin sees in Leader WhatsApp). Does not require Meta outbound.
//
// Auth: Bearer staff JWT (leader allowlist).
// Body: { message?: string, mediaBase64?: string, mediaMime?: string, mediaFilename?: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
} from "../_shared/portal_admin_auth.ts";
import { normalizeParentPhoneE164 } from "../_shared/portal_parent_messaging.ts";
import {
  classifyWhatsappMediaMime,
  decodeBase64Payload,
  extForMime,
  mediaPlaceholderBody,
  WHATSAPP_MEDIA_MAX_BYTES,
} from "../_shared/portal_whatsapp_media.ts";
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
  const mediaMime = str(payload.mediaMime || payload.mime, 120).toLowerCase();
  const mediaFilename = str(payload.mediaFilename || payload.filename, 180);
  const mediaB64 = str(payload.mediaBase64 || payload.media, 8_000_000);
  const hasMedia = !!mediaB64 && !!mediaMime;

  if (!message && !hasMedia) {
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

  let messageType = "text";
  let mediaPath: string | null = null;
  let storedMime: string | null = null;
  let bodyText = message;

  if (hasMedia) {
    const bytes = decodeBase64Payload(mediaB64);
    if (!bytes || !bytes.length) {
      return portalAdminJson(400, { ok: false, error: "invalid_media" });
    }
    if (bytes.length > WHATSAPP_MEDIA_MAX_BYTES) {
      return portalAdminJson(400, { ok: false, error: "media_too_large" });
    }
    const waKind = classifyWhatsappMediaMime(mediaMime);
    messageType = waKind;
    storedMime = mediaMime.split(";")[0] || mediaMime;
    const ext = extForMime(storedMime, waKind);
    mediaPath = `staff-in/${crypto.randomUUID()}.${ext}`;
    const up = await admin.storage.from("wa-inbound-media").upload(mediaPath, bytes, {
      contentType: storedMime,
      upsert: false,
    });
    if (up.error) {
      console.error("[portal-staff-message-send] storage upload failed", up.error.message);
      return portalAdminJson(500, { ok: false, error: "media_store_failed" });
    }
    if (!bodyText) bodyText = mediaPlaceholderBody(waKind);
  }

  const row = {
    wa_message_id: waMessageId,
    from_phone: phone,
    staff_profile_id: me.id,
    staff_username: normalizeStaffUsernameKey(String(me.username || "")),
    contact_name: display,
    message_type: messageType,
    body_text: bodyText,
    context_wa_id: null,
    media_path: mediaPath,
    media_mime: storedMime,
    created_at: now,
    meta: {
      source: "staff_portal",
      staff_profile_id: me.id,
      media_filename: mediaFilename || null,
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
      body_text: String(inserted.body_text || bodyText),
      created_at: String(inserted.created_at || now),
    });
  }

  return portalAdminJson(200, {
    ok: true,
    message: {
      id: inserted?.id || null,
      direction: "inbound",
      created_at: inserted?.created_at || now,
      body_text: inserted?.body_text || bodyText,
      message_type: messageType,
      media_path: mediaPath,
      media_mime: storedMime,
    },
  });
});
