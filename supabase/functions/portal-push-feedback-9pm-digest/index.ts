// @ts-nocheck — Edge Function (Deno). Daily 21:00 Europe/London admin digest for missing session feedback.
//
// Secrets: same as portal-push-dispatch-admin-alert (VAPID_*, SUPABASE_*, PORTAL_PUSH_*)
//   PORTAL_PUSH_WEBHOOK_SECRET — cron / manual invoke header x-portal-webhook-secret
//
// Schedule (Supabase Dashboard → Cron or pg_cron):
//   0 21 * * * Europe/London → POST .../portal-push-feedback-9pm-digest
//   Header: x-portal-webhook-secret: <PORTAL_PUSH_WEBHOOK_SECRET>
//
// Deploy: supabase functions deploy portal-push-feedback-9pm-digest

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  adminPushOpenBase,
  clampPushBody,
  initVapidFromEnv,
  jsonPushResponse,
  loadAdminCeoUserIds,
  PORTAL_PUSH_CORS_HEADERS,
  sendPushPayloadToUserIds,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";

const DEDUPE_TABLE = "portal_webpush_feedback_9pm_sent";

function londonTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

function londonWeekdayLong(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
  }).format(new Date());
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const openBase = adminPushOpenBase();
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
  const todayIso = londonTodayIso();
  const weekday = londonWeekdayLong();

  const { data: dedupeHit, error: dedupeErr } = await admin
    .from(DEDUPE_TABLE)
    .select("id")
    .eq("digest_date", todayIso)
    .maybeSingle();
  if (dedupeErr) {
    console.error("[portal-feedback-9pm] dedupe read", dedupeErr);
    return jsonPushResponse({ error: dedupeErr.message }, 500);
  }
  if (dedupeHit) {
    return jsonPushResponse({ skipped: true, reason: "already sent", date: todayIso });
  }

  const { data: datedRoster, error: datedErr } = await admin
    .from("portal_roster_rows")
    .select("client_name, time_slot, service, instructors, session_date, day")
    .eq("status", "active")
    .eq("session_date", todayIso);
  if (datedErr) {
    console.error("[portal-feedback-9pm] roster dated", datedErr);
    return jsonPushResponse({ error: datedErr.message }, 500);
  }
  const { data: templateRoster, error: templateErr } = await admin
    .from("portal_roster_rows")
    .select("client_name, time_slot, service, instructors, session_date, day")
    .eq("status", "active")
    .is("session_date", null)
    .ilike("day", weekday);
  if (templateErr) {
    console.error("[portal-feedback-9pm] roster template", templateErr);
    return jsonPushResponse({ error: templateErr.message }, 500);
  }
  const rosterRows = [...(datedRoster || []), ...(templateRoster || [])];

  const { data: feedbackRows, error: fbErr } = await admin
    .from("session_feedback")
    .select("client_name, session_date")
    .eq("session_date", todayIso);
  if (fbErr) {
    console.error("[portal-feedback-9pm] feedback", fbErr);
    return jsonPushResponse({ error: fbErr.message }, 500);
  }

  const { data: absentRows, error: absErr } = await admin
    .from("portal_staff_session_quick_marks")
    .select("client_name, session_date")
    .eq("session_date", todayIso)
    .eq("mark_type", "absent");
  if (absErr) {
    console.error("[portal-feedback-9pm] absent marks", absErr);
    return jsonPushResponse({ error: absErr.message }, 500);
  }

  const { data: cancelRows, error: canErr } = await admin
    .from("cancellation_reports")
    .select("client_name, session_date")
    .eq("session_date", todayIso);
  if (canErr) {
    console.error("[portal-feedback-9pm] cancellations", canErr);
    return jsonPushResponse({ error: canErr.message }, 500);
  }

  const done = new Set(
    (feedbackRows || []).map((r) =>
      String(r.client_name || "").trim().toLowerCase()
    ),
  );
  const excused = new Set([
    ...(absentRows || []).map((r) =>
      String(r.client_name || "").trim().toLowerCase()
    ),
    ...(cancelRows || []).map((r) =>
      String(r.client_name || "").trim().toLowerCase()
    ),
  ]);

  const missing: string[] = [];
  (rosterRows || []).forEach((r) => {
    const name = String(r.client_name || "").trim();
    if (!name) return;
    const key = name.toLowerCase();
    if (done.has(key) || excused.has(key)) return;
    if (!missing.includes(name)) missing.push(name);
  });

  if (!missing.length) {
    await admin.from(DEDUPE_TABLE).insert({ digest_date: todayIso, missing_count: 0 });
    return jsonPushResponse({ ok: true, sent: 0, missing: 0, date: todayIso });
  }

  let adminIds: string[];
  try {
    adminIds = await loadAdminCeoUserIds(admin);
  } catch (e) {
    return jsonPushResponse({ error: String(e) }, 500);
  }
  if (!adminIds.length) {
    return jsonPushResponse({ ok: true, sent: 0, targets: 0, missing: missing.length });
  }

  const sample = missing.slice(0, 4).join(", ");
  const more = missing.length > 4 ? ` +${missing.length - 4} more` : "";
  const title = `Feedback missing · ${todayIso}`;
  const body = clampPushBody(
    `${missing.length} session(s) still need feedback by 9pm: ${sample}${more}`,
  );

  const notifyUrl = `${openBase}?portalOpen=alerts`;
  const pushPayload = JSON.stringify({
    title,
    body,
    url: notifyUrl,
    portalOpen: "alerts",
    tag: `admin-feedback-9pm-${todayIso}`,
    requireInteraction: true,
  });

  try {
    const { sent, targets } = await sendPushPayloadToUserIds(
      admin,
      adminIds,
      pushPayload,
    );
    await admin.from(DEDUPE_TABLE).insert({
      digest_date: todayIso,
      missing_count: missing.length,
    });
    return jsonPushResponse({
      ok: true,
      sent,
      targets,
      missing: missing.length,
      date: todayIso,
    });
  } catch (e) {
    console.error("[portal-feedback-9pm] send", e);
    return jsonPushResponse({ error: String(e) }, 500);
  }
});
