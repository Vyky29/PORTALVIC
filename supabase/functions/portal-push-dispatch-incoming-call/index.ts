// @ts-nocheck — Web Push when a live call invite is inserted (DM or CEO group).
// Requires same VAPID + PORTAL_PUSH_* secrets as other portal-push-dispatch-* functions.
//
// Deploy: supabase functions deploy portal-push-dispatch-incoming-call --no-verify-jwt --project-ref cklpnwhlqsulpmkipmqb
// Triggers: migration 20260621103000_portal_incoming_call_web_push.sql (replace webhook secret).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  adminPushOpenBase,
  clampPushBody,
  initVapidFromEnv,
  insertDedupeOrSkip,
  jsonPushResponse,
  loadAdminCeoUserIds,
  sendPushPayloadToUserIds,
  staffPushOpenBase,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";

const CALL_TAG = "[[portal-staff-call:";
const CALL_END_TAG = "[[portal-staff-call-end:";
const CALL_TAG_END = "]]";
const DEDUPE_TABLE = "portal_webpush_incoming_call_sent";

type WebhookPayload = {
  type?: string;
  table?: string;
  record?: Record<string, unknown>;
};

function parseCallPayload(body: string): Record<string, unknown> | null {
  const raw = String(body || "");
  if (raw.includes(CALL_END_TAG)) return null;
  const start = raw.indexOf(CALL_TAG);
  if (start < 0) return null;
  const end = raw.indexOf(CALL_TAG_END, start);
  if (end < 0) return null;
  try {
    const data = JSON.parse(raw.slice(start + CALL_TAG.length, end)) as Record<
      string,
      unknown
    >;
    if (!data || !data.kind) return null;
    if (data.scheduledAt) return null;
    const room = String(data.room || "").trim();
    if (!room) return null;
    return data;
  } catch {
    return null;
  }
}

function callKindLabel(kind: string): string {
  if (kind === "video") return "Incoming video call";
  if (kind === "audio") return "Incoming voice call";
  return "Incoming call";
}

function openBaseForProfile(prof: {
  app_role?: string | null;
  dashboard_route?: string | null;
} | null): string {
  const staff = staffPushOpenBase();
  const admin = adminPushOpenBase();
  const role = String(prof?.app_role || "").toLowerCase();
  const dr = String(prof?.dashboard_route || "").toLowerCase();
  if (role === "admin" || role === "ceo") return admin || staff;
  if (dr.includes("lead_dashboard")) {
    if (/staff_dashboard\.html/i.test(staff)) {
      return staff.replace(/staff_dashboard\.html/i, "lead_dashboard.html");
    }
  }
  return staff;
}

function buildNotifyUrl(
  base: string,
  msgId: string,
  source: "dm" | "group",
): string {
  const root = String(base || "").replace(/\/$/, "");
  const q = new URLSearchParams({
    portalIncomingCall: "1",
    callMsgId: msgId,
    callSrc: source,
  });
  return `${root}?${q.toString()}`;
}

async function callerDisplayName(
  admin: ReturnType<typeof createClient>,
  authorId: string,
  callData: Record<string, unknown>,
): Promise<string> {
  const fromPayload = String(callData.callerName || "").trim();
  if (fromPayload) return fromPayload.slice(0, 80);
  if (!authorId) return "Team chat";
  const { data } = await admin
    .from("staff_profiles")
    .select("full_name,username")
    .eq("id", authorId)
    .maybeSingle();
  const nm = String(data?.full_name || data?.username || "").trim();
  return nm || "Team chat";
}

