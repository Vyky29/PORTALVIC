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
//   INSERT → portal_late_submission_requests (incident/cancellation approval only)
//   INSERT → session_feedback (late_session_feedback or past session_date)
//   INSERT → cancellation_reports
//   INSERT → incident_reports
//   INSERT → portal_staff_dm_messages
//   INSERT → portal_ceo_group_message
//   URL: https://<ref>.supabase.co/functions/v1/portal-push-dispatch-admin-alert
//
// Prefer SQL triggers (migration 20260628120000_portal_dm_chat_admin_push_webhook.sql) for chat tables
// so push works without manual Dashboard webhook setup.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  adminPushOpenBase,
  clampPushBody,
  filterDmPushRecipientsAlreadyRead,
  initVapidFromEnv,
  insertDedupeOrSkip,
  jsonPushResponse,
  loadAdminCeoUserIds,
  loadChatPushEligibleUserIds,
  PORTAL_PUSH_CORS_HEADERS,
  portalPushGroupIsStaffOpsChannel,
  portalPushIsDirectorProfile,
  portalPushIsLeadershipCeoGroupSlug,
  resolveAdminDmPushRecipientIds,
  resolveOperationsAdminUserIds,
  sendPushPayloadToUserIds,
  staffPushOpenBase,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";

const DEDUPE_TABLE = "portal_webpush_admin_alert_sent";

const ALLOWED_TABLES = new Set([
  "portal_late_submission_requests",
  "session_feedback",
  "cancellation_reports",
  "incident_reports",
  "portal_staff_dm_messages",
  "portal_ceo_group_message",
]);

/** Chat tables: DM recipients resolved per thread; groups still broadcast to admin/ceo. */
const CHAT_TABLES = new Set([
  "portal_staff_dm_messages",
  "portal_ceo_group_message",
]);

function csCliqPushOpenBase(): string {
  const admin = adminPushOpenBase();
  if (/admin_dashboard\.html/i.test(admin)) {
    return admin.replace(/admin_dashboard\.html/i, "cs_cliq.html");
  }
  const staff = staffPushOpenBase();
  if (staff && /\.html$/i.test(staff)) {
    return staff.replace(/\/[^/]+\.html$/i, "/cs_cliq.html");
  }
  if (staff) return `${staff.replace(/\/$/, "")}/cs_cliq.html`;
  return "";
}

function openBaseForProfile(prof: {
  app_role?: string | null;
  dashboard_route?: string | null;
  username?: string | null;
  full_name?: string | null;
} | null): string {
  const staff = staffPushOpenBase();
  const admin = adminPushOpenBase();
  const csCliq = csCliqPushOpenBase();
  if (portalPushIsDirectorProfile(prof) && csCliq) return csCliq;
  const role = String(prof?.app_role || "").toLowerCase();
  const dr = String(prof?.dashboard_route || "").toLowerCase();
  if (role === "admin" || role === "ceo") {
    if (dr.includes("staff_dashboard") && staff) return staff;
    return csCliq || admin || staff;
  }
  return staff || admin;
}

function buildChatNotifyUrl(
  base: string,
  threadId: string,
  groupId: string,
): string {
  const root = String(base || "").replace(/\/$/, "");
  if (/cs_cliq\.html/i.test(root)) {
    if (threadId) {
      return `${root}?portal_chat_thread=${encodeURIComponent(threadId)}`;
    }
    if (groupId) {
      return `${root}?portal_chat_group=${encodeURIComponent(groupId)}`;
    }
    return root;
  }
  if (/admin_dashboard\.html/i.test(root)) {
    if (threadId) {
      return `${root}?portal_open=cs_cliq&portal_chat_thread=${encodeURIComponent(threadId)}`;
    }
    if (groupId) {
      return `${root}?portal_open=cs_cliq&portal_chat_group=${encodeURIComponent(groupId)}`;
    }
    return `${root}?portal_open=cs_cliq`;
  }
  if (threadId) {
    return `${root}?portal_open=internal_chat&portal_chat_thread=${encodeURIComponent(threadId)}`;
  }
  if (groupId) {
    return `${root}?portal_open=internal_chat&portal_chat_group=${encodeURIComponent(groupId)}`;
  }
  return `${root}?portal_open=internal_chat`;
}

