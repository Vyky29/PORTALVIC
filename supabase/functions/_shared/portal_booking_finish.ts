/**
 * Finish-booking after Accept: mint magic link, notify parent, complete PIN after pay
 * (bank/Stripe) or after GoCardless mandate setup (billing_requests.fulfilled).
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
import { familyPersonIdsForParent, upsertFamilyPin } from "./parent_portal_pin_family.ts";
import {
  extractBookingRequest,
  bookingRequestSummary,
  normalizePendingBookingRequest,
} from "./portal_booking_context.ts";
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
import {
  stripeConfigured,
  stripeCreateCheckoutSession,
  stripeGrossUpFromGbp,
} from "./stripe_checkout.ts";
import { foldValidatedReservationOntoMadre } from "./portal_booking_fold_madre.ts";

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

/** Public family site (booking + parent pages). Staff app stays on portalvic.vercel.app. */
export function portalPublicOrigin(): string {
  return (
    clean(Deno.env.get("PORTAL_PUBLIC_ORIGIN"), 200) ||
    clean(Deno.env.get("PARENT_PORTAL_PUBLIC_ORIGIN"), 200) ||
    "https://www.clubsensational.org"
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
  /** registration_submitted = pay-now copy after form submit (no suitability wording) */
  variant?: "accepted" | "registration_submitted";
}): Promise<{ emailOk: boolean; waOk: boolean; waError?: string }> {
  const name = clean(opts.parentName, 120) || "Parent / carer";
  const participant = clean(opts.participantName, 120) || "your child";
  const link = finishBookingUrl(opts.rawToken);
  const slot = clean(opts.slotSummary, 200);
  const autoPay = opts.variant === "registration_submitted";
  // Flat body for Meta contact_update template (newlines are stripped).
  const bodyText = autoPay
    ? `clubSENsational received the registration for ${participant}. ` +
      (slot ? `Place: ${slot}. ` : "") +
      `Complete booking and payment now: ${link}`
    : `clubSENsational accepted the registration for ${participant}. ` +
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
      subject: autoPay
        ? `Complete booking · ${participant}`
        : `Finish booking · ${participant}`,
      bodyText: autoPay
        ? `Hi ${name},\n\n` +
          `Thank you — we received the registration for ${participant}.\n\n` +
          (slot ? `Requested place: ${slot}\n\n` : "") +
          `Please complete booking and payment now:\n${link}\n\n` +
          `Your place is held for 30 minutes while you pay.\n\n— clubSENsational`
        : `Hi ${name},\n\n` +
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

function finishNotifyEmailNorm(v: string | null | undefined): string {
  return String(v || "").trim().toLowerCase();
}

function finishNotifyPhoneLast10(v: string | null | undefined): string {
  return String(v || "").replace(/\D/g, "").slice(-10);
}

function normalizePendingBookingFromRows(
  rows: Array<{ pending_booking_request?: unknown }> | null | undefined,
) {
  for (const row of rows || []) {
    const br = normalizePendingBookingRequest(row?.pending_booking_request);
    if (br) return br;
  }
  return null;
}

async function resolveFinishBookingLeadAndReservation(
  admin: SupabaseClient,
  doc: {
    id: string;
    parent_email: string | null;
    parent_phone: string | null;
    payload_json?: unknown;
  },
  reservationIdHint: string | null,
): Promise<{ leadId: string | null; reservationId: string | null; slotSummary: string | null }> {
  let reservationId = reservationIdHint;
  let slotSummary: string | null = null;

  if (reservationId) {
    const { data: hold } = await admin
      .from("portal_booking_slot_reservations")
      .select("id, service_name, venue, day_label, time_label")
      .eq("id", reservationId)
      .maybeSingle();
    if (hold) {
      slotSummary = [hold.service_name, hold.venue, hold.day_label, hold.time_label]
        .filter(Boolean)
        .join(" · ");
    }
  }

  if (!reservationId) {
    const { data: holds } = await admin
      .from("portal_booking_slot_reservations")
      .select("id, status, service_name, venue, day_label, time_label")
      .eq("document_id", doc.id)
      .in("status", ["validated", "pending", "awaiting_payment"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (holds?.[0]) {
      reservationId = String(holds[0].id);
      slotSummary = [
        holds[0].service_name,
        holds[0].venue,
        holds[0].day_label,
        holds[0].time_label,
      ]
        .filter(Boolean)
        .join(" · ");
    }
  }

  const leadIds = new Set<string>();
  const email = finishNotifyEmailNorm(doc.parent_email);
  if (email) {
    const { data: byEmail } = await admin
      .from("portal_booking_leads")
      .select("id, pending_booking_request")
      .eq("email_norm", email)
      .limit(5);
    for (const row of byEmail || []) {
      if (row?.id) leadIds.add(String(row.id));
    }
    if (!slotSummary) {
      const br =
        extractBookingRequest(
          doc.payload_json && typeof doc.payload_json === "object"
            ? doc.payload_json as Record<string, unknown>
            : null,
        ) || normalizePendingBookingFromRows(byEmail);
      slotSummary = bookingRequestSummary(br);
    }
  }

  const phone = finishNotifyPhoneLast10(doc.parent_phone);
  if (phone.length >= 10) {
    const { data: byPhone } = await admin
      .from("portal_booking_leads")
      .select("id, pending_booking_request")
      .eq("phone_lookup", phone)
      .limit(5);
    for (const row of byPhone || []) {
      if (row?.id) leadIds.add(String(row.id));
    }
    if (!slotSummary) {
      const br =
        extractBookingRequest(
          doc.payload_json && typeof doc.payload_json === "object"
            ? doc.payload_json as Record<string, unknown>
            : null,
        ) || normalizePendingBookingFromRows(byPhone);
      slotSummary = bookingRequestSummary(br);
    }
  }

  return { leadId: [...leadIds][0] || null, reservationId, slotSummary };
}

/** Prepare slot holds so finish-booking can proceed without admin Accept first. */
export async function prepareReservationsForFinishBooking(
  admin: SupabaseClient,
  documentId: string,
): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: holds } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, status, notes")
    .eq("document_id", documentId)
    .eq("status", "pending");

  let prepared = 0;
  for (const hold of holds || []) {
    const prevNotes = String(hold.notes || "").trim();
    const keepTrial = /booking_kind\s*=\s*trial/i.test(prevNotes);
    if (keepTrial) {
      const { error: rErr } = await admin
        .from("portal_booking_slot_reservations")
        .update({
          status: "released",
          released_at: nowIso,
          updated_at: nowIso,
          notes: "auto_finish_link|booking_kind=trial|awaiting_stripe_pay",
        })
        .eq("id", hold.id)
        .eq("status", "pending");
      if (!rErr) prepared += 1;
      else console.warn("[prepareReservationsForFinishBooking] trial release", rErr.message);
      continue;
    }
    const { error: vErr } = await admin
      .from("portal_booking_slot_reservations")
      .update({
        status: "validated",
        validated_at: nowIso,
        updated_at: nowIso,
        notes: "auto_finish_link",
      })
      .eq("id", hold.id)
      .eq("status", "pending");
    if (!vErr) prepared += 1;
    else console.warn("[prepareReservationsForFinishBooking] validate", vErr.message);
  }
  return prepared;
}

/**
 * Mint finish-booking link and notify parent right after registration submit.
 * Admin suitability review happens after payment, not before.
 */
export async function sendFinishBookingAfterRegistration(
  admin: SupabaseClient,
  doc: {
    id: string;
    participant_name: string;
    parent_name: string | null;
    parent_email: string | null;
    parent_phone: string | null;
    payload_json?: unknown;
  },
  opts?: {
    reservationId?: string | null;
    leadId?: string | null;
    notify?: boolean;
    variant?: "accepted" | "registration_submitted";
  },
): Promise<{
  finish_url: string;
  finish_url_sent: boolean;
  email_ok: boolean;
  wa_ok: boolean;
  token_id: string | null;
  reservations_prepared: number;
}> {
  const reservationsPrepared = await prepareReservationsForFinishBooking(admin, doc.id);

  const resolved = await resolveFinishBookingLeadAndReservation(
    admin,
    doc,
    opts?.reservationId ? String(opts.reservationId) : null,
  );
  const leadId = opts?.leadId ? String(opts.leadId) : resolved.leadId;
  const reservationId = resolved.reservationId;

  const minted = await mintFinishBookingToken(admin, {
    leadId,
    documentId: doc.id,
    reservationId,
  });
  const finishUrl = finishBookingUrl(minted.rawToken);

  let emailOk = false;
  let waOk = false;
  if (opts?.notify !== false) {
    const notify = await notifyParentFinishBooking({
      parentName: doc.parent_name,
      parentEmail: doc.parent_email,
      parentPhone: doc.parent_phone,
      participantName: doc.participant_name,
      slotSummary: resolved.slotSummary,
      rawToken: minted.rawToken,
      admin,
      variant: opts?.variant || "registration_submitted",
    });
    emailOk = notify.emailOk;
    waOk = notify.waOk;
  }

  const nowIso = new Date().toISOString();
  await admin
    .from("portal_booking_completion_tokens")
    .update({
      finish_link_sent_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", minted.tokenId);

  if (leadId) {
    await admin
      .from("portal_booking_leads")
      .update({
        booking_status: "booking_started",
        last_activity_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", leadId);
  }

  return {
    finish_url: finishUrl,
    finish_url_sent: emailOk || waOk,
    email_ok: emailOk,
    wa_ok: waOk,
    token_id: minted.tokenId,
    reservations_prepared: reservationsPrepared,
  };
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

/** Prefer the open token for an invoice; ignore expired duplicates (resend mint). */
async function findFinishTokenForInvoice(
  admin: SupabaseClient,
  invoiceShareId: string,
): Promise<CompletionTokenRow | null> {
  const invId = clean(invoiceShareId, 80);
  if (!invId) return null;
  const { data: rows, error } = await admin
    .from("portal_booking_completion_tokens")
    .select("*")
    .eq("invoice_share_id", invId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error || !rows?.length) return null;
  const open = rows.find((r) =>
    [
      "awaiting_payment",
      "awaiting_office_payment",
      "choices_saved",
      "scope_saved",
      "funding_saved",
      "pending",
      "la_office",
    ].includes(String(r.status || "")),
  );
  if (open) return open as CompletionTokenRow;
  const completed = rows.find((r) => String(r.status) === "completed");
  if (completed) return completed as CompletionTokenRow;
  return rows[0] as CompletionTokenRow;
}

/** After Stripe pays a trial invoice, mark the slot validated (booked). */
export async function confirmTrialSlotAfterStripePayment(
  admin: SupabaseClient,
  invoiceShareId: string,
): Promise<void> {
  const invId = clean(invoiceShareId, 80);
  if (!invId) return;

  const token = await findFinishTokenForInvoice(admin, invId);
  if (!token) return;

  const choices =
    token.choices_json && typeof token.choices_json === "object"
      ? (token.choices_json as Record<string, unknown>)
      : {};
  if (parseBookingScope(choices.booking_scope) !== "trial_session") return;

  const now = new Date().toISOString();
  const holdFar = new Date(Date.now() + FINISH_TOKEN_TTL_DAYS * 86400000).toISOString();
  const reservationId = clean(token.reservation_id, 80);
  if (reservationId) {
    await admin
      .from("portal_booking_slot_reservations")
      .update({
        status: "validated",
        validated_at: now,
        hold_expires_at: holdFar,
        released_at: null,
        notes: "trial_paid_stripe|booking_kind=trial",
        updated_at: now,
      })
      .eq("id", reservationId);
    try {
      const fold = await foldValidatedReservationOntoMadre(admin, reservationId);
      if (!fold.ok) {
        console.warn("[confirmTrialSlotAfterStripePayment] madre fold", fold.note);
      }
    } catch (e) {
      console.warn("[confirmTrialSlotAfterStripePayment] madre fold", e);
    }
  } else if (token.document_id) {
    await admin
      .from("portal_booking_slot_reservations")
      .update({
        status: "validated",
        validated_at: now,
        hold_expires_at: holdFar,
        released_at: null,
        notes: "trial_paid_stripe|booking_kind=trial",
        updated_at: now,
      })
      .eq("document_id", token.document_id)
      .in("status", ["awaiting_payment", "pending", "released"]);
    try {
      const { data: resRows } = await admin
        .from("portal_booking_slot_reservations")
        .select("id")
        .eq("document_id", token.document_id)
        .eq("status", "validated")
        .order("updated_at", { ascending: false })
        .limit(3);
      for (const r of resRows || []) {
        const fold = await foldValidatedReservationOntoMadre(admin, String(r.id || ""));
        if (!fold.ok) {
          console.warn("[confirmTrialSlotAfterStripePayment] madre fold", fold.note);
        }
      }
    } catch (e) {
      console.warn("[confirmTrialSlotAfterStripePayment] madre fold", e);
    }
  }
}

export async function createFinishBookingStripeCheckout(
  admin: SupabaseClient,
  opts: {
    invoiceShareId: string;
    contactId: string;
    invoiceNumber: string;
    participantName: string;
    amountGbp: number;
    rawFinishToken: string;
  },
): Promise<
  | { ok: true; checkout_url: string; session_id: string; charge_gbp: number; fee_gbp: number }
  | { ok: false; error: string; message?: string }
> {
  if (!stripeConfigured()) {
    return {
      ok: false,
      error: "stripe_not_configured",
      message: "Card / Apple Pay is not available yet. Contact the office.",
    };
  }
  const dueAmount = Number(opts.amountGbp) || 0;
  if (!(dueAmount > 0)) {
    return { ok: false, error: "amount_required" };
  }
  const gross = stripeGrossUpFromGbp(dueAmount);
  if (gross.charge_pence < 30) {
    return { ok: false, error: "amount_too_small" };
  }

  const invNo = clean(opts.invoiceNumber, 40);
  const displayName = clean(opts.participantName, 80) || "participant";
  const productName = invNo
    ? `Trial session · Invoice ${invNo} · ${displayName}`
    : `Trial session · ${displayName}`;
  const productNameWithFee =
    gross.fee_pence > 0
      ? `${productName} (incl. £${gross.fee_gbp.toFixed(2)} card fee)`
      : productName;

  const origin = portalPublicOrigin();
  const finishPath = "/parent/finish-booking";
  const tokenQ = encodeURIComponent(opts.rawFinishToken);
  const successUrl =
    `${origin}${finishPath}?t=${tokenQ}&stripe=1&invoice=${encodeURIComponent(opts.invoiceShareId)}`;
  const cancelUrl = `${origin}${finishPath}?t=${tokenQ}&stripe_cancel=1`;

  const created = await stripeCreateCheckoutSession({
    amountPence: gross.charge_pence,
    currency: "gbp",
    productName: productNameWithFee,
    successUrl,
    cancelUrl,
    clientReferenceId: opts.invoiceShareId,
    metadata: {
      invoice_share_id: opts.invoiceShareId,
      contact_id: opts.contactId,
      invoice_number: invNo || "",
      invoice_net_pence: String(gross.net_pence),
      stripe_fee_pence: String(gross.fee_pence),
      charge_pence: String(gross.charge_pence),
      finish_booking: "1",
    },
  });

  if (!created.ok) {
    return {
      ok: false,
      error: created.error,
      message: created.detail || "Could not start card payment.",
    };
  }

  await admin
    .from("portal_parent_invoice_share")
    .update({
      stripe_checkout_session_id: created.id,
      payment_method_hint: "stripe",
      updated_at: new Date().toISOString(),
    })
    .eq("id", opts.invoiceShareId);

  return {
    ok: true,
    checkout_url: created.url,
    session_id: created.id,
    charge_gbp: gross.charge_gbp,
    fee_gbp: gross.fee_gbp,
  };
}

/** After first instalment is paid (bank confirm or GC / Stripe), complete booking + PIN. */
async function completeFinishBookingWithPin(
  admin: SupabaseClient,
  opts: {
    invoiceShareId: string;
    /** When true, PIN is issued on GoCardless mandate setup (before money clears). */
    requirePaidEvidence: boolean;
  },
): Promise<{ completed: boolean; pinSent?: boolean; reason?: string }> {
  const invId = clean(opts.invoiceShareId, 80);
  if (!invId) return { completed: false, reason: "no_invoice" };

  const token = await findFinishTokenForInvoice(admin, invId);
  if (!token) return { completed: false, reason: "no_token" };
  if (String(token.status) === "completed") {
    return { completed: true, pinSent: false, reason: "already_completed" };
  }

  const { data: inv } = await admin
    .from("portal_parent_invoice_share")
    .select("id, payment_status, amount_paid_gbp, payment_schedule, contact_id")
    .eq("id", invId)
    .maybeSingle();
  if (!inv) return { completed: false, reason: "invoice_missing" };

  if (opts.requirePaidEvidence) {
    const status = String(inv.payment_status || "").toLowerCase();
    const paidAmt = Number(inv.amount_paid_gbp) || 0;
    const schedule = Array.isArray(inv.payment_schedule) ? inv.payment_schedule : [];
    const anyInstalmentPaid =
      status === "paid" ||
      status === "partial" ||
      paidAmt > 0 ||
      schedule.some((r: { status?: string }) => String(r?.status || "").toLowerCase() === "paid");
    if (!anyInstalmentPaid) return { completed: false, reason: "not_paid_yet" };
  }

  const { data: contact } = await admin
    .from("portal_parent_contacts")
    .select("parent_display, email, mobile, child_display, parent_person_id")
    .eq("contact_id", String(inv.contact_id || token.contact_id || ""))
    .maybeSingle();

  const parentPersonId =
    clean(token.parent_person_id, 80) || clean(contact?.parent_person_id, 80);
  const contactId = clean(inv.contact_id, 40) || clean(token.contact_id, 40);

  // Office resend / mint can leave contact fields null — backfill before PIN.
  if (
    parentPersonId &&
    (clean(token.parent_person_id, 80) !== parentPersonId ||
      (contactId && clean(token.contact_id, 40) !== contactId))
  ) {
    const nowPatch = new Date().toISOString();
    await admin
      .from("portal_booking_completion_tokens")
      .update({
        parent_person_id: parentPersonId,
        contact_id: contactId || token.contact_id,
        updated_at: nowPatch,
      })
      .eq("id", token.id);
    token.parent_person_id = parentPersonId;
    if (contactId) token.contact_id = contactId;
  }

  if (parentPersonId) {
    const familyIds = await familyPersonIdsForParent(admin, parentPersonId);
    const { data: existingCreds } = await admin
      .from("portal_parent_portal_credentials")
      .select("parent_person_id, pin_hash")
      .in("parent_person_id", familyIds.length ? familyIds : [parentPersonId]);
    const hasPin = (existingCreds || []).some((c) => String(c.pin_hash || "").trim().length > 0);
    if (hasPin) {
      // Existing family — they already have a Parent Portal PIN. Complete the
      // booking token without rotating or re-sending a PIN.
      const now = new Date().toISOString();
      await admin
        .from("portal_booking_completion_tokens")
        .update({
          status: "completed",
          consumed_at: now,
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
      await activateContactInClassAfterPaidBooking(admin, contactId);
      await confirmTermSlotAfterGocardlessMandate(admin, token as CompletionTokenRow);
      return { completed: true, pinSent: false, reason: "existing_pin_no_resend" };
    }
  }

  if (!parentPersonId) {
    return { completed: false, reason: "parent_person_missing" };
  }

  const result = await issueParentPortalPinForCompletion(admin, token as CompletionTokenRow, {
    parentName: contact?.parent_display || null,
    parentEmail: contact?.email || null,
    parentPhone: contact?.mobile || null,
    participantName: contact?.child_display || "Participant",
  });
  if ("error" in result) return { completed: false, reason: result.error };
  await activateContactInClassAfterPaidBooking(admin, contactId);
  await confirmTermSlotAfterGocardlessMandate(admin, token as CompletionTokenRow);
  return { completed: true, pinSent: true };
}

export async function tryCompleteBookingAfterInvoicePayment(
  admin: SupabaseClient,
  invoiceShareId: string,
): Promise<{ completed: boolean; pinSent?: boolean; reason?: string }> {
  return completeFinishBookingWithPin(admin, {
    invoiceShareId,
    requirePaidEvidence: true,
  });
}

/**
 * GoCardless mandate setup finished (billing_requests.fulfilled).
 * Issue Parent Portal PIN immediately — do not wait for payments.confirmed / paid_out.
 */
export async function tryCompleteBookingAfterGocardlessMandateSetup(
  admin: SupabaseClient,
  opts: { invoiceShareId?: string | null; contactId?: string | null },
): Promise<{ completed: boolean; pinSent?: boolean; reason?: string; invoice_id?: string }> {
  let invId = clean(opts.invoiceShareId, 80);
  const contactId = clean(opts.contactId, 120);

  if (!invId && contactId) {
    const { data: toks } = await admin
      .from("portal_booking_completion_tokens")
      .select("id, invoice_share_id, pay_plan, status, created_at")
      .eq("contact_id", contactId)
      .not("invoice_share_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);
    const openGc = (toks || []).find((t) => {
      const plan = clean(t.pay_plan, 40).toLowerCase();
      const st = clean(t.status, 40).toLowerCase();
      const isGc = plan === "gocardless_monthly" || plan === "gocardless";
      const open = [
        "awaiting_payment",
        "awaiting_office_payment",
        "choices_saved",
        "scope_saved",
        "funding_saved",
        "pending",
        "la_office",
      ].includes(st);
      return isGc && open && clean(t.invoice_share_id, 80);
    });
    if (openGc) invId = clean(openGc.invoice_share_id, 80);
  }

  if (!invId) return { completed: false, reason: "no_invoice" };

  const result = await completeFinishBookingWithPin(admin, {
    invoiceShareId: invId,
    requirePaidEvidence: false,
  });
  return { ...result, invoice_id: invId };
}

/** Keep the Booking Portal seat after GC mandate setup (DD can take days to clear). */
async function confirmTermSlotAfterGocardlessMandate(
  admin: SupabaseClient,
  token: CompletionTokenRow,
): Promise<void> {
  const now = new Date().toISOString();
  const holdFar = new Date(Date.now() + FINISH_TOKEN_TTL_DAYS * 86400000).toISOString();
  const reservationId = clean(token.reservation_id, 80);
  const patch = {
    status: "validated",
    validated_at: now,
    hold_expires_at: holdFar,
    released_at: null,
    notes: "gocardless_mandate_setup|booking_completed",
    updated_at: now,
  };
  try {
    if (reservationId) {
      await admin.from("portal_booking_slot_reservations").update(patch).eq("id", reservationId);
      try {
        const fold = await foldValidatedReservationOntoMadre(admin, reservationId);
        if (!fold.ok) {
          console.warn("[confirmTermSlotAfterGocardlessMandate] madre fold", fold.note);
        }
      } catch (e) {
        console.warn("[confirmTermSlotAfterGocardlessMandate] madre fold", e);
      }
      return;
    }
    if (token.document_id) {
      await admin
        .from("portal_booking_slot_reservations")
        .update(patch)
        .eq("document_id", token.document_id)
        .in("status", ["awaiting_payment", "pending", "released"]);
    }
  } catch (e) {
    console.warn("[confirmTermSlotAfterGocardlessMandate]", e);
  }
}

/** Mark family active in Parent Portal after Stripe/bank confirm (trial or term). */
async function activateContactInClassAfterPaidBooking(
  admin: SupabaseClient,
  contactId: string | null,
): Promise<void> {
  const cid = clean(contactId, 40);
  if (!cid) return;
  const now = new Date().toISOString();
  await admin
    .from("portal_parent_contacts")
    .update({ in_class: true, on_waiting_list: false, updated_at: now })
    .eq("contact_id", cid);
  await admin
    .from("portal_participants")
    .update({ in_class: true, on_waiting_list: false, updated_at: now })
    .eq("contact_id", cid);
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
