// @ts-nocheck — Edge Function (Deno). Cursor uses Node TypeScript; ignores URL/npm imports and Deno.* here.
//
// Sends a Web Push when a row is inserted into public.portal_staff_announcements so notices
// reach staff/leads even when the portal app is closed (phone locked / browser not open).
//
// Deploy checklist (same VAPID + secrets as portal-push-dispatch-schedule-override):
// 1) Edge secrets already set for roster push: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT,
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PORTAL_PUSH_OPEN_URL, PORTAL_PUSH_WEBHOOK_SECRET.
// 2) Run migration 20260601140000_portal_webpush_announcement_sent.sql (dedupe ledger).
// 3) Deploy this function: supabase functions deploy portal-push-dispatch-announcement
// 4) Supabase Dashboard → Database → Webhooks: table portal_staff_announcements, event INSERT,
//    URL https://<ref>.supabase.co/functions/v1/portal-push-dispatch-announcement,
//    HTTP header x-portal-webhook-secret: <PORTAL_PUSH_WEBHOOK_SECRET>.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import webpush from "npm:web-push@3.6.7";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-portal-webhook-secret",
};

type StaffProfile = {
  id: string;
  app_role: string | null;
  staff_role: string | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampBody(s: string, max = 160): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const expected = Deno.env.get("PORTAL_PUSH_WEBHOOK_SECRET") ?? "";
  const got = req.headers.get("x-portal-webhook-secret") ?? "";
  if (!expected || got !== expected) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ??
    "mailto:hello@clubsensational.org";
  const openBase = (Deno.env.get("PORTAL_PUSH_OPEN_URL") ?? "").replace(
    /\/$/,
    "",
  );

  if (
    !supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate || !openBase
  ) {
    console.error(
      "[portal-push-announcement] missing env (SUPABASE_*, VAPID_*, PORTAL_PUSH_OPEN_URL)",
    );
    return new Response("Server misconfigured", {
      status: 500,
      headers: corsHeaders,
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  let payload: {
    type?: string;
    table?: string;
    record?: Record<string, unknown>;
    old_record?: Record<string, unknown> | null;
  };
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400, headers: corsHeaders });
  }

  if (payload.table !== "portal_staff_announcements") {
    return jsonResponse({ skipped: true, reason: "table" });
  }

  const record = payload.record;
  if (!record || typeof record !== "object") {
    return jsonResponse({ skipped: true, reason: "no record" });
  }

  const announcementId = String(record.id ?? "").trim();
  if (!announcementId) {
    return jsonResponse({ skipped: true, reason: "no id" });
  }

  // Honour expiry: don't push notices that are already finished.
  const endsAtRaw = String(record.ends_at ?? "").trim();
  if (endsAtRaw) {
    const endsMs = Date.parse(endsAtRaw);
    if (Number.isFinite(endsMs) && endsMs < Date.now()) {
      return jsonResponse({ skipped: true, reason: "expired" });
    }
  }

  const audienceScope = String(record.audience_scope ?? "all_staff").trim();
  const deliveryScope = String(record.delivery_scope ?? "everyone").trim();
  const targetStaffRole = String(record.target_staff_role ?? "").trim();
  const targetUserId = String(record.target_user_id ?? "").trim();

  const admin = createClient(supabaseUrl, serviceKey);

  // Resolve recipient auth user ids, mirroring the table's SELECT RLS.
  const targetUserIds = new Set<string>();

  if (deliveryScope === "single_user") {
    if (targetUserId) targetUserIds.add(targetUserId);
  } else {
    const { data: profiles, error: profErr } = await admin
      .from("staff_profiles")
      .select("id, app_role, staff_role")
      .in("app_role", ["staff", "lead"]);

    if (profErr) {
      console.error("[portal-push-announcement] profiles", profErr);
      return jsonResponse({ error: "profiles" }, 500);
    }

    for (const p of (profiles ?? []) as StaffProfile[]) {
      const role = String(p.app_role ?? "").trim();
      if (deliveryScope === "staff_role") {
        if (
          targetStaffRole &&
          String(p.staff_role ?? "").trim() === targetStaffRole
        ) {
          targetUserIds.add(p.id);
        }
        continue;
      }
      // delivery_scope === 'everyone'
      if (audienceScope === "leads") {
        if (role === "lead") targetUserIds.add(p.id);
      } else {
        // all_staff → staff + leads
        targetUserIds.add(p.id);
      }
    }
  }

  if (!targetUserIds.size) {
    return jsonResponse({ ok: true, sent: 0, targets: 0 });
  }

  const ids = [...targetUserIds];
  const { data: subs, error: subErr } = await admin
    .from("portal_push_subscriptions")
    .select("user_id, endpoint, subscription_json")
    .in("user_id", ids);

  if (subErr) {
    console.error("[portal-push-announcement] subs", subErr);
    return jsonResponse({ error: subErr.message }, 500);
  }

  if (!subs?.length) {
    return jsonResponse({
      ok: true,
      sent: 0,
      targets: ids.length,
      note: "no push subscriptions for targeted users",
    });
  }

  // One push per announcement row (avoids duplicate sends on retried webhooks).
  const { error: dedupeErr } = await admin
    .from("portal_webpush_announcement_sent")
    .insert({ announcement_id: announcementId });

  if (dedupeErr) {
    const msg = dedupeErr.message || "";
    if (
      msg.includes("duplicate") ||
      (dedupeErr as { code?: string }).code === "23505"
    ) {
      return jsonResponse({ skipped: true, reason: "already sent" });
    }
    console.error("[portal-push-announcement] dedupe insert", dedupeErr);
    return jsonResponse({ error: dedupeErr.message }, 500);
  }

  const title = clampBody(String(record.title ?? "clubSENsational"), 80) ||
    "clubSENsational";
  const body = clampBody(String(record.body ?? "New notice in your portal."));
  const notifyUrl = `${openBase}?portalOpen=alerts`;
  const pushPayload = JSON.stringify({
    title,
    body,
    url: notifyUrl,
    portalOpen: "alerts",
  });

  let sent = 0;
  for (const row of subs ?? []) {
    const raw = row.subscription_json;
    if (!raw || typeof raw !== "object") continue;
    try {
      await webpush.sendNotification(
        raw as unknown as webpush.PushSubscription,
        pushPayload,
        { TTL: 86400, urgency: "high" },
      );
      sent++;
    } catch (e) {
      const st = (e as { statusCode?: number })?.statusCode;
      console.warn("[portal-push-announcement] send fail", st, e);
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

  return jsonResponse({ ok: true, sent, targets: ids.length });
});
