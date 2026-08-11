/**
 * Finish-booking after Accept: mint magic link, notify parent, complete PIN after pay.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  maskEmailForLog,
  maskPhoneForLog,
  normalizeParentPhoneE164,
  readParentNotifySmtpConfig,
  sendParentEmailViaSmtp,
  sendParentMobileMessage,
} from "./portal_parent_messaging.ts";
import { hashFamilyPin, newRandomFamilyPin } from "./parent_portal_pin.ts";
import { upsertFamilyPin } from "./parent_portal_pin_family.ts";
import {
  type BookingTermKey,
  type NewClientPayPlan,
  bookingTermDisplayLabel,
  parseBookingScope,
  parseBookingTermKey,
  parseNewClientPayPlan,
  quoteNewClientMidTermInvoice,
  quoteNewClientTrialInvoice,
} from "./booking_portal_term_invoices.ts";

export const FINISH_TOKEN_TTL_DAYS = 14;
export const DEFAULT_SESSION_GBP = 50;

export type CompletionTokenRow = {
  id: string;
  lead_id: string | null;
  document_id: string | null;
  reservation_id: string | null;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  funding_code: string | null;
  pay_plan: string | null;
  choices_json: Record<string, unknown>;
  contact_id: string | null;
  parent_person_id: string | null;
  invoice_share_id: string | null;
  finish_link_sent_at: string | null;
  pin_sent_at: string | null;
  status: string;
};

function clean(v: unknown, max = 200): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function portalPublicOrigin(): string {
  return (
    clean(Deno.env.get("PORTAL_PUBLIC_ORIGIN"), 200) ||
    clean(Deno.env.get("PARENT_PORTAL_PUBLIC_ORIGIN"), 200) ||
    "https://portalvic.vercel.app"
  ).replace(/\/$/, "");
}

export function finishBookingUrl(rawToken: string): string {
  return `${portalPublicOrigin()}/parent/finish-booking?t=${encodeURIComponent(rawToken)}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function newRawFinishToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function inferBillingTerm(asOf = new Date()): BookingTermKey {
  const m = asOf.getUTCMonth() + 1; // 1-12
  // Academic year: autumn Aug–Dec, spring Jan–Mar, summer Apr–Jul
  if (m >= 8) return "autumn";
  if (m >= 4) return "summer";
  return "spring";
}

export function inferUnitPriceGbp(opts: {
  serviceName?: string | null;
  timeLabel?: string | null;
  activity?: string | null;
}): number {
  const blob = `${opts.serviceName || ""} ${opts.timeLabel || ""} ${opts.activity || ""}`
    .toLowerCase();
  if (/\b60\b|1\s*hour|60\s*min/.test(blob)) return 90;
  if (/\b45\b|45\s*min/.test(blob)) return 70;
  return DEFAULT_SESSION_GBP;
}

export function inferServiceKey(serviceName?: string | null, timeLabel?: string | null): string {
  const s = `${serviceName || ""} ${timeLabel || ""}`.toLowerCase();
  if (s.includes("day centre") || s.includes("daycentre")) return "DAY_CENTRE";
  if (s.includes("climb")) return "CLIMBING";
  if (/\b60\b|60\s*min/.test(s)) return "AQUATIC_60";
  return "AQUATIC_30";
}

export function clientKeyFromName(name: string): string {
  return clean(name, 80)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "client";
}

export async function loadCompletionByRawToken(
  admin: SupabaseClient,
  rawToken: string,
): Promise<CompletionTokenRow | null> {
  const raw = clean(rawToken, 128);
  if (!/^[a-f0-9]{32,128}$/i.test(raw)) return null;
  const tokenHash = await sha256Hex(raw);
  const { data } = await admin
    .from("portal_booking_completion_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!data) return null;
  return data as CompletionTokenRow;
}

export async function mintFinishBookingToken(
  admin: SupabaseClient,
  opts: {
    leadId: string | null;
    documentId: string;
    reservationId: string | null;
  },
): Promise<{ tokenId: string; rawToken: string; expiresAt: string }> {
  // Revoke prior open tokens for this document
  await admin
    .from("portal_booking_completion_tokens")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("document_id", opts.documentId)
    .in("status", [
      "pending",
      "funding_saved",
      "scope_saved",
      "choices_saved",
      "awaiting_payment",
      "awaiting_office_payment",
      "la_office",
    ]);

  const rawToken = newRawFinishToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(
    Date.now() + FINISH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await admin
    .from("portal_booking_completion_tokens")
    .insert({
      lead_id: opts.leadId,
      document_id: opts.documentId,
      reservation_id: opts.reservationId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "token_insert_failed");
  }
  return { tokenId: String(data.id), rawToken, expiresAt };
}

async function logFinishBookingNotify(
  admin: SupabaseClient | null | undefined,
  opts: {
    kind: string;
    parentName: string;
    parentEmail: string | null;
    parentPhone: string | null;
    participantName: string;
    subject: string;
    bodyText: string;
    emailOk: boolean;
    wa: { ok: boolean; id?: string; channel?: string; error?: string };
  },
): Promise<void> {
  if (!admin) return;
  try {
    const waStatus = opts.wa.ok
      ? (opts.wa.channel === "sms" ? "sent_sms" : "sent")
      : (opts.parentPhone ? "failed" : "skipped");
    const channel =
      opts.emailOk && opts.wa.ok
        ? "both"
        : opts.wa.ok
          ? "whatsapp"
          : opts.emailOk
            ? "email"
            : "whatsapp";
    await admin.from("portal_parent_notify_log").insert({
      sent_by_user_id: null,
      sent_by_email: "system@finish-booking",
      kind: opts.kind,
      channel,
      client_display: opts.participantName,
      parent_name: opts.parentName,
      parent_email: opts.parentEmail,
      parent_phone: opts.parentPhone,
      subject: opts.subject,
      body_text: opts.bodyText,
      message_type: "text",
      email_status: opts.emailOk ? "sent" : opts.parentEmail ? "failed" : "skipped",
      whatsapp_status: waStatus,
      whatsapp_message_id: opts.wa.ok ? opts.wa.id || null : null,
      error_detail: opts.wa.ok
        ? null
        : (opts.wa.error || null),
      meta: {
        source: "finish_booking",
        parent_email_masked: opts.parentEmail ? maskEmailForLog(opts.parentEmail) : null,
        parent_phone_masked: opts.parentPhone ? maskPhoneForLog(opts.parentPhone) : null,
        wa_template_kind: "contact_update",
        wa_client_body: opts.bodyText.trim()
          ? `Hello,\n${opts.bodyText.trim()}\nThank you.`
          : null,
      },
    });
  } catch (e) {
    console.warn("[finish-booking-notify] log failed", e);
  }
}

export async function notifyParentFinishBooking(opts: {
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  participantName: string;
  slotSummary: string | null;
  rawToken: string;
  admin?: SupabaseClient | null;
}): Promise<{ emailOk: boolean; waOk: boolean; waError?: string }> {
  const name = clean(opts.parentName, 120) || "Parent / carer";
  const participant = clean(opts.participantName, 120) || "your child";
  const link = finishBookingUrl(opts.rawToken);
  const slot = clean(opts.slotSummary, 200);
  // Flat body for Meta contact_update template (newlines are stripped).
  const bodyText =
    `clubSENsational accepted the registration for ${participant}. ` +
    (slot ? `Place: ${slot}. ` : "") +
    `Finish booking (funding, payment, first instalment): ${link} ` +
    `After the office confirms your payment we send your Parent Portal PIN.`;

  let emailOk = false;
  let waOk = false;
  let waError: string | undefined;
  let waResult: { ok: boolean; id?: string; channel?: string; error?: string } = {
    ok: false,
  };

  const smtp = readParentNotifySmtpConfig();
  const email = clean(opts.parentEmail, 200);
  if (smtp && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const mail = await sendParentEmailViaSmtp({
      config: smtp,
      to: email,
      subject: `Finish booking · ${participant}`,
      bodyText:
        `Hi ${name},\n\n` +
        `clubSENsational has accepted the registration for ${participant}.\n\n` +
        (slot ? `Requested place: ${slot}\n\n` : "") +
        `Please finish your booking:\n${link}\n\n` +
        `After you pay, the office confirms the payment and then we send your Parent Portal PIN.\n\n— clubSENsational`,
    });
    emailOk = mail.ok;
    if (!mail.ok) console.warn("[finish-booking-notify] email", mail.error);
  } else {
    console.log(`[finish-booking-notify] email skipped to=${email || "—"} link=${link}`);
  }

  const phone = normalizeParentPhoneE164(String(opts.parentPhone || ""));
  if (phone) {
    // Cold outreach must use approved Meta template (contact_update), not free-text.
    const wa = await sendParentMobileMessage(phone, bodyText, {
      kind: "contact_update",
    });
    waOk = wa.ok;
    waResult = wa;
    if (!wa.ok) {
      waError = wa.error;
      console.warn("[finish-booking-notify] whatsapp", wa.error);
    }
  }

  await logFinishBookingNotify(opts.admin, {
    kind: "finish_booking",
    parentName: name,
    parentEmail: email || null,
    parentPhone: phone,
    participantName: participant,
    subject: `Finish booking · ${participant}`,
    bodyText,
    emailOk,
    wa: waResult,
  });

  return { emailOk, waOk, waError };
}

export async function notifyParentPortalPin(opts: {
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  participantName: string;
  pin4: string;
  admin?: SupabaseClient | null;
}): Promise<void> {
  const name = clean(opts.parentName, 120) || "Parent / carer";
  const participant = clean(opts.participantName, 120) || "your child";
  const first = participant.split(/\s+/)[0] || participant;
  const portalUrl = `${portalPublicOrigin()}/parent`;
  const bodyText =
    `Parent Portal ready for ${participant}. Sign in at ${portalUrl} — child first name: ${first} — Family PIN: ${opts.pin4}. Keep this PIN private.`;

  let emailOk = false;
  let waResult: { ok: boolean; id?: string; channel?: string; error?: string } = {
    ok: false,
  };

  const smtp = readParentNotifySmtpConfig();
  const email = clean(opts.parentEmail, 200);
  if (smtp && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const mail = await sendParentEmailViaSmtp({
      config: smtp,
      to: email,
      subject: `Parent Portal PIN · ${participant}`,
      bodyText:
        `Hi ${name},\n\n` +
        `Your Parent Portal is ready for ${participant}.\n\n` +
        `Sign in at ${portalUrl}\n` +
        `Child first name: ${first}\n` +
        `Family PIN: ${opts.pin4}\n\n` +
        `Keep this PIN private. You can change it after login.\n\n— clubSENsational`,
    });
    emailOk = mail.ok;
    if (!mail.ok) console.warn("[finish-booking-pin] email", mail.error);
  }

  const phone = normalizeParentPhoneE164(String(opts.parentPhone || ""));
  if (phone) {
    const wa = await sendParentMobileMessage(phone, bodyText, {
      kind: "contact_update",
    });
    waResult = wa;
    if (!wa.ok) console.warn("[finish-booking-pin] whatsapp", wa.error);
  }

  await logFinishBookingNotify(opts.admin, {
    kind: "portal_pin",
    parentName: name,
    parentEmail: email || null,
    parentPhone: phone,
    participantName: participant,
    subject: `Parent Portal PIN · ${participant}`,
    bodyText,
    emailOk,
    wa: waResult,
  });
}

export async function issueParentPortalPinForCompletion(
  admin: SupabaseClient,
  token: CompletionTokenRow,
  parentMeta: {
    parentName: string | null;
    parentEmail: string | null;
    parentPhone: string | null;
    participantName: string;
  },
): Promise<{ pin4: string } | { error: string }> {
  const parentPersonId = clean(token.parent_person_id, 80);
  if (!parentPersonId) return { error: "parent_person_missing" };

  const pin4 = newRandomFamilyPin();
  const pinHash = await hashFamilyPin(pin4);
  await upsertFamilyPin(admin, parentPersonId, pin4, pinHash, false);

  const now = new Date().toISOString();
  await admin
    .from("portal_booking_completion_tokens")
    .update({
      status: "completed",
      consumed_at: now,
      pin_sent_at: now,
      updated_at: now,
    })
    .eq("id", token.id);

  if (token.lead_id) {
    await admin
      .from("portal_booking_leads")
      .update({
        booking_status: "booking_completed",
        client_status: "active_client",
        last_activity_at: now,
        updated_at: now,
      })
      .eq("id", token.lead_id);
  }

  await notifyParentPortalPin({
    parentName: parentMeta.parentName,
    parentEmail: parentMeta.parentEmail,
    parentPhone: parentMeta.parentPhone,
    participantName: parentMeta.participantName,
    pin4,
    admin,
  });

  return { pin4 };
}

/** After first instalment is paid (bank confirm or GC), complete booking + PIN. */
export async function tryCompleteBookingAfterInvoicePayment(
  admin: SupabaseClient,
  invoiceShareId: string,
): Promise<{ completed: boolean; reason?: string }> {
  const invId = clean(invoiceShareId, 80);
  if (!invId) return { completed: false, reason: "no_invoice" };

  const { data: token } = await admin
    .from("portal_booking_completion_tokens")
    .select("*")
    .eq("invoice_share_id", invId)
    .maybeSingle();
  if (!token) return { completed: false, reason: "no_token" };
  if (String(token.status) === "completed") {
    return { completed: true, reason: "already_completed" };
  }

  const { data: inv } = await admin
    .from("portal_parent_invoice_share")
    .select("id, payment_status, amount_paid_gbp, payment_schedule, contact_id")
    .eq("id", invId)
    .maybeSingle();
  if (!inv) return { completed: false, reason: "invoice_missing" };

  const status = String(inv.payment_status || "").toLowerCase();
  const paidAmt = Number(inv.amount_paid_gbp) || 0;
  const schedule = Array.isArray(inv.payment_schedule) ? inv.payment_schedule : [];
  const anyInstalmentPaid =
    status === "paid" ||
    status === "partial" ||
    paidAmt > 0 ||
    schedule.some((r: { status?: string }) => String(r?.status || "").toLowerCase() === "paid");

  if (!anyInstalmentPaid) return { completed: false, reason: "not_paid_yet" };

  const { data: contact } = await admin
    .from("portal_parent_contacts")
    .select("parent_display, email, mobile, child_display, parent_person_id")
    .eq("contact_id", String(inv.contact_id || token.contact_id || ""))
    .maybeSingle();

  const result = await issueParentPortalPinForCompletion(admin, token as CompletionTokenRow, {
    parentName: contact?.parent_display || null,
    parentEmail: contact?.email || null,
    parentPhone: contact?.mobile || null,
    participantName: contact?.child_display || "Participant",
  });
  if ("error" in result) return { completed: false, reason: result.error };
  return { completed: true };
}

export function parseFundingCode(raw: unknown): "privately_funded" | "la_direct_payments" | null {
  const s = clean(raw, 40).toLowerCase();
  if (s === "privately_funded" || s === "private" || s === "privately") {
    return "privately_funded";
  }
  if (
    s === "la_direct_payments" ||
    s === "la_nhs" ||
    s === "la" ||
    s === "nhs" ||
    s === "direct_payments"
  ) {
    return "la_direct_payments";
  }
  return null;
}

export {
  bookingTermDisplayLabel,
  parseBookingScope,
  parseBookingTermKey,
  parseNewClientPayPlan,
  quoteNewClientMidTermInvoice,
  quoteNewClientTrialInvoice,
};
export type { BookingTermKey, NewClientPayPlan };
