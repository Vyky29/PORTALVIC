// @ts-nocheck — Edge Function shared helper.
//
// Auto-notify parents after Schedule & Covers override save
// (instructor change / update, session cancelled, same-day move).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  flattenWhatsappTemplateBody,
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

function asciiBody(body: string): string {
  return String(body || "")
    .replace(/\u2022/g, "-")
    .replace(/•/g, "-")
    .replace(/—/g, "-")
    .replace(/–/g, "-")
    .replace(/'/g, "'")
    .replace(/'/g, "'");
}

function formatFriendlyDate(iso: string): string {
  const s = clean(iso, 12);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const wd = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][d.getUTCDay()];
  return `${wd} ${Number(m[3])} ${months[Number(m[2]) - 1]}`;
}

function parentFirstName(display: string): string {
  const raw = clean(display, 120);
  if (!raw) return "there";
  return raw.split(/\s+/)[0] || "there";
}

function photoBase(): string {
  return (
    clean(Deno.env.get("PORTAL_ADMIN_PUBLIC_ORIGIN"), 200) ||
    clean(Deno.env.get("PORTAL_PUBLIC_ORIGIN"), 200) ||
    "https://portalvic.vercel.app"
  ).replace(/\/$/, "");
}

/** Map roster slug / display name → staff_photos stem. */
export function staffPhotoStem(staffKey: string, staffName: string): string {
  const raw = clean(staffKey || staffName, 80).toLowerCase();
  if (!raw) return "";
  const compact = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    javipalankas: "javi",
    javiarranz: "javi",
    javiarranzescorial: "javi",
    javiermarquez: "javier",
    angelfalceto: "angel",
    alex: "alex",
    alexander: "alex",
    emanuel: "emmanuel",
    lulia: "luliya",
    aida: "luliya",
  };
  if (aliases[compact]) return aliases[compact];
  if (
    [
      "javi",
      "javier",
      "angel",
      "alex",
      "berta",
      "roberto",
      "carlos",
      "aurora",
      "simon",
      "andres",
      "youssef",
      "bismark",
      "godsway",
      "emmanuel",
      "luliya",
      "john",
      "raul",
      "victor",
      "giuseppe",
      "michelle",
      "dan",
      "tinashe",
    ].includes(compact)
  ) {
    return compact;
  }
  const first = clean(staffName || staffKey, 80).split(/\s+/)[0] || "";
  return first
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export type ScheduleOverrideNotifyKind =
  | "instructor_change"
  | "instructor_change_update"
  | "session_cancelled"
  | "time_change";

export type ScheduleOverrideNotifyInput = {
  kind: ScheduleOverrideNotifyKind;
  overrideId?: string | null;
  contactId?: string | null;
  parentPersonId?: string | null;
  participantDisplay?: string | null;
  venue?: string | null;
  sessionDate?: string | null;
  sessionTime?: string | null;
  serviceLabel?: string | null;
  reason?: string | null;
  /** Roster instructor (absent) for first cover notice */
  absentInstructorName?: string | null;
  coveringStaffName?: string | null;
  coveringStaffKey?: string | null;
  priorCoveringStaffName?: string | null;
  oldTime?: string | null;
  newTime?: string | null;
  instructorPhotoUrl?: string | null;
  actorEmail?: string | null;
  source?: string | null;
};

export type ScheduleOverrideNotifyResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  kind?: string;
  whatsapp_status?: string;
  email_status?: string;
  log_id?: string | null;
  error?: string;
};

