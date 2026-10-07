// @ts-nocheck — One WhatsApp the morning before a makeup the parent has not accepted.
// 08:00 Europe/London. Cron is UTC, so 07:00 and 08:00 UTC; the function runs only at London hour 8.
// Manual: POST {"force":true} or {"force":true,"dryRun":true}
//
// Deploy: supabase functions deploy portal-makeup-offer-reminder-whatsapp --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  jsonPushResponse,
  PORTAL_PUSH_CORS_HEADERS,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";
import {
  normalizeParentPhoneE164,
  parentApiMachineFooter,
  sendParentMobileMessage,
} from "../_shared/portal_parent_messaging.ts";

function londonNow(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    hour,
    iso: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

function tomorrowIso(todayIso: string): string {
  const m = String(todayIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function ukDate(iso: string): string {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return m[3] + "/" + m[2] + "/" + m[1];
}

function clean(v: unknown, max = 120): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: PORTAL_PUSH_CORS_HEADERS });
  }
  if (req.method !== "POST") return jsonPushResponse({ ok: false, error: "method" }, 405);
  const forbidden = verifyPortalPushWebhook(req);
  if (forbidden) return forbidden;

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return jsonPushResponse({ ok: false, error: "server_misconfigured" }, 500);

  let body: { force?: boolean; dryRun?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const now = londonNow();
  if (!body.force && now.hour !== 8) {
    return jsonPushResponse({ ok: true, skipped: true, reason: "not 08:00 London", hour: now.hour });
  }
  const sessionDate = tomorrowIso(now.iso);
  if (!sessionDate) return jsonPushResponse({ ok: false, error: "bad date" }, 500);

  const admin = createClient(url, key);
  const { data: offers, error } = await admin
    .from("portal_parent_makeup_offers")
    .select("id, grant_id, parent_person_id, contact_id, venue, session_date, session_time, service_label, instructor_name, status, reminder_sent_at")
    .eq("status", "pending")
    .eq("session_date", sessionDate)
    .is("reminder_sent_at", null)
    .limit(80);
  if (error) return jsonPushResponse({ ok: false, error: error.message }, 500);

  const portal =
    (Deno.env.get("PORTAL_PARENT_PORTAL_URL") ?? "").trim() ||
    "https://www.clubsensational.org/parent";
  let sent = 0;
  let skipped = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const offer of offers || []) {
    const { data: grant } = await admin
      .from("portal_parent_makeup_grants")
      .select("participant_display, parent_person_id, contact_id")
      .eq("id", offer.grant_id)
      .maybeSingle();
    const parentPersonId = clean(offer.parent_person_id || grant?.parent_person_id, 80);
    const contactId = clean(offer.contact_id || grant?.contact_id, 80);
    let q = admin.from("portal_parent_contacts").select("parent_display, parent_first_name, mobile");
    if (parentPersonId && contactId) q = q.eq("parent_person_id", parentPersonId).eq("contact_id", contactId);
    else if (parentPersonId) q = q.eq("parent_person_id", parentPersonId);
    else if (contactId) q = q.eq("contact_id", contactId);
    else {
      skipped++;
      continue;
    }
    const { data: parent } = await q.limit(1).maybeSingle();
    const phone = normalizeParentPhoneE164(clean(parent?.mobile, 40));
    const child = clean(grant?.participant_display, 80) || "your child";
    const parentName = clean(parent?.parent_display || parent?.parent_first_name, 80) || "there";
    const when = [
      ukDate(String(offer.session_date || "")),
      clean(offer.session_time, 40),
      clean(offer.venue, 40),
      clean(offer.service_label, 80),
      clean(offer.instructor_name, 40),
    ].filter(Boolean).join(" · ");
    if (!phone) {
      skipped++;
      results.push({ id: offer.id, skipped: "no_phone" });
      continue;
    }
    const text =
      `Hi ${parentName},\n\n` +
      `${child}'s makeup is still waiting for you to Accept or Decline.\n\n` +
      `${when}.\n\n` +
      `Open the parent portal and choose before the session:\n${portal}\n\n` +
      parentApiMachineFooter();
    if (body.dryRun) {
      results.push({ id: offer.id, dryRun: true, phone: phone.slice(0, 6) + "…" });
      continue;
    }
    const result = await sendParentMobileMessage(phone, text, { kind: "makeup_offer" });
    if (!result.ok) {
      results.push({ id: offer.id, ok: false, error: result.error || "send_failed" });
      continue;
    }
    const { error: markErr } = await admin
      .from("portal_parent_makeup_offers")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", offer.id)
      .eq("status", "pending")
      .is("reminder_sent_at", null);
    if (markErr) console.warn("[makeup-reminder] mark", offer.id, markErr.message);
    sent++;
    results.push({ id: offer.id, ok: true });
  }

  return jsonPushResponse({
    ok: true,
    sessionDate,
    pending: (offers || []).length,
    sent,
    skipped,
    results,
  });
});
