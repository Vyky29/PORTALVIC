// @ts-nocheck — Edge / Deno shared helper.
//
// Parent WhatsApp + email when office offers a makeup seat to Accept or Decline.
// Writes portal_parent_notify_log so the message shows in the parent thread.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  maskPhoneForLog,
  normalizeParentPhoneE164,
  parentApiMachineFooter,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMobileMessage,
} from "./portal_parent_messaging.ts";
import { notifyFamilyWebPushForParentNotify } from "./portal_family_webpush_notify.ts";

function clean(v: unknown, max = 500): string {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function prettySessionDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split("-").map((x) => Number(x));
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const wd = names[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] || "";
  return `${wd} ${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`.trim();
}

export async function notifyParentMakeupOffer(
  admin: SupabaseClient,
  grant: Record<string, unknown>,
  offer: Record<string, unknown>,
  actorEmail?: string | null,
) {
  const parentPersonId = clean(grant.parent_person_id, 80);
  const contactId = clean(grant.contact_id, 80);
  let q = admin
    .from("portal_parent_contacts")
    .select("parent_display, parent_first_name, mobile, email, child_display, parent_person_id, contact_id");
  if (parentPersonId && contactId) {
    q = q.eq("parent_person_id", parentPersonId).eq("contact_id", contactId);
  } else if (parentPersonId) {
    q = q.eq("parent_person_id", parentPersonId);
  } else if (contactId) {
    q = q.eq("contact_id", contactId);
  } else {
    return { ok: false, skipped: true, reason: "no_parent", email_status: "skipped", whatsapp_status: "skipped" };
  }
  const { data: parent } = await q.limit(1).maybeSingle();
  const parentName = clean(parent?.parent_display || parent?.parent_first_name, 80) || "there";
  const child = clean(grant.participant_display, 80) || clean(parent?.child_display, 80) || "your child";
  const email = clean(parent?.email, 200);
  const phoneRaw = clean(parent?.mobile, 40);
  const phone = normalizeParentPhoneE164(phoneRaw);
  const sessionDate = clean(String(offer.session_date || ""), 12);
  const venue = clean(offer.venue, 80);
  const when = [
    clean(offer.service_label, 80),
    venue,
    prettySessionDate(sessionDate),
    clean(offer.session_time, 40),
    clean(offer.instructor_name, 40) ? "with " + clean(offer.instructor_name, 40) : "",
  ]
    .filter(Boolean)
    .join(" | ");
  const portal =
    clean(Deno.env.get("PORTAL_PARENT_PORTAL_URL"), 200) ||
    "https://www.clubsensational.org/parent";
  const bodyText =
    `Hi ${parentName},\n\n` +
    `A makeup is ready for ${child}: ${when}.\n\n` +
    `Please open the parent portal and Accept or Decline so we can confirm the place.\n\n` +
    `Portal: ${portal}\n\n` +
    `${parentApiMachineFooter()}\n\n` +
    `— clubSENsational`;
  const subject = `Makeup to confirm · ${child}`.slice(0, 200);

  if (!phone && !email) {
    return { ok: false, skipped: true, reason: "no_phone_or_email", email_status: "skipped", whatsapp_status: "skipped" };
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
      if (!mail.ok) console.warn("[makeup-offer-notify] email", mail.error);
    } catch (err) {
      emailStatus = "failed";
      console.warn("[makeup-offer-notify] email", err);
    }
  }

  let waStatus = "skipped";
  let waOk = false;
  let waId: string | null = null;
  if (phone) {
    try {
      const wa = await sendParentMobileMessage(phone, bodyText, { kind: "makeup_offer" });
      waOk = !!wa.ok;
      waStatus = wa.ok ? (wa.channel === "sms" ? "sent_sms" : "sent") : "failed";
      waId = wa.ok ? clean(wa.id, 120) || null : null;
      if (!wa.ok) console.warn("[makeup-offer-notify] whatsapp", wa.error);
    } catch (err) {
      waStatus = "failed";
      console.warn("[makeup-offer-notify] whatsapp", err);
    }
  }

  let logId: string | null = null;
  try {
    const { data: logRow } = await admin
      .from("portal_parent_notify_log")
      .insert({
        sent_by_user_id: null,
        sent_by_email: clean(actorEmail, 200) || "makeup-offer",
        kind: "makeup_offer",
        channel: phone && email ? "whatsapp_email" : phone ? "whatsapp" : "email",
        client_display: child,
        parent_name: parentName,
        parent_email: email || null,
        parent_phone: phoneRaw || null,
        session_date: sessionDate || null,
        slot_id: null,
        venue: venue || null,
        subject,
        body_text: bodyText.slice(0, 4000),
        email_status: emailStatus,
        whatsapp_status: waStatus,
        resend_id: null,
        whatsapp_message_id: waId,
        error_detail: emailOk || waOk ? null : "send_failed",
        meta: {
          contact_id: contactId || null,
          parent_person_id: parentPersonId || null,
          offer_id: clean(offer.id, 60) || null,
          grant_id: clean(grant.id, 60) || null,
          automated: true,
          source: "portal-admin-makeup-offer",
          parent_phone_masked: phone ? maskPhoneForLog(phone) : null,
        },
      })
      .select("id")
      .maybeSingle();
    logId = logRow?.id ? String(logRow.id) : null;
  } catch (err) {
    console.warn("[makeup-offer-notify] log", err);
  }

  if (logId) {
    void notifyFamilyWebPushForParentNotify({
      notifyLogId: logId,
      kind: "makeup_offer",
    });
  }

  if (!emailOk && !waOk) {
    return {
      ok: false,
      email_status: emailStatus,
      whatsapp_status: waStatus,
      error: "send_failed",
    };
  }
  return {
    ok: true,
    email_status: emailStatus,
    whatsapp_status: waStatus,
  };
}
