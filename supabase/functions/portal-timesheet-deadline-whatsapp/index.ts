// @ts-nocheck — Timesheet reminder: 23:00 Europe/London on the 24th.
// WhatsApp to staff who have not submitted the cycle that ends that day.
// Skips payroll-out staff (Andres, Angel, Giuseppe, demo) and Victor,
// Javi Palankas, Raul.
//
// Cron is UTC. 23:00 London = 22:00 UTC (BST) or 23:00 UTC (GMT), day 24.
// Manual: POST {"force":true,"dryRun":true}
//
// Deploy: supabase functions deploy portal-timesheet-deadline-whatsapp --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  jsonPushResponse,
  PORTAL_PUSH_CORS_HEADERS,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";
import {
  flattenWhatsappTemplateBody,
  normalizeParentPhoneE164,
  sendParentMobileMessage,
} from "../_shared/portal_parent_messaging.ts";

const KIND = "timesheet_deadline_wa";
const TIMESHEET_URL = "https://clubsensational-staff.vercel.app/timesheet.html";

function londonNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  const day = Number(get("day"));
  const month = Number(get("month"));
  const year = Number(get("year"));
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    year,
    month,
    day,
    hour,
    minute: Number(get("minute") || 0),
  };
}

function inWindow(london: { day: number; hour: number }): boolean {
  return london.day === 24 && london.hour === 23;
}

function periodMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function cycleLabel(year: number, month: number): string {
  const end = new Date(Date.UTC(year, month - 1, 24));
  const start = new Date(Date.UTC(year, month - 2, 25));
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  return `${fmt(start)} to ${fmt(end)}`;
}

/** Payroll-out, plus people who do not get this reminder. */
function skipReminder(username: string, fullName: string): boolean {
  const blob = `${username} ${fullName}`.toLowerCase();
  if (/\bdemo\b/.test(blob)) return true;
  if (/\bandres\b/.test(blob) || /\bangel\b/.test(blob) || /\bgiuseppe\b/.test(blob)) return true;
  if (/\bvictor\b/.test(blob) || /\braul\b/.test(blob)) return true;
  if (/\bpalankas\b/.test(blob)) return true;
  return false;
}

function firstName(fullName: string, username: string): string {
  const fromFull = String(fullName || "").trim().split(/\s+/)[0];
  if (fromFull) return fromFull;
  return String(username || "").trim().split(/\s+/)[0] || "there";
}

