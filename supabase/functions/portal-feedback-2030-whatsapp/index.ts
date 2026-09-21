// @ts-nocheck — Feedback WhatsApp: 20:00 then 20:30 Europe/London weekdays;
//   Saturday/Sunday 18:00 then 18:30. Second wave only if still outstanding.
//
// Secrets: SUPABASE_*, META_WHATSAPP_*, PORTAL_STAFF_WHATSAPP_TEMPLATE,
//   PORTAL_PUSH_WEBHOOK_SECRET (header x-portal-webhook-secret)
//
// Cron (UTC; function gates on London wall clock):
//   0 19,20 * * 1-5  body {wave:"2000"}  — Mon-Fri 20:00 London
//   30 19,20 * * 1-5 body {wave:"2030"}  — Mon-Fri 20:30 London
//   0 17,18 * * 0,6  body {wave:"2000"}  — Sat/Sun 18:00 London
//   30 17,18 * * 0,6 body {wave:"2030"}  — Sat/Sun 18:30 London
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
  applyFeedback2030BoardPolicy,
  applyScheduleOverridesToFeedback2030Slots,
  datedFallbackSlots,
  dropSlotsForUnavailableStaff,
  FEEDBACK_2030_MADRE_TERM_KEYS,
  mergeFeedback2030Slots,
  outstandingByStaff,
  resolveProfileForStaffKey,
  scrubFadiOffDayCentreSlots,
  slotsFromCapacityChainOccupants,
  slotsFromMadre,
  slotsFromRosterRows,
  type Feedback2030KeyRow,
  type Feedback2030OccupantSlot,
  type Feedback2030OverrideRow,
  type Feedback2030Row,
  type Feedback2030StaffDebt,
  type Feedback2030UnavailabilityRow,
} from "../_shared/portal_feedback_2030_match.ts";
import standingOccupants from "../_shared/portal_capacity_chain_standing_occupants.json" with {
  type: "json",
};

const DEDUPE_TABLE = "portal_feedback_2030_wa_sent";
/** Staff app host (Vercel). Override with PORTAL_STAFF_DASHBOARD_URL if needed. */
const PORTAL_URL =
  String(Deno.env.get("PORTAL_STAFF_DASHBOARD_URL") || "").trim() ||
  "https://clubsensational-staff.vercel.app/staff_dashboard.html";
/** Victor = office; Michelle = do not nag on 20:00 feedback WA (office rule). */
const SKIP_USERNAMES = new Set(["victor", "michelle"]);

