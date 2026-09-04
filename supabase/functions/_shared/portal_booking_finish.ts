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
import { foldValidatedReservationOntoMadre, preferredInstructorForReservation } from "./portal_booking_fold_madre.ts";
import { unitPriceFor } from "./reenrolment_catalog.ts";
import { resolvePortalInvoiceOwnerUserId } from "./portal_create_family_invoice.ts";
import {
  BOOKING_SLOT_HOLD_STATUSES,
  bookingActiveHoldExpiresFilter,
  bookingPayHoldExpiresAt,
} from "./portal_booking_pay_hold.ts";
import { mandateIsActive } from "./gocardless_portal.ts";

export const FINISH_TOKEN_TTL_DAYS = 14;
/** Fallback only when service cannot be classified (legacy aquatic 30'). */
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

/** First instalment collected by bank (mid-month GoCardless join). */
function paymentScheduleBankFirst(schedule: unknown): boolean {
  const rows = Array.isArray(schedule) ? schedule : [];
  const first = rows[0] as Record<string, unknown> | undefined;
  if (!first) return false;
  const via = String(first.collect_via || "").toLowerCase();
  if (via === "bank_transfer" || via === "bank") return true;
  return /bank transfer/i.test(String(first.label || ""));
}

/** Bank-first GoCardless: PIN only after mandate is active (not on admin Mark paid alone). */
async function finishBookingNeedsGocardlessMandateBeforePin(
  admin: SupabaseClient,
  token: CompletionTokenRow,
  inv: {
    payment_schedule?: unknown;
    payment_method_hint?: unknown;
    contact_id?: unknown;
  },
): Promise<boolean> {
  const plan = clean(token.pay_plan, 40).toLowerCase();
  const hint = String(inv.payment_method_hint || "").toLowerCase();
  const isGc =
    plan === "gocardless_monthly" ||
    plan === "gocardless" ||
    hint === "gocardless";
  if (!isGc || !paymentScheduleBankFirst(inv.payment_schedule)) return false;

  const contactId =
    clean(token.contact_id, 40) || clean(inv.contact_id, 40);
  if (!contactId) return true;

  const { data: mandateRow } = await admin
    .from("portal_parent_gocardless_mandates")
    .select("gocardless_mandate_id, mandate_status")
    .eq("contact_id", contactId)
    .maybeSingle();
  const mandateId = clean(mandateRow?.gocardless_mandate_id, 80);
  return !(mandateId && mandateIsActive(mandateRow?.mandate_status));
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

/** Parse clock token like 3, 3.30, 15:00, 3pm → minutes from midnight. */
function clockTokenToMinutes(raw: string): number | null {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return null;
  const ampm = s.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?$/i);
  if (!ampm) return null;
  let h = Number(ampm[1]);
  const m = Number(ampm[2] || 0);
  const ap = (ampm[3] || "").toLowerCase();
  if (!Number.isFinite(h) || !Number.isFinite(m) || m < 0 || m > 59) return null;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h < 0 || h > 23) return null;
  return h * 60 + m;
}

/**
 * Duration for pricing: explicit minutes in labels, else slot window, else service default.
 * Trials and term quotes must use one session of that service (climbing 60' = £75, not £50).
 */
export function inferSessionDurationMin(opts: {
  serviceName?: string | null;
  timeLabel?: string | null;
  activity?: string | null;
  venue?: string | null;
  formType?: string | null;
}): number {
  const blob = `${opts.serviceName || ""} ${opts.timeLabel || ""} ${opts.activity || ""} ${opts.venue || ""} ${opts.formType || ""}`
    .toLowerCase();
  const explicit = blob.match(
    /\b(\d{2,3})\s*(?:'|′|min(?:ute)?s?)\b|\b(\d{2,3})\s*minutes?\b|\b(\d+)\s*hour(?:s)?\b/,
  );
  if (explicit) {
    if (explicit[3]) return Math.max(30, Number(explicit[3]) * 60);
    const n = Number(explicit[1] || explicit[2]);
    if (Number.isFinite(n) && n >= 15 && n <= 300) return n;
  }
  const range = String(opts.timeLabel || "").match(
    /(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)?)\s*(?:to|–|-|—)\s*(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)?)/i,
  );
  if (range) {
    const a = clockTokenToMinutes(range[1]);
    let b = clockTokenToMinutes(range[2]);
    if (a != null && b != null) {
      if (b <= a) b += 12 * 60; // afternoon wrap: 12.30 to 2 → +12h on end
      const mins = b - a;
      if (mins >= 15 && mins <= 300) return mins;
    }
  }
  if (/climb|westway|\bcl\b/.test(blob)) return 60;
  if (/physical|fitness/.test(blob)) return 60;
  if (/multi|splash/.test(blob)) return 90;
  if (/bespoke/.test(blob)) return 60;
  if (/counsel/.test(blob)) return 45;
  if (/\b60\b|1\s*hour|60\s*min/.test(blob)) return 60;
  if (/\b45\b|45\s*min/.test(blob)) return 45;
  return 30;
}

