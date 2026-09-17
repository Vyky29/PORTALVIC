// @ts-nocheck — Edge Function shared helper.
//
// Confirmed makeup avisos: parent (WA + email) + instructor (WA if phone_e164).
// Call only when the makeup seat is real (Schedule MakeUp save or parent Accept).
// Do NOT call when Absents only creates an open grant.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  maskPhoneForLog,
  normalizeParentPhoneE164,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMobileMessage,
} from "./portal_parent_messaging.ts";
import { notifyFamilyWebPushForParentNotify } from "./portal_family_webpush_notify.ts";
import {
  findStaffLeaderByUsername,
  normalizeStaffUsernameKey,
} from "./portal_staff_whatsapp.ts";

function clean(v: unknown, max = 2000): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function formatDdMmYyyy(iso: string): string {
  const s = clean(iso, 12);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return m[3] + "/" + m[2] + "/" + m[1];
}

export type MakeupConfirmedNotifyInput = {
  parentPersonId?: string | null;
  contactId?: string | null;
  participantDisplay?: string | null;
  venue?: string | null;
  sessionDate?: string | null;
  sessionTime?: string | null;
  serviceLabel?: string | null;
  instructorName?: string | null;
  instructorStaffKey?: string | null;
  source?: string | null;
  overrideId?: string | null;
  offerId?: string | null;
  grantId?: string | null;
  actorEmail?: string | null;
};

export type MakeupConfirmedNotifyResult = {
  ok: boolean;
  parent?: { ok: boolean; skipped?: boolean; reason?: string; email_status?: string; whatsapp_status?: string };
  instructor?: { ok: boolean; skipped?: boolean; reason?: string; whatsapp_status?: string; username?: string };
  error?: string;
};

async function resolveParentContact(
  admin: SupabaseClient,
  opts: MakeupConfirmedNotifyInput,
): Promise<{
  parent_person_id: string;
  contact_id: string;
  parent_display: string;
  email: string;
  mobile: string;
  child_display: string;
} | null> {
  const parentPersonId = clean(opts.parentPersonId, 120);
  const contactId = clean(opts.contactId, 120);
  let q = admin
    .from("portal_parent_contacts")
    .select("parent_person_id, contact_id, parent_display, parent_first_name, email, mobile, child_display");
  if (parentPersonId && contactId) {
    q = q.eq("parent_person_id", parentPersonId).eq("contact_id", contactId);
  } else if (contactId) {
    q = q.eq("contact_id", contactId);
  } else if (parentPersonId) {
    q = q.eq("parent_person_id", parentPersonId);
  } else {
    return null;
  }
  const { data } = await q.limit(1).maybeSingle();
  if (!data) return null;
  return {
    parent_person_id: clean(data.parent_person_id, 120),
    contact_id: clean(data.contact_id, 120),
    parent_display:
      clean(data.parent_display || data.parent_first_name, 120) || "Parent / carer",
    email: clean(data.email, 200),
    mobile: clean(data.mobile, 40),
    child_display: clean(data.child_display, 120),
  };
}

/**
 * Best-effort notify after a makeup is placed on the roster.
 */