function previousSundayIso(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getUTCDay(); // 0 Sun
  if (day === 0) return iso;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

function mergeStaffDebts(
  lists: Feedback2030StaffDebt[][],
): Feedback2030StaffDebt[] {
  const map = new Map<string, Feedback2030StaffDebt>();
  for (const list of lists) {
    for (const d of list || []) {
      const key = String(d.staffKey || "").toLowerCase();
      if (!key) continue;
      const ex = map.get(key);
      if (!ex) {
        map.set(key, {
          staffKey: d.staffKey,
          staffLabel: d.staffLabel,
          pending: d.pending,
          sample: (d.sample || []).slice(0, 4),
        });
        continue;
      }
      ex.pending += d.pending;
      for (const s of d.sample || []) {
        if (ex.sample.length >= 4) break;
        if (ex.sample.indexOf(s) < 0) ex.sample.push(s);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.staffLabel.localeCompare(b.staffLabel));
}

function isLondonWeekend(london) {
  const w = String((london && london.weekday) || "").toLowerCase();
  return w === "saturday" || w === "sunday";
}

function waveClockLabel(wave, london) {
  const weekend = isLondonWeekend(london);
  if (wave === "2030") return weekend ? "18:30" : "20:30";
  return weekend ? "18:00" : "20:00";
}

function resolveWave(raw, london) {
  const w = String(raw || "").trim();
  if (w === "2000" || w === "2030") return w;
  const hourWant = isLondonWeekend(london) ? 18 : 20;
  if (london.hour === hourWant && london.minute >= 25) return "2030";
  if (london.hour === hourWant) return "2000";
  return "";
}

function inLondonWaveWindow(wave, london) {
  const hourWant = isLondonWeekend(london) ? 18 : 20;
  if (london.hour !== hourWant) return false;
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

function buildBody(first, pending, sample, wave, london) {
  const n = Math.max(1, pending);
  const list = sample.slice(0, 3).join(", ");
  const more = n > 3 ? ` (+${n - 3} more)` : "";
  const weekend = isLondonWeekend(london);
  const timeLine =
    wave === "2030"
      ? weekend
        ? "Final reminder for today - please send them now."
        : "Final reminder: 30 minutes left - the day closes at 9:00pm."
      : weekend
        ? "Please send them now."
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

  async function outstandingDebtsForIso(dayIso: string) {
    const { data: datedRoster } = await admin
      .from("portal_roster_rows")
      .select("client_name, time_slot, service, instructors, session_date, day, area")
      .eq("status", "active")
      .eq("session_date", dayIso);
    const weekday = new Date(`${dayIso}T12:00:00`).toLocaleDateString("en-GB", {
      weekday: "long",
    });
    const { data: templateRoster } = await admin
      .from("portal_roster_rows")
      .select("client_name, time_slot, service, instructors, session_date, day, area")
      .eq("status", "active")
      .is("session_date", null)
      .ilike("day", weekday);

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
      .eq("session_date", dayIso)
      .eq("status", "active");
    const { data: offRows } = await admin
      .from("staff_unavailability")
      .select("name_key, staff_name")
      .eq("off_date", dayIso);

    /* B1b/B1c: roster first; capacity-chain occupants gap-fill when roster thin;
     * dated fallback + MADRE last. First list in mergeFeedback2030Slots wins. */
    const rosterSlots = slotsFromRosterRows(
      [...(datedRoster || []), ...(templateRoster || [])],
      dayIso,
    );
    const occupantsSlots = slotsFromCapacityChainOccupants(
      (standingOccupants as { bySlotId?: Record<string, Feedback2030OccupantSlot> })?.bySlotId,
      dayIso,
    );
    let slots = mergeFeedback2030Slots([
      rosterSlots,
      occupantsSlots,
      datedFallbackSlots(dayIso),
      slotsFromMadre(madreDoc, dayIso),
    ]);
    slots = scrubFadiOffDayCentreSlots(slots, dayIso);
    slots = applyFeedback2030BoardPolicy(slots, dayIso);
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
      .eq("session_date", dayIso);
    const { data: quickMarkRows } = await admin
      .from("portal_staff_session_quick_marks")
      .select("portal_session_key, session_date, mark_type, staff_user_id")
      .eq("session_date", dayIso)
      .in("mark_type", ["absent", "feedback_done"]);
    const { data: cancelRows } = await admin
      .from("cancellation_reports")
      .select("client_name, session_date, portal_session_key")
      .eq("session_date", dayIso);

    const { data: profiles } = await admin
      .from("staff_profiles")
      .select("id, username, full_name, phone_e164, app_role, is_active")
      .eq("is_active", true);

    const staffIdByKey: Record<string, string> = {};
    for (const p of profiles || []) {
      const un = String(p.username || "");
      if (un) staffIdByKey[un.toLowerCase().replace(/[^a-z0-9]+/g, "")] = String(p.id);
    }

    const debts = outstandingByStaff(slots, dayIso, {
      feedbackRows: (feedbackRows || []) as Feedback2030Row[],
      cancelRows: (cancelRows || []) as Feedback2030KeyRow[],
      absentMarks: ((quickMarkRows || []) as Feedback2030KeyRow[]).filter((m) => m.mark_type === "absent"),
      feedbackDoneMarks: ((quickMarkRows || []) as Feedback2030KeyRow[]).filter(
        (m) => m.mark_type === "feedback_done",
      ),
      staffIdByKey,
    });
    return { slots, debts, madreTermKey, profiles: profiles || [] };
  }

  const todayPack = await outstandingDebtsForIso(iso);
  let debts = todayPack.debts;
  let slots = todayPack.slots;
  let madreTermKey = todayPack.madreTermKey;
  const profiles = todayPack.profiles;
  const debtDays = [iso];

  /* Monday 20:00 also nags open Sunday books (e.g. Javier pool + Luliya cover). */
  const wd = new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long" });
  if (wd === "Monday") {
    const sunIso = previousSundayIso(iso);
    if (sunIso && sunIso !== iso) {
      const sunPack = await outstandingDebtsForIso(sunIso);
      debts = mergeStaffDebts([todayPack.debts, sunPack.debts]);
      slots = todayPack.slots.concat(sunPack.slots);
      debtDays.push(sunIso);
    }
  }

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
      debtDays,
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
    const body = buildBody(t.staffLabel, t.pending, t.sample, wave, london);
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
      subject: `Feedback reminder - ${iso} ${waveClockLabel(wave, london)}`,
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
    debtDays,
    slotCount: slots.length,
    sent: sent.length,
    skipped,
    targets: sent,
  });
});
