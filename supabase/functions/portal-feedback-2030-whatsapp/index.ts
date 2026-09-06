// @ts-nocheck — 20:30 Europe/London WhatsApp to staff with incomplete same-day feedback.
//
// Secrets: SUPABASE_*, META_WHATSAPP_*, PORTAL_STAFF_WHATSAPP_TEMPLATE,
//   PORTAL_PUSH_WEBHOOK_SECRET (header x-portal-webhook-secret)
//
// Cron: 30 19,20 * * * UTC — runs only when London clock is 20:25–20:40.
// Manual: POST {"force":true} or {"dryRun":true,"force":true}
//
// Deploy: supabase functions deploy portal-feedback-2030-whatsapp --no-verify-jwt

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
import {
  datedFallbackSlots,
  mergeFeedback2030Slots,
  outstandingByStaff,
  profileMatchesStaffKey,
  slotsFromMadre,
  slotsFromRosterRows,
  type Feedback2030KeyRow,
  type Feedback2030Row,
} from "../_shared/portal_feedback_2030_match.ts";

const DEDUPE_TABLE = "portal_feedback_2030_wa_sent";
const KIND = "feedback_2030_wa";
const PORTAL_URL = "https://www.clubsensational.org/staff_dashboard.html";
const SKIP_USERNAMES = new Set(["victor"]);

function londonParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    hour,
    minute: Number(get("minute") || 0),
    weekday: get("weekday"),
  };
}

function firstName(raw: string): string {
  return String(raw || "").trim().split(/\s+/)[0] || "";
}

const GREET: Record<string, string> = {
  javi: "Javier",
  javier: "Javier",
};

function greetName(username: string, fullName: string, fallback: string): string {
  const un = String(username || "").toLowerCase();
  if (GREET[un]) return GREET[un];
  const first = firstName(fullName);
  if (!first || /^palankas$/i.test(first)) return GREET[un] || fallback || "there";
  return first;
}

