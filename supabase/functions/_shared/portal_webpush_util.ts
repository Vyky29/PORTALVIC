// @ts-nocheck — shared helpers for portal Web Push Edge Functions (Deno).
import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export const PORTAL_PUSH_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-webhook-secret",
};

export function jsonPushResponse(
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...PORTAL_PUSH_CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function verifyPortalPushWebhook(req: Request): Response | null {
  const expected = Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") ?? "";
  const got = req.headers.get("x-portal-webhook-secret") ?? "";
  if (!expected || got !== expected) {
    console.warn("[portal-webpush] webhook forbidden", {
      expectedLen: expected.length,
      gotLen: got.length,
      match: expected === got,
    });
    return new Response("Forbidden", { status: 403, headers: PORTAL_PUSH_CORS_HEADERS });
  }
  return null;
}

/** web-push expects URL-safe base64; local vault may store 32-byte hex. */
export function normalizeVapidPrivateKey(raw: string): string {
  const t = String(raw || "").trim();
  if (!t) return "";
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    const pairs = t.match(/.{2}/g)!;
    const bytes = new Uint8Array(pairs.map((h) => parseInt(h, 16)));
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  return t;
}

export function initVapidFromEnv(): string | null {
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = normalizeVapidPrivateKey(
    Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
  );
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ??
    "mailto:hello@clubsensational.org";
  if (!vapidPublic || !vapidPrivate) return null;
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    return vapidPublic;
  } catch (e) {
    console.error("[portal-webpush] VAPID init", e);
    return null;
  }
}

/** Staff/lead roster + announcements landing page. */
export function staffPushOpenBase(): string {
  return (Deno.env.get("PORTAL_PUSH_OPEN_URL") ?? "").replace(/\/$/, "");
}

/**
 * Admin/CEO bell + notifications sheet. Prefer PORTAL_PUSH_ADMIN_OPEN_URL;
 * otherwise derive from PORTAL_PUSH_OPEN_URL (staff_dashboard → admin_dashboard).
 */
export function adminPushOpenBase(): string {
  const explicit = (Deno.env.get("PORTAL_PUSH_ADMIN_OPEN_URL") ?? "").replace(
    /\/$/,
    "",
  );
  if (explicit) return explicit;
  const staff = staffPushOpenBase();
  if (!staff) return "";
  if (/staff_dashboard\.html$/i.test(staff)) {
    return staff.replace(/staff_dashboard\.html$/i, "admin_dashboard.html");
  }
  if (/\/[^/]+\.html$/i.test(staff)) {
    return staff.replace(/\/[^/]+\.html$/i, "/admin_dashboard.html");
  }
  return `${staff}/admin_dashboard.html`;
}

export function clampPushBody(s: string, max = 160): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export async function loadAdminCeoUserIds(
  admin: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await admin
    .from("staff_profiles")
    .select("id,is_active")
    .in("app_role", ["admin", "ceo"]);
  if (error) {
    console.error("[portal-webpush] admin/ceo profiles", error);
    throw error;
  }
  const ids: string[] = [];
  for (const row of data ?? []) {
    const r = row as { id?: string; is_active?: boolean | null };
    if (r.is_active === false) continue;
    const id = String(r.id ?? "").trim();
    if (id) ids.push(id);
  }
  return ids;
}

type PushProfileRow = {
  id?: string;
  app_role?: string | null;
  staff_role?: string | null;
  dashboard_route?: string | null;
  is_active?: boolean | null;
  username?: string | null;
  full_name?: string | null;
};

const LEAD_KEYS = new Set(["berta", "john"]);
const EXEC_APP = new Set(["admin", "ceo"]);
const EXEC_STAFF_ROLE = new Set(["manager", "admin"]);
const WORKER_STAFF_ROLE = new Set([
  "swimming",
  "climbing",
  "fitness",
  "support",
  "support_lead",
]);

