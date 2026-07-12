// portal-staff-notify-send
// ------------------------
// Admin-only: WhatsApp (Meta Cloud API) to staff leaders.
// Reuses Meta/Twilio helpers from portal_parent_messaging; writes portal_staff_notify_log.
//
// POST JSON:
// {
//   staffUsername: "victor" | "berta" | ...,
//   body?: string,
//   kind?: string,
//   contextWaId?: string,
//   mediaBase64?: string,
//   mediaMime?: string,
//   mediaFilename?: string
// }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  maskPhoneForLog,
  normalizeParentPhoneE164,
  sendParentMobileMessage,
} from "../_shared/portal_parent_messaging.ts";
import {
  classifyWhatsappMediaMime,
  decodeBase64Payload,
  extForMime,
  mediaPlaceholderBody,
  sendWhatsappMediaById,
  uploadWhatsappMediaBinary,
  WHATSAPP_MEDIA_MAX_BYTES,
} from "../_shared/portal_whatsapp_media.ts";
import {
  findStaffLeaderByUsername,
  isPortalStaffWhatsappLeaderKey,
  normalizeStaffUsernameKey,
} from "../_shared/portal_staff_whatsapp.ts";
import { pushStaffLeaderWhatsappMessage } from "../_shared/portal_staff_whatsapp_staff_push.ts";

function str(v: unknown, max = 8000): string {
  return String(v ?? "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: portalAdminCorsHeaders() });
  }
  if (req.method !== "POST") {
    return portalAdminJson(405, { ok: false, error: "method_not_allowed" });
  }

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) {
    return portalAdminJson(verified.status, { ok: false, error: verified.error });
  }

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "invalid_json" });
  }

  const staffUsername = normalizeStaffUsernameKey(str(payload.staffUsername || payload.staffKey, 64));
  const bodyText = str(payload.body || payload.whatsappBody, 4096);
  const kind = str(payload.kind, 64).toLowerCase() || "staff_message";
  const contextWaId = str(payload.contextWaId, 200);
  const mediaMime = str(payload.mediaMime || payload.mime, 120).toLowerCase();
  const mediaFilename = str(payload.mediaFilename || payload.filename, 180);
  const mediaB64 = str(payload.mediaBase64 || payload.media, 8_000_000);

  if (!isPortalStaffWhatsappLeaderKey(staffUsername)) {
    return portalAdminJson(400, { ok: false, error: "not_a_leader", staffUsername });
  }

  const hasMedia = !!mediaB64 && !!mediaMime;
  if (!bodyText && !hasMedia) {
    return portalAdminJson(400, { ok: false, error: "empty_body" });
  }

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const leader = await findStaffLeaderByUsername(admin, staffUsername);
  if (!leader) {
    return portalAdminJson(404, { ok: false, error: "staff_not_found", staffUsername });
  }

  const phone = normalizeParentPhoneE164(String(leader.phone_e164 || ""));
  if (!phone) {
    return portalAdminJson(400, {
      ok: false,
      error: "missing_staff_phone",
      staffUsername,
      hint: "Set staff_profiles.phone_e164 for this leader (same number as WhatsApp).",
    });
  }

  let messageType = "text";
  let mediaPath: string | null = null;
  let storedMime: string | null = null;
  let sent: { ok: boolean; id?: string; channel?: string; error?: string };

  if (hasMedia) {
    const bytes = decodeBase64Payload(mediaB64);
    if (!bytes || !bytes.length) {
      return portalAdminJson(400, { ok: false, error: "invalid_media" });
    }
    if (bytes.length > WHATSAPP_MEDIA_MAX_BYTES) {
      return portalAdminJson(400, { ok: false, error: "media_too_large", maxBytes: WHATSAPP_MEDIA_MAX_BYTES });
    }
    const waKind = classifyWhatsappMediaMime(mediaMime);
    messageType = waKind;
    storedMime = mediaMime.split(";")[0] || mediaMime;
    const ext = extForMime(storedMime, waKind);
    const safeName = (mediaFilename || `file.${ext}`).replace(/[^\w.\-]+/g, "_").slice(0, 120);
    mediaPath = `staff-out/${crypto.randomUUID()}.${ext}`;

    const up = await admin.storage.from("wa-inbound-media").upload(mediaPath, bytes, {
      contentType: storedMime,
      upsert: false,
    });
    if (up.error) {
      console.error("[portal-staff-notify-send] storage upload failed", up.error.message);
      return portalAdminJson(500, { ok: false, error: "media_store_failed" });
    }

    const uploaded = await uploadWhatsappMediaBinary(bytes, storedMime, safeName);
    if (!uploaded.ok) {
      return portalAdminJson(502, { ok: false, error: uploaded.error });
    }
    sent = await sendWhatsappMediaById(phone, waKind, uploaded.id, {
      caption: bodyText || undefined,
      filename: safeName,
      contextWaId: contextWaId || undefined,
    });
  } else {
    const waOpts = kind === "whatsapp_test"
      ? { templateName: "hello_world", templateLang: "en_US" }
      : {
        kind,
        contextWaId: contextWaId || undefined,
      };
    sent = await sendParentMobileMessage(phone, bodyText, waOpts);
  }

  let whatsappStatus = "pending";
  let whatsappMessageId = "";
  let errorDetail: string | null = null;

  if (sent.ok) {
    whatsappStatus = sent.channel === "sms" ? "sent_sms" : "sent";
    whatsappMessageId = sent.id || "";
  } else {
    whatsappStatus = "failed";
    errorDetail = sent.error || "send_failed";
  }

  const logBody = bodyText ||
    (hasMedia ? mediaPlaceholderBody(classifyWhatsappMediaMime(mediaMime)) : "");

  const logRow = {
    sent_by_user_id: verified.userId,
    sent_by_email: verified.email,
    kind,
    channel: "whatsapp",
    staff_profile_id: leader.id,
    staff_username: normalizeStaffUsernameKey(leader.username),
    staff_display_name: leader.full_name || leader.username,
    staff_phone: phone,
    subject: null,
    body_text: logBody,
    message_type: messageType,
    media_path: mediaPath,
    media_mime: storedMime,
    whatsapp_status: whatsappStatus,
    whatsapp_message_id: whatsappMessageId || null,
    error_detail: errorDetail,
    meta: {
      staff_phone_masked: maskPhoneForLog(phone),
      context_wa_id: contextWaId || null,
      media_filename: mediaFilename || null,
    },
  };

  const { data: inserted, error: logErr } = await admin
    .from("portal_staff_notify_log")
    .insert(logRow)
    .select("id")
    .maybeSingle();

  if (logErr) {
    console.error("[portal-staff-notify-send] audit insert failed", logErr.message);
  }

  if (!sent.ok) {
    return portalAdminJson(502, {
      ok: false,
      error: errorDetail || "send_failed",
      logId: inserted?.id || null,
      whatsapp: { status: whatsappStatus },
    });
  }

  await pushStaffLeaderWhatsappMessage(admin, {
    staffProfileId: leader.id,
    staffUsername: normalizeStaffUsernameKey(leader.username),
    bodyText: logBody,
    logId: inserted?.id || null,
    senderUserId: verified.userId,
  });

  return portalAdminJson(200, {
    ok: true,
    logId: inserted?.id || null,
    staff: {
      id: leader.id,
      username: normalizeStaffUsernameKey(leader.username),
      displayName: leader.full_name || leader.username,
    },
    whatsapp: { status: whatsappStatus, id: whatsappMessageId || undefined },
  });
});
