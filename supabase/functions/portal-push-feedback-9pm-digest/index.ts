// @ts-nocheck — Edge Function (Deno). Daily 09:00 Europe/London admin alert for yesterday's missing session feedback.
//
// Secrets: same as portal-push-dispatch-admin-alert (VAPID_*, SUPABASE_*, PORTAL_PUSH_*)
//   PORTAL_PUSH_WEBHOOK_SECRET — cron / manual invoke header x-portal-webhook-secret
//
// Schedule (pg_cron migration 20260609120000_portal_late_feedback_9am_digest.sql):
//   0 8 * * * UTC ≈ 09:00 London (BST); 08:00 GMT in winter — adjust if needed
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

function londonPartsForDate(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return { y, m, d: day };
}

function londonIsoFromParts(y: string, m: string, d: string): string {
  return `${y}-${m}-${d}`;
}

function londonTodayIso(): string {
  const { y, m, d } = londonPartsForDate(new Date());
  return londonIsoFromParts(y, m, d);
}

function londonYesterdayIso(): string {
  const { y, m, d } = londonPartsForDate(new Date(Date.now() - 86400000));
  return londonIsoFromParts(y, m, d);
}

function weekdayLongForIso(iso: string): string {
  const dt = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(dt);
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
  const shiftDateIso = londonYesterdayIso();
  const weekday = weekdayLongForIso(shiftDateIso);

  const { data: dedupeHit, error: dedupeErr } = await admin
    .from(DEDUPE_TABLE)
    .select("id")
    .eq("digest_date", shiftDateIso)
    .maybeSingle();
  if (dedupeErr) {
    console.error("[portal-feedback-9am] dedupe read", dedupeErr);
    return jsonPushResponse({ error: dedupeErr.message }, 500);
  }
  if (dedupeHit) {
    return jsonPushResponse({
      skipped: true,
      reason: "already sent",
      shiftDate: shiftDateIso,
    });
  }

  const { data: datedRoster, error: datedErr } = await admin
    .from("portal_roster_rows")
    .select("client_name, time_slot, service, instructors, session_date, day")
    .eq("status", "active")
    .eq("session_date", shiftDateIso);
  if (datedErr) {
    console.error("[portal-feedback-9am] roster dated", datedErr);
    return jsonPushResponse({ error: datedErr.message }, 500);
  }
  const { data: templateRoster, error: templateErr } = await admin
    .from("portal_roster_rows")
    .select("client_name, time_slot, service, instructors, session_date, day")
    .eq("status", "active")
    .is("session_date", null)
    .ilike("day", weekday);
  if (templateErr) {
    console.error("[portal-feedback-9am] roster template", templateErr);
    return jsonPushResponse({ error: templateErr.message }, 500);
  }
  const rosterRows = [...(datedRoster || []), ...(templateRoster || [])];

  const { data: feedbackRows, error: fbErr } = await admin
    .from("session_feedback")
    .select("client_name, session_date")
    .eq("session_date", shiftDateIso);
  if (fbErr) {
    console.error("[portal-feedback-9am] feedback", fbErr);
    return jsonPushResponse({ error: fbErr.message }, 500);
  }

  const { data: absentRows, error: absErr } = await admin
    .from("portal_staff_session_quick_marks")
    .select("client_name, session_date")
    .eq("session_date", shiftDateIso)
    .eq("mark_type", "absent");
  if (absErr) {
    console.error("[portal-feedback-9am] absent marks", absErr);
    return jsonPushResponse({ error: absErr.message }, 500);
  }

  const { data: cancelRows, error: canErr } = await admin
    .from("cancellation_reports")
    .select("client_name, session_date")
    .eq("session_date", shiftDateIso);
  if (canErr) {
    console.error("[portal-feedback-9am] cancellations", canErr);
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
    await admin.from(DEDUPE_TABLE).insert({
      digest_date: shiftDateIso,
      missing_count: 0,
    });
    return jsonPushResponse({
      ok: true,
      sent: 0,
      missing: 0,
      shiftDate: shiftDateIso,
    });
  }

  let adminIds: string[];
  try {
    adminIds = await loadAdminCeoUserIds(admin);
  } catch (e) {
    return jsonPushResponse({ error: String(e) }, 500);
  }
  if (!adminIds.length) {
    return jsonPushResponse({
      ok: true,
      sent: 0,
      targets: 0,
      missing: missing.length,
      shiftDate: shiftDateIso,
    });
  }

  const sample = missing.slice(0, 4).join(", ");
  const more = missing.length > 4 ? ` +${missing.length - 4} more` : "";
  const title = `Late shift feedback · ${shiftDateIso}`;
  const body = clampPushBody(
    `${missing.length} session(s) from ${weekday}'s shift still missing feedback: ${sample}${more}`,
  );

  const notifyUrl = `${openBase}?portalOpen=alerts`;
  const pushPayload = JSON.stringify({
    title,
    body,
    url: notifyUrl,
    portalOpen: "alerts",
    tag: `admin-feedback-late-${shiftDateIso}`,
    requireInteraction: true,
  });

  try {
    const { sent, targets } = await sendPushPayloadToUserIds(
      admin,
      adminIds,
      pushPayload,
    );
    await admin.from(DEDUPE_TABLE).insert({
      digest_date: shiftDateIso,
      missing_count: missing.length,
    });
    return jsonPushResponse({
      ok: true,
      sent,
      targets,
      missing: missing.length,
      shiftDate: shiftDateIso,
      runDate: londonTodayIso(),
    });
  } catch (e) {
    console.error("[portal-feedback-9am] send", e);
    return jsonPushResponse({ error: String(e) }, 500);
  }
});