function buildBody(first: string, pending: number, sample: string[]): string {
  const n = Math.max(1, pending);
  const list = sample.slice(0, 3).join(", ");
  const more = n > 3 ? ` (+${n - 3} more)` : "";
  return (
    `Hi ${first},\n\n` +
    `Today's session feedback is not complete yet (${n} left${list ? ": " + list + more : ""}).\n\n` +
    `You have 30 minutes - the day closes at 9:00pm. Please send them now in the Staff Portal (Today):\n` +
    `${PORTAL_URL}\n\n` +
    `After 9:00pm today's hours stay on hold until the office releases them.\n\n` +
    `Thank you,\nclubSENsational office`
  );
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

  let force = false;
  let dryRun = false;
  let sessionDate = "";
  try {
    const body = await req.json();
    force = body?.force === true;
    dryRun = body?.dryRun === true;
    sessionDate = String(body?.sessionDate || "").trim().slice(0, 10);
  } catch {
    /* cron empty body */
  }

  const london = londonParts();
  const inWindow = london.hour === 20 && london.minute >= 25 && london.minute <= 40;
  if (!force && !inWindow) {
    return jsonPushResponse({
      skipped: true,
      reason: "outside London 20:30 window",
      londonHour: london.hour,
      londonMinute: london.minute,
    });
  }

  const iso = /^\d{4}-\d{2}-\d{2}$/.test(sessionDate) ? sessionDate : london.iso;
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return new Response("Server misconfigured", {
      status: 500,
      headers: PORTAL_PUSH_CORS_HEADERS,
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: datedRoster } = await admin
    .from("portal_roster_rows")
    .select("client_name, time_slot, service, instructors, session_date, day, area")
    .eq("status", "active")
    .eq("session_date", iso);
  const weekday = new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
  });
  const { data: templateRoster } = await admin
    .from("portal_roster_rows")
    .select("client_name, time_slot, service, instructors, session_date, day, area")
    .eq("status", "active")
    .is("session_date", null)
    .ilike("day", weekday);

  const { data: madreRow } = await admin
    .from("portal_madre_document")
    .select("document")
    .limit(1)
    .maybeSingle();

  const slots = mergeFeedback2030Slots([
    datedFallbackSlots(iso),
    slotsFromMadre(madreRow?.document || null, iso),
    slotsFromRosterRows([...(datedRoster || []), ...(templateRoster || [])], iso),
  ]);

  const { data: feedbackRows } = await admin
    .from("session_feedback")
    .select("client_name, session_date, portal_session_key, attendance, service, completed_by_name")
    .eq("session_date", iso);
  const { data: quickMarkRows } = await admin
    .from("portal_staff_session_quick_marks")
    .select("portal_session_key, session_date, mark_type, staff_user_id")
    .eq("session_date", iso)
    .in("mark_type", ["absent", "feedback_done"]);
  const { data: cancelRows } = await admin
    .from("cancellation_reports")
    .select("client_name, session_date, portal_session_key")
    .eq("session_date", iso);

  const { data: profiles } = await admin
    .from("staff_profiles")
    .select("id, username, full_name, phone_e164, app_role, is_active")
    .eq("is_active", true);

  const staffIdByKey: Record<string, string> = {};
  for (const p of profiles || []) {
    const un = String(p.username || "");
    if (un) staffIdByKey[un.toLowerCase().replace(/[^a-z0-9]+/g, "")] = String(p.id);
  }

  const debts = outstandingByStaff(slots, iso, {
    feedbackRows: (feedbackRows || []) as Feedback2030Row[],
    cancelRows: (cancelRows || []) as Feedback2030KeyRow[],
    absentMarks: ((quickMarkRows || []) as Feedback2030KeyRow[]).filter((m) => m.mark_type === "absent"),
    feedbackDoneMarks: ((quickMarkRows || []) as Feedback2030KeyRow[]).filter(
      (m) => m.mark_type === "feedback_done",
    ),
    staffIdByKey,
  });

  const targets = [];
  for (const debt of debts) {
    const profile = (profiles || []).find((p) => profileMatchesStaffKey(p, debt.staffKey));
    const username = String(profile?.username || debt.staffKey).toLowerCase();
    if (SKIP_USERNAMES.has(username)) continue;
    const phone = profile?.phone_e164
      ? normalizeParentPhoneE164(String(profile.phone_e164))
      : null;
    targets.push({
      staffKey: debt.staffKey,
      staffLabel: greetName(username, String(profile?.full_name || ""), debt.staffLabel),
      username,
      profileId: profile?.id || null,
      pending: debt.pending,
      sample: debt.sample,
      phone,
    });
  }

  if (dryRun) {
    return jsonPushResponse({
      ok: true,
      dryRun: true,
      shiftDate: iso,
      slotCount: slots.length,
      targets: targets.map((t) => ({
        username: t.username,
        name: t.staffLabel,
        pending: t.pending,
        sample: t.sample,
        hasPhone: !!t.phone,
      })),
    });
  }

  const sent = [];
  const skipped = [];
  for (const t of targets) {
    if (!t.phone || !t.profileId) {
      skipped.push({ username: t.username, reason: t.phone ? "no_profile" : "no_phone" });
      continue;
    }
    const { data: prior } = await admin
      .from(DEDUPE_TABLE)
      .select("id")
      .eq("session_date", iso)
      .eq("staff_user_id", t.profileId)
      .maybeSingle();
    if (prior) {
      skipped.push({ username: t.username, reason: "already_sent" });
      continue;
    }
    const body = buildBody(t.staffLabel, t.pending, t.sample);
    const templateBody = flattenWhatsappTemplateBody(body);
    const result = await sendParentMobileMessage(t.phone, templateBody, {
      kind: "staff_contact_update",
    });
    await admin.from("portal_staff_notify_log").insert({
      sent_by_user_id: null,
      sent_by_email: "system@clubsensational.org",
      kind: KIND,
      channel: "whatsapp",
      staff_profile_id: t.profileId,
      staff_username: t.username,
      staff_display_name: t.staffLabel,
      staff_phone: t.phone,
      subject: `Feedback reminder — ${iso} 20:30`,
      body_text: body,
      whatsapp_status: result.ok ? "sent" : "failed",
      whatsapp_message_id: result.ok ? result.id : null,
      error_detail: result.ok ? null : result.error,
      meta: {
        campaign: KIND,
        session_date: iso,
        pending: t.pending,
        sample: t.sample,
        used_template: true,
      },
    });
    if (result.ok) {
      await admin.from(DEDUPE_TABLE).insert({
        session_date: iso,
        staff_user_id: t.profileId,
        pending_count: t.pending,
      });
      sent.push({ username: t.username, pending: t.pending, id: result.id });
    } else {
      skipped.push({ username: t.username, reason: result.error || "send_failed" });
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  return jsonPushResponse({
    ok: true,
    shiftDate: iso,
    slotCount: slots.length,
    sent: sent.length,
    skipped,
    targets: sent,
  });
});