export function inferServiceTypeLabel(opts: {
  serviceName?: string | null;
  timeLabel?: string | null;
  activity?: string | null;
  venue?: string | null;
  formType?: string | null;
}): string {
  const blob = `${opts.serviceName || ""} ${opts.activity || ""} ${opts.venue || ""} ${opts.formType || ""} ${opts.timeLabel || ""}`
    .toLowerCase();
  if (/day\s*centre|daycentre/.test(blob)) return "Day Centre";
  if (/climb|westway|climbing_registration|\bcl\b/.test(blob)) {
    return "Climbing Activity";
  }
  if (/physical|fitness/.test(blob)) return "Physical Activity";
  if (/multi|splash/.test(blob)) return "Multi-Activity";
  if (/bespoke/.test(blob)) return "Bespoke Programme";
  if (/counsel/.test(blob)) return "Counselling";
  if (/aquatic|swim|\bsw\b/.test(blob)) return "Aquatic Activity";
  const named = String(opts.serviceName || "").trim();
  return named || "Aquatic Activity";
}

/**
 * One-session private catalogue price for the booked service.
 * Trial Stripe amount = this unit (climbing £75, aquatic 30' £50, aquatic 60' £100, …).
 */
export function inferUnitPriceGbp(opts: {
  serviceName?: string | null;
  timeLabel?: string | null;
  activity?: string | null;
  venue?: string | null;
  formType?: string | null;
}): number {
  const serviceType = inferServiceTypeLabel(opts);
  const durationMin = inferSessionDurationMin(opts);
  const priced = unitPriceFor(serviceType, durationMin);
  if (priced != null && Number.isFinite(priced) && priced > 0) {
    return Math.round(priced * 100) / 100;
  }
  // Day Centre / enquire-only: keep legacy floor so callers still get a number.
  return DEFAULT_SESSION_GBP;
}