async function resolveParentContact(
  admin: SupabaseClient,
  opts: ScheduleOverrideNotifyInput,
): Promise<{
  parent_person_id: string;
  contact_id: string;
  parent_display: string;
  email: string;
  mobile: string;
  child_display: string;
} | null> {
  let contactId = clean(opts.contactId, 120);
  let parentPersonId = clean(opts.parentPersonId, 120);
  const participantDisplay = clean(opts.participantDisplay, 160);

  if (!contactId && participantDisplay) {
    const { data: pax } = await admin
      .from("portal_participants")
      .select("contact_id, parent_person_id, display_name")
      .ilike("display_name", participantDisplay)
      .limit(1)
      .maybeSingle();
    if (pax?.contact_id) {
      contactId = clean(pax.contact_id, 120);
      parentPersonId = parentPersonId || clean(pax.parent_person_id, 120);
    }
  }
  if (contactId && !/^\d/.test(contactId) && contactId.length < 40) {
    // Roster slug often matches contact_id string for some kids; also try participants by slug-like name.
    const { data: byId } = await admin
      .from("portal_participants")
      .select("contact_id, parent_person_id, display_name")
      .eq("contact_id", contactId)
      .maybeSingle();
    if (!byId) {
      const { data: bySlug } = await admin
        .from("portal_parent_contacts")
        .select(
          "parent_person_id, contact_id, parent_display, parent_first_name, email, mobile, child_display, child_first_name",
        )
        .ilike("child_first_name", participantDisplay || contactId)
        .limit(1)
        .maybeSingle();
      if (bySlug?.contact_id) {
        return {
          parent_person_id: clean(bySlug.parent_person_id, 120),
          contact_id: clean(bySlug.contact_id, 120),
          parent_display:
            clean(bySlug.parent_display || bySlug.parent_first_name, 120) ||
            "Parent / carer",
          email: clean(bySlug.email, 200),
          mobile: clean(bySlug.mobile, 40),
          child_display: clean(
            bySlug.child_display || bySlug.child_first_name,
            120,
          ),
        };
      }
    } else {
      parentPersonId = parentPersonId || clean(byId.parent_person_id, 120);
    }
  }

  if (!contactId && !parentPersonId) return null;

  let q = admin
    .from("portal_parent_contacts")
    .select(
      "parent_person_id, contact_id, parent_display, parent_first_name, email, mobile, child_display, child_first_name",
    );
  if (parentPersonId && contactId) {
    q = q.eq("parent_person_id", parentPersonId).eq("contact_id", contactId);
  } else if (contactId) {
    q = q.eq("contact_id", contactId);
  } else {
    q = q.eq("parent_person_id", parentPersonId);
  }
  const { data } = await q.limit(1).maybeSingle();
  if (!data) return null;
  return {
    parent_person_id: clean(data.parent_person_id, 120),
    contact_id: clean(data.contact_id, 120),
    parent_display:
      clean(data.parent_display || data.parent_first_name, 120) ||
      "Parent / carer",
    email: clean(data.email, 200),
    mobile: clean(data.mobile, 40),
    child_display: clean(data.child_display || data.child_first_name, 120),
  };
}

function buildBody(opts: ScheduleOverrideNotifyInput, parentDisplay: string, child: string): string {
  const greet = `Hi ${parentFirstName(parentDisplay)},\n\nThis is ClubSENsational.\n\n`;
  const signOff = `\n\nIf you have any questions, just reply to this message.\n\nThank you,\nClubSENsational`;
  const venue = clean(opts.venue, 80);
  const sessionDate = clean(opts.sessionDate, 12);
  const sessionTime = clean(opts.sessionTime, 40);
  const friendly = sessionDate ? formatFriendlyDate(sessionDate) : "";
  const whenPart =
    friendly && sessionTime
      ? ` on ${friendly}, ${sessionTime}`
      : friendly
      ? ` on ${friendly}`
      : sessionTime
      ? ` (${sessionTime})`
      : "";
  const venuePart = venue ? ` at ${venue}` : "";
  const kind = opts.kind;
  const photoUrl = clean(opts.instructorPhotoUrl, 400);
  const cover = clean(opts.coveringStaffName, 120);
  const prior = clean(opts.priorCoveringStaffName, 120);
  const absent = clean(opts.absentInstructorName, 120);
  const photoLine =
    cover && photoUrl
      ? `\n\nPhoto of ${cover} (your instructor): ${photoUrl}\nPlease show ${child} the photo above so they know who to expect.\n`
      : "\n";

  if (kind === "instructor_change") {
    const changeLine = absent
      ? `${absent} is not available today. There has been a change of instructor. The session will now be with ${cover || "your cover instructor"}.`
      : `There has been a change of instructor. The session will now be with ${cover || "your cover instructor"}.`;
    return asciiBody(
      greet +
        `We are writing about ${child}'s session${whenPart}${venuePart}.\n\n` +
        changeLine +
        photoLine +
        signOff,
    );
  }

  if (kind === "instructor_change_update") {
    const changeLine = prior
      ? `A quick update: we previously told you the session would be with ${prior}. There has been a further change of instructor. The session will now be with ${cover || "your cover instructor"}.`
      : `A quick update on the instructor for this session: there has been a further change. The session will now be with ${cover || "your cover instructor"}.`;
    return asciiBody(
      greet +
        `We are writing about ${child}'s session${whenPart}${venuePart}.\n\n` +
        changeLine +
        photoLine +
        `\nSorry for the extra change - if you have any questions, just reply to this message.\n\nThank you,\nClubSENsational`,
    );
  }

  if (kind === "time_change") {
    const oldTime = clean(opts.oldTime, 40);
    const newTime = clean(opts.newTime, 40) || sessionTime;
    let timesPart = "";
    if (oldTime && newTime) {
      timesPart = `\n\nPrevious time: ${oldTime}\nNew time: ${newTime}`;
    } else if (newTime) {
      timesPart = `\n\nNew time: ${newTime}`;
    }
    const wherePart =
      friendly && venue
        ? ` on ${friendly} at ${venue}`
        : friendly
        ? ` on ${friendly}`
        : venue
        ? ` at ${venue}`
        : "";
    return asciiBody(
      greet +
        `We are writing about ${child}'s session${wherePart}.\n\n` +
        `There has been a change of time for today only.` +
        timesPart +
        signOff,
    );
  }

  // session_cancelled — neutral policy (no financial promise); Absents decide handles credit/refund later.
  const reason = clean(opts.reason, 300);
  const reasonPart = reason ? `\n\nNote from the team: ${reason}` : "";
  return asciiBody(
    greet +
      `We are writing to let you know that ${child}'s session${whenPart}${venuePart} has been cancelled.` +
      reasonPart +
      `\n\nWe will be in touch about next steps if needed.` +
      signOff,
  );
}

