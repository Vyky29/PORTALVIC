// @ts-nocheck — Edge Function shared helper.
//
// Notify parent when office decides credit or refund on an absence/cancellation.
// Makeup intentionally has no proactive notify here (bookings take priority).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  maskPhoneForLog,
  normalizeParentPhoneE164,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMobileMessage,
} from "./portal_parent_messaging.ts";
import { notifyFamilyWebPushForParentNotify } from "./portal_family_webpush_notify.ts";

function clean(v: unknown, max = 2000): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function money(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatGbp(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "";
  return "£" + money(Number(n)).toFixed(2);
}

function sessionLabel(report: {
  service_label?: unknown;
  session_date?: unknown;
  session_time?: unknown;
}): string {
  const bits = [
    clean(report.service_label, 160),
    clean(report.session_date, 12),
    clean(report.session_time, 40),
  ].filter(Boolean);
  return bits.join(" · ") || "session";
}

export type AbsenceOutcomeNotifyResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  kind?: string;
  email_status?: string;
  whatsapp_status?: string;
  error?: string;
};

/**
 * Best-effort parent WhatsApp + email after credit / refund decide.
 * Does not throw; caller should not fail the decide if this fails.
 */
export async function notifyParentAbsenceOutcome(
  admin: SupabaseClient,
  opts: {
    outcome: "credit" | "refund";
    report: {
      id?: unknown;
      parent_person_id?: unknown;
      contact_id?: unknown;
      participant_display?: unknown;
      service_label?: unknown;
      session_date?: unknown;
      session_time?: unknown;
    };
    amountGbp?: number | null;
    creditApply?: {
      skipped?: string;
      gocardless_held?: boolean;
      applications?: Array<{
        ok?: boolean;
        payment_status?: string;
        invoice_remaining_gbp?: number;
        applied_gbp?: number;
        invoice_id?: string;
      }>;
      final_credit_gbp?: number | null;
    } | null;
    invoiceNumber?: string | null;
    actorEmail?: string | null;
  },
): Promise<AbsenceOutcomeNotifyResult> {
  const outcome = opts.outcome === "refund" ? "refund" : "credit";
  const kind = outcome === "refund" ? "absence_refund" : "absence_credit";
  const parentPersonId = clean(opts.report.parent_person_id, 120);
  const contactId = clean(opts.report.contact_id, 120);
  if (!parentPersonId && !contactId) {
    return { ok: true, skipped: true, reason: "no_parent", kind };
  }

  let parentQ = admin
    .from("portal_parent_contacts")
    .select("parent_display, parent_first_name, mobile, email, child_display, parent_person_id, contact_id");
  if (parentPersonId && contactId) {
    parentQ = parentQ.eq("parent_person_id", parentPersonId).eq("contact_id", contactId);
  } else if (parentPersonId) {
    parentQ = parentQ.eq("parent_person_id", parentPersonId);
  } else {
    parentQ = parentQ.eq("contact_id", contactId);
  }
  const { data: parentRow } = await parentQ.limit(1).maybeSingle();

  const phoneRaw = clean(parentRow?.mobile, 40);
  const phone = normalizeParentPhoneE164(phoneRaw);
  const email = clean(parentRow?.email, 200);
  if (!phone && !email) {
    return { ok: true, skipped: true, reason: "no_parent_contact", kind };
  }

  const child =
    clean(opts.report.participant_display, 120) ||
    clean(parentRow?.child_display, 120) ||
    "your child";
  const parentName =
    clean(parentRow?.parent_display || parentRow?.parent_first_name, 120) || "Parent / carer";
  const session = sessionLabel(opts.report);
  const amountLabel = formatGbp(opts.amountGbp);
  const portalHint =
    clean(Deno.env.get("PORTAL_PARENT_PORTAL_URL"), 200) ||
    "https://www.clubsensational.org/parent";

  let bodyText = "";
  let subject = "";

  if (outcome === "refund") {
    subject = amountLabel
      ? `Refund approved · ${child} · ${amountLabel}`
      : `Refund approved · ${child}`;
    bodyText =
      `Hi ${parentName},\n\n` +
      `We have approved a refund` +
      (amountLabel ? ` of ${amountLabel}` : "") +
      ` for ${child} (${session}).\n\n` +
      `Please check your bank in the next few days. Details are in the parent portal under Credits & refunds.\n\n` +
      `Portal: ${portalHint}\n\n— clubSENsational`;
  } else {
    const apply = opts.creditApply || null;
    const firstOk = (apply?.applications || []).find((a) => a && a.ok);
    const gcHeld =
      apply?.gocardless_held === true ||
      apply?.skipped === "gocardless_held_for_spring_mandate" ||
      apply?.skipped === "gocardless_held_for_next_term";

    if (firstOk) {
      const invNo = clean(opts.invoiceNumber, 40);
      const remain = firstOk.invoice_remaining_gbp;
      const paidFull = firstOk.payment_status === "paid" || (remain != null && remain <= 0);
      subject = amountLabel
        ? `Credit applied · ${child} · ${amountLabel}`
        : `Credit applied · ${child}`;
      bodyText =
        `Hi ${parentName},\n\n` +
        `We have added` +
        (amountLabel ? ` a ${amountLabel}` : " a") +
        ` credit for ${child}.\n\n` +
        `It has been applied to invoice` +
        (invNo ? ` ${invNo}` : "") +
        `. ` +
        (paidFull
          ? "That invoice is now paid in full."
          : `The remaining amount due is ${formatGbp(remain) || "reduced"}.`) +
        `\n\nSee Credits & refunds in the parent portal: ${portalHint}\n\n— clubSENsational`;
    } else if (gcHeld) {
      subject = amountLabel
        ? `Credit for Spring · ${child} · ${amountLabel}`
        : `Credit for Spring · ${child}`;
      bodyText =
        `Hi ${parentName},\n\n` +
        `We have added` +
        (amountLabel ? ` a ${amountLabel}` : " a") +
        ` credit for ${child}.\n\n` +
        `Because you pay by GoCardless, this credit is held for your Spring Direct Payment mandate (monthly). It is not taken off this Autumn collection.\n\n` +
        `See Credits & refunds in the parent portal: ${portalHint}\n\n— clubSENsational`;
    } else {
      subject = amountLabel
        ? `Credit added · ${child} · ${amountLabel}`
        : `Credit added · ${child}`;
      bodyText =
        `Hi ${parentName},\n\n` +
        `We have added` +
        (amountLabel ? ` a ${amountLabel}` : " a") +
        ` credit for ${child} (${session}).\n\n` +
        `It is visible under Credits & refunds in the parent portal and will reduce your next invoice / next term balance.\n\n` +
        `Portal: ${portalHint}\n\n— clubSENsational`;
    }
  }

  let emailStatus = "skipped";
  let emailOk = false;
  const smtp = readParentNotifySmtpConfig();
  if (smtp && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    try {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to: email,
        subject,
        bodyText,
      });
      emailOk = !!mail.ok;
      emailStatus = mail.ok ? "sent" : "failed";
      if (!mail.ok) console.warn("[absence-outcome-notify] email", mail.error);
    } catch (err) {
      emailStatus = "failed";
      console.warn("[absence-outcome-notify] email", err);
    }
  }

  let waStatus = "skipped";
  let waOk = false;
  let waId: string | null = null;
  if (phone) {
    try {
      const wa = await sendParentMobileMessage(phone, bodyText, { kind });
      waOk = !!wa.ok;
      waStatus = wa.ok ? (wa.channel === "sms" ? "sent_sms" : "sent") : "failed";
      waId = wa.ok ? clean(wa.id, 120) || null : null;
      if (!wa.ok) console.warn("[absence-outcome-notify] whatsapp", wa.error);
    } catch (err) {
      waStatus = "failed";
      console.warn("[absence-outcome-notify] whatsapp", err);
    }
  }

  let logId: string | null = null;
  try {
    const { data: logRow } = await admin
      .from("portal_parent_notify_log")
      .insert({
        sent_by_user_id: null,
        sent_by_email: clean(opts.actorEmail, 200) || "absence-decide",
        kind,
        channel: phone && email ? "whatsapp_email" : phone ? "whatsapp" : "email",
        client_display: child,
        parent_name: parentName,
        parent_email: email || null,
        parent_phone: phoneRaw || null,
        session_date: clean(opts.report.session_date, 12) || null,
        slot_id: null,
        venue: null,
        subject: subject.slice(0, 200),
        body_text: bodyText.slice(0, 4000),
        email_status: emailStatus,
        whatsapp_status: waStatus,
        resend_id: null,
        whatsapp_message_id: waId,
        error_detail:
          emailOk || waOk
            ? null
            : clean(
                [emailStatus === "failed" ? "email_failed" : "", waStatus === "failed" ? "wa_failed" : ""]
                  .filter(Boolean)
                  .join("|") || "send_failed",
                500,
              ),
        meta: {
          contact_id: contactId || null,
          parent_person_id: parentPersonId || null,
          report_id: clean(opts.report.id, 60) || null,
          outcome,
          amount_gbp: opts.amountGbp ?? null,
          credit_apply_skipped: opts.creditApply?.skipped || null,
          gocardless_held: opts.creditApply?.gocardless_held === true,
          parent_phone_masked: phone ? maskPhoneForLog(phone) : null,
          automated: true,
          source: "portal-admin-parent-absence-decide",
        },
      })
      .select("id")
      .maybeSingle();
    logId = logRow?.id ? String(logRow.id) : null;
  } catch (err) {
    console.warn("[absence-outcome-notify] log", err);
  }

  if (logId) {
    void notifyFamilyWebPushForParentNotify({
      notifyLogId: logId,
      kind,
    });
  }

  if (!emailOk && !waOk) {
    return {
      ok: false,
      kind,
      email_status: emailStatus,
      whatsapp_status: waStatus,
      error: "send_failed",
    };
  }

  return {
    ok: true,
    kind,
    email_status: emailStatus,
    whatsapp_status: waStatus,
  };
}