async function resolveTargetUserIds(
  admin: ReturnType<typeof createClient>,
  table: string,
  record: Record<string, unknown>,
): Promise<string[]> {
  const authorId = String(record.author_id || "").trim();
  if (!authorId) return [];

  const { data: authorProf } = await admin
    .from("staff_profiles")
    .select("id,app_role")
    .eq("id", authorId)
    .maybeSingle();
  const authorRole = String(authorProf?.app_role || "").toLowerCase();

  const targets = new Set<string>();

  if (table === "portal_staff_dm_messages") {
    const threadId = String(record.thread_id || "").trim();
    if (!threadId) return [];
    const { data: thread, error } = await admin
      .from("portal_staff_dm_threads")
      .select("participant_a,participant_b")
      .eq("id", threadId)
      .maybeSingle();
    if (error || !thread) return [];
    const a = String(thread.participant_a || "").trim();
    const b = String(thread.participant_b || "").trim();
    const peer = a === authorId ? b : a;
    if (peer && peer !== authorId) targets.add(peer);

    if (authorRole === "staff") {
      const admins = await loadAdminCeoUserIds(admin);
      admins.forEach((id) => {
        if (id && id !== authorId) targets.add(id);
      });
    }
    return [...targets];
  }

  if (table === "portal_ceo_group_message") {
    const admins = await loadAdminCeoUserIds(admin);
    return admins.filter((id) => id && id !== authorId);
  }

  return [];
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
    console.warn("[portal-push-incoming-call] forbidden — check x-portal-webhook-secret");
    return forbidden;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!initVapidFromEnv() || !supabaseUrl || !serviceKey || !staffPushOpenBase()) {
    console.error("[portal-push-incoming-call] missing env");
    return new Response("Server misconfigured", { status: 500 });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    console.log("[portal-push-incoming-call] skip", { reason: "bad json" });
    return jsonPushResponse({ skipped: true, reason: "bad json" }, 400);
  }

  const table = String(payload.table || "").trim();
  console.log("[portal-push-incoming-call] invoke", { table });
  if (
    table !== "portal_staff_dm_messages" &&
    table !== "portal_ceo_group_message"
  ) {
    console.log("[portal-push-incoming-call] skip", { reason: "table", table });
    return jsonPushResponse({ skipped: true, reason: "table" });
  }

  const record = payload.record;
  if (!record || typeof record !== "object") {
    console.log("[portal-push-incoming-call] skip", { reason: "no record", table });
    return jsonPushResponse({ skipped: true, reason: "no record" });
  }

  const body = String(record.body || "");
  const callData = parseCallPayload(body);
  if (!callData) {
    console.log("[portal-push-incoming-call] skip", {
      reason: "not live call invite",
      table,
      messageId: String(record.id || "").slice(0, 8),
    });
    return jsonPushResponse({ skipped: true, reason: "not live call invite" });
  }

  const messageId = String(record.id || "").trim();
  if (!messageId) {
    return jsonPushResponse({ skipped: true, reason: "no id" });
  }

  const dedupe = await insertDedupeOrSkip(
    createClient(supabaseUrl, serviceKey),
    DEDUPE_TABLE,
    table,
    messageId,
  );
  if (dedupe === "duplicate") {
    console.log("[portal-push-incoming-call] skip", { reason: "already sent", messageId });
    return jsonPushResponse({ skipped: true, reason: "already sent" });
  }
  if (dedupe === "error") {
    return jsonPushResponse({ error: "dedupe failed" }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const authorId = String(record.author_id || "").trim();
  const kind = String(callData.kind || "video");
  const callerName = await callerDisplayName(admin, authorId, callData);
  const source = table === "portal_ceo_group_message" ? "group" : "dm";

  let groupTitle = "";
  if (source === "group") {
    const gid = String(record.group_id || "").trim();
    if (gid) {
      const { data: grp } = await admin
        .from("portal_ceo_group")
        .select("title")
        .eq("id", gid)
        .maybeSingle();
      groupTitle = String(grp?.title || "").trim();
    }
  }

  const title = callKindLabel(kind);
  const bodyLine = groupTitle
    ? clampPushBody(`${callerName} — ${groupTitle}`)
    : clampPushBody(`${callerName} is calling`);

  const targetIds = await resolveTargetUserIds(admin, table, record);
  if (!targetIds.length) {
    console.log("[portal-push-incoming-call] done", {
      sent: 0,
      targets: 0,
      note: "no targets",
      messageId,
      source,
    });
    return jsonPushResponse({ ok: true, sent: 0, targets: 0, note: "no targets" });
  }

  const { data: profRows } = await admin
    .from("staff_profiles")
    .select("id,app_role,dashboard_route")
    .in("id", targetIds);

  const profBy: Record<string, { app_role?: string; dashboard_route?: string }> =
    {};
  for (const row of profRows ?? []) {
    const id = String((row as { id?: string }).id || "").trim();
    if (id) profBy[id] = row as { app_role?: string; dashboard_route?: string };
  }

  let sent = 0;
  for (const userId of targetIds) {
    const base = openBaseForProfile(profBy[userId] || null);
    const url = buildNotifyUrl(base, messageId, source);
    const pushPayload = JSON.stringify({
      title,
      body: bodyLine,
      url,
      portalOpen: "incoming_call",
      requireInteraction: true,
      tag: `portal-incoming-call-${messageId}`,
      vibrate: [500, 180, 500, 180, 700, 180, 500],
      call: {
        messageId,
        source,
        kind,
        room: String(callData.room || ""),
        callerId: String(callData.callerId || authorId || ""),
        threadId: String(record.thread_id || ""),
        groupId: String(record.group_id || ""),
      },
    });
    const result = await sendPushPayloadToUserIds(admin, [userId], pushPayload);
    sent += result.sent;
  }

  console.log("[portal-push-incoming-call] done", {
    sent,
    targets: targetIds.length,
    messageId,
    source,
    kind,
  });

  return jsonPushResponse({
    ok: true,
    sent,
    targets: targetIds.length,
    messageId,
    source,
  });
});
