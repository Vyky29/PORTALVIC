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
  loadChatPushEligibleUserIds,
  loadStaffLeadUserIds,
  portalPushGroupIsStaffOpsChannel,
  portalPushIsDirectorProfile,
  portalPushIsLeadershipCeoGroupSlug,
  portalPushIsLeadershipOnlyDmThread,
  portalPushIsWorkerRecipient,
  resolveAdminDmPushRecipientIds,
  resolveOperationsAdminUserIds,
  sendPushPayloadToUserIds,
  staffPushOpenBase,
  portalPushIsExecAppRole,
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
  if (role === "admin" || role === "ceo") return csCliq || admin || staff;
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
  callData?: Record<string, unknown> | null,
): Promise<string[]> {
  let authorId = String(record.author_id || "").trim();
  if (!authorId && callData) {
    authorId = String(callData.callerId || "").trim();
  }
  if (!authorId) {
    const parsed = parseCallPayload(String(record.body || ""));
    if (parsed) authorId = String(parsed.callerId || "").trim();
  }
  if (!authorId) return [];

  if (table === "portal_staff_dm_messages") {
    const threadId = String(record.thread_id || "").trim();
    if (!threadId) return [];
    const callerId = String(
      (callData && callData.callerId) || authorId || "",
    ).trim();
    if (!callerId) return [];

    const { data: thread, error } = await admin
      .from("portal_staff_dm_threads")
      .select("participant_a,participant_b")
      .eq("id", threadId)
      .maybeSingle();
    if (error || !thread) return [];

    const a = String(thread.participant_a || "").trim();
    const b = String(thread.participant_b || "").trim();
    let peer = "";
    if (a === callerId) peer = b;
    else if (b === callerId) peer = a;
    else if (authorId) {
      if (a === authorId) peer = b;
      else if (b === authorId) peer = a;
    }

    const profileIds = [...new Set([a, b, callerId, authorId].filter(Boolean))];
    const { data: profRows } = await admin
      .from("staff_profiles")
      .select(
        "id,app_role,staff_role,dashboard_route,is_active,username,full_name",
      )
      .in("id", profileIds);

    const profBy: Record<string, {
      id?: string;
      app_role?: string | null;
      staff_role?: string | null;
      dashboard_route?: string | null;
      is_active?: boolean | null;
      username?: string | null;
      full_name?: string | null;
    }> = {};
    for (const row of profRows ?? []) {
      const id = String((row as { id?: string }).id || "").trim();
      if (id) profBy[id] = row as typeof profBy[string];
    }

    const profA = profBy[a] ?? null;
    const profB = profBy[b] ?? null;
    const aWorker = portalPushIsWorkerRecipient(profA);
    const bWorker = portalPushIsWorkerRecipient(profB);
    const aExec = portalPushIsExecAppRole(profA);
    const bExec = portalPushIsExecAppRole(profB);
    const workerOps = (aWorker && bExec) || (bWorker && aExec);

    if (workerOps) {
      const adminCeoIds = await loadChatPushEligibleUserIds(admin);
      const opsAdmins = await resolveAdminDmPushRecipientIds(
        admin,
        threadId,
        callerId,
        adminCeoIds,
      );
      return opsAdmins.filter((id) => id && id !== callerId && id !== authorId);
    }

    if (portalPushIsLeadershipOnlyDmThread(profA, profB)) {
      if (peer && peer !== callerId && peer !== authorId) {
        return [peer];
      }
      return [];
    }

    return [];
  }

  if (table === "portal_ceo_group_message") {
    const groupId = String(record.group_id || "").trim();
    let slug = "";
    if (groupId) {
      const { data: grp } = await admin
        .from("portal_ceo_group")
        .select("slug,title")
        .eq("id", groupId)
        .maybeSingle();
      slug = String(grp?.slug ?? grp?.title ?? "").trim();
    }

    const { data: authorProf } = await admin
      .from("staff_profiles")
      .select(
        "id,app_role,staff_role,dashboard_route,is_active,username,full_name",
      )
      .eq("id", authorId)
      .maybeSingle();
    const authorIsWorker = portalPushIsWorkerRecipient(
      authorProf as Parameters<typeof portalPushIsWorkerRecipient>[0],
    );

    if (slug === "staff_leads_ops") {
      if (authorIsWorker) {
        const adminCeoIds = await loadAdminCeoUserIds(admin);
        return resolveOperationsAdminUserIds(admin, adminCeoIds);
      }
      const workers = await loadStaffLeadUserIds(admin);
      return workers.filter((id) => id && id !== authorId);
    }

    if (portalPushGroupIsStaffOpsChannel(slug) && authorIsWorker) {
      const adminCeoIds = await loadChatPushEligibleUserIds(admin);
      return resolveOperationsAdminUserIds(admin, adminCeoIds);
    }

    if (portalPushIsLeadershipCeoGroupSlug(slug)) {
      const leadershipIds = await loadChatPushEligibleUserIds(admin);
      return leadershipIds.filter((id) => id && id !== authorId);
    }

    return [];
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

  const targetIdsRaw = await resolveTargetUserIds(admin, table, record, callData);
  const callerCanon = String(callData.callerId || authorId || "").trim();
  const targetIds = targetIdsRaw.filter(
    (id) => id && id !== callerCanon && id !== authorId,
  );
  if (!targetIds.length) {
    console.log("[portal-push-incoming-call] done", {
      sent: 0,
      targets: 0,
      note: "no targets",
      messageId,
      source,
      authorId: authorId || null,
    });
    return jsonPushResponse({ ok: true, sent: 0, targets: 0, note: "no targets" });
  }

  const { data: profRows } = await admin
    .from("staff_profiles")
    .select("id,app_role,dashboard_route,username,full_name")
    .in("id", targetIds);

  const profBy: Record<string, { app_role?: string; dashboard_route?: string }> =
    {};
  for (const row of profRows ?? []) {
    const id = String((row as { id?: string }).id || "").trim();
    if (id) profBy[id] = row as { app_role?: string; dashboard_route?: string };
  }

  let sent = 0;
  let failed = 0;
  let subs = 0;
  let lastStatus = 0;
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
    const result = await sendPushPayloadToUserIds(admin, [userId], pushPayload, {
      TTL: 90,
      urgency: "high",
      topic: `call-${String(callData.room || messageId).slice(0, 24)}`,
    });
    sent += result.sent;
    failed += result.failed;
    subs += result.subs;
    if (result.lastStatus) lastStatus = result.lastStatus;
  }

  console.log("[portal-push-incoming-call] done", {
    sent,
    failed,
    subs,
    targets: targetIds.length,
    messageId,
    source,
    kind,
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
    source,
    lastStatus: lastStatus || undefined,
  });
});
