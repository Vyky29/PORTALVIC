// @ts-nocheck — One WhatsApp if a refund is still open 3 days after we asked for the account.
// 09:00 Europe/London. Cron is UTC, so 08:00 and 09:00 UTC; the function runs only at London hour 9.
// Refunds from before the bank-details sentence (8 Oct 2026) are not chased.
// Manual: POST {"force":true} or {"force":true,"dryRun":true}
//
// Deploy: supabase functions deploy portal-refund-bank-reminder-whatsapp --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  jsonPushResponse,
  PORTAL_PUSH_CORS_HEADERS,
  verifyPortalPushWebhook,
} from "../_shared/portal_webpush_util.ts";
import {
  maskPhoneForLog,
  normalizeParentPhoneE164,
  parentApiMachineFooter,
  sendParentMobileMessage,
} from "../_shared/portal_parent_messaging.ts";
import { notifyFamilyWebPushForParentNotify } from "../_shared/portal_family_webpush_notify.ts";

const BANK_COPY_FROM = "2026-10-08T00:00:00.000Z";
const WAIT_MS = 3 * 24 * 60 * 60 * 1000;

function londonHour(d = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  let hour = Number(parts.find((p) => p.type === "hour")?.value || "0");
  if (hour === 24) hour = 0;
  return hour;
}

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function gbp(n: number): string {
  return "£" + (Math.round(n * 100) / 100).toFixed(2);
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

  const hour = londonHour();
  if (!body.force && hour !== 9) {
    return jsonPushResponse({ ok: true, skipped: true, reason: "not 09:00 London", hour });
  }

  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cutoff = new Date(Date.now() - WAIT_MS).toISOString();

  const { data: refunds, error } = await admin
    .from("portal_parent_family_credits")
    .select(
      "id, parent_person_id, contact_id, participant_display, amount_gbp, created_at, status, kind",
    )
    .eq("kind", "refund")
    .eq("status", "open")
    .gte("created_at", BANK_COPY_FROM)
    .lte("created_at", cutoff)
    .limit(80);

  if (error) {
    console.error("[refund-bank-reminder] list", error.message);
    return jsonPushResponse({ ok: false, error: "list_failed" }, 500);
  }

  const sent: string[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const row of refunds || []) {
    const id = clean(row.id, 60);
    const amount = Number(row.amount_gbp);
    if (!id || !Number.isFinite(amount) || amount <= 0) {
      skipped.push({ id, reason: "no_amount" });
      continue;
    }

    const { data: already } = await admin
      .from("portal_parent_notify_log")
      .select("id")
      .eq("kind", "refund_bank_reminder")
      .contains("meta", { credit_id: id })
      .in("whatsapp_status", ["sent", "sent_sms", "delivered", "read"])
      .limit(1);
    if (already?.length) {
      skipped.push({ id, reason: "already_reminded" });
      continue;
    }

    const parentPersonId = clean(row.parent_person_id, 120);
    const contactId = clean(row.contact_id, 120);
    let askQ = admin
      .from("portal_parent_notify_log")
      .select("id, created_at, body_text, whatsapp_status")
      .in("kind", ["absence_refund", "term_service_cancel"])
      .lte("created_at", cutoff)
      .ilike("body_text", "%sort code%")
      .order("created_at", { ascending: false })
      .limit(1);
    if (contactId) askQ = askQ.filter("meta->>contact_id", "eq", contactId);
    else if (parentPersonId) askQ = askQ.filter("meta->>parent_person_id", "eq", parentPersonId);
    else {
      skipped.push({ id, reason: "no_parent" });
      continue;
    }
    const { data: asked } = await askQ;
    const ask = asked && asked[0];
    const askStatus = clean(ask?.whatsapp_status, 20);
    if (!ask || (askStatus !== "sent" && askStatus !== "sent_sms" && askStatus !== "delivered" && askStatus !== "read")) {
      skipped.push({ id, reason: "bank_ask_not_sent" });
      continue;
    }

    const { data: parent } = await admin
      .from("portal_parent_contacts")
      .select("parent_display, parent_first_name, mobile, email, child_display")
      .eq("parent_person_id", parentPersonId || "")
      .eq("contact_id", contactId || "")
      .limit(1)
      .maybeSingle();
    let contact = parent;
    if (!contact && contactId) {
      const { data: byContact } = await admin
        .from("portal_parent_contacts")
        .select("parent_display, parent_first_name, mobile, email, child_display")
        .eq("contact_id", contactId)
        .limit(1)
        .maybeSingle();
      contact = byContact;
    }
    const phone = normalizeParentPhoneE164(clean(contact?.mobile, 40));
    if (!phone) {
      skipped.push({ id, reason: "no_phone" });
      continue;
    }

    const parentName =
      clean(contact?.parent_display || contact?.parent_first_name, 80).split(/\s+/)[0] ||
      "there";
    const child =
      clean(row.participant_display, 120) ||
      clean(contact?.child_display, 120) ||
      "your child";
    const text =
      `Hi ${parentName},\n\n` +
      `This is ClubSENsational.\n\n` +
      `We still need the account details to pay the refund of ${gbp(amount)} for ${child}.\n\n` +
      `Please send the name on the account, the sort code, and the account number. ` +
      `Use Messages in the parent portal, or call or message 07592 558671.\n\n` +
      `${parentApiMachineFooter()}\n\n` +
      `Thank you,\nClubSENsational`;

    if (body.dryRun) {
      sent.push(id);
      continue;
    }

    const wa = await sendParentMobileMessage(phone, text, { kind: "refund_bank_reminder" });
    const waStatus = wa.ok ? (wa.channel === "sms" ? "sent_sms" : "sent") : "failed";
    const { data: logRow } = await admin
      .from("portal_parent_notify_log")
      .insert({
        sent_by_email: "refund-bank-reminder",
        kind: "refund_bank_reminder",
        channel: "whatsapp",
        client_display: child,
        parent_name: parentName,
        parent_email: clean(contact?.email, 200) || null,
        parent_phone: clean(contact?.mobile, 40) || null,
        subject: `Refund details · ${child} · ${gbp(amount)}`.slice(0, 200),
        body_text: text.slice(0, 4000),
        email_status: "skipped",
        whatsapp_status: waStatus,
        whatsapp_message_id: wa.ok ? clean(wa.id, 120) || null : null,
        error_detail: wa.ok ? null : clean(wa.error, 400) || "send_failed",
        meta: {
          credit_id: id,
          parent_person_id: parentPersonId || null,
          contact_id: contactId || null,
          amount_gbp: amount,
          automated: true,
          parent_phone_masked: maskPhoneForLog(phone),
          source: "portal-refund-bank-reminder-whatsapp",
        },
      })
      .select("id")
      .maybeSingle();
    if (wa.ok) {
      sent.push(id);
      if (logRow?.id) {
        void notifyFamilyWebPushForParentNotify({
          notifyLogId: String(logRow.id),
          kind: "refund_bank_reminder",
        });
      }
    } else {
      skipped.push({ id, reason: "send_failed" });
    }
  }

  return jsonPushResponse({
    ok: true,
    dry_run: body.dryRun === true,
    sent: sent.length,
    skipped: skipped.length,
    ids: sent,
    skip: skipped,
  });
});
