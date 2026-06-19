// @ts-nocheck — Edge Function (Deno). Staff Web Push for outstanding session feedback.
//
// POST body:
//   { "sessionDate": "2026-06-14", "force": true }
//   { "sessionDate": "2026-06-14", "force": true, "targets": [{ "userId": "...", "pending": 5, "sample": "Hazem, Zaid" }] }
//
// Header: x-portal-webhook-secret (PORTAL_PUSH_WEBHOOK_SECRET)
// Deploy: supabase functions deploy portal-push-dispatch-outstanding-feedback --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";
import {
  clampPushBody,
  expandPushSubscriptionUserIds,
  initVapidFromEnv,
  jsonPushResponse,
  PORTAL_PUSH_CORS_HEADERS,
  staffPushOpenBase,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";

type PushTarget = {
  userId: string;
  pending: number;
  sample?: string;
};

type PushSubRow = {
  user_id?: string;
  endpoint?: string;
  subscription_json?: Record<string, unknown> | null;
  updated_at?: string | null;
};

function formatShortDate(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

function sortPushSubsNewestFirst(rows: PushSubRow[]): PushSubRow[] {
  return [...rows].sort((a, b) => {
    const ta = Date.parse(String(a.updated_at ?? "")) || 0;
    const tb = Date.parse(String(b.updated_at ?? "")) || 0;
    return tb - ta;
  });
}

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

  let body: {
    sessionDate?: string;
    force?: boolean;
    targets?: PushTarget[];
  } = {};
  try {
    body = await req.json();
  } catch {
    return jsonPushResponse({ error: "Bad JSON" }, 400);
  }

  const sessionDate = String(body.sessionDate || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return jsonPushResponse({ error: "sessionDate required (YYYY-MM-DD)" }, 400);
  }

  const targets = (body.targets || [])
    .map((t) => ({
      userId: String(t.userId || "").trim(),
      pending: Number(t.pending || 0),
      sample: String(t.sample || "").trim(),
    }))
    .filter((t) => t.userId && t.pending > 0);

  if (!targets.length) {
    return jsonPushResponse({
      ok: true,
      sent: 0,
      targets: 0,
      reason: "no targets with pending > 0",
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openBase = staffPushOpenBase();
  if (!supabaseUrl || !serviceKey || !openBase) {
    return new Response("Server misconfigured", {
      status: 500,
      headers: PORTAL_PUSH_CORS_HEADERS,
    });
  }
  if (!initVapidFromEnv()) {
    return new Response("Server misconfigured", {
      status: 500,
      headers: PORTAL_PUSH_CORS_HEADERS,
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const dayLabel = formatShortDate(sessionDate);
  const notifyUrl = `${openBase}?portalOpen=alerts`;
  const results: Record<string, unknown>[] = [];
  let totalSent = 0;

  for (const t of targets) {
    const n = t.pending;
    const unitWord = n === 1 ? "session feedback" : "session feedbacks";
    const samplePart = t.sample ? `: ${t.sample}` : "";
    const title = `Outstanding feedback - ${dayLabel}`;
    const pushBody = clampPushBody(
      `You still have ${n} ${unitWord} to complete${samplePart}. Tap to open your dashboard.`,
    );
    const pushPayload = JSON.stringify({
      title,
      body: pushBody,
      url: notifyUrl,
      portalOpen: "alerts",
    });

    const expandedIds = await expandPushSubscriptionUserIds(admin, [t.userId]);
    const { data: subsRaw, error: subErr } = await admin
      .from("portal_push_subscriptions")
      .select("user_id, endpoint, subscription_json, updated_at")
      .in("user_id", expandedIds)
      .eq("register_app", "portal");

    if (subErr) {
      results.push({ userId: t.userId, pending: n, error: subErr.message });
      continue;
    }

    const subs = pickActivePushSubs(
      sortPushSubsNewestFirst((subsRaw ?? []) as PushSubRow[]),
    );
    if (!subs.length) {
      results.push({ userId: t.userId, pending: n, sent: 0, subs: 0 });
      continue;
    }

    let sent = 0;
    let failed = 0;
    let lastStatus = 0;
    for (const row of subs) {
      const raw = row.subscription_json;
      if (!raw || typeof raw !== "object") {
        failed++;
        continue;
      }
      try {
        await webpush.sendNotification(
          raw as unknown as webpush.PushSubscription,
          pushPayload,
          { TTL: 86400, urgency: "high" },
        );
        sent++;
      } catch (e) {
        failed++;
        const st = (e as { statusCode?: number })?.statusCode;
        if (st) lastStatus = st;
        console.warn("[portal-push-outstanding-feedback] send fail", st, e);
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

    totalSent += sent;
    results.push({
      userId: t.userId,
      pending: n,
      sent,
      subs: subs.length,
      failed,
      lastStatus: lastStatus || undefined,
    });
  }

  return jsonPushResponse({
    ok: true,
    sessionDate,
    sent: totalSent,
    staffTargets: targets.length,
    results,
  });
});
