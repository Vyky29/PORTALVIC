// @ts-nocheck — 20:00 then 20:30 Europe/London WhatsApp if same-day feedback still open.
//
// Secrets: SUPABASE_*, META_WHATSAPP_*, PORTAL_STAFF_WHATSAPP_TEMPLATE,
//   PORTAL_PUSH_WEBHOOK_SECRET (header x-portal-webhook-secret)
//
// Cron:
//   0 19,20 * * * UTC  body {wave:"2000"}  — 20:00 London
//   30 19,20 * * * UTC body {wave:"2030"}  — 20:30 London (only if still outstanding)
// Manual: POST {"force":true,"wave":"2000"} or {"dryRun":true,"force":true,"wave":"2030"}
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
  applyScheduleOverridesToFeedback2030Slots,
  datedFallbackSlots,
  dropSlotsForUnavailableStaff,
  FEEDBACK_2030_MADRE_TERM_KEYS,
  mergeFeedback2030Slots,
  outstandingByStaff,
  remapAutumnFeedback2030Slots,
  resolveProfileForStaffKey,
  slotsFromMadre,
  slotsFromRosterRows,
  type Feedback2030KeyRow,
  type Feedback2030OverrideRow,
  type Feedback2030Row,
  type Feedback2030UnavailabilityRow,
} from "../_shared/portal_feedback_2030_match.ts";

const DEDUPE_TABLE = "portal_feedback_2030_wa_sent";
/** Staff app host (Vercel). Override with PORTAL_STAFF_DASHBOARD_URL if needed. */
const PORTAL_URL =
  String(Deno.env.get("PORTAL_STAFF_DASHBOARD_URL") || "").trim() ||
  "https://clubsensational-staff.vercel.app/staff_dashboard.html";
const SKIP_USERNAMES = new Set(["victor"]);

function resolveWave(raw, london) {
  const w = String(raw || "").trim();
  if (w === "2000" || w === "2030") return w;
  if (london.hour === 20 && london.minute >= 25) return "2030";
  if (london.hour === 20) return "2000";
  return "";
}

function inLondonWaveWindow(wave, london) {
  if (london.hour !== 20) return false;
  if (wave === "2000") return london.minute <= 12;
  if (wave === "2030") return london.minute >= 25 && london.minute <= 45;
  return false;
}

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
  javi: "Javi",
  javier: "Javier",
  luliya: "Luliya",
};

function greetName(username: string, fullName: string, fallback: string): string {
  const un = String(username || "").toLowerCase();
  if (GREET[un]) return GREET[un];
  const first = firstName(fullName);
  if (!first || /^palankas$/i.test(first)) return GREET[un] || fallback || "there";
  return first;
}

function buildBody(first, pending, sample, wave) {
  const n = Math.max(1, pending);
  const list = sample.slice(0, 3).join(", ");
  const more = n > 3 ? ` (+${n - 3} more)` : "";
  const timeLine =
    wave === "2030"
      ? "Final reminder: 30 minutes left - the day closes at 9:00pm."
      : "You have one hour - the day closes at 9:00pm.";
  return (
    `Hi ${first},\n\n` +
    `Today's session feedback is not complete yet (${n} left${list ? ": " + list + more : ""}).\n\n` +
    `${timeLine} Please send them now in the Staff Portal (Today):\n` +
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
  let bodyWave = "";
  try {
    const body = await req.json();
    force = body?.force === true;
    dryRun = body?.dryRun === true;
    sessionDate = String(body?.sessionDate || "").trim().slice(0, 10);
    bodyWave = String(body?.wave || "").trim();
  } catch {
    /* cron empty body */
  }

  const london = londonParts();
  const wave = resolveWave(bodyWave, london);
  if (!wave) {
    return jsonPushResponse({
      skipped: true,
      reason: "unknown wave",
      londonHour: london.hour,
      londonMinute: london.minute,
    });
  }
  if (!force && !inLondonWaveWindow(wave, london)) {
    return jsonPushResponse({
      skipped: true,
      reason: "outside London window for wave " + wave,
      wave,
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

  /** Autumn 2026 standing lives on summer-2026 until autumn-2026 term_key is cut over. */
  let madreDoc = null;
  let madreTermKey = "";
  for (const termKey of FEEDBACK_2030_MADRE_TERM_KEYS) {
    const { data: madreRow } = await admin
      .from("portal_madre_document")
      .select("term_key, document")
      .eq("term_key", termKey)
      .maybeSingle();
    if (madreRow?.document) {
      madreDoc = madreRow.document;
      madreTermKey = String(madreRow.term_key || termKey);
      break;
    }
  }

  const { data: overrideRows } = await admin
    .from("schedule_overrides")
    .select(
      "override_type, status, anchor_staff_id, anchor_client_id, anchor_time_slot_label, payload",
    )
    .eq("session_date", iso)
    .eq("status", "active");
  const { data: offRows } = await admin
    .from("staff_unavailability")
    .select("name_key, staff_name")
    .eq("off_date", iso);

  let slots = mergeFeedback2030Slots([
    datedFallbackSlots(iso),
    slotsFromMadre(madreDoc, iso),
    slotsFromRosterRows([...(datedRoster || []), ...(templateRoster || [])], iso),
  ]);
  slots = remapAutumnFeedback2030Slots(slots, iso);
  /* Covers / clears / absences: nag the worker who ran the session, not the original book. */
  slots = applyScheduleOverridesToFeedback2030Slots(
    slots,
    (overrideRows || []) as Feedback2030OverrideRow[],
  );
  slots = dropSlotsForUnavailableStaff(
    slots,
    (offRows || []) as Feedback2030UnavailabilityRow[],
  );

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
    const profile = resolveProfileForStaffKey(profiles || [], debt.staffKey);
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
      wave,
      shiftDate: iso,
      madreTermKey: madreTermKey || null,
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

  const kind = wave === "2030" ? "feedback_2030_wa" : "feedback_2000_wa";
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
      .eq("wave", wave)
      .maybeSingle();
    if (prior) {
      skipped.push({ username: t.username, reason: "already_sent" });
      continue;
    }
    const body = buildBody(t.staffLabel, t.pending, t.sample, wave);
    const templateBody = flattenWhatsappTemplateBody(body);
    const result = await sendParentMobileMessage(t.phone, templateBody, {
      kind: "staff_contact_update",
    });
    await admin.from("portal_staff_notify_log").insert({
      sent_by_user_id: null,
      sent_by_email: "system@clubsensational.org",
      kind: kind,
      channel: "whatsapp",
      staff_profile_id: t.profileId,
      staff_username: t.username,
      staff_display_name: t.staffLabel,
      staff_phone: t.phone,
      subject: `Feedback reminder - ${iso} ${wave === "2030" ? "20:30" : "20:00"}`,
      body_text: body,
      whatsapp_status: result.ok ? "sent" : "failed",
      whatsapp_message_id: result.ok ? result.id : null,
      error_detail: result.ok ? null : result.error,
      meta: {
        campaign: kind,
        wave,
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
        wave,
      });
      sent.push({ username: t.username, pending: t.pending, id: result.id });
    } else {
      skipped.push({ username: t.username, reason: result.error || "send_failed" });
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  return jsonPushResponse({
    ok: true,
    wave,
    shiftDate: iso,
    slotCount: slots.length,
    sent: sent.length,
    skipped,
    targets: sent,
  });
});