export function inferServiceKey(serviceName?: string | null, timeLabel?: string | null): string {
  const s = `${serviceName || ""} ${timeLabel || ""}`.toLowerCase();
  if (s.includes("day centre") || s.includes("daycentre")) return "DAY_CENTRE";
  if (s.includes("climb") || s.includes("westway")) return "CLIMBING";
  if (s.includes("physical") || s.includes("fitness")) return "PHYSICAL";
  if (s.includes("multi")) return "MULTI";
  if (s.includes("bespoke")) return "BESPOKE";
  const dur = inferSessionDurationMin({ serviceName, timeLabel });
  if (dur >= 60) return "AQUATIC_60";
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
  variant?: "accepted" | "registration_submitted" | "resend_pay_hold";
}): Promise<{ emailOk: boolean; waOk: boolean; waError?: string }> {
  const name = clean(opts.parentName, 120) || "Parent / carer";
  const participant = clean(opts.participantName, 120) || "your child";
  const link = finishBookingUrl(opts.rawToken);
  const slot = clean(opts.slotSummary, 200);
  const autoPay = opts.variant === "registration_submitted";
  const resendHold = opts.variant === "resend_pay_hold";
  // Flat body for Meta contact_update template (newlines are stripped).
  const bodyText = resendHold
    ? `clubSENsational: finish booking for ${participant} now. ` +
      (slot ? `Place: ${slot}. ` : "") +
      `Your place is held for 30 minutes only. Complete funding, payment and first instalment: ${link}`
    : autoPay
      ? `clubSENsational received the registration for ${participant}. ` +
        (slot ? `Place: ${slot}. ` : "") +
        `Your place is held for 30 minutes. Complete booking and payment now: ${link}`
      : `clubSENsational accepted the registration for ${participant}. ` +
        (slot ? `Place: ${slot}. ` : "") +
        `Finish booking (funding, payment, first instalment): ${link} ` +
        `Place held 30 minutes. After the office confirms your payment we send your Parent Portal PIN.`;

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
      subject: resendHold || autoPay
        ? `Complete booking · ${participant} · 30 minutes`
        : `Finish booking · ${participant}`,
      bodyText: resendHold
        ? `Hi ${name},\n\n` +
          `Please finish booking for ${participant} now.\n\n` +
          (slot ? `Place: ${slot}\n\n` : "") +
          `Your place is held for 30 minutes only while you complete funding, payment and the first instalment:\n${link}\n\n` +
          `If the window ends without payment, the seat returns to the Booking Portal.\n\n` +
          `After the office confirms your payment we send your Parent Portal PIN.\n\n— clubSENsational`
        : autoPay
          ? `Hi ${name},\n\n` +
            `Thank you — we received the registration for ${participant}.\n\n` +
            (slot ? `Requested place: ${slot}\n\n` : "") +
            `Please complete booking and payment now:\n${link}\n\n` +
            `Your place is held for 30 minutes while you pay.\n\n— clubSENsational`
          : `Hi ${name},\n\n` +
            `clubSENsational has accepted the registration for ${participant}.\n\n` +
            (slot ? `Requested place: ${slot}\n\n` : "") +
            `Please finish your booking:\n${link}\n\n` +
            `Your place is held for 30 minutes while you pay. After you pay, the office confirms the payment and then we send your Parent Portal PIN.\n\n— clubSENsational`,
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
        // Fresh 30' clock when finish-booking link is minted (no multi-week soft hold).
        hold_expires_at: bookingPayHoldExpiresAt(),
        notes: "auto_finish_link|pay_hold_30m",
      })
      .eq("id", hold.id)
      .eq("status", "pending");
    if (!vErr) prepared += 1;
    else console.warn("[prepareReservationsForFinishBooking] validate", vErr.message);
  }
  return prepared;
}

/** Rough capacity for Booking Portal slots (aquatic pairs vs multi bands). */
function approxSlotCapacity(slotId: string): number {
  const s = String(slotId || "").toLowerCase();
  if (s.includes("multi") || s.includes("swimfarm") || s.includes("day-centre")) return 6;
  return 2;
}

/**
 * Office resend / remint: if the doc's seat was released or expired unpaid,
 * put it back on hold for 30' when the slot still has space.
 */
