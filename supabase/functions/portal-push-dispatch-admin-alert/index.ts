// @ts-nocheck — Edge Function (Deno). Admin/CEO Web Push for ops bell events.
//
// Mirrors in-app admin activity alerts (incident, cancellation, chat, late approval).
// Staff roster/announcements keep using portal-push-dispatch-* with PORTAL_PUSH_OPEN_URL.
//
// Secrets (Edge):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   PORTAL_PUSH_WEBHOOK_SECRET
//   PORTAL_PUSH_ADMIN_OPEN_URL — e.g. https://portalvic.vercel.app/admin_dashboard.html
//     (optional: if unset, derived from PORTAL_PUSH_OPEN_URL by swapping staff_dashboard → admin_dashboard)
//
// Deploy:
//   supabase functions deploy portal-push-dispatch-admin-alert
//
// Database Webhooks (Dashboard → Integrations → Webhooks), same secret header on each:
//   INSERT → portal_late_submission_requests
//   INSERT → cancellation_reports
//   INSERT → incident_reports
//   INSERT → portal_staff_dm_messages
//   URL: https://<ref>.supabase.co/functions/v1/portal-push-dispatch-admin-alert

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  adminPushOpenBase,
  clampPushBody,
  initVapidFromEnv,
  insertDedupeOrSkip,
  jsonPushResponse,
  loadAdminCeoUserIds,
  PORTAL_PUSH_CORS_HEADERS,
  sendPushPayloadToUserIds,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";

const DEDUPE_TABLE = "portal_webpush_admin_alert_sent";

const ALLOWED_TABLES = new Set([
  "portal_late_submission_requests",
  "cancellation_reports",
  "incident_reports",
  "portal_staff_dm_messages",
]);

const ADMIN_CEO_ROLES = new Set(["admin", "ceo"]);

function lateTypeLabel(t: string): string {
  const x = String(t || "").toLowerCase();
  if (x === "cancellation") return "Cancellation";
  if (x === "incident") return "Incident";
  return "Feedback";
}

