// @ts-nocheck — Web Push when management sends an internal DM to a staff/lead worker.
//
// Admin→staff chat uses this; staff→admin uses portal-push-dispatch-admin-alert.
// Skips call invite/end payloads (handled by portal-push-dispatch-incoming-call).
//
// Deploy:
//   supabase functions deploy portal-push-dispatch-staff-dm --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb
//
// Trigger: migration 20260630120000_portal_staff_dm_push_webhook.sql

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clampPushBody,
  initVapidFromEnv,
  insertDedupeOrSkip,
  jsonPushResponse,
  loadStaffLeadUserIds,
  sendPushPayloadToUserIds,
  staffPushOpenBase,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";

const CALL_TAG = "[[portal-staff-call:";
const CALL_END_TAG = "[[portal-staff-call-end:";
const DEDUPE_TABLE = "portal_webpush_staff_dm_sent";

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
};

function openBaseForProfile(prof: {
  app_role?: string | null;
  dashboard_route?: string | null;
} | null): string {
  void prof;
  return staffPushOpenBase();
}

function buildChatNotifyUrl(base: string, threadId: string): string {
  const root = String(base || "").replace(/\/$/, "");
  if (!threadId) return `${root}?portal_open=internal_chat`;
  return `${root}?portal_open=internal_chat&portal_chat_thread=${encodeURIComponent(threadId)}`;
}

function isWorkerRecipient(prof: {
  app_role?: string | null;
  staff_role?: string | null;
  is_active?: boolean | null;
} | null): boolean {
  if (!prof || prof.is_active === false) return false;
  const ar = String(prof.app_role || "").toLowerCase();
  if (ar === "staff" || ar === "lead") return true;
  if (ar === "admin" || ar === "ceo") return false;
  const sr = String(prof.staff_role || "").toLowerCase();
  if (sr === "manager" || sr === "admin") return false;
  return !!sr;
}

