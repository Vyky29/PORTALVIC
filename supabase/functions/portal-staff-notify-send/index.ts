// portal-staff-notify-send
// ------------------------
// Admin-only: WhatsApp (Meta Cloud API) to staff leaders.
// Reuses Meta/Twilio helpers from portal_parent_messaging; writes portal_staff_notify_log.
//
// POST JSON:
// {
//   staffUsername: "victor" | "berta" | ...,
//   body: string,
//   kind?: string,
//   contextWaId?: string
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

  if (!isPortalStaffWhatsappLeaderKey(staffUsername)) {
    return portalAdminJson(400, { ok: false, error: "not_a_leader", staffUsername });
  }
  if (!bodyText) {
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

  const waOpts = kind === "whatsapp_test"
    ? { templateName: "hello_world", templateLang: "en_US" }
    : {
      kind,
      contextWaId: contextWaId || undefined,
    };

  const sent = await sendParentMobileMessage(phone, bodyText, waOpts);
  let whatsappStatus = "pending";
  let whatsappMessageId = "";
  let errorDetail: string | null = null;

  if (sent.ok) {
    whatsappStatus = sent.channel === "sms" ? "sent_sms" : "sent";
    whatsappMessageId = sent.id;
  } else {
    whatsappStatus = "failed";
    errorDetail = sent.error;
  }

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
    body_text: bodyText,
    whatsapp_status: whatsappStatus,
    whatsapp_message_id: whatsappMessageId || null,
    error_detail: errorDetail,
    meta: {
      staff_phone_masked: maskPhoneForLog(phone),
      context_wa_id: contextWaId || null,
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

  // Instant portal alert for the leader (same idea as admin toast on reply).
  await pushStaffLeaderWhatsappMessage(admin, {
    staffProfileId: leader.id,
    staffUsername: normalizeStaffUsernameKey(leader.username),
    bodyText,
    logId: inserted?.id || null,
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
