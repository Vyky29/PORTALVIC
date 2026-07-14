/**
 * Notify a parent that a weekly note is ready (WhatsApp + portal_parent_notify_log).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  maskPhoneForLog,
  normalizeParentPhoneE164,
  sendParentMobileMessage,
} from "./portal_parent_messaging.ts";

function clean(v: unknown, max = 4000): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function firstName(display: string): string {
  const t = clean(display, 120);
  return t.split(/\s+/)[0] || "your child";
}

function formatWeekLabel(weekStart: string, weekEnd: string): string {
  try {
    const a = new Date(`${weekStart}T12:00:00Z`);
    const b = new Date(`${weekEnd}T12:00:00Z`);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${a.toLocaleDateString("en-GB", opts)} – ${b.toLocaleDateString("en-GB", opts)}`;
  } catch {
    return `${weekStart} – ${weekEnd}`;
  }
}

export type WeeklyNoteNotifyResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  whatsapp_status?: string;
  error?: string;
};

export async function notifyParentWeeklyNoteReady(
  supabase: SupabaseClient,
  opts: {
    contactId: string;
    weekStart: string;
    weekEnd: string;
    body: string;
    displayName: string;
  },
): Promise<WeeklyNoteNotifyResult> {
  const contactId = clean(opts.contactId, 80);
  if (!contactId) return { ok: false, error: "no_contact" };

  const { data: note } = await supabase
    .from("portal_parent_weekly_notes")
    .select("id, notified_at, share_status, body")
    .eq("contact_id", contactId)
    .eq("week_start", opts.weekStart)
    .maybeSingle();

  if (!note) return { ok: false, error: "note_missing" };
  if (clean(note.share_status) !== "ready") {
    return { ok: true, skipped: true, reason: "not_ready" };
  }
  if (note.notified_at) {
    return { ok: true, skipped: true, reason: "already_notified" };
  }

  const { data: participant } = await supabase
    .from("portal_participants")
    .select("parent_person_id, display_name")
    .eq("contact_id", contactId)
    .maybeSingle();

  const parentPersonId = clean(participant?.parent_person_id, 80);
  if (!parentPersonId) {
    return { ok: true, skipped: true, reason: "no_parent_link" };
  }

  const { data: parentRow } = await supabase
    .from("portal_parent_contacts")
    .select("parent_display, parent_first_name, mobile, email, child_display")
    .eq("parent_person_id", parentPersonId)
    .eq("contact_id", contactId)
    .maybeSingle();

  const phoneRaw = clean(parentRow?.mobile, 40);
  const phone = normalizeParentPhoneE164(phoneRaw);
  if (!phone) {
    return { ok: true, skipped: true, reason: "no_parent_phone" };
  }

  const child =
    clean(opts.displayName, 120) ||
    clean(participant?.display_name, 120) ||
    clean(parentRow?.child_display, 120) ||
    "your child";
  const childFirst = firstName(child);
  const weekLabel = formatWeekLabel(opts.weekStart, opts.weekEnd);
  const noteBody = clean(opts.body || note.body, 900);
  const portalHint =
    clean(Deno.env.get("PORTAL_PARENT_PORTAL_URL"), 200) ||
    "https://portal.clubsensational.org/parent_portal.html";

  const waText = [
    `${childFirst}'s weekly note (${weekLabel}) is ready.`,
    noteBody,
    `Read it anytime in the family portal: ${portalHint}`,
  ].join("\n\n");

  const sent = await sendParentMobileMessage(phone, waText, {
    kind: "weekly_note",
  });

  const whatsappStatus = sent.ok
    ? sent.channel === "sms"
      ? "sent_sms"
      : "sent"
    : "failed";

  await supabase.from("portal_parent_notify_log").insert({
    sent_by_user_id: null,
    sent_by_email: "weekly-notes-cron",
    kind: "weekly_note",
    channel: "whatsapp",
    client_display: child,
    parent_name: clean(parentRow?.parent_display || parentRow?.parent_first_name, 200) || null,
    parent_email: clean(parentRow?.email, 200) || null,
    parent_phone: phoneRaw || null,
    session_date: opts.weekEnd,
    slot_id: null,
    venue: null,
    subject: `${childFirst}'s weekly note`,
    body_text: waText.slice(0, 4000),
    email_status: "skipped",
    whatsapp_status: whatsappStatus,
    resend_id: null,
    whatsapp_message_id: sent.ok ? clean(sent.id, 120) || null : null,
    error_detail: sent.ok ? null : clean(sent.error, 1000) || "send_failed",
    meta: {
      contact_id: contactId,
      week_start: opts.weekStart,
      week_end: opts.weekEnd,
      parent_phone_masked: maskPhoneForLog(phone),
      automated: true,
    },
  });

  if (!sent.ok) {
    return { ok: false, error: clean(sent.error, 200) || "send_failed", whatsapp_status: whatsappStatus };
  }

  await supabase
    .from("portal_parent_weekly_notes")
    .update({ notified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("contact_id", contactId)
    .eq("week_start", opts.weekStart);

  return { ok: true, whatsapp_status: whatsappStatus };
}