async function resolveStaffDmRecipientIds(
  admin: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
): Promise<string[]> {
  const authorId = String(record.author_id || "").trim();
  const threadId = String(record.thread_id || "").trim();
  if (!authorId || !threadId) return [];

  const { data: authorProf } = await admin
    .from("staff_profiles")
    .select("id,app_role,staff_role,is_active")
    .eq("id", authorId)
    .maybeSingle();
  const authorRole = String(authorProf?.app_role || "").toLowerCase();
  if (authorRole === "staff" || authorRole === "lead") {
    return [];
  }

  const { data: thread, error } = await admin
    .from("portal_staff_dm_threads")
    .select("participant_a,participant_b")
    .eq("id", threadId)
    .maybeSingle();
  if (error || !thread) return [];

  const a = String(thread.participant_a || "").trim();
  const b = String(thread.participant_b || "").trim();
  const peerIds: string[] = [];
  if (a && a !== authorId) peerIds.push(a);
  if (b && b !== authorId) peerIds.push(b);
  if (!peerIds.length) return [];

  const staffLeadPool = new Set(await loadStaffLeadUserIds(admin));
  const { data: peerProfs } = await admin
    .from("staff_profiles")
    .select("id,app_role,staff_role,is_active")
    .in("id", peerIds);

  const out = new Set<string>();
  for (const row of peerProfs ?? []) {
    const id = String((row as { id?: string }).id || "").trim();
    if (!id || id === authorId) continue;
    if (staffLeadPool.has(id) || isWorkerRecipient(row as { app_role?: string; staff_role?: string; is_active?: boolean })) {
      out.add(id);
    }
  }
  return [...out];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return jsonPushResponse("ok");
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const forbidden = verifyPortalPushWebhook(req);
  if (forbidden) {
    console.warn("[portal-push-staff-dm] forbidden — check x-portal-webhook-secret");
    return forbidden;
  }

  console.log("[portal-push-staff-dm] webhook accepted", {
    at: new Date().toISOString(),
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!initVapidFromEnv() || !supabaseUrl || !serviceKey || !staffPushOpenBase()) {
    console.error("[portal-push-staff-dm] missing env");
    return new Response("Server misconfigured", { status: 500 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonPushResponse({ skipped: true, reason: "bad json" }, 400);
  }

  const table = String(payload.table || "").trim();
  if (table !== "portal_staff_dm_messages") {
    return jsonPushResponse({ skipped: true, reason: "table" });
  }

  const record = payload.record;
  if (!record || typeof record !== "object") {
    return jsonPushResponse({ skipped: true, reason: "no record" });
  }

  const body = String(record.body || "");
  if (body.includes(CALL_TAG) || body.includes(CALL_END_TAG)) {
    return jsonPushResponse({ skipped: true, reason: "call payload" });
  }

  const messageId = String(record.id || "").trim();
  if (!messageId) {
    return jsonPushResponse({ skipped: true, reason: "no id" });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const dedupe = await insertDedupeOrSkip(
    admin,
    DEDUPE_TABLE,
    table,
    messageId,
  );
  if (dedupe === "duplicate") {
    return jsonPushResponse({ skipped: true, reason: "already sent" });
  }
  if (dedupe === "error") {
    return jsonPushResponse({ error: "dedupe failed" }, 500);
  }

  const authorId = String(record.author_id || "").trim();
  const threadId = String(record.thread_id || "").trim();
  let authorName = "Admin";
  if (authorId) {
    const { data: authorProf } = await admin
      .from("staff_profiles")
      .select("full_name,username,app_role")
      .eq("id", authorId)
      .maybeSingle();
    const ar = String(authorProf?.app_role || "").toLowerCase();
    if (ar === "admin" || ar === "ceo") {
      authorName = "Admin";
    } else {
      authorName = String(authorProf?.full_name ?? authorProf?.username ?? "Admin")
        .trim() || "Admin";
    }
  }

  const msgType = String(record.message_type ?? "text").toLowerCase();
  const hasAudio = !!String(record.audio_storage_path ?? "").trim();
  let rawBody = String(record.body ?? "");
  rawBody = rawBody.replace(/^\[\[portal-dm-operator:[0-9a-f-]{36}\]\]/i, "");
  let preview = clampPushBody(rawBody, 120);
  if (msgType === "audio" || hasAudio) preview = "Voice message";
  if (!preview) preview = "New message";

  const targetIds = await resolveStaffDmRecipientIds(admin, record);
  if (!targetIds.length) {
    console.log("[portal-push-staff-dm] done", {
      sent: 0,
      targets: 0,
      note: "no staff recipients",
      messageId,
    });
    return jsonPushResponse({ ok: true, sent: 0, targets: 0, note: "no staff recipients" });
  }

  const { data: profRows } = await admin
    .from("staff_profiles")
    .select("id,app_role,dashboard_route")
    .in("id", targetIds);

  const profBy: Record<string, { app_role?: string; dashboard_route?: string }> = {};
  for (const row of profRows ?? []) {
    const id = String((row as { id?: string }).id || "").trim();
    if (id) profBy[id] = row as { app_role?: string; dashboard_route?: string };
  }

  const title = `Chat · ${authorName}`;
  const pushBody = preview;
  let sent = 0;
  let failed = 0;
  let subs = 0;
  let lastStatus = 0;

  for (const userId of targetIds) {
    const base = openBaseForProfile(profBy[userId] || null);
    const url = buildChatNotifyUrl(base, threadId);
    const pushPayload = JSON.stringify({
      title,
      body: pushBody,
      url,
      portalOpen: "chat",
      tag: `portal-chat-${messageId}`,
      requireInteraction: true,
      vibrate: [120, 55, 120, 55, 160],
      chat: threadId ? { threadId } : null,
    });
    const result = await sendPushPayloadToUserIds(admin, [userId], pushPayload, {
      TTL: 43200,
      urgency: "high",
      topic: `chat-${threadId.slice(0, 24)}`,
    });
    sent += result.sent;
    failed += result.failed;
    subs += result.subs;
    if (result.lastStatus) lastStatus = result.lastStatus;
  }

  console.log("[portal-push-staff-dm] done", {
    sent,
    failed,
    subs,
    targets: targetIds.length,
    messageId,
    threadId: threadId.slice(0, 8),
    lastStatus: lastStatus || undefined,
    note: sent === 0 ? "no portal_push_subscriptions or all sends failed" : "ok",
  });

  return jsonPushResponse({
    ok: true,
    sent,
    failed,
    subs,
    targets: targetIds.length,
    messageId,
    lastStatus: lastStatus || undefined,
  });
});
