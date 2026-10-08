// @ts-nocheck — Parent WhatsApp + email when office marks a refund paid out.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  maskPhoneForLog,
  normalizeParentPhoneE164,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMobileMessage,
} from "./portal_parent_messaging.ts";

function clean(v: unknown, max = 500): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function gbp(n: unknown): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  if (Math.abs(v - Math.round(v)) < 0.001) return "£" + String(Math.round(v));
  return "£" + v.toFixed(2);
}

export async function notifyParentRefundPaidOut(
  admin: SupabaseClient,
  opts: {
    contactId: string;
    participantDisplay: string;
    amountGbp: number;
    creditNoteNumber?: string | null;
    invoiceNumber?: string | null;
    sentByUserId?: string | null;
    sentByEmail?: string | null;
  },
): Promise<{ ok: boolean; email_status: string; whatsapp_status: string; skipped?: string }> {
  const cid = clean(opts.contactId, 120);
  const amount = Number(opts.amountGbp) || 0;
  if (!cid || amount <= 0) return { ok: false, email_status: "skipped", whatsapp_status: "skipped", skipped: "bad_input" };

  const { data: parent } = await admin
    .from("portal_parent_contacts")
    .select("parent_display, parent_first_name, email, mobile")
    .eq("contact_id", cid)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const first = clean(parent?.parent_first_name, 80) || "there";
  const child = clean(opts.participantDisplay, 120);
  const inv = clean(opts.invoiceNumber, 40);
  const cn = clean(opts.creditNoteNumber, 40);

  const message =
    `Hi ${first},\n\n` +
    `This is ClubSENsational.\n\n` +
    `We have sent ${gbp(amount)} back to you` +
    (child ? ` (${child})` : "") +
    `. It should reach your account within a few working days.\n\n` +
    (inv ? `Original invoice: ${inv}.\n` : "") +
    (cn ? `Credit note: ${cn}.\n` : "") +
    `You can also see this under Credits & refunds in the parent portal.\n\n` +
    `Please do not reply on WhatsApp. Use Messages in the parent portal, or call 07592 558671.\n\n` +
    `Thank you,\nClubSENsational`;

  const subject = "Your refund has been sent";

  let emailStatus = "skipped";
  let waStatus = "skipped";
  let emailOk = false;
  let waOk = false;

  const smtp = readParentNotifySmtpConfig();
  const email = clean(parent?.email, 200);
  if (smtp && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    try {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to: email,
        subject,
        bodyText: message,
      });
      emailOk = !!mail.ok;
      emailStatus = mail.ok ? "sent" : "failed";
    } catch (_e) {
      emailStatus = "failed";
    }
  }

  const phone = normalizeParentPhoneE164(String(parent?.mobile || ""));
  if (phone) {
    try {
      const wa = await sendParentMobileMessage(phone, message, { kind: "refund_paid_out" });
      waOk = !!wa.ok;
      waStatus = wa.ok ? (wa.channel === "sms" ? "sent_sms" : "sent") : "failed";
    } catch (_e) {
      waStatus = "failed";
    }
  }

  try {
    await admin.from("portal_parent_notify_log").insert({
      sent_by_user_id: opts.sentByUserId || null,
      sent_by_email: clean(opts.sentByEmail, 200) || "refund_payout",
      kind: "refund_paid_out",
      channel: phone && email ? "whatsapp_email" : phone ? "whatsapp" : email ? "email" : "none",
      client_display: child,
      parent_name: clean(parent?.parent_display, 80),
      parent_email: email || null,
      parent_phone: clean(parent?.mobile, 40) || null,
      subject,
      body_text: message.slice(0, 4000),
      email_status: emailStatus,
      whatsapp_status: waStatus,
      error_detail: emailOk || waOk ? null : "send_failed_or_no_channel",
      meta: {
        contact_id: cid,
        amount_gbp: amount,
        invoice_number: inv || null,
        credit_note_number: cn || null,
        parent_phone_masked: phone ? maskPhoneForLog(phone) : null,
      },
    });
  } catch (err) {
    console.warn("[refund_payout_notify] log", err);
  }

  return {
    ok: !!(emailOk || waOk),
    email_status: emailStatus,
    whatsapp_status: waStatus,
    skipped: emailOk || waOk ? undefined : "no_channel_or_failed",
  };
}
