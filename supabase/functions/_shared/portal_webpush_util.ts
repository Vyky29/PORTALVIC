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
    .select("id")
    .in("app_role", ["admin", "ceo"]);
  if (error) {
    console.error("[portal-webpush] admin/ceo profiles", error);
    throw error;
  }
  const ids: string[] = [];
  for (const row of data ?? []) {
    const id = String((row as { id?: string }).id ?? "").trim();
    if (id) ids.push(id);
  }
  return ids;
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
): Promise<{ sent: number; targets: number }> {
  if (!userIds.length) return { sent: 0, targets: 0 };

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
    return { sent: 0, targets: userIds.length };
  }

  let sent = 0;
  const ttl = options?.TTL ?? 86400;
  const urgency = options?.urgency ?? "high";
  const topic = options?.topic ? String(options.topic).slice(0, 32) : "";
  for (const row of subs) {
    const raw = row.subscription_json;
    if (!raw || typeof raw !== "object") continue;
    try {
      await webpush.sendNotification(
        raw as unknown as webpush.PushSubscription,
        pushPayload,
        {
          TTL: ttl,
          urgency,
          ...(topic ? { topic } : {}),
        },
      );
      sent++;
    } catch (e) {
      const st = (e as { statusCode?: number })?.statusCode;
      console.warn("[portal-webpush] send fail", st, e);
      if (st === 404 || st === 410) {
        const ep = String(
          row.endpoint ?? (raw as { endpoint?: string }).endpoint ?? "",
        );
        if (ep) {
          await admin.from("portal_push_subscriptions").delete()
            .eq("user_id", row.user_id as string)
            .eq("endpoint", ep);
        }
      }
    }
  }

  return { sent, targets: userIds.length };
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
