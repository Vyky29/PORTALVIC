// @ts-nocheck — Edge Function (Deno).
//
// portal-admin-term-cancel-refund
// quote: figures + parent message for Cancel service (rest of term).
// notify: send that message and void the matching unpaid instalment.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  portalAdminCorsHeaders,
  portalAdminJson,
  verifyPortalAdminAccessToken,
} from "../_shared/portal_admin_auth.ts";
import { quoteTermCancelRefund } from "../_shared/portal_term_cancel_refund.ts";
import {
  maskPhoneForLog,
  normalizeParentPhoneE164,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMobileMessage,
} from "../_shared/portal_parent_messaging.ts";

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: portalAdminCorsHeaders() });
  if (req.method !== "POST") return portalAdminJson(405, { ok: false, error: "method_not_allowed" });

  const verified = await verifyPortalAdminAccessToken(req.headers.get("Authorization"));
  if (!verified.ok) return portalAdminJson(verified.status, { ok: false, error: verified.error });

  const baseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRole = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!baseUrl || !serviceRole) return portalAdminJson(500, { ok: false, error: "server_misconfigured" });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_e) {
    body = {};
  }
  const action = clean(body.action, 20) || "quote";
  const admin = createClient(baseUrl, serviceRole, { auth: { persistSession: false } });
  const quote = await quoteTermCancelRefund(admin, {
    client_name: body.client_name as string,
    service: body.service as string,
    weekday: body.weekday as string,
    time_slot: body.time_slot as string,
    venue: body.venue as string,
    instructors: body.instructors as string,
    anchor_date: body.anchor_date as string,
  });

  if (action !== "notify") return portalAdminJson(200, quote);

  if (!quote.parent_mobile && !quote.parent_email) {
    return portalAdminJson(200, { ...quote, sent: false, reason: "no_parent_channel" });
  }

  const anchor = clean(quote.anchor_date, 12);
  const child = clean(quote.client_name, 120);
  if (anchor && child) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: prior } = await admin
      .from("portal_parent_notify_log")
      .select("id")
      .eq("kind", "term_service_cancel")
      .eq("client_display", child)
      .eq("session_date", anchor)
      .gte("created_at", since)
      .limit(1);
    if (prior && prior.length) {
      return portalAdminJson(200, { ...quote, sent: false, already_sent: true });
    }
  }

  const message = String(quote.message || "");
  const subject = "Place cancelled";
  let emailStatus = "skipped";
  let emailOk = false;
  const smtp = readParentNotifySmtpConfig();
  const email = clean(quote.parent_email, 200);
  if (smtp && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    try {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to: email,
        subject: subject,
        bodyText: message,
      });
      emailOk = !!mail.ok;
      emailStatus = mail.ok ? "sent" : "failed";
    } catch (err) {
      emailStatus = "failed";
      console.warn("[term-cancel-refund] email", err);
    }
  }

  let waStatus = "skipped";
  let waOk = false;
  let waId: string | null = null;
  const phone = normalizeParentPhoneE164(String(quote.parent_mobile || ""));
  if (phone) {
    try {
      const wa = await sendParentMobileMessage(phone, message, { kind: "session_cancelled" });
      waOk = !!wa.ok;
      waStatus = wa.ok ? (wa.channel === "sms" ? "sent_sms" : "sent") : "failed";
      waId = wa.ok ? clean(wa.id, 120) || null : null;
    } catch (err) {
      waStatus = "failed";
      console.warn("[term-cancel-refund] wa", err);
    }
  }

  if (quote.void_schedule && quote.invoice_id) {
    const { data: inv } = await admin
      .from("portal_parent_invoice_share")
      .select("id, payment_schedule, next_instalment_due")
      .eq("id", quote.invoice_id)
      .maybeSingle();
    const schedule = Array.isArray(inv?.payment_schedule) ? inv.payment_schedule : [];
    let changed = false;
    const next = schedule.map((row: Record<string, unknown>) => {
      const st = String(row?.status || "").toLowerCase();
      if (st === "paid" || st === "void") return row;
      changed = true;
      return {
        ...row,
        status: "void",
        void_reason: "Place cancelled from Edit term slot",
      };
    });
    if (changed && inv?.id) {
      await admin
        .from("portal_parent_invoice_share")
        .update({
          payment_schedule: next,
          next_instalment_due: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.id);
    }
  }

  try {
    await admin.from("portal_parent_notify_log").insert({
      sent_by_user_id: verified.userId || null,
      sent_by_email: clean(verified.email, 200) || "term-cancel-refund",
      kind: "term_service_cancel",
      channel: phone && email ? "whatsapp_email" : phone ? "whatsapp" : "email",
      client_display: child,
      parent_name: clean(quote.parent_first, 80),
      parent_email: email || null,
      parent_phone: clean(quote.parent_mobile, 40) || null,
      session_date: anchor || null,
      subject: subject,
      body_text: message.slice(0, 4000),
      email_status: emailStatus,
      whatsapp_status: waStatus,
      whatsapp_message_id: waId,
      error_detail: emailOk || waOk ? null : "send_failed",
      meta: {
        contact_id: quote.contact_id || null,
        invoice_number: quote.invoice_number || null,
        refund_gbp: quote.refund_gbp,
        fee_gbp: quote.fee_gbp,
        uncollected_gbp: quote.uncollected_gbp,
        confident: !!quote.confident,
        source: "term_roster_edit",
        automated: true,
        parent_phone_masked: phone ? maskPhoneForLog(phone) : null,
      },
    });
  } catch (err) {
    console.warn("[term-cancel-refund] log", err);
  }

  return portalAdminJson(200, {
    ...quote,
    sent: !!(emailOk || waOk),
    email_status: emailStatus,
    whatsapp_status: waStatus,
  });
});