function buildAlert(
  table: string,
  record: Record<string, unknown>,
  authorName?: string,
): { title: string; body: string; sourceId: string } | null {
  const id = String(record.id ?? "").trim();
  if (!id) return null;

  if (table === "portal_late_submission_requests") {
    const status = String(record.status ?? "").toLowerCase();
    if (status !== "pending") return null;
    const client = String(record.client_name ?? "Participant").trim() ||
      "Participant";
    const typ = lateTypeLabel(String(record.submission_type ?? ""));
    const d = String(record.session_date ?? "").slice(0, 10);
    const svc = String(record.service_label ?? "").trim();
    return {
      sourceId: id,
      title: `Approval · ${typ} · ${client}`,
      body: clampPushBody(
        `${d ? d + " · " : ""}${svc ? svc + " — " : ""}Past-session form pending`,
      ),
    };
  }

  if (table === "cancellation_reports") {
    const client = String(record.client_name ?? "Participant").trim() ||
      "Participant";
    const who = String(record.submitted_by_name ?? "Staff").trim() || "Staff";
    const d = String(record.session_date ?? "").slice(0, 10);
    return {
      sourceId: id,
      title: `Cancellation · ${client}`,
      body: clampPushBody(`${who} · ${d}`),
    };
  }

  if (table === "incident_reports") {
    const client = String(record.client_name ?? "Participant").trim() ||
      "Participant";
    const who = String(record.submitted_by_name ?? "Staff").trim() || "Staff";
    const cat = String(record.incident_category ?? "Incident").trim() ||
      "Incident";
    const d = String(record.session_date ?? "").slice(0, 10);
    return {
      sourceId: id,
      title: `${cat} · ${client}`,
      body: clampPushBody(`${who} · ${d}`),
    };
  }

  if (table === "portal_staff_dm_messages") {
    const nm = String(authorName ?? "Someone").trim() || "Someone";
    const msgType = String(record.message_type ?? "text").toLowerCase();
    const hasAudio = !!String(record.audio_storage_path ?? "").trim();
    let preview = clampPushBody(String(record.body ?? ""), 120);
    if (msgType === "audio" || hasAudio) preview = "Voice message";
    if (!preview) preview = "New internal message";
    return {
      sourceId: id,
      title: `Chat · ${nm}`,
      body: preview,
    };
  }

  return null;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openBase = adminPushOpenBase();

  if (!supabaseUrl || !serviceKey || !openBase) {
    console.error(
      "[portal-push-admin] missing env (SUPABASE_*, VAPID_*, PORTAL_PUSH_ADMIN_OPEN_URL or PORTAL_PUSH_OPEN_URL)",
    );
    return new Response("Server misconfigured", {
      status: 500,
      headers: PORTAL_PUSH_CORS_HEADERS,
    });
  }

  if (!initVapidFromEnv()) {
    console.error("[portal-push-admin] missing VAPID keys");
    return new Response("Server misconfigured", {
      status: 500,
      headers: PORTAL_PUSH_CORS_HEADERS,
    });
  }

  let payload: {
    type?: string;
    table?: string;
    record?: Record<string, unknown>;
    old_record?: Record<string, unknown> | null;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400, headers: PORTAL_PUSH_CORS_HEADERS });
  }

  const table = String(payload.table ?? "").trim();
  if (!ALLOWED_TABLES.has(table)) {
    return jsonPushResponse({ skipped: true, reason: "table" });
  }

  if (payload.type && payload.type !== "INSERT") {
    return jsonPushResponse({ skipped: true, reason: "event" });
  }

  const record = payload.record;
  if (!record || typeof record !== "object") {
    return jsonPushResponse({ skipped: true, reason: "no record" });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let authorName = "";
  if (table === "portal_staff_dm_messages") {
    const authorId = String(record.author_id ?? "").trim();
    if (!authorId) {
      return jsonPushResponse({ skipped: true, reason: "no author" });
    }
    const { data: authorProf, error: authErr } = await admin
      .from("staff_profiles")
      .select("app_role, full_name, username")
      .eq("id", authorId)
      .maybeSingle();
    if (authErr) {
      console.error("[portal-push-admin] author profile", authErr);
      return jsonPushResponse({ error: authErr.message }, 500);
    }
    const authorRole = String(authorProf?.app_role ?? "").toLowerCase();
    if (ADMIN_CEO_ROLES.has(authorRole)) {
      return jsonPushResponse({ skipped: true, reason: "author is admin/ceo" });
    }
    authorName = String(authorProf?.full_name ?? authorProf?.username ?? "")
      .trim();
  }

  const alert = buildAlert(table, record, authorName);
  if (!alert) {
    return jsonPushResponse({ skipped: true, reason: "not eligible" });
  }

  let adminIds: string[];
  try {
    adminIds = await loadAdminCeoUserIds(admin);
  } catch (e) {
    return jsonPushResponse({ error: String(e) }, 500);
  }

  if (!adminIds.length) {
    return jsonPushResponse({ ok: true, sent: 0, targets: 0 });
  }

  const dedupe = await insertDedupeOrSkip(
    admin,
    DEDUPE_TABLE,
    table,
    alert.sourceId,
  );
  if (dedupe === "duplicate") {
    return jsonPushResponse({ skipped: true, reason: "already sent" });
  }
  if (dedupe === "error") {
    return jsonPushResponse({ error: "dedupe" }, 500);
  }

  const notifyUrl = `${openBase}?portalOpen=alerts`;
  const pushPayload = JSON.stringify({
    title: alert.title,
    body: alert.body,
    url: notifyUrl,
    portalOpen: "alerts",
  });

  try {
    const { sent, targets } = await sendPushPayloadToUserIds(
      admin,
      adminIds,
      pushPayload,
    );
    return jsonPushResponse({ ok: true, sent, targets, table });
  } catch (e) {
    return jsonPushResponse({ error: String(e) }, 500);
  }
});
