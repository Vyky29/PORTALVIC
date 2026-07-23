// portal-parent-notify-send
// -------------------------
// Admin-only: send a parent/carer message via Google Workspace SMTP (email)
// and/or WhatsApp Cloud API.
//
// POST JSON:
// {
//   kind: "payment_due" | "instructor_change" | string,
//   channel: "email" | "whatsapp" | "both",
//   parentName?: string,
//   parentEmail?: string,
//   parentWhatsapp?: string,
//   subject: string,
//   body: string,
//   clientDisplay?: string,
//   sessionDate?: "YYYY-MM-DD",
//   slotId?: string,
//   venue?: string,
//   instructorPhotoUrl?: string,
//   instructorPhotoName?: string
// }
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto)
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
//   PORTAL_MAIL_REPLY_TO — optional reply-to (info@)
//   META_WHATSAPP_TOKEN, META_WHATSAPP_PHONE_NUMBER_ID
//   PORTAL_PARENT_NOTIFY_WHATSAPP_TEMPLATE — optional approved template for cold outbound
//   TWILIO_* — SMS fallback when WhatsApp fails

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import {
  maskEmailForLog,
  maskPhoneForLog,
  normalizeParentPhoneE164,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMobileMessage,
  normalizePublicPhotoUrl,
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
import { notifyFamilyWebPushForParentNotify } from "../_shared/portal_family_webpush_notify.ts";
import { isFamilyPushNotifyKind } from "../_shared/portal_webpush_util.ts";

type NotifyChannel = "email" | "whatsapp" | "both";

type NotifyBody = {
  kind?: unknown;
  channel?: unknown;
  parentName?: unknown;
  parentEmail?: unknown;
  parentWhatsapp?: unknown;
  subject?: unknown;
  body?: unknown;
  whatsappBody?: unknown;
  clientDisplay?: unknown;
  sessionDate?: unknown;
  slotId?: unknown;
  venue?: unknown;
  instructorPhotoUrl?: unknown;
  instructorPhotoName?: unknown;
  contextWaId?: unknown;
  mediaBase64?: unknown;
  mediaMime?: unknown;
  mediaFilename?: unknown;
  /** Original WhatsApp wamid to quote-correct (Cloud API cannot rewrite bubbles). */
  editWhatsappMessageId?: unknown;
  /** Portal notify log row whose body should show the corrected text. */
  replacesLogId?: unknown;
};

function str(v: unknown, max = 8000): string {
  return String(v ?? "").trim().slice(0, max);
}

function parseChannel(v: unknown): NotifyChannel | null {
  const c = str(v, 16).toLowerCase();
  if (c === "email" || c === "whatsapp" || c === "both") return c;
  return null;
}

async function latestOpenParentWhatsappSession(
  admin: ReturnType<typeof createClient<any>>,
  phoneE164: string,
): Promise<{ open: boolean; contextWaId: string }> {
  const target = normalizeParentPhoneE164(phoneE164);
  if (!target) return { open: false, contextWaId: "" };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("portal_parent_whatsapp_inbound")
    .select("wa_message_id, from_phone, meta, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data || []) as Array<{
    wa_message_id?: string | null;
    from_phone?: string | null;
    meta?: unknown;
  }>;
  for (const row of rows) {
    if (normalizeParentPhoneE164(String(row.from_phone || "")) !== target) continue;
    const waId = String(row.wa_message_id || "").trim();
    if (!waId || waId.startsWith("app:")) continue;
    const meta =
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {};
    const source = String(meta.source || "").trim().toLowerCase();
    if (source === "parent_portal" || source === "portal") continue;
    return { open: true, contextWaId: waId };
  }
  return { open: false, contextWaId: "" };
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

  const baseUrl = str(Deno.env.get("SUPABASE_URL"), 300);
  const serviceRole = str(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 500);
  if (!baseUrl || !serviceRole) {
    return portalAdminJson(500, { ok: false, error: "server_misconfigured" });
  }

  let payload: NotifyBody;
  try {
    payload = await req.json();
  } catch {
    return portalAdminJson(400, { ok: false, error: "invalid_json" });
  }

  const channel = parseChannel(payload.channel);
  const subject = str(payload.subject, 500);
  const bodyText = str(payload.body, 12000);
  // Optional separate WhatsApp text (short) — falls back to the email body.
  const whatsappBodyText = str(payload.whatsappBody, 4096) || bodyText;
  const parentEmail = str(payload.parentEmail, 320).toLowerCase();
  const parentPhoneRaw = str(payload.parentWhatsapp, 40);
  const parentPhone = normalizeParentPhoneE164(parentPhoneRaw);
  const mediaMime = str(payload.mediaMime, 120).toLowerCase();
  const mediaFilename = str(payload.mediaFilename, 180);
  const mediaB64 = str(payload.mediaBase64, 8_000_000);
  const hasMedia = !!mediaB64 && !!mediaMime;

  if (!channel) {
    return portalAdminJson(400, { ok: false, error: "invalid_channel" });
  }
  if (!bodyText) {
    if (!hasMedia) return portalAdminJson(400, { ok: false, error: "empty_body" });
  }
  if ((channel === "email" || channel === "both") && !parentEmail) {
    return portalAdminJson(400, { ok: false, error: "missing_parent_email" });
  }
  if ((channel === "whatsapp" || channel === "both") && !parentPhone) {
    return portalAdminJson(400, { ok: false, error: "missing_parent_whatsapp" });
  }
  if ((channel === "email" || channel === "both") && !subject) {
    return portalAdminJson(400, { ok: false, error: "missing_subject" });
  }

  const smtpConfig = readParentNotifySmtpConfig();
  const replyTo = str(Deno.env.get("PORTAL_MAIL_REPLY_TO"), 320);
  let notifyKind = str(payload.kind, 64).toLowerCase();
  const instructorPhotoUrl = normalizePublicPhotoUrl(str(payload.instructorPhotoUrl, 500));
  const instructorPhotoName = str(payload.instructorPhotoName, 120);
  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let openSession = false;
  let contextWaId = str(payload.contextWaId, 200);
  if (hasMedia) {
    if (channel === "email") {
      return portalAdminJson(400, { ok: false, error: "media_requires_whatsapp" });
    }
    const session = await latestOpenParentWhatsappSession(admin, parentPhone || "");
    openSession = session.open;
    if (!contextWaId && session.contextWaId) contextWaId = session.contextWaId;
    if (!openSession) {
      return portalAdminJson(409, {
        ok: false,
        error: "media_requires_open_whatsapp_session",
        message: "The parent must message the API number first; WhatsApp only permits media inside the 24-hour reply window.",
      });
    }
  }

  let emailStatus = channel === "whatsapp" ? "skipped" : "pending";
  let whatsappStatus = channel === "email" ? "skipped" : "pending";
  let emailMessageId = "";
  let whatsappMessageId = "";
  const errors: string[] = [];
  let messageType = "text";
  let mediaPath: string | null = null;
  let storedMime: string | null = null;

  if (channel === "email" || channel === "both") {
    if (!smtpConfig) {
      emailStatus = "failed";
      errors.push("smtp_not_configured");
    } else {
      const sent = await sendParentEmailViaSmtp({
        config: smtpConfig,
        replyTo: replyTo || undefined,
        to: parentEmail,
        subject,
        bodyText,
        instructorPhotoUrl: instructorPhotoUrl || undefined,
        instructorPhotoName: instructorPhotoName || undefined,
      });
      if (sent.ok) {
        emailStatus = "sent";
        emailMessageId = sent.id;
      } else {
        emailStatus = "failed";
        errors.push(sent.error);
      }
    }
  }

  /** When set, we quote-correct the original WA message (Cloud API cannot rewrite bubbles). */
  let correctionOfWaId = "";
  let replacesLogId = "";
  if (channel === "whatsapp" || channel === "both") {
    const editWaId = str(payload.editWhatsappMessageId, 200);
    replacesLogId = str(payload.replacesLogId, 80);
    if (editWaId && !hasMedia && channel === "whatsapp") {
      // Meta Cloud API cannot edit a sent business bubble. Always send a free-text
      // correction that quotes the original wamid, then update the portal log row.
      correctionOfWaId = editWaId;
      // Must quote the bubble being corrected (not some other open-session inbound).
      contextWaId = editWaId;
      notifyKind = "custom";
    }
    if (hasMedia) {
      const bytes = decodeBase64Payload(mediaB64);
      if (!bytes?.length) {
        return portalAdminJson(400, { ok: false, error: "invalid_media" });
      }
      if (bytes.length > WHATSAPP_MEDIA_MAX_BYTES) {
        return portalAdminJson(400, {
          ok: false,
          error: "media_too_large",
          maxBytes: WHATSAPP_MEDIA_MAX_BYTES,
        });
      }
      const waKind = classifyWhatsappMediaMime(mediaMime);
      messageType = waKind;
      storedMime = mediaMime.split(";")[0] || mediaMime;
      const ext = extForMime(storedMime, waKind);
      const safeName = (mediaFilename || `file.${ext}`)
        .replace(/[^\w.\-]+/g, "_")
        .slice(0, 120);
      mediaPath = `parent-out/${crypto.randomUUID()}.${ext}`;
      const stored = await admin.storage.from("wa-inbound-media").upload(mediaPath, bytes, {
        contentType: storedMime,
        upsert: false,
      });
      if (stored.error) {
        console.error("[portal-parent-notify-send] media store failed", stored.error.message);
        return portalAdminJson(500, { ok: false, error: "media_store_failed" });
      }
      const uploaded = await uploadWhatsappMediaBinary(bytes, storedMime, safeName);
      if (!uploaded.ok) {
        await admin.storage.from("wa-inbound-media").remove([mediaPath]);
        return portalAdminJson(502, { ok: false, error: uploaded.error });
      }
      const mediaSent = await sendWhatsappMediaById(parentPhone!, waKind, uploaded.id, {
        caption: bodyText || undefined,
        filename: safeName,
        contextWaId: contextWaId || undefined,
      });
      if (mediaSent.ok) {
        whatsappStatus = "sent";
        whatsappMessageId = mediaSent.id;
      } else {
        whatsappStatus = "failed";
        errors.push(mediaSent.error);
      }
    } else {
      // Free-text (custom/reply) only works inside Meta's 24h session window.
      // Cold outbound without context must use an approved template
      // (contact_update = Hello…, contact_update_urgent = Urgent information…).
      let effectiveKind = notifyKind;
      if (
        (notifyKind === "custom" || notifyKind === "reply" || notifyKind === "whatsapp_reply") &&
        !contextWaId
      ) {
        effectiveKind = "contact_update";
      }
      const coldRetryKind =
        effectiveKind === "contact_update_urgent"
          ? "contact_update_urgent"
          : "contact_update";
      const waOpts = notifyKind === "whatsapp_test"
        ? { templateName: "hello_world", templateLang: "en_US" }
        : {
          kind: effectiveKind,
          instructorPhotoUrl: instructorPhotoUrl || undefined,
          instructorPhotoName: instructorPhotoName || undefined,
          contextWaId: contextWaId || undefined,
        };
      let sent = await sendParentMobileMessage(parentPhone!, whatsappBodyText, waOpts);
      // If free-text was rejected for re-engagement, retry once with the template.
      if (
        !sent.ok &&
        (notifyKind === "custom" || notifyKind === "reply" || notifyKind === "whatsapp_reply") &&
        /131047|re-engagement/i.test(String(sent.error || ""))
      ) {
        sent = await sendParentMobileMessage(parentPhone!, whatsappBodyText, {
          kind: coldRetryKind,
          instructorPhotoUrl: instructorPhotoUrl || undefined,
          instructorPhotoName: instructorPhotoName || undefined,
        });
      }
      if (sent.ok) {
        whatsappStatus = sent.channel === "sms" ? "sent_sms" : "sent";
        whatsappMessageId = sent.id;
      } else {
        whatsappStatus = "failed";
        errors.push(sent.error);
      }
    }
  }

  const anySent = emailStatus === "sent" || whatsappStatus === "sent" ||
    whatsappStatus === "sent_sms";
  const allFailed = !anySent;

  const sessionDate = str(payload.sessionDate, 10);
  const logRow = {
    sent_by_user_id: verified.userId,
    sent_by_email: verified.email,
    kind: str(payload.kind, 64) || "custom",
    channel,
    client_display: str(payload.clientDisplay, 200) || null,
    parent_name: str(payload.parentName, 200) || null,
    parent_email: parentEmail || null,
    parent_phone: parentPhone || parentPhoneRaw || null,
    session_date: /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) ? sessionDate : null,
    slot_id: str(payload.slotId, 120) || null,
    venue: str(payload.venue, 200) || null,
    subject: subject || null,
    body_text: bodyText || (hasMedia ? mediaPlaceholderBody(classifyWhatsappMediaMime(mediaMime)) : ""),
    message_type: messageType,
    media_path: mediaPath,
    media_mime: storedMime,
    email_status: emailStatus,
    whatsapp_status: whatsappStatus,
    resend_id: emailMessageId || null,
    whatsapp_message_id: whatsappMessageId || null,
    error_detail: errors.length ? errors.join(" | ").slice(0, 2000) : null,
    meta: {
      parent_email_masked: parentEmail ? maskEmailForLog(parentEmail) : null,
      parent_phone_masked: parentPhone ? maskPhoneForLog(parentPhone) : null,
      parent_phone_raw: parentPhoneRaw || null,
      email_provider: "smtp",
      instructor_photo_url: instructorPhotoUrl || null,
      instructor_photo_name: instructorPhotoName || null,
      media_filename: mediaFilename || null,
      open_session: hasMedia ? openSession : null,
      context_wa_id: contextWaId || null,
    },
  };

  if (correctionOfWaId) {
    (logRow.meta as Record<string, unknown>).correction_of_wa_id = correctionOfWaId;
    (logRow.meta as Record<string, unknown>).replaces_log_id = replacesLogId || null;
  }

  const { data: inserted, error: logErr } = await admin
    .from("portal_parent_notify_log")
    .insert(logRow)
    .select("id")
    .maybeSingle();

  if (logErr) {
    console.error("[portal-parent-notify-send] audit insert failed", logErr.message);
  }

  // Quote-correction: refresh the original bubble body in the portal thread.
  if (
    !allFailed &&
    replacesLogId &&
    correctionOfWaId &&
    (whatsappStatus === "sent" || whatsappStatus === "sent_sms")
  ) {
    const { data: prev } = await admin
      .from("portal_parent_notify_log")
      .select("id, meta, body_text")
      .eq("id", replacesLogId)
      .maybeSingle();
    if (prev?.id) {
      const prevMeta =
        prev.meta && typeof prev.meta === "object" && !Array.isArray(prev.meta)
          ? { ...(prev.meta as Record<string, unknown>) }
          : {};
      prevMeta.edited_at = new Date().toISOString();
      prevMeta.edited_by_email = verified.email || null;
      prevMeta.previous_body_text = String(prev.body_text || "").slice(0, 4000);
      prevMeta.correction_log_id = inserted?.id || null;
      prevMeta.correction_wa_id = whatsappMessageId || null;
      prevMeta.correction_mode = "quoted_reply";
      await admin
        .from("portal_parent_notify_log")
        .update({
          body_text: bodyText || whatsappBodyText,
          error_detail: null,
          meta: prevMeta,
        })
        .eq("id", replacesLogId);
    }
  }

  // Family Web Push is additive (WhatsApp/email unchanged). Fire for hub alert kinds
  // even when email/WhatsApp partially failed, as long as a notify log row exists.
  if (inserted?.id && isFamilyPushNotifyKind(logRow.kind)) {
    void notifyFamilyWebPushForParentNotify({
      notifyLogId: String(inserted.id),
      kind: String(logRow.kind),
    });
  }

  if (allFailed) {
    return portalAdminJson(502, {
      ok: false,
      error: errors[0] || "send_failed",
      logId: inserted?.id || null,
      email: { status: emailStatus },
      whatsapp: { status: whatsappStatus },
    });
  }

  return portalAdminJson(200, {
    ok: true,
    logId: inserted?.id || null,
    corrected: !!correctionOfWaId,
    quoted: !!correctionOfWaId,
    edited: false,
    email: { status: emailStatus, id: emailMessageId || undefined },
    whatsapp: { status: whatsappStatus, id: whatsappMessageId || undefined },
    partial: errors.length > 0,
    warnings: errors.length ? errors : undefined,
  });
});
