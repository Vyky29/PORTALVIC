// @ts-nocheck — Edge Function (Deno).
//
// portal-push-dispatch-parent-notify
// ----------------------------------
// Send Family Web Push after portal_parent_notify_log insert (messages + session
// changes + other parent-facing kinds). WhatsApp/email stay unchanged.
// Auth: x-portal-webhook-secret (PORTAL_PUSH_WEBHOOK_SECRET).
//
// Body: { notify_log_id } or webhook-style { record: { id, ... } }
// Secrets: VAPID_*, SUPABASE_*, PORTAL_PUSH_WEBHOOK_SECRET, PORTAL_PUSH_FAMILY_OPEN_URL

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clampPushBody,
  familyPushOpenBase,
  familyPushPortalOpenForKind,
  initVapidFromEnv,
  insertFamilyNotifyDedupeOrSkip,
  isFamilyPushNotifyKind,
  jsonPushResponse,
  PORTAL_PUSH_CORS_HEADERS,
  resolveParentPersonIdsForNotifyLog,
  sendPushPayloadToFamilyParentIds,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";

const FAMILY_ALERT_VIBRATE = [200, 80, 200, 80, 280, 100, 200];

function hubKindTitle(kind: string): string {
  const k = String(kind || "").toLowerCase();
  if (k === "instructor_change" || k === "instructor_reassign") {
    return "Instructor update";
  }
  if (k === "session_cancelled") return "Session cancelled";
  if (k === "absence_announced") return "Absence noted";
  if (k === "custom") return "New message";
  if (k === "weekly_note") return "Weekly note";
  if (k === "makeup_scheduled") return "Make-up session";
  if (k === "trial_scheduled") return "Trial session";
  if (k === "booking_confirmation") return "Booking confirmation";
  if (k === "payment_due") return "Payment reminder";
  if (k.includes("gocardless")) return "Payment update";
  if (k.includes("pay_hold") || k.includes("booking") || k.includes("finish")) {
    return "Booking update";
  }
  if (k.includes("contact_update")) return "Club message";
  return "Club update";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: PORTAL_PUSH_CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: PORTAL_PUSH_CORS_HEADERS,
    });
  }

  const forbidden = verifyPortalPushWebhook(req);
  if (forbidden) return forbidden;

  if (!initVapidFromEnv()) {
    return jsonPushResponse({ ok: false, error: "vapid_missing" }, 500);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonPushResponse({ ok: false, error: "server_misconfigured" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return jsonPushResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const record = (body.record && typeof body.record === "object")
    ? body.record as Record<string, unknown>
    : null;
  const notifyLogId = String(
    body.notify_log_id || body.id || record?.id || "",
  ).trim();
  if (!notifyLogId) {
    return jsonPushResponse({ ok: false, error: "missing_notify_log_id" }, 400);
  }

  let row: Record<string, unknown> | null = record;
  if (!row || !row.kind) {
    const { data, error } = await admin
      .from("portal_parent_notify_log")
      .select(
        "id, kind, channel, subject, body_text, client_display, parent_email, parent_phone, session_date, venue",
      )
      .eq("id", notifyLogId)
      .maybeSingle();
    if (error || !data) {
      console.warn("[portal-push-dispatch-parent-notify] log missing", notifyLogId, error);
      return jsonPushResponse({ ok: false, error: "notify_log_not_found" }, 404);
    }
    row = data as Record<string, unknown>;
  }

  const kind = String(row.kind || "").trim().toLowerCase();
  const channel = String(row.channel || "").trim().toLowerCase();
  if (channel === "office" || !isFamilyPushNotifyKind(kind)) {
    return jsonPushResponse({ ok: true, skipped: "kind_not_pushable", kind, channel });
  }

  const dedupe = await insertFamilyNotifyDedupeOrSkip(admin, notifyLogId);
  if (dedupe === "duplicate") {
    return jsonPushResponse({ ok: true, skipped: "already_sent" });
  }
  if (dedupe === "error") {
    return jsonPushResponse({ ok: false, error: "dedupe_failed" }, 500);
  }

  const parentIds = await resolveParentPersonIdsForNotifyLog(admin, {
    parent_email: row.parent_email != null ? String(row.parent_email) : null,
    parent_phone: row.parent_phone != null ? String(row.parent_phone) : null,
    client_display: row.client_display != null ? String(row.client_display) : null,
  });

  if (!parentIds.length) {
    console.log("[portal-push-dispatch-parent-notify] no parent match", {
      notifyLogId,
      kind,
    });
    return jsonPushResponse({ ok: true, skipped: "no_parent_match", sent: 0 });
  }

  const openBase = familyPushOpenBase();
  const portalOpen = familyPushPortalOpenForKind(kind);
  const openUrl = `${openBase}${openBase.includes("?") ? "&" : "?"}view=${portalOpen}`;
  const child = String(row.client_display || "").trim();
  const bodyText = clampPushBody(
    String(row.body_text || row.subject || "").trim() || hubKindTitle(kind),
  );
  const title = child
    ? `${hubKindTitle(kind)} - ${child}`
    : hubKindTitle(kind);

  const payload = JSON.stringify({
    title,
    body: bodyText,
    url: openUrl,
    portalOpen,
    tag: `family-notify-${notifyLogId}`,
    requireInteraction: true,
    vibrate: FAMILY_ALERT_VIBRATE,
    appBadge: 1,
  });

  try {
    const result = await sendPushPayloadToFamilyParentIds(admin, parentIds, payload, {
      TTL: 86400,
      urgency: "high",
      topic: `fam-${kind}`.slice(0, 32),
    });
    console.log("[portal-push-dispatch-parent-notify] sent", {
      notifyLogId,
      kind,
      parentIds,
      ...result,
    });
    return jsonPushResponse({ ok: true, ...result, parentIds });
  } catch (e) {
    console.error("[portal-push-dispatch-parent-notify] send", e);
    return jsonPushResponse({ ok: false, error: "send_failed" }, 500);
  }
});
