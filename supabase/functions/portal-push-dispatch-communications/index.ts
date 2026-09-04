// @ts-nocheck — Web Push for Communications messages, calls, and group invites.
//
// Deploy:
//   npx supabase functions deploy portal-push-dispatch-communications --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb
//
// Trigger: database/migrations/20260904010000_portal_comunicaciones_push_calls_presence.sql

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  clampPushBody,
  initVapidFromEnv,
  insertDedupeOrSkip,
  jsonPushResponse,
  sendPushPayloadToUserIds,
  staffPushOpenBase,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";

const DEDUPE_TABLE = "portal_webpush_communications_sent";

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
};

function communicationsOpenUrl(): string {
  const staff = staffPushOpenBase();
  if (/staff_dashboard\.html$/i.test(staff)) {
    return staff.replace(/staff_dashboard\.html$/i, "comunicaciones.html");
  }
  if (/\/[^/]+\.html$/i.test(staff)) {
    return staff.replace(/\/[^/]+\.html$/i, "/comunicaciones.html");
  }
  return staff ? `${staff.replace(/\/$/, "")}/comunicaciones.html` : "";
}

function withQuery(base: string, params: Record<string, string>): string {
  const root = String(base || "").trim();
  try {
    const u = new URL(root);
    Object.entries(params).forEach(([k, v]) => {
      if (v) u.searchParams.set(k, v);
    });
    return u.href;
  } catch {
    const qs = Object.entries(params)
      .filter(([, v]) => v)
      .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v))
      .join("&");
    if (!qs) return root;
    return root + (root.includes("?") ? "&" : "?") + qs;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return jsonPushResponse("ok");
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const forbidden = verifyPortalPushWebhook(req);
  if (forbidden) return forbidden;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openUrl = communicationsOpenUrl();
  if (!initVapidFromEnv() || !supabaseUrl || !serviceKey || !openUrl) {
    console.error("[portal-push-comms] missing env");
    return new Response("Server misconfigured", { status: 500 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonPushResponse({ skipped: true, reason: "bad json" }, 400);
  }

  const table = String(payload.table || "").trim();
  const record = payload.record;
  if (!record || typeof record !== "object") {
    return jsonPushResponse({ skipped: true, reason: "no record" });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  let sourceId = String(record.id || "").trim();
  let sourceTable = table;
  let recipientIds: string[] = [];
  let title = "Communications";
  let body = "New message";
  let url = openUrl;
  let portalOpen = "communications";
  let tag = "comms";
  let requireInteraction = false;
  let callData: Record<string, unknown> | null = null;
  let chatData: Record<string, unknown> | null = null;
  let senderUserId = "";
  let ttl = 86400;
  let urgency = "high";

  if (table === "communication_messages") {
    if (!sourceId) return jsonPushResponse({ skipped: true, reason: "no id" });
    const msgType = String(record.message_type || "text").toLowerCase();
    if (msgType === "system" || msgType === "call") {
      return jsonPushResponse({ skipped: true, reason: "system" });
    }
    const { data: ids, error } = await admin.rpc("communication_push_recipient_ids", {
      p_table: table,
      p_id: sourceId,
    });
    if (error) {
      console.error("[portal-push-comms] recipients", error);
      return jsonPushResponse({ error: "recipients" }, 500);
    }
    recipientIds = ((ids as string[]) || []).map(String).filter(Boolean);
    const ctx = String(record.sender_context || "").toUpperCase();
    const preview = clampPushBody(String(record.body || record.file_name || ""), 120);
    if (msgType === "audio") body = "Voice note";
    else if (msgType === "image") body = "Photo";
    else if (msgType === "file") body = String(record.file_name || "File");
    else body = preview || "New message";
    title = ctx === "ADMINISTRATION" ? "ADMIN" : "Communications";
    const conv = String(record.conversation_id || "").trim();
    senderUserId = String(record.performed_by_user_id || record.sender_user_id || "").trim();
    url = withQuery(openUrl, conv ? { conv } : {});
    tag = `comms-msg-${sourceId.slice(0, 24)}`;
    chatData = conv ? { conversationId: conv } : null;
  } else if (table === "communication_calls") {
    if (!sourceId) return jsonPushResponse({ skipped: true, reason: "no id" });
    const { data: ids, error } = await admin.rpc("communication_push_recipient_ids", {
      p_table: table,
      p_id: sourceId,
    });
    if (error) {
      console.error("[portal-push-comms] call recipients", error);
      return jsonPushResponse({ error: "recipients" }, 500);
    }
    recipientIds = ((ids as string[]) || []).map(String).filter(Boolean);
    const kind = String(record.type || "AUDIO").toUpperCase();
    title = kind === "VIDEO" ? "Incoming video call" : "Incoming call";
    body = "Communications";
    const initiator = String(record.initiated_by || "").trim();
    if (initiator) {
      const { data: prof } = await admin
        .from("staff_profiles")
        .select("full_name,username")
        .eq("id", initiator)
        .maybeSingle();
      const nm = String(prof?.full_name || prof?.username || "").trim();
      if (nm) body = nm;
    }
    url = withQuery(openUrl, { call: sourceId });
    portalOpen = "communications_call";
    tag = `comms-call-${sourceId.slice(0, 24)}`;
    requireInteraction = true;
    senderUserId = initiator;
    callData = {
      callId: sourceId,
      type: kind,
      conversationId: String(record.conversation_id || ""),
    };
    ttl = 45;
    urgency = "high";
  } else if (table === "communication_group_members") {
    const userId = String(record.user_id || "").trim();
    const addedBy = String(record.added_by || "").trim();
    const groupId = String(record.group_id || "").trim();
    if (!userId || !groupId) return jsonPushResponse({ skipped: true, reason: "member keys" });
    if (userId && addedBy && userId === addedBy) {
      return jsonPushResponse({ skipped: true, reason: "self add" });
    }
    if (record.removed_at) return jsonPushResponse({ skipped: true, reason: "removed" });
    sourceTable = `communication_group_members:${groupId}`;
    sourceId = userId;
    recipientIds = [userId];
    let groupName = "a group";
    const { data: grp } = await admin
      .from("communication_groups")
      .select("name")
      .eq("id", groupId)
      .maybeSingle();
    if (grp && grp.name) groupName = String(grp.name);
    title = "Communications";
    body = `You were added to ${groupName}`;
    url = withQuery(openUrl, { group: groupId });
    tag = `comms-invite-${groupId.slice(0, 18)}`;
  } else {
    return jsonPushResponse({ skipped: true, reason: "table" });
  }

  if (!recipientIds.length) {
    return jsonPushResponse({ skipped: true, reason: "no recipients" });
  }

  const dedupe = await insertDedupeOrSkip(admin, DEDUPE_TABLE, sourceTable, sourceId);
  if (dedupe === "duplicate") {
    return jsonPushResponse({ skipped: true, reason: "already sent" });
  }
  if (dedupe === "error") {
    return jsonPushResponse({ error: "dedupe failed" }, 500);
  }

  const pushPayload = JSON.stringify({
    title,
    body,
    url,
    portalOpen,
    tag,
    requireInteraction,
    vibrate: portalOpen === "communications_call" ? [500, 180, 500, 180, 700] : [200, 80, 200],
    senderUserId,
    call: callData,
    chat: chatData,
  });

  const result = await sendPushPayloadToUserIds(admin, recipientIds, pushPayload, {
    TTL: ttl,
    urgency,
    topic: tag.slice(0, 32),
  });

  console.log("[portal-push-comms]", {
    table,
    sourceId,
    recipients: recipientIds.length,
    sent: result.sent,
  });

  return jsonPushResponse({
    ok: true,
    table,
    sent: result.sent,
    targets: result.targets,
    note: result.sent === 0 ? "no portal_push_subscriptions or all sends failed" : "ok",
  });
});