function subjectForKind(kind: ScheduleOverrideNotifyKind, child: string): string {
  if (kind === "instructor_change" || kind === "instructor_change_update") {
    return `Instructor update · ${child}`;
  }
  if (kind === "time_change") return `Time change · ${child}`;
  return `Session cancelled · ${child}`;
}

/**
 * Best-effort parent notify after Schedule & Covers override save.
 */
export async function notifyScheduleOverrideParent(
  admin: SupabaseClient,
  opts: ScheduleOverrideNotifyInput,
): Promise<ScheduleOverrideNotifyResult> {
  const kind = opts.kind;
  if (
    kind !== "instructor_change" &&
    kind !== "instructor_change_update" &&
    kind !== "session_cancelled" &&
    kind !== "time_change"
  ) {
    return { ok: false, skipped: true, reason: "bad_kind" };
  }

  if (
    (kind === "instructor_change" || kind === "instructor_change_update") &&
    (!clean(opts.coveringStaffName, 120) ||
      /^cover[_ ]?needed$/i.test(clean(opts.coveringStaffName, 120)))
  ) {
    return { ok: false, skipped: true, reason: "no_named_cover", kind };
  }

  /* Day Centre staff rotate between kids — Team shows the cover; do not WhatsApp. */
  if (kind === "instructor_change" || kind === "instructor_change_update") {
    const svc = clean(opts.serviceLabel, 160).toLowerCase();
    if (
      svc.indexOf("day centre") >= 0 ||
      svc.indexOf("daycentre") >= 0 ||
      /(^|\b)dc(\b|$)/.test(svc)
    ) {
      return { ok: true, skipped: true, reason: "day_centre_no_instructor_notify", kind };
    }
  }

  const overrideId = clean(opts.overrideId, 60);
  if (overrideId) {
    const { data: prior } = await admin
      .from("portal_parent_notify_log")
      .select("id")
      .eq("kind", kind)
      .contains("meta", { override_id: overrideId, automated: true })
      .in("whatsapp_status", ["sent", "delivered", "read", "sent_sms"])
      .limit(1);
    if (prior?.length) {
      return {
        ok: true,
        skipped: true,
        reason: "already_sent",
        kind,
        log_id: String(prior[0].id),
      };
    }
  }

  let photoUrl = clean(opts.instructorPhotoUrl, 400);
  if (
    !photoUrl &&
    (kind === "instructor_change" || kind === "instructor_change_update")
  ) {
    const stem = staffPhotoStem(
      clean(opts.coveringStaffKey, 80),
      clean(opts.coveringStaffName, 120),
    );
    if (stem) {
      photoUrl = `${photoBase()}/portal/staff_photos/${stem}.png`;
    }
  }

  const parent = await resolveParentContact(admin, {
    ...opts,
    instructorPhotoUrl: photoUrl,
  });
  if (!parent) {
    return { ok: false, skipped: true, reason: "no_parent", kind };
  }

  const child =
    clean(opts.participantDisplay, 120) || parent.child_display || "your child";
  const body = buildBody(
    { ...opts, instructorPhotoUrl: photoUrl },
    parent.parent_display,
    child,
  );
  const subject = subjectForKind(kind, child);
  const flat = flattenWhatsappTemplateBody(body);

  let emailStatus = "skipped";
  let emailOk = false;
  const smtp = readParentNotifySmtpConfig();
  if (smtp && parent.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email)) {
    try {
      const mail = await sendParentEmailViaSmtp({
        config: smtp,
        to: parent.email,
        subject,
        bodyText: body,
      });
      emailOk = !!mail.ok;
      emailStatus = mail.ok ? "sent" : "failed";
    } catch (err) {
      emailStatus = "failed";
      console.warn("[schedule-override-notify] email", err);
    }
  }

  let waStatus = "skipped";
  let waOk = false;
  let waId: string | null = null;
  const phone = normalizeParentPhoneE164(parent.mobile);
  if (phone) {
    try {
      const waOpts: Record<string, unknown> = { kind };
      if (
        photoUrl &&
        (kind === "instructor_change" || kind === "instructor_change_update")
      ) {
        waOpts.instructorPhotoUrl = photoUrl;
        waOpts.instructorPhotoName = clean(opts.coveringStaffName, 120);
      }
      const wa = await sendParentMobileMessage(phone, flat, waOpts);
      waOk = !!wa.ok;
      waStatus = wa.ok ? (wa.channel === "sms" ? "sent_sms" : "sent") : "failed";
      waId = wa.ok ? clean(wa.id, 120) || null : null;
    } catch (err) {
      waStatus = "failed";
      console.warn("[schedule-override-notify] wa", err);
    }
  }

  let logId: string | null = null;
  try {
    const { data: logRow } = await admin
      .from("portal_parent_notify_log")
      .insert({
        sent_by_user_id: null,
        sent_by_email: clean(opts.actorEmail, 200) || "schedule-override-notify",
        kind,
        channel: phone && parent.email ? "whatsapp_email" : phone ? "whatsapp" : "email",
        client_display: child,
        parent_name: parent.parent_display,
        parent_email: parent.email || null,
        parent_phone: parent.mobile || null,
        session_date: clean(opts.sessionDate, 12) || null,
        slot_id: null,
        venue: clean(opts.venue, 80) || null,
        subject: subject.slice(0, 200),
        body_text: body.slice(0, 4000),
        email_status: emailStatus,
        whatsapp_status: waStatus,
        whatsapp_message_id: waId,
        error_detail: emailOk || waOk ? null : "send_failed",
        meta: {
          contact_id: parent.contact_id || null,
          parent_person_id: parent.parent_person_id || null,
          override_id: overrideId || null,
          covering_staff_name: clean(opts.coveringStaffName, 120) || null,
          prior_covering_staff_name:
            clean(opts.priorCoveringStaffName, 120) || null,
          covering_photo: photoUrl || null,
          source: clean(opts.source, 80) || "schedule_covers",
          automated: true,
          parent_phone_masked: phone ? maskPhoneForLog(phone) : null,
        },
      })
      .select("id")
      .maybeSingle();
    logId = logRow?.id ? String(logRow.id) : null;
  } catch (err) {
    console.warn("[schedule-override-notify] log", err);
  }

  if (logId && (emailOk || waOk)) {
    void notifyFamilyWebPushForParentNotify({
      notifyLogId: logId,
      kind,
    });
  }

  return {
    ok: emailOk || waOk,
    skipped: !emailOk && !waOk && emailStatus === "skipped" && waStatus === "skipped",
    reason: emailOk || waOk ? undefined : "send_failed",
    kind,
    email_status: emailStatus,
    whatsapp_status: waStatus,
    log_id: logId,
  };
}