export async function notifyMakeupConfirmed(
  admin: SupabaseClient,
  opts: MakeupConfirmedNotifyInput,
): Promise<MakeupConfirmedNotifyResult> {
  const child =
    clean(opts.participantDisplay, 120) ||
    "your child";
  const venue = clean(opts.venue, 80);
  const sessionDate = clean(opts.sessionDate, 12);
  const sessionTime = clean(opts.sessionTime, 40);
  const serviceLabel = clean(opts.serviceLabel, 160);
  const instructorName = clean(opts.instructorName, 120);
  const staffKey =
    normalizeStaffUsernameKey(clean(opts.instructorStaffKey, 80)) ||
    normalizeStaffUsernameKey(instructorName);
  const whenBits = [
    sessionDate ? formatDdMmYyyy(sessionDate) : "",
    sessionTime,
    venue,
    serviceLabel,
  ].filter(Boolean);
  const whenLine = whenBits.join(" · ") || "the agreed session";

  const portalHint =
    clean(Deno.env.get("PORTAL_PARENT_PORTAL_URL"), 200) ||
    "https://www.clubsensational.org/parent";

  const parent = await resolveParentContact(admin, opts);
  const childName = clean(opts.participantDisplay, 120) || parent?.child_display || child;

  let parentResult: MakeupConfirmedNotifyResult["parent"] = {
    ok: false,
    skipped: true,
    reason: "no_parent",
  };

  if (parent) {
    const parentBody =
      `Hi ${parent.parent_display},\n\n` +
      `This is ClubSENsational.\n\n` +
      `We are confirming a make-up session for ${childName} on ${whenLine}` +
      (instructorName ? ` with instructor ${instructorName}` : "") +
      `.\n\n` +
      `This session is now on the club roster. Please reply if this time does not work.\n\n` +
      `Portal: ${portalHint}\n\n— clubSENsational`;
    const subject = `Make-up confirmed · ${childName}`;

    let emailStatus = "skipped";
    let emailOk = false;
    const smtp = readParentNotifySmtpConfig();
    if (smtp && parent.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email)) {
      try {
        const mail = await sendParentEmailViaSmtp({
          config: smtp,
          to: parent.email,
          subject,
          bodyText: parentBody,
        });
        emailOk = !!mail.ok;
        emailStatus = mail.ok ? "sent" : "failed";
      } catch (err) {
        emailStatus = "failed";
        console.warn("[makeup-confirmed-notify] parent email", err);
      }
    }

    let waStatus = "skipped";
    let waOk = false;
    let waId: string | null = null;
    const phone = normalizeParentPhoneE164(parent.mobile);
    if (phone) {
      try {
        const wa = await sendParentMobileMessage(phone, parentBody, {
          kind: "makeup_scheduled",
        });
        waOk = !!wa.ok;
        waStatus = wa.ok ? (wa.channel === "sms" ? "sent_sms" : "sent") : "failed";
        waId = wa.ok ? clean(wa.id, 120) || null : null;
      } catch (err) {
        waStatus = "failed";
        console.warn("[makeup-confirmed-notify] parent wa", err);
      }
    }

    let logId: string | null = null;
    try {
      const { data: logRow } = await admin
        .from("portal_parent_notify_log")
        .insert({
          sent_by_user_id: null,
          sent_by_email: clean(opts.actorEmail, 200) || "makeup-confirmed",
          kind: "makeup_scheduled",
          channel: phone && parent.email ? "whatsapp_email" : phone ? "whatsapp" : "email",
          client_display: childName,
          parent_name: parent.parent_display,
          parent_email: parent.email || null,
          parent_phone: parent.mobile || null,
          session_date: sessionDate || null,
          slot_id: null,
          venue: venue || null,
          subject: subject.slice(0, 200),
          body_text: parentBody.slice(0, 4000),
          email_status: emailStatus,
          whatsapp_status: waStatus,
          whatsapp_message_id: waId,
          error_detail: emailOk || waOk ? null : "send_failed",
          meta: {
            contact_id: parent.contact_id || null,
            parent_person_id: parent.parent_person_id || null,
            override_id: clean(opts.overrideId, 60) || null,
            offer_id: clean(opts.offerId, 60) || null,
            grant_id: clean(opts.grantId, 60) || null,
            instructor_name: instructorName || null,
            source: clean(opts.source, 80) || "makeup_confirmed",
            automated: true,
            parent_phone_masked: phone ? maskPhoneForLog(phone) : null,
          },
        })
        .select("id")
        .maybeSingle();
      logId = logRow?.id ? String(logRow.id) : null;
    } catch (err) {
      console.warn("[makeup-confirmed-notify] parent log", err);
    }
    if (logId) {
      void notifyFamilyWebPushForParentNotify({
        notifyLogId: logId,
        kind: "makeup_scheduled",
      });
    }

    parentResult = {
      ok: emailOk || waOk,
      skipped: !emailOk && !waOk && emailStatus === "skipped" && waStatus === "skipped",
      reason: emailOk || waOk ? undefined : "send_failed",
      email_status: emailStatus,
      whatsapp_status: waStatus,
    };
  }

  let instructorResult: MakeupConfirmedNotifyResult["instructor"] = {
    ok: false,
    skipped: true,
    reason: "no_instructor",
  };

  if (staffKey) {
    try {
      const staff = await findStaffLeaderByUsername(admin, staffKey);
      if (!staff) {
        instructorResult = { ok: false, skipped: true, reason: "staff_not_found", username: staffKey };
      } else {
        const phone = normalizeParentPhoneE164(String(staff.phone_e164 || ""));
        if (!phone) {
          instructorResult = {
            ok: false,
            skipped: true,
            reason: "missing_staff_phone",
            username: staff.username,
          };
        } else {
          const staffBody =
            `Make-up on your roster\n\n` +
            `${childName}\n` +
            `${whenLine}` +
            (instructorName ? `\nInstructor: ${instructorName}` : "") +
            `\n\nPlease check Staff Today for this session.`;
          const wa = await sendParentMobileMessage(phone, staffBody, {
            kind: "staff_contact_update",
          });
          const waStatus = wa.ok
            ? wa.channel === "sms"
              ? "sent_sms"
              : "sent"
            : "failed";
          try {
            await admin.from("portal_staff_notify_log").insert({
              sent_by_user_id: null,
              sent_by_email: clean(opts.actorEmail, 200) || "makeup-confirmed",
              kind: "makeup_scheduled",
              channel: "whatsapp",
              staff_profile_id: staff.id,
              staff_username: staff.username,
              staff_display_name: clean(staff.full_name, 120) || staff.username,
              staff_phone: phone,
              subject: `Make-up · ${childName}`,
              body_text: staffBody.slice(0, 4000),
              whatsapp_status: waStatus,
              whatsapp_message_id: wa.ok ? clean(wa.id, 120) || null : null,
              error_detail: wa.ok ? null : clean(wa.error, 500) || "send_failed",
              meta: {
                source: clean(opts.source, 80) || "makeup_confirmed",
                override_id: clean(opts.overrideId, 60) || null,
                offer_id: clean(opts.offerId, 60) || null,
                participant: childName,
                session_date: sessionDate || null,
                automated: true,
              },
            });
          } catch (err) {
            console.warn("[makeup-confirmed-notify] staff log", err);
          }
          instructorResult = {
            ok: !!wa.ok,
            skipped: false,
            reason: wa.ok ? undefined : "send_failed",
            whatsapp_status: waStatus,
            username: staff.username,
          };
        }
      }
    } catch (err) {
      console.warn("[makeup-confirmed-notify] instructor", err);
      instructorResult = { ok: false, skipped: false, reason: "instructor_error", username: staffKey };
    }
  }

  return {
    ok: !!(parentResult?.ok || instructorResult?.ok),
    parent: parentResult,
    instructor: instructorResult,
  };
}