function buildBody(first: string, range: string): string {
  return (
    `Hola ${first},\n\n` +
    `Recordatorio: el timesheet del ${range} sigue sin enviarse.\n\n` +
    `Abre el Staff Portal y pulsa Submit esta noche, antes de medianoche:\n` +
    `${TIMESHEET_URL}\n\n` +
    `Si no lo envias a tiempo, hay una penalizacion de 5 libras y las horas pasan a la nomina del mes siguiente.\n\n` +
    `Gracias,\nOficina clubSENsational`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: PORTAL_PUSH_CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: PORTAL_PUSH_CORS_HEADERS });
  }
  const forbidden = verifyPortalPushWebhook(req);
  if (forbidden) return forbidden;

  let force = false;
  let dryRun = false;
  try {
    const body = await req.json();
    force = body?.force === true;
    dryRun = body?.dryRun === true;
  } catch {
    /* cron body */
  }

  const london = londonNow();
  if (!force && !inWindow(london)) {
    return jsonPushResponse({
      ok: true,
      skipped: true,
      reason: "outside 23:00 London on the 24th",
      london,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return new Response("Server misconfigured", { status: 500, headers: PORTAL_PUSH_CORS_HEADERS });
  }
  const admin = createClient(supabaseUrl, serviceKey);
  const period = periodMonthIso(london.year, london.month);
  const range = cycleLabel(london.year, london.month);

  const [
    { data: sheets, error: tsErr },
    { data: rates },
    { data: roleRates },
    { data: profs },
    { data: starts },
    { data: contracts },
  ] = await Promise.all([
    admin.from("staff_timesheets").select("submitted_by_user_id").eq("period_month", period),
    admin.from("staff_pay_rates").select("user_id"),
    admin.from("staff_role_rates").select("user_id"),
    admin.from("staff_profiles").select("id, full_name, username, phone_e164"),
    admin.from("staff_payroll_start").select("user_id, start_month"),
    admin.from("staff_timesheet_imports").select("user_id").eq("pay_type", "contract"),
  ]);
  if (tsErr) return jsonPushResponse({ ok: false, error: tsErr.message }, 500);

  const submitted = new Set((sheets || []).map((r) => String(r.submitted_by_user_id || "")));
  const expected = new Set<string>();
  for (const r of rates || []) {
    const id = String(r.user_id || "");
    if (id) expected.add(id);
  }
  for (const r of roleRates || []) {
    const id = String(r.user_id || "");
    if (id) expected.add(id);
  }
  const contractIds = new Set((contracts || []).map((r) => String(r.user_id || "")).filter(Boolean));
  const startById = new Map<string, string>();
  for (const r of starts || []) {
    const id = String(r.user_id || "");
    const sm = String(r.start_month || "").slice(0, 10);
    if (id && sm) startById.set(id, sm);
  }

  const targets = [];
  for (const p of profs || []) {
    const id = String(p.id || "");
    if (!id || !expected.has(id) || submitted.has(id) || contractIds.has(id)) continue;
    const sm = startById.get(id);
    if (sm && sm > period) continue;
    const username = String(p.username || "");
    const fullName = String(p.full_name || "");
    if (skipReminder(username, fullName)) continue;
    const phone = p.phone_e164 ? normalizeParentPhoneE164(String(p.phone_e164)) : null;
    targets.push({
      id,
      username,
      name: fullName || username,
      first: firstName(fullName, username),
      phone,
    });
  }
  targets.sort((a, b) => a.name.localeCompare(b.name));

  if (dryRun) {
    return jsonPushResponse({
      ok: true,
      dryRun: true,
      period,
      range,
      london,
      targets: targets.map((t) => ({
        username: t.username,
        name: t.name,
        hasPhone: !!t.phone,
      })),
    });
  }

  const sent = [];
  const skipped = [];
  for (const t of targets) {
    if (!t.phone) {
      skipped.push({ username: t.username, reason: "no_phone" });
      continue;
    }
    const { data: prior } = await admin
      .from("portal_staff_notify_log")
      .select("id")
      .eq("kind", KIND)
      .eq("staff_profile_id", t.id)
      .contains("meta", { period_month: period })
      .limit(1);
    if (prior && prior.length) {
      skipped.push({ username: t.username, reason: "already_sent" });
      continue;
    }
    const body = buildBody(t.first, range);
    const templateBody = flattenWhatsappTemplateBody(body);
    const result = await sendParentMobileMessage(t.phone, templateBody, {
      kind: "staff_contact_update",
    });
    await admin.from("portal_staff_notify_log").insert({
      sent_by_user_id: null,
      sent_by_email: "system@clubsensational.org",
      kind: KIND,
      channel: "whatsapp",
      staff_profile_id: t.id,
      staff_username: t.username,
      staff_display_name: t.name,
      staff_phone: t.phone,
      subject: `Timesheet reminder - ${range}`,
      body_text: body,
      whatsapp_status: result.ok ? "sent" : "failed",
      whatsapp_message_id: result.ok ? result.id : null,
      error_detail: result.ok ? null : result.error,
      meta: { campaign: KIND, period_month: period, range },
    });
    if (result.ok) sent.push({ username: t.username, name: t.name });
    else skipped.push({ username: t.username, reason: result.error || "send_failed" });
    await new Promise((r) => setTimeout(r, 350));
  }

  return jsonPushResponse({
    ok: true,
    period,
    range,
    sent: sent.length,
    skipped,
    targets: sent,
  });
});
