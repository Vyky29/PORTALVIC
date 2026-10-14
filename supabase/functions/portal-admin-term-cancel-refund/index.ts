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
import { quoteTermCancelRefund, settleTermCancelQuote } from "../_shared/portal_term_cancel_refund.ts";
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

function gbp(n: unknown): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  if (Math.abs(v - Math.round(v)) < 0.001) return "£" + String(Math.round(v));
  return "£" + v.toFixed(2);
}

/** The amount told to the parent must land on the family ledger so office can mark it paid. */
async function ensureCancelRefundLedger(
  admin: ReturnType<typeof createClient>,
  quote: Record<string, unknown>,
  userId: string | null,
) {
  const refund = Math.round((Number(quote.refund_gbp) || 0) * 100) / 100;
  if (refund <= 0 || !quote.confident) return;
  const contactId = clean(quote.contact_id, 120);
  const anchor = clean(quote.anchor_date, 12);
  if (!contactId || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return;
  const { data: existing } = await admin
    .from("portal_parent_family_credits")
    .select("id")
    .eq("contact_id", contactId)
    .eq("kind", "refund")
    .eq("source", "club_cancellation")
    .eq("session_date", anchor)
    .neq("status", "cancelled")
    .limit(1);
  if (existing && existing.length) return;
  const { data: pax } = await admin
    .from("portal_participants")
    .select("parent_person_id, display_name")
    .eq("contact_id", contactId)
    .limit(1)
    .maybeSingle();
  const parentPersonId = clean(pax?.parent_person_id, 120);
  if (!parentPersonId) return;
  const bits = [
    "Told when the place was cancelled.",
    "Paid " + gbp(quote.paid_gbp) + ".",
    "Sessions already done " + gbp(quote.delivered_gbp) +
      (quote.delivered_label ? " (" + clean(quote.delivered_label, 120) + ")" : "") + ".",
    "Unused " + gbp(quote.unused_gbp) + ".",
  ];
  if (Number(quote.fee_gbp) > 0) bits.push("Admin charge " + gbp(quote.fee_gbp) + ".");
  bits.push("Refund due " + gbp(refund) + ".");
  if (quote.invoice_number) bits.push("Invoice " + clean(quote.invoice_number, 40) + ".");
  const { error } = await admin.from("portal_parent_family_credits").insert({
    parent_person_id: parentPersonId,
    contact_id: contactId,
    participant_display: clean(pax?.display_name || quote.client_name, 120),
    kind: "refund",
    status: "open",
    amount_gbp: refund,
    service_label: clean(
      [quote.weekday, quote.service_short || quote.service, quote.venue].filter(Boolean).join(" "),
      120,
    ),
    session_date: anchor,
    notes: bits.join(" ").slice(0, 800),
    source: "club_cancellation",
    created_by: userId,
  });
  if (error) console.warn("[term-cancel-refund] ledger", error.message);
}

/** Unused paid amount kept for the next term. No admin charge, and it is not money to pay back. */
async function ensureCancelCreditLedger(
  admin: ReturnType<typeof createClient>,
  quote: Record<string, unknown>,
  userId: string | null,
) {
  const credit = Math.round((Number(quote.credit_gbp) || 0) * 100) / 100;
  if (credit <= 0 || !quote.confident) return;
  const contactId = clean(quote.contact_id, 120);
  const anchor = clean(quote.anchor_date, 12);
  if (!contactId || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return;
  const { data: existing } = await admin
    .from("portal_parent_family_credits")
    .select("id, kind")
    .eq("contact_id", contactId)
    .eq("source", "club_cancellation")
    .eq("session_date", anchor)
    .neq("status", "cancelled")
    .limit(5);
  const rows = existing || [];
  if (rows.some((row) => String(row.kind || "") === "credit" || String(row.kind || "") === "refund")) return;
  const { data: pax } = await admin
    .from("portal_participants")
    .select("parent_person_id, display_name")
    .eq("contact_id", contactId)
    .limit(1)
    .maybeSingle();
  const parentPersonId = clean(pax?.parent_person_id, 120);
  if (!parentPersonId) return;
  const bits = [
    "Told when the place was cancelled.",
    "Paid " + gbp(quote.paid_gbp) + ".",
    "Sessions already done " + gbp(quote.delivered_gbp) +
      (quote.delivered_label ? " (" + clean(quote.delivered_label, 120) + ")" : "") + ".",
    "Unused " + gbp(credit) + " kept as a credit for the next term invoice.",
    "No admin charge. Not a refund.",
  ];
  if (quote.invoice_number) bits.push("Invoice " + clean(quote.invoice_number, 40) + ".");
  const { error } = await admin.from("portal_parent_family_credits").insert({
    parent_person_id: parentPersonId,
    contact_id: contactId,
    participant_display: clean(pax?.display_name || quote.client_name, 120),
    kind: "credit",
    status: "open",
    amount_gbp: credit,
    service_label: clean(
      [quote.weekday, quote.service_short || quote.service, quote.venue].filter(Boolean).join(" "),
      120,
    ),
    session_date: anchor,
    notes: bits.join(" ").slice(0, 800),
    source: "club_cancellation",
    created_by: userId,
  });
  if (error) console.warn("[term-cancel-refund] credit ledger", error.message);
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

  const settlement = clean(body.settlement, 16) === "credit" ? "credit" : "refund";
  const live = action === "notify" ? settleTermCancelQuote(quote, settlement) : quote;
  const notifyKind = settlement === "credit" ? "term_service_cancel_credit" : "term_service_cancel";
  const subject = settlement === "credit" ? "Place cancelled - credit on your account" : "Place cancelled";

  if (action !== "notify") return portalAdminJson(200, quote);

  if (!live.parent_mobile && !live.parent_email) {
    const anchorMiss = clean(quote.anchor_date, 12);
    const childMiss = clean(quote.client_name, 120);
    try {
      await admin.from("portal_parent_notify_log").insert({
        sent_by_user_id: verified.userId || null,
        sent_by_email: clean(verified.email, 200) || "term-cancel-refund",
        kind: notifyKind,
        channel: "none",
        client_display: childMiss,
        parent_name: clean(live.parent_first, 80),
        session_date: anchorMiss || null,
        subject: subject,
        body_text: String(live.message || "").slice(0, 4000),
        email_status: "skipped",
        whatsapp_status: "skipped",
        error_detail: "no_parent_channel",
        meta: {
          contact_id: live.contact_id || null,
          invoice_number: live.invoice_number || null,
          confident: !!live.confident,
          settlement: settlement,
          reason: live.reason || "no_parent_channel",
          source: "term_roster_edit",
          automated: true,
        },
      });
    } catch (err) {
      console.warn("[term-cancel-refund] log no channel", err);
    }
    return portalAdminJson(200, { ...live, sent: false, reason: "no_parent_channel" });
  }

  const anchor = clean(live.anchor_date, 12);
  const child = clean(live.client_name, 120);
  if (anchor && child) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: prior } = await admin
      .from("portal_parent_notify_log")
      .select("id, kind")
      .in("kind", ["term_service_cancel", "term_service_cancel_credit"])
      .eq("client_display", child)
      .eq("session_date", anchor)
      .gte("created_at", since)
      .limit(5);
    const priorRows = prior || [];
    if (priorRows.length) {
      const same = priorRows.some((row) => String(row.kind || "") === notifyKind);
      if (same) {
        if (settlement === "credit") await ensureCancelCreditLedger(admin, live, verified.userId || null);
        else await ensureCancelRefundLedger(admin, live, verified.userId || null);
        return portalAdminJson(200, { ...live, sent: false, already_sent: true });
      }
      return portalAdminJson(200, {
        ...live,
        sent: false,
        already_sent: true,
        reason: "other_outcome_already_sent",
      });
    }
  }

  const message = String(live.message || "");
  let emailStatus = "skipped";
  let emailOk = false;
  const smtp = readParentNotifySmtpConfig();
  const email = clean(live.parent_email, 200);
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
  const phone = normalizeParentPhoneE164(String(live.parent_mobile || ""));
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

  if (live.void_schedule && live.invoice_id) {
    const { data: inv } = await admin
      .from("portal_parent_invoice_share")
      .select("id, payment_schedule, next_instalment_due")
      .eq("id", live.invoice_id)
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
        void_reason: settlement === "credit"
          ? "Place cancelled. Unused paid amount kept as a credit."
          : "Place cancelled from Edit term slot",
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
      kind: notifyKind,
      channel: phone && email ? "whatsapp_email" : phone ? "whatsapp" : "email",
      client_display: child,
      parent_name: clean(live.parent_first, 80),
      parent_email: email || null,
      parent_phone: clean(live.parent_mobile, 40) || null,
      session_date: anchor || null,
      subject: subject,
      body_text: message.slice(0, 4000),
      email_status: emailStatus,
      whatsapp_status: waStatus,
      whatsapp_message_id: waId,
      error_detail: emailOk || waOk ? null : "send_failed",
      meta: {
        contact_id: live.contact_id || null,
        invoice_number: live.invoice_number || null,
        settlement: settlement,
        refund_gbp: live.refund_gbp,
        credit_gbp: live.credit_gbp,
        fee_gbp: live.fee_gbp,
        uncollected_gbp: live.uncollected_gbp,
        confident: !!live.confident,
        source: "term_roster_edit",
        automated: true,
        parent_phone_masked: phone ? maskPhoneForLog(phone) : null,
      },
    });
  } catch (err) {
    console.warn("[term-cancel-refund] log", err);
  }

  if (emailOk || waOk) {
    if (settlement === "credit") await ensureCancelCreditLedger(admin, live, verified.userId || null);
    else await ensureCancelRefundLedger(admin, live, verified.userId || null);
  }

  return portalAdminJson(200, {
    ...live,
    sent: !!(emailOk || waOk),
    email_status: emailStatus,
    whatsapp_status: waStatus,
  });
});
