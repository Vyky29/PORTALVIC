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

type NotifyChannel = "email" | "whatsapp" | "both";

type NotifyBody = {
  kind?: unknown;
  channel?: unknown;
  parentName?: unknown;
  parentEmail?: unknown;
  parentWhatsapp?: unknown;
  subject?: unknown;
  body?: unknown;
  clientDisplay?: unknown;
  sessionDate?: unknown;
  slotId?: unknown;
  venue?: unknown;
  instructorPhotoUrl?: unknown;
  instructorPhotoName?: unknown;
  contextWaId?: unknown;
};

function str(v: unknown, max = 8000): string {
  return String(v ?? "").trim().slice(0, max);
}

function parseChannel(v: unknown): NotifyChannel | null {
  const c = str(v, 16).toLowerCase();
  if (c === "email" || c === "whatsapp" || c === "both") return c;
  return null;
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
  const parentEmail = str(payload.parentEmail, 320).toLowerCase();
  const parentPhoneRaw = str(payload.parentWhatsapp, 40);
  const parentPhone = normalizeParentPhoneE164(parentPhoneRaw);

  if (!channel) {
    return portalAdminJson(400, { ok: false, error: "invalid_channel" });
  }
  if (!bodyText) {
    return portalAdminJson(400, { ok: false, error: "empty_body" });
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
  const notifyKind = str(payload.kind, 64).toLowerCase();
  const instructorPhotoUrl = normalizePublicPhotoUrl(str(payload.instructorPhotoUrl, 500));
  const instructorPhotoName = str(payload.instructorPhotoName, 120);

  let emailStatus = channel === "whatsapp" ? "skipped" : "pending";
  let whatsappStatus = channel === "email" ? "skipped" : "pending";
  let emailMessageId = "";
  let whatsappMessageId = "";
  const errors: string[] = [];

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

  if (channel === "whatsapp" || channel === "both") {
    const contextWaId = str(payload.contextWaId, 200);
    const waOpts = notifyKind === "whatsapp_test"
      ? { templateName: "hello_world", templateLang: "en_US" }
      : {
        kind: notifyKind,
        instructorPhotoUrl: instructorPhotoUrl || undefined,
        instructorPhotoName: instructorPhotoName || undefined,
        contextWaId: contextWaId || undefined,
      };
    const sent = await sendParentMobileMessage(parentPhone!, bodyText, waOpts);
    if (sent.ok) {
      whatsappStatus = sent.channel === "sms" ? "sent_sms" : "sent";
      whatsappMessageId = sent.id;
    } else {
      whatsappStatus = "failed";
      errors.push(sent.error);
    }
  }

  const anySent = emailStatus === "sent" || whatsappStatus === "sent" ||
    whatsappStatus === "sent_sms";
  const allFailed = !anySent;

  const admin = createClient(baseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const sessionDate = str(payload.sessionDate, 10);
  const logRow = {
    sent_by_user_id: verified.userId,
    sent_by_email: verified.email,
    kind: str(payload.kind, 64) || "custom",
    channel,
    client_display: str(payload.clientDisplay, 200) || null,
    parent_name: str(payload.parentName, 200) || null,
    parent_email: parentEmail || null,
    parent_phone: parentPhoneRaw || null,
    session_date: /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) ? sessionDate : null,
    slot_id: str(payload.slotId, 120) || null,
    venue: str(payload.venue, 200) || null,
    subject: subject || null,
    body_text: bodyText,
    email_status: emailStatus,
    whatsapp_status: whatsappStatus,
    resend_id: emailMessageId || null,
    whatsapp_message_id: whatsappMessageId || null,
    error_detail: errors.length ? errors.join(" | ").slice(0, 2000) : null,
    meta: {
      parent_email_masked: parentEmail ? maskEmailForLog(parentEmail) : null,
      parent_phone_masked: parentPhone ? maskPhoneForLog(parentPhone) : null,
      email_provider: "smtp",
      instructor_photo_url: instructorPhotoUrl || null,
      instructor_photo_name: instructorPhotoName || null,
    },
  };

  const { data: inserted, error: logErr } = await admin
    .from("portal_parent_notify_log")
    .insert(logRow)
    .select("id")
    .maybeSingle();

  if (logErr) {
    console.error("[portal-parent-notify-send] audit insert failed", logErr.message);
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
    email: { status: emailStatus, id: emailMessageId || undefined },
    whatsapp: { status: whatsappStatus, id: whatsappMessageId || undefined },
    partial: errors.length > 0,
    warnings: errors.length ? errors : undefined,
  });
});