function buildAdminAlertsUrl(base: string): string {
  const root = String(base || "").replace(/\/$/, "");
  return `${root}?portalOpen=alerts`;
}

function lateTypeLabel(t: string): string {
  const x = String(t || "").toLowerCase();
  if (x === "cancellation") return "Cancellation";
  if (x === "incident") return "Incident";
  return "Feedback";
}

function buildAlert(
  table: string,
  record: Record<string, unknown>,
  opts?: { authorName?: string; groupTitle?: string },
): { title: string; body: string; sourceId: string } | null {
  const authorName = opts?.authorName;
  const groupTitle = opts?.groupTitle;
  const id = String(record.id ?? "").trim();
  if (!id) return null;

  if (table === "session_feedback") {
    const lateFlag = record.late_session_feedback === true;
    const sessionDate = String(record.session_date ?? "").slice(0, 10);
    const createdDay = String(record.created_at ?? "").slice(0, 10);
    const isLate = lateFlag ||
      (!!sessionDate && !!createdDay && sessionDate < createdDay);
    if (!isLate) return null;
    const client = String(record.client_name ?? "Participant").trim() ||
      "Participant";
    const who = String(record.completed_by_name ?? "Staff").trim() || "Staff";
    const svc = String(record.service ?? "").trim();
    return {
      sourceId: id,
      title: `Late shift feedback received · ${client}`,
      body: clampPushBody(
        `${who} completed late feedback for the ${sessionDate || "session"} shift${svc ? " · " + svc : ""}`,
      ),
    };
  }

  if (table === "portal_late_submission_requests") {
    const status = String(record.status ?? "").toLowerCase();
    if (status !== "pending") return null;
    const subType = String(record.submission_type ?? "").toLowerCase();
    if (subType === "feedback") return null;
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
    const rawBody = String(record.body ?? "");
    if (
      rawBody.includes("[[portal-staff-call:") ||
      rawBody.includes("[[portal-staff-call-end:")
    ) {
      return null;
    }
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

  if (table === "portal_ceo_group_message") {
    const rawBody = String(record.body ?? "");
    if (
      rawBody.includes("[[portal-staff-call:") ||
      rawBody.includes("[[portal-staff-call-end:")
    ) {
      return null;
    }
    const nm = String(authorName ?? "Someone").trim() || "Someone";
    const gt = String(groupTitle ?? "CEO chat").trim() || "CEO chat";
    const msgType = String(record.message_type ?? "text").toLowerCase();
    const hasAudio = !!String(record.audio_storage_path ?? "").trim();
    let preview = clampPushBody(String(record.body ?? ""), 120);
    if (msgType === "audio" || hasAudio) preview = "Voice message";
    if (!preview) preview = "New message in group";
    return {
      sourceId: id,
      title: `Chat · ${gt}`,
      body: clampPushBody(`${nm}: ${preview}`),
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
  if (forbidden) {
    console.warn("[portal-push-admin] forbidden — check x-portal-webhook-secret");
    return forbidden;
  }

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
  const eventType = String(payload.type ?? "").trim() || "INSERT";
  console.log("[portal-push-admin] invoke", { table, eventType });

  if (!ALLOWED_TABLES.has(table)) {
    console.log("[portal-push-admin] skip", { reason: "table", table });
    return jsonPushResponse({ skipped: true, reason: "table" });
  }

  if (eventType !== "INSERT") {
    console.log("[portal-push-admin] skip", { reason: "event", eventType });
    return jsonPushResponse({ skipped: true, reason: "event" });
  }

  const record = payload.record;
  if (!record || typeof record !== "object") {
    return jsonPushResponse({ skipped: true, reason: "no record" });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const authorId = String(record.author_id ?? "").trim();
  let authorName = "";
  let groupTitle = "";

  if (CHAT_TABLES.has(table)) {
    if (!authorId) {
      return jsonPushResponse({ skipped: true, reason: "no author" });
    }
    const { data: authorProf, error: authErr } = await admin
      .from("staff_profiles")
      .select("full_name, username")
      .eq("id", authorId)
      .maybeSingle();
    if (authErr) {
      console.error("[portal-push-admin] author profile", authErr);
      return jsonPushResponse({ error: authErr.message }, 500);
    }
    authorName = String(authorProf?.full_name ?? authorProf?.username ?? "")
      .trim();

    if (table === "portal_ceo_group_message") {
      const groupId = String(record.group_id ?? "").trim();
      if (!groupId) {
        return jsonPushResponse({ skipped: true, reason: "no group" });
      }
      const { data: grp, error: grpErr } = await admin
        .from("portal_ceo_group")
        .select("title, slug")
        .eq("id", groupId)
        .maybeSingle();
      if (grpErr) {
        console.error("[portal-push-admin] group", grpErr);
        return jsonPushResponse({ error: grpErr.message }, 500);
      }
      groupTitle = String(grp?.title ?? grp?.slug ?? "CEO chat").trim();
    }
  }

  const alert = buildAlert(table, record, { authorName, groupTitle });
  if (!alert) {
    console.log("[portal-push-admin] skip", { reason: "not eligible", table });
    return jsonPushResponse({ skipped: true, reason: "not eligible" });
  }

  let adminIds: string[];
  try {
    adminIds = CHAT_TABLES.has(table)
      ? await loadChatPushEligibleUserIds(admin)
      : await loadAdminCeoUserIds(admin);
  } catch (e) {
    return jsonPushResponse({ error: String(e) }, 500);
  }

  if (!adminIds.length) {
    console.log("[portal-push-admin] no admin/ceo profiles", { table });
    return jsonPushResponse({ ok: true, sent: 0, targets: 0 });
  }

  let recipientIds = adminIds;
  if (table === "portal_staff_dm_messages") {
    if (!authorId) {
      console.log("[portal-push-admin] skip", { reason: "no author", table });
      return jsonPushResponse({ skipped: true, reason: "no author" });
    }
    const threadIdForPush = String(record.thread_id ?? "").trim();
    recipientIds = await resolveAdminDmPushRecipientIds(
      admin,
      threadIdForPush,
      authorId,
      adminIds,
    );
    if (threadIdForPush && recipientIds.length) {
      recipientIds = await filterDmPushRecipientsAlreadyRead(
        admin,
        threadIdForPush,
        String(record.created_at ?? ""),
        recipientIds,
      );
    }
  } else if (table === "portal_ceo_group_message" && authorId) {
    const groupId = String(record.group_id ?? "").trim();
    let slug = "";
    if (groupId) {
      const { data: grp } = await admin
        .from("portal_ceo_group")
        .select("slug,title")
        .eq("id", groupId)
        .maybeSingle();
      slug = String(grp?.slug ?? grp?.title ?? "").trim();
    }
    if (portalPushGroupIsStaffOpsChannel(slug)) {
      const opsAdmins = await resolveOperationsAdminUserIds(admin, adminIds);
      recipientIds = opsAdmins.filter((id) => id !== authorId);
    } else if (portalPushIsLeadershipCeoGroupSlug(slug)) {
      recipientIds = adminIds.filter((id) => id !== authorId);
    } else {
      recipientIds = [];
    }
  } else if (CHAT_TABLES.has(table) && authorId) {
    recipientIds = adminIds.filter((id) => id !== authorId);
  }
  if (authorId) {
    recipientIds = recipientIds.filter((id) => id && id !== authorId);
  }
  if (!recipientIds.length) {
    console.log("[portal-push-admin] skip", {
      reason: "no eligible recipients",
      table,
    });
    return jsonPushResponse({
      ok: true,
      sent: 0,
      targets: 0,
      reason: "no recipients",
    });
  }

  const dedupe = await insertDedupeOrSkip(
    admin,
    DEDUPE_TABLE,
    table,
    alert.sourceId,
  );
  if (dedupe === "duplicate") {
    console.log("[portal-push-admin] skip", {
      reason: "already sent",
      table,
      sourceId: alert.sourceId,
    });
    return jsonPushResponse({ skipped: true, reason: "already sent" });
  }
  if (dedupe === "error") {
    console.error("[portal-push-admin] dedupe insert failed", { table });
    return jsonPushResponse({ error: "dedupe" }, 500);
  }

  const threadId = table === "portal_staff_dm_messages"
    ? String(record.thread_id ?? "").trim()
    : "";
  const groupId = table === "portal_ceo_group_message"
    ? String(record.group_id ?? "").trim()
    : "";
  let notifyUrl = buildAdminAlertsUrl(openBase);
  let portalOpen = "alerts";
  if (CHAT_TABLES.has(table)) {
    portalOpen = "chat";
    notifyUrl = buildChatNotifyUrl(openBase, threadId, groupId);
  }

  const { data: profRows } = await admin
    .from("staff_profiles")
    .select("id,app_role,dashboard_route,username,full_name")
    .in("id", recipientIds);

  const profBy: Record<
    string,
    { app_role?: string; dashboard_route?: string; username?: string; full_name?: string }
  > = {};
  for (const row of profRows ?? []) {
    const id = String((row as { id?: string }).id || "").trim();
    if (id) profBy[id] = row as { app_role?: string; dashboard_route?: string };
  }

  const pushPayloadBase = {
    title: alert.title,
    body: alert.body,
    portalOpen,
    tag: CHAT_TABLES.has(table)
      ? `portal-chat-${alert.sourceId}`
      : `admin-${table}-${alert.sourceId}`,
    requireInteraction: true,
    vibrate: [120, 55, 120, 55, 160],
    chat: threadId ? { threadId } : groupId ? { groupId } : null,
  };

  let sent = 0;
  let failed = 0;
  let subs = 0;
  try {
    for (const userId of recipientIds) {
      const userBase = CHAT_TABLES.has(table)
        ? openBaseForProfile(profBy[userId] || null)
        : openBase;
      const userUrl = CHAT_TABLES.has(table)
        ? buildChatNotifyUrl(userBase, threadId, groupId)
        : buildAdminAlertsUrl(userBase);
      const pushPayload = JSON.stringify({
        ...pushPayloadBase,
        url: userUrl,
        senderUserId: authorId || "",
        targetUserId: userId,
      });
      const topicKey = CHAT_TABLES.has(table)
        ? (threadId || groupId || alert.sourceId)
        : alert.sourceId;
      const result = await sendPushPayloadToUserIds(
        admin,
        [userId],
        pushPayload,
        {
          TTL: CHAT_TABLES.has(table) ? 43200 : 86400,
          urgency: "high",
          topic: CHAT_TABLES.has(table)
            ? `chat-${String(topicKey).slice(0, 24)}`
            : "",
        },
      );
      sent += result.sent;
      failed += result.failed;
      subs += result.subs;
    }
    console.log("[portal-push-admin] done", {
      table,
      title: alert.title,
      sent,
      failed,
      subs,
      targets: recipientIds.length,
      subscriptionsNote: sent === 0
        ? "no portal_push_subscriptions or all sends failed"
        : "ok",
    });
    return jsonPushResponse({
      ok: true,
      sent,
      failed,
      subs,
      targets: recipientIds.length,
      table,
    });
  } catch (e) {
    console.error("[portal-push-admin] send error", e);
    return jsonPushResponse({ error: String(e) }, 500);
  }
});
