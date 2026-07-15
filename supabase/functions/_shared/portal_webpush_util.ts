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

/** Family portal open URL for parent Web Push banners. */
export function familyPushOpenBase(): string {
  const explicit = (Deno.env.get("PORTAL_PUSH_FAMILY_OPEN_URL") ?? "").replace(
    /\/$/,
    "",
  );
  if (explicit) return explicit;
  const staff = staffPushOpenBase();
  if (staff) {
    try {
      const u = new URL(staff);
      return `${u.origin}/parent`;
    } catch {
      /* fall through */
    }
  }
  return "https://www.clubsensational.org/parent";
}

/** Hub alert kinds that trigger Family Web Push (must match parent hub filter). */
export const FAMILY_PUSH_NOTIFY_KINDS = new Set([
  "instructor_change",
  "instructor_reassign",
  "session_cancelled",
  "absence_announced",
]);

export function isFamilyPushNotifyKind(kind: unknown): boolean {
  return FAMILY_PUSH_NOTIFY_KINDS.has(String(kind ?? "").trim().toLowerCase());
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

/** Admin/CEO + named directors (Victor/Raúl/Javi) for CS Cliq DM push. */
export async function loadChatPushEligibleUserIds(
  admin: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await admin
    .from("staff_profiles")
    .select("id,is_active,app_role,username,full_name")
    .or("is_active.is.null,is_active.eq.true");
  if (error) {
    console.error("[portal-webpush] chat push profiles", error);
    throw error;
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const r = row as PushProfileRow;
    if (r.is_active === false) continue;
    const id = String(r.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    if (
      portalPushIsExecAppRole(r) ||
      portalPushIsDirectorProfile(r) ||
      portalPushIsOperationsAdminProfile(r)
    ) {
      seen.add(id);
      ids.push(id);
    }
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

/** Named directors (Raul, Victor, Javi) — not ops admin Sevitha. */
export function portalPushIsDirectorProfile(
  row: PushProfileRow | null | undefined,
): boolean {
  if (!row || row.is_active === false) return false;
  const ar = String(row.app_role ?? "").toLowerCase();
  if (ar === "staff") return false;
  const u = normProfileKey(row.username);
  const parts = String(row.full_name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = normProfileKey(parts[0] ?? "");
  const full = normProfileKey(row.full_name);
  if (u === "raul" || u === "victor" || u === "javi") return true;
  if (u === "javier") return false;
  if (u.includes("palan")) return true;
  if (full.includes("marquez") && first === "javier") return false;
  if (full.includes("palan") || full.includes("arranz")) return true;
  if (first === "raul" || first === "victor" || first === "javi") return true;
  if (ar === "ceo" && (u === "raul" || u === "victor" || u === "javi")) {
    return true;
  }
  return false;
}

/** Same human across relinked staff_profiles / auth ids (Victor PC auth vs legacy row). */
export function portalPushSamePerson(
  a: PushProfileRow | null | undefined,
  b: PushProfileRow | null | undefined,
): boolean {
  if (!a || !b) return false;
  const idA = String(a.id ?? "").trim();
  const idB = String(b.id ?? "").trim();
  if (idA && idB && idA === idB) return true;
  const ua = normProfileKey(a.username);
  const ub = normProfileKey(b.username);
  if (ua && ub && ua === ub) return true;
  const fa = normProfileKey(String(a.full_name ?? "").split(/\s+/).filter(Boolean)[0] ?? "");
  const fb = normProfileKey(String(b.full_name ?? "").split(/\s+/).filter(Boolean)[0] ?? "");
  if (
    fa &&
    fb &&
    fa === fb &&
    (portalPushIsDirectorProfile(a) || portalPushIsExecAppRole(a)) &&
    (portalPushIsDirectorProfile(b) || portalPushIsExecAppRole(b))
  ) {
    return true;
  }
  return false;
}

/** Operations admin (e.g. Sevitha) — app_role admin, not a named director. */
export function portalPushIsOperationsAdminProfile(
  row: PushProfileRow | null | undefined,
): boolean {
  if (!row || row.is_active === false) return false;
  if (String(row.app_role ?? "").toLowerCase() !== "admin") return false;
  return !portalPushIsDirectorProfile(row);
}

/** Admin / CEO / director / ops admin — not staff, lead, or worker roster. */
export function portalPushIsLeadershipParticipant(
  row: PushProfileRow | null | undefined,
): boolean {
  if (!row || row.is_active === false) return false;
  if (portalPushIsWorkerRecipient(row)) return false;
  return (
    portalPushIsExecAppRole(row) ||
    portalPushIsDirectorProfile(row) ||
    portalPushIsOperationsAdminProfile(row)
  );
}

/** 1:1 DM between leadership only (CEO ↔ CEO, admin ↔ CEO, etc.). */
export function portalPushIsLeadershipOnlyDmThread(
  profA: PushProfileRow | null | undefined,
  profB: PushProfileRow | null | undefined,
): boolean {
  return (
    portalPushIsLeadershipParticipant(profA) &&
    portalPushIsLeadershipParticipant(profB)
  );
}

/** CEO CS Cliq groups for directors + ops admin (not staff/leads ops channels). */
export function portalPushIsLeadershipCeoGroupSlug(
  slugOrTitle: string | null | undefined,
): boolean {
  const s = normProfileKey(String(slugOrTitle ?? "").replace(/-/g, "_"));
  if (!s) return false;
  return (
    s === "all_ceos" ||
    s === "allceos" ||
    s === "ceo_liaison" ||
    s === "ceoliaison" ||
    s === "ceos" ||
    s.includes("allceos") ||
    s.includes("ceoliaison")
  );
}

/** Staff ops channels: worker/leads pool — alert ops admin only, not directors. */
export function portalPushGroupIsStaffOpsChannel(
  slugOrTitle: string | null | undefined,
): boolean {
  const s = normProfileKey(String(slugOrTitle ?? "").replace(/-/g, "_"));
  if (!s) return false;
  return (
    s === "staff_leads_ops" ||
    s === "staffleadsops" ||
    s === "session_leads" ||
    s === "sessionleads" ||
    s === "swimming_instructors" ||
    s === "climbing_instructors" ||
    s === "support_staff" ||
    s === "pool_leads" ||
    s.includes("staffleadsops") ||
    s.includes("sessionleads")
  );
}

export async function resolveOperationsAdminUserIds(
  admin: SupabaseClient,
  candidateIds: string[],
): Promise<string[]> {
  candidateIds = candidateIds.filter(Boolean);
  if (!candidateIds.length) return [];
  const { data, error } = await admin
    .from("staff_profiles")
    .select("id,app_role,is_active,username,full_name")
    .in("id", candidateIds);
  if (error) {
    console.error("[portal-webpush] ops admin lookup", error);
    return [];
  }
  const out: string[] = [];
  for (const row of data ?? []) {
    const id = String((row as PushProfileRow).id ?? "").trim();
    if (id && portalPushIsOperationsAdminProfile(row as PushProfileRow)) {
      out.push(id);
    }
  }
  return out;
}

/**
 * DM push: worker↔admin ops threads → ops admin only (Sevitha lane).
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

  let authorProf = profBy[authorId] ?? null;
  if (!authorProf) {
    const { data: authorRow } = await admin
      .from("staff_profiles")
      .select(
        "id,app_role,staff_role,dashboard_route,is_active,username,full_name",
      )
      .eq("id", authorId)
      .maybeSingle();
    if (authorRow) {
      authorProf = authorRow as PushProfileRow;
      const aid = String(authorProf.id ?? "").trim();
      if (aid) profBy[aid] = authorProf;
    }
  }

  const authorIdentity = new Set<string>([authorId]);
  if (authorProf) {
    for (const id of Object.keys(profBy)) {
      if (portalPushSamePerson(authorProf, profBy[id])) {
        authorIdentity.add(id);
      }
    }
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
    const opsAdmins = await resolveOperationsAdminUserIds(admin, adminCeoIds);
    recipients = opsAdmins.filter((id) => !authorIdentity.has(id));
  } else if (portalPushIsLeadershipOnlyDmThread(profA, profB)) {
    const set = new Set<string>();
    for (const pid of [pa, pb]) {
      if (!pid || authorIdentity.has(pid)) continue;
      set.add(pid);
    }
    recipients = [...set];
  } else {
    recipients = [];
  }

  recipients = recipients.filter((id) => id && !authorIdentity.has(id));

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

/**
 * Apple Web Push returns 400 BadWebPushTopic when the Topic header:
 * - ends with "-" (common when slicing UUIDs at 24 chars), or
 * - ends mid-segment e.g. "...-au" from "...-audio" (call room ids).
 */
export function normalizeWebPushTopic(raw: string): string {
  let topic = String(raw || "").trim().slice(0, 32);
  topic = topic.replace(/-+$/, "");
  for (let i = 0; i < 4; i++) {
    const lastHyphen = topic.lastIndexOf("-");
    if (lastHyphen <= 0) break;
    const tail = topic.slice(lastHyphen + 1);
    if (tail.length >= 3) break;
    topic = topic.slice(0, lastHyphen).replace(/-+$/, "");
  }
  return topic;
}

/**
 * Map thread/profile recipient ids → every auth id that may hold push subs
 * (relinked staff_profiles for the same director, etc.).
 */
export async function expandPushSubscriptionUserIds(
  admin: SupabaseClient,
  userIds: string[],
): Promise<string[]> {
  const seedIds = [...new Set(userIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!seedIds.length) return [];

  const expanded = new Set<string>(seedIds);
  const { data: seedRows, error: seedErr } = await admin
    .from("staff_profiles")
    .select("id,app_role,is_active,username,full_name")
    .in("id", seedIds);
  if (seedErr) {
    console.warn("[portal-webpush] expand seeds", seedErr);
    return seedIds;
  }

  const matchKeys = new Set<string>();
  for (const row of seedRows ?? []) {
    const prof = row as PushProfileRow;
    const id = String(prof.id ?? "").trim();
    if (id) expanded.add(id);
    const u = normProfileKey(prof.username);
    const first = normProfileKey(
      String(prof.full_name ?? "").split(/\s+/).filter(Boolean)[0] ?? "",
    );
    if (u) matchKeys.add(u);
    if (
      first &&
      (portalPushIsDirectorProfile(prof) || portalPushIsExecAppRole(prof))
    ) {
      matchKeys.add(first);
    }
  }
  if (!matchKeys.size) return [...expanded];

  const { data: aliasRows, error: aliasErr } = await admin
    .from("staff_profiles")
    .select("id,app_role,is_active,username,full_name")
    .or("is_active.is.null,is_active.eq.true");
  if (aliasErr) {
    console.warn("[portal-webpush] expand aliases", aliasErr);
    return [...expanded];
  }

  for (const row of aliasRows ?? []) {
    const prof = row as PushProfileRow;
    if (prof.is_active === false) continue;
    const u = normProfileKey(prof.username);
    const first = normProfileKey(
      String(prof.full_name ?? "").split(/\s+/).filter(Boolean)[0] ?? "",
    );
    if (!matchKeys.has(u) && !matchKeys.has(first)) continue;
    for (const seed of seedRows ?? []) {
      if (portalPushSamePerson(seed as PushProfileRow, prof)) {
        const id = String(prof.id ?? "").trim();
        if (id) expanded.add(id);
      }
    }
    const id = String(prof.id ?? "").trim();
    if (id && (matchKeys.has(u) || matchKeys.has(first))) {
      expanded.add(id);
    }
  }

  return [...expanded];
}

type PushSubRow = {
  user_id?: string;
  endpoint?: string;
  subscription_json?: Record<string, unknown> | null;
  updated_at?: string | null;
};

function sortPushSubsNewestFirst(rows: PushSubRow[]): PushSubRow[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(String(a.updated_at ?? "")) || 0;
    const tb = Date.parse(String(b.updated_at ?? "")) || 0;
    return tb - ta;
  });
}

/** One best endpoint per user — newest Apple PWA sub, else newest overall. */
function pickActivePushSubs(rows: PushSubRow[]): PushSubRow[] {
  const byUser = new Map<string, PushSubRow[]>();
  for (const row of rows) {
    const uid = String(row.user_id ?? "").trim();
    if (!uid) continue;
    const list = byUser.get(uid) ?? [];
    list.push(row);
    byUser.set(uid, list);
  }
  const picked: PushSubRow[] = [];
  for (const userRows of byUser.values()) {
    const sorted = sortPushSubsNewestFirst(userRows);
    const apple = sorted.find((r) =>
      String(r.endpoint ?? "").includes("web.push.apple.com")
    );
    picked.push(apple ?? sorted[0]);
  }
  return picked.filter(Boolean);
}

export async function sendPushPayloadToUserIds(
  admin: SupabaseClient,
  userIds: string[],
  pushPayload: string,
  options?: { TTL?: number; urgency?: string; topic?: string },
): Promise<{ sent: number; targets: number; subs: number; failed: number; lastStatus?: number; expandedTargets?: number }> {
  if (!userIds.length) return { sent: 0, targets: 0, subs: 0, failed: 0 };

  const expandedIds = await expandPushSubscriptionUserIds(admin, userIds);

  const { data: subsRaw, error: subErr } = await admin
    .from("portal_push_subscriptions")
    .select("user_id, endpoint, subscription_json, updated_at, register_app")
    .in("user_id", expandedIds)
    .eq("register_app", "portal");

  if (subErr) {
    console.error("[portal-webpush] subs", subErr);
    throw subErr;
  }

  const subs = pickActivePushSubs(sortPushSubsNewestFirst((subsRaw ?? []) as PushSubRow[]));

  if (!subs.length) {
    console.log("[portal-webpush] no subscriptions for targets", {
      targets: userIds.length,
      expandedTargets: expandedIds.length,
      expandedIds,
    });
    return {
      sent: 0,
      targets: userIds.length,
      subs: 0,
      failed: 0,
      expandedTargets: expandedIds.length,
    };
  }

  let sent = 0;
  let failed = 0;
  let lastStatus = 0;
  const ttl = options?.TTL ?? 86400;
  const urgency = options?.urgency ?? "high";
  const topic = options?.topic ? normalizeWebPushTopic(options.topic) : "";
  const seenEndpoints = new Set<string>();
  for (const row of subs) {
    const raw = row.subscription_json as Record<string, unknown> | null;
    const endpoint = String(
      raw?.endpoint ?? (row as { endpoint?: string }).endpoint ?? "",
    ).trim();
    if (endpoint && seenEndpoints.has(endpoint)) continue;
    if (endpoint) seenEndpoints.add(endpoint);
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
      if (st) lastStatus = st;
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

  return {
    sent,
    targets: userIds.length,
    subs: subs.length,
    failed,
    lastStatus: lastStatus || undefined,
    expandedTargets: expandedIds.length,
  };
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

export async function insertFamilyNotifyDedupeOrSkip(
  admin: SupabaseClient,
  notifyLogId: string,
): Promise<"ok" | "duplicate" | "error"> {
  const { error } = await admin.from("portal_family_webpush_notify_sent").insert({
    notify_log_id: notifyLogId,
  });
  if (!error) return "ok";
  const msg = error.message || "";
  if (msg.includes("duplicate") || (error as { code?: string }).code === "23505") {
    return "duplicate";
  }
  console.error("[portal-webpush] family notify dedupe", error);
  return "error";
}

function parentPhoneLast10(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

/** Resolve parent_person_id from a notify-log row (email / phone / child display). */
export async function resolveParentPersonIdsForNotifyLog(
  admin: SupabaseClient,
  row: {
    parent_email?: string | null;
    parent_phone?: string | null;
    client_display?: string | null;
  },
): Promise<string[]> {
  const ids = new Set<string>();
  const email = String(row.parent_email || "").trim().toLowerCase();
  const phone10 = parentPhoneLast10(String(row.parent_phone || ""));
  const clientDisplay = String(row.client_display || "").trim();

  if (email) {
    const { data } = await admin
      .from("portal_parent_contacts")
      .select("parent_person_id")
      .ilike("email", email)
      .limit(20);
    for (const r of data || []) {
      const id = String((r as { parent_person_id?: string }).parent_person_id || "").trim();
      if (id) ids.add(id);
    }
  }

  if (phone10) {
    const { data } = await admin
      .from("portal_parent_contacts")
      .select("parent_person_id, mobile")
      .like("mobile", `%${phone10}`)
      .limit(40);
    for (const r of data || []) {
      const mobile10 = parentPhoneLast10(
        String((r as { mobile?: string }).mobile || ""),
      );
      if (mobile10 !== phone10) continue;
      const id = String((r as { parent_person_id?: string }).parent_person_id || "").trim();
      if (id) ids.add(id);
    }
  }

  if (!ids.size && clientDisplay) {
    const { data } = await admin
      .from("portal_participants")
      .select("parent_person_id, display_name")
      .ilike("display_name", `%${clientDisplay.split(/\s+/)[0] || clientDisplay}%`)
      .limit(40);
    const want = clientDisplay.toLowerCase();
    for (const r of data || []) {
      const name = String((r as { display_name?: string }).display_name || "")
        .trim()
        .toLowerCase();
      if (!name) continue;
      if (
        name === want ||
        name.startsWith(want) ||
        want.startsWith(name) ||
        name.split(/\s+/)[0] === want.split(/\s+/)[0]
      ) {
        const id = String((r as { parent_person_id?: string }).parent_person_id || "")
          .trim();
        if (id) ids.add(id);
      }
    }
  }

  return [...ids];
}

export async function sendPushPayloadToFamilyParentIds(
  admin: SupabaseClient,
  parentPersonIds: string[],
  pushPayload: string,
  options?: { TTL?: number; urgency?: string; topic?: string },
): Promise<{ sent: number; targets: number; subs: number; failed: number; lastStatus?: number }> {
  const ids = [...new Set(parentPersonIds.map((x) => String(x || "").trim()).filter(Boolean))];
  if (!ids.length) return { sent: 0, targets: 0, subs: 0, failed: 0 };

  const { data: subsRaw, error: subErr } = await admin
    .from("portal_family_push_subscriptions")
    .select("parent_person_id, endpoint, subscription_json, updated_at")
    .in("parent_person_id", ids);

  if (subErr) {
    console.error("[portal-webpush] family subs", subErr);
    throw subErr;
  }

  const rows = (subsRaw ?? []) as Array<{
    parent_person_id?: string;
    endpoint?: string;
    subscription_json?: Record<string, unknown> | null;
    updated_at?: string;
  }>;

  // Newest first; keep up to 3 endpoints per parent.
  rows.sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
  );
  const keepByParent = new Map<string, Set<string>>();
  const picked: typeof rows = [];
  for (const row of rows) {
    const pid = String(row.parent_person_id || "").trim();
    const ep = String(row.endpoint || row.subscription_json?.endpoint || "").trim();
    if (!pid || !ep) continue;
    let set = keepByParent.get(pid);
    if (!set) {
      set = new Set();
      keepByParent.set(pid, set);
    }
    if (set.has(ep)) continue;
    if (set.size >= 3) continue;
    set.add(ep);
    picked.push(row);
  }

  if (!picked.length) {
    return { sent: 0, targets: ids.length, subs: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  let lastStatus = 0;
  const ttl = options?.TTL ?? 86400;
  const urgency = options?.urgency ?? "high";
  const topic = options?.topic ? normalizeWebPushTopic(options.topic) : "";
  const seenEndpoints = new Set<string>();

  for (const row of picked) {
    const raw = row.subscription_json as Record<string, unknown> | null;
    const endpoint = String(raw?.endpoint ?? row.endpoint ?? "").trim();
    if (!endpoint || seenEndpoints.has(endpoint)) continue;
    seenEndpoints.add(endpoint);
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
      if (st) lastStatus = st;
      console.warn("[portal-webpush] family send fail", st, endpoint.slice(0, 48), e);
      if (st === 404 || st === 410 || st === 401 || st === 403) {
        await admin
          .from("portal_family_push_subscriptions")
          .delete()
          .eq("parent_person_id", String(row.parent_person_id || ""))
          .eq("endpoint", endpoint);
      }
    }
  }

  return {
    sent,
    targets: ids.length,
    subs: picked.length,
    failed,
    lastStatus: lastStatus || undefined,
  };
}