function normProfileKey(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Mirrors working_ui/portal/portal_internal_dm_directory.js */
export function portalPushIsWorkerRecipient(
  row: PushProfileRow | null | undefined,
): boolean {
  if (!row || row.is_active === false) return false;
  const app = String(row.app_role ?? "").toLowerCase();
  const sr = String(row.staff_role ?? "").toLowerCase();
  if (EXEC_APP.has(app)) return false;
  if (EXEC_STAFF_ROLE.has(sr)) return false;
  if (app === "staff" || app === "lead") return true;
  const u = normProfileKey(row.username);
  const first = normProfileKey(
    String(row.full_name ?? "").split(/\s+/).filter(Boolean)[0] ?? "",
  );
  if (LEAD_KEYS.has(u) || LEAD_KEYS.has(first)) return true;
  if (WORKER_STAFF_ROLE.has(sr)) return true;
  const dr = String(row.dashboard_route ?? "").toLowerCase();
  if (dr === "staff_dashboard.html" || dr === "lead_dashboard.html") {
    return true;
  }
  if (!app && (row.full_name || row.username)) {
    if (!dr || (dr.indexOf("admin") === -1 && dr.indexOf("ceo") === -1)) {
      return true;
    }
  }
  if (row.full_name || row.username) {
    if (!EXEC_APP.has(app) && !EXEC_STAFF_ROLE.has(sr)) return true;
  }
  return false;
}

export function portalPushIsExecAppRole(
  row: PushProfileRow | null | undefined,
): boolean {
  const app = String(row?.app_role ?? "").toLowerCase();
  return app === "admin" || app === "ceo";
}

/**
 * DM push: worker↔admin ops threads → all admin/ceo (shared line).
 * Other DMs → only admin/ceo thread participants (not every admin).
 */
export async function resolveAdminDmPushRecipientIds(
  admin: SupabaseClient,
  threadId: string,
  authorId: string,
  adminCeoIds: string[],
): Promise<string[]> {
  threadId = String(threadId ?? "").trim();
  authorId = String(authorId ?? "").trim();
  if (!threadId || !adminCeoIds.length) return [];

  const { data: thread, error: threadErr } = await admin
    .from("portal_staff_dm_threads")
    .select("participant_a, participant_b")
    .eq("id", threadId)
    .maybeSingle();
  if (threadErr) {
    console.error("[portal-webpush] dm thread", threadErr);
    return [];
  }
  if (!thread) return [];

  const pa = String(thread.participant_a ?? "").trim();
  const pb = String(thread.participant_b ?? "").trim();
  const profileIds = [...new Set([pa, pb, authorId].filter(Boolean))];
  if (!profileIds.length) return [];

  const { data: profRows, error: profErr } = await admin
    .from("staff_profiles")
    .select(
      "id,app_role,staff_role,dashboard_route,is_active,username,full_name",
    )
    .in("id", profileIds);
  if (profErr) {
    console.error("[portal-webpush] dm profiles", profErr);
    return [];
  }

  const profBy: Record<string, PushProfileRow> = {};
  for (const row of profRows ?? []) {
    const id = String((row as PushProfileRow).id ?? "").trim();
    if (id) profBy[id] = row as PushProfileRow;
  }

  const profA = profBy[pa] ?? null;
  const profB = profBy[pb] ?? null;
  const aWorker = portalPushIsWorkerRecipient(profA);
  const bWorker = portalPushIsWorkerRecipient(profB);
  const aExec = portalPushIsExecAppRole(profA);
  const bExec = portalPushIsExecAppRole(profB);
  const workerOps = (aWorker && bExec) || (bWorker && aExec);

  let recipients: string[];
  if (workerOps) {
    recipients = adminCeoIds.filter((id) => id !== authorId);
  } else {
    const set = new Set<string>();
    if (aExec && pa && pa !== authorId) set.add(pa);
    if (bExec && pb && pb !== authorId) set.add(pb);
    recipients = [...set].filter((id) => adminCeoIds.includes(id));
  }

  return recipients;
}

/** Skip users whose per-thread read cursor already covers this message. */
export async function filterDmPushRecipientsAlreadyRead(
  admin: SupabaseClient,
  threadId: string,
  messageCreatedAt: string,
  recipientIds: string[],
): Promise<string[]> {
  threadId = String(threadId ?? "").trim();
  const msgAt = String(messageCreatedAt ?? "").trim();
  if (!threadId || !msgAt || !recipientIds.length) return recipientIds;

  const { data: rows, error } = await admin
    .from("portal_dm_read_cursor")
    .select("user_id, read_at")
    .eq("thread_id", threadId)
    .in("user_id", recipientIds);
  if (error) {
    console.warn("[portal-webpush] read cursor lookup", error);
    return recipientIds;
  }

  const readByUser: Record<string, string> = {};
  for (const row of rows ?? []) {
    const uid = String((row as { user_id?: string }).user_id ?? "").trim();
    const readAt = String((row as { read_at?: string }).read_at ?? "").trim();
    if (uid && readAt) readByUser[uid] = readAt;
  }

  let msgMs = NaN;
  try {
    msgMs = new Date(msgAt).getTime();
  } catch {
    return recipientIds;
  }
  if (!Number.isFinite(msgMs)) return recipientIds;

  return recipientIds.filter((uid) => {
    const readAt = String(readByUser[uid] ?? "").trim();
    if (!readAt) return true;
    try {
      return msgMs > new Date(readAt).getTime() + 800;
    } catch {
      return true;
    }
  });
}

export async function loadStaffLeadUserIds(
  admin: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await admin
    .from("staff_profiles")
    .select("id,is_active")
    .in("app_role", ["staff", "lead"]);
  if (error) {
    console.error("[portal-webpush] staff/lead profiles", error);
    throw error;
  }
  const ids: string[] = [];
  for (const row of data ?? []) {
    const r = row as { id?: string; is_active?: boolean | null };
    if (r.is_active === false) continue;
    const id = String(r.id ?? "").trim();
    if (id) ids.push(id);
  }
  return ids;
}

export async function sendPushPayloadToUserIds(
  admin: SupabaseClient,
  userIds: string[],
  pushPayload: string,
  options?: { TTL?: number; urgency?: string; topic?: string },
): Promise<{ sent: number; targets: number; subs: number; failed: number }> {
  if (!userIds.length) return { sent: 0, targets: 0, subs: 0, failed: 0 };

  const { data: subs, error: subErr } = await admin
    .from("portal_push_subscriptions")
    .select("user_id, endpoint, subscription_json")
    .in("user_id", userIds);

  if (subErr) {
    console.error("[portal-webpush] subs", subErr);
    throw subErr;
  }

  if (!subs?.length) {
    console.log("[portal-webpush] no subscriptions for targets", {
      targets: userIds.length,
    });
    return { sent: 0, targets: userIds.length, subs: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const ttl = options?.TTL ?? 86400;
  const urgency = options?.urgency ?? "high";
  const topic = options?.topic ? String(options.topic).slice(0, 32) : "";
  for (const row of subs) {
    const raw = row.subscription_json as Record<string, unknown> | null;
    const endpoint = String(
      raw?.endpoint ?? (row as { endpoint?: string }).endpoint ?? "",
    ).trim();
    const keys = raw?.keys as Record<string, unknown> | undefined;
    const p256dh = String(keys?.p256dh ?? "").trim();
    const auth = String(keys?.auth ?? "").trim();
    if (!endpoint || !p256dh || !auth) {
      failed++;
      continue;
    }
    const subscription = { endpoint, keys: { p256dh, auth } };
    try {
      await webpush.sendNotification(
        subscription as unknown as webpush.PushSubscription,
        pushPayload,
        {
          TTL: ttl,
          urgency,
          ...(topic ? { topic } : {}),
        },
      );
      sent++;
    } catch (e) {
      failed++;
      const st = (e as { statusCode?: number })?.statusCode;
      console.warn("[portal-webpush] send fail", st, endpoint.slice(0, 48), e);
      if (st === 404 || st === 410 || st === 401 || st === 403) {
        if (endpoint) {
          await admin.from("portal_push_subscriptions").delete()
            .eq("user_id", row.user_id as string)
            .eq("endpoint", endpoint);
        }
      }
    }
  }

  return { sent, targets: userIds.length, subs: subs.length, failed };
}

export async function insertDedupeOrSkip(
  admin: SupabaseClient,
  table: string,
  sourceTable: string,
  sourceId: string,
): Promise<"ok" | "duplicate" | "error"> {
  const { error } = await admin.from(table).insert({
    source_table: sourceTable,
    source_id: sourceId,
  });
  if (!error) return "ok";
  const msg = error.message || "";
  if (msg.includes("duplicate") || (error as { code?: string }).code === "23505") {
    return "duplicate";
  }
  console.error("[portal-webpush] dedupe", table, error);
  return "error";
}