export async function reholdReleasedReservationForFinishBooking(
  admin: SupabaseClient,
  documentId: string,
): Promise<{
  ok: boolean;
  reservationId: string | null;
  holdExpiresAt: string | null;
  error?: string;
}> {
  const docId = clean(documentId, 80);
  if (!docId) return { ok: false, reservationId: null, holdExpiresAt: null, error: "document_required" };

  const { data: active } = await admin
    .from("portal_booking_slot_reservations")
    .select("id, hold_expires_at, status")
    .eq("document_id", docId)
    .in("status", [...BOOKING_SLOT_HOLD_STATUSES])
    .or(bookingActiveHoldExpiresFilter())
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active?.id) {
    const holdExpires = bookingPayHoldExpiresAt();
    await admin
      .from("portal_booking_slot_reservations")
      .update({
        hold_expires_at: holdExpires,
        updated_at: new Date().toISOString(),
        notes: "auto_finish_link|pay_hold_30m|office_resend_refresh",
        released_at: null,
      })
      .eq("id", String(active.id));
    return {
      ok: true,
      reservationId: String(active.id),
      holdExpiresAt: holdExpires,
    };
  }

  const { data: prior } = await admin
    .from("portal_booking_slot_reservations")
    .select(
      "id, slot_id, status, notes, service_id, service_name, venue, day_label, time_label, activity, booking_mode, week_id, block_id, date_iso, participant_name, parent_name, parent_email, parent_phone",
    )
    .eq("document_id", docId)
    .in("status", ["released", "expired"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prior?.id || !prior.slot_id) {
    return { ok: false, reservationId: null, holdExpiresAt: null, error: "no_reservation" };
  }

  const slotId = String(prior.slot_id);
  const { count, error: countErr } = await admin
    .from("portal_booking_slot_reservations")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", slotId)
    .in("status", [...BOOKING_SLOT_HOLD_STATUSES])
    .or(bookingActiveHoldExpiresFilter())
    .neq("id", String(prior.id));
  if (countErr) {
    console.warn("[reholdReleasedReservationForFinishBooking] count", countErr.message);
  }
  const cap = approxSlotCapacity(slotId);
  if ((count || 0) >= cap) {
    return {
      ok: false,
      reservationId: String(prior.id),
      holdExpiresAt: null,
      error: "slot_unavailable",
    };
  }

  const holdExpires = bookingPayHoldExpiresAt();
  const nowIso = new Date().toISOString();
  const prevNotes = String(prior.notes || "").trim();
  const keepTrial = /booking_kind\s*=\s*trial/i.test(prevNotes);
  if (keepTrial) {
    return {
      ok: false,
      reservationId: String(prior.id),
      holdExpiresAt: null,
      error: "trial_needs_fresh_book",
    };
  }

  const { error: updErr } = await admin
    .from("portal_booking_slot_reservations")
    .update({
      status: "validated",
      validated_at: nowIso,
      hold_expires_at: holdExpires,
      released_at: null,
      updated_at: nowIso,
      notes: "auto_finish_link|pay_hold_30m|office_resend_rehold",
    })
    .eq("id", String(prior.id));
  if (updErr) {
    console.warn("[reholdReleasedReservationForFinishBooking] update", updErr.message);
    return {
      ok: false,
      reservationId: String(prior.id),
      holdExpiresAt: null,
      error: "rehold_failed",
    };
  }
  return {
    ok: true,
    reservationId: String(prior.id),
    holdExpiresAt: holdExpires,
  };
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
    variant?: "accepted" | "registration_submitted" | "resend_pay_hold";
    /** When true (office resend): re-hold released/expired seat for 30' if still free. */
    reholdReleased?: boolean;
  },
): Promise<{
  finish_url: string;
  finish_url_sent: boolean;
  email_ok: boolean;
  wa_ok: boolean;
  token_id: string | null;
  reservations_prepared: number;
  slot_held: boolean;
  hold_expires_at: string | null;
  rehold_error: string | null;
}> {
  let reservationsPrepared = await prepareReservationsForFinishBooking(admin, doc.id);
  let slotHeld = reservationsPrepared > 0;
  let holdExpiresAt: string | null = null;
  let reholdError: string | null = null;
  let reservationIdHint = opts?.reservationId ? String(opts.reservationId) : null;

  if (opts?.reholdReleased || opts?.variant === "resend_pay_hold") {
    const rehold = await reholdReleasedReservationForFinishBooking(admin, doc.id);
    if (rehold.ok) {
      slotHeld = true;
      holdExpiresAt = rehold.holdExpiresAt;
      if (rehold.reservationId) reservationIdHint = rehold.reservationId;
      reservationsPrepared = Math.max(reservationsPrepared, 1);
    } else {
      reholdError = rehold.error || "rehold_failed";
      if (reholdError === "slot_unavailable") {
        return {
          finish_url: "",
          finish_url_sent: false,
          email_ok: false,
          wa_ok: false,
          token_id: null,
          reservations_prepared: reservationsPrepared,
          slot_held: false,
          hold_expires_at: null,
          rehold_error: reholdError,
        };
      }
    }
  }

  const resolved = await resolveFinishBookingLeadAndReservation(
    admin,
    doc,
    reservationIdHint,
  );
  const leadId = opts?.leadId ? String(opts.leadId) : resolved.leadId;
  const reservationId = resolved.reservationId || reservationIdHint;

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
    slot_held: slotHeld,
    hold_expires_at: holdExpiresAt,
    rehold_error: reholdError,
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

/** After bank-first GC is confirmed paid, remind parent to complete Step 3 (mandate). */
export async function notifyParentCompleteGocardlessStep3(opts: {
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  participantName: string;
  gocardlessUrl: string | null;
  admin?: SupabaseClient | null;
}): Promise<{ emailOk: boolean; waOk: boolean }> {
  const name = clean(opts.parentName, 120) || "Parent / carer";
  const participant = clean(opts.participantName, 120) || "your child";
  const gcUrl = clean(opts.gocardlessUrl, 500);
  const portalUrl = `${portalPublicOrigin()}/parent`;
  const bodyText = gcUrl
    ? `clubSENsational confirmed the first bank payment for ${participant}. ` +
      `Please complete Step 3 and set up GoCardless so monthly collections run on the 1st: ${gcUrl} ` +
      `Or sign in at ${portalUrl} and open Invoices.`
    : `clubSENsational confirmed the first bank payment for ${participant}. ` +
      `Please sign in at ${portalUrl}, open Invoices, and set up GoCardless (Direct Debit) for monthly payments on the 1st.`;

  let emailOk = false;
  let waOk = false;
  let waResult: { ok: boolean; id?: string; channel?: string; error?: string } = {
    ok: false,
  };

  const smtp = readParentNotifySmtpConfig();
  const email = clean(opts.parentEmail, 200);
  if (smtp && email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const mail = await sendParentEmailViaSmtp({
      config: smtp,
      to: email,
      subject: `Set up GoCardless · ${participant}`,
      bodyText:
        `Hi ${name},\n\n` +
        `Thank you — we have confirmed your first bank payment for ${participant}.\n\n` +
        `One more step: please set up GoCardless (Direct Debit) so we can collect the remaining monthly payments on the 1st of each month, same as other families.\n\n` +
        (gcUrl
          ? `Complete Step 3 here:\n${gcUrl}\n\n`
          : "") +
        `Or sign in to the Parent Portal (${portalUrl}) → Invoices → Set up Direct Payment.\n\n` +
        `We cannot schedule future collections until GoCardless is completed.\n\n— clubSENsational`,
    });
    emailOk = mail.ok;
    if (!mail.ok) console.warn("[finish-booking-gc-step3] email", mail.error);
  }

  const phone = normalizeParentPhoneE164(String(opts.parentPhone || ""));
  if (phone) {
    const wa = await sendParentMobileMessage(phone, bodyText, {
      kind: "contact_update",
    });
    waResult = wa;
    waOk = wa.ok;
    if (!wa.ok) console.warn("[finish-booking-gc-step3] whatsapp", wa.error);
  }

  await logFinishBookingNotify(opts.admin, {
    kind: "gocardless_step3",
    parentName: name,
    parentEmail: email || null,
    parentPhone: phone,
    participantName: participant,
    subject: `Set up GoCardless · ${participant}`,
    bodyText,
    emailOk,
    wa: waResult,
  });

  return { emailOk, waOk };
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
      "awaiting_gocardless",
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

function parseClockToSqlTime(raw: string): string | null {
  const s = String(raw || "").trim().toLowerCase();
  const m = s.match(/^(\d{1,2})(?:[.:](\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = (m[3] || "").toLowerCase();
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 7) h += 12;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

function timeLabelToSqlStartEnd(timeLabel: string): { start: string; end: string } | null {
  const range = String(timeLabel || "").match(
    /(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)?)\s*(?:to|–|-|—)\s*(\d{1,2}(?:[.:]\d{2})?\s*(?:am|pm)?)/i,
  );
  if (!range) return null;
  const start = parseClockToSqlTime(range[1]);
  let end = parseClockToSqlTime(range[2]);
  if (!start || !end) return null;
  // Wrap afternoon: 12.30 to 2 → end before start
  const sm = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  let em = Number(end.slice(0, 2)) * 60 + Number(end.slice(3, 5));
  if (em <= sm) {
    em += 12 * 60;
    const h = Math.floor(em / 60) % 24;
    const mi = em % 60;
    end = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00`;
  }
  return { start, end };
}

async function upsertServiceLinesForPaidBooking(
  admin: SupabaseClient,
  opts: {
    contactId: string | null;
    participantName: string;
    reservation: Record<string, unknown> | null;
    isTrial: boolean;
  },
): Promise<string> {
  const reservation = opts.reservation;
  if (!reservation) return "no_reservation";
  const day = clean(reservation.day_label, 40);
  const serviceName = inferServiceTypeLabel({
    serviceName: clean(reservation.service_name, 120),
    timeLabel: clean(reservation.time_label, 80),
    activity: clean(reservation.activity, 80),
    venue: clean(reservation.venue, 80),
  });
  const timeSlot = clean(reservation.time_label, 80);
  const venue = clean(reservation.venue, 80);
  if (!day || !timeSlot) return "incomplete";
  const durationMin = inferSessionDurationMin({
    serviceName,
    timeLabel: timeSlot,
    activity: clean(reservation.activity, 80),
    venue,
  });
  const instructor = preferredInstructorForReservation(reservation);
  const child = clean(opts.participantName, 120) || "Participant";
  const clientKey = clientKeyFromName(child);
  const session = {
    day,
    service: serviceName,
    timeSlot,
    durationMin,
    venue,
    instructor: instructor || "",
    area: /climb/i.test(serviceName) || /westway/i.test(venue) ? "Wall" : "Teaching Pool",
    weeks: opts.isTrial ? 1 : undefined,
    isTrial: opts.isTrial || undefined,
  };
  const { error } = await admin.from("portal_participant_service_lines").upsert(
    {
      client_key: clientKey,
      client_name: child,
      client_name_norm: child.toLowerCase(),
      sessions: [session],
      services_count: 1,
      source: opts.isTrial
        ? `booking_finish_trial_${clean(opts.contactId, 40) || "x"}`
        : `booking_finish_${clean(opts.contactId, 40) || "x"}`,
      term_label: "2026/27",
      validated: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_key" },
  );
  if (error) {
    console.warn("[syncOpsAfterFinishBookingPaid] service_lines", error.message);
    return "service_line_failed";
  }
  return "service_line_ok";
}

async function ensureTrialScheduleOverride(
  admin: SupabaseClient,
  reservation: Record<string, unknown>,
  participantName: string,
): Promise<string> {
  const iso = clean(reservation.date_iso, 12).slice(0, 10);
  const venue = clean(reservation.venue, 80) || "Venue";
  const timeLabel = clean(reservation.time_label, 80);
  const times = timeLabelToSqlStartEnd(timeLabel);
  if (!iso || !times) return "override_skip_time";

  let instructor = preferredInstructorForReservation(reservation);
  if (!instructor) instructor = /westway|climb/i.test(`${venue} ${clean(reservation.service_name, 80)}`)
    ? "Carlos"
    : "";
  if (!instructor) return "override_skip_staff";

  const staffId = instructor.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const client = clean(participantName, 80) || "Trial";
  const clientSlug = clientKeyFromName(client).replace(/-/g, "_");
  const actorId = await resolvePortalInvoiceOwnerUserId(admin);
  if (!actorId) return "override_skip_actor";

  const { data: existing } = await admin
    .from("schedule_overrides")
    .select("id, payload")
    .eq("session_date", iso)
    .eq("status", "active")
    .ilike("anchor_staff_id", staffId)
    .eq("anchor_start", times.start)
    .eq("override_type", "client_replace_in_slot")
    .limit(8);
  const already = (existing || []).some((row) => {
    const p = row.payload && typeof row.payload === "object"
      ? (row.payload as Record<string, unknown>)
      : {};
    return p.is_trial === true || String(p.booking_kind || "").toLowerCase() === "trial";
  });
  if (already) return "override_exists";

  const { error } = await admin.from("schedule_overrides").insert({
    session_date: iso,
    anchor_staff_id: staffId,
    anchor_start: times.start,
    anchor_end: times.end,
    anchor_venue: venue,
    anchor_client_id: "available",
    anchor_time_slot_label: timeLabel,
    override_type: "client_replace_in_slot",
    payload: {
      booking_kind: "trial",
      is_trial: true,
      session_kind: "trial",
      replacement_client_id: clientSlug,
      replacement_client_name: `${client} (Trial)`,
      to_client_id: clientSlug,
      to_client_name: `${client} (Trial)`,
      finish_booking: true,
    },
    reason: `Finish booking trial · ${client} · ${venue} · ${timeLabel}`,
    status: "active",
    spreadsheet_revision: "finish_booking_auto",
    created_by: actorId,
    updated_by: actorId,
  });
  if (error) {
    console.warn("[syncOpsAfterFinishBookingPaid] schedule_override", error.message);
    return "override_failed:" + error.message.slice(0, 80);
  }
  return "override_ok";
}

/**
 * After Stripe / bank Mark paid / Tide: lock seat, fold MADRE+roster,
 * service lines, trial override for staff dashboard / Scheduling & Cover.
 */
export async function syncOpsAfterFinishBookingPaid(
  admin: SupabaseClient,
  token: CompletionTokenRow,
  opts?: { paidVia?: string | null },
): Promise<{ ok: boolean; notes: string[] }> {
  const notes: string[] = [];
  const choices =
    token.choices_json && typeof token.choices_json === "object"
      ? (token.choices_json as Record<string, unknown>)
      : {};
  const isTrial = parseBookingScope(choices.booking_scope) === "trial_session";
  const paidVia = clean(opts?.paidVia, 40) || (isTrial ? "trial_paid" : "booking_paid");
  const now = new Date().toISOString();
  const holdFar = new Date(Date.now() + FINISH_TOKEN_TTL_DAYS * 86400000).toISOString();

  let reservation: Record<string, unknown> | null = null;
  const reservationId = clean(token.reservation_id, 80);
  if (reservationId) {
    const { data } = await admin
      .from("portal_booking_slot_reservations")
      .select("*")
      .eq("id", reservationId)
      .maybeSingle();
    reservation = data;
  } else if (token.document_id) {
    const { data } = await admin
      .from("portal_booking_slot_reservations")
      .select("*")
      .eq("document_id", token.document_id)
      .in("status", ["awaiting_payment", "pending", "validated", "released"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    reservation = data;
  }

  if (reservation?.id) {
    const prevNotes = String(reservation.notes || "").trim();
    const noteTag = isTrial
      ? `trial_paid_${paidVia}|booking_kind=trial|ops_synced`
      : `booking_paid_${paidVia}|ops_synced`;
    await admin
      .from("portal_booking_slot_reservations")
      .update({
        status: "validated",
        validated_at: now,
        hold_expires_at: holdFar,
        released_at: null,
        notes: [prevNotes.replace(/\|?pay_hold_30m/gi, ""), noteTag]
          .filter(Boolean)
          .join("|")
          .slice(0, 500),
        updated_at: now,
      })
      .eq("id", String(reservation.id));
    notes.push("seat_validated");

    try {
      const fold = await foldValidatedReservationOntoMadre(admin, String(reservation.id));
      notes.push(fold.ok ? `fold:${fold.note}` : `fold_fail:${fold.note}`);
    } catch (e) {
      notes.push("fold_error");
      console.warn("[syncOpsAfterFinishBookingPaid] fold", e);
    }
  } else {
    notes.push("no_reservation");
  }

  let participantName = "";
  if (token.document_id) {
    const { data: doc } = await admin
      .from("portal_participant_documents")
      .select("participant_name")
      .eq("id", token.document_id)
      .maybeSingle();
    participantName = clean(doc?.participant_name, 120);
  }
  if (!participantName && reservation) {
    participantName = clean(reservation.participant_name, 120);
  }
  if (!participantName && token.contact_id) {
    const { data: c } = await admin
      .from("portal_parent_contacts")
      .select("child_display")
      .eq("contact_id", token.contact_id)
      .maybeSingle();
    participantName = clean(c?.child_display, 120);
  }

  notes.push(
    await upsertServiceLinesForPaidBooking(admin, {
      contactId: token.contact_id,
      participantName: participantName || "Participant",
      reservation,
      isTrial,
    }),
  );

  if (isTrial && reservation) {
    notes.push(
      await ensureTrialScheduleOverride(admin, reservation, participantName || "Participant"),
    );
  }

  return { ok: true, notes };
}

/** After Stripe pays a trial invoice, mark the slot validated + sync ops. */
export async function confirmTrialSlotAfterStripePayment(
  admin: SupabaseClient,
  invoiceShareId: string,
): Promise<void> {
  const token = await findFinishTokenForInvoice(admin, invoiceShareId);
  if (!token) return;
  await syncOpsAfterFinishBookingPaid(admin, token, { paidVia: "stripe" });
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
    /** Product line label; defaults to finish-booking payment. */
    productLabel?: string | null;
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
  const baseLabel = clean(opts.productLabel, 80) || "Finish booking";
  const productName = invNo
    ? `${baseLabel} · Invoice ${invNo} · ${displayName}`
    : `${baseLabel} · ${displayName}`;
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
    .select(
      "id, payment_status, amount_paid_gbp, payment_schedule, contact_id, payment_method_hint, gocardless_url",
    )
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
      const sync = await syncOpsAfterFinishBookingPaid(admin, token as CompletionTokenRow, {
        paidVia: "paid",
      });
      console.log("[finish-booking] ops sync", sync.notes.join("|"));
      return { completed: true, pinSent: false, reason: "existing_pin_no_resend" };
    }
  }

  if (!parentPersonId) {
    return { completed: false, reason: "parent_person_missing" };
  }

  // New family + bank-first GoCardless: seat confirmed; PIN only after mandate (webhook).
  if (await finishBookingNeedsGocardlessMandateBeforePin(admin, token, inv)) {
    const nowDefer = new Date().toISOString();
    await activateContactInClassAfterPaidBooking(admin, contactId);
    const sync = await syncOpsAfterFinishBookingPaid(admin, token as CompletionTokenRow, {
      paidVia: "paid",
    });
    await admin
      .from("portal_booking_completion_tokens")
      .update({
        status: "awaiting_gocardless",
        updated_at: nowDefer,
      })
      .eq("id", token.id);
    try {
      await notifyParentCompleteGocardlessStep3({
        admin,
        parentName: contact?.parent_display || null,
        parentEmail: contact?.email || null,
        parentPhone: contact?.mobile || null,
        participantName: contact?.child_display || "Participant",
        gocardlessUrl: clean(inv.gocardless_url, 500) || null,
      });
    } catch (e) {
      console.warn(
        "[finish-booking] gc step3 notify",
        e instanceof Error ? e.message : String(e),
      );
    }
    console.log(
      "[finish-booking] deferred pin for GC mandate",
      sync.notes.join("|"),
    );
    return { completed: false, pinSent: false, reason: "awaiting_gocardless_mandate" };
  }

  const result = await issueParentPortalPinForCompletion(admin, token as CompletionTokenRow, {
    parentName: contact?.parent_display || null,
    parentEmail: contact?.email || null,
    parentPhone: contact?.mobile || null,
    participantName: contact?.child_display || "Participant",
  });
  if ("error" in result) return { completed: false, reason: result.error };
  await activateContactInClassAfterPaidBooking(admin, contactId);
  const sync = await syncOpsAfterFinishBookingPaid(admin, token as CompletionTokenRow, {
    paidVia: "paid",
  });
  console.log("[finish-booking] ops sync", sync.notes.join("|"));
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
        "awaiting_gocardless",
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

export function parseFundingCode(
  raw: unknown,
): "privately_funded" | "la_direct_payments" | "sw_nhs_referral" | null {
  const s = clean(raw, 40).toLowerCase();
  if (s === "privately_funded" || s === "private" || s === "privately") {
    return "privately_funded";
  }
  if (
    s === "sw_nhs_referral" ||
    s === "social_worker_referral" ||
    s === "nhs_referral" ||
    s === "sw_nhs" ||
    s === "referred_sw_nhs"
  ) {
    return "sw_nhs_referral";
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

/** Split legacy "Name email@x" social_worker_contact into name + email. */
export function splitSocialWorkerContact(raw: unknown): { name: string; email: string } {
  const s = clean(raw, 400);
  if (!s) return { name: "", email: "" };
  const emailMatch = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0] : "";
  let name = s;
  if (email) {
    name = s.replace(email, "").replace(/[,;|/·]+/g, " ").replace(/\s+/g, " ").trim();
  }
  return { name: clean(name, 200), email: clean(email, 200).toLowerCase() };
}

export function registrationSupportFromPayload(
  payload: Record<string, unknown> | null | undefined,
): {
  ehcp: string | null;
  ehcp_details: string | null;
  ehcp_storage_path: string | null;
  social_worker: string | null;
  social_worker_name: string | null;
  social_worker_email: string | null;
  social_worker_contact: string | null;
  support_regulated: string | null;
  support_dysregulated: string | null;
} {
  const p = payload && typeof payload === "object" ? payload : {};
  const split = splitSocialWorkerContact(p.social_worker_contact);
  const name = clean(p.social_worker_name, 200) || split.name || null;
  const email = clean(p.social_worker_email, 200).toLowerCase() || split.email || null;
  const contact =
    clean(p.social_worker_contact, 400) ||
    [name, email].filter(Boolean).join(" · ") ||
    null;
  return {
    ehcp: clean(p.ehcp, 40) || null,
    ehcp_details: clean(p.ehcp_details, 800) || null,
    ehcp_storage_path: clean(p.ehcp_storage_path, 400) || null,
    social_worker: clean(p.social_worker, 40) || null,
    social_worker_name: name,
    social_worker_email: email,
    social_worker_contact: contact,
    support_regulated: clean(p.support_regulated, 40) || null,
    support_dysregulated: clean(p.support_dysregulated, 200) || null,
  };
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
